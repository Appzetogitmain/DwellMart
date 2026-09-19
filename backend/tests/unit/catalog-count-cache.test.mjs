import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { cacheGet, cacheSet, cacheWrap, cacheClear, cacheInvalidatePrefix } from '../../src/utils/ttlCache.js';

const canonicalizeFilter = (val) => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'boolean' || typeof val === 'number' || typeof val === 'string') return val;
    if (val instanceof RegExp) return `__REGEX__:${val.source}:${val.flags}`;
    if (val instanceof Date) return `__DATE__:${val.toISOString()}`;
    if (typeof val?.toHexString === 'function') return String(val.toHexString());
    if (Array.isArray(val)) return val.map(canonicalizeFilter);
    if (typeof val === 'object') {
        const sortedKeys = Object.keys(val).sort();
        const result = {};
        for (const k of sortedKeys) {
            const v = val[k];
            if (v !== undefined) {
                result[k] = canonicalizeFilter(v);
            }
        }
        return result;
    }
    return String(val);
};

const getCatalogCountCacheKey = (filter) => {
    const canonical = JSON.stringify(canonicalizeFilter(filter));
    return 'catalog:count:' + crypto.createHash('sha256').update(canonical).digest('hex');
};

describe('Phase 9 — Catalog Count Cache & Canonicalization', () => {

    test('Canonicalization is invariant to object key order', () => {
        const f1 = { isActive: true, price: { $gte: 10, $lte: 50 }, retailEnabled: { $ne: false } };
        const f2 = { retailEnabled: { $ne: false }, isActive: true, price: { $lte: 50, $gte: 10 } };
        assert.equal(getCatalogCountCacheKey(f1), getCatalogCountCacheKey(f2));
    });

    test('Canonicalization preserves RegExp pattern and flags', () => {
        const f1 = { name: new RegExp('cotton', 'i') };
        const f2 = { name: new RegExp('silk', 'i') };
        const f3 = { name: /cotton/i };
        assert.notEqual(getCatalogCountCacheKey(f1), getCatalogCountCacheKey(f2));
        assert.equal(getCatalogCountCacheKey(f1), getCatalogCountCacheKey(f3));
    });

    test('Canonicalization distinguishes different filter conditions', () => {
        const base = { isActive: true };
        const withCat = { isActive: true, categoryId: 'cat123' };
        const withBrand = { isActive: true, brandId: 'brand456' };
        const withPrice = { isActive: true, price: { $gte: 100 } };
        const withRating = { isActive: true, rating: { $gte: 4 } };

        const keys = new Set([
            getCatalogCountCacheKey(base),
            getCatalogCountCacheKey(withCat),
            getCatalogCountCacheKey(withBrand),
            getCatalogCountCacheKey(withPrice),
            getCatalogCountCacheKey(withRating),
        ]);
        assert.equal(keys.size, 5, 'All distinct filter conditions must generate unique keys');
    });

    test('Single-flight concurrent deduplication executes count query only once', async () => {
        cacheClear();
        let loaderExecutions = 0;
        const fakeFilter = { test: 'concurrent-test' };
        const key = getCatalogCountCacheKey(fakeFilter);

        const loader = async () => {
            loaderExecutions++;
            await new Promise(r => setTimeout(r, 20));
            return 346;
        };

        // Fire 5 concurrent requests
        const results = await Promise.all([
            cacheWrap(key, 30_000, loader),
            cacheWrap(key, 30_000, loader),
            cacheWrap(key, 30_000, loader),
            cacheWrap(key, 30_000, loader),
            cacheWrap(key, 30_000, loader),
        ]);

        assert.equal(loaderExecutions, 1, 'Loader must execute exactly once for concurrent requests');
        results.forEach(res => assert.equal(res, 346));
    });

    test('Cache hit returns immediately on subsequent page requests', async () => {
        cacheClear();
        let countCalls = 0;
        const filter = { isActive: true, retailEnabled: { $ne: false } };
        const key = getCatalogCountCacheKey(filter);

        const countQuery = async () => {
            countCalls++;
            return 346;
        };

        // Page 1
        const count1 = await cacheWrap(key, 30_000, countQuery);
        assert.equal(count1, 346);
        assert.equal(countCalls, 1);

        // Page 2 (different page, same filter)
        const count2 = await cacheWrap(key, 30_000, countQuery);
        assert.equal(count2, 346);
        assert.equal(countCalls, 1, 'Count query must NOT re-execute on page 2');

        // Page 3
        const count3 = await cacheWrap(key, 30_000, countQuery);
        assert.equal(count3, 346);
        assert.equal(countCalls, 1, 'Count query must NOT re-execute on page 3');

        // Page 10
        const count10 = await cacheWrap(key, 30_000, countQuery);
        assert.equal(count10, 346);
        assert.equal(countCalls, 1, 'Count query must NOT re-execute on page 10');
    });

    test('Error in count loader is NOT cached and allows immediate retry', async () => {
        cacheClear();
        let attempts = 0;
        const key = 'catalog:count:error-test';

        const failingLoader = async () => {
            attempts++;
            if (attempts === 1) {
                throw new Error('Database temporary timeout');
            }
            return 346;
        };

        // First attempt fails
        await assert.rejects(
            async () => await cacheWrap(key, 30_000, failingLoader),
            /Database temporary timeout/
        );

        // Second attempt immediately retries and succeeds
        const result = await cacheWrap(key, 30_000, failingLoader);
        assert.equal(result, 346);
        assert.equal(attempts, 2, 'Failing loader must not be cached; retry must execute loader');
    });

    test('cacheInvalidatePrefix purges catalog count cache', async () => {
        cacheClear();
        const key = 'catalog:count:test-key';
        cacheSet(key, 346, 30_000);
        assert.equal(cacheGet(key), 346);

        cacheInvalidatePrefix('catalog:count:');
        assert.equal(cacheGet(key), undefined, 'Invalidating prefix must clear cached count');
    });
});
