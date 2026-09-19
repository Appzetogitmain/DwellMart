/**
 * Minimal in-process TTL cache.
 *
 * Deliberately swappable: the interface is `get / set / invalidate / clear` so
 * the backing store can move to Redis without touching a single call site. It
 * is in-process for now, which is correct for a single instance and must be
 * revisited before running more than one.
 *
 * Every cached value is scoped by an explicit key. Nothing tenant-specific is
 * cached under a global key.
 */

const store = new Map();
const inFlight = new Map();

/** Read a live value, or undefined when absent or expired. */
export const cacheGet = (key) => {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
        store.delete(key);
        return undefined;
    }
    return entry.value;
};

/**
 * @param {string} key
 * @param {*} value
 * @param {number} ttlMs 0 disables caching for this key — the runtime bypass.
 */
export const cacheSet = (key, value, ttlMs) => {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) return value;
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
};

export const cacheInvalidate = (key) => {
    inFlight.delete(key);
    return store.delete(key);
};

/** Drop every key beginning with `prefix` — used when a settings category changes. */
export const cacheInvalidatePrefix = (prefix) => {
    let removed = 0;
    for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
            store.delete(key);
            removed += 1;
        }
    }
    for (const key of inFlight.keys()) {
        if (key.startsWith(prefix)) {
            inFlight.delete(key);
        }
    }
    return removed;
};

export const cacheClear = () => {
    inFlight.clear();
    store.clear();
};

/**
 * Read-through helper with single-flight in-flight deduplication.
 *
 * A `ttlMs` of 0 bypasses the cache entirely, which is how caching is disabled
 * at runtime during an incident without a deploy.
 */
export const cacheWrap = async (key, ttlMs, loader) => {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) return loader();
    const hit = cacheGet(key);
    if (hit !== undefined) return hit;

    if (inFlight.has(key)) {
        return inFlight.get(key);
    }

    const promise = (async () => {
        try {
            const value = await loader();
            cacheSet(key, value, ttlMs);
            return value;
        } finally {
            inFlight.delete(key);
        }
    })();

    inFlight.set(key, promise);
    return promise;
};

export const cacheStats = () => ({ size: store.size, inFlight: inFlight.size });
