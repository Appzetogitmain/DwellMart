/**
 * Vendor channel transitions — the ONE place a channel status may change.
 *
 * Before this module, four separate paths mutated `vendor.channels[*]`:
 *   - admin per-channel endpoint (validated transitions)
 *   - admin account approval     (wrote 'active' directly, no validation)
 *   - admin Quick Commerce toggle
 *   - vendor apply / withdraw / legacy selling-channels endpoint
 *     (wrote 'requested' directly, no validation)
 *
 * Because only the first consulted `canTransitionVendorChannel`, the documented
 * state machine was advisory. `disabled` is declared terminal, yet a vendor
 * could re-queue an admin-disabled channel, and account approval could raise a
 * rejected channel straight to active.
 *
 * Every caller now goes through `applyChannelTransition`, which enforces the
 * transition table, records who did it and why, and bumps `channelsRevision`
 * exactly once per change.
 */

import ApiError from '../utils/ApiError.js';
import {
    VendorChannelStatuses,
    canTransitionVendorChannel,
    normalizeVendorChannel,
    vendorChannelPath,
} from '../constants/vendorChannels.js';

const TIMESTAMP_FIELD = Object.freeze({
    [VendorChannelStatuses.REQUESTED]: 'requestedAt',
    [VendorChannelStatuses.ACTIVE]: 'activatedAt',
    [VendorChannelStatuses.PAUSED]: 'pausedAt',
    [VendorChannelStatuses.REJECTED]: 'rejectedAt',
    [VendorChannelStatuses.DISABLED]: 'disabledAt',
});

/**
 * Re-application after a terminal decision.
 *
 * `disabled` and `rejected` have no outgoing transition in the state table —
 * the channel is closed. Re-applying is nonetheless legitimate business
 * behaviour, so it is modelled explicitly as a REOPEN rather than smuggled in
 * by skipping validation. Only a vendor-initiated request may reopen, and only
 * to `requested` — never straight to `active`.
 */
const REOPENABLE_FROM = Object.freeze([
    VendorChannelStatuses.DISABLED,
    VendorChannelStatuses.REJECTED,
]);

export const canReopenChannel = (from, to, actor) =>
    actor === 'vendor'
    && to === VendorChannelStatuses.REQUESTED
    && REOPENABLE_FROM.includes(from);

const transitionError = (message, code, status = 409) => {
    const error = new ApiError(status, message);
    error.errorCode = code;
    error.code = code;
    return error;
};

/**
 * Apply a channel status transition to a vendor document (not saved here).
 *
 * @param {object} vendor            Mongoose vendor document
 * @param {string} channel           canonical channel value
 * @param {string} nextStatus        target status
 * @param {object} options
 * @param {'vendor'|'admin'|'migration'} options.actor
 * @param {string} [options.actorId] admin id, recorded as reviewedBy
 * @param {string} [options.reason]
 * @param {boolean} [options.allowNoop=false] return silently if already there
 * @returns {{channel: string, previousStatus: string, status: string, changed: boolean}}
 */
export const applyChannelTransition = (vendor, channel, nextStatus, {
    actor = 'admin',
    actorId = null,
    reason = '',
    allowNoop = false,
} = {}) => {
    const normalizedChannel = normalizeVendorChannel(channel);
    const path = vendorChannelPath(normalizedChannel);
    if (!path) throw transitionError('Invalid vendor channel.', 'INVALID_CHANNEL', 400);

    if (!Object.values(VendorChannelStatuses).includes(nextStatus)) {
        throw transitionError(`Invalid channel status: ${nextStatus}.`, 'INVALID_CHANNEL_STATUS', 400);
    }

    const current = vendor.channels?.[path]?.status || VendorChannelStatuses.DISABLED;

    if (current === nextStatus) {
        if (allowNoop) {
            return { channel: normalizedChannel, previousStatus: current, status: nextStatus, changed: false };
        }
        throw transitionError(`Channel is already ${current}.`, 'CHANNEL_ALREADY_IN_STATE');
    }

    // A vendor may never grant itself operational access.
    if (actor === 'vendor'
        && ![VendorChannelStatuses.REQUESTED, VendorChannelStatuses.DISABLED].includes(nextStatus)) {
        throw transitionError(
            'A vendor may only request or withdraw a channel. Activation is an admin decision.',
            'VENDOR_CANNOT_SELF_ACTIVATE',
            403
        );
    }

    const legal = canTransitionVendorChannel(current, nextStatus)
        || canReopenChannel(current, nextStatus, actor);
    if (!legal) {
        throw transitionError(
            `Invalid channel transition: ${current} -> ${nextStatus}.`,
            'INVALID_CHANNEL_TRANSITION'
        );
    }

    const now = new Date();
    const existing = vendor.channels?.[path]?.toObject?.() || { ...(vendor.channels?.[path] || {}) };
    const next = {
        ...existing,
        status: nextStatus,
        [TIMESTAMP_FIELD[nextStatus]]: now,
        reason: reason || '',
    };

    if (actor === 'vendor' && nextStatus === VendorChannelStatuses.REQUESTED) {
        next.requestedBy = 'vendor';
        // A fresh application supersedes the previous review.
        next.reviewedAt = null;
        next.reviewedBy = null;
    } else if (actor === 'admin') {
        next.reviewedAt = now;
        next.reviewedBy = actorId ?? null;
    } else if (actor === 'migration') {
        next.requestedBy = 'migration';
    }

    vendor.channels[path] = next;
    vendor.channelsRevision = Number(vendor.channelsRevision || 0) + 1;

    return { channel: normalizedChannel, previousStatus: current, status: nextStatus, changed: true };
};

/**
 * Quick Commerce operating readiness.
 *
 * Wholesale requires a complete business profile at registration, at
 * application and again at activation. Quick Commerce required only the
 * platform feature flag, so a QC channel could be activated for a store with
 * no geo-point — checkout then failed at the last step with
 * VENDOR_LOCATION_MISSING while the channel showed as `active`.
 *
 * These are the fields the QC runtime genuinely needs, and nothing more:
 *   location            — discovery (2dsphere), distance, delivery fee, ETA
 *   serviceRadiusKm     — serviceability bound
 *   preparationTimeMins — ETA
 *   storeType           — operational classification used by dispatch
 * `servicedPincodes` is the documented fallback when a customer denies
 * location access, so a store with neither a point nor pincodes is unreachable.
 *
 * @returns {{ready: boolean, missing: string[]}}
 */
export const quickCommerceReadiness = (vendor) => {
    const profile = vendor?.quickCommerceProfile || {};
    const missing = [];

    const coordinates = profile?.location?.coordinates;
    const hasPoint = Array.isArray(coordinates)
        && coordinates.length === 2
        && coordinates.every((value) => Number.isFinite(Number(value)));
    const hasPincodes = Array.isArray(profile.servicedPincodes) && profile.servicedPincodes.length > 0;
    if (!hasPoint && !hasPincodes) missing.push('location or servicedPincodes');

    if (!profile.storeType) missing.push('storeType');
    if (!Number.isFinite(Number(profile.serviceRadiusKm)) || Number(profile.serviceRadiusKm) <= 0) {
        missing.push('serviceRadiusKm');
    }
    if (!Number.isFinite(Number(profile.preparationTimeMins)) || Number(profile.preparationTimeMins) < 0) {
        missing.push('preparationTimeMins');
    }

    return { ready: missing.length === 0, missing };
};

/** Throw a 400 unless the vendor can actually operate on Quick Commerce. */
export const assertQuickCommerceReady = (vendor) => {
    const { ready, missing } = quickCommerceReadiness(vendor);
    if (!ready) {
        throw transitionError(
            `Quick Commerce setup is incomplete. Missing: ${missing.join(', ')}.`,
            'QUICK_COMMERCE_PROFILE_INCOMPLETE',
            400
        );
    }
};

/**
 * Optimistic concurrency guard for every channel-mutating admin endpoint.
 *
 * `expectedRevision` is now REQUIRED for admin writes: it was optional, and the
 * Quick Commerce toggle simply omitted it, so `if (expectedRevision !== undefined)`
 * skipped the check entirely and two admins could clobber each other.
 */
export const assertChannelRevision = (vendor, expectedRevision, { required = true } = {}) => {
    if (expectedRevision === undefined || expectedRevision === null) {
        if (!required) return;
        throw transitionError(
            'expectedRevision is required for channel changes.',
            'CHANNEL_REVISION_REQUIRED',
            400
        );
    }
    if (Number(vendor.channelsRevision) !== Number(expectedRevision)) {
        throw transitionError(
            'Vendor channels changed. Refresh and try again.',
            'CHANNEL_REVISION_CONFLICT'
        );
    }
};
