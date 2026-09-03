import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import Commission from '../../../models/Commission.model.js';
import Settlement from '../../../models/Settlement.model.js';
import Vendor from '../../../models/Vendor.model.js';
import mongoose from 'mongoose';
import { createNotification, notifyAdmins } from '../../../services/notification.service.js';
import {
    assertQuickCommerceTransition,
    applyQuickCommerceStatus,
    publishQuickCommerceStatus,
} from '../../../services/quickCommerceOrderStatus.service.js';
import { EXPERIENCES } from '../../../constants/experiences.js';
import { QUICK_COMMERCE_ORDER_STATUS } from '../../../constants/quickCommerce.js';
import { acknowledgeVendorOrderAlert } from '../../../services/quickCommerceAlerts.service.js';
import { processPartialFulfilment } from '../../../services/quickCommerceFulfilment.service.js';
import { getVendorWithdrawableCommissions, getMinimumPayout } from '../../../services/commission.service.js';
import { marketplaceEventBus, MARKETPLACE_EVENTS } from '../../../services/events/marketplaceEventBus.js';
import {
    baseQuickCommerceMatch,
    resolveDateRange,
    startOfToday,
    scopeToVendor,
    getVolumeStats,
    getEtaStats,
    getStageBreakdown,
    getPeakHours,
    getTopProducts,
    getVendorResponsiveness,
    getDailySeries,
} from '../../../services/quickCommerceAnalytics.service.js';
import { applyRetailTransition }    from '../../../services/orders/RetailOrderService.js';
import { applyWholesaleTransition } from '../../../services/orders/WholesaleOrderService.js';
import { channelToOrderType } from '../../../constants/vendorChannels.js';
import { orderChannelFilter, resolveOrderChannel } from '../../../services/orderChannel.service.js';

const deriveTopLevelOrderStatus = (vendorItems = [], fallback = 'pending') => {
    const statuses = (vendorItems || [])
        .map((item) => String(item?.status || '').toLowerCase())
        .filter(Boolean);

    if (!statuses.length) return String(fallback || 'pending').toLowerCase();

    if (statuses.every((s) => s === 'cancelled')) return 'cancelled';
    if (statuses.every((s) => s === 'delivered')) return 'delivered';
    if (statuses.includes('shipped')) return 'shipped';
    if (statuses.includes('processing')) return 'processing';
    if (statuses.includes('pending')) return 'pending';

    return String(fallback || 'pending').toLowerCase();
};

// GET /api/vendor/orders
export const getVendorOrders = asyncHandler(async (req, res) => {
    const { status, orderType, type, fulfillmentType, page = 1, limit = 20 } = req.query;
    const targetOrderType = channelToOrderType(req.vendorWorkspace) || orderType || type;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Number(limit) || 20);
    const skip = (numericPage - 1) * numericLimit;

    const vendorId = req.user.id;

    // Database query level isolation — uses indexed top-level vendorId with fallback to vendorItems.vendorId for legacy
    const filter = {
        $or: [
            { vendorId: new mongoose.Types.ObjectId(vendorId) },
            { 'vendorItems.vendorId': new mongoose.Types.ObjectId(vendorId) },
        ],
    };

    if (status) filter.status = status;
    if (targetOrderType) {
        // Same predicate the status-update path uses, so an order can never be
        // listed in a workspace that then refuses to action it.
        filter.$and = [orderChannelFilter(targetOrderType)];
    } else if (fulfillmentType) filter.fulfillmentType = fulfillmentType;

    const rawOrders = await Order.find(filter)
        .populate('userId', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(numericLimit)
        .lean();
    const total = await Order.countDocuments(filter);

    // Sanitize: ensure vendor only sees their own vendorItems slice and items
    const sanitizedOrders = rawOrders.map((order) => {
        const myVendorItems = (order.vendorItems || []).filter(
            (vi) => String(vi.vendorId) === String(vendorId)
        );
        const myItems = (order.items || []).filter(
            (item) => String(item.vendorId) === String(vendorId)
        );
        const customer = {
            name: order.userId?.name || order.shippingAddress?.name || order.guestInfo?.name || 'Guest',
            email: order.userId?.email || order.shippingAddress?.email || order.guestInfo?.email || 'N/A',
            phone: order.userId?.phone || order.shippingAddress?.phone || order.guestInfo?.phone || '',
        };
        return {
            ...order,
            customer,
            vendorItems: myVendorItems,
            items: myItems.length > 0 ? myItems : (myVendorItems[0]?.items || order.items),
        };
    });

    res.status(200).json(new ApiResponse(200, { orders: sanitizedOrders, total, page: numericPage, pages: Math.ceil(total / numericLimit) }, 'Orders fetched.'));
});

// GET /api/vendor/orders/:id
export const getVendorOrderById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const vendorId = req.user.id;
    const idFilter = [{ orderId: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
        idFilter.push({ _id: id });
    }

    const rawOrder = await Order.findOne({
        $or: idFilter,
        $and: [{
            $or: [
                { vendorId: new mongoose.Types.ObjectId(vendorId) },
                { 'vendorItems.vendorId': new mongoose.Types.ObjectId(vendorId) },
            ],
        }, orderChannelFilter(req.vendorWorkspace)],
    })
        .populate('userId', 'name email phone')
        .populate('deliveryBoyId', 'name phone vehicleType vehicleNumber status')
        .lean();

    if (!rawOrder) throw new ApiError(404, 'Order not found.');

    // Sanitize: vendor only sees their own vendorItems slice and items
    const myVendorItems = (rawOrder.vendorItems || []).filter(
        (vi) => String(vi.vendorId) === String(vendorId)
    );
    const myItems = (rawOrder.items || []).filter(
        (item) => String(item.vendorId) === String(vendorId)
    );

    const customer = {
        name: rawOrder.userId?.name || rawOrder.shippingAddress?.name || rawOrder.guestInfo?.name || 'Guest',
        email: rawOrder.userId?.email || rawOrder.shippingAddress?.email || rawOrder.guestInfo?.email || 'N/A',
        phone: rawOrder.userId?.phone || rawOrder.shippingAddress?.phone || rawOrder.guestInfo?.phone || '',
    };

    const sanitizedOrder = {
        ...rawOrder,
        customer,
        vendorItems: myVendorItems,
        items: myItems.length > 0 ? myItems : (myVendorItems[0]?.items || rawOrder.items),
    };

    res.status(200).json(new ApiResponse(200, sanitizedOrder, 'Order fetched.'));
});

/**
 * PATCH /api/vendor/orders/:id/status
 *
 * Strategy-based order status dispatcher.
 * The service to invoke is determined by order.orderType (or order.experience),
 * NOT by vendor.vendorType — keeping orders decoupled from vendor identity.
 *
 * QC orders use a dedicated endpoint (/quick-status) for their finer lifecycle.
 * This endpoint handles Retail and Wholesale orders.
 */
export const updateOrderStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!status) throw new ApiError(400, 'Status is required.');

    const { id } = req.params;
    const idFilter = [{ orderId: id }];
    if (mongoose.Types.ObjectId.isValid(id)) idFilter.push({ _id: id });

    const order = await Order.findOne({
        $or: idFilter,
        'vendorItems.vendorId': req.user.id,
    });
    if (!order) throw new ApiError(404, 'Order not found.');

    // Channel comes from the authoritative resolver — fulfillmentType first,
    // orderType only as a legacy fallback — so the state machine applied here
    // always matches the workspace the order was listed under.
    const orderChannel = resolveOrderChannel(order, req.user.id);
    if (orderChannel !== req.vendorWorkspace) {
        throw new ApiError(403, 'This order belongs to a different workspace.');
    }

    if (orderChannel === 'quick_commerce') {
        throw new ApiError(400, 'Quick Commerce orders must use the /quick-status endpoint.');
    }

    // Delegate to the appropriate order service strategy
    if (orderChannel === 'wholesale') {
        applyWholesaleTransition(order, status, req.user.id);
    } else {
        // Default to Retail strategy for 'retail' or legacy 'marketplace' orders
        applyRetailTransition(order, status, req.user.id);
    }

    await order.save();

    // Notifications
    const notificationTasks = [];
    if (order.userId) {
        notificationTasks.push(
            createNotification({
                recipientId: order.userId,
                recipientType: 'user',
                title: 'Order item status updated',
                message: `An item in your order ${order.orderId || order._id} is now ${status}.`,
                type: 'order',
                data: { orderId: String(order.orderId || order._id), status: String(status), scope: 'vendor_item' },
            })
        );
    }
    notificationTasks.push(
        createNotification({
            recipientId: req.user.id,
            recipientType: 'vendor',
            title: 'Order status updated',
            message: `Order ${order.orderId || order._id} moved to ${status}.`,
            type: 'order',
            data: { orderId: String(order.orderId || order._id), status: String(status) },
        })
    );
    await Promise.allSettled(notificationTasks);

    res.status(200).json(new ApiResponse(200, order, 'Order status updated.'));
});


/**
 * PATCH /api/vendor/orders/:id/quick-status
 *
 * Store-side Quick Commerce transitions: accepted → preparing → ready.
 *
 * Separate from `updateOrderStatus` because the Marketplace endpoint's status
 * set and per-vendor transition map are relied on by the existing vendor
 * dashboard; Quick Commerce needs a finer lifecycle without changing that one.
 */
export const updateQuickCommerceOrderStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;

    const { id } = req.params;
    const idFilter = [{ orderId: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
        idFilter.push({ _id: id });
    }

    const order = await Order.findOne({
        $or: idFilter,
        'vendorItems.vendorId': req.user.id,
        isDeleted: { $ne: true },
    });
    if (!order) throw new ApiError(404, 'Order not found.');

    assertQuickCommerceTransition(order, status, 'vendor');

    applyQuickCommerceStatus(order, status);
    await order.save();

    if (status === QUICK_COMMERCE_ORDER_STATUS.ACCEPTED) {
        await acknowledgeVendorOrderAlert(order._id, req.user.id).catch((err) => {
            console.warn(`[QC Alert] Acknowledge failed for ${order.orderId}: ${err.message}`);
        });
    }

    if (status === QUICK_COMMERCE_ORDER_STATUS.READY) {
        marketplaceEventBus.emit(MARKETPLACE_EVENTS.QC_ORDER_READY, { order });
    }

    await publishQuickCommerceStatus(order, status);

    res.status(200).json(new ApiResponse(200, order, 'Order status updated.'));
});

/**
 * POST /api/vendor/quick-commerce/orders/:id/acknowledge
 *
 * Explicitly take responsibility for an order without yet accepting it —
 * "I have seen this, stop the alarm". Stops the escalation clock; the store is
 * still expected to accept.
 */
export const acknowledgeQuickCommerceOrder = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const idFilter = [{ orderId: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
        idFilter.push({ _id: id });
    }

    const order = await Order.findOne({
        $or: idFilter,
        'vendorItems.vendorId': req.user.id,
        isDeleted: { $ne: true },
    }).select('_id orderId experience');
    if (!order) throw new ApiError(404, 'Order not found.');
    if (order.experience !== EXPERIENCES.QUICK_COMMERCE) {
        throw new ApiError(400, 'This is not a Quick Commerce order.');
    }

    const acknowledgedAt = await acknowledgeVendorOrderAlert(order._id, req.user.id);

    res.status(200).json(new ApiResponse(200, { acknowledgedAt }, 'Order acknowledged.'));
});

/**
 * GET /api/vendor/quick-commerce/unacknowledged-alerts
 *
 * Hydrates vendor order alert popup on mount / page refresh for orders needing vendor action.
 */
export const getUnacknowledgedVendorAlerts = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const orders = await Order.find({
        experience: EXPERIENCES.QUICK_COMMERCE,
        isDeleted: { $ne: true },
        'vendorItems.vendorId': vendorId,
        'quickCommerce.status': { $in: ['placed', 'pending'] },
        'quickCommerce.vendorAcknowledgedAt': { $exists: false },
    })
        .select('orderId createdAt vendorItems quickCommerce')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

    res.status(200).json(new ApiResponse(200, orders, 'Unacknowledged vendor alerts.'));
});

/**
 * GET /api/vendor/quick-commerce/dashboard
 *
 * The store's operational view — built around "what do I need to do right now",
 * not "how did last month go". Live stage counts come first; historical
 * performance follows.
 *
 * `?days=` controls the historical window (default 30). Today's figures are
 * always today's, regardless of that window.
 */
export const getQuickCommerceVendorDashboard = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const { start, end } = resolveDateRange({
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        days: Number(req.query.days) || 30,
    });

    // Hour/day buckets follow the store owner's clock, not the server's.
    const timezone = req.query.timezone;

    const rangeMatch = scopeToVendor(
        baseQuickCommerceMatch({ createdAt: { $gte: start, $lte: end } }),
        vendorId
    );
    const todayMatch = scopeToVendor(
        baseQuickCommerceMatch({ createdAt: { $gte: startOfToday() } }),
        vendorId
    );
    // Live orders are not date-bounded: an order placed before midnight that is
    // still being prepared is still the store's problem this morning.
    const liveMatch = scopeToVendor(
        baseQuickCommerceMatch({
            'quickCommerce.status': { $nin: ['delivered', 'cancelled'] },
        }),
        vendorId
    );

    const vendor = await Vendor.findById(vendorId).select('channels quickCommerceProfile.availabilityStatus').lean();
    const isQCVendor = ['active', 'paused'].includes(vendor?.channels?.quickCommerce?.status);
    if (!isQCVendor) {
        throw new ApiError(403, 'Quick Commerce channel is not enabled for this store.');
    }

    const [live, today, volume, eta, responsiveness, peakHours, topProducts, daily] =
        await Promise.all([
            getStageBreakdown(liveMatch),
            getVolumeStats(todayMatch),
            getVolumeStats(rangeMatch),
            getEtaStats(rangeMatch),
            getVendorResponsiveness(rangeMatch),
            getPeakHours(rangeMatch, timezone),
            getTopProducts(rangeMatch, 10),
            getDailySeries(rangeMatch, timezone),
        ]);

    res.status(200).json(new ApiResponse(200, {
        range: { start, end },
        channelEnabled: isQCVendor,
        availabilityStatus: vendor?.quickCommerceProfile?.availabilityStatus || null,
        // What needs attention now.
        live: {
            ...live,
            actionRequired: live.placed,
            inKitchen: live.accepted + live.preparing,
            awaitingPickup: live.ready,
            onTheWay: live.picked_up + live.arriving,
        },
        today,
        performance: volume,
        eta,
        responsiveness,
        peakHours,
        topProducts,
        daily,
    }, 'Quick Commerce dashboard fetched.'));
});

// GET /api/vendor/earnings
export const getEarnings = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 50,
        settlementsPage = 1,
        settlementsLimit = 50,
    } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Number(limit) || 50);
    const commissionSkip = (numericPage - 1) * numericLimit;
    const numericSettlementsPage = Math.max(1, Number(settlementsPage) || 1);
    const numericSettlementsLimit = Math.max(1, Number(settlementsLimit) || 50);
    const settlementSkip = (numericSettlementsPage - 1) * numericSettlementsLimit;

    const [commissionDocs, totalCommissions, settlements, totalSettlements] = await Promise.all([
        Commission.find({ vendorId: req.user.id })
            .populate('orderId', 'orderId status deliveredAt createdAt')
            .sort({ createdAt: -1 })
            .skip(commissionSkip)
            .limit(numericLimit),
        Commission.countDocuments({ vendorId: req.user.id }),
        Settlement.find({ vendorId: req.user.id })
            .sort({ createdAt: -1 })
            .skip(settlementSkip)
            .limit(numericSettlementsLimit),
        Settlement.countDocuments({ vendorId: req.user.id }),
    ]);
    const allCommissionsForSummary = await Commission.find({ vendorId: req.user.id })
        .populate('orderId', 'orderId status deliveredAt createdAt')
        .sort({ createdAt: -1 });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const commissions = commissionDocs.map((doc) => {
        const commission = doc.toObject();
        const orderRef = commission.orderId?._id || commission.orderId;
        const orderDisplayId = commission.orderId?.orderId || String(orderRef || '');
        const orderStatus = String(commission.orderId?.status || '').toLowerCase();
        const effectiveStatus = orderStatus === 'cancelled' ? 'cancelled' : String(commission.status || 'pending');
        const deliveredAt = commission.orderId?.deliveredAt;
        const orderDate = commission.orderId?.createdAt || deliveredAt || commission.createdAt;
        const isEscrowLocked = effectiveStatus === 'pending' && deliveredAt && new Date(deliveredAt) > sevenDaysAgo;

        return {
            ...commission,
            orderRef,
            orderDisplayId,
            orderDate,
            deliveredAt,
            isEscrowLocked,
            effectiveStatus,
        };
    });

    const summary = allCommissionsForSummary.reduce((acc, doc) => {
        const c = doc.toObject();
        const status = String(c.status || 'pending');
        const orderStatus = String(c.orderId?.status || '').toLowerCase();
        const effectiveStatus = orderStatus === 'cancelled' ? 'cancelled' : status;
        const earnings = Number(c.vendorEarnings || 0);
        const commissionAmount = Number(c.commission || 0);

        // Cancelled commissions should not contribute to active earnings totals.
        if (effectiveStatus !== 'cancelled') {
            acc.totalEarnings += earnings;
            acc.totalCommission += commissionAmount;
            acc.totalOrders += 1;
        }

        if (effectiveStatus === 'pending') {
            const deliveredAt = c.orderId?.deliveredAt;
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            
            if (orderStatus === 'delivered' && deliveredAt && new Date(deliveredAt) <= sevenDaysAgo) {
                acc.withdrawableEarnings += earnings;
            } else {
                acc.lockedEarnings += earnings;
            }
            acc.pendingEarnings += earnings; // keep total pending for backwards compatibility
        }
        if (effectiveStatus === 'requested') acc.requestedEarnings += earnings;
        if (effectiveStatus === 'paid') acc.paidEarnings += earnings;
        if (effectiveStatus === 'cancelled') acc.cancelledEarnings += earnings;
        return acc;
    }, {
        totalEarnings: 0,
        pendingEarnings: 0,
        withdrawableEarnings: 0,
        lockedEarnings: 0,
        requestedEarnings: 0,
        paidEarnings: 0,
        cancelledEarnings: 0,
        totalCommission: 0,
        totalOrders: 0
    });

    res.status(200).json(
        new ApiResponse(
            200,
            {
                summary,
                commissions,
                settlements,
                pagination: {
                    totalCommissions,
                    page: numericPage,
                    limit: numericLimit,
                    pages: Math.max(1, Math.ceil(totalCommissions / numericLimit)),
                },
                settlementsPagination: {
                    totalSettlements,
                    page: numericSettlementsPage,
                    limit: numericSettlementsLimit,
                    pages: Math.max(1, Math.ceil(totalSettlements / numericSettlementsLimit)),
                },
            },
            'Earnings fetched.'
        )
    );
});

// POST /api/vendor/earnings/request-payout
export const requestPayout = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const idempotencyKey = String(req.get('x-idempotency-key') || '').trim() || null;

    // Replay guard before any state is touched.
    if (idempotencyKey) {
        const replay = await Settlement.findOne({ idempotencyKey }).lean();
        if (replay) {
            return res.status(200).json(
                new ApiResponse(200, replay, 'Duplicate payout request ignored. Returning existing request.')
            );
        }
    }

    // An open request already covers this vendor's eligible commissions.
    // Reported explicitly rather than letting the unique index surface as a
    // generic duplicate-key error.
    const openSettlement = await Settlement.findOne({ vendorId, status: 'pending' }).lean();
    if (openSettlement) {
        throw new ApiError(
            409,
            'You already have a payout request awaiting review. It must be settled before requesting another.'
        );
    }

    const { withdrawableAmount, eligibleCommissionIds } = await getVendorWithdrawableCommissions(vendorId);

    const MINIMUM_PAYOUT = await getMinimumPayout();
    if (withdrawableAmount < MINIMUM_PAYOUT) {
        throw new ApiError(
            400,
            `Minimum payout amount is ₹${MINIMUM_PAYOUT}. Your withdrawable balance is ₹${withdrawableAmount}.`
        );
    }

    if (!eligibleCommissionIds || eligibleCommissionIds.length === 0) {
        throw new ApiError(400, 'No eligible commissions available for payout.');
    }

    // ── Settlement creation and commission claim in ONE transaction ──────────
    // Previously two independent writes: `Settlement.create` then
    // `Commission.updateMany`. Two concurrent requests both read the same
    // eligible set and both created a settlement over it — paying the vendor
    // twice for the same commissions.
    //
    // The commission update is now conditional on the commissions still being
    // `pending`, so a racing request claims zero and aborts rather than
    // double-claiming.
    let settlement = null;
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const [created] = await Settlement.create([{
                vendorId,
                commissionIds: eligibleCommissionIds,
                amount: withdrawableAmount,
                status: 'pending',
                paymentMethod: req.body.paymentMethod || 'bank_transfer',
                notes: 'Requested by vendor',
                ...(idempotencyKey ? { idempotencyKey } : {}),
            }], { session });

            const claim = await Commission.updateMany(
                { _id: { $in: eligibleCommissionIds }, status: 'pending' },
                { $set: { status: 'requested', settlementId: created._id } },
                { session }
            );

            // If another request claimed them first, this settlement covers
            // nothing and must not exist.
            if (claim.modifiedCount !== eligibleCommissionIds.length) {
                throw new ApiError(
                    409,
                    'Your eligible earnings changed while the request was being processed. Please try again.'
                );
            }

            settlement = created;
        });
    } catch (err) {
        if (err?.code === 11000) {
            throw new ApiError(409, 'A payout request is already in progress for your account.');
        }
        throw err;
    } finally {
        await session.endSession();
    }

    // Notify admins (non-blocking).
    // Routed through `notifyAdmins`, which anchors the notification correctly.
    // This previously passed the VENDOR's id as `recipientId` with
    // `recipientType: 'admin'` — a misattribution that only went unnoticed
    // because the admin feed ignores `recipientId` entirely.
    notifyAdmins({
        anchorId: settlement._id,
        title: 'New Payout Request',
        message: `Vendor ${req.user.name || req.user.storeName || 'Vendor'} has requested a payout of ₹${withdrawableAmount}.`,
        type: 'settlement',
        category: 'SETTLEMENT',
        actionUrl: '/admin/vendors/payout-requests',
        data: { settlementId: String(settlement._id), vendorId: String(vendorId) },
    }).catch((err) => {
        console.warn(`[Payout Notification Warning]: ${err.message}`);
    });

    res.status(201).json(new ApiResponse(201, settlement, 'Payout request submitted successfully.'));
});

// POST /api/vendor/orders/:id/partial-fulfilment
export const markPartialFulfilment = asyncHandler(async (req, res) => {
    const { unavailableItems, reason, notes } = req.body;
    const { id } = req.params;

    const order = await processPartialFulfilment({
        orderId: id,
        vendorId: req.user.id,
        unavailableItems,
        reason,
        notes,
    });

    res.status(200).json(new ApiResponse(200, order, 'Partial fulfilment processed successfully.'));
});
