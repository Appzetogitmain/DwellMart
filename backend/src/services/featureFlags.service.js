import Settings from '../models/Settings.model.js';
import { cacheWrap, cacheInvalidate } from '../utils/ttlCache.js';

/**
 * Platform feature flags.
 *
 * All flags live in the generic Settings key/value store under the `features`
 * key, alongside the existing storefront toggles (wishlist, flash sale, etc.),
 * and are managed from Admin → Settings → Content & Features.
 *
 * Cached because these are read on the hot path: every catalog request, and
 * several times per checkout. Each read was previously an unconditional
 * `Settings.findOne`.
 *
 * The TTL is short by design. A feature flag is a control an operator expects
 * to take effect promptly, so correctness of propagation matters more than the
 * marginal cache hit — and `invalidateFeatureFlags()` is called on write, so
 * the TTL is only a backstop for changes made outside the admin API.
 */
const CACHE_KEY = 'settings:features';
const TTL_MS = 30_000;

const getFeatureFlags = async () =>
    cacheWrap(CACHE_KEY, TTL_MS, async () => {
        const setting = await Settings.findOne({ key: 'features' }).lean();
        return setting?.value || {};
    });

/** Called by the settings write path so an operator's change is not delayed. */
export const invalidateFeatureFlags = () => cacheInvalidate(CACHE_KEY);

export const isWholesaleMarketplaceEnabled = async () => {
    const features = await getFeatureFlags();
    return features.wholesaleMarketplaceEnabled === true;
};

export const isQuickCommerceEnabled = async () => {
    const features = await getFeatureFlags();
    return features.quickCommerceEnabled === true;
};
