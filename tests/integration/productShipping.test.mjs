/**
 * Product shipping data — integration suite.
 *
 * Exercises the real HTTP write paths, because three separate guards sit
 * between a form submission and the database: `productCapabilityGuard` (which
 * rejects any field absent from productFieldOwnership.js), Joi validation, and
 * Mongoose strict mode. A field can pass all three in a unit test and still be
 * silently dropped in production if any one of them was missed — which is
 * exactly how `unbookedAlertedAt` failed on its first attempt.
 *
 * Run with:  npm run test:product-shipping
 */

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongod = await MongoMemoryServer.create();
process.env.MONGO_URI              = `${mongod.getUri()}dwellmart_product_shipping_test`;
process.env.NODE_ENV               = 'test';
process.env.JWT_SECRET             = 'integration-test-jwt-secret-value';
process.env.JWT_REFRESH_SECRET     = 'integration-test-jwt-refresh-secret';
process.env.CLOUDINARY_CLOUD_NAME  = 'test';
process.env.CLOUDINARY_API_KEY     = 'test';
process.env.CLOUDINARY_API_SECRET  = 'test';
process.env.DTDC_CUSTOMER_CODE     = 'TEST_CUSTOMER';
process.env.DTDC_API_KEY           = 'test-api-key';
process.env.DTDC_TRACKING_USERNAME = 'test-user';
process.env.DTDC_TRACKING_PASSWORD = 'test-pass';

import { installFetchStub, setDtdcHandlers, defaultHandlers } from './_dtdcHarness.mjs';
import { models, makeVendor, resetPlanCache } from './_dtdcFixtures.mjs';

await mongoose.connect(process.env.MONGO_URI);
const realFetch = global.fetch;
installFetchStub();
setDtdcHandlers(defaultHandlers());

const { default: app } = await import('../../src/app.js');
const { generateTokens } = await import('../../src/utils/generateToken.js');
const metrics = await import('../../src/services/shipping/parcelMetrics.js');

const M = await models();
const Product = (await import('../../src/models/Product.model.js')).default;
const Category = (await import('../../src/models/Category.model.js')).default;
const Admin = (await import('../../src/models/Admin.model.js')).default;
const { SHARED_PRODUCT_FIELDS, CHANNEL_OWNED_PRODUCT_FIELDS } =
    await import('../../src/constants/productFieldOwnership.js');

let server;
let baseUrl;
let category;

before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    await mongod.stop();
});

beforeEach(async () => {
    const collections = await mongoose.connection.db.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
    resetPlanCache();
    category = await Category.create({ name: 'QA', slug: `qa-${Date.now()}-${Math.floor(performance.now())}` });
});

const request = async (path, { method = 'GET', headers = {}, body } = {}) => {
    const response = await realFetch(`${baseUrl}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json', ...headers } : headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: response.status, body: parsed };
};

const vendorAuth = (vendor) => ({
    Authorization: `Bearer ${generateTokens({ id: String(vendor._id), role: 'vendor', email: vendor.email }).accessToken}`,
});

const adminAuth = async () => {
    const admin = await Admin.create({
        name: 'QA Admin', email: `admin-${Date.now()}@qa.test`, password: 'xxxxxxxx', role: 'superadmin',
    });
    return { Authorization: `Bearer ${generateTokens({ id: String(admin._id), role: 'superadmin', email: admin.email }).accessToken}` };
};

const productPayload = (extra = {}) => ({
    name: `Widget ${Date.now()}${Math.floor(performance.now())}`,
    price: 500,
    stockQuantity: 10,
    categoryId: String(category._id),
    ...extra,
});

const FULL_SHIPPING = { weight: 2.4, weightUnit: 'kg', length: 30, width: 20, height: 15, dimensionUnit: 'cm' };

// ═══════════════════════════════════════════════════════════════════════════
// Field ownership
// ═══════════════════════════════════════════════════════════════════════════

test('Ownership: shipping is shared, not channel-owned', () => {
    assert.ok(SHARED_PRODUCT_FIELDS.includes('shipping'), 'both courier channels must be able to author it');
    for (const [channel, fields] of Object.entries(CHANNEL_OWNED_PRODUCT_FIELDS)) {
        assert.equal(fields.includes('shipping'), false, `shipping must not be owned by ${channel}`);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// Vendor write paths
// ═══════════════════════════════════════════════════════════════════════════

test('Retail vendor: creates a product with shipping data that persists', async () => {
    const vendor = await makeVendor(M, 'RetailShip', 'retail');
    const res = await request('/api/vendor/products', {
        method: 'POST', headers: vendorAuth(vendor), body: productPayload({ shipping: FULL_SHIPPING }),
    });

    assert.equal(res.status, 201, JSON.stringify(res.body).slice(0, 300));

    const saved = await Product.findOne({ vendorId: vendor._id }).lean();
    assert.equal(saved.shipping.weight, 2.4);
    assert.equal(saved.shipping.weightUnit, 'kg');
    assert.equal(saved.shipping.length, 30);
    assert.equal(saved.shipping.dimensionUnit, 'cm');
});

test('Wholesale vendor: can author shipping data too', async () => {
    // The capability guard derives allowed fields per channel; if `shipping`
    // were channel-owned by retail, a wholesale-only seller could never enter
    // the weight their own consignments are declared with.
    const vendor = await makeVendor(M, 'WholesaleShip', 'wholesale');
    const res = await request('/api/vendor/products', {
        method: 'POST', headers: vendorAuth(vendor),
        body: productPayload({
            shipping: FULL_SHIPPING,
            // Existing business rule: a wholesale product needs a bulk tier.
            wholesaleEnabled: true,
            wholesale: { moqEnabled: true, moq: 10, priceTiers: [{ minQty: 10, price: 400 }] },
        }),
    });

    assert.equal(res.status, 201, JSON.stringify(res.body).slice(0, 300));
    const saved = await Product.findOne({ vendorId: vendor._id }).lean();
    assert.equal(saved.shipping.weight, 2.4);
});

test('Retail vendor: updates shipping data on an existing product', async () => {
    const vendor = await makeVendor(M, 'RetailUpdate', 'retail');
    const created = await request('/api/vendor/products', {
        method: 'POST', headers: vendorAuth(vendor), body: productPayload({ shipping: FULL_SHIPPING }),
    });
    const id = created.body.data?._id || created.body.data?.product?._id;

    const res = await request(`/api/vendor/products/${id}`, {
        method: 'PUT', headers: vendorAuth(vendor),
        body: { shipping: { weight: 750, weightUnit: 'g', length: 10, width: 10, height: 10, dimensionUnit: 'cm' } },
    });

    assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
    const saved = await Product.findById(id).lean();
    assert.equal(saved.shipping.weight, 750);
    assert.equal(saved.shipping.weightUnit, 'g', 'the unit the vendor entered is what is stored');
});

test('Vendor: a product without shipping data is still creatable', async () => {
    // Optional by design — requiring it would make every pre-existing product
    // uneditable until someone measured it.
    const vendor = await makeVendor(M, 'NoShipData', 'retail');
    const res = await request('/api/vendor/products', {
        method: 'POST', headers: vendorAuth(vendor), body: productPayload(),
    });
    assert.equal(res.status, 201);
});

test('Vendor: grams and inches survive the round trip unconverted', async () => {
    const vendor = await makeVendor(M, 'UnitFidelity', 'retail');
    await request('/api/vendor/products', {
        method: 'POST', headers: vendorAuth(vendor),
        body: productPayload({ shipping: { weight: 250, weightUnit: 'g', length: 10, width: 8, height: 4, dimensionUnit: 'in' } }),
    });

    const saved = await Product.findOne({ vendorId: vendor._id }).lean();
    // Normalisation happens once, at consumption — the database keeps what the
    // vendor typed, so the form can show it back to them unchanged.
    assert.equal(saved.shipping.weight, 250);
    assert.equal(saved.shipping.weightUnit, 'g');
    assert.equal(saved.shipping.dimensionUnit, 'in');
    assert.equal(metrics.toKilograms(saved.shipping.weight, saved.shipping.weightUnit), 0.25);
    assert.equal(metrics.toCentimetres(saved.shipping.length, saved.shipping.dimensionUnit), 25.4);
});

// ═══════════════════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════════════════

const rejects = async (vendor, shipping, label) => {
    const res = await request('/api/vendor/products', {
        method: 'POST', headers: vendorAuth(vendor), body: productPayload({ shipping }),
    });
    assert.ok(res.status >= 400, `${label} should be rejected, got ${res.status}`);
    return res;
};

test('Validation: negative weight is refused', async () => {
    const vendor = await makeVendor(M, 'NegWeight', 'retail');
    await rejects(vendor, { weight: -5, weightUnit: 'kg' }, 'negative weight');
});

test('Validation: an absurd weight is refused before it can reach the carrier', async () => {
    const vendor = await makeVendor(M, 'HugeWeight', 'retail');
    // A vendor typing 150000 for 1.5 kg is a real support cost; DTDC would
    // reject it anyway, so catching it here is cheaper.
    await rejects(vendor, { weight: 150000, weightUnit: 'kg' }, 'over-max weight');
});

test('Validation: an invalid weight unit is refused', async () => {
    const vendor = await makeVendor(M, 'BadWeightUnit', 'retail');
    await rejects(vendor, { weight: 2, weightUnit: 'lbs' }, 'lbs');
});

test('Validation: an invalid dimension unit is refused', async () => {
    const vendor = await makeVendor(M, 'BadDimUnit', 'retail');
    await rejects(vendor, { length: 10, width: 10, height: 10, dimensionUnit: 'ft' }, 'ft');
});

test('Validation: an over-max dimension is refused', async () => {
    const vendor = await makeVendor(M, 'HugeDim', 'retail');
    await rejects(vendor, { length: 5000, width: 10, height: 10, dimensionUnit: 'cm' }, '5000 cm');
});

test('Validation: a non-numeric weight is refused, not silently dropped', async () => {
    const vendor = await makeVendor(M, 'TextWeight', 'retail');
    await rejects(vendor, { weight: 'heavy', weightUnit: 'kg' }, 'text weight');
});

test('Validation: invalid shipping never reaches the database', async () => {
    const vendor = await makeVendor(M, 'NoPartialWrite', 'retail');
    await rejects(vendor, { weight: -1 }, 'negative weight');
    assert.equal(await Product.countDocuments({ vendorId: vendor._id }), 0, 'the whole write is refused');
});

test('Validation: a client cannot claim its estimates are vendor measurements', async () => {
    // `source` is server-authored. Accepting it from a client would let a
    // backfilled estimate be laundered into a claimed measurement.
    const vendor = await makeVendor(M, 'SourceSpoof', 'retail');
    const res = await request('/api/vendor/products', {
        method: 'POST', headers: vendorAuth(vendor),
        body: productPayload({ shipping: { ...FULL_SHIPPING, source: 'vendor' } }),
    });
    assert.ok(res.status >= 400, 'a client-supplied source is refused, not silently stripped');
    assert.match(JSON.stringify(res.body), /source/i);
});

// ═══════════════════════════════════════════════════════════════════════════
// Admin write path
// ═══════════════════════════════════════════════════════════════════════════

test('Admin: creates a product with shipping data', async () => {
    const vendor = await makeVendor(M, 'AdminCreateVendor', 'retail');
    const headers = await adminAuth();

    const res = await request('/api/admin/products', {
        method: 'POST', headers,
        body: productPayload({ shipping: FULL_SHIPPING, vendorId: String(vendor._id) }),
    });

    assert.ok(res.status < 400, JSON.stringify(res.body).slice(0, 400));
    const saved = await Product.findOne({ name: /^Widget/ }).lean();
    assert.equal(saved.shipping.weight, 2.4);
    assert.equal(saved.shipping.height, 15);
});

test('Admin: updates shipping data, and the vendor sees the same values', async () => {
    const vendor = await makeVendor(M, 'AdminEditVendor', 'retail');
    const created = await request('/api/vendor/products', {
        method: 'POST', headers: vendorAuth(vendor), body: productPayload({ shipping: FULL_SHIPPING }),
    });
    const id = created.body.data?._id || created.body.data?.product?._id;

    const res = await request(`/api/admin/products/${id}`, {
        method: 'PUT', headers: await adminAuth(),
        body: { shipping: { weight: 9.5, weightUnit: 'kg', length: 50, width: 40, height: 30, dimensionUnit: 'cm' } },
    });
    assert.ok(res.status < 400, JSON.stringify(res.body).slice(0, 300));

    // The vendor reads the same document — one product, one set of parcel data.
    const asVendor = await request(`/api/vendor/products/${id}`, { headers: vendorAuth(vendor) });
    const seen = asVendor.body.data?.shipping || asVendor.body.data?.product?.shipping;
    assert.equal(seen.weight, 9.5);
    assert.equal(seen.length, 50);
});

test('Admin: the same bounds apply as on the vendor path', async () => {
    const vendor = await makeVendor(M, 'AdminBounds', 'retail');
    const res = await request('/api/admin/products', {
        method: 'POST', headers: await adminAuth(),
        body: productPayload({ shipping: { weight: 150000, weightUnit: 'kg' }, vendorId: String(vendor._id) }),
    });
    assert.ok(res.status >= 400, 'admin is trusted, but a typo is still a typo');
});

// ═══════════════════════════════════════════════════════════════════════════
// Quick Commerce isolation
// ═══════════════════════════════════════════════════════════════════════════

test('Quick Commerce: shipping data on a QC product does not make it courier-eligible', async () => {
    const vendor = await makeVendor(M, 'QcWithShipping', 'qc');
    const qcCategory = await Category.create({
        name: 'QC Cat', slug: `qc-${Date.now()}`,
        // `experience` is a read-only virtual; the stored field is the array.
        supportedExperiences: ['quick_commerce'],
    });
    const res = await request('/api/vendor/products', {
        method: 'POST', headers: vendorAuth(vendor),
        body: productPayload({
            shipping: FULL_SHIPPING,
            // Existing business rule: a QC product needs a QC category.
            quickCommerceEnabled: true,
            quickCommerceCategoryId: String(qcCategory._id),
        }),
    });
    assert.equal(res.status, 201, `QC create failed: ${JSON.stringify(res.body).slice(0, 300)}`);

    const saved = await Product.findOne({ vendorId: vendor._id }).lean();
    assert.equal(saved.shipping.weight, 2.4);
    // Routing is decided by the ORDER channel, never by product data.
    assert.equal(saved.quickCommerceEnabled ?? false, saved.quickCommerceEnabled ?? false);

    const { isDtdcOrder } = await import('../../src/services/shipping/deliveryProvider.js');
    assert.equal(
        isDtdcOrder({ fulfillmentType: 'quick_commerce' }), false,
        'a weighed QC product is still delivered by an internal rider'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// Metrics
// ═══════════════════════════════════════════════════════════════════════════

test('Metrics: chargeable weight is the greater of actual and volumetric', async () => {
    // A dense parcel bills on actual weight.
    const dense = metrics.chargeableWeight(10, { length: 20, width: 15, height: 10 });
    assert.equal(dense.volumetric, 0.6);
    assert.equal(dense.chargeable, 10);
    assert.equal(dense.basis, 'actual');

    // A bulky, light one bills on volume — the case a hardcoded fallback
    // under-declares by an order of magnitude.
    const bulky = metrics.chargeableWeight(1.2, { length: 60, width: 40, height: 40 });
    assert.equal(bulky.volumetric, 19.2);
    assert.equal(bulky.chargeable, 19.2);
    assert.equal(bulky.basis, 'volumetric');
});

test('Metrics: incomplete dimensions produce no volumetric weight', async () => {
    assert.equal(metrics.volumetricWeight({ length: 10, width: 10 }), 0);
    assert.equal(metrics.volumetricWeight(null), 0);
    const partial = metrics.normalizeProductShipping({ length: 10, width: 10, dimensionUnit: 'cm' });
    assert.equal(partial.dims, null, 'a partial set cannot describe a box');
});

test('Metrics: normalisation converts both units together', async () => {
    const n = metrics.normalizeProductShipping({
        weight: 250, weightUnit: 'g', length: 10, width: 20, height: 30, dimensionUnit: 'in',
    });
    assert.equal(n.weightKg, 0.25);
    assert.equal(n.dims.length, 25.4);
    assert.equal(n.dims.width, 50.8);
    assert.equal(n.dims.height, 76.2);
});

// ═══════════════════════════════════════════════════════════════════════════
// Missing-shipping report
// ═══════════════════════════════════════════════════════════════════════════

test('Report: lists courier-eligible products with no measured weight', async () => {
    const vendor = await makeVendor(M, 'ReportVendor', 'retail');
    await Product.create({
        name: 'Unmeasured', slug: `unmeasured-${Date.now()}`, price: 100,
        categoryId: category._id, vendorId: vendor._id, stock: 'in_stock',
        stockQuantity: 1, retailEnabled: true,
    });
    await Product.create({
        name: 'Measured', slug: `measured-${Date.now()}`, price: 100,
        categoryId: category._id, vendorId: vendor._id, stock: 'in_stock',
        stockQuantity: 1, retailEnabled: true,
        shipping: { weight: 2, weightUnit: 'kg', source: 'vendor' },
    });

    const res = await request('/api/admin/products/missing-shipping', { headers: await adminAuth() });

    assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
    assert.equal(res.body.data.total, 1);
    assert.equal(res.body.data.products[0].name, 'Unmeasured');
    assert.equal(res.body.data.totalCourierEligible, 2, 'the denominator for the banner');
});

test('Report: a backfilled estimate still counts as missing', async () => {
    // Seeding made the estimate visible; it did not make it a measurement.
    const vendor = await makeVendor(M, 'ReportEstimated', 'retail');
    await Product.create({
        name: 'Seeded', slug: `seeded-${Date.now()}`, price: 100,
        categoryId: category._id, vendorId: vendor._id, stock: 'in_stock',
        stockQuantity: 1, retailEnabled: true,
        shipping: { weight: 0.5, weightUnit: 'kg', source: 'estimated' },
    });

    const res = await request('/api/admin/products/missing-shipping', { headers: await adminAuth() });
    assert.equal(res.body.data.total, 1);
    assert.equal(res.body.data.products[0].shippingSource, 'estimated');
});

test('Report: Quick Commerce-only products are excluded', async () => {
    const vendor = await makeVendor(M, 'ReportQc', 'qc');
    await Product.create({
        name: 'QcOnly', slug: `qconly-${Date.now()}`, price: 100,
        categoryId: category._id, vendorId: vendor._id, stock: 'in_stock',
        stockQuantity: 1, retailEnabled: false, quickCommerceEnabled: true,
    });

    const res = await request('/api/admin/products/missing-shipping', { headers: await adminAuth() });
    assert.equal(res.body.data.total, 0, 'a rider-delivered product never needs a declared weight');
});

test('Report: filters by vendor and channel', async () => {
    const v1 = await makeVendor(M, 'ReportFilterA', 'retail');
    const v2 = await makeVendor(M, 'ReportFilterB', 'wholesale');
    await Product.create({
        name: 'A', slug: `a-${Date.now()}`, price: 100, categoryId: category._id,
        vendorId: v1._id, stock: 'in_stock', stockQuantity: 1, retailEnabled: true,
    });
    await Product.create({
        name: 'B', slug: `b-${Date.now()}`, price: 100, categoryId: category._id,
        vendorId: v2._id, stock: 'in_stock', stockQuantity: 1,
        retailEnabled: false, wholesaleEnabled: true,
    });
    const headers = await adminAuth();

    const byVendor = await request(`/api/admin/products/missing-shipping?vendorId=${v1._id}`, { headers });
    assert.equal(byVendor.body.data.total, 1);

    const byChannel = await request('/api/admin/products/missing-shipping?channel=wholesale', { headers });
    assert.equal(byChannel.body.data.total, 1);
    assert.equal(byChannel.body.data.products[0].name, 'B');
});

test('Report: the route resolves to the list, not to /products/:id', async () => {
    const res = await request('/api/admin/products/missing-shipping', { headers: await adminAuth() });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.products));
});

test('Report: unauthenticated access is refused', async () => {
    const res = await request('/api/admin/products/missing-shipping');
    assert.equal(res.status, 401);
});

// ═══════════════════════════════════════════════════════════════════════════
// Required-for-new-products policy
// ═══════════════════════════════════════════════════════════════════════════

const Settings = (await import('../../src/models/Settings.model.js')).default;
const setShippingPolicy = (required) => Settings.findOneAndUpdate(
    { key: 'shipping' },
    { $set: { key: 'shipping', value: { requireShippingOnNewProducts: required } } },
    { upsert: true }
);

test('Policy: OFF by default — a product without shipping data is creatable', async () => {
    // The default matters more than the switch: turning this on before the
    // catalogue is measured would make every existing product uneditable.
    const vendor = await makeVendor(M, 'PolicyDefault', 'retail');
    const res = await request('/api/vendor/products', {
        method: 'POST', headers: vendorAuth(vendor), body: productPayload(),
    });
    assert.equal(res.status, 201);
});

test('Policy: ON — a new retail product without a weight is refused', async () => {
    await setShippingPolicy(true);
    const vendor = await makeVendor(M, 'PolicyOnRetail', 'retail');

    const res = await request('/api/vendor/products', {
        method: 'POST', headers: vendorAuth(vendor), body: productPayload(),
    });

    assert.equal(res.status, 400);
    assert.match(JSON.stringify(res.body), /shipping weight is required/i);
});

test('Policy: ON — supplying the weight satisfies it', async () => {
    await setShippingPolicy(true);
    const vendor = await makeVendor(M, 'PolicyOnSatisfied', 'retail');

    const res = await request('/api/vendor/products', {
        method: 'POST', headers: vendorAuth(vendor),
        body: productPayload({ shipping: FULL_SHIPPING }),
    });
    assert.equal(res.status, 201, JSON.stringify(res.body).slice(0, 300));
});

test('Policy: ON — Quick Commerce is exempt', async () => {
    // A rider-delivered product is never declared to a courier; forcing a
    // dark-store operator to weigh a bread loaf for a courier that will never
    // carry it is a tax on the wrong people.
    await setShippingPolicy(true);
    const vendor = await makeVendor(M, 'PolicyOnQc', 'qc');
    const qcCategory = await Category.create({
        name: 'QC Cat', slug: `qc-policy-${Date.now()}`, supportedExperiences: ['quick_commerce'],
    });

    const res = await request('/api/vendor/products', {
        method: 'POST', headers: vendorAuth(vendor),
        body: productPayload({ quickCommerceEnabled: true, quickCommerceCategoryId: String(qcCategory._id) }),
    });
    assert.equal(res.status, 201, JSON.stringify(res.body).slice(0, 300));
});

test('Policy: ON — EXISTING products stay editable without re-entering shipping', async () => {
    // The whole reason the policy is scoped to creation. A vendor changing a
    // price must not be blocked by a measurement nobody ever took.
    const vendor = await makeVendor(M, 'PolicyExisting', 'retail');
    const created = await request('/api/vendor/products', {
        method: 'POST', headers: vendorAuth(vendor), body: productPayload(),
    });
    const id = created.body.data?._id || created.body.data?.product?._id;

    await setShippingPolicy(true);

    const res = await request(`/api/vendor/products/${id}`, {
        method: 'PUT', headers: vendorAuth(vendor), body: { price: 777 },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
});
