import ApiError from '../../utils/ApiError.js';
import SubscriptionPlan from '../../models/SubscriptionPlan.model.js';

export const PLAN_INTERVALS = ['day', 'week', 'month', 'year'];

export const buildPlanSlug = (name = '') =>
    String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

export const normalizePlanFeatures = (features) => {
    if (Array.isArray(features)) {
        return {
            highlights: features.map((value) => String(value).trim()).filter(Boolean),
        };
    }

    if (typeof features === 'string') {
        const trimmed = features.trim();
        if (!trimmed) return {};
        try {
            const parsed = JSON.parse(trimmed);
            return normalizePlanFeatures(parsed);
        } catch {
            return {
                highlights: trimmed
                    .split('\n')
                    .map((value) => value.trim())
                    .filter(Boolean),
            };
        }
    }

    if (features && typeof features === 'object') {
        const highlights = Array.isArray(features.highlights)
            ? features.highlights.map((value) => String(value).trim()).filter(Boolean)
            : [];

        return {
            ...features,
            ...(highlights.length ? { highlights } : {}),
        };
    }

    return {};
};

export const resolvePlanAmount = (plan, country = '') => {
    const isExplicitlyForeign = country && !String(country).toLowerCase().includes('india') && String(country).toLowerCase() !== 'in';
    if (isExplicitlyForeign) {
        return Number(plan?.price_usd || 0);
    }
    return Number(plan?.price_inr || plan?.price || 0);
};

export const resolvePlanCurrency = (country = '') => {
    const isExplicitlyForeign = country && !String(country).toLowerCase().includes('india') && String(country).toLowerCase() !== 'in';
    if (isExplicitlyForeign) {
        return 'USD';
    }
    return 'INR';
};

export const normalizePlanInterval = ({ interval = 'month', intervalCount = 1 } = {}) => {
    const normalizedInterval = String(interval || 'month').trim().toLowerCase();
    if (!PLAN_INTERVALS.includes(normalizedInterval)) {
        throw new ApiError(400, 'Billing interval must be day, week, month, or year.');
    }

    const normalizedCount = Math.max(Number.parseInt(intervalCount, 10) || 1, 1);

    return {
        interval: normalizedInterval,
        interval_count: normalizedCount,
    };
};

export const formatPlanIntervalLabel = (plan = {}) => {
    const count = Math.max(Number.parseInt(plan.interval_count, 10) || 1, 1);
    const interval = String(plan.interval || 'month');
    const unitLabel = count === 1 ? interval : `${interval}s`;
    return count === 1 ? unitLabel : `${count} ${unitLabel}`;
};

export const addPlanIntervalToDate = (date, plan = {}) => {
    const nextDate = new Date(date);
    const count = Math.max(Number.parseInt(plan.interval_count, 10) || 1, 1);

    if (plan.interval === 'year') {
        nextDate.setFullYear(nextDate.getFullYear() + count);
    } else if (plan.interval === 'month') {
        nextDate.setMonth(nextDate.getMonth() + count);
    } else if (plan.interval === 'week') {
        nextDate.setDate(nextDate.getDate() + (7 * count));
    } else {
        nextDate.setDate(nextDate.getDate() + count);
    }

    return nextDate;
};

export const serializePlan = (planDoc, country = '') => {
    if (!planDoc) return null;

    const plan = typeof planDoc.toObject === 'function'
        ? planDoc.toObject({ virtuals: true })
        : { ...planDoc };
    const displayCurrency = resolvePlanCurrency(country);
    const displayPrice = resolvePlanAmount(plan, country);
    const features = normalizePlanFeatures(plan.features);

    return {
        ...plan,
        isMostPopular: Boolean(plan.isMostPopular),
        features,
        featureHighlights: Array.isArray(features.highlights) ? features.highlights : [],
        gateway: 'internal',
        pricing: {
            inr: Number(plan.price_inr || 0),
            usd: Number(plan.price_usd || 0),
        },
        displayPrice,
        displayCurrency,
        interval_count: Number(plan.interval_count || 1),
        intervalLabel: formatPlanIntervalLabel(plan),
        displayLabel: `${displayCurrency} ${displayPrice.toFixed(2)}/${formatPlanIntervalLabel(plan)}`,
        isFree: Number(plan.price_inr || 0) === 0 && Number(plan.price_usd || 0) === 0,
    };
};

export const getActivePlanById = async (planId) => {
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan || !plan.isActive) {
        throw new ApiError(400, 'Selected subscription plan is not available.');
    }
    return plan;
};
