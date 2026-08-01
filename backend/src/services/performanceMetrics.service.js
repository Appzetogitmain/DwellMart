/**
 * performanceMetrics.service.js
 *
 * Lightweight in-process instrumentation for development and diagnostics.
 *
 * IMPORTANT: This is a diagnostic tool only. In-memory metrics reset on every
 * process restart and are not shared across PM2 cluster workers. For production
 * monitoring, forward these summaries to an external APM at the admin endpoint.
 *
 * Usage:
 *   import { recordMetric, getMetricsSummary } from './performanceMetrics.service.js';
 *
 *   // Wrap a block:
 *   const t = Date.now();
 *   await doWork();
 *   recordMetric('checkout.duration', Date.now() - t);
 *
 *   // Or use the helper:
 *   const result = await measureAsync('analytics.cache.compute', myFn);
 */

const metrics = new Map(); // name → { count, totalMs, minMs, maxMs, lastMs }

/**
 * Record a single measurement (duration in ms).
 *
 * @param {string} name  Metric identifier, e.g. 'checkout.duration'.
 * @param {number} durationMs
 */
export const recordMetric = (name, durationMs) => {
    if (!metrics.has(name)) {
        metrics.set(name, { count: 0, totalMs: 0, minMs: Infinity, maxMs: -Infinity, lastMs: 0 });
    }
    const m = metrics.get(name);
    m.count += 1;
    m.totalMs += durationMs;
    m.minMs = Math.min(m.minMs, durationMs);
    m.maxMs = Math.max(m.maxMs, durationMs);
    m.lastMs = durationMs;
};

/**
 * Run an async function and record its wall-clock duration.
 *
 * @template T
 * @param {string} name
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export const measureAsync = async (name, fn) => {
    const start = Date.now();
    try {
        return await fn();
    } finally {
        recordMetric(name, Date.now() - start);
    }
};

/**
 * Return a snapshot of all recorded metrics.
 *
 * Shape:
 * {
 *   pid: 1234,
 *   uptime: 3600,
 *   metrics: {
 *     'checkout.duration': { count, avgMs, minMs, maxMs, lastMs }
 *   }
 * }
 */
export const getMetricsSummary = () => {
    const result = {};
    for (const [name, m] of metrics.entries()) {
        result[name] = {
            count: m.count,
            avgMs: m.count > 0 ? Math.round(m.totalMs / m.count) : 0,
            minMs: m.minMs === Infinity ? 0 : m.minMs,
            maxMs: m.maxMs === -Infinity ? 0 : m.maxMs,
            lastMs: m.lastMs,
        };
    }
    return {
        pid: process.pid,
        uptimeSeconds: Math.round(process.uptime()),
        instanceId: `${process.pid}`,
        note: 'In-process metrics only. Reset on restart. Not shared across cluster workers.',
        metrics: result,
    };
};

/**
 * Reset all metrics (useful in tests).
 */
export const resetMetrics = () => metrics.clear();
