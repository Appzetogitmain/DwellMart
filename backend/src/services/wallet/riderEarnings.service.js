/**
 * riderEarnings.service
 *
 * Credits a delivery partner for a completed delivery.
 *
 * Trigger contract — the three rules the audit called out, enforced here:
 *   • ONLY after a delivery reaches a terminal delivered state.
 *   • NEVER before delivery (no accrual on assignment, pickup, or in transit).
 *   • NEVER twice, guaranteed by the unique partial index
 *     `unique_delivery_earning_per_order`, not by an application-level check
 *     that two concurrent callers could both pass.
 *
 * Maturity: an earning lands PENDING and matures once the order's own return
 * window has closed. Paying before a return can still be raised means clawing
 * back money the rider may already have withdrawn.
 */

import mongoose from 'mongoose';
import Order from '../../models/Order.model.js';
import DeliveryBoy from '../../models/DeliveryBoy.model.js';
import RiderWalletTransaction from '../../models/RiderWalletTransaction.model.js';
import { postTransaction } from './riderWallet.service.js';
import { resolveRateCard, computeDeliveryEarning } from './riderRateCard.service.js';
import { createNotification, notifyAdmins } from '../notification.service.js';
import { EXPERIENCES } from '../../constants/experiences.js';
import { roundMoney } from '../PriceReconciliationService.js';

/** Job type used by the persistent retry queue for earning replays. */
export const RIDER_EARNING_JOB = 'riderWallet.accrueDeliveryEarning';

/** Fallback maturity windows, used only when the order carries no return policy. */
const DEFAULT_MATURITY_HOURS = {
    [EXPERIENCES.QUICK_COMMERCE]: 24,
    [EXPERIENCES.MARKETPLACE]: 168,
};

/**
 * When does this earning become withdrawable?
 *
 * Anchored to the order's own `returnPolicy.windowHours`, which the checkout
 * path already sets to 24h for Quick Commerce and 168h for the Marketplace, so
 * the wallet inherits the return window rather than duplicating the rule.
 */
export const resolveMaturityDate = (order, from = new Date()) => {
    const explicitHours = Number(order?.returnPolicy?.windowHours);
    const experience = String(order?.experience || EXPERIENCES.MARKETPLACE);
    const hours = Number.isFinite(explicitHours) && explicitHours >= 0
        ? explicitHours
        : (DEFAULT_MATURITY_HOURS[experience] ?? DEFAULT_MATURITY_HOURS[EXPERIENCES.MARKETPLACE]);

    return new Date(from.getTime() + hours * 60 * 60 * 1000);
};

/** Distance actually travelled, where the order records it. */
const resolveDistanceKm = (order) => {
    const qcDistance = Number(order?.quickCommerce?.deliveryDistanceKm);
    if (Number.isFinite(qcDistance) && qcDistance > 0) return qcDistance;
    return 0;
};

/** City used for city-scoped rate card resolution. */
const resolveCity = (order) => String(order?.shippingAddress?.city || '').trim();

/**
 * Accrue the delivery earning for one order.
 *
 * Idempotent: a second call for the same order is a no-op that returns the
 * existing transaction. Safe to call from a retry.
 *
 * @param {object} params
 * @param {object} params.order            Order document or lean object.
 * @param {string} [params.deliveryBoyId]  Defaults to order.deliveryBoyId.
 * @returns {Promise<object|null>} the earning transaction, or null when skipped
 */
export const accrueDeliveryEarning = async ({ order, deliveryBoyId = null }) => {
    if (!order?._id) return null;

    const riderId = deliveryBoyId || order.deliveryBoyId;
    if (!riderId || !mongoose.isValidObjectId(riderId)) return null;

    // Guard the trigger contract at the service boundary, so a future caller
    // cannot accrue from a non-terminal state by mistake.
    const isDelivered = String(order.status || '').toLowerCase() === 'delivered'
        || String(order.quickCommerce?.status || '').toLowerCase() === 'delivered';
    if (!isDelivered) return null;

    // Fast path: already accrued. The unique index is the real guarantee; this
    // just avoids the rate-card work on the common replay.
    const existing = await RiderWalletTransaction.findOne({
        orderId: order._id,
        type: 'DELIVERY_EARNING',
    }).lean();
    if (existing) return existing;

    const experience = String(order.experience || EXPERIENCES.MARKETPLACE);
    const isCod = ['cod', 'cash'].includes(String(order.paymentMethod || '').toLowerCase());

    const card = await resolveRateCard({
        deliveryBoyId: riderId,
        city: resolveCity(order),
        experience,
    });

    if (!card) {
        // No configured rate means no defensible amount to pay. Refusing to
        // invent one is the point; the delivery is flagged for an admin so the
        // rider is not quietly under-paid.
        console.warn(
            `[RiderEarnings] No active rate card for order ${order.orderId || order._id} `
            + `(experience=${experience}). Earning not accrued.`
        );
        notifyAdmins({
            anchorId: order._id,
            title: 'Rider earning skipped — no rate card',
            message: `Order ${order.orderId || order._id} was delivered but no active rider rate card matched (experience: ${experience}). Configure a rate card and replay the earning.`,
            category: 'WARNING',
            priority: 'HIGH',
            data: { orderId: String(order.orderId || order._id), experience },
        }).catch(() => null);
        return null;
    }

    const { amount, breakdown } = computeDeliveryEarning({
        card,
        distanceKm: resolveDistanceKm(order),
        isCod,
        experience,
        completedAt: order.deliveredAt || new Date(),
    });

    if (!(amount > 0)) {
        console.warn(`[RiderEarnings] Rate card "${card.name}" produced a zero earning for order ${order.orderId || order._id}.`);
        return null;
    }

    const maturesAt = resolveMaturityDate(order, order.deliveredAt || new Date());

    try {
        const { transaction } = await postTransaction({
            deliveryBoyId: riderId,
            amount,
            type: 'DELIVERY_EARNING',
            state: 'PENDING',
            orderId: order._id,
            earningBreakdown: breakdown,
            maturesAt,
            description: `Delivery earning for order ${order.orderId || order._id}`,
            createdByType: 'system',
        });

        createNotification({
            recipientId: riderId,
            recipientType: 'delivery',
            title: 'Delivery Earning Credited',
            message: `₹${roundMoney(amount).toFixed(2)} has been credited for order ${order.orderId || order._id}. It becomes withdrawable on ${maturesAt.toLocaleDateString('en-IN')}.`,
            type: 'payment',
            category: 'PAYMENT',
            priority: 'NORMAL',
            actionUrl: '/delivery/wallet',
            actionType: 'rider_wallet',
            data: {
                transactionId: String(transaction._id),
                orderId: String(order.orderId || order._id),
                amount: String(roundMoney(amount)),
                maturesAt: maturesAt.toISOString(),
            },
        }).catch(() => null);

        return transaction;
    } catch (err) {
        // A concurrent accrual won the unique index — return its row.
        if (err?.code === 11000) {
            return RiderWalletTransaction.findOne({ orderId: order._id, type: 'DELIVERY_EARNING' }).lean();
        }
        throw err;
    }
};

/**
 * Durable wrapper. Delivery completion must never fail because bookkeeping did,
 * so failures are queued for replay rather than thrown at the rider's request.
 */
export const accrueDeliveryEarningDurable = async ({ order, deliveryBoyId = null }) => {
    try {
        return await accrueDeliveryEarning({ order, deliveryBoyId });
    } catch (err) {
        console.error(
            `[RiderEarnings] Accrual failed for order ${order?.orderId || order?._id}: ${err?.message}`
        );
        const { enqueue } = await import('../events/RetryQueueService.js');
        await enqueue(RIDER_EARNING_JOB, {
            orderId: String(order?._id || ''),
            deliveryBoyId: String(deliveryBoyId || order?.deliveryBoyId || ''),
        }).catch(() => null);
        return null;
    }
};

/** Retry handler — re-reads the order so it always acts on current state. */
export const handleRiderEarningRetry = async (payload = {}) => {
    const { orderId, deliveryBoyId } = payload;
    if (!orderId || !mongoose.isValidObjectId(orderId)) return;

    const order = await Order.findById(orderId).lean();
    if (!order) return;

    await accrueDeliveryEarning({ order, deliveryBoyId: deliveryBoyId || order.deliveryBoyId });
};

/**
 * Reverse a delivery earning — used when a delivered order is later cancelled
 * or fully refunded.
 *
 * The original row is never edited. A REVERSAL is posted against it, and the
 * rider's balance is allowed to go negative if the earning had already matured
 * or been withdrawn. That negative is the true position and nets against future
 * earnings; clamping it would silently absorb an over-payment.
 */
export const reverseDeliveryEarning = async ({ orderId, reason, adminId = null }) => {
    if (!orderId || !mongoose.isValidObjectId(orderId)) return null;

    // Look the earning up regardless of state. Filtering out REVERSED here
    // would make the idempotency check below unreachable, so a second reversal
    // call would report "no earning found" instead of returning the reversal it
    // already wrote.
    const earning = await RiderWalletTransaction.findOne({
        orderId,
        type: 'DELIVERY_EARNING',
    });
    if (!earning) return null;

    const alreadyReversed = await RiderWalletTransaction.findOne({
        reversalOf: earning._id,
        type: 'REVERSAL',
    }).lean();
    if (alreadyReversed) return alreadyReversed;

    const session = await mongoose.startSession();
    try {
        let reversal = null;
        await session.withTransaction(async () => {
            // A still-PENDING earning is offset inside PENDING; a matured one is
            // offset from AVAILABLE, which may legitimately go negative.
            const targetState = earning.state === 'PENDING' ? 'PENDING' : 'AVAILABLE';

            // The offsetting entry is the ONLY thing written. The original row's
            // state is deliberately left alone: flipping it to REVERSED would
            // also remove its amount from the derived balance, double-counting
            // the reversal against the projection's single decrement. The
            // `reversalOf` link is what records that the earning was undone.
            const { transaction } = await postTransaction({
                deliveryBoyId: earning.deliveryBoyId,
                amount: earning.amount,
                type: 'REVERSAL',
                state: targetState,
                orderId: earning.orderId,
                reversalOf: earning._id,
                description: `Reversal of delivery earning for order ${orderId}`,
                notes: String(reason || '').trim(),
                createdBy: adminId,
                createdByType: adminId ? 'admin' : 'system',
                session,
            });
            reversal = transaction;
        });

        createNotification({
            recipientId: earning.deliveryBoyId,
            recipientType: 'delivery',
            title: 'Delivery Earning Reversed',
            message: `The ₹${roundMoney(earning.amount).toFixed(2)} earning for a delivered order was reversed. Reason: ${String(reason || 'Order cancelled or refunded.')}`,
            type: 'payment',
            category: 'PAYMENT',
            priority: 'HIGH',
            actionUrl: '/delivery/wallet',
            data: { orderId: String(orderId), amount: String(roundMoney(earning.amount)) },
        }).catch(() => null);

        return reversal;
    } finally {
        await session.endSession();
    }
};

/**
 * Total earnings actually credited to a rider, from the ledger.
 *
 * Replaces the previous `SUM(order.shipping)` figure, which reported the
 * customer's shipping fee — vendor or platform revenue — as rider earnings.
 */
export const getRiderLedgerEarnings = async (deliveryBoyId) => {
    if (!deliveryBoyId || !mongoose.isValidObjectId(deliveryBoyId)) {
        return { totalEarned: 0, totalPaidOut: 0 };
    }

    const rows = await RiderWalletTransaction.aggregate([
        { $match: { deliveryBoyId: new mongoose.Types.ObjectId(String(deliveryBoyId)) } },
        {
            $group: {
                _id: null,
                totalEarned: {
                    $sum: {
                        $cond: [
                            { $in: ['$type', ['DELIVERY_EARNING', 'INCENTIVE', 'SURGE', 'TIP']] },
                            '$amount',
                            0,
                        ],
                    },
                },
                totalReversed: {
                    $sum: { $cond: [{ $eq: ['$type', 'REVERSAL'] }, '$amount', 0] },
                },
                totalPaidOut: {
                    $sum: { $cond: [{ $eq: ['$type', 'WITHDRAWAL_PAID'] }, '$amount', 0] },
                },
            },
        },
    ]);

    const row = rows?.[0] || {};
    return {
        totalEarned: roundMoney(Number(row.totalEarned || 0) - Number(row.totalReversed || 0)),
        totalPaidOut: roundMoney(row.totalPaidOut || 0),
    };
};

/** Batch variant for admin list screens — one aggregation for many riders. */
export const getRiderLedgerEarningsBulk = async (deliveryBoyIds = []) => {
    const validIds = [...new Set(
        (deliveryBoyIds || []).filter((id) => id && mongoose.isValidObjectId(id)).map(String)
    )];
    const map = new Map(validIds.map((id) => [id, { totalEarned: 0, totalPaidOut: 0 }]));
    if (validIds.length === 0) return map;

    const rows = await RiderWalletTransaction.aggregate([
        { $match: { deliveryBoyId: { $in: validIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
        {
            $group: {
                _id: '$deliveryBoyId',
                totalEarned: {
                    $sum: {
                        $cond: [
                            { $in: ['$type', ['DELIVERY_EARNING', 'INCENTIVE', 'SURGE', 'TIP']] },
                            '$amount',
                            0,
                        ],
                    },
                },
                totalReversed: { $sum: { $cond: [{ $eq: ['$type', 'REVERSAL'] }, '$amount', 0] } },
                totalPaidOut: { $sum: { $cond: [{ $eq: ['$type', 'WITHDRAWAL_PAID'] }, '$amount', 0] } },
            },
        },
    ]);

    rows.forEach((row) => {
        map.set(String(row._id), {
            totalEarned: roundMoney(Number(row.totalEarned || 0) - Number(row.totalReversed || 0)),
            totalPaidOut: roundMoney(row.totalPaidOut || 0),
        });
    });

    return map;
};
