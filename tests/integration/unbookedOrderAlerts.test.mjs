/**
 * Unbooked-order alerts — integration suite.
 *
 * Real Express app, real MongoDB, stubbed carrier. The eligibility rule is the
 * whole point of this feature, so it is tested against real documents rather
 * than a mocked query: the rule is expressed as an aggregation, and an
 * aggregation that is wrong is wrong only against real data.
 *
 * Run with:  npm run test:unbooked
 */

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongod = await MongoMemoryServer.create();
process.env.MONGO_URI              = `${mongod.getUri()}dwellmart_unbooked_test`;
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

import { installFetchStub, setDtdcHandlers, defaultHandlers, clearDtdcCalls, resetAwbSequence }
    from './_dtdcHarness.mjs';
import { models, makeVendor, makeUser, makeOrder, resetPlanCache } from './_dtdcFixtures.mjs';

await mongoose.connect(process.env.MONGO_URI);

const realFetch = global.fetch;
installFetchStub();
setDtdcHandlers(defaultHandlers());

const { default: app } = await import('../../src/app.js');
const { generateTokens } = await import('../../src/utils/generateToken.js');
const alerts = await import('../../src/services/shipping/unbookedOrderAlerts.service.js');
const shipmentService = await import('../../src/services/shipping/dtdcShipment.service.js');

const M = await models();
const Notification = (await import('../../src/models/Notification.model.js')).default;
const Settings = (await import('../../src/models/Settings.model.js')).default;

let server;
let baseUrl;

const HOUR = 3_600_000;

before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    alerts.stopUnbookedOrderSweep();
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
    await alerts.releaseSweepLease();
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const request = async (path, { method = 'GET', headers = {} } = {}) => {
    const response = await realFetch(`${baseUrl}${path}`, { method, headers });
    const text = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: response.status, body: parsed };
};

const vendorAuth = (vendor) => ({
    Authorization: `Bearer ${generateTokens({ id: String(vendor._id), role: 'vendor', email: vendor.email }).accessToken}`,
});

/**
 * Age an order by rewriting `updatedAt` directly.
 *
 * `timestamps: false` is essential — a normal save would immediately reset the
 * field this test exists to control.
 */
const ageOrder = async (order, hours) => {
    await M.Order.collection.updateOne(
        { _id: order._id },
        { $set: { updatedAt: new Date(Date.now() - hours * HOUR) } }
    );
    return M.Order.findById(order._id);
};

/** An order in a state where the seller is expected to have despatched it. */
const readyOrder = async (vendor, overrides = {}) => makeOrder(M, {
    fulfillmentType: 'retail',
    vendorId: vendor._id,
    status: 'confirmed',
    ...overrides,
});

const setThresholds = async (vendorHours, adminHours) => Settings.findOneAndUpdate(
    { key: alerts.SHIPPING_SETTINGS_KEY },
    { $set: { key: alerts.SHIPPING_SETTINGS_KEY, value: { unbookedVendorAlertHours: vendorHours, unbookedAdminAlertHours: adminHours } } },
    { upsert: true }
);

const vendorNotifications = (vendorId) => Notification.countDocuments({
    recipientId: vendorId, recipientType: 'vendor', 'data.scope': 'unbooked_shipment',
});
const adminNotifications = () => Notification.countDocuments({
    recipientType: 'admin', 'data.scope': 'unbooked_shipment',
});

// ═══════════════════════════════════════════════════════════════════════════
// Eligibility
// ═══════════════════════════════════════════════════════════════════════════

test('Eligibility: a retail order past the threshold is returned', async () => {
    const vendor = await makeVendor(M, 'RetailLate', 'retail');
    const order = await readyOrder(vendor);
    await ageOrder(order, 8);

    const found = await alerts.findUnbookedOrders({ olderThan: new Date(Date.now() - 6 * HOUR) });
    assert.equal(found.length, 1);
    assert.equal(String(found[0]._id), String(order._id));
});

test('Eligibility: a retail order inside the threshold is not returned', async () => {
    const vendor = await makeVendor(M, 'RetailFresh', 'retail');
    const order = await readyOrder(vendor);
    await ageOrder(order, 2);

    const found = await alerts.findUnbookedOrders({ olderThan: new Date(Date.now() - 6 * HOUR) });
    assert.equal(found.length, 0);
});

test('Eligibility: a wholesale order past the threshold is returned', async () => {
    const vendor = await makeVendor(M, 'WholesaleLate', 'wholesale');
    const order = await readyOrder(vendor, { fulfillmentType: 'wholesale', status: 'approved' });
    await ageOrder(order, 10);

    const found = await alerts.findUnbookedOrders({ olderThan: new Date(Date.now() - 6 * HOUR) });
    assert.equal(found.length, 1);
    assert.equal(found[0].fulfillmentType, 'wholesale');
});

test('Eligibility: a wholesale order inside the threshold is not returned', async () => {
    const vendor = await makeVendor(M, 'WholesaleFresh', 'wholesale');
    const order = await readyOrder(vendor, { fulfillmentType: 'wholesale', status: 'approved' });
    await ageOrder(order, 1);

    const found = await alerts.findUnbookedOrders({ olderThan: new Date(Date.now() - 6 * HOUR) });
    assert.equal(found.length, 0);
});

test('Eligibility: a Quick Commerce order is NEVER returned, at any age', async () => {
    const vendor = await makeVendor(M, 'QcNeverLate', 'qc');
    // Every plausible QC shape, including one whose status happens to match a
    // courier-channel dispatch-ready value.
    for (const overrides of [
        { fulfillmentType: 'quick_commerce', experience: 'quick_commerce', status: 'processing' },
        { fulfillmentType: 'quick_commerce', experience: 'marketplace', status: 'confirmed' },
        { fulfillmentType: null, experience: 'quick_commerce', status: 'confirmed' },
    ]) {
        const order = await readyOrder(vendor, overrides);
        await ageOrder(order, 500);
    }

    const found = await alerts.findUnbookedOrders({ olderThan: new Date(Date.now() - 1 * HOUR) });
    assert.equal(found.length, 0, 'Quick Commerce has no courier booking to be missing');
});

test('Eligibility: cancelled, returned and delivered orders are never returned', async () => {
    const vendor = await makeVendor(M, 'TerminalStates', 'retail');
    for (const status of ['cancelled', 'returned', 'delivered']) {
        const order = await readyOrder(vendor, { status });
        await ageOrder(order, 48);
    }

    const found = await alerts.findUnbookedOrders({ olderThan: new Date(Date.now() - 6 * HOUR) });
    assert.equal(found.length, 0);
});

test('Eligibility: a pending order is not chased — it is not the seller\'s to despatch yet', async () => {
    const vendor = await makeVendor(M, 'StillPending', 'retail');
    const order = await readyOrder(vendor, { status: 'pending' });
    await ageOrder(order, 48);

    const found = await alerts.findUnbookedOrders({ olderThan: new Date(Date.now() - 6 * HOUR) });
    assert.equal(found.length, 0);
});

test('Eligibility: an order with an AWB is not returned', async () => {
    const vendor = await makeVendor(M, 'AlreadyBooked', 'retail');
    const order = await readyOrder(vendor);
    await shipmentService.bookDtdcShipment(await M.Order.findById(order._id), vendor);
    await ageOrder(order, 48);

    const found = await alerts.findUnbookedOrders({ olderThan: new Date(Date.now() - 6 * HOUR) });
    assert.equal(found.length, 0);
});

test('Eligibility: an order whose booking FAILED (shipment, no AWB) IS still returned', async () => {
    // A Shipment row without an AWB is a failed attempt, not a booking. The
    // parcel genuinely still needs despatching, so the seller must be chased.
    const vendor = await makeVendor(M, 'FailedBooking', 'retail');
    const order = await readyOrder(vendor);
    await M.Shipment.create({
        orderId: order._id, vendorId: vendor._id, deliveryProvider: 'dtdc',
        status: 'failed', failureReason: 'carrier rejected',
        bookingId: `${order._id}_${vendor._id}`,
    });
    await ageOrder(order, 8);

    const found = await alerts.findUnbookedOrders({ olderThan: new Date(Date.now() - 6 * HOUR) });
    assert.equal(found.length, 1, 'a failed booking still leaves the order unbooked');
});

test('Eligibility: the count uses the same rule as the list', async () => {
    const vendor = await makeVendor(M, 'CountParity', 'retail');
    for (let i = 0; i < 3; i++) await ageOrder(await readyOrder(vendor), 8);
    await ageOrder(await readyOrder(vendor), 1); // inside the window

    const criteria = { olderThan: new Date(Date.now() - 6 * HOUR) };
    assert.equal(await alerts.countUnbookedOrders(criteria), 3);
    assert.equal((await alerts.findUnbookedOrders(criteria)).length, 3);
});

// ═══════════════════════════════════════════════════════════════════════════
// Sweep behaviour
// ═══════════════════════════════════════════════════════════════════════════

test('Sweep: notifies the vendor exactly once, and not again on the next pass', async () => {
    const vendor = await makeVendor(M, 'OnceOnly', 'retail');
    const order = await readyOrder(vendor);
    await ageOrder(order, 8);

    const first = await alerts.runUnbookedOrderSweep();
    assert.equal(first.alerted, 1);
    assert.equal(await vendorNotifications(String(vendor._id)), 1);

    await alerts.releaseSweepLease();
    const second = await alerts.runUnbookedOrderSweep();
    assert.equal(second.alerted, 0, 'the stamp makes the sweep idempotent');
    assert.equal(await vendorNotifications(String(vendor._id)), 1);
});

test('Sweep: the idempotency stamp is persisted, so a restart does not re-alert', async () => {
    const vendor = await makeVendor(M, 'SurvivesRestart', 'retail');
    const order = await readyOrder(vendor);
    await ageOrder(order, 8);

    await alerts.runUnbookedOrderSweep();
    const stamped = await M.Order.findById(order._id).lean();
    assert.ok(stamped.integration.unbookedAlertedAt, 'the stamp lives on the order, not in memory');

    // A restart re-reads from the database; nothing in-process carries over.
    await alerts.releaseSweepLease();
    const afterRestart = await alerts.runUnbookedOrderSweep();
    assert.equal(afterRestart.alerted, 0);
});

test('Sweep: a second instance holding the lease is refused', async () => {
    const vendor = await makeVendor(M, 'LeaseGuard', 'retail');
    await ageOrder(await readyOrder(vendor), 8);

    // Simulate another application instance owning a live lease. Renewing our
    // OWN lease is correct and must keep working, so the guard can only be
    // proven with a genuinely foreign owner id.
    await Settings.findOneAndUpdate(
        { key: '_shipping_sweep_lease' },
        { $set: {
            key: '_shipping_sweep_lease',
            value: { ownerId: 'another-instance-9999', expiresAt: new Date(Date.now() + 10 * 60_000) },
        } },
        { upsert: true }
    );

    const refused = await alerts.runUnbookedOrderSweep();
    assert.equal(refused.skipped, true, 'only the lease owner sweeps');
    assert.equal(await vendorNotifications(String(vendor._id)), 0);

    // Once that lease expires, this instance may claim it.
    await Settings.updateOne(
        { key: '_shipping_sweep_lease' },
        { $set: { 'value.expiresAt': new Date(Date.now() - 1000) } }
    );
    const claimed = await alerts.runUnbookedOrderSweep();
    assert.equal(claimed.skipped, false);
    assert.equal(claimed.alerted, 1);
});

test('Sweep: the same instance may renew its own lease on the next tick', async () => {
    const vendor = await makeVendor(M, 'LeaseRenew', 'retail');
    await ageOrder(await readyOrder(vendor), 8);

    const first = await alerts.runUnbookedOrderSweep();
    assert.equal(first.skipped, false);

    // A single-instance deployment must keep sweeping every tick; refusing to
    // renew our own lease would stall the feature entirely.
    const second = await alerts.runUnbookedOrderSweep();
    assert.equal(second.skipped, false);
    assert.equal(second.alerted, 0, 'nothing new to alert, but the pass did run');
});

test('Sweep: admins are alerted only past the longer threshold', async () => {
    await setThresholds(6, 24);

    const vendor = await makeVendor(M, 'AdminThreshold', 'retail');
    const recent = await readyOrder(vendor);
    await ageOrder(recent, 8);   // past vendor, inside admin

    await alerts.runUnbookedOrderSweep();
    assert.equal(await vendorNotifications(String(vendor._id)), 1);
    assert.equal(await adminNotifications(), 0, 'not overdue enough for the platform feed');

    const stale = await readyOrder(vendor);
    await ageOrder(stale, 30);   // past both
    await alerts.releaseSweepLease();
    await alerts.runUnbookedOrderSweep();
    assert.equal(await adminNotifications(), 1);
});

test('Sweep: both thresholds are configurable through Settings', async () => {
    await setThresholds(1, 2);
    const configured = await alerts.getAlertThresholds();
    assert.equal(configured.vendorHours, 1);
    assert.equal(configured.adminHours, 2);

    const vendor = await makeVendor(M, 'Configurable', 'retail');
    const order = await readyOrder(vendor);
    await ageOrder(order, 3); // inside the DEFAULT 6h, past the configured 1h

    const result = await alerts.runUnbookedOrderSweep();
    assert.equal(result.alerted, 1, 'the configured threshold is what governs');
    assert.equal(await adminNotifications(), 1, 'and so is the configured admin threshold');
});

test('Sweep: falls back to the documented defaults when Settings is absent', async () => {
    const defaults = await alerts.getAlertThresholds();
    assert.equal(defaults.vendorHours, alerts.DEFAULT_VENDOR_ALERT_HOURS);
    assert.equal(defaults.adminHours, alerts.DEFAULT_ADMIN_ALERT_HOURS);
});

test('Sweep: booking the shipment removes the order from the list', async () => {
    const vendor = await makeVendor(M, 'BookingClears', 'retail');
    const order = await readyOrder(vendor);
    await ageOrder(order, 8);

    assert.equal((await alerts.findUnbookedOrders({ olderThan: new Date(Date.now() - 6 * HOUR) })).length, 1);

    await shipmentService.bookDtdcShipment(await M.Order.findById(order._id), vendor);

    assert.equal((await alerts.findUnbookedOrders({ olderThan: new Date(Date.now() - 6 * HOUR) })).length, 0);

    await alerts.releaseSweepLease();
    const afterBooking = await alerts.runUnbookedOrderSweep();
    assert.equal(afterBooking.alerted, 0, 'and generates no further alert');
});

// ═══════════════════════════════════════════════════════════════════════════
// Vendor API
// ═══════════════════════════════════════════════════════════════════════════

test('Vendor API: returns only the caller\'s own awaiting orders', async () => {
    const mine = await makeVendor(M, 'MyOrders', 'retail');
    const theirs = await makeVendor(M, 'TheirOrders', 'retail');

    const mineOrder = await readyOrder(mine);
    await ageOrder(mineOrder, 8);
    const theirOrder = await readyOrder(theirs);
    await ageOrder(theirOrder, 8);

    const res = await request('/api/vendor/orders/awaiting-shipment', { headers: vendorAuth(mine) });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.orders.length, 1);
    assert.equal(res.body.data.orders[0].orderId, mineOrder.orderId);
    assert.equal(
        JSON.stringify(res.body).includes(theirOrder.orderId), false,
        'another seller\'s order must not appear'
    );
});

test('Vendor API: the route resolves to the list, not to /orders/:id', async () => {
    // '/orders/:id' is declared in the same router; if it were matched first
    // this request would 404 as "order awaiting-shipment not found".
    const vendor = await makeVendor(M, 'RouteOrder', 'retail');
    const res = await request('/api/vendor/orders/awaiting-shipment', { headers: vendorAuth(vendor) });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.orders), 'the literal route wins over the parameterised one');
});

test('Vendor API: reports how long each order has been waiting', async () => {
    const vendor = await makeVendor(M, 'AgeReport', 'retail');
    const order = await readyOrder(vendor);
    await ageOrder(order, 9);

    const res = await request('/api/vendor/orders/awaiting-shipment', { headers: vendorAuth(vendor) });
    const row = res.body.data.orders[0];
    assert.equal(row.hoursAwaiting, 9);
    assert.equal(row.isOverdue, true);
    assert.equal(res.body.data.thresholdHours, alerts.DEFAULT_VENDOR_ALERT_HOURS);
});

test('Vendor API: a Quick Commerce vendor sees nothing here', async () => {
    const vendor = await makeVendor(M, 'QcVendorApi', 'qc');
    const order = await readyOrder(vendor, {
        fulfillmentType: 'quick_commerce', experience: 'quick_commerce', status: 'processing',
    });
    await ageOrder(order, 48);

    const res = await request('/api/vendor/orders/awaiting-shipment', { headers: vendorAuth(vendor) });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.orders.length, 0);
});

test('Vendor API: unauthenticated access is refused', async () => {
    const res = await request('/api/vendor/orders/awaiting-shipment');
    assert.equal(res.status, 401);
});

test('Vendor API: the workspace scopes which channel is listed', async () => {
    const vendor = await makeVendor(M, 'BothChannels', 'all');
    await ageOrder(await readyOrder(vendor), 8);
    await ageOrder(await readyOrder(vendor, { fulfillmentType: 'wholesale', status: 'approved' }), 8);

    const retail = await request('/api/vendor/orders/awaiting-shipment', {
        headers: { ...vendorAuth(vendor), 'x-vendor-workspace': 'retail' },
    });
    assert.equal(retail.body.data.orders.length, 1);
    assert.equal(retail.body.data.orders[0].fulfillmentType, 'retail');

    const wholesale = await request('/api/vendor/orders/awaiting-shipment', {
        headers: { ...vendorAuth(vendor), 'x-vendor-workspace': 'wholesale' },
    });
    assert.equal(wholesale.body.data.orders.length, 1);
    assert.equal(wholesale.body.data.orders[0].fulfillmentType, 'wholesale');
});

// ═══════════════════════════════════════════════════════════════════════════
// Admin API
// ═══════════════════════════════════════════════════════════════════════════

const adminAuth = async () => {
    const Admin = (await import('../../src/models/Admin.model.js')).default;
    const admin = await Admin.create({
        name: 'QA Admin', email: `admin-${Date.now()}@qa.test`, password: 'xxxxxxxx', role: 'superadmin',
    });
    return {
        Authorization: `Bearer ${generateTokens({ id: String(admin._id), role: 'superadmin', email: admin.email }).accessToken}`,
    };
};

test('Admin API: lists awaiting orders platform-wide with vendor names', async () => {
    const v1 = await makeVendor(M, 'AdminViewA', 'retail');
    const v2 = await makeVendor(M, 'AdminViewB', 'wholesale');
    await ageOrder(await readyOrder(v1), 8);
    await ageOrder(await readyOrder(v2, { fulfillmentType: 'wholesale', status: 'approved' }), 30);

    const res = await request('/api/admin/shipments/awaiting-booking', { headers: await adminAuth() });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 2);
    const names = res.body.data.orders.map((o) => o.vendorName).sort();
    assert.deepEqual(names, ['AdminViewA', 'AdminViewB']);
    assert.ok(res.body.data.orders.some((o) => o.isCritical), 'the 30-hour one is flagged critical');
});

test('Admin API: filters by vendor, channel and age', async () => {
    const v1 = await makeVendor(M, 'FilterA', 'retail');
    const v2 = await makeVendor(M, 'FilterB', 'wholesale');
    await ageOrder(await readyOrder(v1), 8);
    await ageOrder(await readyOrder(v2, { fulfillmentType: 'wholesale', status: 'approved' }), 40);
    const headers = await adminAuth();

    const byVendor = await request(`/api/admin/shipments/awaiting-booking?vendorId=${v1._id}`, { headers });
    assert.equal(byVendor.body.data.total, 1);

    const byChannel = await request('/api/admin/shipments/awaiting-booking?channel=wholesale', { headers });
    assert.equal(byChannel.body.data.total, 1);
    assert.equal(byChannel.body.data.orders[0].fulfillmentType, 'wholesale');

    const byAge = await request('/api/admin/shipments/awaiting-booking?minHours=24', { headers });
    assert.equal(byAge.body.data.total, 1);
});

test('Admin API: Quick Commerce cannot even be requested as a channel', async () => {
    const res = await request('/api/admin/shipments/awaiting-booking?channel=quick_commerce', {
        headers: await adminAuth(),
    });
    assert.equal(res.status, 400);
});

test('Admin API: unauthenticated access is refused', async () => {
    const res = await request('/api/admin/shipments/awaiting-booking');
    assert.equal(res.status, 401);
});

test('Admin API: the route resolves to the list, not to /shipments/:id', async () => {
    const res = await request('/api/admin/shipments/awaiting-booking', { headers: await adminAuth() });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.orders));
});

test('Parity: sweep, vendor endpoint and admin endpoint agree on the same order', async () => {
    // Three consumers, one rule. If they ever disagree, the seller and the
    // console are looking at different definitions of "late".
    const vendor = await makeVendor(M, 'ParityCheck', 'retail');
    const order = await readyOrder(vendor);
    await ageOrder(order, 8);

    const vendorRes = await request('/api/vendor/orders/awaiting-shipment', { headers: vendorAuth(vendor) });
    const adminRes = await request('/api/admin/shipments/awaiting-booking', { headers: await adminAuth() });
    const swept = await alerts.findUnbookedOrders({ olderThan: new Date(Date.now() - 6 * HOUR) });

    assert.equal(vendorRes.body.data.total, 1);
    assert.equal(adminRes.body.data.total, 1);
    assert.equal(swept.length, 1);
    assert.equal(String(swept[0]._id), String(order._id));
    assert.equal(vendorRes.body.data.orders[0].orderId, adminRes.body.data.orders[0].orderId);
});
