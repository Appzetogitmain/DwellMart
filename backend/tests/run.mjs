/**
 * DwellMart — Complete Automated Release Test Suite Runner
 * 
 * Executes all critical release test suites in sequence and prints a consolidated summary report.
 * 
 * Usage:
 *   node tests/run.mjs
 */

import { execSync } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Production-database guard.
 *
 * Every suite below connects using `MONGO_URI`, and sibling scripts in this
 * directory mutate real data — `advance_escrow_period.js` back-dates financial
 * records. In this repository `MONGO_URI` has pointed at a live Atlas cluster,
 * which is why the suite was unsafe to run and therefore never run.
 *
 * Refuse rather than risk it. Set `ALLOW_TESTS_AGAINST_THIS_DB=yes` to override
 * deliberately, and prefer `npm run test:unit`, which needs no database at all.
 */
const mongoUri = String(process.env.MONGO_URI || '');
const looksLikeProduction =
    /mongodb\+srv:\/\//i.test(mongoUri) ||
    /(prod|production|live)/i.test(mongoUri);
const isLocal = /(localhost|127\.0\.0\.1|mongodb:\/\/mongo)/i.test(mongoUri);

if (!mongoUri) {
    console.error('\nRefusing to run integration tests without an explicit MONGO_URI.');
    console.error('Use an isolated local test database; these suites create and delete records.\n');
    process.exit(1);
}

if (!isLocal
    && process.env.ALLOW_TESTS_AGAINST_THIS_DB !== 'yes') {
    console.error('\n✗ Refusing to run integration tests against a remote/production-looking database.');
    console.error('  MONGO_URI points at a hosted cluster. These suites write and delete real records.');
    console.error('  Use a local database, or set ALLOW_TESTS_AGAINST_THIS_DB=yes if you are certain.\n');
    console.error('  For safe, database-free checks: npm run test:unit\n');
    process.exit(1);
}

const testSuites = [
    { name: 'P0-01: Server-Side Price Authority', file: 'tests/p0_01_price_tampering_security.test.js' },
    { name: 'P0-04: Payment & Webhook Concurrency Race', file: 'tests/p0_04_payment_order_race.test.js' },
    { name: 'P0-06: Payment Authorization & Session Ownership', file: 'tests/p0_06_payment_authorization.test.js' },
    { name: 'P1-01: Expired Reservation Stock Recovery', file: 'tests/p1_01_expired_reservation.test.js' },
    { name: 'Experience Isolation (Marketplace / Express / B2B)', file: 'tests/verify_experience_isolation.js' },
    { name: 'Delivery COD Settlement & Cash Ledger', file: 'tests/verify_delivery_cod_settlement.js' },
    { name: 'Rider Earnings Wallet & Payout Ledger', file: 'tests/rider_wallet_e2e.test.js' },
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
