/**
 * DwellMart — Complete Automated Release Test Suite Runner
 * 
 * Executes all critical release test suites in sequence and prints a consolidated summary report.
 * 
 * Usage:
 *   node tests/run.mjs
 */

import { execSync } from 'child_process';

const testSuites = [
    { name: 'P0-01: Server-Side Price Authority', file: 'tests/p0_01_price_tampering_security.test.js' },
    { name: 'P0-04: Payment & Webhook Concurrency Race', file: 'tests/p0_04_payment_order_race.test.js' },
    { name: 'P0-06: Payment Authorization & Session Ownership', file: 'tests/p0_06_payment_authorization.test.js' },
    { name: 'P1-01: Expired Reservation Stock Recovery', file: 'tests/p1_01_expired_reservation.test.js' },
    { name: 'Experience Isolation (Marketplace / Express / B2B)', file: 'tests/verify_experience_isolation.js' },
    { name: 'Delivery COD Settlement & Cash Ledger', file: 'tests/verify_delivery_cod_settlement.js' },
    { name: 'Sub-Admin RBAC & Permission Management', file: 'tests/subadmin_permissions.test.js' },
    { name: 'Support Chat & Ticket Lifecycle', file: 'tests/support.test.js' },
    { name: 'Bulk Product Upload & Catalog Export', file: 'tests/bulk_upload_comprehensive.test.js' },
];

console.log('======================================================================');
console.log('🚀 DWELLMART — AUTOMATED RELEASE SUITE RUNNER');
console.log('======================================================================\n');

let passedCount = 0;
let failedCount = 0;
const results = [];

for (const suite of testSuites) {
    console.log(`▶ Running: ${suite.name} (${suite.file})...`);
    try {
        const output = execSync(`node ${suite.file}`, { encoding: 'utf8', stdio: 'pipe', cwd: process.cwd() });
        console.log(`  ✅ [PASSED] ${suite.name}`);
        results.push({ name: suite.name, status: 'PASSED', output });
        passedCount++;
    } catch (err) {
        console.error(`  ❌ [FAILED] ${suite.name}`);
        console.error(err.stdout || err.message);
        results.push({ name: suite.name, status: 'FAILED', error: err.message });
        failedCount++;
    }
}

console.log('\n======================================================================');
console.log('📋 RELEASE SUITE EXECUTION SUMMARY');
console.log('======================================================================');
console.log(`Total Suites Run : ${testSuites.length}`);
console.log(`Passed Suites     : ${passedCount}`);
console.log(`Failed Suites     : ${failedCount}`);
console.log('======================================================================');

if (failedCount === 0) {
    console.log('🎉 ALL SUITES PASSED PERFECTLY! RELEASE GATE IS GREEN 🟢\n');
    process.exit(0);
} else {
    console.error(`⚠️ ${failedCount} SUITE(S) FAILED. CHECK LOGS ABOVE 🔴\n`);
    process.exit(1);
}
