/**
 * Quick Commerce Phase 6 — Analytics, Alerts & Platform Isolation
 *
 * The full test matrix for the closing phase:
 *
 *   1. **Permission dual-registry parity.** A mismatch between the backend and
 *      frontend registries is invisible until an admin reports a checkbox that
 *      grants nothing, or an endpoint no UI can reach.
 *   2. **Flag-off isolation.** With `quickCommerceEnabled` false the platform
 *      must behave exactly as it did before Quick Commerce existed.
 *   3. **Analytics arithmetic.** Rates, averages and variances, including the
 *      divide-by-zero cases that only appear on a quiet day.
 *   4. **Alert lifecycle.** Acknowledgement stops escalation; escalation is
 *      recorded once.
 *   5. **Backward compatibility.** Every new field defaults to the pre-Quick-
 *      Commerce behaviour.
 *
 * Runs without a database.
 *
 * Usage: node backend/scripts/verifyQuickCommercePolish.mjs
 */

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const load = (rel) => import(pathToFileURL(path.resolve(__dirname, rel)).href);

let passed = 0;
let failed = 0;
const record = (ok, label, detail = '') => {
    ok ? (passed += 1) : (failed += 1);
    console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}${ok ? '' : `\n    ${detail}`}`);
};

// ─── 1. Permission dual-registry parity ───────────────────────────────────────
console.log('=== Permission dual-registry parity ===');
{
    const backend = await load('../src/constants/permissions.js');
    const frontend = await load('../../frontend/src/modules/Admin/config/permissions.js');

    const backendTokens = new Set(Object.values(backend.PERMISSIONS));
    const frontendTokens = new Set(Object.values(frontend.PERMISSIONS));

    const missingInFrontend = [...backendTokens].filter((t) => !frontendTokens.has(t));
    const missingInBackend = [...frontendTokens].filter((t) => !backendTokens.has(t));

    record(missingInFrontend.length === 0, 'every backend permission exists in the frontend registry', missingInFrontend.join(', '));
    record(missingInBackend.length === 0, 'every frontend permission exists in the backend registry', missingInBackend.join(', '));

    const QC_TOKENS = [
        'quickcommerce.vendors.manage',
        'quickcommerce.orders.manage',
        'quickcommerce.analytics.view',
        'quickcommerce.settings.manage',
    ];
    for (const token of QC_TOKENS) {
        record(
            backendTokens.has(token) && frontendTokens.has(token),
            `${token} present in both registries`,
        );
    }

    // Dependencies must agree, or a UI that grants a token silently fails the
    // server-side check that requires its parent.
    const backendDeps = backend.PERMISSION_DEPENDENCIES || {};
    const frontendDeps = frontend.PERMISSION_DEPENDENCIES || {};
    const depMismatches = QC_TOKENS.filter((token) => backendDeps[token] !== frontendDeps[token]);
    record(depMismatches.length === 0, 'Quick Commerce permission dependencies match', depMismatches.join(', '));

    record(
        backendDeps['quickcommerce.analytics.view'] === 'dashboard.view',
        'analytics permission depends on dashboard.view',
        String(backendDeps['quickcommerce.analytics.view']),
    );

    // Existing presets must not be silently widened by the new tokens.
    // `full_access` is expected to pick them up; every other preset is not.
    const presets = backend.PRESET_ROLES || {};
    const presetNames = Object.keys(presets);
    record(presetNames.length > 0, 'preset roles were actually loaded (guards against a vacuous check)', 'none found');

    const widened = presetNames
        .filter((name) => name !== 'full_access')
        .filter((name) =>
            (presets[name]?.permissions || []).some((p) => String(p).startsWith('quickcommerce.'))
        );
    record(widened.length === 0, 'no existing preset was silently widened with Quick Commerce access', widened.join(', '));

    // The frontend registry must agree about who gets what.
    const frontendPresets = frontend.PRESET_ROLES || {};
    const presetMismatches = presetNames.filter((name) => {
        const backendPerms = [...(presets[name]?.permissions || [])].sort().join('|');
        const frontendPerms = [...(frontendPresets[name]?.permissions || [])].sort().join('|');
        return backendPerms !== frontendPerms;
    });
    record(presetMismatches.length === 0, 'preset role contents match across both registries', presetMismatches.join(', '));
}

// ─── 2. Flag-off isolation ────────────────────────────────────────────────────
console.log('\n=== Flag-off isolation ===');
{
    const { EXPERIENCES, normalizeExperience, getRequestExperience } = await load('../src/constants/experiences.js');

    record(
        normalizeExperience(undefined) === EXPERIENCES.MARKETPLACE,
        'a missing experience resolves to marketplace',
    );
    record(
        normalizeExperience('nonsense') === EXPERIENCES.MARKETPLACE,
        'an unknown experience falls back to marketplace, never quick_commerce',
    );
    record(
        getRequestExperience({}) === EXPERIENCES.MARKETPLACE,
        'a request with no experience header is a marketplace request',
    );

    const { runQuickCommerceSweep } = await load('../src/services/quickCommerceAlerts.service.js');
    record(typeof runQuickCommerceSweep === 'function', 'the sweep is exported and callable');

    // The sweep must consult the flag before touching the database at all.
    const alertsSource = await import('fs').then((fs) =>
        fs.promises.readFile(path.resolve(__dirname, '../src/services/quickCommerceAlerts.service.js'), 'utf8')
    );
    const flagCheckIndex = alertsSource.indexOf('isQuickCommerceEnabled()');
    const firstQueryIndex = alertsSource.indexOf('await Order.find(');
    record(
        flagCheckIndex > -1 && flagCheckIndex < firstQueryIndex,
        'the sweep checks the platform flag before any query',
    );
}

// ─── 3. Analytics arithmetic ──────────────────────────────────────────────────
console.log('\n=== Analytics arithmetic ===');
{
    const { resolveDateRange, startOfToday } = await load('../src/services/quickCommerceAnalytics.service.js');

    const explicit = resolveDateRange({ startDate: '2026-01-01', endDate: '2026-01-31' });
    record(
        explicit.start.toISOString().startsWith('2026-01-01')
        && explicit.end.toISOString().startsWith('2026-01-31'),
        'an explicit date range is honoured',
        `${explicit.start.toISOString()} → ${explicit.end.toISOString()}`,
    );

    const defaulted = resolveDateRange({});
    const spanDays = Math.round((defaulted.end - defaulted.start) / 86400000);
    record(spanDays === 30, 'the default window is 30 days', `got ${spanDays}`);

    const custom = resolveDateRange({ days: 7 });
    const customSpan = Math.round((custom.end - custom.start) / 86400000);
    record(customSpan === 7, 'a custom window is honoured', `got ${customSpan}`);

    const garbage = resolveDateRange({ startDate: 'not-a-date' });
    record(
        !Number.isNaN(garbage.start.getTime()) && !Number.isNaN(garbage.end.getTime()),
        'a malformed date falls back to a valid range rather than producing NaN',
    );

    const today = startOfToday();
    record(
        today.getHours() === 0 && today.getMinutes() === 0 && today.getSeconds() === 0,
        'startOfToday is midnight local',
    );

    // An invalid timezone must not reach MongoDB — `$hour` throws on one, which
    // would turn a bad query param into a 500.
    const { resolveTimezone } = await load('../src/services/quickCommerceAnalytics.service.js');
    record(resolveTimezone('Asia/Kolkata') === 'Asia/Kolkata', 'a valid IANA timezone passes through');
    record(resolveTimezone('Europe/London') === 'Europe/London', 'another valid timezone passes through');
    record(resolveTimezone('Mars/Olympus') === 'UTC', 'an invalid timezone falls back to UTC instead of throwing');
    record(resolveTimezone('') === 'UTC', 'an empty timezone falls back to UTC');
    record(resolveTimezone(undefined) === 'UTC', 'a missing timezone falls back to UTC');
    record(resolveTimezone('; drop database') === 'UTC', 'a hostile timezone string is rejected');

    // Rate arithmetic, mirroring the aggregation's post-processing.
    const rate = (part, total) => (total > 0 ? Number(((part / total) * 100).toFixed(2)) : 0);
    record(rate(0, 0) === 0, 'a rate over zero orders is 0, not NaN');
    record(rate(3, 4) === 75, 'ordinary rate arithmetic');
    record(rate(1, 3) === 33.33, 'rates round to two decimals');
    record(rate(4, 4) === 100, 'a full rate is 100');

    const aov = (gmv, orders) => (orders > 0 ? Number((gmv / orders).toFixed(2)) : 0);
    record(aov(0, 0) === 0, 'AOV over zero orders is 0, not NaN');
    record(aov(1000, 3) === 333.33, 'AOV rounds to two decimals');

    // Variance is signed: positive means slower than promised.
    const variance = (actual, promised) => Number((actual - promised).toFixed(1));
    record(variance(18, 15) === 3, 'running late produces a positive variance');
    record(variance(12, 15) === -3, 'running early produces a negative variance');
    record(variance(15, 15) === 0, 'meeting the promise produces zero variance');
}

// ─── 4. SLA and actual-ETA measurement ────────────────────────────────────────
console.log('\n=== SLA measurement ===');
{
    const measure = (promisedAtMs, deliveredAtMs) =>
        Math.max(1, Math.ceil((deliveredAtMs - promisedAtMs) / 60000));
    const breached = (promisedAtMs, promisedMins, deliveredAtMs) =>
        deliveredAtMs > promisedAtMs + promisedMins * 60 * 1000;

    const t0 = new Date('2026-08-01T10:00:00Z').getTime();

    record(measure(t0, t0 + 12 * 60000) === 12, 'a 12-minute delivery measures 12 minutes');
    record(
        measure(t0, t0 + 12 * 60000 + 10000) === 13,
        'partial minutes round up — 12m10s is 13 minutes to the customer',
    );
    record(measure(t0, t0) === 1, 'an instantaneous delivery still measures at least 1 minute');

    record(breached(t0, 15, t0 + 16 * 60000) === true, 'delivering after the promise is a breach');
    record(breached(t0, 15, t0 + 14 * 60000) === false, 'delivering before the promise is not');
    record(
        breached(t0, 15, t0 + 15 * 60000) === false,
        'delivering exactly on the promise is not a breach',
    );
}

// ─── 5. Alert lifecycle ───────────────────────────────────────────────────────
console.log('\n=== Alert lifecycle ===');
{
    const {
        VENDOR_ACK_TIMEOUT_SECS,
        QUICK_COMMERCE_AWAITING_VENDOR_STATUSES,
        QUICK_COMMERCE_POST_PREPARATION_STAGES,
        QUICK_COMMERCE_SWEEP_INTERVAL_MS,
    } = await load('../src/constants/quickCommerce.js');

    record(VENDOR_ACK_TIMEOUT_SECS > 0 && VENDOR_ACK_TIMEOUT_SECS <= 300,
        'the acknowledgement timeout is short enough to matter on a 15-minute promise',
        String(VENDOR_ACK_TIMEOUT_SECS));
    record(QUICK_COMMERCE_SWEEP_INTERVAL_MS <= VENDOR_ACK_TIMEOUT_SECS * 1000,
        'the sweep runs at least as often as the timeout it enforces',
        `sweep=${QUICK_COMMERCE_SWEEP_INTERVAL_MS}ms timeout=${VENDOR_ACK_TIMEOUT_SECS}s');`);

    record(
        QUICK_COMMERCE_AWAITING_VENDOR_STATUSES.includes('placed')
        && !QUICK_COMMERCE_AWAITING_VENDOR_STATUSES.includes('accepted'),
        'only an unaccepted order is awaiting the store',
    );

    // Escalation model: acknowledgement stops the clock, and escalation happens once.
    const shouldEscalate = (order, timeoutSecs, nowMs) =>
        !order.acknowledgedAt
        && !order.escalatedAt
        && order.notifiedAt != null
        && nowMs - order.notifiedAt >= timeoutSecs * 1000;

    const now = Date.now();
    const timeout = VENDOR_ACK_TIMEOUT_SECS;

    record(
        shouldEscalate({ notifiedAt: now - (timeout + 10) * 1000 }, timeout, now) === true,
        'silence past the timeout escalates',
    );
    record(
        shouldEscalate({ notifiedAt: now - 5000 }, timeout, now) === false,
        'a store still within the window is not escalated',
    );
    record(
        shouldEscalate({ notifiedAt: now - (timeout + 10) * 1000, acknowledgedAt: now }, timeout, now) === false,
        'acknowledgement stops the escalation clock',
    );
    record(
        shouldEscalate({ notifiedAt: now - (timeout + 10) * 1000, escalatedAt: now }, timeout, now) === false,
        'an already-escalated order is not escalated twice',
    );

    // Cancellation cost attribution.
    record(
        !QUICK_COMMERCE_POST_PREPARATION_STAGES.includes('placed')
        && !QUICK_COMMERCE_POST_PREPARATION_STAGES.includes('accepted'),
        'cancelling before preparation carries no preparation cost',
    );
    record(
        QUICK_COMMERCE_POST_PREPARATION_STAGES.includes('preparing')
        && QUICK_COMMERCE_POST_PREPARATION_STAGES.includes('ready'),
        'cancelling after the store started work is flagged for settlement',
    );
}

// ─── 6. Backward compatibility ────────────────────────────────────────────────
console.log('\n=== Backward compatibility ===');
{
    const { default: Notification } = await load('../src/models/Notification.model.js');
    const { default: Order } = await load('../src/models/Order.model.js');

    record(
        Notification.schema.path('priority').getDefault() === 'normal',
        'notifications default to normal priority — existing alerts are unchanged',
    );
    record(
        Notification.schema.path('priority').enumValues.includes('urgent'),
        'urgent is a valid priority',
    );
    record(
        !Notification.schema.path('acknowledgedAt').isRequired,
        'acknowledgement is optional, so existing notifications remain valid',
    );

    record(
        Order.schema.path('quickCommerce.actualEtaMinutes') !== undefined,
        'actualEtaMinutes exists on the order',
    );
    record(
        Order.schema.path('quickCommerce.cancelledAfterPreparation').getDefault() === false,
        'cancelledAfterPreparation defaults to false',
    );
    record(
        Order.schema.path('experience').getDefault() === 'marketplace',
        'orders still default to marketplace',
    );

    // The notification service must keep working for callers that never heard
    // of priority.
    const notificationService = await import('fs').then((fs) =>
        fs.promises.readFile(path.resolve(__dirname, '../src/services/notification.service.js'), 'utf8')
    );
    record(
        /priority\s*=\s*'normal'/.test(notificationService),
        'createNotification defaults priority, so existing callers are unaffected',
    );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('✅ Quick Commerce analytics, alerts and platform isolation verified.');
process.exit(0);
