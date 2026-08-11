/**
 * HTTP client for the integration suites.
 *
 * A thin wrapper over `fetch` that mirrors how the frontend actually calls the
 * API — same base path, same auth header shape, same `X-Experience` header the
 * `resolveExperience` middleware reads. Anything the browser sends, this sends.
 *
 * Responses are never thrown on. A 403 is frequently the assertion, so the
 * caller always receives `{ status, body, ok }` and decides what it means.
 */

import { getBaseUrl } from './server.mjs';
import { harnessConfig } from './config.mjs';

const API_PREFIX = '/api';

/**
 * @typedef {object} ApiResult
 * @property {number} status      HTTP status code
 * @property {boolean} ok         status in the 2xx range
 * @property {any} body           parsed JSON envelope, or raw text when not JSON
 * @property {any} data           `body.data` when the standard ApiResponse envelope is present
 * @property {string} message     `body.message` when present
 * @property {Headers} headers
 */

/**
 * Issue a request against the running API.
 *
 * @param {string} method
 * @param {string} routePath          e.g. '/user/orders' (the '/api' prefix is added)
 * @param {object} [options]
 * @param {object} [options.body]     JSON body
 * @param {string} [options.token]    bearer token
 * @param {string} [options.experience] value for the X-Experience header
 * @param {object} [options.query]    query-string parameters
 * @param {object} [options.headers]  additional headers
 * @returns {Promise<ApiResult>}
 */
export const request = async (method, routePath, options = {}) => {
    const { body, token, experience, query, headers = {} } = options;

    const url = new URL(`${getBaseUrl()}${API_PREFIX}${routePath}`);
    if (query && typeof query === 'object') {
        Object.entries(query).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                url.searchParams.set(key, String(value));
            }
        });
    }

    const finalHeaders = { Accept: 'application/json', ...headers };
    if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
    if (experience) finalHeaders['X-Experience'] = experience;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), harnessConfig.requestTimeoutMs);

    let response;
    try {
        response = await fetch(url, {
            method,
            headers: finalHeaders,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal,
        });
    } catch (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
            throw new Error(
                `${method} ${routePath} timed out after ${harnessConfig.requestTimeoutMs}ms`
            );
        }
        throw err;
    }
    clearTimeout(timer);

    const raw = await response.text();
    let parsed = raw;
    try {
        parsed = raw ? JSON.parse(raw) : null;
    } catch {
        // Non-JSON response (HTML error page, empty body) — keep the text so
        // the failure message shows what actually came back.
    }

    const result = {
        status: response.status,
        ok: response.ok,
        body: parsed,
        data: parsed && typeof parsed === 'object' ? parsed.data : undefined,
        message: parsed && typeof parsed === 'object' ? parsed.message : undefined,
        headers: response.headers,
    };

    if (harnessConfig.verbose) {
        console.log(`[harness] ${method} ${routePath} → ${result.status} ${result.message ?? ''}`);
    }

    return result;
};

export const get = (routePath, options) => request('GET', routePath, options);
export const post = (routePath, options) => request('POST', routePath, options);
export const put = (routePath, options) => request('PUT', routePath, options);
export const patch = (routePath, options) => request('PATCH', routePath, options);
export const del = (routePath, options) => request('DELETE', routePath, options);

/**
 * Bind a token (and optionally an experience) so a suite reads as the actor
 * performing the action rather than repeating credentials on every line.
 *
 * @param {string} token
 * @param {string} [experience]
 */
export const asActor = (token, experience) => ({
    get: (routePath, options = {}) => get(routePath, { token, experience, ...options }),
    post: (routePath, options = {}) => post(routePath, { token, experience, ...options }),
    put: (routePath, options = {}) => put(routePath, { token, experience, ...options }),
    patch: (routePath, options = {}) => patch(routePath, { token, experience, ...options }),
    del: (routePath, options = {}) => del(routePath, { token, experience, ...options }),
});

/** Render a result compactly for assertion failure messages. */
export const describeResult = (result) => {
    const detail = result?.body?.errors
        ? ` errors=${JSON.stringify(result.body.errors)}`
        : '';
    return `HTTP ${result?.status} "${result?.message ?? ''}"${detail}`;
};
