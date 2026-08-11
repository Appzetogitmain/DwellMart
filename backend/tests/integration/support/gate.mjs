/**
 * The release gate: assertions, result classification, and reporting.
 *
 * Assertions RECORD AND CONTINUE rather than throwing on first failure. This
 * matches the existing conformance harnesses in `backend/scripts/` and is the
 * right behaviour for a diagnostic gate: when a flow breaks you want the whole
 * picture — which of the twelve steps failed — not just the first one. An
 * exception-throwing assertion would hide every downstream finding behind the
 * earliest one.
 *
 * Classification exists because three outcomes are meaningfully different and
 * conflating them is what let a broken module ship behind passing tests:
 *
 *   PASS        the behaviour is correct
 *   KNOWN GAP   a listed defect still present — reported, not fatal
 *   FIXED GAP   a listed defect no longer reproduces — fatal until delisted
 *   FAIL        anything else — a regression, fatal
 */

import { getKnownGap } from './knownGaps.mjs';

const state = {
    passed: 0,
    failed: 0,
    suites: [],
    current: null,
    knownGaps: new Map(),
    fixedGaps: new Map(),
    failures: [],
};

/** Begin a named suite. Subsequent assertions are attributed to it. */
export const beginSuite = (name) => {
    state.current = { name, passed: 0, failed: 0, knownGaps: 0, lines: [] };
    state.suites.push(state.current);
    console.log(`\n─── ${name} ${'─'.repeat(Math.max(0, 66 - name.length))}`);
    return state.current;
};

const record = (ok, label, detail, kind = 'normal') => {
    const suite = state.current;
    const symbol = kind === 'gap' ? 'GAP ' : ok ? 'PASS' : 'FAIL';

    if (kind === 'gap') {
        if (suite) suite.knownGaps += 1;
        state.passed += 1;
        if (suite) suite.passed += 1;
    } else if (ok) {
        state.passed += 1;
        if (suite) suite.passed += 1;
    } else {
        state.failed += 1;
        if (suite) suite.failed += 1;
        state.failures.push({ suite: suite?.name ?? '(none)', label, detail });
    }

    const line = `  ${symbol} — ${label}${!ok && detail ? `\n         ${detail}` : ''}`;
    console.log(line);
    if (suite) suite.lines.push(line);
};

/**
 * A plain assertion. Any failure is a regression and fails the run.
 *
 * @param {boolean} condition
 * @param {string} label     what was verified, in behavioural terms
 * @param {string} [detail]  observed value, shown only on failure
 * @returns {boolean} the condition, so callers can branch on it
 */
export const check = (condition, label, detail = '') => {
    record(Boolean(condition), label, detail);
    return Boolean(condition);
};

/**
 * An assertion covering a defect the audit already found.
 *
 * Always asserts the CORRECT behaviour. While the defect is present the
 * assertion fails and is absorbed as a known gap; once fixed it passes, and
 * this then fails the run to force the baseline entry to be deleted.
 *
 * @param {string} gapId     key in KNOWN_GAPS
 * @param {boolean} condition the CORRECT behaviour
 * @param {string} label
 * @param {string} [detail]
 * @returns {boolean} whether the correct behaviour was observed
 */
export const checkKnownGap = (gapId, condition, label, detail = '') => {
    const gap = getKnownGap(gapId);

    if (!gap) {
        record(
            false,
            label,
            `checkKnownGap() referenced "${gapId}", which is not in the baseline. `
            + 'Add it to knownGaps.mjs with an audit id and owning phase, or use check().'
        );
        return Boolean(condition);
    }

    if (condition) {
        state.fixedGaps.set(gapId, { ...gap, label });
        record(
            false,
            label,
            `KNOWN GAP ${gapId} NO LONGER REPRODUCES — this now behaves correctly. `
            + `Delete the "${gapId}" entry from tests/integration/support/knownGaps.mjs `
            + `to close it out (owning phase ${gap.phase}).`
        );
        return true;
    }

    state.knownGaps.set(gapId, { ...gap, label, detail });
    record(true, `${label}  [known gap ${gapId}, phase ${gap.phase}]`, detail, 'gap');
    return false;
};

/** Render an HTTP result for a failure message. */
const describe = (result) =>
    `HTTP ${result?.status} "${result?.message ?? ''}"`
    + (result?.body?.errors ? ` errors=${JSON.stringify(result.body.errors)}` : '');

/**
 * Assert an HTTP status, reporting the server's own message on failure —
 * that message is almost always the explanation, and omitting it wastes a
 * debugging cycle.
 */
export const checkStatus = (result, expectedStatus, label) => {
    const statuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    return check(statuses.includes(result?.status), label, describe(result));
};

/** `checkStatus` for a behaviour recorded in the baseline. */
export const checkStatusKnownGap = (gapId, result, expectedStatus, label) => {
    const statuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    return checkKnownGap(gapId, statuses.includes(result?.status), label, describe(result));
};

/**
 * Record a step that could not run because an earlier step failed.
 *
 * Counted as a failure — a lifecycle that cannot reach its end has not been
 * verified, and silently skipping would let a broken flow report green.
 */
export const blocked = (label, reason) => {
    record(false, label, `BLOCKED: ${reason}`);
};

/**
 * Record a step that could not run because a TRACKED gap blocked it.
 *
 * Distinct from `blocked()`: the cause is already known and owned by a phase,
 * so this is not a regression. It is still printed, because a lifecycle that
 * cannot reach its end has not been verified and that must stay visible.
 */
export const blockedByGap = (gapId, label, reason) => {
    const gap = getKnownGap(gapId);
    if (!gap) {
        record(false, label, `blockedByGap() referenced unknown gap "${gapId}".`);
        return;
    }
    record(true, `${label}  [blocked by ${gapId}, phase ${gap.phase}]`, reason, 'gap');
};

export const getResults = () => ({
    passed: state.passed,
    failed: state.failed,
    suites: state.suites.map((s) => ({ ...s })),
    knownGaps: [...state.knownGaps.values()],
    fixedGaps: [...state.fixedGaps.values()],
    failures: [...state.failures],
});

export const resetResults = () => {
    state.passed = 0;
    state.failed = 0;
    state.suites.length = 0;
    state.current = null;
    state.knownGaps.clear();
    state.fixedGaps.clear();
    state.failures.length = 0;
};

/**
 * Render the summary.
 * @returns {{ text: string, exitCode: number }} exit code 0 only when no
 *   regression and no fixed-but-still-listed gap remains.
 */
export const renderSummary = () => {
    const snapshot = getResults();
    const regressions = snapshot.failures.filter(
        (f) => !f.detail?.includes('NO LONGER REPRODUCES')
    );
    const lines = [];

    lines.push('');
    lines.push('═'.repeat(74));
    lines.push('  DwellMart Integration Release Gate');
    lines.push('═'.repeat(74));

    for (const suite of snapshot.suites) {
        const bits = [`${suite.passed} passed`];
        if (suite.knownGaps > 0) bits.push(`${suite.knownGaps} known gaps`);
        if (suite.failed > 0) bits.push(`${suite.failed} FAILED`);
        lines.push(`  ${suite.name.padEnd(44)} ${bits.join(', ')}`);
    }

    lines.push('─'.repeat(74));
    lines.push(`  Assertions passed : ${snapshot.passed}`);
    lines.push(`  Regressions       : ${regressions.length}`);
    lines.push(`  Known gaps        : ${snapshot.knownGaps.length} (expected — tracked, not fatal)`);
    lines.push(`  Gaps now fixed    : ${snapshot.fixedGaps.length} (delist required)`);

    if (snapshot.knownGaps.length > 0) {
        lines.push('');
        lines.push('  Known gaps still present, by owning phase:');
        const byPhase = new Map();
        for (const gap of snapshot.knownGaps) {
            if (!byPhase.has(gap.phase)) byPhase.set(gap.phase, []);
            byPhase.get(gap.phase).push(gap);
        }
        for (const [phase, gaps] of [...byPhase.entries()].sort((a, b) => a[0] - b[0])) {
            lines.push(`    Phase ${phase}`);
            for (const gap of gaps) lines.push(`      • ${gap.id} — ${gap.summary.split('.')[0]}.`);
        }
    }

    if (snapshot.fixedGaps.length > 0) {
        lines.push('');
        lines.push('  These known gaps no longer reproduce — delete them from knownGaps.mjs:');
        for (const gap of snapshot.fixedGaps) {
            lines.push(`      • ${gap.id} (phase ${gap.phase}) — ${gap.label}`);
        }
    }

    if (regressions.length > 0) {
        lines.push('');
        lines.push('  REGRESSIONS — these must be fixed before release:');
        for (const failure of regressions) {
            lines.push(`      • [${failure.suite}] ${failure.label}`);
            if (failure.detail) lines.push(`        ${failure.detail}`);
        }
    }

    const exitCode = regressions.length > 0 || snapshot.fixedGaps.length > 0 ? 1 : 0;

    lines.push('═'.repeat(74));
    lines.push(
        exitCode === 0
            ? '  GATE PASSED — no regressions. Known gaps are tracked and expected.'
            : '  GATE FAILED — see above.'
    );
    lines.push('═'.repeat(74));
    lines.push('');

    return { text: lines.join('\n'), exitCode };
};
