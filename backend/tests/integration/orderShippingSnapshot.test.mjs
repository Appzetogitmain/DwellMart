/**
 * Order shipping snapshot — integration suite.
 *
 * Drives the REAL `OrderSplitterEngine` inside a REAL MongoDB transaction, via
 * `MongoMemoryReplSet`. That is not gold-plating: the splitter is the only code
 * that produces the document shape every live order actually has, and testing it
 * with a hand-built fixture is exactly what hid the Quick Commerce routing
 * defect until a mixed cart was run through the genuine article.
 *
 * The snapshot is the point of the suite. A vendor correcting a product's weight
 * next month must not retroactively change what an already-despatched
 * consignment was declared with.
 *
 * Run with:  npm run test:order-snapshot
 */

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
process.env.MONGO_URI              = rs.getUri();
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

await mongoose.connect(process.env.MONGO_URI, { dbName: 'dwellmart_snapshot_test' });

import { installFetchStub, setDtdcHandlers, defaultHandlers } from './_dtdcHarness.mjs';
installFetchStub();
setDtdcHandlers(defaultHandlers());

const Product   = (await import('../../src/models/Product.model.js')).default;
const Vendor    = (await import('../../src/models/Vendor.model.js')).default;
const Order     = (await import('../../src/models/Order.model.js')).default;
const Category  = (await import('../../src/models/Category.model.js')).default;
const Settings  = (await import('../../src/models/Settings.model.js')).default;
const { CheckoutSession } = await import('../../src/models/CheckoutSession.model.js');
const { splitAndCreateOrders } = await import('../../src/services/checkout/OrderSplitterEngine.js');
const { resolveDeliveryProvider } = await import('../../src/services/shipping/deliveryProvider.js');
const { invalidateFeatureFlags } = await import('../../src/services/featureFlags.service.js');

after(async () => {
    await mongoose.disconnect();
    await rs.stop();
});

let category;
let seq = 0;

beforeEach(async () => {
    const collections = await mongoose.connection.db.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));

    await Settings.findOneAndUpdate(
        { key: 'features' },
        { $set: { key: 'features', value: { wholesaleMarketplaceEnabled: true, quickCommerceEnabled: true } } },
        { upsert: true }
    );
    invalidateFeatureFlags();

    category = await Category.create({ name: 'QA', slug: `qa-${++seq}-${Date.now()}` });
});

// ── Fixtures ────────────────────────────────────────────────────────────────

const CHANNELS = {
    retail:    { retail: { status: 'active' },   wholesale: { status: 'disabled' }, quickCommerce: { status: 'disabled' } },
    wholesale: { retail: { status: 'disabled' }, wholesale: { status: 'active' },   quickCommerce: { status: 'disabled' } },
    qc:        { retail: { status: 'disabled' }, wholesale: { status: 'disabled' }, quickCommerce: { status: 'active' } },
};

const makeVendor = async (name, channelSet = 'retail', qc = false) => Vendor.create({
    name, email: `${name}-${++seq}@qa.test`, password: 'xxxxxxxx', storeName: name, phone: '9999999999',
    status: 'approved', isVerified: true, isActive: true, channels: CHANNELS[channelSet],
    address: { street: '1 A', city: 'Hyderabad', state: 'TS', zipCode: '500001', country: 'India' },
    ...(qc ? { quickCommerceProfile: {
        storeType: 'dark_store',
        location: { type: 'Point', coordinates: [78.45, 17.43] },
        availabilityStatus: 'open',
    } } : {}),
});

const makeProduct = async (name, vendor, extra = {}) => Product.create({
    name, slug: `${name.toLowerCase()}-${++seq}`, price: 500, categoryId: category._id, vendorId: vendor._id,
    stock: 'in_stock', stockQuantity: 500, status: 'approved', isActive: true, ...extra,
});

const ADDRESS = {
    name: 'Ravi', phone: '9777777777', address: '5 Park St',
    city: 'New Delhi', state: 'Delhi', zipCode: '110001', country: 'India',
};

const checkout = async (items) => {
    const sessionId = `CS-SNAP-${++seq}`;
    await CheckoutSession.create({
        sessionId, paymentMethod: 'cod', status: 'pending', shippingAddress: ADDRESS,
    });
    await splitAndCreateOrders({
        sessionId, items, shippingAddress: ADDRESS, paymentMethod: 'cod',
        customerLocation: { latitude: 17.44, longitude: 78.46 },
    });
    return Order.find({}).lean();
};

const line = (product, quantity = 1, fulfillmentType = 'retail') => ({
    productId: String(product._id), quantity, fulfillmentType, price: 500, name: product.name,
});

// ═══════════════════════════════════════════════════════════════════════════
// Normalisation onto the order line
// ═══════════════════════════════════════════════════════════════════════════

test('Snapshot: 250 g on the product becomes 0.25 kg on the order line', async () => {
    const vendor = await makeVendor('GramSeller', 'retail');
    const product = await makeProduct('Spice', vendor, {
        retailEnabled: true,
        shipping: { weight: 250, weightUnit: 'g', length: 10, width: 10, height: 5, dimensionUnit: 'cm' },
    });

    const [order] = await checkout([line(product)]);
    assert.equal(order.items[0].shippingWeightKg, 0.25);
});

test('Snapshot: 1 kg stays 1 kg', async () => {
    const vendor = await makeVendor('KgSeller', 'retail');
    const product = await makeProduct('Book', vendor, {
        retailEnabled: true,
        shipping: { weight: 1, weightUnit: 'kg', length: 20, width: 15, height: 5, dimensionUnit: 'cm' },
    });

    const [order] = await checkout([line(product)]);
    assert.equal(order.items[0].shippingWeightKg, 1);
});

test('Snapshot: 10 x 20 x 30 inches becomes 25.4 x 50.8 x 76.2 cm', async () => {
    const vendor = await makeVendor('InchSeller', 'retail');
    const product = await makeProduct('Crate', vendor, {
        retailEnabled: true,
        shipping: { weight: 5, weightUnit: 'kg', length: 10, width: 20, height: 30, dimensionUnit: 'in' },
    });

    const [order] = await checkout([line(product)]);
    const dims = order.items[0].shippingDims;
    assert.equal(dims.length, 25.4);
    assert.equal(dims.width, 50.8);
    assert.equal(dims.height, 76.2);
});

test('Snapshot: a product with no measurements leaves the fields absent', async () => {
    // `undefined` must keep meaning "never measured" rather than "measured as
    // zero" — the payload builder branches on exactly that distinction.
    const vendor = await makeVendor('NoDataSeller', 'retail');
    const product = await makeProduct('Mystery', vendor, { retailEnabled: true });

    const [order] = await checkout([line(product)]);
    assert.equal(order.items[0].shippingWeightKg, undefined);
    assert.equal(order.items[0].shippingDims, undefined);
});

test('Snapshot: a partial dimension set is recorded as no dimensions at all', async () => {
    const vendor = await makeVendor('PartialSeller', 'retail');
    const product = await makeProduct('HalfMeasured', vendor, {
        retailEnabled: true,
        shipping: { weight: 2, weightUnit: 'kg', length: 10, width: 10, dimensionUnit: 'cm' },
    });

    const [order] = await checkout([line(product)]);
    assert.equal(order.items[0].shippingWeightKg, 2, 'the weight is still usable');
    assert.equal(order.items[0].shippingDims, undefined, 'two axes cannot describe a box');
});

// ═══════════════════════════════════════════════════════════════════════════
// Immutability — the reason this is a snapshot
// ═══════════════════════════════════════════════════════════════════════════

test('Snapshot: changing the product later does NOT rewrite an existing order', async () => {
    const vendor = await makeVendor('MutatingSeller', 'retail');
    const product = await makeProduct('Kettle', vendor, {
        retailEnabled: true,
        shipping: { weight: 2.4, weightUnit: 'kg', length: 30, width: 20, height: 15, dimensionUnit: 'cm' },
    });

    const [order] = await checkout([line(product)]);
    assert.equal(order.items[0].shippingWeightKg, 2.4);

    // The vendor re-measures and corrects the catalogue.
    await Product.updateOne(
        { _id: product._id },
        { $set: { 'shipping.weight': 5, 'shipping.length': 60 } }
    );

    const reloaded = await Order.findById(order._id).lean();
    assert.equal(reloaded.items[0].shippingWeightKg, 2.4, 'the despatched declaration is history, not a live read');
    assert.equal(reloaded.items[0].shippingDims.length, 30);

    // ...and a NEW order picks up the corrected figure.
    const [, next] = await Promise.all([null, checkout([line(product)])]).then(([, orders]) => [null, orders.find((o) => String(o._id) !== String(order._id))]);
    assert.equal(next.items[0].shippingWeightKg, 5);
});

// ═══════════════════════════════════════════════════════════════════════════
// Order shapes
// ═══════════════════════════════════════════════════════════════════════════

test('Snapshot: multiple lines each carry their own parcel data', async () => {
    const vendor = await makeVendor('MultiLineSeller', 'retail');
    const heavy = await makeProduct('Anvil', vendor, {
        retailEnabled: true,
        shipping: { weight: 12, weightUnit: 'kg', length: 30, width: 20, height: 20, dimensionUnit: 'cm' },
    });
    const light = await makeProduct('Feather', vendor, {
        retailEnabled: true,
        shipping: { weight: 40, weightUnit: 'g', length: 10, width: 5, height: 2, dimensionUnit: 'cm' },
    });

    const [order] = await checkout([line(heavy), line(light, 3)]);
    const byName = Object.fromEntries(order.items.map((i) => [i.name, i]));
    assert.equal(byName.Anvil.shippingWeightKg, 12);
    assert.equal(byName.Feather.shippingWeightKg, 0.04);
    assert.equal(byName.Feather.quantity, 3, 'per-unit weight is stored; quantity is applied at booking');
});

test('Snapshot: a split order carries parcel data on every seller\'s slice', async () => {
    const v1 = await makeVendor('SplitOne', 'retail');
    const v2 = await makeVendor('SplitTwo', 'retail');
    const p1 = await makeProduct('WidgetOne', v1, {
        retailEnabled: true,
        shipping: { weight: 1.5, weightUnit: 'kg', length: 20, width: 10, height: 10, dimensionUnit: 'cm' },
    });
    const p2 = await makeProduct('WidgetTwo', v2, {
        retailEnabled: true,
        shipping: { weight: 3, weightUnit: 'kg', length: 40, width: 30, height: 20, dimensionUnit: 'cm' },
    });

    const orders = await checkout([line(p1), line(p2)]);
    assert.equal(orders.length, 2, 'one order per seller');

    const weights = orders.map((o) => o.items[0].shippingWeightKg).sort((a, b) => a - b);
    assert.deepEqual(weights, [1.5, 3]);
});

test('Snapshot: wholesale orders carry it too', async () => {
    const vendor = await makeVendor('WholesaleSnap', 'wholesale');
    const product = await makeProduct('BulkBox', vendor, {
        wholesaleEnabled: true,
        wholesale: { moqEnabled: true, moq: 10, priceTiers: [{ minQty: 10, price: 400 }] },
        shipping: { weight: 800, weightUnit: 'g', length: 25, width: 25, height: 25, dimensionUnit: 'cm' },
    });

    const [order] = await checkout([line(product, 10, 'wholesale')]);
    assert.equal(order.fulfillmentType, 'wholesale');
    assert.equal(order.items[0].shippingWeightKg, 0.8);
    assert.equal(resolveDeliveryProvider(order, order.vendorId).provider, 'dtdc');
});

test('Snapshot: a Quick Commerce order may carry it but is still rider-delivered', async () => {
    // Harmless to snapshot — and safer than special-casing the splitter — but
    // it must not influence routing by so much as an inch.
    const vendor = await makeVendor('QcSnap', 'qc', true);
    const product = await makeProduct('MilkPacket', vendor, {
        quickCommerceEnabled: true,
        shipping: { weight: 400, weightUnit: 'g', length: 10, width: 10, height: 20, dimensionUnit: 'cm' },
    });

    const [order] = await checkout([line(product, 2, 'quick_commerce')]);
    assert.equal(order.fulfillmentType, 'quick_commerce');
    assert.equal(
        resolveDeliveryProvider(order, order.vendorId).provider, 'internal',
        'parcel data never overrides the channel'
    );
});

test('Snapshot: a mixed cart snapshots each channel\'s order independently', async () => {
    const rv = await makeVendor('MixedRetail', 'retail');
    const wv = await makeVendor('MixedWholesale', 'wholesale');
    const qv = await makeVendor('MixedQc', 'qc', true);

    const rp = await makeProduct('MixRetail', rv, {
        retailEnabled: true,
        shipping: { weight: 1, weightUnit: 'kg', length: 20, width: 20, height: 20, dimensionUnit: 'cm' },
    });
    const wp = await makeProduct('MixBulk', wv, {
        wholesaleEnabled: true,
        wholesale: { moqEnabled: true, moq: 10, priceTiers: [{ minQty: 10, price: 400 }] },
        shipping: { weight: 2, weightUnit: 'kg', length: 30, width: 30, height: 30, dimensionUnit: 'cm' },
    });
    const qp = await makeProduct('MixMilk', qv, {
        quickCommerceEnabled: true,
        shipping: { weight: 500, weightUnit: 'g', length: 10, width: 10, height: 10, dimensionUnit: 'cm' },
    });

    const orders = await checkout([
        line(rp, 1, 'retail'),
        line(wp, 10, 'wholesale'),
        line(qp, 2, 'quick_commerce'),
    ]);

    assert.equal(orders.length, 3);
    const byChannel = Object.fromEntries(orders.map((o) => [o.fulfillmentType, o]));
    assert.equal(byChannel.retail.items[0].shippingWeightKg, 1);
    assert.equal(byChannel.wholesale.items[0].shippingWeightKg, 2);
    assert.equal(byChannel.quick_commerce.items[0].shippingWeightKg, 0.5);

    assert.equal(resolveDeliveryProvider(byChannel.retail, byChannel.retail.vendorId).provider, 'dtdc');
    assert.equal(resolveDeliveryProvider(byChannel.wholesale, byChannel.wholesale.vendorId).provider, 'dtdc');
    assert.equal(resolveDeliveryProvider(byChannel.quick_commerce, byChannel.quick_commerce.vendorId).provider, 'internal');
});

// ═══════════════════════════════════════════════════════════════════════════
// The snapshot must be purely additive
// ═══════════════════════════════════════════════════════════════════════════

test('Regression: pricing, tiers and totals are unchanged by the snapshot', async () => {
    const vendor = await makeVendor('PricingIntact', 'wholesale');
    const product = await makeProduct('TieredBox', vendor, {
        wholesaleEnabled: true,
        wholesale: { moqEnabled: true, moq: 10, priceTiers: [{ minQty: 10, price: 400 }] },
        shipping: { weight: 1, weightUnit: 'kg', length: 10, width: 10, height: 10, dimensionUnit: 'cm' },
    });

    const [order] = await checkout([line(product, 10, 'wholesale')]);
    assert.equal(order.subtotal, 4000, 'the ₹400 tier still applies — 10 × 400, not 10 × 500');
    assert.equal(order.items[0].price, 400);
    assert.equal(order.items[0].pricingType, 'wholesale');
    assert.equal(order.items[0].appliedTier.price, 400);
});

test('Regression: channel attribution and vendor slices are unchanged', async () => {
    const vendor = await makeVendor('AttributionIntact', 'retail');
    const product = await makeProduct('PlainWidget', vendor, {
        retailEnabled: true,
        shipping: { weight: 1, weightUnit: 'kg', length: 10, width: 10, height: 10, dimensionUnit: 'cm' },
    });

    const [order] = await checkout([line(product)]);
    assert.equal(order.fulfillmentType, 'retail');
    assert.equal(order.vendorItems.length, 1);
    assert.equal(order.vendorItems[0].fulfillmentType, 'retail');
    assert.equal(String(order.vendorItems[0].vendorId), String(vendor._id));
});

test('Regression: a catalogue with no shipping data anywhere still checks out', async () => {
    // The single most important backward-compatibility case: every product in
    // the live catalogue is currently in exactly this state.
    const vendor = await makeVendor('LegacyCatalogue', 'retail');
    const a = await makeProduct('LegacyA', vendor, { retailEnabled: true });
    const b = await makeProduct('LegacyB', vendor, { retailEnabled: true });

    const [order] = await checkout([line(a), line(b, 2)]);
    assert.equal(order.items.length, 2);
    assert.equal(order.total > 0, true);
    assert.equal(order.items.every((i) => i.shippingWeightKg === undefined), true);
});
