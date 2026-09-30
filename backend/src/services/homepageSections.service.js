import Settings from '../models/Settings.model.js';

export const HOMEPAGE_SECTIONS_KEY = 'homepage_sections';

// The default display order matches the existing storefront. Product ownership
// is resolved separately, so promotional rows retain their current priority.
export const DEFAULT_HOMEPAGE_SECTIONS = [
    { key: 'newArrivals', title: 'New Arrivals', subtitle: 'Fresh products just added' },
    { key: 'mostPopular', title: 'Most Popular', subtitle: '' },
    { key: 'dailyDeals', title: 'Daily Deals', subtitle: 'Limited time offers' },
    { key: 'flashSale', title: 'Flash Sale', subtitle: 'Limited time offers' },
    { key: 'trending', title: 'Trending Now', subtitle: '' },
    { key: 'recommended', title: 'Recommended for You', subtitle: 'More products to explore' },
].map((section) => ({ ...section, enabled: true, limit: 6, mode: 'automatic', pinnedIds: [] }));

export const normalizeHomepageSections = (value) => {
    const saved = Array.isArray(value?.sections) ? value.sections : [];
    const byKey = new Map(DEFAULT_HOMEPAGE_SECTIONS.map((section) => [section.key, section]));
    const ordered = [];
    for (const candidate of saved) {
        const fallback = byKey.get(candidate?.key);
        if (!fallback || ordered.some((section) => section.key === fallback.key)) continue;
        ordered.push({ ...fallback, ...candidate, key: fallback.key, limit: 6 });
    }
    for (const fallback of DEFAULT_HOMEPAGE_SECTIONS) {
        if (!ordered.some((section) => section.key === fallback.key)) ordered.push({ ...fallback });
    }
    return { sections: ordered };
};

export const getHomepageSections = async () => {
    const setting = await Settings.findOne({ key: HOMEPAGE_SECTIONS_KEY }).select('value').lean();
    return normalizeHomepageSections(setting?.value);
};
