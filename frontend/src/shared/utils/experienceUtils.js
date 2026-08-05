/**
 * Shared Experience Utilities for DwellMart
 * Unified handling for Marketplace, Wholesale, and Quick Commerce experiences across Customer, Vendor, Admin, and Delivery views.
 */

export const EXPERIENCES = Object.freeze({
    MARKETPLACE: 'marketplace',
    WHOLESALE: 'wholesale',
    QUICK_COMMERCE: 'quick_commerce',
});

/** Normalize raw string into valid experience type */
export const normalizeExperience = (experience) => {
    const raw = String(experience || '').toLowerCase().trim();
    if (raw === 'quick_commerce' || raw === 'quick-commerce' || raw === 'qc') {
        return EXPERIENCES.QUICK_COMMERCE;
    }
    if (raw === 'wholesale' || raw === 'b2b') {
        return EXPERIENCES.WHOLESALE;
    }
    return EXPERIENCES.MARKETPLACE;
};

export const isMarketplace = (experience) => normalizeExperience(experience) === EXPERIENCES.MARKETPLACE;
export const isWholesale = (experience) => normalizeExperience(experience) === EXPERIENCES.WHOLESALE;
export const isQuickCommerce = (experience) => normalizeExperience(experience) === EXPERIENCES.QUICK_COMMERCE;

export const getExperienceLabel = (experience) => {
    const exp = normalizeExperience(experience);
    switch (exp) {
        case EXPERIENCES.QUICK_COMMERCE:
            return '10–30 Min Dwell Mart Express';
        case EXPERIENCES.WHOLESALE:
            return 'B2B Wholesale';
        case EXPERIENCES.MARKETPLACE:
        default:
            return 'Marketplace (B2B & B2C)';
    }
};

export const getExperienceShortLabel = (experience) => {
    const exp = normalizeExperience(experience);
    switch (exp) {
        case EXPERIENCES.QUICK_COMMERCE:
            return 'Dwell Mart Express';
        case EXPERIENCES.WHOLESALE:
            return 'Wholesale (B2B)';
        case EXPERIENCES.MARKETPLACE:
        default:
            return 'Marketplace';
    }
};

export const getExperienceBadgeStyle = (experience) => {
    const exp = normalizeExperience(experience);
    switch (exp) {
        case EXPERIENCES.QUICK_COMMERCE:
            return {
                bg: 'bg-amber-500/10 dark:bg-amber-500/20',
                text: 'text-amber-600 dark:text-amber-400',
                border: 'border-amber-500/30',
                pill: 'bg-amber-500 text-black font-bold',
                gradient: 'from-amber-500 to-yellow-400',
            };
        case EXPERIENCES.WHOLESALE:
            return {
                bg: 'bg-purple-500/10 dark:bg-purple-500/20',
                text: 'text-purple-600 dark:text-purple-400',
                border: 'border-purple-500/30',
                pill: 'bg-purple-600 text-white font-bold',
                gradient: 'from-purple-600 to-indigo-600',
            };
        case EXPERIENCES.MARKETPLACE:
        default:
            return {
                bg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
                text: 'text-emerald-600 dark:text-emerald-400',
                border: 'border-emerald-500/30',
                pill: 'bg-emerald-600 text-white font-bold',
                gradient: 'from-emerald-600 to-teal-600',
            };
    }
};
