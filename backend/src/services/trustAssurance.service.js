import Settings from '../models/Settings.model.js';
import ApiError from '../utils/ApiError.js';
import { clearResponseCache } from '../middlewares/responseCache.js';
import { cacheInvalidate } from '../utils/ttlCache.js';

export const TRUST_ASSURANCE_KEY = 'trust_assurance';

export const ALLOWED_FEATURE_ICONS = [
    'truck',
    'rotate',
    'shield',
    'check',
    'box',
    'award',
    'lock',
    'globe',
    'percent',
    'tag',
    'heart',
    'star',
    'clock',
    'headset',
    'gift',
    'dollar',
    'zap',
    'users',
    'grid',
];

export const ALLOWED_STAT_ICONS = [
    'users',
    'box',
    'grid',
    'lock',
    'shield',
    'award',
    'star',
    'truck',
    'heart',
    'dollar',
    'check',
    'globe',
    'tag',
    'percent',
];

export const ALLOWED_COLOR_SCHEMES = [
    'info',     // blue
    'success',  // green
    'primary',  // brand/gold
    'warning',  // amber/orange
    'purple',
    'rose',
    'teal',
];

export const DEFAULT_TRUST_ASSURANCE_DATA = Object.freeze({
    badge: 'MARKETPLACE TRUST & ASSURANCE',
    title: 'Why Shop With Dwell Mart?',
    subtitle: 'We partner with top-rated sellers to guarantee authentic products, transparent pricing, and instant support.',
    isEnabled: true,
    featureCards: [
        {
            id: 'feature-1',
            title: 'Free Express Shipping',
            description: 'On all orders over ₹499 nationwide',
            icon: 'truck',
            colorScheme: 'info',
            isActive: true,
        },
        {
            id: 'feature-2',
            title: '7-Day Easy Returns',
            description: 'Hassle-free 100% money back guarantee',
            icon: 'rotate',
            colorScheme: 'success',
            isActive: true,
        },
        {
            id: 'feature-3',
            title: '100% Secure Payments',
            description: 'Encrypted checkout via UPI, Cards & NetBanking',
            icon: 'shield',
            colorScheme: 'primary',
            isActive: true,
        },
        {
            id: 'feature-4',
            title: 'Verified Marketplace Sellers',
            description: 'Quality-vetted vendors across India',
            icon: 'check',
            colorScheme: 'warning',
            isActive: true,
        },
    ],
    statCards: [
        {
            id: 'stat-1',
            value: '8+',
            label: 'VERIFIED STORES',
            icon: 'users',
            isActive: true,
        },
        {
            id: 'stat-2',
            value: '6+',
            label: 'CURATED PRODUCTS',
            icon: 'box',
            isActive: true,
        },
        {
            id: 'stat-3',
            value: '10+',
            label: 'CATEGORIES',
            icon: 'grid',
            isActive: true,
        },
        {
            id: 'stat-4',
            value: '100%',
            label: 'SECURE PAYMENTS',
            icon: 'lock',
            isActive: true,
        },
    ],
});

const htmlTagRegex = /<[^>]*>/i;
const scriptRegex = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;

export const sanitizeString = (val, maxLen = 120, fieldName = 'Field') => {
    if (val === null || val === undefined) return '';
    const str = String(val).trim();
    if (str.length > maxLen) {
        throw new ApiError(400, `${fieldName} exceeds maximum length of ${maxLen} characters.`);
    }
    if (htmlTagRegex.test(str) || scriptRegex.test(str)) {
        throw new ApiError(400, `${fieldName} contains disallowed characters or HTML tags.`);
    }
    return str;
};

/**
 * Sanitize and guarantee complete public payload
 */
export const sanitizePublicTrustAssurance = (raw) => {
    if (!raw || typeof raw !== 'object') {
        return JSON.parse(JSON.stringify(DEFAULT_TRUST_ASSURANCE_DATA));
    }

    const value = raw.value && typeof raw.value === 'object' ? raw.value : raw;

    const featureCards = Array.isArray(value.featureCards) && value.featureCards.length > 0
        ? value.featureCards.map((c, idx) => ({
            id: String(c?.id || `feature-${idx + 1}`).trim(),
            title: String(c?.title || '').trim(),
            description: String(c?.description || '').trim(),
            icon: ALLOWED_FEATURE_ICONS.includes(String(c?.icon || '').toLowerCase()) ? String(c.icon).toLowerCase() : 'shield',
            colorScheme: ALLOWED_COLOR_SCHEMES.includes(String(c?.colorScheme || '').toLowerCase()) ? String(c.colorScheme).toLowerCase() : 'info',
            isActive: c?.isActive !== false,
        }))
        : DEFAULT_TRUST_ASSURANCE_DATA.featureCards;

    const statCards = Array.isArray(value.statCards) && value.statCards.length > 0
        ? value.statCards.map((c, idx) => ({
            id: String(c?.id || `stat-${idx + 1}`).trim(),
            value: String(c?.value || '').trim(),
            label: String(c?.label || '').trim(),
            icon: ALLOWED_STAT_ICONS.includes(String(c?.icon || '').toLowerCase()) ? String(c.icon).toLowerCase() : 'star',
            isActive: c?.isActive !== false,
        }))
        : DEFAULT_TRUST_ASSURANCE_DATA.statCards;

    return {
        badge: String(value.badge || DEFAULT_TRUST_ASSURANCE_DATA.badge).trim(),
        title: String(value.title || DEFAULT_TRUST_ASSURANCE_DATA.title).trim(),
        subtitle: String(value.subtitle || DEFAULT_TRUST_ASSURANCE_DATA.subtitle).trim(),
        isEnabled: value.isEnabled !== false,
        featureCards,
        statCards,
        updatedAt: raw.updatedAt || undefined,
    };
};

/**
 * Fetch Trust & Assurance data, fallback to defaults
 */
export const getTrustAssuranceData = async () => {
    let doc = await Settings.findOne({ key: TRUST_ASSURANCE_KEY }).lean();
    if (!doc) {
        try {
            doc = await Settings.findOneAndUpdate(
                { key: TRUST_ASSURANCE_KEY },
                { $setOnInsert: { key: TRUST_ASSURANCE_KEY, value: DEFAULT_TRUST_ASSURANCE_DATA } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            ).lean();
        } catch {
            doc = await Settings.findOne({ key: TRUST_ASSURANCE_KEY }).lean();
        }
    }
    return sanitizePublicTrustAssurance(doc);
};

/**
 * Validate and update Trust & Assurance data
 */
export const updateTrustAssuranceData = async (input = {}) => {
    if (!input || typeof input !== 'object') {
        throw new ApiError(400, 'Invalid payload. Request body must be an object.');
    }

    const badge = sanitizeString(input.badge ?? DEFAULT_TRUST_ASSURANCE_DATA.badge, 60, 'Section Badge');
    const title = sanitizeString(input.title ?? DEFAULT_TRUST_ASSURANCE_DATA.title, 80, 'Section Title');
    const subtitle = sanitizeString(input.subtitle ?? DEFAULT_TRUST_ASSURANCE_DATA.subtitle, 250, 'Section Subtitle');
    const isEnabled = input.isEnabled !== false;

    if (!title) {
        throw new ApiError(400, 'Section Title cannot be empty.');
    }

    // Validate feature cards (white cards)
    if (!Array.isArray(input.featureCards)) {
        throw new ApiError(400, 'featureCards must be an array.');
    }
    if (input.featureCards.length === 0) {
        throw new ApiError(400, 'At least 1 feature card must be provided.');
    }
    if (input.featureCards.length > 8) {
        throw new ApiError(400, 'Maximum 8 feature cards allowed.');
    }

    const validatedFeatureCards = input.featureCards.map((card, idx) => {
        if (!card || typeof card !== 'object') {
            throw new ApiError(400, `Feature card at index ${idx} is invalid.`);
        }
        const cardTitle = sanitizeString(card.title, 60, `Feature Card #${idx + 1} Title`);
        const cardDesc = sanitizeString(card.description, 120, `Feature Card #${idx + 1} Description`);
        if (!cardTitle) {
            throw new ApiError(400, `Feature Card #${idx + 1} title cannot be empty.`);
        }
        const rawIcon = String(card.icon || 'shield').toLowerCase().trim();
        const icon = ALLOWED_FEATURE_ICONS.includes(rawIcon) ? rawIcon : 'shield';
        const rawScheme = String(card.colorScheme || 'info').toLowerCase().trim();
        const colorScheme = ALLOWED_COLOR_SCHEMES.includes(rawScheme) ? rawScheme : 'info';

        return {
            id: String(card.id || `feature-${idx + 1}`).trim(),
            title: cardTitle,
            description: cardDesc,
            icon,
            colorScheme,
            isActive: card.isActive !== false,
        };
    });

    // Validate stat cards (black cards)
    if (!Array.isArray(input.statCards)) {
        throw new ApiError(400, 'statCards must be an array.');
    }
    if (input.statCards.length === 0) {
        throw new ApiError(400, 'At least 1 stat card must be provided.');
    }
    if (input.statCards.length > 8) {
        throw new ApiError(400, 'Maximum 8 stat cards allowed.');
    }

    const validatedStatCards = input.statCards.map((card, idx) => {
        if (!card || typeof card !== 'object') {
            throw new ApiError(400, `Stat card at index ${idx} is invalid.`);
        }
        const cardValue = sanitizeString(card.value, 30, `Stat Card #${idx + 1} Value`);
        const cardLabel = sanitizeString(card.label, 50, `Stat Card #${idx + 1} Label`);
        if (!cardValue) {
            throw new ApiError(400, `Stat Card #${idx + 1} value cannot be empty.`);
        }
        if (!cardLabel) {
            throw new ApiError(400, `Stat Card #${idx + 1} label cannot be empty.`);
        }
        const rawIcon = String(card.icon || 'star').toLowerCase().trim();
        const icon = ALLOWED_STAT_ICONS.includes(rawIcon) ? rawIcon : 'star';

        return {
            id: String(card.id || `stat-${idx + 1}`).trim(),
            value: cardValue,
            label: cardLabel.toUpperCase(),
            icon,
            isActive: card.isActive !== false,
        };
    });

    const updatedValue = {
        badge,
        title,
        subtitle,
        isEnabled,
        featureCards: validatedFeatureCards,
        statCards: validatedStatCards,
    };

    const doc = await Settings.findOneAndUpdate(
        { key: TRUST_ASSURANCE_KEY },
        { key: TRUST_ASSURANCE_KEY, value: updatedValue },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    // Cache clearing
    try {
        clearResponseCache();
        cacheInvalidate(`settings:${TRUST_ASSURANCE_KEY}`);
    } catch {
        // Safe fallback
    }

    return sanitizePublicTrustAssurance(doc);
};
