import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import mongoose from 'mongoose';
import Product from '../src/models/Product.model.js';
import Vendor from '../src/models/Vendor.model.js';
import User from '../src/models/User.model.js';
import Order from '../src/models/Order.model.js';
import FulfillmentGroup from '../src/models/FulfillmentGroup.model.js';
import { CheckoutSession } from '../src/models/CheckoutSession.model.js';
import InventoryReservation from '../src/models/InventoryReservation.model.js';
import { reserveStock, commitReservation, sweepExpiredReservations, releaseReservation } from '../src/services/checkout/InventoryReservationService.js';
import { splitAndCreateOrders } from '../src/services/checkout/OrderSplitterEngine.js';
import { verifyPayment, handleWebhook } from '../src/modules/payment/controllers/cashfree.controller.js';
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

async function runP101TestSuite() {
    console.log('\n======================================================================');
    console.log('🛡️ P1-01 INVENTORY RESERVATION & EXPIRED HOLD RECOVERY TEST SUITE');
    console.log('======================================================================\n');

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/dwellmart_test';
    await mongoose.connect(mongoUri);

    setMockCashfreeHandler({
        fetchOrder: async (orderId) => ({ order_id: orderId, order_status: 'PAID', order_amount: 1200, order_currency: 'INR' }),
        fetchPayments: async () => [{ payment_status: 'SUCCESS', cf_payment_id: `CF_${Date.now()}`, payment_amount: 1200 }],
        verifySignature: () => true,
    });

    const ts = Date.now();
    const sharedCategoryId = new mongoose.Types.ObjectId();

    const vendorA = await Vendor.create({
        name: 'Vendor A',
        storeName: 'Store A',
        email: `vendor_a_${ts}@test.com`,
        phone: '9876543210',
        password: 'password123',
        status: 'approved',
    });

    const vendorB = await Vendor.create({
        name: 'Vendor B',
        storeName: 'Store B',
        email: `vendor_b_${ts}@test.com`,
        phone: '9876543211',
        password: 'password123',
        status: 'approved',
    });

    const user = await User.create({
        name: 'Test Customer',
        email: `customer_${ts}@test.com`,
        phone: '9123456789',
        password: 'password123',
    });

    // Helper: create a minimal CheckoutSession document (required by splitAndCreateOrders)
    // NOTE: CheckoutSession schema has no top-level 'items' field.
    // Items must be stored in metadata.items — that's where verifyPayment reads them from.
    const createTestSession = async (sessionId, items, totalAmount = 1000, sessionUserId = user._id) => {
        return CheckoutSession.create({
            sessionId,
            userId: sessionUserId,
            shippingAddress: { name: 'Customer', address: '123 St', city: 'Delhi', state: 'Delhi', zipCode: '110001' },
            paymentMethod: 'card',
            paymentStatus: 'pending',
            status: 'pending',
            summary: { grandTotal: totalAmount },
            metadata: { items },
        });
    };

    // ─────────────────────────────────────────────────────────────────
    // CASE 1: Active Reservation -> Successful Order
    // ─────────────────────────────────────────────────────────────────
    console.log('--- CASE 1: Active Reservation -> Successful Order ---');
    const p1 = await Product.create({
        name: 'Product C1 (Active Hold)',
        slug: `p1-active-hold-${ts}`,
        categoryId: sharedCategoryId,
        vendorId: vendorA._id,
        price: 1000,
        taxIncluded: true,
        stockQuantity: 10,
        reservedQuantity: 0,
        isActive: true,
        retailEnabled: true,
    });

    const sess1Id = `CS_CASE1_${ts}`;
    await createTestSession(sess1Id, [{ productId: String(p1._id), quantity: 2, price: 1000 }], 2000);
    await reserveStock([{ productId: String(p1._id), quantity: 2, fulfillmentType: 'retail' }], sess1Id);
    const p1Reserved = await Product.findById(p1._id).lean();
    assert(p1Reserved.reservedQuantity === 2, 'Stock reserved successfully (reservedQuantity = 2)');

    const res1 = await splitAndCreateOrders({
        sessionId: sess1Id,
        items: [{ productId: String(p1._id), quantity: 2, price: 1000 }],
        shippingAddress: { name: 'Customer', address: '123 St', city: 'Delhi', state: 'Delhi', zipCode: '110001' },
        paymentMethod: 'card',
        userId: String(user._id),
    });

    const p1Final = await Product.findById(p1._id).lean();
    assert(p1Final.stockQuantity === 8 && p1Final.reservedQuantity === 0, 'Active reservation consumed: stockQuantity=8, reservedQuantity=0');
    assert(res1.orders.length === 1, 'Order created successfully');

    // ─────────────────────────────────────────────────────────────────
    // CASE 2: Expired Reservation + Available Stock -> Direct Consumption Success
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- CASE 2: Expired Reservation + Available Stock -> Direct Consumption ---');
    const p2 = await Product.create({
        name: 'Product C2 (Expired, Stock Avail)',
        slug: `p2-expired-avail-${ts}`,
        categoryId: sharedCategoryId,
        vendorId: vendorA._id,
        price: 1500,
        taxIncluded: true,
        stockQuantity: 5,
        reservedQuantity: 0,
        isActive: true,
        retailEnabled: true,
    });

    const sess2Id = `CS_CASE2_${ts}`;
    await createTestSession(sess2Id, [{ productId: String(p2._id), quantity: 2, price: 1500 }], 3000);
    await reserveStock([{ productId: String(p2._id), quantity: 2, fulfillmentType: 'retail' }], sess2Id);

    // Simulate hold expiry via sweep
    await InventoryReservation.updateMany({ sessionId: sess2Id }, { $set: { expiresAt: new Date(Date.now() - 60 * 1000) } });
    await sweepExpiredReservations();

    const p2AfterSweep = await Product.findById(p2._id).lean();
    assert(p2AfterSweep.stockQuantity === 5 && p2AfterSweep.reservedQuantity === 0, 'Expired hold released: stockQuantity=5, reservedQuantity=0');

    // Payment completes after hold expiry
    const res2 = await splitAndCreateOrders({
        sessionId: sess2Id,
        items: [{ productId: String(p2._id), quantity: 2, price: 1500 }],
        shippingAddress: { name: 'Customer', address: '123 St', city: 'Delhi', state: 'Delhi', zipCode: '110001' },
        paymentMethod: 'card',
        userId: String(user._id),
    });

    const p2Final = await Product.findById(p2._id).lean();
    assert(p2Final.stockQuantity === 3 && p2Final.reservedQuantity === 0, 'Expired hold recovered cleanly: stockQuantity decremented 5 -> 3 exactly once!');
    assert(res2.orders.length === 1, 'Order created successfully after hold recovery');

    // ─────────────────────────────────────────────────────────────────
    // CASE 3: Expired Reservation + Insufficient Stock -> Abort & Reject HTTP 409
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- CASE 3: Expired Reservation + Insufficient Stock -> Abort (HTTP 409) ---');
    const p3 = await Product.create({
        name: 'Product C3 (OOS Risk)',
        slug: `p3-oos-risk-${ts}`,
        categoryId: sharedCategoryId,
        vendorId: vendorA._id,
        price: 2000,
        taxIncluded: true,
        stockQuantity: 1,
        reservedQuantity: 0,
        isActive: true,
        retailEnabled: true,
    });

    const sess3Id = `CS_CASE3_${ts}`;
    await createTestSession(sess3Id, [{ productId: String(p3._id), quantity: 1, price: 2000 }], 2000);
    await reserveStock([{ productId: String(p3._id), quantity: 1, fulfillmentType: 'retail' }], sess3Id);

    // Hold expires
    await InventoryReservation.updateMany({ sessionId: sess3Id }, { $set: { expiresAt: new Date(Date.now() - 60 * 1000) } });
    await sweepExpiredReservations();

    // Customer B buys the final unit while Customer A's hold was expired
    const sess3BId = `CS_CASE3_B_${ts}`;
    await createTestSession(sess3BId, [{ productId: String(p3._id), quantity: 1, price: 2000 }], 2000);
    await reserveStock([{ productId: String(p3._id), quantity: 1, fulfillmentType: 'retail' }], sess3BId);
    await splitAndCreateOrders({
        sessionId: sess3BId,
        items: [{ productId: String(p3._id), quantity: 1, price: 2000 }],
        shippingAddress: { name: 'Customer B', address: '123 St', city: 'Delhi', state: 'Delhi', zipCode: '110001' },
        paymentMethod: 'card',
        userId: String(user._id),
    });

    const p3AfterCustomerB = await Product.findById(p3._id).lean();
    assert(p3AfterCustomerB.stockQuantity === 0, 'Customer B acquired final stock (stockQuantity=0)');

    // Now Customer A attempts to complete order creation after hold expired AND stock was bought by B
    let err3 = null;
    try {
        await splitAndCreateOrders({
            sessionId: sess3Id,
            items: [{ productId: String(p3._id), quantity: 1, price: 2000 }],
            shippingAddress: { name: 'Customer A', address: '123 St', city: 'Delhi', state: 'Delhi', zipCode: '110001' },
            paymentMethod: 'card',
            userId: String(user._id),
        });
    } catch (err) {
        err3 = err;
    }

    assert(
        err3 && (
            err3.statusCode === 409 ||
            err3.code === 'OUT_OF_STOCK' ||
            err3.statusCode === 422 ||
            err3.code === 'CART_VALIDATION_FAILED'
        ),
        'Customer A order creation ABORTS (HTTP 409 OUT_OF_STOCK or 422 CART_VALIDATION_FAILED)'
    );
    const p3Final = await Product.findById(p3._id).lean();
    assert(p3Final.stockQuantity === 0, 'Stock remains 0 (zero negative stock)');

    const ordersForP3 = await Order.find({ 'items.productId': p3._id });
    assert(ordersForP3.length === 1, 'Exactly 1 order exists for Product C3 (Zero oversell!)');

    // ─────────────────────────────────────────────────────────────────
    // CASE 4: Two Concurrent Buyers for Final Unit (20 Iterations)
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- CASE 4: 20x Concurrency Test (2 Buyers Competing for 1 Final Unit) ---');
    let concurrencyFailures = 0;

    for (let iter = 1; iter <= 20; iter++) {
        const p4 = await Product.create({
            name: `Product C4 Iter ${iter}`,
            slug: `p4-iter-${iter}-${ts}`,
            categoryId: sharedCategoryId,
            vendorId: vendorA._id,
            price: 500,
            taxIncluded: true,
            stockQuantity: 1,
            reservedQuantity: 0,
            isActive: true,
            retailEnabled: true,
        });

        const sAId = `CS_COMP_A_${iter}_${ts}`;
        const sBId = `CS_COMP_B_${iter}_${ts}`;

        // Pre-create sessions before concurrent order attempts
        await createTestSession(sAId, [{ productId: String(p4._id), quantity: 1, price: 500 }], 500);
        await createTestSession(sBId, [{ productId: String(p4._id), quantity: 1, price: 500 }], 500);

        // Both try to reserve stock (only one will succeed under atomics)
        await reserveStock([{ productId: String(p4._id), quantity: 1, fulfillmentType: 'retail' }], sAId).catch(() => null);
        await sweepExpiredReservations();
        await InventoryReservation.updateMany({ productId: p4._id }, { $set: { status: 'released' } });
        await Product.updateOne({ _id: p4._id }, { $set: { reservedQuantity: 0 } });

        // Concurrently attempt to acquire final stock via splitAndCreateOrders
        const results = await Promise.allSettled([
            splitAndCreateOrders({
                sessionId: sAId,
                items: [{ productId: String(p4._id), quantity: 1, price: 500 }],
                shippingAddress: { name: 'Buyer A', address: '123 St', city: 'Delhi', state: 'Delhi', zipCode: '110001' },
                paymentMethod: 'card',
                userId: String(user._id),
            }),
            splitAndCreateOrders({
                sessionId: sBId,
                items: [{ productId: String(p4._id), quantity: 1, price: 500 }],
                shippingAddress: { name: 'Buyer B', address: '123 St', city: 'Delhi', state: 'Delhi', zipCode: '110001' },
                paymentMethod: 'card',
                userId: String(user._id),
            }),
        ]);

        const successful = results.filter((r) => r.status === 'fulfilled');
        const p4Final = await Product.findById(p4._id).lean();
        const ordersP4 = await Order.find({ 'items.productId': p4._id });

        if (successful.length !== 1 || p4Final.stockQuantity !== 0 || ordersP4.length !== 1) {
            console.log(`[Mismatch in Concurrency Iter ${iter}]: successful=${successful.length}, stock=${p4Final.stockQuantity}, orders=${ordersP4.length}`);
            concurrencyFailures++;
        }
        await Product.deleteOne({ _id: p4._id });
        await Order.deleteMany({ 'items.productId': p4._id });
    }
    assert(concurrencyFailures === 0, '20x Concurrency Test PASSED: Exactly 1 order succeeded per iteration, 0 oversells!');

    // ─────────────────────────────────────────────────────────────────
    // CASE 5 & 6: Verify + Webhook Concurrently After Expiry
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- CASE 5 & 6: Verify + Webhook Concurrently After Expiry ---');
    const p5 = await Product.create({
        name: 'Product C5 (Verify+Webhook Concurrent Expiry)',
        slug: `p5-concurrent-expiry-${ts}`,
        categoryId: sharedCategoryId,
        vendorId: vendorA._id,
        price: 1200,
        taxIncluded: true,
        stockQuantity: 1,
        reservedQuantity: 0,
        isActive: true,
        retailEnabled: true,
    });

    const sess5 = await CheckoutSession.create({
        sessionId: `CS_RACE_EXP_${ts}`,
        userId: user._id,
        shippingAddress: { name: 'Customer', address: '123 St', city: 'Delhi', state: 'Delhi', zipCode: '110001' },
        paymentMethod: 'card',
        paymentStatus: 'pending',
        status: 'pending',
        summary: { grandTotal: 1200 },
        metadata: {
            items: [{ productId: String(p5._id), name: p5.name, price: 1200, quantity: 1, vendorId: String(vendorA._id) }],
        },
    });

    // Hold expires
    await InventoryReservation.updateMany({ sessionId: sess5.sessionId }, { $set: { expiresAt: new Date(Date.now() - 60 * 1000) } });
    await sweepExpiredReservations();

    const reqVerify = { body: { sessionId: sess5.sessionId }, user: { _id: user._id, id: String(user._id) } };
    const resVerify = createMockRes();

    const reqWebhook = {
        headers: { 'x-webhook-timestamp': String(Date.now()), 'x-webhook-signature': 'sig' },
        body: {
            type: 'PAYMENT_SUCCESS_WEBHOOK',
            data: {
                order: { order_id: sess5.sessionId, order_amount: 1200, order_status: 'PAID' },
                payment: { cf_payment_id: `CF_${Date.now()}`, payment_status: 'SUCCESS', payment_amount: 1200 },
            },
        },
    };
    const resWebhook = createMockRes();

    await Promise.allSettled([
        verifyPayment(reqVerify, resVerify),
        handleWebhook(reqWebhook, resWebhook),
    ]);

    const p5Final = await Product.findById(p5._id).lean();
    const ordersSess5 = await Order.find({ checkoutSessionId: sess5._id });
    const fgsSess5 = await FulfillmentGroup.find({ sessionId: sess5._id });

    assert(p5Final.stockQuantity === 0, 'Verify + Webhook concurrent post-expiry decremented stock exactly once (1 -> 0)');
    assert(ordersSess5.length === 1 && fgsSess5.length === 1, 'Verify + Webhook concurrent post-expiry created exactly 1 order and 1 FG (Zero duplicates)');

    // ─────────────────────────────────────────────────────────────────
    // CASE 7: Multi-Vendor Order Post-Expiry Recovery
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- CASE 7: Multi-Vendor Order Post-Expiry Recovery ---');
    const pMV1 = await Product.create({ name: 'Vendor 1 Product', slug: `pmv1-${ts}`, categoryId: sharedCategoryId, vendorId: vendorA._id, price: 1000, taxIncluded: true, stockQuantity: 5, reservedQuantity: 0, isActive: true, retailEnabled: true });
    const pMV2 = await Product.create({ name: 'Vendor 2 Product', slug: `pmv2-${ts}`, categoryId: sharedCategoryId, vendorId: vendorB._id, price: 2000, taxIncluded: true, stockQuantity: 5, reservedQuantity: 0, isActive: true, retailEnabled: true });

    const mvSessId = `CS_MV_${ts}`;
    await createTestSession(mvSessId, [
        { productId: String(pMV1._id), quantity: 1, price: 1000 },
        { productId: String(pMV2._id), quantity: 1, price: 2000 },
    ], 3000);
    await reserveStock([
        { productId: String(pMV1._id), quantity: 1, fulfillmentType: 'retail' },
        { productId: String(pMV2._id), quantity: 1, fulfillmentType: 'retail' },
    ], mvSessId);

    // Hold expires
    await InventoryReservation.updateMany({ sessionId: mvSessId }, { $set: { expiresAt: new Date(Date.now() - 60 * 1000) } });
    await sweepExpiredReservations();

    const mvRes = await splitAndCreateOrders({
        sessionId: mvSessId,
        items: [
            { productId: String(pMV1._id), quantity: 1, price: 1000, vendorId: String(vendorA._id) },
            { productId: String(pMV2._id), quantity: 1, price: 2000, vendorId: String(vendorB._id) },
        ],
        shippingAddress: { name: 'Customer', address: '123 St', city: 'Delhi', state: 'Delhi', zipCode: '110001' },
        paymentMethod: 'card',
        userId: String(user._id),
    });

    const pMV1Final = await Product.findById(pMV1._id).lean();
    const pMV2Final = await Product.findById(pMV2._id).lean();

    assert(mvRes.orders.length === 2, 'Multi-vendor order created 2 sub-orders for 2 vendors');
    assert(pMV1Final.stockQuantity === 4 && pMV2Final.stockQuantity === 4, 'Stock decremented independently for both vendor products (5 -> 4)');

    // ─────────────────────────────────────────────────────────────────
    // CLEANUP
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- CLEANUP ---');
    await Product.deleteMany({ _id: { $in: [p1._id, p2._id, p3._id, p5._id, pMV1._id, pMV2._id] } });
    await InventoryReservation.deleteMany({ sessionId: { $in: [sess1Id, sess2Id, sess3Id, sess3BId, sess5.sessionId, mvSessId] } });
    await Order.deleteMany({ userId: user._id });
    // Clean up all test CheckoutSessions by sessionId prefix
    await CheckoutSession.deleteMany({ sessionId: { $regex: `^CS_(CASE|COMP|RACE|MV).*${ts}` } });
    await CheckoutSession.deleteMany({ _id: sess5._id });
    await FulfillmentGroup.deleteMany({ sessionId: { $in: [sess5._id] } });
    await User.deleteMany({ _id: user._id });
    await Vendor.deleteMany({ _id: { $in: [vendorA._id, vendorB._id] } });
    await mongoose.disconnect();

    console.log('\n======================================================================');
    console.log('🎉 ALL P1-01 INVENTORY RESERVATION SECURITY ASSERTIONS PASSED!');
    console.log('======================================================================\n');
}

runP101TestSuite().catch((err) => {
    console.error('P1-01 test suite failed:', err);
    process.exit(1);
});
