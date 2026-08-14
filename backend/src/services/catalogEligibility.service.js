/**
 * Catalog eligibility — the single place that answers
 * "may this product be shown to a customer right now?"
 *
 * A product is publicly visible only when ALL FOUR hold:
 *   1. the product is published on the requested channel   (product flag)
 *   2. the owning vendor's account is eligible             (approved + active)
 *   3. the owning vendor's channel is active               (canonical channels)
 *   4. the platform feature flag for that channel is on    (Settings.features)
 *
 * `buildCatalogFilter` covers (1). This module covers (2)–(4) and is what the
 * ad-hoc endpoints (flash-sale, popular, new-arrivals, vendor storefront) were
 * missing entirely — they filtered on `isActive` alone and therefore served
 * products from paused, disabled and rejected vendor channels.
 *
 * Channel resolution is driven by the REQUESTED EXPERIENCE, never by flag
 * priority on the product. A product carrying both `retailEnabled` and
 * `quickCommerceEnabled` is a marketplace product when browsed on the
 * marketplace and a Quick Commerce product when browsed on Quick Commerce;
 * resolving it as "Quick Commerce first" made dual-channel products 404 on the
 * marketplace detail page while still appearing in marketplace listings.
 */

import Vendor from '../models/Vendor.model.js';
import { EXPERIENCES, normalizeExperience } from '../constants/experiences.js';
import { isWholesaleMarketplaceEnabled, isQuickCommerceEnabled } from './featureFlags.service.js';

/** Canonical vendor channel path for a requested experience / selling channel. */
export const channelPathForExperience = (experience, sellingChannel) => {
    if (normalizeExperience(experience) === EXPERIENCES.QUICK_COMMERCE) return 'quickCommerce';
    if (String(sellingChannel || '').toLowerCase() === 'wholesale') return 'wholesale';
    if (normalizeExperience(experience) === EXPERIENCES.WHOLESALE) return 'wholesale';
    return 'retail';
};

/** Product publication flag backing a vendor channel path. */
export const productFlagForChannelPath = (channelPath) => ({
    retail: 'retailEnabled',
    wholesale: 'wholesaleEnabled',
    quickCommerce: 'quickCommerceEnabled',
}[channelPath] || 'retailEnabled');

/**
 * Is the platform feature flag for this channel on?
 * Retail has no kill switch — it is the base marketplace.
 */
export const isChannelFeatureEnabled = async (channelPath) => {
    if (channelPath === 'wholesale') return isWholesaleMarketplaceEnabled();
    if (channelPath === 'quickCommerce') return isQuickCommerceEnabled();
    return true;
};

/**
 * Mongo conditions selecting vendors eligible to sell on `channelPath`.
 *
 * `paused` is included only when `includePaused` is set: a paused channel may
 * still be browsed (existing customers can see what they bought) but must not
 * appear in discovery surfaces.
 */
export const vendorEligibilityFilter = (channelPath, { includePaused = false } = {}) => ({
    status: 'approved',
    isActive: { $ne: false },
    [`channels.${channelPath}.status`]: includePaused ? { $in: ['active', 'paused'] } : 'active',
});

/**
 * Resolve the ids of every vendor eligible on this channel.
 *
 * Returns an array — an empty array is a meaningful answer ("no vendor can
 * serve this channel") and callers must apply it rather than skipping the
 * filter, otherwise the endpoint silently falls open.
 */
export const eligibleVendorIds = async (channelPath, options) => {
    const vendors = await Vendor.find(vendorEligibilityFilter(channelPath, options))
        .select('_id')
        .lean();
    return vendors.map((vendor) => String(vendor._id));
};

/**
 * Build the complete public catalog guard for a request.
 *
 * @returns {{channelPath: string, productFlag: string, featureEnabled: boolean,
 *            vendorIds: string[], filter: object}}
 *   `filter` is ready to merge into any Product query and already encodes the
 *   product flag, the eligible vendor set, active/not-deleted, and the feature
 *   flag kill switch.
 */
export const buildPublicCatalogGuard = async ({ experience, sellingChannel, includePaused = false } = {}) => {
    const channelPath = channelPathForExperience(experience, sellingChannel);
    const productFlag = productFlagForChannelPath(channelPath);
    const featureEnabled = await isChannelFeatureEnabled(channelPath);

    if (!featureEnabled) {
        // Kill switch: match nothing. Expressed through $and so a later
        // `_id` assignment by the caller cannot silently cancel it.
        return {
            channelPath,
            productFlag,
            featureEnabled,
            vendorIds: [],
            filter: { $and: [{ _id: { $in: [] } }] },
        };
    }

    const vendorIds = await eligibleVendorIds(channelPath, { includePaused });

    // Retail publication is opt-out: legacy products predate the flag, so
    // "not explicitly false" is the correct test. The other two are opt-in.
    const flagCondition = productFlag === 'retailEnabled'
        ? { retailEnabled: { $ne: false } }
        : { [productFlag]: true };

    return {
        channelPath,
        productFlag,
        featureEnabled,
        vendorIds,
        filter: {
            isActive: true,
            isDeleted: { $ne: true },
            vendorId: { $in: vendorIds },
            ...flagCondition,
        },
    };
};

/**
 * Verify a single already-loaded product for public exposure.
 * Used by detail endpoints, which fetch by id and cannot pre-filter.
 *
 * @returns {Promise<{visible: boolean, reason: string|null}>}
 */
export const isProductPubliclyVisible = async (product, { experience, sellingChannel, includePaused = true } = {}) => {
    if (!product) return { visible: false, reason: 'PRODUCT_NOT_FOUND' };
    if (product.isActive === false || product.isDeleted === true) {
        return { visible: false, reason: 'PRODUCT_INACTIVE' };
    }

    const channelPath = channelPathForExperience(experience, sellingChannel);
    const productFlag = productFlagForChannelPath(channelPath);

    const published = productFlag === 'retailEnabled'
        ? product.retailEnabled !== false
        : product[productFlag] === true;
    if (!published) return { visible: false, reason: 'NOT_PUBLISHED_ON_CHANNEL' };

    if (!(await isChannelFeatureEnabled(channelPath))) {
        return { visible: false, reason: 'CHANNEL_DISABLED_PLATFORM_WIDE' };
    }

    const vendorId = product.vendorId?._id || product.vendorId;
    if (!vendorId) return { visible: false, reason: 'VENDOR_MISSING' };

    const vendor = await Vendor.findById(vendorId).select('status isActive channels').lean();
    if (!vendor || vendor.status !== 'approved' || vendor.isActive === false) {
        return { visible: false, reason: 'VENDOR_INELIGIBLE' };
    }

    const allowed = includePaused ? ['active', 'paused'] : ['active'];
    if (!allowed.includes(vendor.channels?.[channelPath]?.status)) {
        return { visible: false, reason: 'VENDOR_CHANNEL_INACTIVE' };
    }

    return { visible: true, reason: null };
};

/**
 * Merge an additional condition into a filter without clobbering an existing
 * one on the same key.
 *
 * Two real defects came from plain assignment on a shared filter object:
 *   - `filter.$or = [search]` erased the Quick Commerce category `$or`
 *   - `filter._id = { $nin: saleIds }` erased the `{ $in: [] }` kill switch
 * Anything conditional now goes through here.
 */
export const andCondition = (filter, condition) => {
    if (!condition || Object.keys(condition).length === 0) return filter;
    const existing = Array.isArray(filter.$and) ? filter.$and : [];
    filter.$and = [...existing, condition];
    return filter;
};
