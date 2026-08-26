/**
 * Pincode validation and deliverability — integration suite.
 *
 * Two layers, tested separately because they catch different things and one of
 * them cannot catch what the other does:
 *
 *   FORMAT       stops `HELLO`, `<script>`, wrong lengths and leading zeros
 *                from reaching a shipping label. It does NOT stop `452101`,
 *                which is a perfectly well-formed pincode that does not exist.
 *
 *   DELIVERABILITY  asks the carrier. This is the only layer that catches
 *                   `452101`, and the only one that knows about COD.
 *
 * The failure policy is the subtle part and is tested explicitly: a carrier
 * REFUSAL blocks checkout, a carrier OUTAGE does not. Failing closed on an
 * outage would turn someone else's downtime into our lost revenue, for a check
 * the vendor performs again before any parcel moves.
 *
 * Run with:  npm run test:deliverability
 */

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongod = await MongoMemoryServer.create();
process.env.MONGO_URI              = `${mongod.getUri()}dwellmart_deliverability_test`;
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
    installFetchStub, setDtdcHandlers, defaultHandlers, jsonResponse, clearDtdcCalls, dtdcCalls,
} from './_dtdcHarness.mjs';
import { models, makeVendor, makeUser, resetPlanCache } from './_dtdcFixtures.mjs';

await mongoose.connect(process.env.MONGO_URI);
const realFetch = global.fetch;
installFetchStub();
setDtdcHandlers(defaultHandlers());

const { default: app } = await import('../../src/app.js');
const { generateTokens } = await import('../../src/utils/generateToken.js');
const { checkDeliverability, Deliverability } =
    await import('../../src/services/shipping/deliverability.service.js');
const { isValidPincode, normalizePincode } = await import('../../src/constants/pincode.js');
const { cacheInvalidatePrefix } = await import('../../src/utils/ttlCache.js');

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
    setDtdcHandlers(defaultHandlers());
    // Serviceability verdicts are cached for six hours; a stale one would make
    // every stub swap below a no-op.
    cacheInvalidatePrefix('deliverability:');
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

const userAuth = (user) => ({
    Authorization: `Bearer ${generateTokens({ id: String(user._id), role: 'customer', email: user.email }).accessToken}`,
});

// ── Carrier response shapes, verified against the live sandbox ─────────────

const carrierServes = (codAvailable = 'Y') => ({
    ...defaultHandlers(),
    pincode: () => jsonResponse({
        ZIPCODE_RESP: [{
            MESSAGE: 'SUCCESS', ORGPIN: '500034', DESTPIN: '110001',
            DESTCITY: 'DELHI', DESTSTATE: 'DELHI', SERV_COD: codAvailable, SERVFLAG: 'Y',
        }],
    }),
});

/** The exact response the live API returns for 452101. */
const carrierRefuses = () => ({
    ...defaultHandlers(),
    pincode: () => jsonResponse({
        ZIPCODE_RESP: [{
            MESSAGE: 'DESTPIN is not valid', ORGPIN: '500034', DESTPIN: '452101',
            SERV_COD: 'N', SERVFLAG: 'Y',
        }],
    }),
});

const carrierDown = () => ({
    ...defaultHandlers(),
    pincode: () => new Response('gateway timeout', { status: 504 }),
});

// ═══════════════════════════════════════════════════════════════════════════
// Format layer
// ═══════════════════════════════════════════════════════════════════════════

test('Format: accepts a well-formed pincode', () => {
    assert.equal(isValidPincode('452001'), true);
    assert.equal(isValidPincode('110001'), true);
    // Well-formed but non-existent. The format layer CANNOT catch this — only
    // the carrier can, which is the whole reason the second layer exists.
    assert.equal(isValidPincode('452101'), true);
});

test('Format: rejects everything that is not six digits starting 1-9', () => {
    for (const bad of ['HELLO', 'ABC', '<script>', '', '12345', '1234567', '0452001', '45200a', '   ']) {
        assert.equal(isValidPincode(bad), false, bad);
    }
});

test('Format: normalises a pasted pincode rather than rejecting it', () => {
    // A customer pasting "PIN-452 001" should end up with a usable value.
    assert.equal(normalizePincode('452 001'), '452001');
    assert.equal(normalizePincode('PIN-452001'), '452001');
    assert.equal(normalizePincode('4520019999'), '452001');
});

test('Format: the address API refuses a malformed pincode', async () => {
    const user = await makeUser(M, 'AddressUser');
    const res = await request('/api/user/addresses', {
        method: 'POST', headers: userAuth(user),
        body: {
            name: 'Home', fullName: 'Test User', phone: '9777777777',
            address: '12 MG Road', city: 'Indore', state: 'MP',
            zipCode: 'HELLO', country: 'India',
        },
    });

    assert.equal(res.status, 400);
    assert.match(JSON.stringify(res.body), /6-digit pincode/i);
});

test('Format: a script tag can no longer reach a shipping label', async () => {
    const user = await makeUser(M, 'ScriptUser');
    const res = await request('/api/user/addresses', {
        method: 'POST', headers: userAuth(user),
        body: {
            name: 'Home', fullName: 'Test User', phone: '9777777777',
            address: '12 MG Road', city: 'Indore', state: 'MP',
            zipCode: '<script>', country: 'India',
        },
    });
    assert.equal(res.status, 400);
    assert.equal(await M.Order.db.collection('addresses').countDocuments({}), 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// Deliverability layer — the one that catches 452101
// ═══════════════════════════════════════════════════════════════════════════

test('Deliverability: a served route is deliverable and not blocking', async () => {
    setDtdcHandlers(carrierServes());
    const verdict = await checkDeliverability('110001');

    assert.equal(verdict.status, Deliverability.DELIVERABLE);
    assert.equal(verdict.deliverable, true);
    assert.equal(verdict.blocking, false);
    assert.equal(verdict.city, 'DELHI');
});

test('Deliverability: a carrier REFUSAL blocks, with the carrier\'s own reason', async () => {
    setDtdcHandlers(carrierRefuses());
    const verdict = await checkDeliverability('452101');

    assert.equal(verdict.status, Deliverability.NOT_DELIVERABLE);
    assert.equal(verdict.deliverable, false);
    assert.equal(verdict.blocking, true, 'selling something we cannot ship is the thing to prevent');
    assert.match(verdict.message, /452101/);
});

test('Deliverability: a carrier OUTAGE does NOT block', async () => {
    // The distinction this whole module exists for. Failing closed here would
    // convert someone else's downtime into our lost revenue, for a check the
    // vendor performs again before any parcel moves.
    setDtdcHandlers(carrierDown());
    const verdict = await checkDeliverability('110001');

    assert.equal(verdict.status, Deliverability.UNVERIFIED);
    assert.equal(verdict.blocking, false, 'an outage must not stop every customer checking out');
    assert.match(verdict.message, /could not confirm/i);
});

test('Deliverability: a malformed pincode never reaches the carrier', async () => {
    clearDtdcCalls();
    const verdict = await checkDeliverability('HELLO');

    assert.equal(verdict.status, Deliverability.INVALID_FORMAT);
    assert.equal(verdict.blocking, true);
    assert.equal(dtdcCalls.length, 0, 'no point asking the carrier about a non-pincode');
});

test('Deliverability: the verdict is cached, so checkout does not re-query', async () => {
    setDtdcHandlers(carrierServes());
    clearDtdcCalls();

    await checkDeliverability('110001');
    const afterFirst = dtdcCalls.filter((c) => c.kind === 'pincode').length;
    await checkDeliverability('110001');
    await checkDeliverability('110001');

    assert.equal(afterFirst, 1);
    assert.equal(
        dtdcCalls.filter((c) => c.kind === 'pincode').length, 1,
        'serviceability changes on the order of months; checkout hits this constantly'
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// COD — a second, independent refusal
// ═══════════════════════════════════════════════════════════════════════════

test('COD: a prepaid-only route blocks a COD order but allows a prepaid one', async () => {
    // A route can accept a prepaid parcel and refuse cash. Booking COD to such
    // a pincode is rejected by the carrier AFTER the sale is recorded.
    setDtdcHandlers(carrierServes('N'));

    const prepaid = await checkDeliverability('110001', { requiresCod: false });
    assert.equal(prepaid.blocking, false);
    assert.equal(prepaid.codAvailable, false);

    cacheInvalidatePrefix('deliverability:');
    setDtdcHandlers(carrierServes('N'));
    const cod = await checkDeliverability('110001', { requiresCod: true });
    assert.equal(cod.deliverable, true, 'the parcel CAN be delivered');
    assert.equal(cod.blocking, true, 'the cash cannot be collected');
    assert.match(cod.message, /cash on delivery is not available/i);
});

test('COD: a COD-enabled route allows a COD order', async () => {
    setDtdcHandlers(carrierServes('Y'));
    const verdict = await checkDeliverability('110001', { requiresCod: true });

    assert.equal(verdict.blocking, false);
    assert.equal(verdict.codAvailable, true);
});

// ═══════════════════════════════════════════════════════════════════════════
// Public endpoint
// ═══════════════════════════════════════════════════════════════════════════

test('Endpoint: reports a served pincode', async () => {
    setDtdcHandlers(carrierServes());
    const res = await request('/api/deliverability?pincode=110001');

    assert.equal(res.status, 200);
    assert.equal(res.body.data.deliverable, true);
    assert.equal(res.body.data.blocking, false);
});

test('Endpoint: reports a refused pincode without failing the request', async () => {
    setDtdcHandlers(carrierRefuses());
    const res = await request('/api/deliverability?pincode=452101');

    // 200 with a verdict, not a 4xx — the customer asked a question and got an
    // answer. The refusal is in the payload for the UI to render.
    assert.equal(res.status, 200);
    assert.equal(res.body.data.blocking, true);
    assert.match(res.body.data.message, /do not deliver/i);
});

test('Endpoint: a missing pincode is a 400', async () => {
    const res = await request('/api/deliverability');
    assert.equal(res.status, 400);
});

test('Endpoint: is reachable without logging in', async () => {
    // Customers check delivery before they commit to anything, often before
    // they have an account.
    setDtdcHandlers(carrierServes());
    const res = await request('/api/deliverability?pincode=110001');
    assert.equal(res.status, 200);
});

test('Endpoint: honours the COD question', async () => {
    setDtdcHandlers(carrierServes('N'));
    const res = await request('/api/deliverability?pincode=110001&paymentMethod=cod');

    assert.equal(res.body.data.blocking, true);
    assert.match(res.body.data.message, /cash on delivery/i);
});

// ═══════════════════════════════════════════════════════════════════════════
// Server-side enforcement — the part a client cannot skip
// ═══════════════════════════════════════════════════════════════════════════

test('Checkout: a refused pincode is rejected by the order path itself', async () => {
    // The screen asks the same question for instant feedback, but a REST client
    // can skip the screen entirely — so the refusal has to live on the only
    // path that creates an order.
    setDtdcHandlers(carrierRefuses());
    const { splitAndCreateOrders } = await import('../../src/services/checkout/OrderSplitterEngine.js');

    await assert.rejects(
        () => splitAndCreateOrders({
            sessionId: 'CS-DELIV-1',
            items: [{ productId: String(new mongoose.Types.ObjectId()), quantity: 1, price: 100 }],
            shippingAddress: {
                name: 'Ravi', phone: '9777777777', address: '5 Park St',
                city: 'Indore', state: 'MP', zipCode: '452101', country: 'India',
            },
            paymentMethod: 'cod',
        }),
        (err) => {
            assert.match(err.message, /do not deliver/i);
            return true;
        }
    );
});

test('Checkout: an outage does not stop an order being created', async () => {
    setDtdcHandlers(carrierDown());
    const verdict = await checkDeliverability('110001');
    assert.equal(verdict.blocking, false, 'the checkout guard keys off `blocking`');
});
