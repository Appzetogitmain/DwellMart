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
 * Precedence:
 *   1. this vendor's `vendorItems[].orderType` (most specific)
 *   2. `order.fulfillmentType`                 (operational truth)
 *   3. `order.orderType` / `order.experience`  (legacy fallback)
 *   4. 'retail'                                (documents predating all three)
 *
 * @param {object} order
 * @param {string|object} [vendorId] restrict to this vendor's slice
 * @returns {'retail'|'wholesale'|'quick_commerce'}
 */
export const resolveOrderChannel = (order, vendorId = null) => {
    if (vendorId) {
        const slice = (order?.vendorItems || []).find(
            (item) => String(item?.vendorId) === String(vendorId)
        );
        const sliceChannel = normalize(slice?.fulfillmentType) || normalize(slice?.orderType);
        if (sliceChannel) return sliceChannel;
    }
    return normalize(order?.fulfillmentType)
        || normalize(order?.orderType)
        || normalize(order?.experience)
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
