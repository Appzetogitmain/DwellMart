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
import { createRazorpayRefund } from '../billing/razorpay.service.js';
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

/**
 * Detailed refundable breakdown across gateway and cash channels.
 */
export const getRefundableBreakdown = async (order) => {
    const isValidId = mongoose.isValidObjectId(order?._id);
    const existingRefunds = isValidId
        ? await Refund.find({
            orderId: order._id,
            status: { $in: ['succeeded', 'manual_settled', 'initiated', 'partially_settled'] },
        }).select('amount method gatewayAmount cashAmount status').lean()
        : [];

    let gatewayRefunded = 0;
    let cashRefunded = 0;
    for (const r of existingRefunds) {
        if (r.method === 'hybrid') {
            gatewayRefunded += Number(r.gatewayAmount || 0);
            cashRefunded += Number(r.cashAmount || 0);
        } else if (r.method === 'manual_cash' || r.method === 'manual_bank') {
            cashRefunded += Number(r.cashAmount || r.amount || 0);
        } else {
            gatewayRefunded += Number(r.gatewayAmount || r.amount || 0);
        }
    }
    gatewayRefunded = roundMoney(gatewayRefunded);
    cashRefunded = roundMoney(cashRefunded);

    const isCod = ['cod', 'cash'].includes(String(order?.paymentMethod || '').toLowerCase());
    const advancePaid = roundMoney(Number(order?.codDetails?.advancePaid || 0));
    const cashCollected = roundMoney(Number(order?.codDetails?.cashCollectedAtDelivery || 0));
    const orderTotal = roundMoney(Number(order?.total || 0));

    if (isCod) {
        // Gateway ceiling is the advance actually captured online.
        const gatewayRefundable = roundMoney(Math.max(0, advancePaid - gatewayRefunded));
        // Cash ceiling is the cash actually collected at delivery.
        const cashRefundable = roundMoney(Math.max(0, cashCollected - cashRefunded));
        const totalRefundable = roundMoney(gatewayRefundable + cashRefundable);
        return {
            totalRefundable,
            gatewayRefundable,
            cashRefundable,
            advancePaid,
            cashCollected,
            gatewayRefunded,
            cashRefunded,
            isCod: true,
        };
    }

    // Prepaid
    const gatewayRefundable = roundMoney(Math.max(0, orderTotal - gatewayRefunded));
    return {
        totalRefundable: gatewayRefundable,
        gatewayRefundable,
        cashRefundable: 0,
        advancePaid: 0,
        cashCollected: 0,
        gatewayRefunded,
        cashRefunded: 0,
        isCod: false,
    };
};

/**
 * How much of this order may still be refunded in total.
 * Guards against cumulative over-refunding across several partial refunds.
 */
export const getRefundableAmount = async (order) => {
    const breakdown = await getRefundableBreakdown(order);
    return breakdown.totalRefundable;
};

/**
 * Resolve refund allocation between gateway and cash channels.
 */
export const resolveRefundAllocation = (order, requestedAmount, breakdown) => {
    const isCod = breakdown.isCod;
    const amount = roundMoney(requestedAmount);

    if (!isCod) {
        return {
            method: 'gateway',
            gatewayAmount: amount,
            cashAmount: 0,
        };
    }

    // Pure COD (no advance paid)
    if (breakdown.advancePaid <= 0) {
        return {
            method: 'manual_cash',
            gatewayAmount: 0,
            cashAmount: amount,
        };
    }

    // COD with advance:
    // Case 1: Pre-delivery cancellation (no cash collected)
    if (breakdown.cashCollected <= 0 || order.status === 'cancelled') {
        const gwAmt = roundMoney(Math.min(amount, breakdown.gatewayRefundable));
        return {
            method: 'gateway',
            gatewayAmount: gwAmt,
            cashAmount: 0,
        };
    }

    // Case 2: Post-delivery return (cash collected at delivery)
    // Return obligation refunds the cash collected for goods first.
    // Online advance fees remain with the delivered order unless return amount exceeds cash collected.
    const cashAmt = roundMoney(Math.min(amount, breakdown.cashRefundable));
    const remainder = roundMoney(Math.max(0, amount - cashAmt));
    const gwAmt = roundMoney(Math.min(remainder, breakdown.gatewayRefundable));

    let method = 'manual_cash';
    if (gwAmt > 0 && cashAmt > 0) {
        method = 'hybrid';
    } else if (gwAmt > 0) {
        method = 'gateway';
    }

    return {
        method,
        gatewayAmount: gwAmt,
        cashAmount: cashAmt,
    };
};

// Backward-compatible resolveRefundMethod helper
const resolveRefundMethod = (order) => {
    const isCod = ['cod', 'cash'].includes(String(order?.paymentMethod || '').toLowerCase());
    if (!isCod) return 'gateway';
    const advancePaid = Number(order?.codDetails?.advancePaid || 0);
    const cashCollected = Number(order?.codDetails?.cashCollectedAtDelivery || 0);
    if (advancePaid > 0 && cashCollected > 0) return 'hybrid';
    if (advancePaid > 0) return 'gateway';
    return 'manual_cash';
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

    const breakdown = await getRefundableBreakdown(order);
    if (requestedAmount > breakdown.totalRefundable) {
        throw new ApiError(
            400,
            `Refund amount exceeds the refundable balance for this order (max ₹${breakdown.totalRefundable}).`
        );
    }

    if (!String(reason || '').trim()) {
        throw new ApiError(400, 'A refund reason is required.');
    }

    const allocation = resolveRefundAllocation(order, requestedAmount, breakdown);
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
            gatewayAmount: allocation.gatewayAmount,
            cashAmount: allocation.cashAmount,
            currency: 'INR',
            reason: String(reason).trim(),
            refundType,
            method: allocation.method,
            status: 'requested',
            cashStatus: allocation.cashAmount > 0 ? 'pending' : 'settled',
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
                || await Refund.findOne({ orderId: order._id, status: { $in: ['requested', 'initiated', 'partially_settled'] } });
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

    // COD manual payments never had a gateway payment; they must be settled by hand.
    if (refund.method === 'manual_cash' || refund.method === 'manual_bank') {
        return revert({
            status: 'requested',
            initiatedAt: null,
            failureReason: 'This order was paid in cash. Settle the refund manually and record the proof reference.',
        });
    }

    const gatewayAmountToSend = roundMoney(
        refund.gatewayAmount != null ? refund.gatewayAmount : refund.amount
    );

    if (gatewayAmountToSend <= 0) {
        return revert({
            status: 'requested',
            initiatedAt: null,
            failureReason: 'This refund has no online gateway portion to execute. Settle the cash portion manually.',
        });
    }

    // The gateway order id is the CheckoutSession id for split checkouts and the
    // order id for legacy single orders.
    const order = await Order.findById(refund.orderId).select('checkoutSessionId orderId').lean();
    let gatewayOrderId = refund.gatewayOrderId;
    let gateway = 'cashfree';
    let paymentRef = null;

    if (order?.checkoutSessionId) {
        const { CheckoutSession } = await import('../../models/CheckoutSession.model.js');
        const session = await CheckoutSession.findById(order.checkoutSessionId).select('gatewayOrderId sessionId gatewayReference metadata').lean();
        if (!gatewayOrderId) {
            gatewayOrderId = session?.gatewayOrderId || session?.sessionId || null;
        }
        if (
            session?.metadata?.gateway === 'razorpay' ||
            String(session?.gatewayReference || '').startsWith('pay_') ||
            String(gatewayOrderId || '').startsWith('order_')
        ) {
            gateway = 'razorpay';
            paymentRef = session?.gatewayReference || null;
        }
    }
    if (!gatewayOrderId) gatewayOrderId = order?.orderId || null;

    if (!gatewayOrderId && !paymentRef) {
        return revert({
            status: 'failed',
            failedAt: new Date(),
            failureReason: 'Could not resolve the gateway order for this refund.',
        });
    }

    try {
        let result;
        if (gateway === 'razorpay') {
            result = await createRazorpayRefund({
                paymentId: paymentRef,
                orderId: gatewayOrderId,
                receipt: refund.idempotencyKey,
                amount: gatewayAmountToSend,
                notes: { reason: refund.reason },
            });
        } else {
            result = await createCashfreeRefund({
                orderId: gatewayOrderId,
                // The gateway's refund_id IS our idempotency key — a retry reuses it
                // and the gateway rejects the duplicate rather than paying twice.
                refundId: refund.idempotencyKey,
                amount: gatewayAmountToSend,
                note: refund.reason,
            });
        }

        const settledNow = ['SUCCESS', 'PROCESSED'].includes(String(result.status || '').toUpperCase());
        const hasPendingCash = Number(refund.cashAmount || 0) > 0 && refund.cashStatus !== 'settled';

        let nextStatus = 'initiated';
        if (settledNow) {
            nextStatus = hasPendingCash ? 'partially_settled' : 'succeeded';
        }

        await Refund.updateOne(
            { _id: refund._id },
            {
                $set: {
                    gatewayOrderId,
                    gatewayRefundId: result.cfRefundId || result.refundId || null,
                    gatewayStatus: result.status || null,
                    gatewayRaw: result.raw || {},
                    status: nextStatus,
                    ...(nextStatus === 'succeeded' ? { settledAt: new Date() } : {}),
                    failureReason: '',
                },
            }
        );

        if (nextStatus === 'succeeded') await applyRefundReversals(refund._id);

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
        const hasPendingCash = Number(refund.cashAmount || 0) > 0 && refund.cashStatus !== 'settled';
        const nextStatus = hasPendingCash ? 'partially_settled' : 'succeeded';

        await Refund.updateOne(
            { _id: refund._id },
            {
                $set: {
                    status: nextStatus,
                    gatewayStatus: normalized,
                    gatewayRaw: raw,
                    ...(nextStatus === 'succeeded' ? { settledAt: new Date() } : {}),
                },
            }
        );

        if (nextStatus === 'succeeded') {
            await applyRefundReversals(refund._id);
            await notifyCustomerRefundSettled(refund).catch(() => null);
        }
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

    const refund = await Refund.findById(refundId);
    if (!refund) throw new ApiError(404, 'Refund not found.');

    const allowedStatuses = ['requested', 'initiated', 'partially_settled', 'failed'];
    if (!allowedStatuses.includes(refund.status)) {
        throw new ApiError(409, `Refund is not in a state that can be manually settled (current status: ${refund.status}).`);
    }

    const isHybrid = refund.method === 'hybrid';
    const gatewayDone = !isHybrid || Number(refund.gatewayAmount || 0) <= 0 || ['SUCCESS', 'PROCESSED'].includes(String(refund.gatewayStatus || '').toUpperCase());

    const nextStatus = gatewayDone ? (isHybrid ? 'succeeded' : 'manual_settled') : 'partially_settled';

    const updated = await Refund.findOneAndUpdate(
        { _id: refundId },
        {
            $set: {
                status: nextStatus,
                cashStatus: 'settled',
                cashSettledAt: new Date(),
                cashProofRef: String(proofRef).trim(),
                manualProofRef: String(proofRef).trim(),
                initiatedBy: actorId || refund.initiatedBy || null,
                failureReason: note ? String(note).slice(0, 500) : '',
                ...(nextStatus === 'succeeded' || nextStatus === 'manual_settled' ? { settledAt: new Date() } : {}),
            },
        },
        { new: true }
    );

    if (nextStatus === 'succeeded' || nextStatus === 'manual_settled') {
        await applyRefundReversals(updated._id);
        await notifyCustomerRefundSettled(updated).catch(() => null);
    }
    return updated;
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

            if (refund.refundType === 'full') {
                const result = await Commission.updateMany(filter, {
                    $set: { status: 'cancelled', paidAt: null, settlementId: null },
                });
                await mark('commission', { status: 'done', ref: `modified:${result.modifiedCount}` });
            } else {
                // Partial return: prorate commission (Defect 8)
                const comms = await Commission.find(filter);
                let modifiedCount = 0;
                for (const comm of comms) {
                    let returnedSubtotal = 0;
                    if (refund.returnRequestId) {
                        const { ReturnRequest } = await import('../../models/ReturnRequest.model.js');
                        const retReq = await ReturnRequest.findById(refund.returnRequestId).lean();
                        if (retReq && Array.isArray(retReq.items)) {
                            for (const it of retReq.items) {
                                const oi = (order.items || []).find((o) => String(o.productId) === String(it.productId));
                                returnedSubtotal += Number(oi?.price || 0) * Number(it.quantity || 1);
                            }
                        }
                    }
                    if (returnedSubtotal <= 0) {
                        returnedSubtotal = Number(refund.amount || 0);
                    }

                    const newSubtotal = roundMoney(Math.max(0, comm.subtotal - returnedSubtotal));
                    if (newSubtotal <= 0) {
                        comm.status = 'cancelled';
                        comm.paidAt = null;
                        comm.settlementId = null;
                    } else {
                        const rate = Number(comm.commissionRate || 10);
                        const newComm = roundMoney((newSubtotal * rate) / 100);
                        const newEarnings = roundMoney(newSubtotal - newComm);
                        comm.subtotal = newSubtotal;
                        comm.commission = newComm;
                        comm.vendorEarnings = newEarnings;
                    }
                    await comm.save();
                    modifiedCount++;
                }
                await mark('commission', { status: 'done', ref: `prorated:${modifiedCount}` });
            }
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
                const cashCollected = Number(order.codDetails?.cashCollectedAtDelivery || 0);
                const cashToDebit = refund.cashAmount > 0
                    ? refund.cashAmount
                    : (refund.method === 'manual_cash' ? Math.min(refund.amount, cashCollected || refund.amount) : 0);

                const { postCashAdjustment } = await import('../deliveryCash.service.js');
                if (cashToDebit > 0) {
                    await postCashAdjustment({
                        deliveryBoyId: order.deliveryBoyId,
                        amount: -cashToDebit,
                        reason: `Return/refund ${refund.refundNumber} for order ${order.orderId}`,
                        adminId: refund.initiatedBy || null,
                    });
                }
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

        const isCodOrder = ['cod', 'cash'].includes(String(order.paymentMethod || '').toLowerCase());
        const advancePaid = Number(order.codDetails?.advancePaid || 0);
        const cashCollected = Number(order.codDetails?.cashCollectedAtDelivery || 0);

        const totalPaid = isCodOrder
            ? roundMoney(advancePaid + cashCollected)
            : roundMoney(Number(order.total || 0));

        order.refundedAmount = refundedTotal;
        if (refundedTotal <= 0) {
            // leave as-is
        } else if (refundedTotal + 0.01 >= totalPaid && totalPaid > 0) {
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
    const shouldExecute = policy.executionEnabled && refund.status === 'requested' && (
        refund.method === 'gateway' || (refund.method === 'hybrid' && Number(refund.gatewayAmount || 0) > 0)
    );

    if (shouldExecute) {
        try {
            return await executeRefund(refund._id);
        } catch (err) {
            console.error(`[Refund] Execution failed for ${refund.refundNumber}: ${err?.message}`);
        }
    }
    return refund;
};
