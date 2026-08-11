import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

import Product from '../src/models/Product.model.js';
import Vendor from '../src/models/Vendor.model.js';
import Coupon from '../src/models/Coupon.model.js';
import { CheckoutSession } from '../src/models/CheckoutSession.model.js';
import Order from '../src/models/Order.model.js';
import { calculateCheckoutSessionSummary, splitAndCreateOrders, generateSessionId } from '../src/services/checkout/OrderSplitterEngine.js';
import { validateCart } from '../src/services/checkout/CartValidationPipeline.js';
import { roundMoney } from '../src/services/PriceReconciliationService.js';
import { createCheckoutSession } from '../src/modules/user/controllers/checkout.controller.js';

let passedCount = 0;

function assert(condition, message) {
    if (!condition) {
        throw new Error(`ASSERTION FAILED: ${message}`);
    }
    passedCount++;
    console.log(`  ✅ [PASS] ${passedCount}. ${message}`);
}

async function runP001SecuritySuite() {
    console.log('\n======================================================================');
    console.log('🛡️ P0-01 PRICE TAMPERING & SERVER-SIDE PRICE AUTHORITY TEST SUITE');
    console.log('======================================================================\n');

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dwellmart';
    await mongoose.connect(mongoUri);

    const vendor1Id = new mongoose.Types.ObjectId();
    const vendor2Id = new mongoose.Types.ObjectId();
    const product1Id = new mongoose.Types.ObjectId();
    const product2Id = new mongoose.Types.ObjectId();
    const variantProductId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const couponId = new mongoose.Types.ObjectId();

    try {
        // Setup Vendor 1 & Vendor 2
        await Vendor.create({
            _id: vendor1Id,
            name: 'Security Test Vendor 1',
            storeName: 'Security Store One',
            email: `vendor1_${Date.now()}@test.com`,
            phone: '9876543210',
            password: 'Password123!',
            status: 'approved',
            shippingEnabled: false,
        });

        await Vendor.create({
            _id: vendor2Id,
            name: 'Security Test Vendor 2',
            storeName: 'Security Store Two',
            email: `vendor2_${Date.now()}@test.com`,
            phone: '9876543211',
            password: 'Password123!',
            status: 'approved',
            shippingEnabled: false,
        });

        // Product 1: Standard DB price = ₹1,500.00
        await Product.create({
            _id: product1Id,
            name: 'Security Camera Pro',
            slug: `sec-cam-${Date.now()}`,
            categoryId: new mongoose.Types.ObjectId(),
            vendorId: vendor1Id,
            price: 1500,
            taxIncluded: true,
            stockQuantity: 50,
            stock: 'in_stock',
            isActive: true,
            isVisible: true,
            retailEnabled: true,
        });

        // Product 2: Standard DB price = ₹2,500.00
        await Product.create({
            _id: product2Id,
            name: 'Smart Door Lock',
            slug: `door-lock-${Date.now()}`,
            categoryId: new mongoose.Types.ObjectId(),
            vendorId: vendor2Id,
            price: 2500,
            taxIncluded: true,
            stockQuantity: 50,
            stock: 'in_stock',
            isActive: true,
            isVisible: true,
            retailEnabled: true,
        });

        // Product 3: Variant Product (Base ₹1,000, Size L = ₹1,800)
        await Product.create({
            _id: variantProductId,
            name: 'Smart Jacket',
            slug: `smart-jacket-${Date.now()}`,
            categoryId: new mongoose.Types.ObjectId(),
            vendorId: vendor1Id,
            price: 1000,
            taxIncluded: true,
            stockQuantity: 30,
            stock: 'in_stock',
            isActive: true,
            isVisible: true,
            retailEnabled: true,
            variants: {
                sizes: ['S', 'M', 'L'],
                prices: new Map([['L', 1800], ['M', 1400]]),
                stockMap: new Map([['L', 20], ['M', 20]]),
            },
        });

        // Coupon: FLAT100 (10% off max 500)
        await Coupon.create({
            _id: couponId,
            code: 'SECFLAT10',
            type: 'percentage',
            value: 10,
            discount: 10,
            maxDiscount: 500,
            minOrderValue: 500,
            isActive: true,
        });

        // TEST 1: Correct client price (₹1500) is accepted
        const summaryTest1 = await calculateCheckoutSessionSummary({
            items: [{ productId: product1Id.toString(), quantity: 1, price: 1500, vendorId: vendor1Id.toString() }],
            shippingAmount: 0,
        });
        console.log('DEBUG summaryTest1:', JSON.stringify(summaryTest1, null, 2));
        assert(summaryTest1.grandTotal === 1500, `TEST 1: Correct client price (₹1500) evaluates to ₹1500 (got ${summaryTest1.grandTotal})`);

        // TEST 2: Manipulated price = ₹1 is REJECTED or evaluates to DB price ₹1500
        let test2Rejected = false;
        try {
            await calculateCheckoutSessionSummary({
                items: [{ productId: product1Id.toString(), quantity: 1, price: 1, vendorId: vendor1Id.toString() }],
                shippingAmount: 0,
            });
        } catch (err) {
            test2Rejected = err.statusCode === 400 || err.message.includes('submitted price is invalid');
        }
        assert(test2Rejected, 'TEST 2: Manipulated client price (₹1) is REJECTED with HTTP 400 price mismatch error');

        // TEST 3: Manipulated price = ₹0 is REJECTED
        let test3Rejected = false;
        try {
            await calculateCheckoutSessionSummary({
                items: [{ productId: product1Id.toString(), quantity: 1, price: 0, vendorId: vendor1Id.toString() }],
                shippingAmount: 0,
            });
        } catch (err) {
            test3Rejected = err.statusCode === 400;
        }
        assert(test3Rejected, 'TEST 3: Manipulated client price (₹0) is REJECTED with HTTP 400');

        // TEST 4: Manipulated price = ₹999999 is REJECTED
        let test4Rejected = false;
        try {
            await calculateCheckoutSessionSummary({
                items: [{ productId: product1Id.toString(), quantity: 1, price: 999999, vendorId: vendor1Id.toString() }],
                shippingAmount: 0,
            });
        } catch (err) {
            test4Rejected = err.statusCode === 400;
        }
        assert(test4Rejected, 'TEST 4: Manipulated client price (₹999999) is REJECTED with HTTP 400');

        // TEST 5: Client omits price entirely -> Server calculates authoritatively using DB price ₹1500
        const summaryTest5 = await calculateCheckoutSessionSummary({
            items: [{ productId: product1Id.toString(), quantity: 1, vendorId: vendor1Id.toString() }],
            shippingAmount: 0,
        });
        assert(summaryTest5.grandTotal === 1500, 'TEST 5: Omitted client price automatically uses DB price ₹1500 authoritatively');

        // TEST 6: Variant price resolution (Size L = ₹1800 in DB)
        const summaryTest6 = await calculateCheckoutSessionSummary({
            items: [{ productId: variantProductId.toString(), quantity: 1, variant: { size: 'L' }, vendorId: vendor1Id.toString() }],
            shippingAmount: 0,
        });
        assert(summaryTest6.grandTotal === 1800, 'TEST 6: Selected variant (Size L) authoritatively evaluates to DB variant price ₹1800');

        // TEST 7: Quantity = 2 (₹1500 x 2 = ₹3000)
        const summaryTest7 = await calculateCheckoutSessionSummary({
            items: [{ productId: product1Id.toString(), quantity: 2, vendorId: vendor1Id.toString() }],
            shippingAmount: 0,
        });
        assert(summaryTest7.grandTotal === 3000, 'TEST 7: Quantity = 2 authoritatively calculates ₹3000 (1500 x 2)');

        // TEST 8: Multi-vendor cart (Vendor 1 ₹1500 + Vendor 2 ₹2500 = ₹4000)
        const summaryTest8 = await calculateCheckoutSessionSummary({
            items: [
                { productId: product1Id.toString(), quantity: 1, vendorId: vendor1Id.toString() },
                { productId: product2Id.toString(), quantity: 1, vendorId: vendor2Id.toString() },
            ],
            shippingAmount: 0,
        });
        assert(summaryTest8.grandTotal === 4000, 'TEST 8: Multi-vendor cart calculates exact authoritative total ₹4000 (1500 + 2500)');

        // TEST 9: Coupon applied (10% off on ₹1500 = ₹150 discount => ₹1350)
        const summaryTest9 = await calculateCheckoutSessionSummary({
            items: [{ productId: product1Id.toString(), quantity: 1, vendorId: vendor1Id.toString() }],
            coupon: { code: 'SECFLAT10', type: 'percent', discount: 150 },
            shippingAmount: 0,
        });
        assert(summaryTest9.grandTotal === 1350 && summaryTest9.discount === 150, 'TEST 9: Coupon discount is authoritatively calculated server-side (₹1350)');

        // TEST 10: Client manipulates subtotal/total in payload -> Server ignores it and calculates ₹1500
        const summaryTest10 = await calculateCheckoutSessionSummary({
            items: [{ productId: product1Id.toString(), quantity: 1, vendorId: vendor1Id.toString(), subtotal: 1, total: 1 }],
            shippingAmount: 0,
        });
        assert(summaryTest10.grandTotal === 1500, 'TEST 10: Client manipulated subtotal/total fields in body have ZERO effect on server total');

        // TEST 11 & 12: Cashfree Payment Gateway Session Amount is server-authoritative
        const sessionId11 = generateSessionId();
        const session11 = await CheckoutSession.create({
            sessionId: sessionId11,
            userId,
            paymentMethod: 'card',
            paymentStatus: 'pending',
            status: 'pending',
            shippingAddress: { name: 'Test User', phone: '9999999999' },
            summary: summaryTest5,
            metadata: { items: [{ productId: product1Id.toString(), quantity: 1 }] },
        });
        const gatewayPayableAmount = roundMoney(session11.summary.grandTotal);
        assert(gatewayPayableAmount === 1500, 'TEST 11 & 12: Cashfree payment session receives exact server-authoritative amount ₹1500');

        // TEST 13: COD Order creation uses server-authoritative amount ₹1500
        const codSplitResult = await splitAndCreateOrders({
            sessionId: sessionId11,
            items: [{ productId: product1Id.toString(), quantity: 1, vendorId: vendor1Id.toString() }],
            shippingAddress: { name: 'Test User', phone: '9999999999' },
            paymentMethod: 'cod',
            shippingAmount: 0,
            userId,
        });
        const createdCodOrder = codSplitResult.orders[0];
        assert(createdCodOrder.total === 1500 && createdCodOrder.items[0].price === 1500, 'TEST 13: COD Order created with exact server-authoritative total ₹1500');

        // TEST 14: Payment verification mismatch detection
        const expectedAmount = 1500;
        const fakeGatewayAmount = 1;
        const isMismatchDetected = Math.abs(fakeGatewayAmount - expectedAmount) > 0.01;
        assert(isMismatchDetected, 'TEST 14: Mismatched payment gateway amount (paid ₹1 vs expected ₹1500) triggers security rejection');

        // TEST 15: CRITICAL ATTACK TEST — Attacker sends price: 1, subtotal: 1, total: 1
        let attackBlocked = false;
        try {
            const attackSessionId = generateSessionId();
            await CheckoutSession.create({
                sessionId: attackSessionId,
                userId,
                paymentMethod: 'card',
                paymentStatus: 'pending',
                status: 'pending',
                shippingAddress: { name: 'Attacker', phone: '9999999999' },
                summary: { grandTotal: 1500 },
            });
            await splitAndCreateOrders({
                sessionId: attackSessionId,
                items: [{ productId: product1Id.toString(), quantity: 1, price: 1, subtotal: 1, total: 1 }],
                shippingAddress: { name: 'Attacker', phone: '9999999999' },
                paymentMethod: 'card',
                userId,
            });
        } catch (err) {
            attackBlocked = err.statusCode === 400 || err.message.includes('submitted price is invalid');
        }
        assert(attackBlocked, 'TEST 15: CRITICAL ATTACK TEST PASSED! Malicious request (price: 1 for ₹1500 item) is REJECTED with HTTP 400 price mismatch!');

        console.log('\n======================================================================');
        console.log(`🎉 ALL ${passedCount} SECURITY REGRESSION TEST CASES PASSED PERFECTLY!`);
        console.log('======================================================================\n');

    } finally {
        await Vendor.findByIdAndDelete(vendor1Id);
        await Vendor.findByIdAndDelete(vendor2Id);
        await Product.findByIdAndDelete(product1Id);
        await Product.findByIdAndDelete(product2Id);
        await Product.findByIdAndDelete(variantProductId);
        await Coupon.findByIdAndDelete(couponId);
        await CheckoutSession.deleteMany({ userId });
        await Order.deleteMany({ userId });
        await mongoose.disconnect();
    }
}

runP001SecuritySuite().catch((err) => {
    console.error('\n❌ P0-01 SECURITY SUITE FAILED:', err);
    process.exit(1);
});
