/**
 * Pricing Engine Conformance & Parity Verification
 *
 * Runs the shared fixture against BOTH pricing implementations:
 *   1. backend/src/services/pricingEngine.service.js   (authoritative)
 *   2. frontend/src/shared/utils/resolvePriceForQuantity.js (preview mirror)
 *
 * Fails if either engine deviates from the fixture, or if the two engines
 * disagree with each other on ANY field — the guard that keeps the preview
 * layer honest against the source of truth.
 *
 * Usage: node backend/scripts/verifyPricingEngineParity.mjs
 */

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverEnginePath = path.resolve(__dirname, '../src/services/pricingEngine.service.js');
const fixturesPath = path.resolve(__dirname, '../src/services/pricingEngine.fixtures.js');
const clientEnginePath = path.resolve(
    __dirname,
    '../../frontend/src/shared/utils/resolvePriceForQuantity.js'
);

const [serverEngine, fixturesModule, clientEngine] = await Promise.all([
    import(pathToFileURL(serverEnginePath).href),
    import(pathToFileURL(fixturesPath).href),
    import(pathToFileURL(clientEnginePath).href),
]);

const { PRICING_FIXTURES } = fixturesModule;
const serverResolve = serverEngine.resolvePriceForQuantity;
const clientResolve = clientEngine.resolvePriceForQuantity;

let passed = 0;
let failed = 0;
const failures = [];

const record = (ok, label, detail) => {
    if (ok) {
        passed += 1;
    } else {
        failed += 1;
        failures.push(`${label}\n    ${detail}`);
    }
    console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}${ok ? '' : `\n    ${detail}`}`);
};

console.log('=== Fixture conformance: SERVER engine (authoritative) ===');
for (const fixture of PRICING_FIXTURES) {
    const result = serverResolve(fixture.product, fixture.basePrice, fixture.quantity, fixture.options || {});
    const mismatches = Object.entries(fixture.expect)
        .filter(([key, expected]) => JSON.stringify(result[key]) !== JSON.stringify(expected))
        .map(([key, expected]) => `${key}: got ${JSON.stringify(result[key])}, expected ${JSON.stringify(expected)}`);
    record(mismatches.length === 0, `server: ${fixture.label}`, mismatches.join('; '));
}

console.log('\n=== Fixture conformance: CLIENT engine (preview mirror) ===');
for (const fixture of PRICING_FIXTURES) {
    const result = clientResolve(fixture.product, fixture.basePrice, fixture.quantity, fixture.options || {});
    const mismatches = Object.entries(fixture.expect)
        .filter(([key, expected]) => JSON.stringify(result[key]) !== JSON.stringify(expected))
        .map(([key, expected]) => `${key}: got ${JSON.stringify(result[key])}, expected ${JSON.stringify(expected)}`);
    record(mismatches.length === 0, `client: ${fixture.label}`, mismatches.join('; '));
}

console.log('\n=== Cross-engine parity (every field must match exactly) ===');
for (const fixture of PRICING_FIXTURES) {
    const serverResult = serverResolve(fixture.product, fixture.basePrice, fixture.quantity, fixture.options || {});
    const clientResult = clientResolve(fixture.product, fixture.basePrice, fixture.quantity, fixture.options || {});
    const serverJson = JSON.stringify(serverResult, Object.keys(serverResult).sort());
    const clientJson = JSON.stringify(clientResult, Object.keys(serverResult).sort());
    record(
        serverJson === clientJson,
        `parity: ${fixture.label}`,
        `server=${serverJson}\n    client=${clientJson}`
    );
}

console.log('\n=== Randomized differential fuzz (500 cases) ===');
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
let fuzzMismatches = 0;
for (let i = 0; i < 500; i += 1) {
    const tierCount = randomInt(0, 5);
    const tiers = [];
    let qty = randomInt(1, 30);
    for (let t = 0; t < tierCount; t += 1) {
        qty += randomInt(1, 25);
        tiers.push({ minQty: qty, price: randomInt(1, 999) });
    }
    const product = {
        retailEnabled: Math.random() > 0.3,
        wholesaleEnabled: Math.random() > 0.2,
        wholesale: {
            moqEnabled: Math.random() > 0.5,
            moq: randomInt(1, 60),
            priceTiers: tiers,
        },
    };
    // Guarantee at least one channel is on, matching the schema invariant.
    if (!product.retailEnabled && !product.wholesaleEnabled) product.retailEnabled = true;

    const basePrice = randomInt(1, 2000);
    const quantity = randomInt(0, 200);
    const options = { vendorWholesaleEnabled: Math.random() > 0.2 };

    const s = serverResolve(product, basePrice, quantity, options);
    const c = clientResolve(product, basePrice, quantity, options);
    if (JSON.stringify(s) !== JSON.stringify(c)) {
        fuzzMismatches += 1;
        if (fuzzMismatches <= 3) {
            console.log(`FAIL — fuzz case ${i}\n    input=${JSON.stringify({ product, basePrice, quantity, options })}\n    server=${JSON.stringify(s)}\n    client=${JSON.stringify(c)}`);
        }
    }
}
record(fuzzMismatches === 0, `fuzz: 500 randomized cases identical`, `${fuzzMismatches} mismatches`);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
    console.log('\nFailures:\n' + failures.join('\n'));
    process.exit(1);
}
console.log('✅ Server and client pricing engines are in full agreement.');
process.exit(0);
