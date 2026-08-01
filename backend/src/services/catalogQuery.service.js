import { EXPERIENCES, normalizeExperience } from '../constants/experiences.js';

/**
 * Shared catalog query builder.
 *
 * Every catalog read must construct its Mongo filter through this helper.
 *
 * The failure mode of an experience-discriminated catalog is a forgotten
 * filter — one missed condition and Marketplace products surface inside Quick
 * Commerce (or a customer sees products from a store that cannot reach them).
 * Centralising construction turns that from a discipline problem into a
 * testable one: there is exactly one place to audit, and one place to fix.
 *
 * Callers pass intent; this decides which flags and which category field apply.
 */

/**
 * Build the base catalog filter for an experience.
 *
 * @param {object}  params
 * @param {string}  [params.experience]      'marketplace' | 'quick_commerce'
 * @param {string}  [params.category]        Category id to filter on.
 * @param {string[]} [params.categoryIds]    Category ids (parent + children).
 * @param {string[]} [params.vendorIds]      Restrict to these vendors. Quick
 *   Commerce uses this to limit results to serviceable stores; when the array is
 *   present but empty the filter matches nothing, which is the correct answer
 *   for "no store can deliver here".
 * @param {boolean} [params.activeOnly=true] Apply `isActive: true`.
 * @param {object}  [params.extra]           Additional conditions merged last.
 * @returns {object} Mongo filter
 */
export const buildCatalogFilter = ({
    experience,
    category,
    categoryIds,
    vendorIds,
    activeOnly = true,
    wholesaleMarketplaceEnabled = true,
    extra = {},
} = {}) => {
    const resolvedExperience = normalizeExperience(experience);
    const filter = {};

    if (activeOnly) filter.isActive = true;

    if (resolvedExperience === EXPERIENCES.QUICK_COMMERCE) {
        filter.quickCommerceEnabled = true;

        if (Array.isArray(categoryIds)) {
            filter.quickCommerceCategoryId = { $in: categoryIds };
        } else if (category) {
            filter.quickCommerceCategoryId = category;
        }
    } else {
        // Marketplace: retail is opt-out (legacy products have no flag), so
        // "not explicitly false" is the correct test.
        // If wholesale is disabled platform-wide, wholesale-only products
        // (retailEnabled: false, wholesaleEnabled: true) must never be listed.
        filter.retailEnabled = { $ne: false };

        if (Array.isArray(categoryIds)) {
            filter.categoryId = { $in: categoryIds };
        } else if (category) {
            filter.categoryId = category;
        }

        if (!wholesaleMarketplaceEnabled && extra?.wholesaleEnabled) {
            // Caller explicitly requested wholesale products when wholesale is OFF -> return no results
            filter._id = { $in: [] };
        }
    }

    if (Array.isArray(vendorIds)) {
        filter.vendorId = { $in: vendorIds };
    }

    return { ...filter, ...extra };
};

/** Category field backing a given experience. */
export const getCategoryFieldForExperience = (experience) =>
    normalizeExperience(experience) === EXPERIENCES.QUICK_COMMERCE
        ? 'quickCommerceCategoryId'
        : 'categoryId';

/** Product flag backing a given experience. */
export const getChannelFieldForExperience = (experience) =>
    normalizeExperience(experience) === EXPERIENCES.QUICK_COMMERCE
        ? 'quickCommerceEnabled'
        : 'retailEnabled';
