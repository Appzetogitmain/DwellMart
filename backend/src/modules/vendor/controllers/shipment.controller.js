/**
 * Vendor Shipment Controller
 *
 * Vendor-facing endpoints for DTDC shipment management, scoped to the
 * authenticated vendor's own orders.
 *
 * The vendor identity comes from `req.user.id`. The access token payload is
 * `{ id, role, email }` and carries no `_id`; reading `req.user._id` yielded
 * `undefined`, which Mongoose cast to `null`, so every ownership filter matched
 * nothing and all of these endpoints answered 404 to their rightful owner.
 *
 * Three guards apply to every handler, in this order:
 *   1. ownership   — the order must belong to this vendor;
 *   2. workspace   — the order's channel must match the workspace the request
 *                    was made in, so a Quick Commerce workspace cannot reach
 *                    into retail orders;
 *   3. provider    — the channel must resolve to DTDC.
 */

import asyncHandler from '../../../utils/asyncHandler.js';
import ApiError from '../../../utils/ApiError.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import Shipment from '../../../models/Shipment.model.js';
import Order from '../../../models/Order.model.js';
import Vendor from '../../../models/Vendor.model.js';
import mongoose from 'mongoose';
import { isDtdcOrder, DeliveryProviders } from '../../../services/shipping/deliveryProvider.js';
import { resolveOrderChannel } from '../../../services/orderChannel.service.js';
import { isChannelWritable } from '../../../constants/vendorChannels.js';
import {
    previewParcel,
    extractPackageOverride,
    bookDtdcShipment,
    syncTrackingStatus,
    getShipmentLabel,
    checkDtdcServiceability,
} from '../../../services/shipping/dtdcShipment.service.js';
import { streamLabelToResponse } from '../../../services/shipping/labelStream.js';
import {
    findUnbookedOrders,
    countUnbookedOrders,
    hoursAwaiting,
    getAlertThresholds,
} from '../../../services/shipping/unbookedOrderAlerts.service.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Load an order that belongs to the authenticated vendor and is eligible for
 * DTDC shipping from the workspace the request was made in.
 *
 * @param {object} req
 * @param {object} [options]
 * @param {boolean} [options.write] the action despatches or changes a parcel,
 *        so the channel must be ACTIVE rather than merely readable. A paused
 *        channel may still be inspected; it may not create new consignments.
 */
const loadVendorOrder = async (req, { write = false } = {}) => {
    const vendorId = req.user.id;
    const { id } = req.params;

    const idFilter = [{ orderId: id }];
    if (mongoose.Types.ObjectId.isValid(id)) idFilter.push({ _id: id });

    const order = await Order.findOne({
        $or: idFilter,
        $and: [{
            $or: [
                { vendorId },
                { 'vendorItems.vendorId': vendorId },
            ],
        }],
    });

    if (!order) {
        throw new ApiError(404, 'Order not found or does not belong to your account');
    }

    const channel = resolveOrderChannel(order, vendorId);

    // The workspace guard mirrors the vendor order-status endpoint so a single
    // order is only ever actionable from the workspace it was listed under.
    if (req.vendorWorkspace && channel !== req.vendorWorkspace) {
        throw new ApiError(403, 'This order belongs to a different workspace.');
    }

    if (channel === 'quick_commerce') {
        throw new ApiError(403,
            'Quick Commerce orders use internal delivery and cannot be managed here'
        );
    }

    if (!isDtdcOrder(order, vendorId)) {
        throw new ApiError(400, 'This order is not eligible for DTDC shipping');
    }

    if (write && !isChannelWritable(req.vendor, channel)) {
        const error = new ApiError(403,
            'This channel is not active for write operations.'
        );
        error.errorCode = 'CHANNEL_NOT_WRITABLE';
        error.code = 'CHANNEL_NOT_WRITABLE';
        throw error;
    }

    return { order, vendorId };
};

// ─── Endpoints ─────────────────────────────────────────────────────────────

/**
 * POST /orders/:id/book-dtdc
 * Vendor triggers DTDC booking for their own order.
 */
export const vendorBookDtdcShipment = asyncHandler(async (req, res) => {
    const { order, vendorId } = await loadVendorOrder(req, { write: true });

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) throw new ApiError(404, 'Vendor profile not found');

    /**
     * Optional package confirmation. The catalogue supplies a default; only a
     * human knows what actually went in the box, and only the box is billed.
     * Applies to THIS shipment — the product is deliberately left untouched.
     */
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
 *
 * What WOULD be declared if the vendor booked right now, and where those
 * numbers came from. Lets the booking panel pre-fill and warn without the
 * frontend re-deriving unit maths the backend already owns.
 */
export const vendorGetPackagePreview = asyncHandler(async (req, res) => {
    const { order, vendorId } = await loadVendorOrder(req);

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) throw new ApiError(404, 'Vendor profile not found');

    res.status(200).json(new ApiResponse(200, await previewParcel(order, vendor, vendorId), 'Package preview'));
});

/**
 * GET /orders/:id/shipping-label
 * Vendor downloads the DTDC shipping label PDF for their own parcel.
 */
export const vendorGetShippingLabel = asyncHandler(async (req, res) => {
    const { order, vendorId } = await loadVendorOrder(req);

    const labelResponse = await getShipmentLabel(order, vendorId);
    await streamLabelToResponse(labelResponse, res, order);
});

/**
 * GET /orders/:id/shipment
 * Vendor views shipment details for their own parcel.
 *
 * Answers 200 with a null body when nothing has been booked yet. "No shipment"
 * is the ordinary state of a fresh order, not an error, and returning 404 made
 * the order-detail screen raise a failure toast on every first load.
 */
export const vendorGetShipment = asyncHandler(async (req, res) => {
    const { order, vendorId } = await loadVendorOrder(req);

    const shipment = await Shipment.findOne({
        orderId: order._id,
        vendorId,
        deliveryProvider: DeliveryProviders.DTDC,
    }).lean();

    res.status(200).json(
        new ApiResponse(200, shipment || null, shipment ? 'Shipment details fetched' : 'No shipment booked yet')
    );
});

/**
 * POST /orders/:id/sync-tracking
 * Vendor manually triggers a tracking sync.
 */
export const vendorSyncTracking = asyncHandler(async (req, res) => {
    const { order, vendorId } = await loadVendorOrder(req);

    const shipment = await syncTrackingStatus(order, vendorId);
    res.status(200).json(new ApiResponse(200, shipment, 'Tracking synced'));
});

/**
 * GET /check-serviceability
 * Vendor checks DTDC serviceability for a pincode pair.
 */
export const vendorCheckServiceability = asyncHandler(async (req, res) => {
    const { originPincode, destPincode } = req.query;
    if (!originPincode || !destPincode) {
        throw new ApiError(400, 'Both originPincode and destPincode are required');
    }

    const result = await checkDtdcServiceability(originPincode, destPincode);
    res.status(200).json(new ApiResponse(200, result, 'Serviceability checked'));
});

/**
 * GET /orders/awaiting-shipment
 *
 * The vendor's own retail and wholesale orders that are ready to despatch but
 * carry no courier booking.
 *
 * Shares `findUnbookedOrders` with the background sweep and the admin
 * endpoint, so the count in the alert, the count on the chip and the rows on
 * the screen are the same query rather than three re-implementations of the
 * same rule that drift apart.
 *
 * Quick Commerce is excluded inside that query — it has no courier booking to
 * be missing.
 */
export const vendorListAwaitingShipment = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100));

    // Scope to the workspace the request was made in, so a wholesale workspace
    // never lists retail work and vice versa.
    const channel = req.vendorWorkspace || null;
    const { vendorHours } = await getAlertThresholds();

    // `olderThan` is deliberately NOT applied here. The chip should show
    // everything the seller still has to book; the threshold governs when we
    // interrupt them about it, not what they are allowed to see.
    const criteria = { vendorId, channel };

    const [orders, total] = await Promise.all([
        findUnbookedOrders({ ...criteria, skip: (page - 1) * limit, limit }),
        countUnbookedOrders(criteria),
    ]);

    const now = new Date();
    const rows = orders.map((order) => {
        const waited = hoursAwaiting(order, now);
        return {
            _id: order._id,
            orderId: order.orderId,
            status: order.status,
            fulfillmentType: order.fulfillmentType,
            total: order.total,
            createdAt: order.createdAt,
            readySince: order.updatedAt,
            hoursAwaiting: waited,
            isOverdue: waited >= vendorHours,
            alertedAt: order.integration?.unbookedAlertedAt || null,
        };
    });

    res.status(200).json(new ApiResponse(200, {
        orders: rows,
        total,
        page,
        pages: Math.ceil(total / limit) || 1,
        thresholdHours: vendorHours,
    }, 'Orders awaiting shipment fetched'));
});
