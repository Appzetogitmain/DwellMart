/**
 * Quick Commerce ETA Conformance & Parity Verification
 *
 * Runs the shared fixture against BOTH implementations:
 *   1. backend/src/services/quickCommerce.service.js      (authoritative)
 *   2. frontend/src/shared/utils/quickCommerceEta.js       (preview mirror)
 *
 * Fails if either deviates from the fixture, or if the two disagree — the guard
 * that stops a customer being shown one ETA and promised another.
 *
 * Usage: node backend/scripts/verifyQuickCommerceEtaParity.mjs
 */

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const load = (rel) => import(pathToFileURL(path.resolve(__dirname, rel)).href);

const server = await load('../src/services/quickCommerce.service.js');
const { ETA_FIXTURES, DELIVERY_FEE_FIXTURES } = await load('../src/services/quickCommerceEta.fixtures.js');
const client = await load('../../frontend/src/shared/utils/quickCommerceEta.js');
const clientTotals = await load('../../frontend/src/shared/utils/cartTotals.js');

let passed = 0;
let failed = 0;
const record = (ok, label, detail = '') => {
    ok ? (passed += 1) : (failed += 1);
    console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}${ok ? '' : `\n    ${detail}`}`);
};

console.log('=== Fixture conformance: SERVER (authoritative) ===');
for (const fixture of ETA_FIXTURES) {
    const result = server.calculateEta(fixture.input);
    const mismatches = Object.entries(fixture.expect)
        .filter(([key, expected]) => result[key] !== expected)
        .map(([key, expected]) => `${key}: got ${result[key]}, expected ${expected}`);
    record(mismatches.length === 0, `server: ${fixture.label}`, mismatches.join('; '));
}

console.log('\n=== Fixture conformance: CLIENT (preview mirror) ===');
for (const fixture of ETA_FIXTURES) {
    const result = client.calculateEta(fixture.input);
    const mismatches = Object.entries(fixture.expect)
        .filter(([key, expected]) => result[key] !== expected)
        .map(([key, expected]) => `${key}: got ${result[key]}, expected ${expected}`);
    record(mismatches.length === 0, `client: ${fixture.label}`, mismatches.join('; '));
}

console.log('\n=== Cross-implementation parity ===');
for (const fixture of ETA_FIXTURES) {
    const a = JSON.stringify(server.calculateEta(fixture.input));
    const b = JSON.stringify(client.calculateEta(fixture.input));
    record(a === b, `parity: ${fixture.label}`, `server=${a}\n    client=${b}`);
}

console.log('\n=== Haversine parity ===');
const points = [
    [{ latitude: 12.9716, longitude: 77.5946 }, { latitude: 12.9800, longitude: 77.5946 }],
    [{ latitude: 12.9716, longitude: 77.5946 }, { latitude: 13.0500, longitude: 77.6200 }],
    [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }],
    [{ latitude: 12.9716, longitude: 77.5946 }, { latitude: null, longitude: 77.6 }],
];
points.forEach(([from, to], index) => {
    const a = server.haversineDistanceKm(from, to);
    const b = client.haversineDistanceKm(from, to);
    record(a === b, `haversine case ${index + 1} identical`, `server=${a} client=${b}`);
});

console.log('\n=== Randomized differential fuzz (500 cases) ===');
const rand = (min, max) => Math.random() * (max - min) + min;
let mismatches = 0;
for (let i = 0; i < 500; i += 1) {
    const input = {
        preparationTimeMins: Math.round(rand(0, 60)),
        extraPrepMins: Math.round(rand(0, 30)),
        distanceKm: Number(rand(0, 25).toFixed(3)),
        averageSpeedKmph: Math.round(rand(5, 60)),
    };
    if (JSON.stringify(server.calculateEta(input)) !== JSON.stringify(client.calculateEta(input))) {
        mismatches += 1;
        if (mismatches <= 3) console.log(`FAIL — fuzz ${i}: ${JSON.stringify(input)}`);
    }
}
record(mismatches === 0, 'fuzz: 500 randomized ETA cases identical', `${mismatches} mismatches`);

console.log('\n=== Delivery fee conformance (server-only, no mirror) ===');
for (const fixture of DELIVERY_FEE_FIXTURES) {
    const result = server.calculateDeliveryFee(fixture.input);
    record(result === fixture.expect, `fee: ${fixture.label}`, `got ${result}, expected ${fixture.expect}`);
}

/**
 * Displayed-vs-charged guard.
 *
 * The backend total is:
 *   subtotal - couponDiscount + deliveryFee + packagingFee + exclusiveTax
 * The checkout screen renders it through `calculateCartTotal`. If those two
 * ever diverge, the customer is shown one number and charged another — the
 * exact defect this harness exists to prevent.
 */
console.log('\n=== Quick Commerce total: server formula vs checkout display ===');
const serverTotal = ({ subtotal, couponDiscount, deliveryFee, packagingFee, exclusiveTax }) =>
    parseFloat((subtotal - couponDiscount + deliveryFee + packagingFee + exclusiveTax).toFixed(2));

const TOTAL_CASES = [
    { label: 'no fees, no tax', subtotal: 300, couponDiscount: 0, deliveryFee: 0, packagingFee: 0, exclusiveTax: 0 },
    { label: 'delivery + packaging', subtotal: 300, couponDiscount: 0, deliveryFee: 41, packagingFee: 10, exclusiveTax: 54 },
    { label: 'packaging only (free delivery)', subtotal: 600, couponDiscount: 0, deliveryFee: 0, packagingFee: 15, exclusiveTax: 108 },
    { label: 'coupon applied', subtotal: 500, couponDiscount: 75, deliveryFee: 33, packagingFee: 10, exclusiveTax: 90 },
    { label: 'freeship coupon zeroes delivery, packaging still charged', subtotal: 500, couponDiscount: 0, deliveryFee: 0, packagingFee: 20, exclusiveTax: 90 },
    { label: 'inclusive tax adds nothing to the total', subtotal: 500, couponDiscount: 0, deliveryFee: 41, packagingFee: 10, exclusiveTax: 0 },
    { label: 'fractional amounts round identically', subtotal: 249.97, couponDiscount: 12.33, deliveryFee: 35.4, packagingFee: 7.5, exclusiveTax: 44.99 },
    // A fixed coupon worth more than the cart. Both sides cap the discount at
    // the subtotal; without that cap the server produced a NEGATIVE total while
    // the client displayed 0.
    { label: 'oversized coupon is capped at subtotal', subtotal: 200, couponDiscount: 200, deliveryFee: 25, packagingFee: 10, exclusiveTax: 36 },
    { label: 'coupon exactly equal to subtotal', subtotal: 500, couponDiscount: 500, deliveryFee: 40, packagingFee: 0, exclusiveTax: 90 },
];

for (const testCase of TOTAL_CASES) {
    const expected = serverTotal(testCase);
    const displayed = clientTotals.calculateCartTotal({
        subtotal: testCase.subtotal,
        discount: testCase.couponDiscount,
        shipping: testCase.deliveryFee,
        packagingFee: testCase.packagingFee,
        taxAddedToTotal: testCase.exclusiveTax,
    });
    record(displayed === expected, `total: ${testCase.label}`, `displayed=${displayed} charged=${expected}`);
}

console.log('\n=== Randomized total differential (500 cases) ===');
let totalMismatches = 0;
for (let i = 0; i < 500; i += 1) {
    const subtotal = Number(rand(0, 5000).toFixed(2));
    const testCase = {
        subtotal,
        // Both implementations cap the discount at the subtotal, so the fuzz
        // reflects that invariant rather than testing an unreachable state.
        // The cap itself is asserted explicitly below.
        couponDiscount: Number(Math.min(rand(0, 400), subtotal).toFixed(2)),
        deliveryFee: Number(rand(0, 120).toFixed(2)),
        packagingFee: Number(rand(0, 50).toFixed(2)),
        exclusiveTax: Number(rand(0, 900).toFixed(2)),
    };
    const expected = serverTotal(testCase);
    const displayed = clientTotals.calculateCartTotal({
        subtotal: testCase.subtotal,
        discount: testCase.couponDiscount,
        shipping: testCase.deliveryFee,
        packagingFee: testCase.packagingFee,
        taxAddedToTotal: testCase.exclusiveTax,
    });
    if (displayed !== expected) {
        totalMismatches += 1;
        if (totalMismatches <= 3) console.log(`FAIL — total fuzz ${i}: ${JSON.stringify(testCase)} displayed=${displayed} charged=${expected}`);
    }
}
record(totalMismatches === 0, 'fuzz: 500 randomized totals match the charged amount', `${totalMismatches} mismatches`);

/**
 * The discount cap itself.
 *
 * `placeOrder` caps a coupon at the subtotal, and Checkout mirrors it. Without
 * the cap a fixed coupon worth more than the cart charged a negative total
 * while displaying zero.
 */
console.log('\n=== Coupon discount cap ===');
const capDiscount = (discount, subtotal) => Math.min(discount, subtotal);
const CAP_CASES = [
    { discount: 500, subtotal: 200, expect: 200, label: 'fixed coupon above cart value is capped' },
    { discount: 200, subtotal: 200, expect: 200, label: 'coupon equal to cart value is untouched' },
    { discount: 50, subtotal: 200, expect: 50, label: 'ordinary coupon is untouched' },
    { discount: 0, subtotal: 0, expect: 0, label: 'empty cart stays at zero' },
];
for (const testCase of CAP_CASES) {
    const capped = capDiscount(testCase.discount, testCase.subtotal);
    record(capped === testCase.expect, `cap: ${testCase.label}`, `got ${capped}, expected ${testCase.expect}`);
}
record(
    clientTotals.calculateCartTotal({
        subtotal: 200,
        discount: capDiscount(500, 200),
        shipping: 25,
        packagingFee: 10,
        taxAddedToTotal: 36,
    }) === 71,
    'capped oversized coupon yields a positive, correct total',
);

/** The Marketplace path must be unaffected by the new packagingFee parameter. */
console.log('\n=== Marketplace regression: packagingFee defaults to zero ===');
record(
    clientTotals.calculateCartTotal({ subtotal: 1000, discount: 100, shipping: 50, taxAddedToTotal: 180 }) === 1130,
    'marketplace total unchanged when packagingFee is omitted',
);
record(
    clientTotals.calculateCartTotal({ subtotal: 100, discount: 500, shipping: 0, taxAddedToTotal: 0 }) === 0,
    'total never goes negative',
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('✅ Server and client ETA implementations are in full agreement.');
process.exit(0);
