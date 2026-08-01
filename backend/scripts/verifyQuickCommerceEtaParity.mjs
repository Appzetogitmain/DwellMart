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
const { ETA_FIXTURES } = await load('../src/services/quickCommerceEta.fixtures.js');
const client = await load('../../frontend/src/shared/utils/quickCommerceEta.js');

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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('✅ Server and client ETA implementations are in full agreement.');
process.exit(0);
