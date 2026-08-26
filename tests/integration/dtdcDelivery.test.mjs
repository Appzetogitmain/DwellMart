/**
 * DTDC delivery — end-to-end integration suite.
 *
 * Runs the REAL Express application against an in-memory MongoDB, with the
 * DTDC HTTP boundary stubbed. That combination is deliberate:
 *
 *   - a real database, because most of the defects this suite guards against
 *     were schema-level (an enum the write violated, a unique index that made
 *     multi-vendor booking impossible) and are invisible to a mocked model;
 *   - a real HTTP stack, because authentication, workspace resolution,
 *     subscription checks and permission guards all sit between the frontend
 *     and the controller, and testing the controller alone proves nothing
 *     about what a vendor can actually do;
 *   - a stubbed carrier, because these assertions must not create real
 *     consignments, and because failure modes (timeout, 5xx, rejection) have
 *     to be reproducible on demand.
 *
 * Run with:  npm run test:dtdc
 *
 * `--test-force-exit` is required, not optional: importing the application
 * starts its background workers and several module-level `setInterval` timers
 * (translation cache cleanup, the retry queue, the rider sweep) which are never
 * unref'd, so the process would sit idle after the last assertion instead of
 * exiting. The suite provisions and tears down its own in-memory database, so
 * forcing the exit discards nothing that matters.
 */

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// ── Environment must be set before any application module is imported ───────
const mongod = await MongoMemoryServer.create();
process.env.MONGO_URI                = `${mongod.getUri()}dwellmart_dtdc_test`;
process.env.NODE_ENV                 = 'test';
process.env.JWT_SECRET               = 'integration-test-jwt-secret-value';
process.env.JWT_REFRESH_SECRET       = 'integration-test-jwt-refresh-secret';
process.env.CLOUDINARY_CLOUD_NAME    = 'test';
process.env.CLOUDINARY_API_KEY       = 'test';
process.env.CLOUDINARY_API_SECRET    = 'test';
process.env.DTDC_ENVIRONMENT         = 'sandbox';
process.env.DTDC_CUSTOMER_CODE       = 'TEST_CUSTOMER';
process.env.DTDC_API_KEY             = 'test-api-key';
process.env.DTDC_TRACKING_USERNAME   = 'test-user';
process.env.DTDC_TRACKING_PASSWORD   = 'test-pass';
process.env.DTDC_WEBHOOK_SECRET      = 'test-webhook-secret';
process.env.DTDC_TIMEOUT_MS          = '2000';
process.env.DTDC_RETRY_ATTEMPTS      = '1';

import {
    installFetchStub, setDtdcHandlers, defaultHandlers,
    dtdcCalls, clearDtdcCalls, resetAwbSequence, jsonResponse,
} from './_dtdcHarness.mjs';
import { models, makeVendor, makeUser, makeOrder, resetPlanCache } from './_dtdcFixtures.mjs';

await mongoose.connect(process.env.MONGO_URI);

/** The un-stubbed fetch, kept so the suite can call its own server. */
const realFetch = global.fetch;
installFetchStub();
setDtdcHandlers(defaultHandlers());

const { default: app } = await import('../../src/app.js');
const { generateTokens } = await import('../../src/utils/generateToken.js');
const shipmentService = await import('../../src/services/shipping/dtdcShipment.service.js');
const { ShipmentStatus } = await import('../../src/constants/dtdcStatus.js');

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
    // The tracking token is process-cached; a stale one would mask auth changes.
    (await import('../../src/services/shipping/dtdc.client.js')).clearTrackingTokenCache();
});

// ── Request helpers ─────────────────────────────────────────────────────────

const request = async (path, { method = 'GET', headers = {}, body, raw } = {}) => {
    const response = await realFetch(`${baseUrl}${path}`, {
        method,
        headers: body || raw ? { 'Content-Type': 'application/json', ...headers } : headers,
        body: raw ?? (body ? JSON.stringify(body) : undefined),
    });
    const text = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: response.status, body: parsed };
};

const vendorAuth = (vendor) => ({
    Authorization: `Bearer ${generateTokens({ id: String(vendor._id), role: 'vendor', email: vendor.email }).accessToken}`,
});
const userAuth = (user) => ({
    Authorization: `Bearer ${generateTokens({ id: String(user._id), role: 'customer', email: user.email }).accessToken}`,
});

const bookingCalls = () => dtdcCalls.filter((c) => c.kind === 'booking');

// ═══════════════════════════════════════════════════════════════════════════
// Provider separation
// ═══════════════════════════════════════════════════════════════════════════

test('QC order: the service refuses to book and never contacts DTDC', async () => {
    const vendor = await makeVendor(M, 'QcSeller', 'qc');
    const order = await makeOrder(M, {
        fulfillmentType: 'quick_commerce', experience: 'quick_commerce', vendorId: vendor._id,
    });

    await assert.rejects(
        () => shipmentService.bookDtdcShipment(order, vendor),
        /provider mismatch/i
    );
    assert.equal(dtdcCalls.length, 0, 'a Quick Commerce order must not reach the carrier at all');
});

test('QC order: the vendor booking endpoint refuses it', async () => {
    const vendor = await makeVendor(M, 'QcSeller2', 'qc');
    const order = await makeOrder(M, {
        fulfillmentType: 'quick_commerce', experience: 'quick_commerce', vendorId: vendor._id,
    });

    const res = await request(`/api/vendor/orders/${order._id}/book-dtdc`, {
        method: 'POST', headers: vendorAuth(vendor),
    });

    assert.equal(res.status, 403);
    assert.equal(bookingCalls().length, 0);
});

test('QC order: a forged body cannot talk the API into using DTDC', async () => {
    const vendor = await makeVendor(M, 'QcSeller3', 'qc');
    const order = await makeOrder(M, {
        fulfillmentType: 'quick_commerce', experience: 'quick_commerce', vendorId: vendor._id,
    });

    const res = await request(`/api/vendor/orders/${order._id}/book-dtdc`, {
        method: 'POST',
        headers: vendorAuth(vendor),
        body: { deliveryProvider: 'dtdc', fulfillmentType: 'retail', orderType: 'retail' },
    });

    assert.ok(res.status >= 400, 'forged channel fields must not unlock DTDC');
    assert.equal(bookingCalls().length, 0);
});

test('Retail and wholesale both route to DTDC with the right service type', async () => {
    const retailVendor = await makeVendor(M, 'RetailSeller', 'retail');
    const wholesaleVendor = await makeVendor(M, 'WholesaleSeller', 'wholesale');

    const retailOrder = await makeOrder(M, { fulfillmentType: 'retail', vendorId: retailVendor._id });
    const wholesaleOrder = await makeOrder(M, { fulfillmentType: 'wholesale', vendorId: wholesaleVendor._id });

    const retailShipment = await shipmentService.bookDtdcShipment(retailOrder, retailVendor);
    const wholesaleShipment = await shipmentService.bookDtdcShipment(wholesaleOrder, wholesaleVendor);

    assert.equal(retailShipment.serviceType, 'PRIORITY');
    assert.equal(wholesaleShipment.serviceType, 'GROUND EXPRESS');
    assert.equal(retailShipment.deliveryProvider, 'dtdc');
    assert.equal(wholesaleShipment.deliveryProvider, 'dtdc');
});

// ═══════════════════════════════════════════════════════════════════════════
// Booking
// ═══════════════════════════════════════════════════════════════════════════

test('Booking: the consignment carries a real origin, destination and COD amount', async () => {
    const vendor = await makeVendor(M, 'PayloadSeller', 'retail');
    const order = await makeOrder(M, { fulfillmentType: 'retail', vendorId: vendor._id, paymentMethod: 'cod', total: 1499 });

    await shipmentService.bookDtdcShipment(order, vendor);

    const payload = bookingCalls()[0].body.consignments[0];
    assert.equal(payload.origin_details.pincode, '500034');
    assert.equal(payload.origin_details.city, 'Hyderabad');
    assert.equal(typeof payload.origin_details.address_line_1, 'string');
    assert.equal(payload.destination_details.pincode, '110001');
    assert.equal(payload.destination_details.city, 'New Delhi');
    assert.equal(payload.declared_value, 1499);
    assert.equal(payload.cod_amount, 1499);
    assert.equal(payload.cod_collection_mode, 'CASH');
});

test('Booking: a prepaid order collects nothing on the doorstep', async () => {
    const vendor = await makeVendor(M, 'PrepaidSeller', 'retail');
    const order = await makeOrder(M, {
        fulfillmentType: 'retail', vendorId: vendor._id, paymentMethod: 'upi', paymentStatus: 'paid',
    });

    await shipmentService.bookDtdcShipment(order, vendor);
    const payload = bookingCalls()[0].body.consignments[0];
    assert.equal(payload.cod_amount, 0);
    assert.equal(payload.cod_collection_mode, '');
});

test('Booking: the AWB reaches both the shipment and the order', async () => {
    const vendor = await makeVendor(M, 'AwbSeller', 'retail');
    const order = await makeOrder(M, { fulfillmentType: 'retail', vendorId: vendor._id });

    const shipment = await shipmentService.bookDtdcShipment(order, vendor);

    assert.ok(shipment.awbNumber);
    assert.equal(shipment.status, ShipmentStatus.BOOKED);

    const saved = await M.Order.findById(order._id);
    assert.equal(saved.trackingNumber, shipment.awbNumber);
    assert.equal(saved.integration.deliveryPartnerName, 'DTDC');
    // A lowercase shipment status here fails the Order enum on save; the write
    // used to throw after the carrier had already issued the AWB.
    assert.equal(saved.integration.partnerStatus, 'ASSIGNED');
    assert.ok(saved.integration.logs.length >= 1);
});

test('Booking: an incomplete pickup address is refused before the carrier is called', async () => {
    const vendor = await makeVendor(M, 'NoAddressSeller', 'retail');
    await M.PickupLocation.deleteMany({ vendorId: vendor._id });
    await M.Vendor.updateOne({ _id: vendor._id }, { $unset: { address: '' } });
    const bare = await M.Vendor.findById(vendor._id);
    const order = await makeOrder(M, { fulfillmentType: 'retail', vendorId: vendor._id });

    await assert.rejects(
        () => shipmentService.bookDtdcShipment(order, bare),
        /pickup address is incomplete/i
    );
    assert.equal(bookingCalls().length, 0);
});

test('Booking: repeating a booking returns the same AWB and calls DTDC once', async () => {
    const vendor = await makeVendor(M, 'IdemSeller', 'retail');
    const order = await makeOrder(M, { fulfillmentType: 'retail', vendorId: vendor._id });

    const first = await shipmentService.bookDtdcShipment(order, vendor);
    const second = await shipmentService.bookDtdcShipment(order, vendor);

    assert.equal(first.awbNumber, second.awbNumber);
    assert.equal(bookingCalls().length, 1);
    assert.equal(await M.Shipment.countDocuments({ orderId: order._id }), 1);
});

test('Booking: two simultaneous requests create exactly one consignment', async () => {
    const vendor = await makeVendor(M, 'RaceSeller', 'retail');
    const order = await makeOrder(M, { fulfillmentType: 'retail', vendorId: vendor._id });

    const results = await Promise.all([
        shipmentService.bookDtdcShipment(order, vendor),
        shipmentService.bookDtdcShipment(order, vendor),
    ]);

    assert.equal(bookingCalls().length, 1, 'a double click must not buy two parcels');
    assert.equal(results[0].awbNumber, results[1].awbNumber);
    assert.equal(await M.Shipment.countDocuments({ orderId: order._id }), 1);
});

test('Booking: a split order books one parcel per seller', async () => {
    const v1 = await makeVendor(M, 'SplitA', 'retail');
    const v2 = await makeVendor(M, 'SplitB', 'retail');
    const order = await makeOrder(M, {
        fulfillmentType: 'retail',
        vendorItems: [
            { vendorId: v1._id, orderType: 'retail', status: 'confirmed', items: [] },
            { vendorId: v2._id, orderType: 'retail', status: 'confirmed', items: [] },
        ],
    });

    const s1 = await shipmentService.bookDtdcShipment(order, v1);
    const s2 = await shipmentService.bookDtdcShipment(order, v2);

    assert.notEqual(s1.awbNumber, s2.awbNumber);
    assert.equal(await M.Shipment.countDocuments({ orderId: order._id }), 2);
});

test('Booking: a carrier rejection leaves the shipment retryable and issues no AWB', async () => {
    setDtdcHandlers({
        ...defaultHandlers(),
        booking: () => jsonResponse({ status: 'OK', data: [{ success: false, message: 'Invalid pincode' }] }),
    });

    const vendor = await makeVendor(M, 'RejectSeller', 'retail');
    const order = await makeOrder(M, { fulfillmentType: 'retail', vendorId: vendor._id });

    await assert.rejects(() => shipmentService.bookDtdcShipment(order, vendor), /rejected/i);

    const shipment = await M.Shipment.findOne({ orderId: order._id });
    assert.equal(shipment.status, ShipmentStatus.FAILED);
    assert.equal(shipment.awbNumber, undefined);
    assert.equal(shipment.bookingLockedAt, null, 'a failed booking must release its lock');
});

test('Booking: a failed booking can be retried once the carrier recovers', async () => {
    setDtdcHandlers({
        ...defaultHandlers(),
        booking: () => jsonResponse({ status: 'ERROR', data: [{ success: false, message: 'down' }] }),
    });

    const vendor = await makeVendor(M, 'RetrySeller', 'retail');
    const order = await makeOrder(M, { fulfillmentType: 'retail', vendorId: vendor._id });

    await assert.rejects(() => shipmentService.bookDtdcShipment(order, vendor));

    setDtdcHandlers(defaultHandlers());
    const shipment = await shipmentService.bookDtdcShipment(order, vendor);
    assert.ok(shipment.awbNumber);
    assert.equal(shipment.status, ShipmentStatus.BOOKED);
});

test('Booking: a carrier timeout surfaces as a retryable error, not a silent success', async () => {
    setDtdcHandlers({
        ...defaultHandlers(),
        booking: () => new Promise(() => {}), // never settles → AbortController fires
    });

    const vendor = await makeVendor(M, 'TimeoutSeller', 'retail');
    const order = await makeOrder(M, { fulfillmentType: 'retail', vendorId: vendor._id });

    await assert.rejects(() => shipmentService.bookDtdcShipment(order, vendor), /timed out/i);
    const shipment = await M.Shipment.findOne({ orderId: order._id });
    assert.equal(shipment.awbNumber, undefined);
});

test('Booking: a 5xx from the carrier is not recorded as a booked parcel', async () => {
    setDtdcHandlers({
        ...defaultHandlers(),
        booking: () => new Response('gateway down', { status: 502 }),
    });

    const vendor = await makeVendor(M, 'GatewaySeller', 'retail');
    const order = await makeOrder(M, { fulfillmentType: 'retail', vendorId: vendor._id });

    await assert.rejects(() => shipmentService.bookDtdcShipment(order, vendor), /booking failed/i);
    const shipment = await M.Shipment.findOne({ orderId: order._id });
    assert.equal(shipment.status, ShipmentStatus.FAILED);
});

test('Booking: a success response with no reference number is treated as a failure', async () => {
    setDtdcHandlers({
        ...defaultHandlers(),
        booking: () => jsonResponse({ status: 'OK', data: [{ success: true }] }),
    });

    const vendor = await makeVendor(M, 'PartialSeller', 'retail');
    const order = await makeOrder(M, { fulfillmentType: 'retail', vendorId: vendor._id });

    await assert.rejects(() => shipmentService.bookDtdcShipment(order, vendor), /no reference number/i);
});

// ═══════════════════════════════════════════════════════════════════════════
// Order lifecycle synchronisation
// ═══════════════════════════════════════════════════════════════════════════

const bookedRetailOrder = async (name, overrides = {}) => {
    const vendor = await makeVendor(M, name, 'retail');
    const order = await makeOrder(M, { fulfillmentType: 'retail', vendorId: vendor._id, status: 'confirmed', ...overrides });
    const shipment = await shipmentService.bookDtdcShipment(order, vendor);
    return { vendor, order: await M.Order.findById(order._id), shipment };
};

const sendWebhook = (awb, status, extra = {}) => request('/api/integrations/webhook/dtdc', {
    method: 'POST',
    headers: { 'x-webhook-secret': process.env.DTDC_WEBHOOK_SECRET },
    body: { awb, status, ...extra },
});

test('Lifecycle: DELIVERED moves the order to delivered', async () => {
    const { order, shipment } = await bookedRetailOrder('DeliverSeller');

    const res = await sendWebhook(shipment.awbNumber, 'DEL', { timestamp: '2026-01-05T10:00:00Z' });
    assert.equal(res.status, 200);

    const after = await M.Order.findById(order._id);
    assert.equal(after.status, 'delivered');
    assert.ok(after.deliveredAt);
    assert.equal(after.integration.partnerStatus, 'DELIVERED');

    const savedShipment = await M.Shipment.findById(shipment._id);
    assert.equal(savedShipment.status, ShipmentStatus.DELIVERED);
    assert.ok(savedShipment.deliveredAt);
});

test('Lifecycle: the full scan sequence walks the order forward once each', async () => {
    const { order, shipment } = await bookedRetailOrder('SequenceSeller');

    for (const [code, expected] of [
        ['PKD', 'shipped'],
        ['INT', 'shipped'],
        ['OFD', 'out_for_delivery'],
        ['DEL', 'delivered'],
    ]) {
        await sendWebhook(shipment.awbNumber, code, { timestamp: `2026-01-0${1 + Math.random() | 0}T00:00:00Z` });
        const current = await M.Order.findById(order._id);
        assert.equal(current.status, expected, `after ${code}`);
    }
});

test('Lifecycle: wholesale uses dispatched, not shipped', async () => {
    const vendor = await makeVendor(M, 'WholesaleLifecycle', 'wholesale');
    const order = await makeOrder(M, { fulfillmentType: 'wholesale', vendorId: vendor._id, status: 'approved' });
    const shipment = await shipmentService.bookDtdcShipment(order, vendor);

    await sendWebhook(shipment.awbNumber, 'PKD');
    const after = await M.Order.findById(order._id);
    assert.equal(after.status, 'dispatched');
});

test('Lifecycle: a duplicate DELIVERED webhook changes nothing the second time', async () => {
    const { order, shipment } = await bookedRetailOrder('DuplicateSeller');
    const payload = { timestamp: '2026-01-05T10:00:00Z' };

    await sendWebhook(shipment.awbNumber, 'DEL', payload);
    const first = await M.Order.findById(order._id);
    const firstLogCount = first.integration.logs.length;

    const second = await sendWebhook(shipment.awbNumber, 'DEL', payload);
    assert.equal(second.status, 200);

    const after = await M.Order.findById(order._id);
    assert.equal(after.deliveredAt.getTime(), first.deliveredAt.getTime());
    assert.equal(after.integration.logs.length, firstLogCount, 'no duplicate audit entry');

    const savedShipment = await M.Shipment.findById(shipment._id);
    const deliveredScans = savedShipment.trackingHistory.filter((h) => h.status === 'DEL');
    assert.equal(deliveredScans.length, 1, 'no duplicate scan history entry');
});

test('Lifecycle: an out-of-order webhook never rewinds a delivered order', async () => {
    const { order, shipment } = await bookedRetailOrder('OutOfOrderSeller');

    await sendWebhook(shipment.awbNumber, 'DEL', { timestamp: '2026-01-05T10:00:00Z' });
    // An IN_TRANSIT scan lands late, as they routinely do.
    const res = await sendWebhook(shipment.awbNumber, 'INT', { timestamp: '2026-01-03T10:00:00Z' });
    assert.equal(res.status, 200);

    const after = await M.Order.findById(order._id);
    assert.equal(after.status, 'delivered');
    const savedShipment = await M.Shipment.findById(shipment._id);
    assert.equal(savedShipment.status, ShipmentStatus.DELIVERED);
});

test('Lifecycle: NDR is recorded without silently changing the order status', async () => {
    const { order, shipment } = await bookedRetailOrder('NdrSeller');

    await sendWebhook(shipment.awbNumber, 'OFD');
    await sendWebhook(shipment.awbNumber, 'UDL', { reason: 'Consignee unavailable' });

    const savedShipment = await M.Shipment.findById(shipment._id);
    assert.equal(savedShipment.status, ShipmentStatus.NDR);
    assert.equal(savedShipment.ndrDetails.attempts, 1);
    assert.equal(savedShipment.ndrDetails.reason, 'Consignee unavailable');

    const after = await M.Order.findById(order._id);
    assert.notEqual(after.status, 'delivered');
    assert.equal(after.integration.partnerStatus, 'DELIVERY_FAILED');
});

test('Lifecycle: an NDR reattempt can still deliver', async () => {
    const { order, shipment } = await bookedRetailOrder('NdrRecoverySeller');

    await sendWebhook(shipment.awbNumber, 'OFD');
    await sendWebhook(shipment.awbNumber, 'UDL', { reason: 'Not home' });
    await sendWebhook(shipment.awbNumber, 'DEL');

    const after = await M.Order.findById(order._id);
    assert.equal(after.status, 'delivered');
});

test('Lifecycle: RTO is terminal and does not mark the order delivered', async () => {
    const { order, shipment } = await bookedRetailOrder('RtoSeller');

    await sendWebhook(shipment.awbNumber, 'RTO', { reason: 'Refused by consignee' });
    const savedShipment = await M.Shipment.findById(shipment._id);
    assert.equal(savedShipment.status, ShipmentStatus.RTO);
    assert.ok(savedShipment.rtoDetails.initiatedAt);

    // A repeated RTO must not double-count.
    await sendWebhook(shipment.awbNumber, 'RTO', { reason: 'Refused by consignee' });
    const again = await M.Shipment.findById(shipment._id);
    assert.equal(again.rtoDetails.initiatedAt.getTime(), savedShipment.rtoDetails.initiatedAt.getTime());

    const after = await M.Order.findById(order._id);
    assert.notEqual(after.status, 'delivered');
});

test('Lifecycle: an unrecognised scan code is recorded but moves nothing', async () => {
    const { order, shipment } = await bookedRetailOrder('UnknownCodeSeller');

    const res = await sendWebhook(shipment.awbNumber, 'ZZZ');
    assert.equal(res.status, 200);

    const savedShipment = await M.Shipment.findById(shipment._id);
    assert.equal(savedShipment.status, ShipmentStatus.BOOKED, 'an unknown code must not invent a transition');
    assert.ok(savedShipment.trackingHistory.some((h) => h.status === 'ZZZ'), 'but it is still auditable');

    const after = await M.Order.findById(order._id);
    assert.equal(after.status, 'confirmed');
});

// ═══════════════════════════════════════════════════════════════════════════
// Webhook security
// ═══════════════════════════════════════════════════════════════════════════

test('Webhook: an unsigned request is rejected', async () => {
    const { shipment } = await bookedRetailOrder('UnsignedSeller');

    const res = await request('/api/integrations/webhook/dtdc', {
        method: 'POST', body: { awb: shipment.awbNumber, status: 'DEL' },
    });

    assert.equal(res.status, 401);
    const savedShipment = await M.Shipment.findById(shipment._id);
    assert.equal(savedShipment.status, ShipmentStatus.BOOKED);
});

test('Webhook: a wrong-length signature is a 401, not a 500', async () => {
    const { shipment } = await bookedRetailOrder('BadSigSeller');

    // timingSafeEqual throws RangeError on unequal buffer lengths; an unguarded
    // call turned every malformed signature into an unhandled server error.
    const res = await request('/api/integrations/webhook/dtdc', {
        method: 'POST',
        headers: { 'x-dtdc-signature': 'short' },
        body: { awb: shipment.awbNumber, status: 'DEL' },
    });

    assert.equal(res.status, 401);
});

test('Webhook: a valid HMAC signature is accepted', async () => {
    const { shipment, order } = await bookedRetailOrder('HmacSeller');
    const crypto = await import('node:crypto');

    const payload = JSON.stringify({ awb: shipment.awbNumber, status: 'DEL' });
    const signature = crypto.createHmac('sha256', process.env.DTDC_WEBHOOK_SECRET)
        .update(payload).digest('hex');

    const res = await request('/api/integrations/webhook/dtdc', {
        method: 'POST', headers: { 'x-dtdc-signature': signature }, raw: payload,
    });

    assert.equal(res.status, 200);
    const after = await M.Order.findById(order._id);
    assert.equal(after.status, 'delivered');
});

test('Webhook: a tampered body invalidates its signature', async () => {
    const { shipment } = await bookedRetailOrder('TamperSeller');
    const crypto = await import('node:crypto');

    const original = JSON.stringify({ awb: shipment.awbNumber, status: 'INT' });
    const signature = crypto.createHmac('sha256', process.env.DTDC_WEBHOOK_SECRET)
        .update(original).digest('hex');

    const tampered = JSON.stringify({ awb: shipment.awbNumber, status: 'DEL' });
    const res = await request('/api/integrations/webhook/dtdc', {
        method: 'POST', headers: { 'x-dtdc-signature': signature }, raw: tampered,
    });

    assert.equal(res.status, 401);
});

test('Webhook: an unknown AWB is acknowledged, not retried', async () => {
    const res = await sendWebhook('NOT-A-REAL-AWB', 'DEL');
    assert.equal(res.status, 200, 'answering 4xx to an unknowable AWB earns a retry storm');
    assert.match(res.body.message, /unknown_awb/);
});

test('Webhook: a malformed payload is acknowledged without touching any order', async () => {
    const { shipment } = await bookedRetailOrder('MalformedSeller');

    const missingAwb = await sendWebhook(undefined, 'DEL');
    assert.equal(missingAwb.status, 200);

    const missingStatus = await sendWebhook(shipment.awbNumber, '');
    assert.equal(missingStatus.status, 200);

    const savedShipment = await M.Shipment.findById(shipment._id);
    assert.equal(savedShipment.status, ShipmentStatus.BOOKED);
});

test('Webhook: broken JSON is rejected at the parser, not acted on', async () => {
    const res = await request('/api/integrations/webhook/dtdc', {
        method: 'POST',
        headers: { 'x-webhook-secret': process.env.DTDC_WEBHOOK_SECRET },
        raw: '{not valid json',
    });
    assert.equal(res.status, 400);
});

test('Webhook: it can never touch an order other than the AWB owner', async () => {
    const { shipment: mine } = await bookedRetailOrder('WebhookMine');
    const { order: theirs } = await bookedRetailOrder('WebhookTheirs');

    await sendWebhook(mine.awbNumber, 'DEL');

    const untouched = await M.Order.findById(theirs._id);
    assert.equal(untouched.status, 'confirmed');
});

test('Webhook: a QC order carrying a DTDC shipment is refused, not rewritten', async () => {
    const vendor = await makeVendor(M, 'QcWebhookSeller', 'qc');
    const order = await makeOrder(M, {
        fulfillmentType: 'quick_commerce', experience: 'quick_commerce', vendorId: vendor._id, status: 'pending',
    });
    // Deliberately corrupt data: a DTDC shipment pointing at a QC order.
    await M.Shipment.create({
        orderId: order._id, vendorId: vendor._id, deliveryProvider: 'dtdc',
        awbNumber: 'QC-CORRUPT-1', status: 'booked', channel: 'quick_commerce',
        bookingId: `${order._id}_${vendor._id}`,
    });

    const res = await sendWebhook('QC-CORRUPT-1', 'DEL');
    assert.equal(res.status, 200);
    assert.match(res.body.message, /quick_commerce_order/);

    const after = await M.Order.findById(order._id);
    assert.equal(after.status, 'pending', 'a DTDC event must never drive a QC order');
});

// ═══════════════════════════════════════════════════════════════════════════
// Vendor API — ownership, workspace and channel state
// ═══════════════════════════════════════════════════════════════════════════

test('Vendor API: the owner can book, view, label and sync their own order', async () => {
    const vendor = await makeVendor(M, 'OwnerSeller', 'retail');
    const order = await makeOrder(M, { fulfillmentType: 'retail', vendorId: vendor._id, status: 'confirmed' });

    const empty = await request(`/api/vendor/orders/${order._id}/shipment`, { headers: vendorAuth(vendor) });
    assert.equal(empty.status, 200, 'an unbooked order is not an error');
    assert.equal(empty.body.data, null);

    const booked = await request(`/api/vendor/orders/${order._id}/book-dtdc`, {
        method: 'POST', headers: vendorAuth(vendor),
    });
    assert.equal(booked.status, 200);
    assert.ok(booked.body.data.awbNumber);

    const view = await request(`/api/vendor/orders/${order._id}/shipment`, { headers: vendorAuth(vendor) });
    assert.equal(view.status, 200);
    assert.equal(view.body.data.awbNumber, booked.body.data.awbNumber);

    const synced = await request(`/api/vendor/orders/${order._id}/sync-tracking`, {
        method: 'POST', headers: vendorAuth(vendor),
    });
    assert.equal(synced.status, 200);

    const label = await realFetch(`${baseUrl}/api/vendor/orders/${order._id}/shipping-label`, {
        headers: vendorAuth(vendor),
    });
    assert.equal(label.status, 200);
    assert.equal(label.headers.get('content-type'), 'application/pdf');
});

test('Vendor API: another vendor cannot reach the shipment, label or tracking', async () => {
    const owner = await makeVendor(M, 'VictimSeller', 'retail');
    const attacker = await makeVendor(M, 'AttackerSeller', 'retail');
    const order = await makeOrder(M, { fulfillmentType: 'retail', vendorId: owner._id });
    const shipment = await shipmentService.bookDtdcShipment(order, owner);

    for (const [path, method] of [
        [`/api/vendor/orders/${order._id}/shipment`, 'GET'],
        [`/api/vendor/orders/${order._id}/shipping-label`, 'GET'],
        [`/api/vendor/orders/${order._id}/sync-tracking`, 'POST'],
        [`/api/vendor/orders/${order._id}/book-dtdc`, 'POST'],
    ]) {
        const res = await request(path, { method, headers: vendorAuth(attacker) });
        assert.ok(res.status === 403 || res.status === 404, `${method} ${path} → ${res.status}`);
        assert.ok(
            JSON.stringify(res.body).includes(shipment.awbNumber) === false,
            'the AWB must never leak to another vendor'
        );
    }
});

test('Vendor API: a paused channel may look but not despatch', async () => {
    const vendor = await makeVendor(M, 'PausedSeller', 'retailPaused');
    const order = await makeOrder(M, { fulfillmentType: 'retail', vendorId: vendor._id });

    const view = await request(`/api/vendor/orders/${order._id}/shipment`, { headers: vendorAuth(vendor) });
    assert.equal(view.status, 200, 'a paused channel is still readable');

    const booked = await request(`/api/vendor/orders/${order._id}/book-dtdc`, {
        method: 'POST', headers: vendorAuth(vendor),
    });
    assert.equal(booked.status, 403, 'a paused channel must not create new consignments');
    assert.equal(bookingCalls().length, 0);
});

test('Vendor API: a workspace cannot act on another workspace\'s order', async () => {
    const vendor = await makeVendor(M, 'MultiSeller', 'all');
    const order = await makeOrder(M, { fulfillmentType: 'retail', vendorId: vendor._id });

    const wrong = await request(`/api/vendor/orders/${order._id}/book-dtdc`, {
        method: 'POST',
        headers: { ...vendorAuth(vendor), 'x-vendor-workspace': 'wholesale' },
    });
    assert.equal(wrong.status, 403);
    assert.equal(bookingCalls().length, 0);

    const right = await request(`/api/vendor/orders/${order._id}/book-dtdc`, {
        method: 'POST',
        headers: { ...vendorAuth(vendor), 'x-vendor-workspace': 'retail' },
    });
    assert.equal(right.status, 200);
});

test('Vendor API: an unauthenticated caller gets nothing', async () => {
    const vendor = await makeVendor(M, 'AnonSeller', 'retail');
    const order = await makeOrder(M, { fulfillmentType: 'retail', vendorId: vendor._id });

    const res = await request(`/api/vendor/orders/${order._id}/shipment`);
    assert.equal(res.status, 401);
});

// ═══════════════════════════════════════════════════════════════════════════
// Cancellation
// ═══════════════════════════════════════════════════════════════════════════

test('Cancellation: a booked parcel can be cancelled, and twice is idempotent', async () => {
    const { order, shipment, vendor } = await bookedRetailOrder('CancelSeller');

    const cancelled = await shipmentService.cancelDtdcShipment(order, String(vendor._id));
    assert.equal(cancelled.status, ShipmentStatus.CANCELLED);
    assert.ok(cancelled.cancelledAt);

    const cancelCalls = () => dtdcCalls.filter((c) => c.kind === 'cancel').length;
    const before = cancelCalls();
    await shipmentService.cancelDtdcShipment(order, String(vendor._id));
    assert.equal(cancelCalls(), before, 'a repeat cancellation must not hit the carrier again');
});

test('Cancellation: a collected parcel cannot be cancelled', async () => {
    const { order, shipment, vendor } = await bookedRetailOrder('CollectedSeller');
    await sendWebhook(shipment.awbNumber, 'PKD');

    await assert.rejects(
        async () => shipmentService.cancelDtdcShipment(await M.Order.findById(order._id), String(vendor._id)),
        /cannot be cancelled/i
    );
});

test('Cancellation: a delivered parcel cannot be cancelled', async () => {
    const { order, shipment, vendor } = await bookedRetailOrder('DeliveredCancelSeller');
    await sendWebhook(shipment.awbNumber, 'DEL');

    await assert.rejects(
        async () => shipmentService.cancelDtdcShipment(await M.Order.findById(order._id), String(vendor._id)),
        /cannot be cancelled/i
    );
});

test('Cancellation: a cancelled parcel is not silently rebooked', async () => {
    const { order, vendor } = await bookedRetailOrder('RebookSeller');
    await shipmentService.cancelDtdcShipment(order, String(vendor._id));

    await assert.rejects(
        async () => shipmentService.bookDtdcShipment(await M.Order.findById(order._id), vendor),
        /cancelled/i
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// Tracking pull
// ═══════════════════════════════════════════════════════════════════════════

test('Tracking: the plain-text auth token is parsed and the history recorded', async () => {
    const { order, shipment, vendor } = await bookedRetailOrder('TrackSeller');

    const synced = await shipmentService.syncTrackingStatus(await M.Order.findById(order._id), String(vendor._id));

    // DTDC answers the auth endpoint with a bare token string; a JSON-only
    // parser produced null and tracking could never authenticate.
    assert.ok(dtdcCalls.some((c) => c.kind === 'auth'));
    assert.ok(synced.trackingHistory.length > 0);
    assert.equal(synced.status, ShipmentStatus.DELIVERED);
});

test('Tracking: repeated syncs do not duplicate the timeline', async () => {
    const { order, vendor } = await bookedRetailOrder('TrackDupeSeller');

    const first = await shipmentService.syncTrackingStatus(await M.Order.findById(order._id), String(vendor._id));
    const firstCount = first.trackingHistory.length;
    const second = await shipmentService.syncTrackingStatus(await M.Order.findById(order._id), String(vendor._id));

    assert.equal(second.trackingHistory.length, firstCount, 'the carrier returns the FULL history each time');
});

test('Tracking: an unusable auth response fails loudly', async () => {
    setDtdcHandlers({
        ...defaultHandlers(),
        auth: () => new Response('', { status: 200 }),
    });

    const { order, vendor } = await bookedRetailOrder('BadAuthSeller');
    await assert.rejects(
        async () => shipmentService.syncTrackingStatus(await M.Order.findById(order._id), String(vendor._id)),
        /token/i
    );
});

test('Tracking: an unknown AWB at the carrier surfaces as an error', async () => {
    setDtdcHandlers({
        ...defaultHandlers(),
        tracking: () => new Response('not found', { status: 404 }),
    });

    const { order, vendor } = await bookedRetailOrder('MissingAwbSeller');
    await assert.rejects(
        async () => shipmentService.syncTrackingStatus(await M.Order.findById(order._id), String(vendor._id)),
        /tracking lookup failed/i
    );
});

test('Tracking: syncing an order with no shipment is refused', async () => {
    const vendor = await makeVendor(M, 'NoShipmentSeller', 'retail');
    const order = await makeOrder(M, { fulfillmentType: 'retail', vendorId: vendor._id });

    await assert.rejects(
        () => shipmentService.syncTrackingStatus(order, String(vendor._id)),
        /no active dtdc shipment/i
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// Serviceability
// ═══════════════════════════════════════════════════════════════════════════

test('Serviceability: a valid pincode pair returns a verdict', async () => {
    const result = await shipmentService.checkDtdcServiceability('500034', '110001');
    assert.equal(result.serviceable, true);
    assert.equal(result.codAvailable, true);
    assert.equal(result.destinationCity, 'DELHI');
});

test('Serviceability: an unserviceable route is not reported as serviceable', async () => {
    // DTDC answers HTTP 200 for an unserviceable route; treating "the call
    // worked" as "we can ship there" promised delivery to pincodes the carrier
    // had already refused. Shape verified against the live sandbox.
    setDtdcHandlers({
        ...defaultHandlers(),
        pincode: () => jsonResponse({
            ZIPCODE_RESP: [{ MESSAGE: 'DESTPIN is not valid', ORGPIN: '500034', DESTPIN: '999999', SERV_COD: 'N', SERVFLAG: 'Y' }],
        }),
    });

    const result = await shipmentService.checkDtdcServiceability('500034', '999999');
    assert.equal(result.serviceable, false);
    assert.match(result.error, /not valid/i);
});

test('Serviceability: a prepaid-only route reports COD as unavailable', async () => {
    setDtdcHandlers({
        ...defaultHandlers(),
        pincode: () => jsonResponse({
            ZIPCODE_RESP: [{ MESSAGE: 'SUCCESS', SERV_COD: 'N', DESTCITY: 'LEH', DESTSTATE: 'LADAKH' }],
        }),
    });

    const result = await shipmentService.checkDtdcServiceability('500034', '194101');
    assert.equal(result.serviceable, true);
    assert.equal(result.codAvailable, false);
});

test('Serviceability: a response with no verdict block is not a green light', async () => {
    setDtdcHandlers({ ...defaultHandlers(), pincode: () => jsonResponse({ unexpected: true }) });
    const result = await shipmentService.checkDtdcServiceability('500034', '110001');
    assert.equal(result.serviceable, false);
});

test('Serviceability: a malformed pincode is rejected without a carrier call', async () => {
    clearDtdcCalls();
    const result = await shipmentService.checkDtdcServiceability('12', 'abcdef');
    assert.equal(result.serviceable, false);
    assert.equal(dtdcCalls.length, 0);
});

test('Serviceability: a carrier outage degrades to "not serviceable", not a crash', async () => {
    setDtdcHandlers({ ...defaultHandlers(), pincode: () => new Response('down', { status: 500 }) });
    const result = await shipmentService.checkDtdcServiceability('500034', '110001');
    assert.equal(result.serviceable, false);
    assert.ok(result.error);
});

// ═══════════════════════════════════════════════════════════════════════════
// Customer tracking
// ═══════════════════════════════════════════════════════════════════════════

test('Customer tracking: the owner sees the AWB and shipment timeline', async () => {
    const vendor = await makeVendor(M, 'CustomerSeller', 'retail');
    const user = await makeUser(M, 'Buyer');
    const order = await makeOrder(M, { fulfillmentType: 'retail', vendorId: vendor._id, userId: user._id });
    const shipment = await shipmentService.bookDtdcShipment(order, vendor);

    const res = await request(`/api/user/orders/${order._id}/tracking`, { headers: userAuth(user) });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.isQuickCommerce, false);
    assert.equal(res.body.data.shipment.awbNumber, shipment.awbNumber);
    assert.equal(res.body.data.deliveryPartner, 'DTDC');
    assert.equal(res.body.data.rider, null, 'a courier parcel has no internal rider');
});

test('Customer tracking: another customer cannot read the AWB', async () => {
    const vendor = await makeVendor(M, 'PrivacySeller', 'retail');
    const owner = await makeUser(M, 'OwnerBuyer');
    const stranger = await makeUser(M, 'StrangerBuyer');
    const order = await makeOrder(M, { fulfillmentType: 'retail', vendorId: vendor._id, userId: owner._id });
    const shipment = await shipmentService.bookDtdcShipment(order, vendor);

    const res = await request(`/api/user/orders/${order._id}/tracking`, { headers: userAuth(stranger) });

    assert.equal(res.status, 404);
    assert.equal(JSON.stringify(res.body).includes(shipment.awbNumber), false);
});

test('Customer tracking: a QC order shows rider fields and no DTDC shipment', async () => {
    const vendor = await makeVendor(M, 'QcTrackSeller', 'qc');
    const user = await makeUser(M, 'QcBuyer');
    const order = await makeOrder(M, {
        fulfillmentType: 'quick_commerce', experience: 'quick_commerce',
        vendorId: vendor._id, userId: user._id,
    });

    const res = await request(`/api/user/orders/${order._id}/tracking`, { headers: userAuth(user) });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.isQuickCommerce, true);
    assert.equal(res.body.data.shipment, null);
    assert.equal(res.body.data.deliveryPartner, null);
});

// ═══════════════════════════════════════════════════════════════════════════
// Split-order channel attribution
//
// These use the EXACT document shape the OrderSplitterEngine writes, because
// that shape is what exposed the defect: every real order carries a
// `vendorItems[]` slice whose `orderType` is a PRICING type, and a Quick
// Commerce order's slice therefore reads 'retail'.
// ═══════════════════════════════════════════════════════════════════════════

test('Split orders: a QC order written by the real splitter never reaches DTDC', async () => {
    const vendor = await makeVendor(M, 'SplitterQcSeller', 'qc');
    const order = await makeOrder(M, {
        fulfillmentType: 'quick_commerce',
        experience: 'quick_commerce',
        orderType: 'retail',
        vendorId: vendor._id,
        vendorItems: [{
            vendorId: vendor._id, items: [],
            fulfillmentType: 'quick_commerce',
            orderType: 'retail',
            status: 'pending',
        }],
    });

    clearDtdcCalls();
    await assert.rejects(() => shipmentService.bookDtdcShipment(order, vendor), /provider mismatch/i);
    assert.equal(dtdcCalls.length, 0);

    const res = await request(`/api/vendor/orders/${order._id}/book-dtdc`, {
        method: 'POST', headers: vendorAuth(vendor),
    });
    assert.equal(res.status, 403);
    assert.equal(bookingCalls().length, 0);
});

test('Split orders: a legacy QC slice carrying no channel still routes internally', async () => {
    const vendor = await makeVendor(M, 'LegacySliceQcSeller', 'qc');
    const order = await makeOrder(M, {
        fulfillmentType: 'quick_commerce',
        experience: 'quick_commerce',
        vendorId: vendor._id,
        // Written before vendorItems carried a channel at all.
        vendorItems: [{ vendorId: vendor._id, items: [], orderType: 'retail', status: 'pending' }],
    });

    clearDtdcCalls();
    await assert.rejects(() => shipmentService.bookDtdcShipment(order, vendor), /provider mismatch/i);
    assert.equal(dtdcCalls.length, 0);
});

test('Split orders: a retail slice on the same order still books normally', async () => {
    const vendor = await makeVendor(M, 'SplitterRetailSeller', 'retail');
    const order = await makeOrder(M, {
        fulfillmentType: 'retail',
        vendorId: vendor._id,
        status: 'confirmed',
        vendorItems: [{
            vendorId: vendor._id, items: [],
            fulfillmentType: 'retail', orderType: 'retail', status: 'confirmed',
        }],
    });

    const shipment = await shipmentService.bookDtdcShipment(order, vendor);
    assert.ok(shipment.awbNumber);
    assert.equal(shipment.channel, 'retail');
});

test('Split orders: migration 0012 backfills the slice channel on historical orders', async () => {
    const vendor = await makeVendor(M, 'BackfillSeller', 'qc');
    const order = await makeOrder(M, {
        fulfillmentType: 'quick_commerce',
        experience: 'quick_commerce',
        vendorId: vendor._id,
        vendorItems: [{ vendorId: vendor._id, items: [], orderType: 'retail', status: 'pending' }],
    });
    // Strip the field the way a pre-migration document would be.
    await M.Order.collection.updateOne(
        { _id: order._id },
        { $unset: { 'vendorItems.0.fulfillmentType': '' } }
    );

    const migration = (await import('../../src/migrations/0012_vendor_item_fulfillment_type.js')).default;
    await migration.up();

    const repaired = await M.Order.findById(order._id).lean();
    assert.equal(repaired.vendorItems[0].fulfillmentType, 'quick_commerce');

    const result = await migration.verify();
    assert.equal(result.ok, true, result.detail);

    // Idempotent.
    await migration.up();
    assert.equal((await migration.verify()).ok, true);
});

test('Split orders: migration 0012 never changes a slice that already names a channel', async () => {
    const vendor = await makeVendor(M, 'NoOverwriteSeller', 'retail');
    const order = await makeOrder(M, {
        fulfillmentType: 'retail',
        vendorId: vendor._id,
        vendorItems: [{
            vendorId: vendor._id, items: [],
            fulfillmentType: 'wholesale', orderType: 'wholesale', status: 'pending',
        }],
    });

    const migration = (await import('../../src/migrations/0012_vendor_item_fulfillment_type.js')).default;
    await migration.up();

    const after = await M.Order.findById(order._id).lean();
    assert.equal(after.vendorItems[0].fulfillmentType, 'wholesale', 'a recorded value is evidence, not noise');
});

// ═══════════════════════════════════════════════════════════════════════════
// Quick Commerce internal delivery
// ═══════════════════════════════════════════════════════════════════════════

test('Quick Commerce: the whole internal lifecycle runs with zero DTDC contact', async () => {
    const { applyQuickCommerceStatus } = await import('../../src/services/quickCommerceOrderStatus.service.js');

    const vendor = await makeVendor(M, 'QcLifecycleSeller', 'qc');
    const user = await makeUser(M, 'QcLifecycleBuyer');
    const order = await makeOrder(M, {
        fulfillmentType: 'quick_commerce',
        experience: 'quick_commerce',
        vendorId: vendor._id,
        userId: user._id,
        quickCommerce: { status: 'placed', promisedEtaMinutes: 15, promisedAt: new Date() },
    });

    clearDtdcCalls();

    // Store side, then rider side — the states an internal delivery moves through.
    for (const next of ['accepted', 'preparing', 'ready', 'picked_up', 'arriving', 'delivered']) {
        applyQuickCommerceStatus(order, next);
        await order.save();
    }

    const finished = await M.Order.findById(order._id);
    assert.equal(finished.quickCommerce.status, 'delivered');
    assert.equal(finished.status, 'delivered');

    // The assertion this whole test exists for.
    assert.equal(dtdcCalls.length, 0, 'Quick Commerce must never touch the courier');
    assert.equal(await M.Shipment.countDocuments({ orderId: order._id }), 0);
});

test('Quick Commerce: no Shipment record is ever created for a QC order', async () => {
    const vendor = await makeVendor(M, 'QcNoShipmentSeller', 'qc');
    const order = await makeOrder(M, {
        fulfillmentType: 'quick_commerce', experience: 'quick_commerce', vendorId: vendor._id,
    });

    await assert.rejects(() => shipmentService.bookDtdcShipment(order, vendor));
    assert.equal(
        await M.Shipment.countDocuments({ orderId: order._id }), 0,
        'a refused booking must not leave a shipment stub behind'
    );
});

test('Quick Commerce: a retail order never enters the rider assignment path', async () => {
    // The rider system keys off `experience`; a retail order carries the
    // marketplace experience and is therefore invisible to it.
    const vendor = await makeVendor(M, 'RetailNotQcSeller', 'retail');
    const order = await makeOrder(M, { fulfillmentType: 'retail', vendorId: vendor._id });

    assert.notEqual(order.experience, 'quick_commerce');
    assert.equal(order.quickCommerce?.status, undefined);
    assert.ok(!order.deliveryBoyId, 'a courier order carries no internal rider');
});

// ═══════════════════════════════════════════════════════════════════════════
// Database contract
// ═══════════════════════════════════════════════════════════════════════════

test('Database: the AWB is globally unique', async () => {
    const vendor = await makeVendor(M, 'UniqueAwbSeller', 'retail');
    const order = await makeOrder(M, { fulfillmentType: 'retail', vendorId: vendor._id });
    const shipment = await shipmentService.bookDtdcShipment(order, vendor);

    const other = await makeOrder(M, { fulfillmentType: 'retail', vendorId: vendor._id });
    await assert.rejects(() => M.Shipment.create({
        orderId: other._id, vendorId: vendor._id, deliveryProvider: 'dtdc',
        awbNumber: shipment.awbNumber, status: 'booked',
        bookingId: `${other._id}_${vendor._id}`,
    }), /duplicate key/i);
});

test('Database: migration 0011 verifies the reconciled index set', async () => {
    const migration = (await import('../../src/migrations/0011_shipment_model.js')).default;
    await migration.up();
    const result = await migration.verify();
    assert.equal(result.ok, true, result.detail);
});

test('Database: a legacy order with neither channel field still books as retail', async () => {
    const vendor = await makeVendor(M, 'LegacySeller', 'retail');
    // Documents predating fulfilment groups carry no fulfillmentType at all.
    const order = await makeOrder(M, { vendorId: vendor._id });
    await M.Order.updateOne({ _id: order._id }, { $unset: { fulfillmentType: '', experience: '', orderType: '' } });
    const legacy = await M.Order.findById(order._id);

    const shipment = await shipmentService.bookDtdcShipment(legacy, vendor);
    assert.equal(shipment.channel, 'retail');
    assert.equal(shipment.serviceType, 'PRIORITY');
});
