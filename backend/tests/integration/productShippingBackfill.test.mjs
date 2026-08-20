/**
 * Product shipping backfill (migration 0014) — integration suite.
 *
 * A backfill that touches every product in the catalogue is the single most
 * destructive thing in this whole body of work, so it is tested against a real
 * database with real documents rather than a mocked model.
 *
 * The assertions divide into two kinds:
 *   - it does what it claims (seeds the unmeasured, marks them estimated);
 *   - it does NOTHING ELSE (no overwrite, no count change, no channel flag, no
 *     price, no stock, no ownership).
 *
 * Run with:  npm run test:backfill
 */

import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongod = await MongoMemoryServer.create();
process.env.MONGO_URI              = `${mongod.getUri()}dwellmart_backfill_test`;
process.env.NODE_ENV               = 'test';
process.env.JWT_SECRET             = 'integration-test-jwt-secret-value';
process.env.JWT_REFRESH_SECRET     = 'integration-test-jwt-refresh-secret';
process.env.CLOUDINARY_CLOUD_NAME  = 'test';
process.env.CLOUDINARY_API_KEY     = 'test';
process.env.CLOUDINARY_API_SECRET  = 'test';
process.env.DTDC_CUSTOMER_CODE     = 'TEST_CUSTOMER';
process.env.DTDC_API_KEY           = 'test-api-key';

await mongoose.connect(process.env.MONGO_URI);

const Product  = (await import('../../src/models/Product.model.js')).default;
const Category = (await import('../../src/models/Category.model.js')).default;
const Vendor   = (await import('../../src/models/Vendor.model.js')).default;
const migration = (await import('../../src/migrations/0014_product_shipping_backfill.js')).default;
const { FALLBACK_WEIGHT_KG, FALLBACK_DIMENSIONS_CM } =
    await import('../../src/services/shipping/parcelMetrics.js');

after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

let category;
let vendor;
let seq = 0;

beforeEach(async () => {
    const collections = await mongoose.connection.db.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));

    category = await Category.create({ name: 'QA', slug: `qa-${++seq}-${Date.now()}` });
    vendor = await Vendor.create({
        name: `V${seq}`, email: `v${seq}-${Date.now()}@qa.test`, password: 'xxxxxxxx',
        storeName: `Store${seq}`, phone: '9999999999', status: 'approved', isVerified: true,
    });
});

const makeProduct = async (extra = {}) => Product.create({
    name: `P${++seq}`, slug: `p-${seq}-${Date.now()}`, price: 500,
    categoryId: category._id, vendorId: vendor._id,
    stock: 'in_stock', stockQuantity: 10, ...extra,
});

// ═══════════════════════════════════════════════════════════════════════════
// Dry run
// ═══════════════════════════════════════════════════════════════════════════

test('Dry run: reports the plan and mutates nothing', async () => {
    await makeProduct({ retailEnabled: true });
    await makeProduct({ retailEnabled: true });
    await makeProduct({
        retailEnabled: true,
        shipping: { weight: 3, weightUnit: 'kg', source: 'vendor' },
    });

    const plan = await migration.dryRun();
    assert.equal(plan.total, 3);
    assert.equal(plan.wouldUpdate, 2);
    assert.equal(plan.alreadyPopulated, 1);

    // Nothing may have moved.
    const untouched = await Product.countDocuments({ 'shipping.source': 'estimated' });
    assert.equal(untouched, 0, 'a dry run writes nothing');
});

// ═══════════════════════════════════════════════════════════════════════════
// Seeding
// ═══════════════════════════════════════════════════════════════════════════

test('Seeds unmeasured products with the documented fallback', async () => {
    const product = await makeProduct({ retailEnabled: true });

    await migration.up();

    const seeded = await Product.findById(product._id).lean();
    assert.equal(seeded.shipping.weight, FALLBACK_WEIGHT_KG);
    assert.equal(seeded.shipping.weightUnit, 'kg');
    assert.equal(seeded.shipping.length, FALLBACK_DIMENSIONS_CM.length);
    assert.equal(seeded.shipping.width, FALLBACK_DIMENSIONS_CM.width);
    assert.equal(seeded.shipping.height, FALLBACK_DIMENSIONS_CM.height);
});

test('Seeded values are labelled as estimates, never as measurements', async () => {
    // Without this label a seeded 0.5 kg is indistinguishable from a vendor who
    // genuinely weighed a 500 g product, and the backfill would have converted
    // "we do not know" into "we measured this".
    const product = await makeProduct({ retailEnabled: true });
    await migration.up();

    const seeded = await Product.findById(product._id).lean();
    assert.equal(seeded.shipping.source, 'estimated');
});

test('Wholesale-only products are seeded too', async () => {
    const product = await makeProduct({ retailEnabled: false, wholesaleEnabled: true });
    await migration.up();

    const seeded = await Product.findById(product._id).lean();
    assert.equal(seeded.shipping.weight, FALLBACK_WEIGHT_KG);
});

test('Quick Commerce-only products are skipped', async () => {
    // Delivered by internal riders, never declared to a courier. Seeding them
    // would put an irrelevant estimate on a product nobody has reason to fix.
    const qc = await makeProduct({
        retailEnabled: false, wholesaleEnabled: false, quickCommerceEnabled: true,
    });
    await migration.up();

    const untouched = await Product.findById(qc._id).lean();
    assert.equal(untouched.shipping?.weight, undefined);
});

test('A product on both Quick Commerce and retail IS seeded', async () => {
    const dual = await makeProduct({ retailEnabled: true, quickCommerceEnabled: true });
    await migration.up();

    const seeded = await Product.findById(dual._id).lean();
    assert.equal(seeded.shipping.weight, FALLBACK_WEIGHT_KG, 'it can still ship by courier');
});

// ═══════════════════════════════════════════════════════════════════════════
// Non-destructiveness — what it must NOT do
// ═══════════════════════════════════════════════════════════════════════════

test('A vendor-entered weight is never overwritten', async () => {
    const measured = await makeProduct({
        retailEnabled: true,
        shipping: {
            weight: 7.5, weightUnit: 'kg', length: 60, width: 50, height: 40,
            dimensionUnit: 'cm', source: 'vendor',
        },
    });

    await migration.up();

    const after = await Product.findById(measured._id).lean();
    assert.equal(after.shipping.weight, 7.5);
    assert.equal(after.shipping.length, 60);
    assert.equal(after.shipping.source, 'vendor', 'and it stays labelled as a measurement');
});

test('Existing dimensions survive when only the weight is seeded', async () => {
    // A partially-measured product is a real case: a vendor may have entered
    // the box size and not the weight. The measured half must not be replaced.
    const partial = await makeProduct({
        retailEnabled: true,
        shipping: { length: 45, width: 35, height: 25, dimensionUnit: 'cm', source: 'vendor' },
    });

    await migration.up();

    const after = await Product.findById(partial._id).lean();
    assert.equal(after.shipping.weight, FALLBACK_WEIGHT_KG, 'the missing half is filled');
    assert.equal(after.shipping.length, 45, 'the measured half is untouched');
    assert.equal(after.shipping.height, 25);
});

test('A zero weight counts as unmeasured and is seeded', async () => {
    const zeroed = await makeProduct({
        retailEnabled: true,
        shipping: { weight: 0, weightUnit: 'kg' },
    });

    await migration.up();
    const after = await Product.findById(zeroed._id).lean();
    assert.equal(after.shipping.weight, FALLBACK_WEIGHT_KG);
});

test('Nothing but the shipping sub-document changes', async () => {
    const product = await makeProduct({
        retailEnabled: true, wholesaleEnabled: true, quickCommerceEnabled: false,
        price: 1234, stockQuantity: 42, sku: 'SKU-CANARY',
    });
    const before = await Product.findById(product._id).lean();

    await migration.up();
    const after = await Product.findById(product._id).lean();

    for (const field of [
        'name', 'slug', 'price', 'stockQuantity', 'sku', 'categoryId', 'vendorId',
        'retailEnabled', 'wholesaleEnabled', 'quickCommerceEnabled', 'isActive',
    ]) {
        assert.deepEqual(
            JSON.stringify(after[field]), JSON.stringify(before[field]),
            `${field} must not change`
        );
    }
});

test('The product count is unchanged — nothing is created or deleted', async () => {
    for (let i = 0; i < 5; i++) await makeProduct({ retailEnabled: true });
    const before = await Product.countDocuments({});

    await migration.up();

    assert.equal(await Product.countDocuments({}), before);
});

// ═══════════════════════════════════════════════════════════════════════════
// Idempotency and scale
// ═══════════════════════════════════════════════════════════════════════════

test('A second run changes nothing', async () => {
    await makeProduct({ retailEnabled: true });
    await makeProduct({ retailEnabled: true });

    await migration.up();
    const afterFirst = await Product.find({}).sort({ _id: 1 }).lean();

    await migration.up();
    const afterSecond = await Product.find({}).sort({ _id: 1 }).lean();

    assert.equal(afterSecond.length, afterFirst.length);
    afterFirst.forEach((doc, i) => {
        assert.deepEqual(doc.shipping, afterSecond[i].shipping, 'idempotent');
    });

    const plan = await migration.dryRun();
    assert.equal(plan.wouldUpdate, 0, 'and the plan agrees there is nothing left to do');
});

test('A catalogue larger than one batch is fully seeded', async () => {
    // The batch size is 500; 600 proves the loop actually advances rather than
    // seeding the first page and stopping.
    const docs = Array.from({ length: 600 }, (_, i) => ({
        name: `Bulk${i}`, slug: `bulk-${i}-${Date.now()}`, price: 100,
        categoryId: category._id, vendorId: vendor._id,
        stock: 'in_stock', stockQuantity: 1, retailEnabled: true,
    }));
    await Product.insertMany(docs);

    await migration.up();

    const remaining = await Product.countDocuments(migration.backfillFilter());
    assert.equal(remaining, 0, 'every batch was processed');
    assert.equal(await Product.countDocuments({ 'shipping.source': 'estimated' }), 600);
});

// ═══════════════════════════════════════════════════════════════════════════
// Verification
// ═══════════════════════════════════════════════════════════════════════════

test('verify() passes after a run and reports the split', async () => {
    await makeProduct({ retailEnabled: true });
    await makeProduct({
        retailEnabled: true,
        shipping: { weight: 2, weightUnit: 'kg', source: 'vendor' },
    });

    await migration.up();
    const result = await migration.verify();

    assert.equal(result.ok, true, result.detail);
    assert.match(result.detail, /estimated=1/);
    assert.match(result.detail, /vendor-entered=1/);
});

test('verify() fails while a courier-eligible product is still unseeded', async () => {
    await makeProduct({ retailEnabled: true });
    // Deliberately not running up().
    const result = await migration.verify();
    assert.equal(result.ok, false);
    assert.match(result.detail, /no shipping weight/i);
});

test('The reporting index is created', async () => {
    await makeProduct({ retailEnabled: true });
    await migration.up();

    const indexes = await Product.collection.indexes();
    assert.ok(
        indexes.some((idx) => idx.name === 'product_shipping_source'),
        'the missing-shipping report must not scan the catalogue'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// Effect on booking
// ═══════════════════════════════════════════════════════════════════════════

test('Seeded estimates do not change what the courier is told', async () => {
    // The payload builder already fell back to exactly these numbers. Seeding
    // makes the estimate visible and queryable; it must not alter the parcel.
    const product = await makeProduct({ retailEnabled: true });
    await migration.up();

    const seeded = await Product.findById(product._id).lean();
    const { normalizeProductShipping } = await import('../../src/services/shipping/parcelMetrics.js');
    const normalised = normalizeProductShipping(seeded.shipping);

    assert.equal(normalised.weightKg, FALLBACK_WEIGHT_KG);
    assert.deepEqual(normalised.dims, FALLBACK_DIMENSIONS_CM);
    assert.equal(normalised.source, 'estimated', 'and the estimate stays labelled downstream');
});
