import Settings from '../models/Settings.model.js';

/**
 * Platform feature flags.
 *
 * All flags live in the generic Settings key/value store under the `features`
 * key, alongside the existing storefront toggles (wishlist, flash sale, etc.),
 * and are managed from Admin → Settings → Content & Features.
 */
const getFeatureFlags = async () => {
    const setting = await Settings.findOne({ key: 'features' }).lean();
    return setting?.value || {};
};

export const isWholesaleMarketplaceEnabled = async () => {
    const features = await getFeatureFlags();
    return features.wholesaleMarketplaceEnabled === true;
};

export const isQuickCommerceEnabled = async () => {
    const features = await getFeatureFlags();
    return features.quickCommerceEnabled === true;
};
