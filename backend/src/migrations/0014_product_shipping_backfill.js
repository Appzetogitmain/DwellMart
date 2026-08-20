/**
 * Migration: seed estimated shipping defaults on products that have none, and
 * index the field so the missing-shipping report does not scan the catalogue.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE VALUES THIS WRITES ARE ESTIMATES, NOT MEASUREMENTS.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 0.5 kg and 20 x 15 x 10 cm are exactly what the courier payload already fell
 * back to when a product had no data, so seeding them changes NOTHING about
 * what DTDC is told. What it changes is honesty: the estimate becomes a stored,
 * queryable, clearly-labelled value (`shipping.source = 'estimated'`) instead of
 * an invisible default applied deep inside the payload builder.
 *
 * That label is the point. Without it, a seeded 0.5 kg is indistinguishable
 * from a vendor who genuinely weighed a 500 g product, and the backfill would
 * have quietly converted "we do not know" into "we measured this". Every
 * consumer — the booking panel's warning, the shipment's `weightSource`, the
 * admin report — keys off `source` rather than off presence.
 *
 * Safety properties, all asserted by the suite in
 * tests/integration/productShippingBackfill.test.mjs:
 *
 *   - only touches products with NO usable shipping weight;
 *   - never overwrites a vendor- or admin-entered value, even a partial one;
 *   - writes nothing but the `shipping` sub-document — no channel flag, no
 *     price, no stock, no ownership, no product count;
 *   - idempotent: a second run changes zero documents;
 *   - batched, so a large catalogue does not build one enormous bulk op.
 *
 * Retail and wholesale products are seeded. Quick Commerce-only products are
 * skipped: they are delivered by internal riders, never declared to a courier,
 * and seeding them would put an irrelevant estimate on a product whose vendor
 * has no reason to correct it.
 */

import Product from '../models/Product.model.js';
import { FALLBACK_WEIGHT_KG, FALLBACK_DIMENSIONS_CM } from '../services/shipping/parcelMetrics.js';

export const id = '0014_product_shipping_backfill';
export const description = 'Seed estimated shipping defaults on courier-eligible products missing them';

const BATCH_SIZE = 500;

/**
 * Products that need seeding.
 *
 * "Missing" means no usable weight — absent, null, or a non-positive number.
 * A product with dimensions but no weight still counts, because the weight is
 * what the consignment is declared with.
 *
 * Quick Commerce-only products are excluded: `quickCommerceEnabled` true while
 * neither courier channel is on.
 */
export const backfillFilter = () => ({
    $and: [
        {
            $or: [
                { 'shipping.weight': { $exists: false } },
                { 'shipping.weight': null },
                { 'shipping.weight': { $lte: 0 } },
            ],
        },
        {
            // Courier-eligible: retail is on (or simply not switched off, which
            // is the default for the whole legacy catalogue) or wholesale is on.
            $or: [
                { retailEnabled: { $ne: false } },
                { wholesaleEnabled: true },
            ],
        },
    ],
});

const ESTIMATED_SHIPPING = Object.freeze({
    weight: FALLBACK_WEIGHT_KG,
    weightUnit: 'kg',
    length: FALLBACK_DIMENSIONS_CM.length,
    width: FALLBACK_DIMENSIONS_CM.width,
    height: FALLBACK_DIMENSIONS_CM.height,
    dimensionUnit: 'cm',
    source: 'estimated',
});

/**
 * Report what the backfill would do, without writing anything.
 *
 * Exposed separately from `up()` so it can be run on its own before a
 * production apply, and so the suite can assert that a dry run mutates nothing.
 *
 * @returns {Promise<{total:number, alreadyPopulated:number, wouldUpdate:number, quickCommerceOnly:number}>}
 */
export const dryRun = async () => {
    const [total, wouldUpdate, alreadyPopulated, quickCommerceOnly] = await Promise.all([
        Product.countDocuments({}),
        Product.countDocuments(backfillFilter()),
        Product.countDocuments({ 'shipping.weight': { $gt: 0 } }),
        Product.countDocuments({
            quickCommerceEnabled: true,
            retailEnabled: false,
            wholesaleEnabled: { $ne: true },
        }),
    ]);

    return { total, alreadyPopulated, wouldUpdate, quickCommerceOnly };
};


/** Supports the admin missing-shipping report, which filters on source. Idempotent. */
const ensureShippingIndex = async () => {
    await Product.collection.createIndex(
        { 'shipping.source': 1, retailEnabled: 1, wholesaleEnabled: 1 },
        { name: 'product_shipping_source' }
    );
};

export const up = async () => {
    const plan = await dryRun();
    console.log(
        `[Migration 0014] ${plan.total} product(s): ${plan.alreadyPopulated} already have a weight, ` +
        `${plan.wouldUpdate} to seed, ${plan.quickCommerceOnly} Quick Commerce-only (skipped).`
    );

    // The index is created regardless of whether anything needs seeding: the
    // admin report queries it on every load, and an empty catalogue today
    // becomes a full one tomorrow. Returning early before this left a fresh
    // database failing its own verify().
    await ensureShippingIndex();

    if (plan.wouldUpdate === 0) {
        console.log('[Migration 0014] Nothing to seed.');
        return;
    }

    let seeded = 0;

    // Batched by id so a catalogue of any size applies in bounded chunks, and a
    // failure part-way leaves a resumable state rather than an all-or-nothing
    // rollback of a very large write.
    for (;;) {
        const batch = await Product.find(backfillFilter())
            .select('_id shipping')
            .limit(BATCH_SIZE)
            .lean();

        if (batch.length === 0) break;

        const operations = batch.map((product) => ({
            updateOne: {
                filter: { _id: product._id },
                // Field-by-field rather than replacing `shipping` wholesale:
                // a product may already carry dimensions without a weight, and
                // those are a real measurement that must survive.
                update: {
                    $set: {
                        'shipping.weight': ESTIMATED_SHIPPING.weight,
                        'shipping.weightUnit': ESTIMATED_SHIPPING.weightUnit,
                        'shipping.source': ESTIMATED_SHIPPING.source,
                        ...(product.shipping?.length > 0 ? {} : {
                            'shipping.length': ESTIMATED_SHIPPING.length,
                            'shipping.width': ESTIMATED_SHIPPING.width,
                            'shipping.height': ESTIMATED_SHIPPING.height,
                            'shipping.dimensionUnit': ESTIMATED_SHIPPING.dimensionUnit,
                        }),
                    },
                },
            },
        }));

        const result = await Product.bulkWrite(operations, { ordered: false });
        seeded += result.modifiedCount ?? 0;

        // The filter excludes what was just written, so the next pass returns
        // the following batch. A batch that modified nothing means the filter
        // can no longer make progress; stopping avoids an infinite loop.
        if ((result.modifiedCount ?? 0) === 0) break;
    }

    console.log(`[Migration 0014] Seeded ${seeded} product(s) with ESTIMATED defaults (not measurements).`);
};

export const verify = async () => {
    const remaining = await Product.countDocuments(backfillFilter());
    const indexes = await Product.collection.indexes();
    const hasIndex = indexes.some((idx) => idx.name === 'product_shipping_source');

    const problems = [];
    if (remaining > 0) problems.push(`${remaining} courier-eligible product(s) still have no shipping weight`);
    if (!hasIndex) problems.push('missing product_shipping_source index');

    if (problems.length === 0) {
        const estimated = await Product.countDocuments({ 'shipping.source': 'estimated' });
        const measured = await Product.countDocuments({ 'shipping.source': 'vendor' });
        return {
            ok: true,
            detail: `unseeded=0; estimated=${estimated}; vendor-entered=${measured}`,
        };
    }
    return { ok: false, detail: problems.join('; ') };
};

export default { id, description, up, verify, dryRun, backfillFilter };
