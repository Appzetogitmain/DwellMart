/**
 * Parcel declaration — integration suite.
 *
 * Covers what the courier is actually TOLD about a box: weight, dimensions,
 * chargeable weight, and where each number came from.
 *
 * Kept separate from dtdcDelivery.test.mjs because the concerns differ: that
 * suite proves the booking lifecycle works, this one proves the numbers inside
 * it are right and honestly labelled. The money is in this file — DTDC bills on
 * the higher of actual and volumetric weight, and every parcel used to be
 * declared at a hardcoded 0.5 kg and 20x15x10 cm.
 *
 * Run with:  npm run test:parcel
 */

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongod = await MongoMemoryServer.create();
process.env.MONGO_URI              = `${mongod.getUri()}dwellmart_parcel_test`;
process.env.NODE_ENV               = 'test';
process.env.JWT_SECRET             = 'integration-test-jwt-secret-value';
process.env.JWT_REFRESH_SECRET     = 'integration-test-jwt-refresh-secret';
process.env.CLOUDINARY_CLOUD_NAME  = 'test';
process.env.CLOUDINARY_API_KEY     = 'test';
process.env.CLOUDINARY_API_SECRET  = 'test';
process.env.DTDC_ENVIRONMENT       = 'sandbox';
process.env.DTDC_CUSTOMER_CODE     = 'TEST_CUSTOMER';
process.env.DTDC_API_KEY           = 'test-api-key';
process.env.DTDC_TRACKING_USERNAME = 'test-user';
process.env.DTDC_TRACKING_PASSWORD = 'test-pass';

import {
    installFetchStub, setDtdcHandlers, defaultHandlers,
    dtdcCalls, clearDtdcCalls, resetAwbSequence, jsonResponse,
} from './_dtdcHarness.mjs';
import { models, makeVendor, makeOrder, resetPlanCache } from './_dtdcFixtures.mjs';

await mongoose.connect(process.env.MONGO_URI);
const realFetch = global.fetch;
installFetchStub();
setDtdcHandlers(defaultHandlers());

const { default: app } = await import('../../src/app.js');
const { generateTokens } = await import('../../src/utils/generateToken.js');
const shipmentService = await import('../../src/services/shipping/dtdcShipment.service.js');
const metrics = await import('../../src/services/shipping/parcelMetrics.js');

const M = await models();
let server;
let baseUrl;

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
    clearDtdcCalls();
    resetAwbSequence();
    setDtdcHandlers(defaultHandlers());
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

const bookingCalls = () => dtdcCalls.filter((c) => c.kind === 'booking');
const sentPayload = () => bookingCalls()[0].body.consignments[0];

/** An order line carrying the snapshot the checkout splitter would have written. */
const measuredLine = (weightKg, dims, quantity = 1) => ({
    name: 'Measured', quantity, price: 500,
    ...(weightKg ? { shippingWeightKg: weightKg } : {}),
    ...(dims ? { shippingDims: dims } : {}),
});

const orderWith = async (vendor, items, overrides = {}) => makeOrder(M, {
    fulfillmentType: 'retail', vendorId: vendor._id, status: 'confirmed', items, ...overrides,
});

// ═══════════════════════════════════════════════════════════════════════════
// Catalogue data reaching the carrier
// ═══════════════════════════════════════════════════════════════════════════

test('Catalogue weight and dimensions reach the consignment', async () => {
    const vendor = await makeVendor(M, 'CatalogueParcel', 'retail');
    const order = await orderWith(vendor, [measuredLine(2.4, { length: 30, width: 20, height: 15 })]);

    const shipment = await shipmentService.bookDtdcShipment(order, vendor);
    const payload = sentPayload();

    assert.equal(payload.weight, 2.4);
    assert.equal(payload.length, 30);
    assert.equal(payload.width, 20);
    assert.equal(payload.height, 15);
    assert.equal(shipment.weightSource, 'catalogue');
});

test('A product with no measurements falls back AND records that it guessed', async () => {
    const vendor = await makeVendor(M, 'EstimatedParcel', 'retail');
    const order = await orderWith(vendor, [{ name: 'Unmeasured', quantity: 1, price: 500 }]);

    const shipment = await shipmentService.bookDtdcShipment(order, vendor);
    const payload = sentPayload();

    assert.equal(payload.weight, metrics.FALLBACK_WEIGHT_KG);
    assert.equal(payload.length, metrics.FALLBACK_DIMENSIONS_CM.length);
    assert.equal(payload.width, metrics.FALLBACK_DIMENSIONS_CM.width);
    assert.equal(payload.height, metrics.FALLBACK_DIMENSIONS_CM.height);
    assert.equal(shipment.weightSource, 'estimated', 'a guess must be recorded as a guess');
});

test('Weight is multiplied by quantity', async () => {
    const vendor = await makeVendor(M, 'QuantityParcel', 'retail');
    const order = await orderWith(vendor, [measuredLine(1.25, { length: 20, width: 20, height: 20 }, 4)]);

    await shipmentService.bookDtdcShipment(order, vendor);
    assert.equal(sentPayload().weight, 5);
});

test('A mixed line-set with one unmeasured item is still flagged estimated', async () => {
    const vendor = await makeVendor(M, 'PartlyMeasured', 'retail');
    const order = await orderWith(vendor, [
        measuredLine(2, { length: 20, width: 20, height: 20 }),
        { name: 'Unmeasured', quantity: 1, price: 500 },
    ]);

    const shipment = await shipmentService.bookDtdcShipment(order, vendor);
    assert.equal(sentPayload().weight, 2.5, 'the measured line plus a fallback for the other');
    assert.equal(shipment.weightSource, 'estimated', 'any guess makes the whole parcel a guess');
});

// ═══════════════════════════════════════════════════════════════════════════
// Dimensions — no invented stacking
// ═══════════════════════════════════════════════════════════════════════════

test('A multi-item box uses default dimensions rather than invented stacking', async () => {
    // Three 20 cm boxes are not one 60 cm box. No formula here would be right;
    // a vendor confirming the packed carton is the honest answer.
    const vendor = await makeVendor(M, 'MultiItemParcel', 'retail');
    const order = await orderWith(vendor, [
        measuredLine(1, { length: 20, width: 20, height: 20 }),
        measuredLine(2, { length: 30, width: 30, height: 30 }),
    ]);

    const shipment = await shipmentService.bookDtdcShipment(order, vendor);
    const payload = sentPayload();

    assert.equal(payload.weight, 3, 'weights DO sum');
    assert.equal(payload.length, metrics.FALLBACK_DIMENSIONS_CM.length, 'dimensions do not');
    assert.equal(payload.height, metrics.FALLBACK_DIMENSIONS_CM.height);
    assert.equal(shipment.weightSource, 'catalogue', 'the weight is still real');
});

test('A single line of quantity greater than one also falls back on dimensions', async () => {
    const vendor = await makeVendor(M, 'MultiQtyParcel', 'retail');
    const order = await orderWith(vendor, [measuredLine(1, { length: 25, width: 25, height: 25 }, 3)]);

    await shipmentService.bookDtdcShipment(order, vendor);
    const payload = sentPayload();
    assert.equal(payload.weight, 3);
    assert.equal(payload.length, metrics.FALLBACK_DIMENSIONS_CM.length,
        'three units do not fit the box that holds one');
});

// ═══════════════════════════════════════════════════════════════════════════
// Chargeable weight — what the invoice will say
// ═══════════════════════════════════════════════════════════════════════════

test('Volumetric weight wins when the parcel is bulky and light', async () => {
    const vendor = await makeVendor(M, 'VolumetricParcel', 'retail');
    // 60 x 40 x 40 / 5000 = 19.2 kg volumetric against 1.2 kg actual.
    const order = await orderWith(vendor, [measuredLine(1.2, { length: 60, width: 40, height: 40 })]);

    const shipment = await shipmentService.bookDtdcShipment(order, vendor);
    assert.equal(shipment.weight, 1.2, 'the declared weight is the actual weight');
    assert.equal(shipment.volumetricWeight, 19.2);
    assert.equal(shipment.chargeableWeight, 19.2, 'and this is what the invoice will say');
});

test('Actual weight wins when the parcel is dense', async () => {
    const vendor = await makeVendor(M, 'DenseParcel', 'retail');
    const order = await orderWith(vendor, [measuredLine(12, { length: 20, width: 15, height: 10 })]);

    const shipment = await shipmentService.bookDtdcShipment(order, vendor);
    assert.equal(shipment.volumetricWeight, 0.6);
    assert.equal(shipment.chargeableWeight, 12);
});

// ═══════════════════════════════════════════════════════════════════════════
// Booking-time override
// ═══════════════════════════════════════════════════════════════════════════

test('Override: vendor figures beat the catalogue and are recorded as theirs', async () => {
    const vendor = await makeVendor(M, 'OverrideParcel', 'retail');
    const order = await orderWith(vendor, [measuredLine(2.4, { length: 30, width: 20, height: 15 })]);

    const shipment = await shipmentService.bookDtdcShipment(order, vendor, null, {
        weight: 3, weightUnit: 'kg', length: 40, width: 30, height: 20, dimensionUnit: 'cm',
    });

    const payload = sentPayload();
    assert.equal(payload.weight, 3);
    assert.equal(payload.length, 40);
    assert.equal(shipment.weightSource, 'vendor');
});

test('Override: it applies to this shipment only, leaving the order snapshot intact', async () => {
    const vendor = await makeVendor(M, 'OverrideIsolation', 'retail');
    const order = await orderWith(vendor, [measuredLine(2.4, { length: 30, width: 20, height: 15 })]);

    await shipmentService.bookDtdcShipment(order, vendor, null, { weight: 9, weightUnit: 'kg' });

    const reloaded = await M.Order.findById(order._id).lean();
    assert.equal(reloaded.items[0].shippingWeightKg, 2.4, 'the order snapshot is history');
});

test('Override: grams are accepted and normalised', async () => {
    const vendor = await makeVendor(M, 'OverrideGrams', 'retail');
    const order = await orderWith(vendor, [{ name: 'Unmeasured', quantity: 1, price: 500 }]);

    await shipmentService.bookDtdcShipment(order, vendor, null, { weight: 750, weightUnit: 'g' });
    assert.equal(sentPayload().weight, 0.75);
});

test('Override: inches are accepted and normalised', async () => {
    const vendor = await makeVendor(M, 'OverrideInches', 'retail');
    const order = await orderWith(vendor, [{ name: 'Unmeasured', quantity: 1, price: 500 }]);

    await shipmentService.bookDtdcShipment(order, vendor, null, {
        weight: 2, weightUnit: 'kg', length: 10, width: 20, height: 30, dimensionUnit: 'in',
    });

    const payload = sentPayload();
    assert.equal(payload.length, 25.4);
    assert.equal(payload.width, 50.8);
    assert.equal(payload.height, 76.2);
});

test('Override: an invalid value is refused BEFORE the carrier is called', async () => {
    const vendor = await makeVendor(M, 'OverrideInvalid', 'retail');
    const order = await orderWith(vendor, [measuredLine(1, { length: 10, width: 10, height: 10 })]);

    clearDtdcCalls();
    await assert.rejects(
        () => shipmentService.bookDtdcShipment(order, vendor, null, { weight: -5, weightUnit: 'kg' }),
        /invalid package details/i
    );
    assert.equal(bookingCalls().length, 0, 'nothing invalid may reach DTDC');
    assert.equal(await M.Shipment.countDocuments({ orderId: order._id }), 0, 'and no slot is claimed');
});

test('Override: a partial dimension set is refused', async () => {
    const vendor = await makeVendor(M, 'OverridePartial', 'retail');
    const order = await orderWith(vendor, [measuredLine(1, { length: 10, width: 10, height: 10 })]);

    await assert.rejects(
        () => shipmentService.bookDtdcShipment(order, vendor, null, { length: 40, width: 30 }),
        /all three dimensions/i
    );
});

test('Override: an absurd weight is refused with the same bound as the product form', async () => {
    const vendor = await makeVendor(M, 'OverrideHuge', 'retail');
    const order = await orderWith(vendor, [measuredLine(1, { length: 10, width: 10, height: 10 })]);

    await assert.rejects(
        () => shipmentService.bookDtdcShipment(order, vendor, null, { weight: 500000, weightUnit: 'kg' }),
        /invalid package details/i
    );
});

test('Override: an invalid unit is refused', async () => {
    const vendor = await makeVendor(M, 'OverrideBadUnit', 'retail');
    const order = await orderWith(vendor, [measuredLine(1, { length: 10, width: 10, height: 10 })]);

    await assert.rejects(
        () => shipmentService.bookDtdcShipment(order, vendor, null, { weight: 2, weightUnit: 'lbs' }),
        /invalid package details/i
    );
});

test('Override: applied on a retry after a failed booking, it still records vendor source', async () => {
    // $setOnInsert does not fire on the retry, so the row must be updated when
    // the AWB lands — otherwise the shipment keeps the first attempt's figures.
    setDtdcHandlers({
        ...defaultHandlers(),
        booking: () => jsonResponse({ status: 'ERROR', data: [{ success: false, message: 'down' }] }),
    });

    const vendor = await makeVendor(M, 'OverrideRetry', 'retail');
    const order = await orderWith(vendor, [{ name: 'Unmeasured', quantity: 1, price: 500 }]);

    await assert.rejects(() => shipmentService.bookDtdcShipment(order, vendor));

    setDtdcHandlers(defaultHandlers());
    const shipment = await shipmentService.bookDtdcShipment(
        await M.Order.findById(order._id), vendor, null,
        { weight: 4, weightUnit: 'kg', length: 50, width: 40, height: 30, dimensionUnit: 'cm' }
    );

    assert.equal(shipment.weightSource, 'vendor');
    assert.equal(shipment.weight, 4);
    assert.equal(shipment.dimensions.length, 50);
});

test('Override: reaches the service through the vendor HTTP endpoint', async () => {
    const vendor = await makeVendor(M, 'OverrideHttp', 'retail');
    const order = await orderWith(vendor, [measuredLine(1, { length: 10, width: 10, height: 10 })]);

    const res = await request(`/api/vendor/orders/${order._id}/book-dtdc`, {
        method: 'POST', headers: vendorAuth(vendor),
        body: { weight: 7, weightUnit: 'kg', length: 45, width: 35, height: 25, dimensionUnit: 'cm' },
    });

    assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 300));
    assert.equal(res.body.data.weightSource, 'vendor');
    assert.equal(sentPayload().weight, 7);
});

test('Override: an invalid one over HTTP is a 4xx, not a booked parcel', async () => {
    const vendor = await makeVendor(M, 'OverrideHttpBad', 'retail');
    const order = await orderWith(vendor, [measuredLine(1, { length: 10, width: 10, height: 10 })]);

    clearDtdcCalls();
    const res = await request(`/api/vendor/orders/${order._id}/book-dtdc`, {
        method: 'POST', headers: vendorAuth(vendor), body: { weight: -3, weightUnit: 'kg' },
    });

    assert.ok(res.status >= 400, `expected a rejection, got ${res.status}`);
    assert.equal(bookingCalls().length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// Package preview
// ═══════════════════════════════════════════════════════════════════════════

test('Preview: reports what would be declared, and that it is estimated', async () => {
    const vendor = await makeVendor(M, 'PreviewEstimated', 'retail');
    const order = await orderWith(vendor, [{ name: 'Unmeasured', quantity: 1, price: 500 }]);

    const res = await request(`/api/vendor/orders/${order._id}/package-preview`, {
        headers: vendorAuth(vendor),
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.ready, true);
    assert.equal(res.body.data.weight, metrics.FALLBACK_WEIGHT_KG);
    assert.equal(res.body.data.weightSource, 'estimated');
    assert.equal(res.body.data.isEstimatedWeight, true);
});

test('Preview: reports catalogue figures and the chargeable weight', async () => {
    const vendor = await makeVendor(M, 'PreviewCatalogue', 'retail');
    const order = await orderWith(vendor, [measuredLine(1.2, { length: 60, width: 40, height: 40 })]);

    const res = await request(`/api/vendor/orders/${order._id}/package-preview`, {
        headers: vendorAuth(vendor),
    });

    assert.equal(res.body.data.weightSource, 'catalogue');
    assert.equal(res.body.data.chargeableWeight, 19.2);
    assert.equal(res.body.data.billingBasis, 'volumetric');
});

test('Preview: an incomplete pickup address explains why booking is blocked', async () => {
    const vendor = await makeVendor(M, 'PreviewBlocked', 'retail');
    await M.PickupLocation.deleteMany({ vendorId: vendor._id });
    await M.Vendor.updateOne({ _id: vendor._id }, { $unset: { address: '' } });
    const order = await orderWith(vendor, [measuredLine(1, { length: 10, width: 10, height: 10 })]);

    const res = await request(`/api/vendor/orders/${order._id}/package-preview`, {
        headers: vendorAuth(vendor),
    });

    assert.equal(res.status, 200, 'a blocked booking is still a renderable panel');
    assert.equal(res.body.data.ready, false);
    assert.match(res.body.data.blockedReason, /pickup address is incomplete/i);
});

test('Preview: another vendor cannot read it', async () => {
    const owner = await makeVendor(M, 'PreviewOwner', 'retail');
    const attacker = await makeVendor(M, 'PreviewAttacker', 'retail');
    const order = await orderWith(owner, [measuredLine(1, { length: 10, width: 10, height: 10 })]);

    const res = await request(`/api/vendor/orders/${order._id}/package-preview`, {
        headers: vendorAuth(attacker),
    });
    assert.ok(res.status === 403 || res.status === 404);
});

test('Preview: a Quick Commerce order has no package to preview', async () => {
    const vendor = await makeVendor(M, 'PreviewQc', 'qc');
    const order = await makeOrder(M, {
        fulfillmentType: 'quick_commerce', experience: 'quick_commerce', vendorId: vendor._id,
    });

    const res = await request(`/api/vendor/orders/${order._id}/package-preview`, {
        headers: vendorAuth(vendor),
    });
    assert.equal(res.status, 403);
});

// ═══════════════════════════════════════════════════════════════════════════
// Quick Commerce isolation
// ═══════════════════════════════════════════════════════════════════════════

test('Quick Commerce: a weighed QC order still never reaches the carrier', async () => {
    const vendor = await makeVendor(M, 'QcWeighed', 'qc');
    const order = await makeOrder(M, {
        fulfillmentType: 'quick_commerce', experience: 'quick_commerce', vendorId: vendor._id,
        items: [measuredLine(3, { length: 40, width: 30, height: 20 })],
    });

    clearDtdcCalls();
    await assert.rejects(() => shipmentService.bookDtdcShipment(order, vendor), /provider mismatch/i);
    assert.equal(dtdcCalls.length, 0);

    // Not even with a package override, which is the most "legitimate-looking"
    // way a caller might try to force a QC parcel through.
    await assert.rejects(
        () => shipmentService.bookDtdcShipment(order, vendor, null, { weight: 3, weightUnit: 'kg' }),
        /provider mismatch/i
    );
    assert.equal(dtdcCalls.length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// DTDC's REAL push format
//
// Taken verbatim from DTDC's "Push API Document: Tracking Status". The
// endpoint was originally written against a flat {awb, status, timestamp}
// shape that DTDC never sends — so every genuine push was answered
// "Ignored: missing AWB" with a 200, which DTDC reads as success while no
// order ever moved.
// ═══════════════════════════════════════════════════════════════════════════

const pushEnvelope = (awb, statuses) => ({
    shipment: {
        strRefNo: '', strOrigin: 'MUMBAI', strWeight: '1.301',
        strBookedOn: '05022025', strCNProduct: 'STANDARD', strRtoNumber: '',
        strCNTypeCode: 'GL018', strShipmentNo: awb,
        strExpectedDeliveryDate: '07022025', strRevExpectedDeliveryDate: '07022025',
    },
    shipmentStatus: statuses,
});

const sendPush = (body) => request('/api/integrations/webhook/dtdc', {
    method: 'POST',
    headers: { 'x-webhook-secret': process.env.DTDC_WEBHOOK_SECRET || 'test-webhook-secret' },
    body,
});

test('Push format: the real DTDC envelope delivers the order', async () => {
    const vendor = await makeVendor(M, 'PushRealFormat', 'retail');
    const order = await orderWith(vendor, [measuredLine(1, { length: 10, width: 10, height: 10 })]);
    const shipment = await shipmentService.bookDtdcShipment(order, vendor);

    const res = await sendPush(pushEnvelope(shipment.awbNumber, [{
        strAction: 'DLV',
        strOrigin: 'WHITE FIELD BRANCH , BANGALORE',
        strSCDOTP: 'Y',
        strRemarks: 'null',
        strLatitude: '12.93902930',
        strLongitude: '77.71974460',
        strActionDate: '10022025',
        strActionDesc: 'OTP Based Delivered',
        strActionTime: '141424',
        strManifestNo: '5067722173',
    }]));

    assert.equal(res.status, 200);
    const after = await M.Order.findById(order._id);
    assert.equal(after.status, 'delivered', 'the real push format must actually move the order');

    const saved = await M.Shipment.findById(shipment._id);
    assert.equal(saved.status, 'delivered');
    // The scan's OWN time, not the moment we received it — DTDC batches pushes
    // every 30 minutes.
    assert.equal(saved.deliveredAt.getFullYear(), 2025);
    assert.equal(saved.deliveredAt.getMonth(), 1, 'February');
    assert.equal(saved.deliveredAt.getDate(), 10);
});

test('Push format: NONDLV is recognised as a failed delivery attempt', async () => {
    // DTDC's own second example uses NONDLV, which the scan map did not have.
    const vendor = await makeVendor(M, 'PushNonDlv', 'retail');
    const order = await orderWith(vendor, [measuredLine(1, { length: 10, width: 10, height: 10 })]);
    const shipment = await shipmentService.bookDtdcShipment(order, vendor);

    await sendPush(pushEnvelope(shipment.awbNumber, [{
        strAction: 'NONDLV',
        strNDCOTP: 'Y',
        strOrigin: 'THANE BRANCH , MUMBAI',
        strRemarks: 'PRF|RECEIVER REFUSED DELIVERY(CIR)',
        strActionDate: '10022025',
        strActionDesc: 'Not Delivered',
        strActionTime: '122933',
    }]));

    const saved = await M.Shipment.findById(shipment._id);
    assert.equal(saved.status, 'ndr');
    assert.equal(saved.ndrDetails.attempts, 1);
    assert.match(saved.ndrDetails.reason, /REFUSED DELIVERY/);
});

test('Push format: a batch of events is applied oldest-first', async () => {
    // A push is incremental since the last one, so several scans arrive at
    // once — and not necessarily in order.
    const vendor = await makeVendor(M, 'PushBatch', 'retail');
    const order = await orderWith(vendor, [measuredLine(1, { length: 10, width: 10, height: 10 })]);
    const shipment = await shipmentService.bookDtdcShipment(order, vendor);

    const res = await sendPush(pushEnvelope(shipment.awbNumber, [
        { strAction: 'DLV', strActionDate: '12022025', strActionTime: '100000', strActionDesc: 'Delivered' },
        { strAction: 'PKD', strActionDate: '10022025', strActionTime: '090000', strActionDesc: 'Picked up' },
        { strAction: 'OFD', strActionDate: '12022025', strActionTime: '080000', strActionDesc: 'Out for delivery' },
    ]));

    assert.equal(res.status, 200);
    const saved = await M.Shipment.findById(shipment._id);
    assert.equal(saved.status, 'delivered', 'the newest scan wins after replaying in order');
    assert.ok(saved.pickedUpAt, 'and the intermediate milestones were stamped');
    assert.ok(saved.outForDeliveryAt);
    assert.equal(saved.pickedUpAt.getDate(), 10);
    assert.equal(saved.outForDeliveryAt.getDate(), 12);

    const after = await M.Order.findById(order._id);
    assert.equal(after.status, 'delivered');
});

test('Push format: an envelope with an unknown AWB is acknowledged', async () => {
    const res = await sendPush(pushEnvelope('NOT-A-REAL-AWB', [
        { strAction: 'DLV', strActionDate: '10022025', strActionTime: '141424' },
    ]));
    assert.equal(res.status, 200);
});

test('Push format: an envelope with no scan events is acknowledged', async () => {
    const res = await sendPush(pushEnvelope('X001', []));
    assert.equal(res.status, 200);
    assert.match(res.body.message, /no scan events/i);
});

test('Push format: an unsigned real envelope is still rejected', async () => {
    const vendor = await makeVendor(M, 'PushUnsigned', 'retail');
    const order = await orderWith(vendor, [measuredLine(1, { length: 10, width: 10, height: 10 })]);
    const shipment = await shipmentService.bookDtdcShipment(order, vendor);

    const res = await request('/api/integrations/webhook/dtdc', {
        method: 'POST',
        body: pushEnvelope(shipment.awbNumber, [
            { strAction: 'DLV', strActionDate: '10022025', strActionTime: '141424' },
        ]),
    });

    assert.equal(res.status, 401);
    const saved = await M.Shipment.findById(shipment._id);
    assert.equal(saved.status, 'booked', 'untouched');
});

test('Booking: commodity_id is a valid numeric DTDC commodity, not a string', async () => {
    // DTDC's commodity list is numeric (1 LAPTOP ... 7 OTHERS ... 38 CLOTHING).
    // The previous literal 'GENERAL' appears nowhere in that list.
    const vendor = await makeVendor(M, 'CommodityId', 'retail');
    const order = await orderWith(vendor, [measuredLine(1, { length: 10, width: 10, height: 10 })]);

    await shipmentService.bookDtdcShipment(order, vendor);
    const payload = sentPayload();

    assert.equal(typeof payload.commodity_id, 'number');
    assert.equal(payload.commodity_id, 7, 'OTHERS');
});

test('Push format: the exact request DTDC support sent us is accepted', async () => {
    // Verbatim from Himanshu Bhatt's test curl (31 Aug). Two things it revealed:
    // the token arrives in a header called `token`, and strActionTime can be
    // 4-digit HHMM rather than 6-digit HHMMSS.
    const vendor = await makeVendor(M, 'DtdcSupportCurl', 'retail');
    const order = await orderWith(vendor, [measuredLine(1, { length: 10, width: 10, height: 10 })]);
    const shipment = await shipmentService.bookDtdcShipment(order, vendor);

    const res = await request('/api/integrations/webhook/dtdc', {
        method: 'POST',
        headers: { token: process.env.DTDC_WEBHOOK_SECRET || 'test-webhook-secret' },
        body: {
            shipment: {
                strShipmentNo: shipment.awbNumber,
                strRefNo: '32566-R750', strCNProduct: 'STANDARD', strCNTypeCode: 'GL11379',
                strOrigin: 'JAIPUR', strDestination: 'MUMBAI', strWeight: '2.661',
                strBookedOn: '14072026', pieces: '1', strRtoNumber: '',
                strExpectedDeliveryDate: '18072026', strRevExpectedDeliveryDate: '18072026',
                strReceiverName: '',
            },
            shipmentStatus: [{
                strAction: 'DLV', strActionDesc: 'Delivered',
                strActionDate: '17072026', strActionTime: '2050',
                strOrigin: 'LOWER PAREL BRANCH',
                strLatitude: '19.00608180', strLongitude: '72.82602360',
                strRemarks: 'sin', strManifestNo: '', strNDCOTP: 'N', strSCDOTP: 'N',
            }],
        },
    });

    assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 200));
    const after = await M.Order.findById(order._id);
    assert.equal(after.status, 'delivered');

    const saved = await M.Shipment.findById(shipment._id);
    // 4-digit HHMM must still parse as a time, not be discarded.
    assert.equal(saved.deliveredAt.getHours(), 20);
    assert.equal(saved.deliveredAt.getMinutes(), 50);
    assert.equal(saved.deliveredAt.getDate(), 17);
});

test('Push auth: every header name DTDC might use is accepted', async () => {
    const secret = process.env.DTDC_WEBHOOK_SECRET || 'test-webhook-secret';

    for (const headers of [
        { token: secret },
        { 'x-webhook-secret': secret },
        { 'x-api-key': secret },
        { authorization: `Bearer ${secret}` },
    ]) {
        const vendor = await makeVendor(M, `Hdr${Object.keys(headers)[0].replace(/\W/g, '')}`, 'retail');
        const order = await orderWith(vendor, [measuredLine(1, { length: 10, width: 10, height: 10 })]);
        const shipment = await shipmentService.bookDtdcShipment(order, vendor);

        const res = await request('/api/integrations/webhook/dtdc', {
            method: 'POST',
            headers,
            body: {
                shipment: { strShipmentNo: shipment.awbNumber },
                shipmentStatus: [{ strAction: 'DLV', strActionDate: '17072026', strActionTime: '2050' }],
            },
        });
        assert.equal(res.status, 200, `header ${Object.keys(headers)[0]} was rejected`);
    }
});

test('Push auth: a WRONG token in any accepted header is still refused', async () => {
    // Widening the accepted header names must not widen what is accepted IN
    // them — the secret itself is still the only thing that opens the door.
    for (const headers of [
        { token: 'wrong-value' },
        { 'x-webhook-secret': 'wrong-value' },
        { authorization: 'Bearer wrong-value' },
    ]) {
        const res = await request('/api/integrations/webhook/dtdc', {
            method: 'POST',
            headers,
            body: {
                shipment: { strShipmentNo: 'X001' },
                shipmentStatus: [{ strAction: 'DLV', strActionDate: '17072026', strActionTime: '2050' }],
            },
        });
        assert.equal(res.status, 401, `header ${Object.keys(headers)[0]} let a wrong token through`);
    }
});
