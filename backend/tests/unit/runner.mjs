/**
 * Database-free unit suite.
 *
 * The existing suites under `tests/` all connect to `MONGO_URI`, which in this
 * repository may point at production — and several sibling scripts mutate real
 * data. That made the whole suite unsafe to run, so in practice it was not run,
 * and every defect the audit found shipped unnoticed.
 *
 * Everything here executes against pure functions and Mongoose schema
 * definitions only. It touches no database, so it is safe in CI and on a laptop.
 *
 * Run: npm run test:unit
 */

let passed = 0;
let failed = 0;
const failures = [];

export const ok = (label, condition) => {
    if (condition) {
        passed += 1;
        console.log(`  ✓ ${label}`);
    } else {
        failed += 1;
        failures.push(label);
        console.log(`  ✗ ${label}`);
    }
};

export const equal = (label, actual, expected) => {
    const same = JSON.stringify(actual) === JSON.stringify(expected);
    if (!same) {
        ok(`${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`, false);
        return;
    }
    ok(label, true);
};

export const throwsAsync = async (label, fn, expectedFragment) => {
    try {
        await fn();
        ok(`${label} — DID NOT THROW`, false);
    } catch (err) {
        const matched = String(err?.message || '')
            .toLowerCase()
            .includes(String(expectedFragment).toLowerCase());
        ok(matched ? label : `${label} — wrong error: ${err?.message}`, matched);
    }
};

export const section = (name) => console.log(`\n▸ ${name}`);

export const summary = () => {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`${passed} passed, ${failed} failed`);
    if (failures.length > 0) {
        console.log('\nFailures:');
        failures.forEach((f) => console.log(`  • ${f}`));
    }
    console.log(`${'─'.repeat(60)}\n`);
    return failed === 0;
};
