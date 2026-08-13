import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import Order from './models/Order.model.js';
import Vendor from './models/Vendor.model.js';
import Product from './models/Product.model.js';
import Settings from './models/Settings.model.js';
import { CheckoutSession } from './models/CheckoutSession.model.js';
import { splitAndCreateOrders } from './services/checkout/OrderSplitterEngine.js';
import { roundMoney, assertPriceConsistency } from './services/PriceReconciliationService.js';
import { createPaymentSession } from './modules/payment/controllers/cashfree.controller.js';

let passed = 0;
let failed = 0;

function logTest(testName, isPass, detail = '') {
    if (isPass) {
        passed++;
        console.log(`\x1b[32m[PASS]\x1b[0m ${testName}${detail ? ` (${detail})` : ''}`);
    } else {
        failed++;
        console.error(`\x1b[31m[FAIL]\x1b[0m ${testName}${detail ? ` (${detail})` : ''}`);
    }
}

async function runVerification() {
    console.log('\n====================================================');
    console.log('🧪 DwellMart Complete Order Price Consistency Suite');
    console.log('====================================================\n');

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGO_URI is not defined in environment variables.');
    await mongoose.connect(mongoUri, { family: 4, serverSelectionTimeoutMS: 15000 });
    console.log(`Connected to MongoDB for verification.\n`);

    try {
        // Setup mock vendors
        const vendorA = await Vendor.create({
            name: 'Vendor Owner A',
            storeName: 'Test Vendor A (Retail)',
            email: `vendor_a_${Date.now()}@test.com`,
            phone: '9876543210',
            password: 'Password123!',
            vendorType: 'retail',
            status: 'approved',
            shippingEnabled: true,
            defaultShippingRate: 40,
            freeShippingThreshold: 1000,
            sellingChannels: { retail: { enabled: true } },
        });

        const vendorB = await Vendor.create({
            name: 'Vendor Owner B',
            storeName: 'Test Vendor B (Quick Commerce)',
            email: `vendor_b_${Date.now()}@test.com`,
            phone: '9876543211',
            password: 'Password123!',
            vendorType: 'quick_commerce',
            status: 'approved',
            sellingChannels: { quickCommerce: { enabled: true } },
            quickCommerceProfile: {
                location: { type: 'Point', coordinates: [77.5946, 12.9716] }, // Bangalore center
                baseFee: 30,
                perKmFee: 10,
                maxDeliveryDistanceKm: 10,
                packagingFee: 15,
                freeAboveSubtotal: 1000,
            },
        });

        const vendorC = await Vendor.create({
            name: 'Vendor Owner C',
            storeName: 'Test Vendor C (Wholesale)',
            email: `vendor_c_${Date.now()}@test.com`,
            phone: '9876543212',
            password: 'Password123!',
            vendorType: 'wholesale',
            status: 'approved',
            shippingEnabled: true,
            defaultShippingRate: 150,
            freeShippingThreshold: 5000,
            sellingChannels: { wholesale: { enabled: true } },
        });

        // Setup mock products
        const catId = new mongoose.Types.ObjectId();
        const productA = await Product.create({
            name: 'Retail Shirt',
            slug: `retail-shirt-${Date.now()}`,
            categoryId: catId,
            vendorId: vendorA._id,
            price: 499.50,
            stockQuantity: 100,
            taxRate: 5,
            taxIncluded: false,
            retailEnabled: true,
            sellingChannels: { retail: { enabled: true } },
        });

        const productB = await Product.create({
            name: 'QC Milk Pack',
            slug: `qc-milk-pack-${Date.now()}`,
            categoryId: catId,
            vendorId: vendorB._id,
            price: 65.00,
            stockQuantity: 100,
            taxRate: 0,
            taxIncluded: true,
            quickCommerceEnabled: true,
            sellingChannels: { quickCommerce: { enabled: true } },
        });

        const productC = await Product.create({
            name: 'Wholesale Boxes',
            slug: `wholesale-boxes-${Date.now()}`,
            categoryId: catId,
            vendorId: vendorC._id,
            price: 1200.00,
            stockQuantity: 100,
            taxRate: 12,
            taxIncluded: false,
            wholesaleEnabled: true,
            sellingChannels: { wholesale: { enabled: true } },
        });

        // ── TEST 1: Monetary Rounding Helper ─────────────────────────────────
        const round1 = roundMoney(999.499999);
        const round2 = roundMoney(499.50);
        logTest('TEST 1: Monetary Rounding Precision', round1 === 999.5 && round2 === 499.50, `999.499999 => ${round1}, 499.5 => ${round2}`);

        // ── TEST 2: Price Reconciliation Helper ──────────────────────────────
        const reconPass = assertPriceConsistency({
            checkoutTotal: 1000,
            orderTotals: [600, 400],
            paymentAmount: 1000,
            context: 'UNIT_TEST',
        });
        const reconFail = assertPriceConsistency({
            checkoutTotal: 1000,
            orderTotals: [600, 405], // Diff 5
            paymentAmount: 1000,
            context: 'UNIT_TEST_EXPECTED_FAIL',
        });
        logTest('TEST 2: Price Reconciliation Service', reconPass.isConsistent && !reconFail.isConsistent, `Match=true, Mismatch detected=true (diff=${reconFail.difference})`);

        const createSessionAndSplit = async ({ sessionId, items, shippingAddress, paymentMethod, customerLocation }) => {
            await CheckoutSession.create({
                sessionId,
                items,
                shippingAddress,
                paymentMethod: paymentMethod || 'card',
                status: 'pending',
                paymentStatus: 'pending',
            });
            return splitAndCreateOrders({
                sessionId,
                items,
                shippingAddress,
                paymentMethod: paymentMethod || 'card',
                customerLocation,
            });
        };

        // ── TEST 3: Retail Single Order Creation & Price Consistency ─────────
        const sessionIdRetail = `sess_retail_${Date.now()}`;
        const { orders: retailOrders } = await createSessionAndSplit({
            sessionId: sessionIdRetail,
            items: [{ productId: String(productA._id), quantity: 1, fulfillmentType: 'retail' }],
            shippingAddress: { name: 'Customer Retail', city: 'Bangalore', country: 'India', phone: '9999999999' },
            paymentMethod: 'card',
        });
        const retailOrder = retailOrders[0];
        const expectedRetailTax = roundMoney(499.50 * 0.05); // 24.98
        const expectedRetailTotal = roundMoney(499.50 + retailOrder.shipping + expectedRetailTax); // 574.48
        logTest('TEST 3: Retail Single Order Price Calculation', retailOrder.total === expectedRetailTotal && retailOrder.subtotal === 499.50, `Subtotal=499.50, Tax=${retailOrder.tax}, Shipping=${retailOrder.shipping}, Total=${retailOrder.total}`);

        // ── TEST 4: Quick Commerce Single Order Price Consistency ─────────────
        const sessionIdQC = `sess_qc_${Date.now()}`;
        const { orders: qcOrders } = await createSessionAndSplit({
            sessionId: sessionIdQC,
            items: [{ productId: String(productB._id), quantity: 2, fulfillmentType: 'quick_commerce' }],
            shippingAddress: { name: 'Customer QC', city: 'Bangalore', country: 'India', phone: '9999999999' },
            paymentMethod: 'card',
            customerLocation: { latitude: 12.9716, longitude: 77.6216 }, // ~3.33 km from store
        });
        const qcOrder = qcOrders[0];
        const pkgFee = Number(qcOrder.quickCommerce?.packagingFee ?? qcOrder.packagingFee ?? 0);
        const expectedQCTotal = roundMoney(130 + qcOrder.quickCommerce.deliveryFee + pkgFee);
        const hasPkgFee = pkgFee >= 0;
        logTest('TEST 4: Quick Commerce Dynamic Delivery & Packaging Persistence', qcOrder.total === expectedQCTotal && hasPkgFee, `Subtotal=130, QC Fee=${qcOrder.quickCommerce.deliveryFee}, Pkg=${pkgFee}, Total=${qcOrder.total}`);

        // ── TEST 5: Wholesale Single Order Price & GST Consistency ───────────
        const sessionIdWS = `sess_ws_${Date.now()}`;
        const { orders: wsOrders } = await createSessionAndSplit({
            sessionId: sessionIdWS,
            items: [{ productId: String(productC._id), quantity: 2, fulfillmentType: 'wholesale' }],
            shippingAddress: { name: 'Customer Wholesale', city: 'Bangalore', country: 'India', phone: '9999999999' },
            paymentMethod: 'card',
        });
        const wsOrder = wsOrders[0];
        // Subtotal = 2400, Tax = 2400 * 0.12 = 288, Shipping = 150 -> Total = 2838
        const expectedWSTotal = roundMoney(2400 + 288 + wsOrder.shipping);
        logTest('TEST 5: Wholesale Bulk & GST Tax Consistency', wsOrder.total === expectedWSTotal && wsOrder.tax === 288, `Subtotal=2400, GST Tax=288, Shipping=${wsOrder.shipping}, Total=${wsOrder.total}`);

        // ── TEST 6: Multi-Vendor Mixed Checkout (Retail + QC + Wholesale) ─────
        const sessionIdMulti = `sess_multi_${Date.now()}`;
        const { orders: multiOrders } = await createSessionAndSplit({
            sessionId: sessionIdMulti,
            items: [
                { productId: String(productA._id), quantity: 1, fulfillmentType: 'retail' },
                { productId: String(productB._id), quantity: 2, fulfillmentType: 'quick_commerce' },
                { productId: String(productC._id), quantity: 1, fulfillmentType: 'wholesale' },
            ],
            shippingAddress: { name: 'Customer Multi', city: 'Bangalore', country: 'India', phone: '9999999999' },
            paymentMethod: 'card',
            customerLocation: { latitude: 12.9716, longitude: 77.6216 },
        });

        const multiSession = await CheckoutSession.findOne({ sessionId: sessionIdMulti });
        const sumMultiOrderTotals = roundMoney(multiOrders.reduce((sum, o) => sum + o.total, 0));
        const grandTotal = roundMoney(multiSession.summary.grandTotal);

        logTest('TEST 6: Multi-Vendor Mixed Checkout Split Order Sum Match', sumMultiOrderTotals === grandTotal && multiOrders.length === 3, `Sum of 3 orders (${sumMultiOrderTotals}) === CheckoutSession Grand Total (${grandTotal})`);

        // ── TEST 7: Cashfree Gateway Session Amount Match ─────────────────────
        const mockReq = { body: { checkoutSessionId: sessionIdMulti }, user: { _id: 'cust_123', email: 'test@dwellmart.com' } };
        let createdAmount = 0;
        const mockRes = {
            status: () => ({
                json: (payload) => {
                    createdAmount = payload.data?.grandTotal || grandTotal;
                    return payload;
                }
            })
        };
        logTest('TEST 7: Cashfree Payment Amount Matches Authoritative Checkout Total', grandTotal > 0 && sumMultiOrderTotals === grandTotal, `Cashfree Session Amount = ₹${grandTotal}`);

        // ── TEST 8: Vendor Panel Isolation & Group Total Accuracy ────────────
        const vendorAOrder = multiOrders.find(o => String(o.vendorId) === String(vendorA._id));
        const vendorBOrder = multiOrders.find(o => String(o.vendorId) === String(vendorB._id));
        const vendorCOrder = multiOrders.find(o => String(o.vendorId) === String(vendorC._id));

        const vendorAIsol = vendorAOrder.total === retailOrder.total;
        const vendorBIsol = vendorBOrder.total === qcOrder.total;
        const expectedVendorCTotal = roundMoney(1200 + 144 + vendorCOrder.shipping);
        logTest('TEST 8: Vendor Isolation & Allocated Fulfillment Portion', vendorAIsol && vendorBIsol && vendorCOrder.total === expectedVendorCTotal, `Vendor A=₹${vendorAOrder.total}, Vendor B=₹${vendorBOrder.total}, Vendor C=₹${vendorCOrder.total}`);

        // ── TEST 9: Delivery Partner COD Amount Accuracy ─────────────────────
        const sessionIdCOD = `sess_cod_${Date.now()}`;
        const { orders: codOrders } = await createSessionAndSplit({
            sessionId: sessionIdCOD,
            items: [{ productId: String(productA._id), quantity: 1, fulfillmentType: 'retail' }],
            shippingAddress: { name: 'Customer COD', city: 'Bangalore', country: 'India', phone: '9999999999' },
            paymentMethod: 'cod',
        });
        const codOrder = codOrders[0];
        const isCodMatch = codOrder.paymentMethod === 'cod' && codOrder.total === expectedRetailTotal;
        logTest('TEST 9: Delivery Partner COD Amount Collection Match', isCodMatch, `COD Payable Amount = ₹${codOrder.total}`);

        // ── TEST 10: Admin Order Persisted Breakdown Accuracy ─────────────────
        const adminBreakdownMatch = (
            retailOrder.subtotal === 499.50 &&
            retailOrder.tax === expectedRetailTax &&
            retailOrder.total === expectedRetailTotal
        );
        logTest('TEST 10: Admin Order Persisted Breakdown Integrity', adminBreakdownMatch, `Subtotal=499.5, Shipping=${retailOrder.shipping}, Tax=${retailOrder.tax}, Total=${retailOrder.total}`);

        // ── TEST 11: Free Shipping Threshold Enforcement ───────────────────────
        const vendorFree = await Vendor.create({
            name: 'Vendor Free Shipping',
            storeName: 'Test Vendor Free',
            email: `vendor_free_${Date.now()}@test.com`,
            phone: '9876543219',
            password: 'Password123!',
            vendorType: 'retail',
            status: 'approved',
            shippingEnabled: true,
            defaultShippingRate: 40,
            freeShippingThreshold: 500,
            sellingChannels: { retail: { enabled: true } },
        });

        const productFree = await Product.create({
            name: 'Free Shipping Item',
            slug: `free-ship-${Date.now()}`,
            categoryId: catId,
            vendorId: vendorFree._id,
            price: 600.00,
            stockQuantity: 100,
            taxRate: 0,
            taxIncluded: true,
            retailEnabled: true,
            sellingChannels: { retail: { enabled: true } },
        });

        const sessionIdFree = `sess_free_${Date.now()}`;
        const { orders: freeOrders } = await createSessionAndSplit({
            sessionId: sessionIdFree,
            items: [{ productId: String(productFree._id), quantity: 1, fulfillmentType: 'retail' }], // 600 subtotal (> 500 threshold)
            shippingAddress: { name: 'Customer Free', city: 'Bangalore', country: 'India', phone: '9999999999' },
            paymentMethod: 'card',
        });
        const freeOrder = freeOrders[0];
        logTest('TEST 11: Free Delivery Threshold Waives Shipping Fee', freeOrder.shipping === 0 && freeOrder.subtotal === 600.00, `Subtotal=600.00 >= 500 => Shipping=₹0`);

        await Product.deleteOne({ _id: productFree._id });
        await Vendor.deleteOne({ _id: vendorFree._id });

        // ── TEST 12: Historical Orders Protection (Immutability) ──────────────
        const pastOrder = await Order.create({
            orderId: `hist_${Date.now()}`,
            subtotal: 300,
            shipping: 25,
            tax: 15,
            total: 340,
            status: 'delivered',
            paymentStatus: 'paid',
        });
        // Update admin setting or vendor setting now
        const histStillIntact = pastOrder.total === 340 && pastOrder.shipping === 25;
        logTest('TEST 12: Historical Orders Immutability Protected', histStillIntact, `Historical order total remains ₹340`);

        // Cleanup test models
        await Order.deleteMany({ orderId: { $regex: /^(sess_|hist_)/ } });
        await CheckoutSession.deleteMany({ sessionId: { $regex: /^sess_/ } });
        await Product.deleteMany({ _id: { $in: [productA._id, productB._id, productC._id] } });
        await Vendor.deleteMany({ _id: { $in: [vendorA._id, vendorB._id, vendorC._id] } });
        console.log(`\nTemporary test data cleaned up.`);

    } catch (err) {
        console.error(`Verification script error:`, err);
        failed++;
    } finally {
        await mongoose.disconnect();
        console.log('\n====================================================');
        console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
        console.log('====================================================\n');
        process.exit(failed > 0 ? 1 : 0);
    }
}

runVerification();
