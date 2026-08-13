/**
 * 0004 — Structural guards against double payout.
 *
 * `requestPayout` created a Settlement and then marked commissions `requested`
 * as two independent writes with no transaction, so two concurrent requests
 * could both claim the same commissions and the vendor was paid twice.
 *
 * The controller rewrite closes the window; the unique indexes make the outcome
 * impossible even if that code is later changed. But an index cannot be built
 * over data that already violates it — so this migration REPORTS conflicts and
 * REFUSES to proceed rather than silently deleting financial records to make
 * the build succeed.
 *
 * Resolving a reported conflict is a finance decision, not an engineering one:
 * two open settlements for one vendor may mean a vendor was genuinely paid
 * twice.
 */

import mongoose from 'mongoose';
import Settlement from '../models/Settlement.model.js';
import Commission from '../models/Commission.model.js';

export default {
    id: '0004_settlement_and_commission_guards',
    description: 'Detect duplicate settlements/commissions, then build the uniqueness guards',

    async up() {
        // ── 1. Vendors with more than one OPEN settlement ────────────────────
        // These are the double-payout candidates.
        const openDupes = await Settlement.aggregate([
            { $match: { status: 'pending' } },
            { $group: { _id: '$vendorId', count: { $sum: 1 }, ids: { $push: '$_id' }, total: { $sum: '$amount' } } },
            { $match: { count: { $gt: 1 } } },
        ]);

        if (openDupes.length > 0) {
            console.error(
                `\n[migrate 0004] ❌ ${openDupes.length} vendor(s) have MORE THAN ONE open settlement. `
                + 'These are potential double payouts and must be reconciled by finance before this migration can run.\n'
            );
            for (const d of openDupes) {
                console.error(`  vendorId=${d._id} openSettlements=${d.count} totalAmount=₹${d.total} ids=${d.ids.join(',')}`);
            }
            throw new Error(
                `Refusing to build unique_open_settlement_per_vendor: ${openDupes.length} vendor(s) have duplicate open settlements. `
                + 'Reconcile them (do not delete financial records) and re-run.'
            );
        }

        // ── 2. Duplicate commissions for the same (order, vendor) ────────────
        const commissionDupes = await Commission.aggregate([
            { $group: { _id: { orderId: '$orderId', vendorId: '$vendorId' }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
            { $match: { count: { $gt: 1 } } },
        ]);

        if (commissionDupes.length > 0) {
            console.error(
                `\n[migrate 0004] ❌ ${commissionDupes.length} (order, vendor) pair(s) have duplicate commission records. `
                + 'Each duplicate inflates a vendor payout. Reconcile before proceeding.\n'
            );
            for (const d of commissionDupes.slice(0, 50)) {
                console.error(`  orderId=${d._id.orderId} vendorId=${d._id.vendorId} count=${d.count} ids=${d.ids.join(',')}`);
            }
            throw new Error(
                `Refusing to build the unique commission index: ${commissionDupes.length} duplicate (order, vendor) pair(s) exist.`
            );
        }

        // ── 3. Clean — build the guards ──────────────────────────────────────
        await Settlement.init();

        // Commission uniqueness is declared here rather than on the schema so
        // this migration owns the ordering: detect first, then constrain.
        await Commission.collection.createIndex(
            { orderId: 1, vendorId: 1 },
            { unique: true, name: 'unique_commission_per_order_vendor', background: true }
        );

        return { openSettlementDuplicates: 0, commissionDuplicates: 0, indexesBuilt: 3 };
    },

    async verify() {
        const settlementIdx = await Settlement.collection.indexes();
        const commissionIdx = await Commission.collection.indexes();
        const hasOpenGuard = settlementIdx.some((i) => i.name === 'unique_open_settlement_per_vendor');
        const hasCommissionGuard = commissionIdx.some((i) => i.name === 'unique_commission_per_order_vendor');
        return {
            ok: hasOpenGuard && hasCommissionGuard,
            detail: `open-settlement guard: ${hasOpenGuard}, commission guard: ${hasCommissionGuard}`,
        };
    },
};
