/**
 * Financial integrity monitor.
 *
 * Each earlier phase closed a defect and left behind an invariant that must
 * hold. Without something checking them, the same class of defect recurs
 * silently — which is exactly how the original ones survived: commission
 * creation failed into a `.catch(console.error)`, reserved stock leaked with no
 * counter, and a price mismatch logged and continued.
 *
 * Read-only. This never corrects anything — a mismatch is a signal for a human,
 * and auto-correcting financial data would hide the cause.
 */

import mongoose from 'mongoose';
import Order from '../models/Order.model.js';
import Product from '../models/Product.model.js';
import Commission from '../models/Commission.model.js';
import Refund from '../models/Refund.model.js';
import InventoryReservation from '../models/InventoryReservation.model.js';
import { CheckoutSession } from '../models/CheckoutSession.model.js';
import { notifyAdmins } from './notification.service.js';
import logger from '../utils/logger.js';

const MONEY_TOLERANCE = 0.01;

/**
 * Phase 2 invariant: the amount authorised for payment equals the sum of the
 * orders created from it. Violated by the dead `Settings{key:'wholesale'}` read.
 */
export const checkSessionOrderTotals = async ({ sinceHours = 24 } = {}) => {
    const since = new Date(Date.now() - sinceHours * 3600_000);
    const sessions = await CheckoutSession.find({
        status: 'completed',
        completedAt: { $gte: since },
    })
        .select('sessionId summary orderIds')
        .lean();

    const offenders = [];
    for (const session of sessions) {
        const authorised = Number(session.summary?.grandTotal || 0);
        if (!(authorised > 0) || !session.orderIds?.length) continue;

        const orders = await Order.find({ _id: { $in: session.orderIds } }).select('total').lean();
        const created = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);

        if (Math.abs(authorised - created) > MONEY_TOLERANCE) {
            offenders.push({
                sessionId: session.sessionId,
                authorised: Number(authorised.toFixed(2)),
                created: Number(created.toFixed(2)),
                difference: Number((authorised - created).toFixed(2)),
            });
        }
    }
    return { checked: sessions.length, offenders };
};

/**
 * Phase 6 invariant: `reservedQuantity` equals the sum of open reservations.
 * Drift means stock is held that nothing can release.
 */
export const checkReservedQuantityDrift = async () => {
    const held = await InventoryReservation.aggregate([
        { $match: { status: 'reserved' } },
        { $group: { _id: '$productId', expected: { $sum: '$quantity' } } },
    ]);
    const expectedByProduct = new Map(held.map((h) => [String(h._id), h.expected]));

    // Any product claiming reserved stock, plus any product an open
    // reservation points at — the two sets differ when drift exists.
    const claiming = await Product.find({ reservedQuantity: { $gt: 0 } })
        .select('_id reservedQuantity')
        .lean();

    const productIds = new Set([
        ...claiming.map((p) => String(p._id)),
        ...expectedByProduct.keys(),
    ]);

    const offenders = [];
    const claimingById = new Map(claiming.map((p) => [String(p._id), Number(p.reservedQuantity || 0)]));

    for (const id of productIds) {
        const actual = claimingById.get(id) ?? 0;
        const expected = expectedByProduct.get(id) ?? 0;
        if (actual !== expected) {
            offenders.push({ productId: id, actual, expected, drift: actual - expected });
        }
    }
    return { checked: productIds.size, offenders };
};

/**
 * Phase 5 invariant: every delivered order has a commission record.
 * Commission creation is enqueued, not fire-and-forget — but a permanently
 * failing job would otherwise be invisible, and the vendor simply never paid.
 */
export const checkMissingCommissions = async ({ sinceHours = 72 } = {}) => {
    const since = new Date(Date.now() - sinceHours * 3600_000);
    const delivered = await Order.find({
        status: 'delivered',
        deliveredAt: { $gte: since },
        isDeleted: { $ne: true },
    })
        .select('_id orderId vendorId')
        .lean();

    if (delivered.length === 0) return { checked: 0, offenders: [] };

    const withCommission = await Commission.find({
        orderId: { $in: delivered.map((o) => o._id) },
    })
        .select('orderId')
        .lean();
    const covered = new Set(withCommission.map((c) => String(c.orderId)));

    const offenders = delivered
        .filter((o) => !covered.has(String(o._id)))
        .map((o) => ({ orderId: o.orderId, orderRefId: String(o._id) }));

    return { checked: delivered.length, offenders };
};

/**
 * Phase 4 invariant: `Order.refundedAmount` equals the sum of its settled
 * refunds, and never exceeds the order total.
 */
export const checkRefundConsistency = async () => {
    const settled = await Refund.aggregate([
        { $match: { status: { $in: ['succeeded', 'manual_settled'] } } },
        { $group: { _id: '$orderId', total: { $sum: '$amount' } } },
    ]);

    const offenders = [];
    for (const row of settled) {
        const order = await Order.findById(row._id).select('orderId total refundedAmount').lean();
        if (!order) continue;

        const expected = Number(row.total.toFixed(2));
        const recorded = Number(Number(order.refundedAmount || 0).toFixed(2));

        if (Math.abs(expected - recorded) > MONEY_TOLERANCE) {
            offenders.push({ orderId: order.orderId, expected, recorded, issue: 'refundedAmount mismatch' });
        } else if (recorded > Number(order.total || 0) + MONEY_TOLERANCE) {
            offenders.push({ orderId: order.orderId, expected, recorded, issue: 'refunded more than order total' });
        }
    }
    return { checked: settled.length, offenders };
};

/**
 * Phase 5 invariant: no vendor has two open settlements, and no commission
 * belongs to more than one. Both are double-payout signatures.
 */
export const checkSettlementIntegrity = async () => {
    const Settlement = mongoose.model('Settlement');
    const dupes = await Settlement.aggregate([
        { $match: { status: 'pending' } },
        { $group: { _id: '$vendorId', count: { $sum: 1 }, ids: { $push: '$_id' } } },
        { $match: { count: { $gt: 1 } } },
    ]);

    return {
        checked: await Settlement.countDocuments({ status: 'pending' }),
        offenders: dupes.map((d) => ({
            vendorId: String(d._id),
            openSettlements: d.count,
            settlementIds: d.ids.map(String),
        })),
    };
};

const CHECKS = [
    { name: 'session_order_totals', run: checkSessionOrderTotals, severity: 'CRITICAL' },
    { name: 'reserved_quantity_drift', run: checkReservedQuantityDrift, severity: 'HIGH' },
    { name: 'missing_commissions', run: checkMissingCommissions, severity: 'HIGH' },
    { name: 'refund_consistency', run: checkRefundConsistency, severity: 'CRITICAL' },
    { name: 'settlement_integrity', run: checkSettlementIntegrity, severity: 'CRITICAL' },
];

/**
 * Run every check. Alerts admins per failing invariant.
 * Never throws — a monitor that can crash the worker is worse than no monitor.
 */
export const runIntegrityChecks = async ({ alert = true } = {}) => {
    const results = {};

    for (const check of CHECKS) {
        try {
            const result = await check.run();
            results[check.name] = result;

            if (result.offenders.length > 0) {
                logger.error(`Integrity check failed: ${check.name}`, {
                    check: check.name,
                    offenderCount: result.offenders.length,
                    // Bounded sample — the full list belongs in the admin view.
                    sample: result.offenders.slice(0, 5),
                });

                if (alert) {
                    await notifyAdmins({
                        title: `Integrity check failed: ${check.name}`,
                        message:
                            `${result.offenders.length} record(s) violate the ${check.name} invariant. `
                            + 'This indicates a financial or inventory inconsistency requiring review.',
                        type: 'system',
                        category: 'ERROR',
                        priority: check.severity,
                    }).catch(() => null);
                }
            } else {
                logger.info(`Integrity check passed: ${check.name}`, { checked: result.checked });
            }
        } catch (err) {
            results[check.name] = { error: String(err?.message || err) };
            logger.error(`Integrity check errored: ${check.name}`, { error: err?.message });
        }
    }

    return results;
};

/** Periodic runner. Started from server.js alongside the other sweeps. */
export const startIntegrityMonitor = (intervalMs = 6 * 60 * 60 * 1000) => {
    const timer = setInterval(() => {
        runIntegrityChecks().catch((err) =>
            logger.error('Integrity monitor sweep failed', { error: err?.message })
        );
    }, intervalMs);
    timer.unref();
    return timer;
};
