import SellOnDwellmartStats from '../models/SellOnDwellmartStats.model.js';
import ApiError from '../utils/ApiError.js';
import { clearResponseCache } from '../middlewares/responseCache.js';

export const STATS_KEY = 'sell_on_dwellmart';

export const DEFAULT_SELL_ON_DWELLMART_STATS = Object.freeze({
    activeVendors: '500+',
    productsSold: '100K+',
    citiesCovered: '50+',
    onTimeDeliveryRate: '99.9%',
    todaysRevenue: '₹4,85,200',
    ordersToday: '389',
    expressDeliveries: '142',
    revenueGrowthPercent: '+28.4%',
    dailySettlementAmount: '₹1,48,250',
});

export const ALLOWED_STATS_FIELDS = Object.keys(DEFAULT_SELL_ON_DWELLMART_STATS);

/**
 * Filter out internal mongoose and admin fields, returning only public stats
 */
export const sanitizePublicStats = (doc) => {
    if (!doc) return { ...DEFAULT_SELL_ON_DWELLMART_STATS };
    const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    return {
        activeVendors: String(raw.activeVendors ?? DEFAULT_SELL_ON_DWELLMART_STATS.activeVendors),
        productsSold: String(raw.productsSold ?? DEFAULT_SELL_ON_DWELLMART_STATS.productsSold),
        citiesCovered: String(raw.citiesCovered ?? DEFAULT_SELL_ON_DWELLMART_STATS.citiesCovered),
        onTimeDeliveryRate: String(raw.onTimeDeliveryRate ?? DEFAULT_SELL_ON_DWELLMART_STATS.onTimeDeliveryRate),
        todaysRevenue: String(raw.todaysRevenue ?? DEFAULT_SELL_ON_DWELLMART_STATS.todaysRevenue),
        ordersToday: String(raw.ordersToday ?? DEFAULT_SELL_ON_DWELLMART_STATS.ordersToday),
        expressDeliveries: String(raw.expressDeliveries ?? DEFAULT_SELL_ON_DWELLMART_STATS.expressDeliveries),
        revenueGrowthPercent: String(raw.revenueGrowthPercent ?? DEFAULT_SELL_ON_DWELLMART_STATS.revenueGrowthPercent),
        dailySettlementAmount: String(raw.dailySettlementAmount ?? DEFAULT_SELL_ON_DWELLMART_STATS.dailySettlementAmount),
        updatedAt: raw.updatedAt || undefined,
    };
};

/**
 * Fetch the singleton statistics document, auto-seeding defaults if not found
 */
export const getSellOnDwellmartStats = async () => {
    let stats = await SellOnDwellmartStats.findOne({ key: STATS_KEY }).lean();
    if (!stats) {
        try {
            stats = await SellOnDwellmartStats.findOneAndUpdate(
                { key: STATS_KEY },
                { $setOnInsert: { key: STATS_KEY, ...DEFAULT_SELL_ON_DWELLMART_STATS } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            ).lean();
        } catch {
            // In case of race condition during concurrent cold-start queries
            stats = await SellOnDwellmartStats.findOne({ key: STATS_KEY }).lean();
        }
    }
    return sanitizePublicStats(stats);
};

/**
 * Validate and update the singleton statistics document
 */
export const updateSellOnDwellmartStats = async (input = {}) => {
    if (!input || typeof input !== 'object') {
        throw new ApiError(400, 'Invalid payload. Request body must be an object.');
    }

    const updates = {};
    const htmlTagRegex = /<[^>]*>/i;
    const scriptRegex = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;

    for (const field of ALLOWED_STATS_FIELDS) {
        if (input[field] !== undefined) {
            const rawVal = input[field];
            if (rawVal === null || typeof rawVal !== 'string') {
                throw new ApiError(400, `Field '${field}' must be a non-empty string.`);
            }

            const trimmed = rawVal.trim();
            if (trimmed.length === 0) {
                throw new ApiError(400, `Field '${field}' cannot be empty.`);
            }
            if (trimmed.length > 50) {
                throw new ApiError(400, `Field '${field}' is too long (maximum 50 characters).`);
            }
            if (htmlTagRegex.test(trimmed) || scriptRegex.test(trimmed)) {
                throw new ApiError(400, `Field '${field}' contains invalid characters or HTML tags.`);
            }

            updates[field] = trimmed;
        }
    }

    if (Object.keys(updates).length === 0) {
        throw new ApiError(400, 'At least one valid statistics field must be provided for update.');
    }

    const updated = await SellOnDwellmartStats.findOneAndUpdate(
        { key: STATS_KEY },
        { $set: updates },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    // Invalidate response cache so public endpoints immediately serve updated values
    try {
        clearResponseCache();
    } catch {
        // Safe fallback
    }

    return sanitizePublicStats(updated);
};
