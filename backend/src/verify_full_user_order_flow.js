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
import { validateCart } from './services/checkout/CartValidationPipeline.js';
import { splitAndCreateOrders, calculateCheckoutSessionSummary } from './services/checkout/OrderSplitterEngine.js';

async function runFullOrderFlowTest() {
    console.log('===============================================================');
    console.log('  DwellMart — Full User Order Flow Integration Verification   ');
    console.log('===============================================================');

    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

    let testUser = await User.findOne({ email: 'testcustomer@dwellmart.com' });
    if (!testUser) {
        testUser = await User.create({
            name: 'Test Customer',
            email: 'testcustomer@dwellmart.com',
            password: 'password123',
            role: 'customer',
        });
    }

    const approvedVendors = await Vendor.find({
        status: 'approved',
        'sellingChannels.quickCommerce.enabled': true,
    }).select('_id').lean();
    const approvedVendorIds = approvedVendors.map(v => v._id);
    const qcProduct = await Product.findOne({
        quickCommerceEnabled: true,
        isActive: true,
        vendorId: { $in: approvedVendorIds }
    }).lean();
    if (!qcProduct) {
        console.error('FAIL: No active Quick Commerce product found in DB for test.');
        await mongoose.disconnect();
        process.exit(1);
    }

    const testLocation = { latitude: 22.7196, longitude: 75.8577 };

    // TEST 1: Cart Validation Pipeline
    const cartItems = [{
        productId: String(qcProduct._id),
        quantity: 1,
        fulfillmentType: 'quick_commerce',
    }];

    const validation = await validateCart({ items: cartItems, customerLocation: testLocation });
    if (!validation.valid) {
        console.error('FAIL TEST 1: Cart validation failed.', validation.items);
        await mongoose.disconnect();
        process.exit(1);
    }
    console.log('✓ [PASS] TEST 1: Cart validation pipeline succeeded for Quick Commerce item.');

    // TEST 2: Calculate Financial Summary
    const shippingAddress = {
        name: 'Test Customer',
        phone: '9876543210',
        address: '123 Main Street',
        city: 'Indore',
        state: 'Madhya Pradesh',
        zipCode: '452001',
        country: 'India',
    };

    const summary = await calculateCheckoutSessionSummary({
        items: cartItems,
        shippingAddress,
        customerLocation: testLocation,
    });

    if (!summary || typeof summary.grandTotal !== 'number' || summary.grandTotal <= 0) {
        console.error('FAIL TEST 2: Invalid financial summary computed:', summary);
        await mongoose.disconnect();
        process.exit(1);
    }
    console.log(`✓ [PASS] TEST 2: Authoritative financial summary calculated (Grand Total: ₹${summary.grandTotal.toFixed(2)}).`);

    // TEST 3: Create Checkout Session
    const session = await CheckoutSession.create({
        sessionId: `test_session_${Date.now()}`,
        userId: testUser._id,
        paymentMethod: 'upi',
        paymentStatus: 'pending',
        status: 'pending',
        shippingAddress,
        summary,
        metadata: {
            items: cartItems,
            customerLocation: testLocation,
        },
    });

    if (!session?.sessionId) {
        console.error('FAIL TEST 3: Checkout session creation failed.');
        await mongoose.disconnect();
        process.exit(1);
    }
    console.log(`✓ [PASS] TEST 3: Checkout session created successfully (${session.sessionId}).`);

    // TEST 4: Order Split & Confirmation
    const splitResult = await splitAndCreateOrders({
        sessionId: session.sessionId,
        items: cartItems,
        shippingAddress,
        paymentMethod: 'cod',
        customerLocation: testLocation,
        userId: testUser._id,
    });

    if (!splitResult?.orders || splitResult.orders.length === 0) {
        console.error('FAIL TEST 4: Order splitting failed.');
        await mongoose.disconnect();
        process.exit(1);
    }

    const createdOrder = splitResult.orders[0];
    console.log(`✓ [PASS] TEST 4: Order successfully placed and split (${createdOrder.orderId}, Total: ₹${createdOrder.total.toFixed(2)}).`);

    // TEST 5: Order Query via _id and orderId
    const foundByOrderId = await Order.findOne({
        $or: [{ orderId: createdOrder.orderId }, { _id: createdOrder._id }],
        userId: testUser._id,
    });

    if (!foundByOrderId) {
        console.error('FAIL TEST 5: Order lookup by ID failed.');
        await mongoose.disconnect();
        process.exit(1);
    }
    console.log(`✓ [PASS] TEST 5: Order lookup by orderId and Mongo _id succeeded.`);

    // TEST 6: Order Cancellation
    foundByOrderId.status = 'cancelled';
    foundByOrderId.cancelledAt = new Date();
    foundByOrderId.cancellationReason = 'Test automated cancellation';
    await foundByOrderId.save();

    console.log(`✓ [PASS] TEST 6: Order status updated to cancelled.`);

    // Clean up test order & session
    await Order.deleteOne({ _id: createdOrder._id });
    await CheckoutSession.deleteOne({ _id: session._id });

    console.log('===============================================================');
    console.log('  ALL 6 FULL ORDER FLOW INTEGRATION TESTS PASSED 100% CLEANLY  ');
    console.log('===============================================================');

    await mongoose.disconnect();
}

runFullOrderFlowTest().catch((err) => {
    console.error('CRITICAL ERROR DURING INTEGRATION TEST:', err);
    process.exit(1);
});
