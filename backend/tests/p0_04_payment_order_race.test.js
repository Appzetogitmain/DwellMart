import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

process.env.NODE_ENV = 'test';
global.__TEST_MODE__ = true;

import Product from '../src/models/Product.model.js';
import Vendor from '../src/models/Vendor.model.js';
import Coupon from '../src/models/Coupon.model.js';
import CheckoutSession from '../src/models/CheckoutSession.model.js';
import Order from '../src/models/Order.model.js';
import { FulfillmentGroup } from '../src/models/FulfillmentGroup.model.js';
import { InventoryReservation } from '../src/models/InventoryReservation.model.js';
import { generateSessionId, splitAndCreateOrders } from '../src/services/checkout/OrderSplitterEngine.js';
import { verifyPayment, handleWebhook } from '../src/modules/payment/controllers/cashfree.controller.js';
import { claimCheckoutSessionForProcessing, releaseClaimOnError } from '../src/services/checkout/CheckoutSessionClaimService.js';
import { runRecoveryWorker } from '../src/services/checkout/OrderRecoveryWorker.js';

import * as cashfreeService from '../src/services/billing/cashfree.service.js';

// Mock Cashfree SDK calls to return valid success responses
let mockPaidAmount = 1500;

cashfreeService.setMockCashfreeHandler({
    fetchOrder: async (lookupId) => ({
        order_id: lookupId,
        order_status: 'PAID',
        order_amount: mockPaidAmount,
        order_currency: 'INR',
    }),
    fetchPayments: async (lookupId) => ([
        {
            payment_status: 'SUCCESS',
            cf_payment_id: `CF_PAY_${Date.now()}`,
            payment_amount: mockPaidAmount,
        },
    ]),
    verifySignature: () => true,
});

function createMockRes() {
    return {
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
}

let totalAssertionsPassed = 0;
function assert(condition, message) {
    if (!condition) {
        throw new Error(`ASSERTION FAILED: ${message}`);
    }
    totalAssertionsPassed++;
    console.log(`  ✅ [PASS] ${totalAssertionsPassed}. ${message}`);
}

async function runP004TestSuite() {
    console.log('\n======================================================================');
    console.log('🛡️ P0-04 RACE CONDITION & CONCURRENCY PROTECTION TEST SUITE (20x RUN)');
    console.log('======================================================================\n');

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dwellmart';
    await mongoose.connect(mongoUri);

    const vendorA = new mongoose.Types.ObjectId();
    const vendorB = new mongoose.Types.ObjectId();
    const vendorC = new mongoose.Types.ObjectId();
    const prodA = new mongoose.Types.ObjectId();
    const prodB = new mongoose.Types.ObjectId();
    const prodC = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    try {
        // Setup Vendors A, B, C
        await Vendor.create({ _id: vendorA, name: 'Vendor A', storeName: 'Store A', email: `vA_${Date.now()}@test.com`, phone: '9876543210', password: 'Password123!', status: 'approved', accountStatus: 'active', shippingEnabled: false });
        await Vendor.create({ _id: vendorB, name: 'Vendor B', storeName: 'Store B', email: `vB_${Date.now()}@test.com`, phone: '9876543211', password: 'Password123!', status: 'approved', accountStatus: 'active', shippingEnabled: false });
        await Vendor.create({ _id: vendorC, name: 'Vendor C', storeName: 'Store C', email: `vC_${Date.now()}@test.com`, phone: '9876543212', password: 'Password123!', status: 'approved', accountStatus: 'active', shippingEnabled: false });

        // Setup Products A (₹1500), B (₹2500), C (₹3500)
        await Product.create({ _id: prodA, name: 'Prod A', slug: `pA-${Date.now()}`, categoryId: new mongoose.Types.ObjectId(), vendorId: vendorA, price: 1500, taxIncluded: true, stockQuantity: 500, stock: 'in_stock', isActive: true, isVisible: true, retailEnabled: true });
        await Product.create({ _id: prodB, name: 'Prod B', slug: `pB-${Date.now()}`, categoryId: new mongoose.Types.ObjectId(), vendorId: vendorB, price: 2500, taxIncluded: true, stockQuantity: 500, stock: 'in_stock', isActive: true, isVisible: true, retailEnabled: true });
        await Product.create({ _id: prodC, name: 'Prod C', slug: `pC-${Date.now()}`, categoryId: new mongoose.Types.ObjectId(), vendorId: vendorC, price: 3500, taxIncluded: true, stockQuantity: 500, stock: 'in_stock', isActive: true, isVisible: true, retailEnabled: true });

        const helperCreateSession = async (items, total = 1500) => {
            const sessionId = generateSessionId();
            mockPaidAmount = total;
            const session = await CheckoutSession.create({
                sessionId,
                userId,
                gatewayOrderId: sessionId,
                paymentMethod: 'card',
                paymentStatus: 'pending',
                status: 'pending',
                shippingAddress: { name: 'Customer', phone: '9876543210' },
                summary: { grandTotal: total, subtotal: total },
                items,
                metadata: { items },
            });

            for (const item of items) {
                await InventoryReservation.create({
                    sessionId,
                    productId: item.productId,
                    quantity: item.quantity || 1,
                    fulfillmentType: 'retail',
                    status: 'reserved',
                    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                });
            }
            return session;
        };

        const executeVerify = async (sessionId) => {
            const sessDoc = await CheckoutSession.findOne({ sessionId }).select('userId').lean();
            const req = { body: { sessionId }, user: sessDoc?.userId ? { _id: sessDoc.userId, id: String(sessDoc.userId) } : undefined };
            const res = createMockRes();
            await verifyPayment(req, res);

            // Poll up to 3 seconds for background order creation to finish
            for (let i = 0; i < 30; i++) {
                const s = await CheckoutSession.findOne({ sessionId }).lean();
                if (s && s.status !== 'processing') break;
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            return res;
        };

        const executeWebhook = async (sessionId, amount = 1500) => {
            const req = {
                headers: { 'x-webhook-timestamp': String(Date.now()), 'x-webhook-signature': 'sig' },
                body: {
                    type: 'PAYMENT_SUCCESS_WEBHOOK',
                    data: {
                        order: { order_id: sessionId, order_amount: amount, order_status: 'PAID' },
                        payment: { cf_payment_id: `CF_${Date.now()}`, payment_status: 'SUCCESS', payment_amount: amount },
                    },
                },
            };
            const res = createMockRes();
            await handleWebhook(req, res);

            // Poll up to 3 seconds for background setImmediate worker to finish
            for (let i = 0; i < 30; i++) {
                const s = await CheckoutSession.findOne({ sessionId }).lean();
                if (s && s.status !== 'processing') break;
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            return res;
        };

        // ─────────────────────────────────────────────────────────────────
        // SCENARIO 1: Verify Alone
        // ─────────────────────────────────────────────────────────────────
        console.log('\n--- Scenario 1: Verify Alone ---');
        const s1 = await helperCreateSession([{ productId: prodA.toString(), quantity: 1, vendorId: vendorA.toString() }]);
        await executeVerify(s1.sessionId);
        const s1Orders = await Order.find({ checkoutSessionId: s1._id });
        const s1Session = await CheckoutSession.findById(s1._id);
        assert(s1Orders.length === 1 && s1Session.status === 'completed', 'Scenario 1: Verify alone creates exactly 1 order and completes session');

        // ─────────────────────────────────────────────────────────────────
        // SCENARIO 2: Webhook Alone
        // ─────────────────────────────────────────────────────────────────
        console.log('\n--- Scenario 2: Webhook Alone ---');
        const s2 = await helperCreateSession([{ productId: prodA.toString(), quantity: 1, vendorId: vendorA.toString() }]);
        await executeWebhook(s2.sessionId);
        const s2Orders = await Order.find({ checkoutSessionId: s2._id });
        const s2Session = await CheckoutSession.findById(s2._id);
        assert(s2Orders.length === 1 && s2Session.status === 'completed', 'Scenario 2: Webhook alone creates exactly 1 order and completes session');

        // ─────────────────────────────────────────────────────────────────
        // SCENARIOS 3-9: Concurrency (20 Iterations each)
        // ─────────────────────────────────────────────────────────────────
        console.log('\n--- Scenarios 3-9: Concurrency (20 Iterations Each) ---');

        const concurrencyScenarios = [
            { name: 'Scenario 3: Verify Twice', runner: (s) => Promise.allSettled([executeVerify(s), executeVerify(s)]) },
            { name: 'Scenario 4: Webhook Twice', runner: (s) => Promise.allSettled([executeWebhook(s), executeWebhook(s)]) },
            { name: 'Scenario 5: Verify then Webhook (Sequential)', runner: async (s) => { await executeVerify(s); return Promise.allSettled([executeWebhook(s)]); } },
            { name: 'Scenario 6: Webhook then Verify (Sequential)', runner: async (s) => { await executeWebhook(s); return Promise.allSettled([executeVerify(s)]); } },
            { name: 'Scenario 7: Verify + Webhook Concurrently', runner: (s) => Promise.allSettled([executeVerify(s), executeWebhook(s)]) },
            { name: 'Scenario 8: Verify + Verify Concurrently', runner: (s) => Promise.allSettled([executeVerify(s), executeVerify(s)]) },
            { name: 'Scenario 9: Webhook + Webhook Concurrently', runner: (s) => Promise.allSettled([executeWebhook(s), executeWebhook(s)]) },
        ];

        for (const scenario of concurrencyScenarios) {
            let dupOrders = 0;
            let dupFgs = 0;
            for (let iter = 1; iter <= 20; iter++) {
                const sess = await helperCreateSession([{ productId: prodA.toString(), quantity: 1, vendorId: vendorA.toString() }]);
                await scenario.runner(sess.sessionId);
                const orders = await Order.find({ checkoutSessionId: sess._id });
                const fgs = await FulfillmentGroup.find({ sessionId: sess._id });
                const updatedSess = await CheckoutSession.findById(sess._id);

                if (orders.length !== 1 || fgs.length !== 1 || updatedSess.status !== 'completed') {
                    console.log(`[MISMATCH in ${scenario.name} iter ${iter}]: orders=${orders.length}, fgs=${fgs.length}, status=${updatedSess?.status}`);
                    dupOrders++;
                }
            }
            assert(dupOrders === 0 && dupFgs === 0, `${scenario.name} (20x): 0 duplicate orders/FGs, all sessions ended completed`);
        }

        // ─────────────────────────────────────────────────────────────────
        // SCENARIO 10: Order Creation Failure after Session Claim
        // ─────────────────────────────────────────────────────────────────
        console.log('\n--- Scenario 10: Order Creation Failure & Release ---');
        const s10 = await helperCreateSession([{ productId: prodA.toString(), quantity: 1, vendorId: vendorA.toString() }]);
        const claim10 = await claimCheckoutSessionForProcessing(s10.sessionId);
        assert(claim10.claimed === true, 'Scenario 10: Session claimed successfully');
        await releaseClaimOnError(s10.sessionId, 'Simulated Order Creation Failure');
        const s10After = await CheckoutSession.findById(s10._id);
        assert(s10After.status === 'pending' && s10After.failureReason.includes('Simulated'), 'Scenario 10: Failed claim safely released back to pending status for retry');

        // ─────────────────────────────────────────────────────────────────
        // SCENARIO 11: Crash / Partial Execution Recovery Test
        // ─────────────────────────────────────────────────────────────────
        console.log('\n--- Scenario 11: Crash / Partial Execution Test ---');
        const s11 = await helperCreateSession([{ productId: prodA.toString(), quantity: 1, vendorId: vendorA.toString() }]);
        // Step A: Claim session
        await claimCheckoutSessionForProcessing(s11.sessionId);
        // Step B: Orders created (simulate process crash before session.status = completed)
        const { orders: crashOrders } = await splitAndCreateOrders({
            sessionId: s11.sessionId,
            items: [{ productId: prodA.toString(), quantity: 1, vendorId: vendorA.toString() }],
            shippingAddress: { name: 'Customer', phone: '9876543210' },
            paymentMethod: 'card',
            userId: userId.toString(),
        });
        assert(crashOrders.length === 1, 'Scenario 11: Simulated crash created 1 order set while session was processing');

        // Step C: Run recovery handler / second verify call after crash
        await executeVerify(s11.sessionId);
        const s11FinalOrders = await Order.find({ checkoutSessionId: s11._id });
        const s11FinalSession = await CheckoutSession.findById(s11._id);
        assert(s11FinalOrders.length === 1 && s11FinalSession.status === 'completed', 'Scenario 11: Post-crash recovery completed session with ZERO duplicate orders created');

        // ─────────────────────────────────────────────────────────────────
        // SCENARIO 12: Multi-Vendor Checkout Concurrency Test
        // ─────────────────────────────────────────────────────────────────
        console.log('\n--- Scenario 12: Multi-Vendor Checkout Concurrency Test ---');
        let multiVendorDups = 0;
        for (let iter = 1; iter <= 20; iter++) {
            const multiItems = [
                { productId: prodA.toString(), quantity: 1, vendorId: vendorA.toString() },
                { productId: prodB.toString(), quantity: 1, vendorId: vendorB.toString() },
                { productId: prodC.toString(), quantity: 1, vendorId: vendorC.toString() },
            ];
            const s12 = await helperCreateSession(multiItems, 7500);

            // Race verify and webhook on multi-vendor session
            await Promise.allSettled([
                executeVerify(s12.sessionId),
                executeWebhook(s12.sessionId, 7500),
            ]);

            const orders12 = await Order.find({ checkoutSessionId: s12._id });
            const fgs12 = await FulfillmentGroup.find({ sessionId: s12._id });
            const session12 = await CheckoutSession.findById(s12._id);

            // Expect EXACTLY 3 Orders (one per vendor) and EXACTLY 3 FGs
            if (orders12.length !== 3 || fgs12.length !== 3 || session12.status !== 'completed') {
                multiVendorDups++;
            }
        }
        assert(multiVendorDups === 0, 'Scenario 12: Multi-vendor checkout (20x) creates exactly 3 Orders and 3 FGs for 3 vendors with ZERO duplicates');

        // ─────────────────────────────────────────────────────────────────
        // FINAL DATABASE AUDIT
        // ─────────────────────────────────────────────────────────────────
        console.log('\n======================================================================');
        console.log('🔍 SYSTEM-WIDE DATABASE AUDIT AFTER TEST RUN');
        console.log('======================================================================');

        const allStuckProcessing = await CheckoutSession.countDocuments({ status: 'processing', userId });
        // Scope duplicate detection to orders created by THIS test run only
        // (unfiltered aggregation picks up residual data from previous crashed test runs)
        const allDuplicateSessions = await Order.aggregate([
            { $match: { userId } },
            { $group: { _id: { checkoutSessionId: '$checkoutSessionId', vendorId: '$vendorId' }, count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } }
        ]);
        const allDuplicateFgs = await FulfillmentGroup.aggregate([
            { $match: { vendorId: { $in: [vendorA, vendorB, vendorC] } } },
            { $group: { _id: { sessionId: '$sessionId', vendorId: '$vendorId', fulfillmentType: '$fulfillmentType' }, count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } }
        ]);

        assert(allStuckProcessing === 0, 'DB AUDIT: Zero CheckoutSessions remain stuck in processing status');
        assert(allDuplicateSessions.length === 0, 'DB AUDIT: Zero duplicate orders exist per vendor per CheckoutSession');
        assert(allDuplicateFgs.length === 0, 'DB AUDIT: Zero duplicate FulfillmentGroups exist in DB');

        console.log('\n======================================================================');
        console.log(`🎉 ALL ${totalAssertionsPassed} SECURITY & CONCURRENCY ASSERTIONS PASSED PERFECTLY!`);
        console.log('======================================================================\n');

    } finally {
        await Vendor.findByIdAndDelete(vendorA);
        await Vendor.findByIdAndDelete(vendorB);
        await Vendor.findByIdAndDelete(vendorC);
        await Product.findByIdAndDelete(prodA);
        await Product.findByIdAndDelete(prodB);
        await Product.findByIdAndDelete(prodC);
        await CheckoutSession.deleteMany({ userId });
        await Order.deleteMany({ userId });
        await FulfillmentGroup.deleteMany({ vendorId: { $in: [vendorA, vendorB, vendorC] } });
        await InventoryReservation.deleteMany({ productId: { $in: [prodA, prodB, prodC] } });
        await mongoose.disconnect();
    }
}

runP004TestSuite().catch((err) => {
    console.error('\n❌ P0-04 SUITE FAILED:', err);
    process.exit(1);
});
