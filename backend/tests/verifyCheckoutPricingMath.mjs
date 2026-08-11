/**
 * Checkout Pricing Math Verification
 *
 * Replicates the exact arithmetic pipeline of `placeOrder` (order.controller.js)
 * using the real pricing engine, and asserts totals against hand-computed values.
 *
 * Covers the Phase 3 regression risks: retail parity, tax (inclusive/exclusive),
 * coupons, free-shipping thresholds, multi-vendor grouping, commission, and MOQ.
 *
 * Usage: node backend/scripts/verifyCheckoutPricingMath.mjs
 */

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { resolvePriceForQuantity, deriveOrderType } = await import(
    pathToFileURL(path.resolve(__dirname, '../src/services/pricingEngine.service.js')).href
);

let pass = 0;
let fail = 0;
const approx = (a, b) => Math.abs(a - b) < 0.011;
const check = (label, actual, expected) => {
    const ok = typeof expected === 'number' ? approx(actual, expected) : actual === expected;
    ok ? pass++ : fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}${ok ? '' : ` (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`}`);
};

/**
 * Mirrors placeOrder's per-item loop + totals, including the coupon/shipping/
 * commission arithmetic, so the math can be verified without a database.
 */
const simulateCheckout = ({ items, coupon = null, freeShippingThreshold = 0, flatShipping = 50 }) => {
    let subtotal = 0;
    let totalTaxReporting = 0;
    let extraTaxToPay = 0;
    let totalSavings = 0;
    const vendorMap = {};
    const enriched = [];

    for (const item of items) {
        const { product, basePrice, quantity, vendorId, vendorWholesaleEnabled = true, commissionRate = 10 } = item;
        const pricing = resolvePriceForQuantity(product, basePrice, quantity, { vendorWholesaleEnabled });
        if (!pricing.eligible) {
            return { ineligible: true, reason: pricing.reason, minimumQuantity: pricing.minimumQuantity };
        }

        const itemSubtotal = pricing.unitPrice * quantity;
        subtotal += itemSubtotal;
        totalSavings += pricing.savings;

        if (!vendorMap[vendorId]) {
            vendorMap[vendorId] = { vendorId, subtotal: 0, tax: 0, items: [], commissionRate };
        }

        // Tax — identical logic to placeOrder.
        const taxRate = Number(product.taxRate) || 0;
        if (taxRate > 0) {
            if (product.taxIncluded) {
                const net = itemSubtotal / (1 + taxRate / 100);
                const itemTax = itemSubtotal - net;
                totalTaxReporting += itemTax;
                vendorMap[vendorId].tax += itemTax;
            } else {
                const itemTax = itemSubtotal * (taxRate / 100);
                totalTaxReporting += itemTax;
                extraTaxToPay += itemTax;
                vendorMap[vendorId].tax += itemTax;
            }
        }

        const line = { pricingType: pricing.pricingType, savings: pricing.savings, unitPrice: pricing.unitPrice };
        vendorMap[vendorId].items.push(line);
        vendorMap[vendorId].subtotal += itemSubtotal;
        enriched.push(line);
    }

    // Coupon — evaluated on the post-wholesale subtotal (approved policy).
    let couponDiscount = 0;
    let couponRejected = null;
    if (coupon) {
        if (subtotal < (coupon.minOrderValue || 0)) {
            couponRejected = 'MIN_ORDER_NOT_MET';
        } else if (coupon.type === 'percentage') {
            couponDiscount = (subtotal * coupon.value) / 100;
            if (coupon.maxDiscount) couponDiscount = Math.min(couponDiscount, coupon.maxDiscount);
        } else if (coupon.type === 'fixed') {
            couponDiscount = coupon.value;
        }
    }

    // Shipping — per-vendor free-shipping threshold against the payable subtotal.
    let shipping = 0;
    const shippingByVendor = {};
    for (const v of Object.values(vendorMap)) {
        const vendorShipping = freeShippingThreshold > 0 && v.subtotal >= freeShippingThreshold ? 0 : flatShipping;
        shippingByVendor[v.vendorId] = vendorShipping;
        shipping += vendorShipping;
    }

    const tax = parseFloat(totalTaxReporting.toFixed(2));
    const total = parseFloat((subtotal - couponDiscount + shipping + extraTaxToPay).toFixed(2));

    // Commission — from the actual amount paid (approved policy).
    const commissions = Object.values(vendorMap).map((v) => ({
        vendorId: v.vendorId,
        commission: parseFloat(((v.subtotal * v.commissionRate) / 100).toFixed(2)),
        vendorEarnings: parseFloat((v.subtotal - (v.subtotal * v.commissionRate) / 100).toFixed(2)),
    }));

    return {
        subtotal, tax, extraTaxToPay, shipping, couponDiscount, couponRejected,
        total, totalSavings: parseFloat(totalSavings.toFixed(2)),
        orderType: deriveOrderType(enriched), vendorMap, shippingByVendor, commissions,
    };
};

const RETAIL = { retailEnabled: true, wholesaleEnabled: false, taxRate: 18, taxIncluded: false };
const HYBRID = {
    retailEnabled: true, wholesaleEnabled: true, taxRate: 18, taxIncluded: false,
    wholesale: { moqEnabled: false, priceTiers: [{ minQty: 10, price: 900 }, { minQty: 50, price: 800 }] },
};
const WHOLESALE_ONLY = {
    retailEnabled: false, wholesaleEnabled: true, taxRate: 18, taxIncluded: false,
    wholesale: { moqEnabled: true, moq: 20, priceTiers: [{ minQty: 20, price: 900 }] },
};

console.log('=== A. Retail baseline (must be byte-identical to pre-wholesale) ===');
{
    // 2 × ₹1000, 18% exclusive tax, ₹50 shipping.
    const r = simulateCheckout({ items: [{ product: RETAIL, basePrice: 1000, quantity: 2, vendorId: 'v1' }] });
    check('subtotal', r.subtotal, 2000);
    check('tax (18% exclusive)', r.tax, 360);
    check('shipping', r.shipping, 50);
    check('total = 2000 + 360 + 50', r.total, 2410);
    check('savings is zero', r.totalSavings, 0);
    check('orderType', r.orderType, 'retail');
    check('commission 10% of 2000', r.commissions[0].commission, 200);
}

console.log('\n=== B. Retail with inclusive tax (unchanged path) ===');
{
    const inclusive = { ...RETAIL, taxIncluded: true };
    const r = simulateCheckout({ items: [{ product: inclusive, basePrice: 1180, quantity: 1, vendorId: 'v1' }] });
    check('subtotal', r.subtotal, 1180);
    check('tax extracted from gross', r.tax, 180);
    check('no extra tax added', r.extraTaxToPay, 0);
    check('total = 1180 + 50 shipping', r.total, 1230);
}

console.log('\n=== C. Hybrid product below tier → retail pricing ===');
{
    const r = simulateCheckout({ items: [{ product: HYBRID, basePrice: 1000, quantity: 9, vendorId: 'v1' }] });
    check('subtotal at retail price', r.subtotal, 9000);
    check('pricingType retail', r.orderType, 'retail');
    check('savings zero', r.totalSavings, 0);
}

console.log('\n=== D. Hybrid at tier → wholesale pricing flows into tax + commission ===');
{
    const r = simulateCheckout({ items: [{ product: HYBRID, basePrice: 1000, quantity: 10, vendorId: 'v1' }] });
    check('subtotal uses tier price (10 × 900)', r.subtotal, 9000);
    check('tax computed on wholesale subtotal', r.tax, 1620);
    check('savings recorded ((1000-900)×10)', r.totalSavings, 1000);
    check('orderType wholesale', r.orderType, 'wholesale');
    check('commission from actual paid amount', r.commissions[0].commission, 900);
}

console.log('\n=== E. Coupon applies on post-wholesale subtotal (approved policy) ===');
{
    const r = simulateCheckout({
        items: [{ product: HYBRID, basePrice: 1000, quantity: 10, vendorId: 'v1' }],
        coupon: { type: 'percentage', value: 10, minOrderValue: 0 },
    });
    check('subtotal (wholesale)', r.subtotal, 9000);
    check('10% coupon on 9000, not 10000', r.couponDiscount, 900);
    check('total = 9000 - 900 + 1620 tax + 50 ship', r.total, 9770);
}

console.log('\n=== F. Coupon min-order boundary against wholesale subtotal ===');
{
    // Retail value 10×1000 = 10000 would qualify; wholesale 9000 does not.
    const r = simulateCheckout({
        items: [{ product: HYBRID, basePrice: 1000, quantity: 10, vendorId: 'v1' }],
        coupon: { type: 'fixed', value: 500, minOrderValue: 9500 },
    });
    check('coupon correctly rejected on wholesale subtotal', r.couponRejected, 'MIN_ORDER_NOT_MET');
    check('no discount applied', r.couponDiscount, 0);
}

console.log('\n=== G. Free-shipping threshold evaluated on payable subtotal ===');
{
    // Threshold 9500: retail 10×1000=10000 would ship free, wholesale 9000 does not.
    const r = simulateCheckout({
        items: [{ product: HYBRID, basePrice: 1000, quantity: 10, vendorId: 'v1' }],
        freeShippingThreshold: 9500,
    });
    check('shipping charged (wholesale subtotal below threshold)', r.shipping, 50);

    const r2 = simulateCheckout({
        items: [{ product: HYBRID, basePrice: 1000, quantity: 50, vendorId: 'v1' }],
        freeShippingThreshold: 9500,
    });
    check('50 × 800 = 40000 exceeds threshold → free', r2.shipping, 0);
}

console.log('\n=== H. Multi-vendor mixed retail + wholesale cart ===');
{
    const r = simulateCheckout({
        items: [
            { product: RETAIL, basePrice: 500, quantity: 2, vendorId: 'v1', commissionRate: 10 },
            { product: HYBRID, basePrice: 1000, quantity: 10, vendorId: 'v2', commissionRate: 20 },
        ],
    });
    check('combined subtotal (1000 + 9000)', r.subtotal, 10000);
    check('orderType is mixed', r.orderType, 'mixed');
    check('vendor v1 subtotal isolated', r.vendorMap.v1.subtotal, 1000);
    check('vendor v2 subtotal isolated', r.vendorMap.v2.subtotal, 9000);
    check('v1 commission 10%', r.commissions[0].commission, 100);
    check('v2 commission 20% of wholesale', r.commissions[1].commission, 1800);
    check('shipping charged per vendor (2 × 50)', r.shipping, 100);
    check('savings only from wholesale line', r.totalSavings, 1000);
}

console.log('\n=== I. MOQ enforcement blocks checkout ===');
{
    const r = simulateCheckout({ items: [{ product: WHOLESALE_ONLY, basePrice: 1000, quantity: 19, vendorId: 'v1' }] });
    check('order rejected below MOQ', r.ineligible, true);
    check('reason surfaced', r.reason, 'BELOW_MOQ');
    check('minimum quantity reported', r.minimumQuantity, 20);

    const ok = simulateCheckout({ items: [{ product: WHOLESALE_ONLY, basePrice: 1000, quantity: 20, vendorId: 'v1' }] });
    check('order accepted at MOQ', ok.ineligible, undefined);
    check('subtotal at MOQ (20 × 900)', ok.subtotal, 18000);
}

console.log('\n=== J. Vendor disables wholesale → cascade to retail pricing ===');
{
    const r = simulateCheckout({
        items: [{ product: HYBRID, basePrice: 1000, quantity: 50, vendorId: 'v1', vendorWholesaleEnabled: false }],
    });
    check('retail price used despite product tiers', r.subtotal, 50000);
    check('orderType retail', r.orderType, 'retail');
    check('no savings', r.totalSavings, 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
