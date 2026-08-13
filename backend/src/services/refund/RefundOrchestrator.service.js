/**
 * RefundOrchestrator
 *
 * The only code that may move money back to a customer.
 *
 * Before this existed, every refund path in the application set
 * `order.paymentStatus = 'refunded'` and stopped there — the admin override,
 * the return-completion flow, and the Quick Commerce partial-fulfilment flow
 * all told the customer they had been refunded while no money moved.
 *
 * Design constraints that shaped this:
 *
 *   • Refunds are ASYNCHRONOUS. A gateway 200 means `initiated`, not `settled`.
 *     Nothing here claims settlement until the gateway confirms it.
 *   • Refunds must be IDEMPOTENT at two layers: a unique local key and the same
 *     key sent as the gateway's `refund_id`. A retry reuses both.
 *   • COD has no gateway payment to reverse, so it routes to manual settlement
 *     rather than silently failing.
 *   • Issuing money is necessary but not sufficient — a refund must also reverse
 *     the vendor commission, the rider earning, the COD cash ledger and stock.
 *     Each is recorded separately so a partial failure is visible and resumable.
 *   • Execution is behind a kill switch that defaults OFF, so the whole pipeline
 *     can ship and be observed before a single rupee moves.
 */

import mongoose from 'mongoose';
import crypto from 'node:crypto';

import Refund from '../../models/Refund.model.js';
import Order from '../../models/Order.model.js';
import Settings from '../../models/Settings.model.js';
import ApiError from '../../utils/ApiError.js';
import { roundMoney } from '../PriceReconciliationService.js';
import { createCashfreeRefund } from '../billing/cashfree.service.js';
import { createNotification, notifyAdmins } from '../notification.service.js';

// ── Policy ────────────────────────────────────────────────────────────────────

const DEFAULT_POLICY = {
    /** Master switch. Refunds can be queued but never sent while this is false. */
    executionEnabled: false,
    /** Per-refund ceiling while the pipeline is being trusted. */
    maxRefundAmount: 25000,
};

export const getRefundPolicy = async () => {
    try {
        const doc = await Settings.findOne({ key: 'refunds' }).lean();
        const value = doc?.value || {};
        return {
            executionEnabled: value.executionEnabled === true,
            maxRefundAmount: Number.isFinite(Number(value.maxRefundAmount))
                ? Number(value.maxRefundAmount)
                : DEFAULT_POLICY.maxRefundAmount,
        };
    } catch {
        return { ...DEFAULT_POLICY };
    }
};

const generateRefundNumber = () => {
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `RF-${stamp}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
};

/**
 * Deterministic idempotency key.
 *
 * Derived from (order, returnRequest, amount) rather than random, so an
 * accidental double-submit of the same logical refund collides on the unique
 * index instead of creating a second one.
 */
const buildIdempotencyKey = ({ orderId, returnRequestId, amount }) =>
    crypto
        .createHash('sha256')
        .update(`${orderId}|${returnRequestId || 'none'}|${roundMoney(amount)}`)
        .digest('hex')
        .slice(0, 40);

/** COD and cash orders have no gateway payment to reverse. */
const resolveRefundMethod = (order) => {
    const method = String(order?.paymentMethod || '').toLowerCase();
    if (method === 'cod' || method === 'cash') return 'manual_cash';
    return 'gateway';
};

/**
 * How much of this order may still be refunded.
 * Guards against cumulative over-refunding across several partial refunds.
 */
export const getRefundableAmount = async (order) => {
    const alreadyRefunded = await Refund.aggregate([
        {
            $match: {
                orderId: order._id,
                status: { $in: ['succeeded', 'manual_settled', 'initiated'] },
            },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const refunded = roundMoney(alreadyRefunded[0]?.total || 0);
    return roundMoney(Math.max(0, Number(order.total || 0) - refunded));
};

// ── 1. Request ────────────────────────────────────────────────────────────────

/**
 * Record a refund. Does NOT contact the gateway.
 *
 * Separating request from execution is what lets the pipeline ship with the
 * kill switch off: refunds accumulate in a reviewable queue while nothing moves.
 *
 * @returns {Promise<{ refund: object, created: boolean }>}
 */
export const requestRefund = async ({
    orderId,
    amount,
    reason,
    returnRequestId = null,
    refundType = 'full',
    initiatedBy = null,
}) => {
    const order = await Order.findById(orderId);
    if (!order) throw new ApiError(404, 'Order not found.');

    if (order.paymentStatus === 'pending') {
        throw new ApiError(400, 'This order was never paid, so there is nothing to refund.');
    }

    const requestedAmount = roundMoney(amount);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
        throw new ApiError(400, 'Refund amount must be greater than zero.');
    }

    const refundable = await getRefundableAmount(order);
    if (requestedAmount > refundable) {
        throw new ApiError(
            400,
            `Refund amount exceeds the refundable balance for this order (max ₹${refundable}).`
        );
    }

    if (!String(reason || '').trim()) {
        throw new ApiError(400, 'A refund reason is required.');
    }

    const idempotencyKey = buildIdempotencyKey({ orderId: order._id, returnRequestId, amount: requestedAmount });

    const existing = await Refund.findOne({ idempotencyKey });
    if (existing) return { refund: existing, created: false };

    try {
        const refund = await Refund.create({
            refundNumber: generateRefundNumber(),
            orderId: order._id,
            orderNumber: order.orderId,
            checkoutSessionId: order.checkoutSessionId || null,
            returnRequestId,
            userId: order.userId || null,
            vendorId: order.vendorId || order.vendorItems?.[0]?.vendorId || null,
            amount: requestedAmount,
            currency: 'INR',
            reason: String(reason).trim(),
            refundType,
            method: resolveRefundMethod(order),
            status: 'requested',
            idempotencyKey,
            gatewayOrderId: order.checkoutSessionId ? null : order.orderId,
            initiatedBy,
        });
        return { refund, created: true };
    } catch (err) {
        // Either the idempotency key or the one-open-refund-per-order index
        // caught a concurrent request. Both are the correct outcome.
        if (err?.code === 11000) {
            const found = await Refund.findOne({ idempotencyKey })
                || await Refund.findOne({ orderId: order._id, status: { $in: ['requested', 'initiated'] } });
            if (found) return { refund: found, created: false };
        }
        throw err;
    }
};

// ── 2. Execute ────────────────────────────────────────────────────────────────

/**
 * Send a requested refund to the gateway.
 *
 * Only moves a refund from `requested` to `initiated`/`failed`. Settlement is
 * confirmed later by webhook — this never marks a refund `succeeded` on the
 * strength of an API response alone.
 */
export const executeRefund = async (refundId) => {
    const policy = await getRefundPolicy();

    // Compare-and-set claim: two concurrent executors cannot both send.
    const refund = await Refund.findOneAndUpdate(
        { _id: refundId, status: 'requested' },
        { $set: { status: 'initiated', initiatedAt: new Date() }, $inc: { attempts: 1 } },
        { new: true }
    );

    if (!refund) {
        const current = await Refund.findById(refundId).lean();
        if (!current) throw new ApiError(404, 'Refund not found.');
        // Already claimed or already terminal — idempotent no-op.
        return current;
    }

    const revert = async (patch) => {
        await Refund.updateOne({ _id: refund._id }, { $set: patch });
        return Refund.findById(refund._id);
    };

    if (!policy.executionEnabled) {
        return revert({
            status: 'requested',
            initiatedAt: null,
            failureReason: 'Refund execution is disabled by policy (refunds.executionEnabled).',
        });
    }

    if (refund.amount > policy.maxRefundAmount) {
        return revert({
            status: 'requested',
            initiatedAt: null,
            failureReason: `Refund exceeds the configured ceiling of ₹${policy.maxRefundAmount}. Raise the limit or settle manually.`,
        });
    }

    // COD never had a gateway payment; it must be settled by hand.
    if (refund.method !== 'gateway') {
        return revert({
            status: 'requested',
            initiatedAt: null,
            failureReason: 'This order was paid in cash. Settle the refund manually and record the proof reference.',
        });
    }

    // The gateway order id is the CheckoutSession id for split checkouts and the
    // order id for legacy single orders.
    const order = await Order.findById(refund.orderId).select('checkoutSessionId orderId').lean();
    let gatewayOrderId = refund.gatewayOrderId;
    if (!gatewayOrderId && order?.checkoutSessionId) {
        const { CheckoutSession } = await import('../../models/CheckoutSession.model.js');
        const session = await CheckoutSession.findById(order.checkoutSessionId).select('gatewayOrderId sessionId').lean();
        gatewayOrderId = session?.gatewayOrderId || session?.sessionId || null;
    }
    if (!gatewayOrderId) gatewayOrderId = order?.orderId || null;

    if (!gatewayOrderId) {
        return revert({
            status: 'failed',
            failedAt: new Date(),
            failureReason: 'Could not resolve the gateway order for this refund.',
        });
    }

    try {
        const result = await createCashfreeRefund({
            orderId: gatewayOrderId,
            // The gateway's refund_id IS our idempotency key — a retry reuses it
            // and the gateway rejects the duplicate rather than paying twice.
            refundId: refund.idempotencyKey,
            amount: refund.amount,
            note: refund.reason,
        });

        const settledNow = String(result.status || '').toUpperCase() === 'SUCCESS';

        await Refund.updateOne(
            { _id: refund._id },
            {
                $set: {
                    gatewayOrderId,
                    gatewayRefundId: result.cfRefundId || result.refundId || null,
                    gatewayStatus: result.status || null,
                    gatewayRaw: result.raw || {},
                    ...(settledNow ? { status: 'succeeded', settledAt: new Date() } : {}),
                    failureReason: '',
                },
            }
        );

        if (settledNow) await applyRefundReversals(refund._id);

        return Refund.findById(refund._id);
    } catch (err) {
        await Refund.updateOne(
            { _id: refund._id },
            {
                $set: {
                    status: 'failed',
                    failedAt: new Date(),
                    gatewayOrderId,
                    failureReason: String(err?.message || err).slice(0, 500),
                    gatewayStatus: err?.gatewayCode || null,
                },
            }
        );

        await notifyAdmins({
            anchorId: refund._id,
            title: 'Refund failed',
            message: `Refund ${refund.refundNumber} for order ${refund.orderNumber} failed: ${err?.message}`,
            type: 'refund',
            category: 'ERROR',
            priority: 'HIGH',
            actionUrl: '/admin/finance/refunds',
        }).catch(() => null);

        return Refund.findById(refund._id);
    }
};

// ── 3. Settle (webhook-driven) ────────────────────────────────────────────────

/**
 * Mark a refund settled from a gateway webhook and apply the reversals.
 * Idempotent: a duplicate or out-of-order webhook is absorbed.
 */
export const settleRefundFromGateway = async ({ gatewayRefundId, refundIdKey, status, raw = {} }) => {
    const query = refundIdKey
        ? { idempotencyKey: refundIdKey }
        : { gatewayRefundId: String(gatewayRefundId) };

    const refund = await Refund.findOne(query);
    if (!refund) {
        // A refund the platform has no record of — issued from the gateway
        // dashboard, most likely. Never silently ignore this.
        await notifyAdmins({
            title: 'Unrecognised refund webhook',
            message: `A refund webhook arrived for gateway refund ${gatewayRefundId || refundIdKey} with no matching local record.`,
            type: 'refund',
            category: 'WARNING',
            priority: 'HIGH',
        }).catch(() => null);
        return null;
    }

    const normalized = String(status || '').toUpperCase();

    if (normalized === 'SUCCESS') {
        if (refund.status === 'succeeded') return refund; // already settled
        await Refund.updateOne(
            { _id: refund._id },
            { $set: { status: 'succeeded', settledAt: new Date(), gatewayStatus: normalized, gatewayRaw: raw } }
        );
        await applyRefundReversals(refund._id);
        await notifyCustomerRefundSettled(refund).catch(() => null);
        return Refund.findById(refund._id);
    }

    if (['CANCELLED', 'FAILED'].includes(normalized)) {
        await Refund.updateOne(
            { _id: refund._id },
            {
                $set: {
                    status: 'failed',
                    failedAt: new Date(),
                    gatewayStatus: normalized,
                    gatewayRaw: raw,
                    failureReason: `Gateway reported ${normalized}.`,
                },
            }
        );
        return Refund.findById(refund._id);
    }

    await Refund.updateOne({ _id: refund._id }, { $set: { gatewayStatus: normalized, gatewayRaw: raw } });
    return Refund.findById(refund._id);
};

// ── 4. Manual settlement (COD / offline) ──────────────────────────────────────

export const markRefundManuallySettled = async ({ refundId, proofRef, actorId, note = '' }) => {
    if (!String(proofRef || '').trim()) {
        throw new ApiError(400, 'A payment proof reference is required to record a manual settlement.');
    }

    const refund = await Refund.findOneAndUpdate(
        { _id: refundId, status: { $in: ['requested', 'failed'] } },
        {
            $set: {
                status: 'manual_settled',
                settledAt: new Date(),
                manualProofRef: String(proofRef).trim(),
                initiatedBy: actorId || null,
                failureReason: note ? String(note).slice(0, 500) : '',
            },
        },
        { new: true }
    );

    if (!refund) throw new ApiError(409, 'Refund is not in a state that can be manually settled.');

    await applyRefundReversals(refund._id);
    await notifyCustomerRefundSettled(refund).catch(() => null);
    return refund;
};

// ── 5. Reversals ──────────────────────────────────────────────────────────────

/**
 * Reverse everything downstream of the money.
 *
 * Issuing the refund is necessary but not sufficient: without these the platform
 * keeps paying commission and rider earnings on revenue it has given back.
 *
 * Each effect is recorded independently and each is idempotent, so a partial
 * failure leaves a resumable record rather than an unknown state.
 */
export const applyRefundReversals = async (refundId) => {
    const refund = await Refund.findById(refundId);
    if (!refund) return null;

    const order = await Order.findById(refund.orderId);
    if (!order) return refund;

    const mark = async (key, patch) => {
        await Refund.updateOne({ _id: refund._id }, { $set: { [`reversals.${key}`]: { ...patch, at: new Date() } } });
    };

    // 5a. Vendor commission -------------------------------------------------
    if (refund.reversals?.commission?.status !== 'done') {
        try {
            const { default: Commission } = await import('../../models/Commission.model.js');
            const filter = { orderId: order._id, status: { $nin: ['cancelled', 'paid'] } };
            if (refund.vendorId) filter.vendorId = refund.vendorId;

            const result = await Commission.updateMany(filter, {
                $set: { status: 'cancelled', paidAt: null, settlementId: null },
            });
            await mark('commission', { status: 'done', ref: `modified:${result.modifiedCount}` });
        } catch (err) {
            await mark('commission', { status: 'failed', error: String(err?.message || err).slice(0, 300) });
        }
    }

    // 5b. Rider earning -----------------------------------------------------
    if (refund.reversals?.riderEarning?.status !== 'done') {
        try {
            if (order.deliveryBoyId && order.status === 'delivered') {
                const { reverseDeliveryEarning } = await import('../wallet/riderEarnings.service.js');
                await reverseDeliveryEarning({
                    orderId: order._id,
                    reason: `Order refunded (${refund.refundNumber}).`,
                    adminId: refund.initiatedBy || null,
                });
                await mark('riderEarning', { status: 'done', ref: String(order.deliveryBoyId) });
            } else {
                await mark('riderEarning', { status: 'skipped', ref: 'no delivered rider earning' });
            }
        } catch (err) {
            await mark('riderEarning', { status: 'failed', error: String(err?.message || err).slice(0, 300) });
        }
    }

    // 5c. COD cash ledger ---------------------------------------------------
    if (refund.reversals?.codLedger?.status !== 'done') {
        try {
            const isCod = ['cod', 'cash'].includes(String(order.paymentMethod || '').toLowerCase());
            if (isCod && order.deliveryBoyId && order.status === 'delivered') {
                // The rider collected cash for an order that is being refunded;
                // the platform's claim on that cash is reduced accordingly.
                const { postCashAdjustment } = await import('../deliveryCash.service.js');
                await postCashAdjustment({
                    deliveryBoyId: order.deliveryBoyId,
                    amount: -Math.abs(refund.amount),
                    reason: `Refund ${refund.refundNumber} for order ${order.orderId}`,
                    adminId: refund.initiatedBy || null,
                });
                await mark('codLedger', { status: 'done', ref: String(order.deliveryBoyId) });
            } else {
                await mark('codLedger', { status: 'skipped', ref: 'not a delivered COD order' });
            }
        } catch (err) {
            await mark('codLedger', { status: 'failed', error: String(err?.message || err).slice(0, 300) });
        }
    }

    // 5d. Order refund totals ------------------------------------------------
    try {
        const succeeded = await Refund.aggregate([
            { $match: { orderId: order._id, status: { $in: ['succeeded', 'manual_settled'] } } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);
        const refundedTotal = roundMoney(succeeded[0]?.total || 0);
        const orderTotal = roundMoney(order.total || 0);

        order.refundedAmount = refundedTotal;
        // Derived, never set directly — this is what let a flag claim a refund
        // that had not happened.
        if (refundedTotal <= 0) {
            // leave as-is
        } else if (refundedTotal + 0.01 >= orderTotal) {
            order.paymentStatus = 'refunded';
        } else {
            order.paymentStatus = 'partially_refunded';
        }
        await order.save();
    } catch (err) {
        console.error(`[Refund] Failed to update order totals for ${refund.refundNumber}: ${err?.message}`);
    }

    const finalRefund = await Refund.findById(refund._id).lean();
    const failedReversals = Object.entries(finalRefund.reversals || {})
        .filter(([, v]) => v?.status === 'failed')
        .map(([k]) => k);

    if (failedReversals.length > 0) {
        await notifyAdmins({
            anchorId: refund._id,
            title: 'Refund reversal incomplete',
            message:
                `Refund ${finalRefund.refundNumber} paid the customer but these reversals failed: `
                + `${failedReversals.join(', ')}. The platform is still paying out on refunded revenue.`,
            type: 'refund',
            category: 'ERROR',
            priority: 'CRITICAL',
            actionUrl: '/admin/finance/refunds',
        }).catch(() => null);
    }

    return finalRefund;
};

// ── Notifications ─────────────────────────────────────────────────────────────

const notifyCustomerRefundSettled = async (refund) => {
    if (!refund.userId) return;
    await createNotification({
        recipientId: refund.userId,
        recipientType: 'user',
        title: 'Refund completed',
        message:
            `Your refund of ₹${roundMoney(refund.amount).toFixed(2)} for order ${refund.orderNumber} has been processed. `
            + 'It may take 5–7 business days to appear on your statement.',
        type: 'refund',
        category: 'REFUND',
        data: { refundNumber: refund.refundNumber, orderId: String(refund.orderNumber || '') },
    });
};

export const notifyCustomerRefundInitiated = async (refund) => {
    if (!refund.userId) return;
    await createNotification({
        recipientId: refund.userId,
        recipientType: 'user',
        title: 'Refund initiated',
        // Deliberately does not say the money has arrived. The previous flows
        // claimed completion at the moment a flag was set.
        message:
            `A refund of ₹${roundMoney(refund.amount).toFixed(2)} for order ${refund.orderNumber} has been initiated `
            + 'and is being processed.',
        type: 'refund',
        category: 'REFUND',
        data: { refundNumber: refund.refundNumber, orderId: String(refund.orderNumber || '') },
    });
};

/**
 * Convenience used by the return / override flows: record the refund and, when
 * execution is enabled, immediately attempt it. Never throws into the caller's
 * transaction — a refund failure must not roll back the return it belongs to.
 */
export const requestAndTryExecute = async (params) => {
    const { refund, created } = await requestRefund(params);
    if (created) await notifyCustomerRefundInitiated(refund).catch(() => null);

    const policy = await getRefundPolicy();
    if (policy.executionEnabled && refund.status === 'requested' && refund.method === 'gateway') {
        try {
            return await executeRefund(refund._id);
        } catch (err) {
            console.error(`[Refund] Execution failed for ${refund.refundNumber}: ${err?.message}`);
        }
    }
    return refund;
};
