import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import mongoose from 'mongoose';
import { CheckoutSession } from '../src/models/CheckoutSession.model.js';
import Order from '../src/models/Order.model.js';
import User from '../src/models/User.model.js';
import { createPaymentSession, verifyPayment, handleWebhook } from '../src/modules/payment/controllers/cashfree.controller.js';
import { getOrderDetail } from '../src/modules/user/controllers/order.controller.js';
import { setMockCashfreeHandler } from '../src/services/billing/cashfree.service.js';

function assert(condition, message) {
    if (!condition) {
        console.error(`❌ [FAIL] ${message}`);
        throw new Error(`ASSERTION FAILED: ${message}`);
    }
    console.log(`  ✅ [PASS] ${message}`);
}

const createMockRes = () => {
    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        },
    };
    return res;
};

async function runP006SecuritySuite() {
    console.log('\n======================================================================');
    console.log('🛡️ P0-06 PAYMENT AUTHORIZATION & OWNERSHIP SECURITY VERIFICATION');
    console.log('======================================================================\n');

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/dwellmart_test';
    await mongoose.connect(mongoUri);

    setMockCashfreeHandler({
        // User A session is already completed (takes idempotent path — no order creation needed)
        // Guest session is ACTIVE (to test PII sanitization on pending/unpaid response)
        // Unknown IDs return null (to test 404 on invalid session)
        fetchOrder: async (lookupId) => {
            const isGuestSession = String(lookupId).startsWith('CS_GUEST_');
            const isKnownSession = String(lookupId).startsWith('CS_USER_A_') || isGuestSession;
            if (!isKnownSession) return null;
            return {
                order_id: lookupId,
                order_status: isGuestSession ? 'ACTIVE' : 'PAID',
                order_amount: 1500,
                order_currency: 'INR',
            };
        },
        fetchPayments: async (lookupId) => {
            const isGuestSession = String(lookupId).startsWith('CS_GUEST_');
            if (isGuestSession) return [];
            return [{
                payment_status: 'SUCCESS',
                cf_payment_id: `CF_PAY_${Date.now()}`,
                payment_amount: 1500,
            }];
        },
        verifySignature: () => true,
    });

    const ts = Date.now();
    const userA = await User.create({
        name: 'User A',
        email: `usera_${ts}@dwellmart.com`,
        phone: '9876543210',
        password: 'password123',
    });

    const userB = await User.create({
        name: 'User B',
        email: `userb_${ts}@dwellmart.com`,
        phone: '9123456789',
        password: 'password123',
    });

    // Pre-create a fake Order representing User A's completed purchase
    // This lets verifyPayment take the idempotent path (already claimed/completed)
    // rather than trying to run splitAndCreateOrders with no-productId test items.
    const fakeOrderId = new mongoose.Types.ObjectId();
    const fakeOrder = await Order.create({
        _id: fakeOrderId,
        orderId: `RT-TEST-${ts}`,
        userId: userA._id,
        checkoutSessionId: undefined, // will be set after session is created
        vendorId: new mongoose.Types.ObjectId(),
        items: [{ name: 'User A Item', price: 1500, quantity: 1, productId: new mongoose.Types.ObjectId() }],
        shippingAddress: { name: 'User A Name', phone: '9876543210', address: '100 Private Street', city: 'Delhi', state: 'Delhi', zipCode: '110001' },
        paymentMethod: 'card',
        paymentStatus: 'paid',
        status: 'confirmed',
        subtotal: 1500,
        total: 1500,
    });

    const userASession = await CheckoutSession.create({
        sessionId: `CS_USER_A_${ts}`,
        userId: userA._id,
        items: [{ name: 'User A Item', price: 1500, quantity: 1 }],
        shippingAddress: {
            name: 'User A Name',
            email: `usera_${ts}@dwellmart.com`,
            phone: '9876543210',
            address: '100 Private Street',
            city: 'Delhi',
            state: 'Delhi',
            zipCode: '110001',
        },
        paymentMethod: 'card',
        paymentStatus: 'paid',
        status: 'completed',
        completedAt: new Date(),
        orderIds: [fakeOrderId],
        summary: { grandTotal: 1500 },
    });

    // Update the fake order with the session reference
    await Order.updateOne({ _id: fakeOrderId }, { $set: { checkoutSessionId: userASession._id } });

    const guestSession = await CheckoutSession.create({
        sessionId: `CS_GUEST_${ts}`,
        userId: null,
        guestInfo: { name: 'Guest User', email: `guest_${ts}@dwellmart.com`, phone: '9998887776' },
        items: [{ name: 'Guest Item', price: 500, quantity: 1 }],
        shippingAddress: {
            name: 'Guest User',
            email: `guest_${ts}@dwellmart.com`,
            phone: '9998887776',
            address: '200 Guest Avenue',
            city: 'Mumbai',
            state: 'Maharashtra',
            zipCode: '400001',
        },
        paymentMethod: 'card',
        paymentStatus: 'pending',
        status: 'pending',
        summary: { grandTotal: 500 },
    });

    console.log('--- TEST 1: User A calling verify for own session ---');
    const req1 = {
        user: { id: String(userA._id), _id: userA._id },
        body: { sessionId: userASession.sessionId },
    };
    const res1 = createMockRes();
    await verifyPayment(req1, res1);
    assert(res1.statusCode === 200 && res1.body?.data?.verified === true, 'User A can verify own payment session (200 OK)');
    assert(res1.body?.data?.checkoutSession?.shippingAddress?.address === '100 Private Street', 'Owner receives full session details including address');

    console.log('\n--- TEST 2: User B calling verify for User A session (Cross-User IDOR Attack) ---');
    const req2 = {
        user: { id: String(userB._id), _id: userB._id },
        body: { sessionId: userASession.sessionId },
    };
    const res2 = createMockRes();
    let err2 = null;
    try {
        await verifyPayment(req2, res2);
    } catch (err) {
        err2 = err;
    }
    assert(err2 && err2.statusCode === 403, 'User B calling verify for User A session is REJECTED with HTTP 403 FORBIDDEN');

    console.log('\n--- TEST 3: Anonymous caller verifying registered User A session ---');
    const req3 = { body: { sessionId: userASession.sessionId } };
    const res3 = createMockRes();
    let err3 = null;
    try {
        await verifyPayment(req3, res3);
    } catch (err) {
        err3 = err;
    }
    assert(err3 && err3.statusCode === 401, 'Anonymous request to registered user session is REJECTED with HTTP 401 UNAUTHORIZED');

    console.log('\n--- TEST 4: Anonymous caller verifying Guest session ---');
    const req4 = { body: { sessionId: guestSession.sessionId } };
    const res4 = createMockRes();
    await verifyPayment(req4, res4);
    assert(res4.statusCode === 200 && res4.body?.data?.verified === true, 'Guest session verification is ALLOWED (200 OK)');
    assert(!res4.body?.data?.checkoutSession?.shippingAddress, 'Guest response is SANITIZED (shipping address PII stripped)');

    console.log('\n--- TEST 5: User B calling createPaymentSession for User A session ---');
    const req5 = {
        user: { id: String(userB._id), _id: userB._id },
        body: { sessionId: userASession.sessionId },
    };
    const res5 = createMockRes();
    let err5 = null;
    try {
        await createPaymentSession(req5, res5);
    } catch (err) {
        err5 = err;
    }
    assert(err5 && err5.statusCode === 403, 'User B calling createPaymentSession for User A session is REJECTED with HTTP 403 FORBIDDEN');

    console.log('\n--- TEST 6: User B retrieving User A order detail ---');
    const userAOrders = await Order.find({ checkoutSessionId: userASession._id });
    assert(userAOrders.length > 0, 'User A order exists in DB');
    const targetOrderId = userAOrders[0].orderId;

    const req6 = {
        user: { id: String(userB._id) },
        params: { id: targetOrderId },
    };
    const res6 = createMockRes();
    let err6 = null;
    try {
        await getOrderDetail(req6, res6);
    } catch (err) {
        err6 = err;
    }
    assert(err6 && err6.statusCode === 404, 'User B attempting to fetch User A order detail is REJECTED with HTTP 404 / 403');

    console.log('\n--- TEST 7: User A retrieving own order detail ---');
    const req7 = {
        user: { id: String(userA._id) },
        params: { id: targetOrderId },
    };
    const res7 = createMockRes();
    await getOrderDetail(req7, res7);
    assert(res7.statusCode === 200 && res7.body?.data?.orderId === targetOrderId, 'User A can fetch own order detail (200 OK)');

    console.log('\n--- TEST 8: Fake / Invalid session ID ---');
    const req8 = {
        user: { id: String(userA._id), _id: userA._id },
        body: { sessionId: 'CS_INVALID_NON_EXISTENT' },
    };
    const res8 = createMockRes();
    let err8 = null;
    try {
        await verifyPayment(req8, res8);
    } catch (err) {
        err8 = err;
    }
    assert(err8 && err8.statusCode === 404, 'Non-existent session ID returns HTTP 404 NOT FOUND');

    console.log('\n--- CLEANUP ---');
    await CheckoutSession.deleteMany({ _id: { $in: [userASession._id, guestSession._id] } });
    await Order.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await User.deleteMany({ _id: { $in: [userA._id, userB._id] } });
    await mongoose.disconnect();

    console.log('\n======================================================================');
    console.log('🎉 ALL P0-06 AUTHORIZATION & OWNERSHIP TESTS PASSED PERFECTLY!');
    console.log('======================================================================\n');
}

runP006SecuritySuite().catch((err) => {
    console.error('P0-06 suite failed:', err);
    process.exit(1);
});
