/**
 * In-Memory Analytics Cache Service with 5-minute TTL & Smart Lifecycle Invalidation.
 *
 * Avoids executing expensive MongoDB pipeline aggregations on every page refresh while
 * ensuring numbers automatically invalidate when orders are completed, cancelled, refunded, or assigned.
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 Minutes TTL
const cacheStore = new Map();

/**
 * Fetch cached entry or compute & cache if missing/expired.
 * @param {string} cacheKey - Unique identifier for query
 * @param {Function} computeFn - Async function returning fresh aggregate data
 */
export const getOrComputeAnalyticsCache = async (cacheKey, computeFn) => {
    const now = Date.now();
    const existing = cacheStore.get(cacheKey);

    if (existing && now - existing.timestamp < CACHE_TTL_MS) {
        return existing.data;
    }

    const freshData = await computeFn();
    cacheStore.set(cacheKey, {
        timestamp: now,
        data: freshData,
    });
    return freshData;
};

/**
 * Smart cache invalidation triggered on key order lifecycle changes:
 * - Order Created / Completed / Cancelled / Refunded
 * - Rider Assigned / Status Updated
 * - Product Deleted / Vendor Status Change
 */
export const invalidateAnalyticsCache = (pattern = '') => {
    if (!pattern) {
        cacheStore.clear();
        return;
    }

    for (const key of cacheStore.keys()) {
        if (key.includes(pattern)) {
            cacheStore.delete(key);
        }
    }
};
