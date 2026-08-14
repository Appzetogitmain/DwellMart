/**
 * 0007 — Variant-aware inventory reservations (M-4).
 *
 * Two changes to existing data:
 *
 *   1. The unique index moves from `{sessionId, productId}` to
 *      `{sessionId, productId, variantKey}`. The old index made an ordinary
 *      cart — size S and size M of the same shirt — collide on a duplicate key.
 *
 *   2. Existing reservations get `variantKey: ''`. Empty rather than null,
 *      because MongoDB's unique index treats a missing field and an explicit
 *      null differently across documents.
 *
 * Also reports (does not correct) any product whose per-variant reserved counts
 * disagree with its open reservations. Correcting stock silently would hide
 * whichever defect caused the drift.
 */

import InventoryReservation from '../models/InventoryReservation.model.js';
import Product from '../models/Product.model.js';

const OLD_INDEX = 'sessionId_1_productId_1';

export default {
    id: '0007_variant_aware_reservations',
    description: 'Add variantKey to reservations and widen the uniqueness guard',

    async up() {
        // Backfill BEFORE the new index is built, or documents missing the
        // field would all collide on it.
        const backfilled = await InventoryReservation.updateMany(
            { variantKey: { $exists: false } },
            { $set: { variantKey: '' } }
        );

        // Drop the too-narrow index if it is still present.
        let droppedOld = false;
        try {
            const existing = await InventoryReservation.collection.indexes();
            if (existing.some((i) => i.name === OLD_INDEX)) {
                await InventoryReservation.collection.dropIndex(OLD_INDEX);
                droppedOld = true;
            }
            const expiresIdx = existing.find((i) => i.name === 'expiresAt_1');
            if (expiresIdx && expiresIdx.expireAfterSeconds === undefined) {
                await InventoryReservation.collection.dropIndex('expiresAt_1');
            }
        } catch (err) {
            console.warn(`[migrate 0007] Could not drop indexes: ${err.message}`);
        }

        // Building this can fail if two open holds already exist for the same
        // (session, product) — which is exactly the collision the old index
        // caused. Report rather than delete: these are live checkout holds.
        try {
            await InventoryReservation.init();
        } catch (err) {
            const dupes = await InventoryReservation.aggregate([
                { $match: { status: 'reserved' } },
                {
                    $group: {
                        _id: { sessionId: '$sessionId', productId: '$productId', variantKey: '$variantKey' },
                        count: { $sum: 1 },
                        ids: { $push: '$_id' },
                    },
                },
                { $match: { count: { $gt: 1 } } },
            ]);
            console.error(`\n[migrate 0007] ❌ Cannot build the uniqueness guard: ${dupes.length} duplicate hold(s).`);
            dupes.slice(0, 20).forEach((d) =>
                console.error(`  session=${d._id.sessionId} product=${d._id.productId} variant="${d._id.variantKey}" count=${d.count}`)
            );
            throw new Error(
                'Duplicate inventory holds exist. Let them expire (they are TTL-bounded) or release the affected '
                + 'checkout sessions, then re-run. Do not delete them while a customer is mid-checkout.'
            );
        }

        // Drift report — evidence, not a correction.
        const openByProduct = await InventoryReservation.aggregate([
            { $match: { status: 'reserved', variantKey: { $ne: '' } } },
            {
                $group: {
                    _id: { productId: '$productId', variantKey: '$variantKey' },
                    expected: { $sum: '$quantity' },
                },
            },
        ]);

        let drifted = 0;
        for (const row of openByProduct) {
            const product = await Product.findById(row._id.productId).select('variants.reservedMap').lean();
            const map = product?.variants?.reservedMap || {};
            const actual = Number((typeof map.get === 'function' ? map.get(row._id.variantKey) : map[row._id.variantKey]) ?? 0);
            if (actual !== row.expected) {
                drifted += 1;
                console.warn(
                    `[migrate 0007] variant reserved drift: product=${row._id.productId} `
                    + `variant="${row._id.variantKey}" recorded=${actual} expected=${row.expected}`
                );
            }
        }

        return {
            reservationsBackfilled: backfilled.modifiedCount,
            droppedOldIndex: droppedOld,
            variantDriftDetected: drifted,
        };
    },

    async verify() {
        const missing = await InventoryReservation.countDocuments({ variantKey: { $exists: false } });
        const indexes = await InventoryReservation.collection.indexes();
        const hasNew = indexes.some(
            (i) => i.unique && i.key?.sessionId === 1 && i.key?.productId === 1 && i.key?.variantKey === 1
        );
        const hasOld = indexes.some((i) => i.name === OLD_INDEX);
        return {
            ok: missing === 0 && hasNew && !hasOld,
            detail: `missing variantKey: ${missing}; new index: ${hasNew}; old index still present: ${hasOld}`,
        };
    },
};
