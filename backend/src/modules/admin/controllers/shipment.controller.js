/**
 * Admin Shipment Controller
 *
 * Admin-facing endpoints for managing DTDC shipments. Every handler verifies
 * that the order's canonical channel routes to DTDC before proceeding, so
 * Quick Commerce orders are rejected here as firmly as they are in the service
 * layer.
 *
 * Multi-vendor orders carry one shipment per seller. Handlers that act on a
 * single parcel therefore accept a `vendorId` and resolve the vendor
 * explicitly rather than picking the first one they find.
 */

import asyncHandler from '../../../utils/asyncHandler.js';
import ApiError from '../../../utils/ApiError.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import Shipment from '../../../models/Shipment.model.js';
import Order from '../../../models/Order.model.js';
import Vendor from '../../../models/Vendor.model.js';
import mongoose from 'mongoose';
import { isDtdcOrder, DeliveryProviders } from '../../../services/shipping/deliveryProvider.js';
import {
    previewParcel,
    extractPackageOverride,
    bookDtdcShipment,
    cancelDtdcShipment,
    syncTrackingStatus,
    getShipmentLabel,
    checkDtdcServiceability,
} from '../../../services/shipping/dtdcShipment.service.js';
import { streamLabelToResponse } from '../../../services/shipping/labelStream.js';
import { ShipmentStatus, SHIPMENT_STATUS_VALUES } from '../../../constants/dtdcStatus.js';
import {
    findUnbookedOrders,
    countUnbookedOrders,
    hoursAwaiting,
    vendorOf,
    getAlertThresholds,
} from '../../../services/shipping/unbookedOrderAlerts.service.js';
import { VendorChannels } from '../../../constants/vendorChannels.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

const loadOrderOrThrow = async (orderId) => {
    const idFilter = [{ orderId }];
    if (mongoose.Types.ObjectId.isValid(orderId)) idFilter.push({ _id: orderId });

    const order = await Order.findOne({ $or: idFilter });
    if (!order) throw new ApiError(404, 'Order not found');
    return order;
};

const requireDtdcEligible = (order, vendorId = null) => {
    if (!isDtdcOrder(order, vendorId)) {
        throw new ApiError(400,
            'This order is not eligible for DTDC shipping. ' +
            'Only retail and wholesale orders use DTDC delivery.'
        );
    }
};

/**
 * Which vendor's parcel is this request about?
 *
 * An explicit `vendorId` wins. Otherwise the order must have exactly one
 * vendor — guessing on a split order is how one seller ends up holding
 * another's AWB and label.
 */
const resolveVendorId = (order, requested = null) => {
    const vendorIds = [
        ...new Set([
            order.vendorId ? String(order.vendorId) : null,
            ...(order.vendorItems || []).map((vi) => (vi?.vendorId ? String(vi.vendorId) : null)),
        ].filter(Boolean)),
    ];

    if (requested) {
        if (!vendorIds.includes(String(requested))) {
            throw new ApiError(400, 'That vendor has no items on this order.');
        }
        return String(requested);
    }

    if (vendorIds.length === 0) throw new ApiError(400, 'Cannot determine vendor for this order');
    if (vendorIds.length > 1) {
        throw new ApiError(400,
            'This order is split across multiple vendors — pass vendorId to choose a parcel.'
        );
    }
    return vendorIds[0];
};

// ─── Endpoints ─────────────────────────────────────────────────────────────

/**
 * GET /shipments
 * List shipments with optional filters.
 */
export const listShipments = asyncHandler(async (req, res) => {
    const { provider, status, vendorId, search, startDate, endDate, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (provider) {
        if (!Object.values(DeliveryProviders).includes(provider)) {
            throw new ApiError(400, 'Unknown delivery provider.');
        }
        filter.deliveryProvider = provider;
    }
    if (status) {
        if (!SHIPMENT_STATUS_VALUES.includes(status)) {
            throw new ApiError(400, 'Unknown shipment status.');
        }
        filter.status = status;
    }
    if (vendorId) {
        if (!mongoose.Types.ObjectId.isValid(vendorId)) throw new ApiError(400, 'Invalid vendorId.');
        filter.vendorId = vendorId;
    }
    if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate)   filter.createdAt.$lte = new Date(endDate);
    }
    // The list screen has always sent `search`; it used to be dropped on the
    // floor, so typing an AWB filtered nothing and looked like a broken index.
    if (search) {
        const term = String(search).trim();
        if (term) {
            filter.$or = [
                { awbNumber: { $regex: term, $options: 'i' } },
                { bookingId: { $regex: term, $options: 'i' } },
            ];
        }
    }

    const pageNum  = Math.max(1, Number(page) || 1);
    const pageSize = Math.max(1, Math.min(Number(limit) || 20, 100));
    const skip     = (pageNum - 1) * pageSize;

    const [shipments, total] = await Promise.all([
        Shipment.find(filter)
            .populate('orderId', 'orderId fulfillmentType total shippingAddress paymentMethod status')
            .populate('vendorId', 'storeName phone')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(pageSize)
            .lean(),
        Shipment.countDocuments(filter),
    ]);

    res.status(200).json(new ApiResponse(200, {
        shipments,
        total,
        page: pageNum,
        pages: Math.ceil(total / pageSize) || 1,
    }, 'Shipments fetched'));
});

/**
 * GET /shipments/:id
 * Single shipment detail.
 */
export const getShipmentDetail = asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        throw new ApiError(400, 'Invalid shipment id.');
    }

    const shipment = await Shipment.findById(req.params.id)
        .populate('orderId')
        .populate('vendorId', 'storeName phone email');

    if (!shipment) throw new ApiError(404, 'Shipment not found');

    res.status(200).json(new ApiResponse(200, shipment, 'Shipment details fetched'));
});

/**
 * POST /orders/:id/book-dtdc
 * Trigger DTDC booking for a retail/wholesale order.
 */
export const adminBookDtdcShipment = asyncHandler(async (req, res) => {
    const order = await loadOrderOrThrow(req.params.id);
    const vendorId = resolveVendorId(order, req.body?.vendorId || req.query?.vendorId);
    requireDtdcEligible(order, vendorId);

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) throw new ApiError(404, 'Vendor not found');

    const packageOverride = extractPackageOverride(req.body);
    try {
        const shipment = await bookDtdcShipment(order, vendor, null, packageOverride);
        res.status(200).json(new ApiResponse(200, shipment, 'DTDC shipment booked'));
    } catch (err) {
        if (err instanceof ApiError) throw err;
        throw new ApiError(400, err.message || 'Failed to book DTDC shipment');
    }
});

/**
 * GET /orders/:id/package-preview
 * What would be declared if this order were booked now, and its provenance.
 */
export const adminGetPackagePreview = asyncHandler(async (req, res) => {
    const order = await loadOrderOrThrow(req.params.id);
    const vendorId = resolveVendorId(order, req.query?.vendorId);
    requireDtdcEligible(order, vendorId);

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) throw new ApiError(404, 'Vendor not found');

    res.status(200).json(new ApiResponse(200, await previewParcel(order, vendor, vendorId), 'Package preview'));
});

/**
 * POST /orders/:id/cancel-shipment
 * Cancel an existing DTDC shipment.
 */
export const adminCancelShipment = asyncHandler(async (req, res) => {
    const order = await loadOrderOrThrow(req.params.id);
    const vendorId = resolveVendorId(order, req.body?.vendorId || req.query?.vendorId);
    requireDtdcEligible(order, vendorId);

    const shipment = await cancelDtdcShipment(order, vendorId);
    res.status(200).json(new ApiResponse(200, shipment, 'DTDC shipment cancelled'));
});

/**
 * GET /orders/:id/shipping-label
 * Stream the DTDC shipping label PDF.
 */
export const adminGetShippingLabel = asyncHandler(async (req, res) => {
    const order = await loadOrderOrThrow(req.params.id);
    const vendorId = resolveVendorId(order, req.query?.vendorId);
    requireDtdcEligible(order, vendorId);

    const labelResponse = await getShipmentLabel(order, vendorId);
    await streamLabelToResponse(labelResponse, res, order);
});

/**
 * POST /orders/:id/sync-tracking
 * Manually trigger a tracking sync from DTDC.
 */
export const adminSyncTracking = asyncHandler(async (req, res) => {
    const order = await loadOrderOrThrow(req.params.id);
    const vendorId = resolveVendorId(order, req.body?.vendorId || req.query?.vendorId);
    requireDtdcEligible(order, vendorId);

    const shipment = await syncTrackingStatus(order, vendorId);
    res.status(200).json(new ApiResponse(200, shipment, 'Tracking synced'));
});

/**
 * GET /check-serviceability
 * Check DTDC serviceability for a route.
 */
export const adminCheckServiceability = asyncHandler(async (req, res) => {
    const { originPincode, destPincode } = req.query;
    if (!originPincode || !destPincode) {
        throw new ApiError(400, 'Both originPincode and destPincode query params are required');
    }

    const result = await checkDtdcServiceability(originPincode, destPincode);
    res.status(200).json(new ApiResponse(200, result, 'Serviceability checked'));
});

/**
 * GET /orders/:id/shipment
 * Shipment records for an order.
 *
 * Returns the single shipment when the order has one seller and the full list
 * when it is split, so the admin screen can render either without a second
 * round trip.
 */
export const getOrderShipment = asyncHandler(async (req, res) => {
    const order = await loadOrderOrThrow(req.params.id);

    const shipments = await Shipment.find({ orderId: order._id })
        .populate('vendorId', 'storeName')
        .lean();

    if (shipments.length <= 1) {
        const shipment = shipments[0] || null;
        return res.status(200).json(
            new ApiResponse(200, shipment, shipment ? 'Shipment found' : 'No shipment')
        );
    }

    res.status(200).json(new ApiResponse(200, { shipments }, 'Shipments found'));
});

/**
 * GET /shipments/awaiting-booking
 *
 * Platform-wide view of retail and wholesale orders that are ready to despatch
 * with no courier booking.
 *
 * Uses the SAME `findUnbookedOrders` the sweep and the vendor endpoint use.
 * Three copies of an eligibility rule is three chances for the admin console
 * to disagree with the seller's own screen about whether an order is late.
 */
export const listAwaitingBooking = asyncHandler(async (req, res) => {
    const { vendorId, channel, minHours } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100));

    if (vendorId && !mongoose.Types.ObjectId.isValid(vendorId)) {
        throw new ApiError(400, 'Invalid vendorId.');
    }
    if (channel && ![VendorChannels.RETAIL, VendorChannels.WHOLESALE].includes(channel)) {
        throw new ApiError(400, 'Channel must be retail or wholesale — Quick Commerce does not use a courier.');
    }

    const hoursFilter = Number(minHours);
    const olderThan = Number.isFinite(hoursFilter) && hoursFilter > 0
        ? new Date(Date.now() - hoursFilter * 3_600_000)
        : null;

    const criteria = { vendorId: vendorId || null, channel: channel || null, olderThan };
    const { vendorHours, adminHours } = await getAlertThresholds();

    const [orders, total] = await Promise.all([
        findUnbookedOrders({ ...criteria, skip: (page - 1) * limit, limit }),
        countUnbookedOrders(criteria),
    ]);

    // One batched vendor lookup rather than one per row.
    const vendorIds = [...new Set(orders.map((o) => vendorOf(o)).filter(Boolean).map(String))];
    const vendors = vendorIds.length
        ? await Vendor.find({ _id: { $in: vendorIds } }).select('storeName').lean()
        : [];
    const vendorNames = new Map(vendors.map((v) => [String(v._id), v.storeName]));

    const now = new Date();
    const rows = orders.map((order) => {
        const waited = hoursAwaiting(order, now);
        const vid = vendorOf(order);
        return {
            _id: order._id,
            orderId: order.orderId,
            status: order.status,
            fulfillmentType: order.fulfillmentType,
            total: order.total,
            vendorId: vid,
            vendorName: vid ? (vendorNames.get(String(vid)) || null) : null,
            createdAt: order.createdAt,
            readySince: order.updatedAt,
            hoursAwaiting: waited,
            isOverdue: waited >= vendorHours,
            isCritical: waited >= adminHours,
            alertedAt: order.integration?.unbookedAlertedAt || null,
        };
    });

    res.status(200).json(new ApiResponse(200, {
        orders: rows,
        total,
        page,
        pages: Math.ceil(total / limit) || 1,
        vendorThresholdHours: vendorHours,
        adminThresholdHours: adminHours,
    }, 'Orders awaiting booking fetched'));
});

export { ShipmentStatus };
