/**
 * 0003 — Refund ledger, and the liability inventory it exposes.
 *
 * Historical orders carry `paymentStatus: 'refunded'` with no money movement:
 * every refund path in the application set that flag and stopped. Those orders
 * are reclassified as `legacy_unverified` Refund records rather than being
 * asserted as settled — writing them in as `succeeded` would claim money moved
 * when it demonstrably did not.
 *
 * The count it reports is a customer-liability figure and a business escalation,
 * not an engineering artefact.
 *
 * Idempotent: skips orders that already have a Refund record.
 */

import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Refund from '../models/Refund.model.js';
import Order from '../models/Order.model.js';

export default {
    id: '0003_refund_ledger',
    description: 'Create the refund ledger, backfill refundedAmount, and inventory unverified legacy refunds',

    async up() {
        await Refund.init(); // build indexes before writing

        // Every order starts from the honest position: nothing has been refunded.
        const zeroed = await Order.updateMany(
            { refundedAmount: { $exists: false } },
            { $set: { refundedAmount: 0 } }
        );

        // Orders already flagged refunded with no corresponding money movement.
        const flagged = await Order.find({
            paymentStatus: { $in: ['refunded', 'partially_refunded'] },
        })
            .select('_id orderId userId vendorId total paymentMethod checkoutSessionId createdAt')
            .lean();

        let recorded = 0;
        let liability = 0;

        for (const order of flagged) {
            const already = await Refund.findOne({ orderId: order._id }).lean();
            if (already) continue;

            const amount = Number(order.total || 0);
            const key = crypto
                .createHash('sha256')
                .update(`legacy|${order._id}`)
                .digest('hex')
                .slice(0, 40);

            try {
                await Refund.create({
                    refundNumber: `RF-LEGACY-${String(order._id).slice(-8).toUpperCase()}`,
                    orderId: order._id,
                    orderNumber: order.orderId,
                    checkoutSessionId: order.checkoutSessionId || null,
                    userId: order.userId || null,
                    vendorId: order.vendorId || null,
                    amount,
                    reason: 'Order was flagged refunded before a refund pipeline existed. Money movement NOT verified.',
                    refundType: 'full',
                    method: 'unknown',
                    status: 'legacy_unverified',
                    idempotencyKey: key,
                    requestedAt: order.createdAt || new Date(),
                });
                recorded += 1;
                liability += amount;
            } catch (err) {
                if (err?.code !== 11000) throw err;
            }
        }

        if (recorded > 0) {
            console.warn(
                `\n[migrate 0003] ⚠️  ${recorded} order(s) totalling ₹${liability.toFixed(2)} are flagged refunded `
                + 'with NO verified money movement. These are recorded as `legacy_unverified` and require a '
                + 'business decision — the customers may never have been paid.'
            );
        }

        return { ordersZeroed: zeroed.modifiedCount, legacyRefundsRecorded: recorded, unverifiedLiability: liability };
    },

    async verify() {
        const missing = await Order.countDocuments({ refundedAmount: { $exists: false } });
        const collections = await mongoose.connection.db.listCollections({ name: 'refunds' }).toArray();
        return {
            ok: missing === 0 && collections.length > 0,
            detail: `${missing} orders missing refundedAmount; refunds collection ${collections.length ? 'present' : 'MISSING'}`,
        };
    },
};
