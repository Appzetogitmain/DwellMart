import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import mongoose from 'mongoose';
import User from './models/User.model.js';
import Product from './models/Product.model.js';
import Vendor from './models/Vendor.model.js';
import Order from './models/Order.model.js';
import CheckoutSession from './models/CheckoutSession.model.js';
import Settings from './models/Settings.model.js';
import { calculateCheckoutSessionSummary } from './services/checkout/OrderSplitterEngine.js';
import { getQuickCommerceSettings, resolveEffectiveQCSettings, calculateDeliveryFee } from './services/quickCommerce.service.js';

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName, message = '') {
    if (condition) {
        console.log(`✓ [PASS] ${testName} ${message ? `(${message})` : ''}`);
        passedCount++;
    } else {
        console.error(`✗ [FAIL] ${testName} ${message ? `(${message})` : ''}`);
        failedCount++;
    }
}

async function runBrowserQcPricingTests() {
    console.log('===============================================================');
    console.log('  DwellMart — Quick Commerce 4-Scenario & Payment Flow Audit  ');
    console.log('===============================================================\n');

    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

    // Fetch Admin Settings
    const adminSettings = await getQuickCommerceSettings();
    console.log('Admin Quick Commerce Settings Loaded:');
    console.log(`  Base Fee: ₹${adminSettings.baseDeliveryFee}`);
    console.log(`  Per-KM Fee: ₹${adminSettings.perKmDeliveryFee}/km`);
    console.log(`  Packaging Fee: ₹${adminSettings.packagingFee}`);
    console.log(`  Max Service Radius: ${adminSettings.maxServiceRadiusKm} km`);
    console.log(`  Free Delivery Above: ₹${adminSettings.freeDeliveryAboveSubtotal}\n`);

    const qcVendor = await Vendor.findOne({
        status: 'approved',
        'sellingChannels.quickCommerce.enabled': true,
    }).lean();

    const milkProduct = await Product.findOne({
        quickCommerceEnabled: true,
        isActive: true,
        vendorId: qcVendor._id,
    }).lean();

    const shippingAddress = {
        name: 'Test Customer',
        phone: '9876543210',
        address: '123 Main Street',
        city: 'Indore',
        state: 'Madhya Pradesh',
        zipCode: '452001',
        country: 'India',
    };

    const cartItems = [{
        productId: String(milkProduct._id),
        quantity: 1,
        price: 45,
        fulfillmentType: 'quick_commerce',
    }];

    // ── SCENARIO 1: Customer at Store Location (0 km) ────────────────────────
    const storeLocation = { latitude: 22.7196, longitude: 75.8577 };
    const summary0Km = await calculateCheckoutSessionSummary({
        items: cartItems,
        shippingAddress,
        customerLocation: storeLocation,
    });

    const expected0KmFee = 30.00;
    assert(
        summary0Km.deliveryFee === expected0KmFee && summary0Km.packagingFee === 0,
        'SCENARIO 1: 0 KM Customer (Store Location)',
        `Delivery Fee = ₹${summary0Km.deliveryFee.toFixed(2)}, Packaging = ₹${summary0Km.packagingFee.toFixed(2)}, Total = ₹${summary0Km.grandTotal.toFixed(2)}`
    );

    // ── SCENARIO 2: Customer ~2.4 KM Away ─────────────────────────────────────
    // Coordinates ~2.4 km away from Indore center (22.7196, 75.8577)
    // 22.7196 + 0.017 ~ 1.9km straight = 2.4km road
    const loc2_4Km = { latitude: 22.7366, longitude: 75.8577 };
    const summary2_4Km = await calculateCheckoutSessionSummary({
        items: cartItems,
        shippingAddress,
        customerLocation: loc2_4Km,
    });

    assert(
        summary2_4Km.deliveryFee > 30 && summary2_4Km.deliveryFee <= 52 && summary2_4Km.packagingFee === 0,
        'SCENARIO 2: 2.4 KM Road Distance Delivery',
        `Delivery Fee = ₹${summary2_4Km.deliveryFee.toFixed(2)}, Packaging = ₹${summary2_4Km.packagingFee.toFixed(2)}, Total = ₹${summary2_4Km.grandTotal.toFixed(2)}`
    );

    // ── SCENARIO 3: Customer > 3 KM Away (Out of Service Radius) ─────────────
    // 10 km away from Indore store
    const loc10Km = { latitude: 22.8196, longitude: 75.8577 };
    const { validateCart } = await import('./services/checkout/CartValidationPipeline.js');
    const pipelineResult = await validateCart({
        items: cartItems,
        customerLocation: loc10Km,
    });

    const isRejectedOrOut = pipelineResult.valid === false || pipelineResult.items.some(i => !i.valid);
    assert(
        isRejectedOrOut,
        'SCENARIO 3: Customer > 3 KM Away (Out of Service Radius)',
        'Rejected Quick Commerce fulfillment for out-of-bounds location'
    );

    // ── SCENARIO 4: Cart Subtotal >= ₹590 (Free Delivery Threshold) ───────────
    const bulkItems = [{
        productId: String(milkProduct._id),
        quantity: 10, // 10 * 65 = 650 >= 590
        fulfillmentType: 'quick_commerce',
    }];
    const summaryFree = await calculateCheckoutSessionSummary({
        items: bulkItems,
        shippingAddress,
        customerLocation: storeLocation,
    });

    assert(
        summaryFree.deliveryFee === 0,
        'SCENARIO 4: Cart Subtotal >= ₹590 (Free Delivery Threshold)',
        `Subtotal = ₹${summaryFree.subtotal.toFixed(2)}, Delivery Fee = ₹${summaryFree.deliveryFee.toFixed(2)}`
    );

    // ── PAYMENT FLOW 1: Cancel / Back from Cashfree ───────────────────────────
    const cancelSessionId = `browser_cancel_session_${Date.now()}`;
    const cancelSession = await CheckoutSession.create({
        sessionId: cancelSessionId,
        paymentMethod: 'upi',
        paymentStatus: 'pending',
        status: 'pending',
        shippingAddress,
        summary: summary0Km,
        metadata: { items: cartItems, customerLocation: storeLocation },
    });

    const { verifyPayment } = await import('./modules/payment/controllers/cashfree.controller.js');
    let cancelVerifyResult = null;
    const mockResCancel = {
        status: () => mockResCancel,
        json: (data) => { cancelVerifyResult = data; return data; },
    };

    await verifyPayment({ body: { checkoutSessionId: cancelSessionId } }, mockResCancel, (err) => { if (err) throw err; });

    const ordersForCancelled = await Order.countDocuments({ checkoutSessionId: cancelSession._id });
    assert(
        cancelVerifyResult?.data?.isPaid === false && ordersForCancelled === 0,
        'PAYMENT FLOW 1: Cancel / Back from Cashfree',
        `isPaid = false, Orders Created = ${ordersForCancelled} (Cart Retained, No Order Created)`
    );

    // ── PAYMENT FLOW 2: Successful Cashfree Payment ──────────────────────────
    const paidSessionId = `browser_paid_session_${Date.now()}`;
    const paidSession = await CheckoutSession.create({
        sessionId: paidSessionId,
        paymentMethod: 'upi',
        paymentStatus: 'paid',
        status: 'pending',
        shippingAddress,
        summary: summary0Km,
        metadata: { items: cartItems, customerLocation: storeLocation },
    });

    const { splitAndCreateOrders } = await import('./services/checkout/OrderSplitterEngine.js');
    const { orders: createdPaidOrders } = await splitAndCreateOrders({
        sessionId: paidSessionId,
        items: cartItems,
        shippingAddress,
        paymentMethod: 'upi',
        customerLocation: storeLocation,
    });

    const ordersForPaid = await Order.countDocuments({ checkoutSessionId: paidSession._id });
    assert(
        createdPaidOrders.length > 0 && ordersForPaid === 1 && (createdPaidOrders[0].status === 'confirmed' || createdPaidOrders[0].status === 'placed'),
        'PAYMENT FLOW 2: Successful Cashfree Payment',
        `Orders Created = ${ordersForPaid}, Order Status = ${createdPaidOrders[0]?.status}, Payment Status = ${createdPaidOrders[0]?.paymentStatus}`
    );

    // Cleanup
    await Order.deleteMany({ checkoutSessionId: { $in: [cancelSession._id, paidSession._id] } });
    await CheckoutSession.deleteMany({ _id: { $in: [cancelSession._id, paidSession._id] } });

    console.log('\n===============================================================');
    console.log(`  RESULTS: ${passedCount} PASSED  |  ${failedCount} FAILED`);
    console.log('===============================================================\n');

    await mongoose.disconnect();
    process.exit(failedCount === 0 ? 0 : 1);
}

runBrowserQcPricingTests().catch(err => {
    console.error('Critical error in pricing tests:', err);
    process.exit(1);
});
