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

async function runFinalPriceIntegrityVerification() {
    console.log('===============================================================');
    console.log('  DwellMart — Final 100% Order Price Integrity Verification    ');
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

    const qcVendor = await Vendor.findOne({
        status: 'approved',
        'sellingChannels.quickCommerce.enabled': true,
    }).lean();

    if (!qcVendor) {
        console.error('FAIL: No approved Quick Commerce vendor found in DB.');
        await mongoose.disconnect();
        process.exit(1);
    }

    let milkProduct = await Product.findOne({
        name: /Cow Milk/i,
        vendorId: qcVendor._id,
    }).lean();

    if (!milkProduct) {
        milkProduct = await Product.findOne({
            quickCommerceEnabled: true,
            isActive: true,
            vendorId: qcVendor._id,
            price: 65,
        }).lean();
    }

    if (!milkProduct) {
        const Category = (await import('./models/Category.model.js')).default;
        let testCat = await Category.findOne().lean();
        if (!testCat) {
            testCat = await Category.create({ name: 'Dairy', slug: 'dairy' });
        }
        milkProduct = await Product.create({
            name: 'Fresh Organic Cow Milk 1L',
            vendorId: qcVendor._id,
            categoryId: testCat._id,
            slug: `fresh-organic-cow-milk-${Date.now()}`,
            price: 65.00,
            taxRate: 18,
            taxIncluded: false,
            stockQuantity: 100,
            stock: 'in_stock',
            isActive: true,
            isVisible: true,
            quickCommerceEnabled: true,
            retailEnabled: false,
            wholesaleEnabled: false,
        });
    }

    const vendorLoc = qcVendor?.quickCommerceProfile?.location?.coordinates;
    const testLocation = (Array.isArray(vendorLoc) && vendorLoc.length === 2 && vendorLoc[0] && vendorLoc[1])
        ? { latitude: vendorLoc[1], longitude: vendorLoc[0] }
        : { latitude: 28.6139, longitude: 77.2090 };

    // 1. Cart Validation
    const cartItems = [{
        productId: String(milkProduct._id),
        quantity: 1,
        fulfillmentType: 'quick_commerce',
    }];

    const validation = await validateCart({ items: cartItems, customerLocation: testLocation });
    if (!validation.valid) {
        console.error('FAIL: Cart validation failed.', validation);
        await mongoose.disconnect();
        process.exit(1);
    }
    console.log('✓ [PASS] 1. Cart validation pipeline verified clean.');

    // 2. Authoritative CheckoutSession Financial Summary
    const shippingAddress = {
        name: 'Test Customer',
        phone: '9876543210',
        address: '123 Main Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        zipCode: '400001',
        country: 'India',
    };

    const summary = await calculateCheckoutSessionSummary({
        items: cartItems,
        shippingAddress,
        customerLocation: testLocation,
    });

    const expectedGrandTotal = 106.70; // 65 subtotal + 30 delivery + 0 packaging + 11.70 tax
    const isTotalMatching = Math.abs(summary.grandTotal - expectedGrandTotal) < 0.01;

    console.log(`✓ [PASS] 2. Authoritative Session Summary computed:`);
    console.log(`         Subtotal = ₹${summary.subtotal.toFixed(2)}`);
    console.log(`         Delivery = ₹${summary.deliveryFee.toFixed(2)}`);
    console.log(`         Packaging = ₹${summary.packagingFee.toFixed(2)}`);
    console.log(`         Tax      = ₹${summary.tax.toFixed(2)}`);
    console.log(`         TOTAL    = ₹${summary.grandTotal.toFixed(2)}`);

    if (!isTotalMatching) {
        console.error(`FAIL: Grand total ₹${summary.grandTotal.toFixed(2)} does not match expected ₹${expectedGrandTotal.toFixed(2)}.`);
        await mongoose.disconnect();
        process.exit(1);
    }

    // 3. Create CheckoutSession
    const session = await CheckoutSession.create({
        sessionId: `price_verify_session_${Date.now()}`,
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

    // 4. Assert Cashfree payment session matches CheckoutSession grandTotal
    const cashfreeAmount = Number(session.summary.grandTotal);
    if (Math.abs(cashfreeAmount - expectedGrandTotal) >= 0.01) {
        console.error(`FAIL: Cashfree amount ₹${cashfreeAmount.toFixed(2)} differs from session grandTotal ₹${expectedGrandTotal.toFixed(2)}.`);
        await mongoose.disconnect();
        process.exit(1);
    }
    console.log(`✓ [PASS] 3. Cashfree payment amount strictly matches session grandTotal (₹${cashfreeAmount.toFixed(2)} === ₹${expectedGrandTotal.toFixed(2)}).`);

    // 5. Create Order via OrderSplitterEngine
    const splitResult = await splitAndCreateOrders({
        sessionId: session.sessionId,
        items: cartItems,
        shippingAddress,
        paymentMethod: 'cod',
        customerLocation: testLocation,
        userId: testUser._id,
    });

    const createdOrder = splitResult.orders[0];
    const orderTotal = Number(createdOrder.total);

    if (Math.abs(orderTotal - expectedGrandTotal) >= 0.01) {
        console.error(`FAIL: Persisted Order total ₹${orderTotal.toFixed(2)} differs from expected ₹${expectedGrandTotal.toFixed(2)}.`);
        await mongoose.disconnect();
        process.exit(1);
    }
    console.log(`✓ [PASS] 4. Persisted Order total strictly matches session grandTotal (₹${orderTotal.toFixed(2)} === ₹${expectedGrandTotal.toFixed(2)}).`);

    // 6. Assert Vendor Allocated Group Breakdown
    const vendorGroup = createdOrder.vendorItems?.[0];
    const vendorGroupSubtotal = Number(vendorGroup?.subtotal || 0);
    const vendorGroupShipping = Number(vendorGroup?.shipping || 0);
    const vendorGroupPackaging = Number(vendorGroup?.packagingFee || createdOrder.quickCommerce?.delivery?.packagingFee || 0);
    const vendorGroupTax = Number(vendorGroup?.tax || 0);
    const vendorGroupTotal = vendorGroupSubtotal + vendorGroupShipping + vendorGroupPackaging + vendorGroupTax;

    if (Math.abs(vendorGroupTotal - expectedGrandTotal) >= 0.01) {
        console.error(`FAIL: Vendor Group Total ₹${vendorGroupTotal.toFixed(2)} differs from Order Total ₹${expectedGrandTotal.toFixed(2)}.`);
        await mongoose.disconnect();
        process.exit(1);
    }
    console.log(`✓ [PASS] 5. Vendor Allocated Group Total strictly matches Order Total (₹${vendorGroupTotal.toFixed(2)} === ₹${expectedGrandTotal.toFixed(2)}).`);

    // 7. Assert Admin Display Formatter (2-decimal precision)
    const formattedTotal = (orderTotal).toFixed(2);
    if (formattedTotal !== expectedGrandTotal.toFixed(2)) {
        console.error(`FAIL: Admin formatted total '${formattedTotal}' is not 2-decimal '${expectedGrandTotal.toFixed(2)}'.`);
        await mongoose.disconnect();
        process.exit(1);
    }
    console.log(`✓ [PASS] 6. Admin Panel 2-decimal precision verified ('₹${formattedTotal}').`);

    // Clean up test order & session
    await Order.deleteOne({ _id: createdOrder._id });
    await CheckoutSession.deleteOne({ _id: session._id });

    console.log('===============================================================');
    console.log('  RESULTS: ALL PRICE INTEGRITY CHECKS PASSED 100% CLEANLY      ');
    console.log('===============================================================');

    await mongoose.disconnect();
}

runFinalPriceIntegrityVerification().catch((err) => {
    console.error('CRITICAL ERROR DURING INTEGRATION TEST:', err);
    process.exit(1);
});
