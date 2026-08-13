import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Refund from '../../../models/Refund.model.js';
import Order from '../../../models/Order.model.js';
import {
    requestRefund,
    executeRefund,
    markRefundManuallySettled,
    applyRefundReversals,
    getRefundableAmount,
    getRefundPolicy,
    notifyCustomerRefundInitiated,
} from '../../../services/refund/RefundOrchestrator.service.js';

/**
 * GET /api/admin/refunds
 * The operator queue: what is outstanding, what failed, and how long it has waited.
 */
export const listRefunds = asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100));
    const { status, orderNumber } = req.query;

    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (orderNumber) filter.orderNumber = new RegExp(String(orderNumber).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const [refunds, total, policy] = await Promise.all([
        Refund.find(filter)
            .sort({ requestedAt: 1 }) // oldest outstanding first
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('userId', 'name email')
            .populate('vendorId', 'storeName')
            .lean(),
        Refund.countDocuments(filter),
        getRefundPolicy(),
    ]);

    res.status(200).json(new ApiResponse(200, {
        refunds,
        total,
        page,
        pages: Math.ceil(total / limit) || 1,
        policy,
    }, 'Refunds fetched.'));
});

/** GET /api/admin/refunds/:id */
export const getRefundById = asyncHandler(async (req, res) => {
    const refund = await Refund.findById(req.params.id)
        .populate('userId', 'name email phone')
        .populate('vendorId', 'storeName email')
        .lean();
    if (!refund) throw new ApiError(404, 'Refund not found.');
    res.status(200).json(new ApiResponse(200, refund, 'Refund fetched.'));
});

/**
 * POST /api/admin/refunds
 * Record a refund against an order. Amount is validated server-side against the
 * order's remaining refundable balance — a client-supplied amount is never trusted.
 */
export const createRefund = asyncHandler(async (req, res) => {
    const { orderId, amount, reason, refundType = 'full', returnRequestId = null } = req.body;
    if (!orderId) throw new ApiError(400, 'orderId is required.');

    const order = await Order.findOne(
        /^[0-9a-fA-F]{24}$/.test(String(orderId))
            ? { $or: [{ _id: orderId }, { orderId }] }
            : { orderId }
    );
    if (!order) throw new ApiError(404, 'Order not found.');

    const refundable = await getRefundableAmount(order);
    const resolvedAmount = amount === undefined || amount === null ? refundable : Number(amount);

    const { refund, created } = await requestRefund({
        orderId: order._id,
        amount: resolvedAmount,
        reason,
        refundType,
        returnRequestId,
        initiatedBy: req.user.id,
    });

    if (created) await notifyCustomerRefundInitiated(refund).catch(() => null);

    res.status(created ? 201 : 200).json(
        new ApiResponse(
            created ? 201 : 200,
            refund,
            created ? 'Refund recorded.' : 'A refund already exists for this request.'
        )
    );
});

/** POST /api/admin/refunds/:id/execute — send a requested refund to the gateway. */
export const executeRefundHandler = asyncHandler(async (req, res) => {
    const refund = await executeRefund(req.params.id);
    res.status(200).json(new ApiResponse(200, refund, `Refund is now ${refund.status}.`));
});

/** POST /api/admin/refunds/:id/retry — same call; retry reuses the idempotency key. */
export const retryRefund = asyncHandler(async (req, res) => {
    const existing = await Refund.findById(req.params.id);
    if (!existing) throw new ApiError(404, 'Refund not found.');
    if (existing.status !== 'failed') {
        throw new ApiError(409, `Only a failed refund can be retried (this one is ${existing.status}).`);
    }
    // Return it to `requested` so executeRefund's compare-and-set can claim it.
    await Refund.updateOne({ _id: existing._id }, { $set: { status: 'requested', failureReason: '' } });
    const refund = await executeRefund(existing._id);
    res.status(200).json(new ApiResponse(200, refund, `Refund is now ${refund.status}.`));
});

/** POST /api/admin/refunds/:id/mark-manual-settled — COD / offline settlement. */
export const markManualSettled = asyncHandler(async (req, res) => {
    const { proofRef, note } = req.body;
    const refund = await markRefundManuallySettled({
        refundId: req.params.id,
        proofRef,
        note,
        actorId: req.user.id,
    });
    res.status(200).json(new ApiResponse(200, refund, 'Refund recorded as manually settled.'));
});

/**
 * POST /api/admin/refunds/:id/resume-reversals
 * Re-runs only the reversals that failed. Each is idempotent, so this is safe to
 * call repeatedly and never re-issues the money.
 */
export const resumeReversals = asyncHandler(async (req, res) => {
    const refund = await applyRefundReversals(req.params.id);
    if (!refund) throw new ApiError(404, 'Refund not found.');
    res.status(200).json(new ApiResponse(200, refund, 'Reversals re-applied.'));
});
