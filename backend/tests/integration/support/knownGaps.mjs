/**
 * The known-gap baseline — the mechanism that turns "Phase N is done" into an
 * objective, mechanical check instead of a judgement call.
 *
 * Every entry is a defect the audit found and a later roadmap phase will fix.
 * The assertion covering it is written NOW, in full, asserting correct
 * behaviour. It fails today. That failure is recorded here rather than
 * suppressed, which produces three distinct signals:
 *
 *   • a listed gap still failing  → expected; reported, does not break the build
 *   • an UNLISTED assertion failing → a regression; breaks the build
 *   • a listed gap now PASSING     → the fix landed; breaks the build until the
 *                                     entry is deleted from this file
 *
 * That third signal is the important one. It means a phase cannot be declared
 * complete while its entries remain, and cannot leave stale entries behind once
 * it is. Deleting from this file is the definition of done.
 *
 * Nothing may be added here without an audit ID and an owning phase. This is a
 * ledger of accepted debt, not a place to park inconvenient failures.
 *
 * Closed:
 *   SEC-1, SEC-2, SEC-3 — Phase 1 (settings security hotfix).
 */

/**
 * @typedef {object} KnownGap
 * @property {string} id       Audit identifier (SEC-1, FLOW-2, …)
 * @property {number} phase    Roadmap phase that removes this entry
 * @property {string} summary  What is wrong
 * @property {string} evidence Where it was verified in the audit
 */

/** @type {Record<string, KnownGap>} */
export const KNOWN_GAPS = {
    'DEAD-1': {
        id: 'DEAD-1',
        phase: 8,
        summary:
            'Seven exported frontend service functions call backend routes that do not exist. '
            + 'None is imported anywhere today, so there is no runtime impact, but each is a '
            + 'silent 404 waiting for its first caller.',
        evidence:
            'frontend/src/modules/Admin/services/adminService.js (getSettings, updateSettings, '
            + 'sendPushNotification, getPolicy, updatePolicy) and '
            + 'frontend/src/shared/services/supportApi.js (assignConversation, sendUserMessage)',
        /**
         * The exact dead paths. Anything unresolved and NOT on this list is a
         * new regression and fails the gate — pre-existing debt is tracked, new
         * debt is blocked.
         */
        allowedUnresolved: [
            'get /api/admin/settings',
            'put /api/admin/settings',
            'post /api/admin/notifications/push',
            'post /api/admin/notifications/message',
            'get /api/admin/policies/:param',
            'put /api/admin/policies/:param',
            'patch /api/support/conversations/:param/assign',
        ],
    },
};

/** @param {string} id */
export const isKnownGap = (id) => Object.hasOwn(KNOWN_GAPS, id);

/** @param {string} id */
export const getKnownGap = (id) => KNOWN_GAPS[id] ?? null;

/** Gap ids grouped by the phase that closes them. */
export const gapsByPhase = () => {
    const grouped = new Map();
    for (const gap of Object.values(KNOWN_GAPS)) {
        if (!grouped.has(gap.phase)) grouped.set(gap.phase, []);
        grouped.get(gap.phase).push(gap);
    }
    return new Map([...grouped.entries()].sort((a, b) => a[0] - b[0]));
};
