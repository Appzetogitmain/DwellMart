/**
 * Order channel attribution — the single authoritative answer to
 * "which vendor workspace does this order belong to?"
 *
 * Two fields historically recorded the channel and were never reconciled:
 *
 *   fulfillmentType — how the order is actually fulfilled. Written by the
 *                     OrderSplitterEngine, which creates one FulfillmentGroup
 *                     per (vendor x fulfillmentType). This is the operational
 *                     truth.
 *   orderType       — an older field that defaults to 'retail' and, in
 *                     practice, stayed 'retail' on wholesale and Quick
 *                     Commerce orders alike.
 *
 * The vendor order LIST matched on either field while the vendor order STATUS
 * UPDATE gated on `orderType` alone. The result was orders listed in one
 * workspace that could not be actioned there, and Quick Commerce orders
 * actionable from the Retail workspace under the retail state machine.
 *
 * `fulfillmentType` is authoritative. `orderType` is a fallback for legacy
 * documents written before fulfilment groups existed. Every read and every
 * write now resolves through this module so the two can never diverge again.
 */

import { VendorChannels, normalizeVendorChannel } from '../constants/vendorChannels.js';

/** Legacy synonym: pre-Quick-Commerce orders used 'marketplace' for retail. */
const LEGACY_ALIASES = Object.freeze({
    marketplace: VendorChannels.RETAIL,
    quickcommerce: VendorChannels.QUICK_COMMERCE,
    'quick-commerce': VendorChannels.QUICK_COMMERCE,
});

const normalize = (value) => {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return null;
    return LEGACY_ALIASES[raw] ?? normalizeVendorChannel(raw);
};

/**
 * Resolve the canonical channel for an order, optionally narrowed to one
 * vendor's slice of a multi-vendor order.
 *
 * Three fields carry channel information and they are NOT equally expressive:
 *
 *   fulfillmentType  channel-aware. Says exactly which of the three channels.
 *   experience       channel-aware for Quick Commerce only; its other value,
 *                    'marketplace', is coarser than `orderType`.
 *   orderType        NOT channel-aware. Written from `deriveOrderType()`, it
 *                    reports a PRICING type — 'retail' | 'wholesale' | 'mixed'
 *                    — and has no Quick Commerce value at all.
 *
 * That last point is the crux. Because `orderType` cannot say
 * "quick_commerce", a Quick Commerce order's slice reads `orderType: 'retail'`
 * — which is missing information, not a disagreement. Letting it outrank the
 * order's own `fulfillmentType` meant a vendor-scoped lookup of a genuine
 * Quick Commerce order answered 'retail'. Downstream, the retail state machine
 * governed a Quick Commerce order in the vendor workspace, and — once a
 * courier integration existed — a Quick Commerce parcel resolved to DTDC
 * instead of an internal rider.
 *
 * Precedence:
 *   1. slice `fulfillmentType`   — specific AND fully expressive
 *   2. order `fulfillmentType`, or `experience` when it says quick_commerce —
 *      an answer no legacy field could have contradicted, so nothing may
 *      override it
 *   3. slice `orderType`         — a legacy refinement, still meaningful
 *      between retail and wholesale (one marketplace order really can carry a
 *      single wholesale vendor slice)
 *   4. order `orderType` / `experience`
 *   5. 'retail'                  — documents predating all of the above
 *
 * @param {object} order
 * @param {string|object} [vendorId] restrict to this vendor's slice
 * @returns {'retail'|'wholesale'|'quick_commerce'}
 */
export const resolveOrderChannel = (order, vendorId = null) => {
    const slice = vendorId
        ? (order?.vendorItems || []).find(
            (item) => String(item?.vendorId) === String(vendorId)
        )
        : null;

    // 1. The slice's own channel-aware value.
    const sliceCanonical = normalize(slice?.fulfillmentType);
    if (sliceCanonical) return sliceCanonical;

    // 2. The order's channel-aware value. `experience` counts here only when it
    //    names Quick Commerce; 'marketplace' is coarser than `orderType` and is
    //    left to the fallback chain below.
    const experienceChannel = normalize(order?.experience);
    const orderCanonical = normalize(order?.fulfillmentType)
        || (experienceChannel === VendorChannels.QUICK_COMMERCE ? experienceChannel : null);

    if (orderCanonical === VendorChannels.QUICK_COMMERCE) return orderCanonical;

    // 3. A legacy slice value refines a retail/wholesale order.
    const sliceLegacy = normalize(slice?.orderType);
    if (sliceLegacy) return sliceLegacy;

    return orderCanonical
        || normalize(order?.orderType)
        || experienceChannel
        || VendorChannels.RETAIL;
};

/**
 * Mongo condition selecting orders that belong to `channel`.
 *
 * Mirrors `resolveOrderChannel` precedence in query form: an order matches
 * when its fulfillmentType says so, or — only when fulfillmentType is absent —
 * when its orderType does. Without the "absent" guard, a wholesale-fulfilled
 * order whose legacy orderType is still 'retail' would match BOTH workspaces,
 * which is exactly the bleed being fixed.
 */
export const orderChannelFilter = (channel) => {
    const normalized = normalize(channel);
    if (!normalized) return {};

    const legacyValues = [normalized];
    if (normalized === VendorChannels.RETAIL) legacyValues.push('marketplace');

    return {
        $or: [
            { fulfillmentType: normalized },
            {
                fulfillmentType: { $in: [null, ''] },
                $or: [
                    { orderType: { $in: legacyValues } },
                    { experience: { $in: legacyValues } },
                ],
            },
            {
                fulfillmentType: { $exists: false },
                $or: [
                    { orderType: { $in: legacyValues } },
                    { experience: { $in: legacyValues } },
                ],
            },
            // Documents carrying neither field are retail by definition.
            ...(normalized === VendorChannels.RETAIL
                ? [{
                    fulfillmentType: { $exists: false },
                    orderType: { $exists: false },
                    experience: { $exists: false },
                }]
                : []),
        ],
    };
};

/** True when this order belongs to the given vendor workspace. */
export const orderBelongsToChannel = (order, channel, vendorId = null) =>
    resolveOrderChannel(order, vendorId) === normalize(channel);
