/**
 * DTDC API Client
 *
 * Single boundary for ALL HTTP communication with DTDC.
 * Uses native fetch (Node 18+). Never logs credentials.
 */

import dtdcConfig from '../../config/dtdc.js';
import crypto from 'crypto';

// ─── Custom Error ──────────────────────────────────────────────────────────────

export class DtdcApiError extends Error {
    /**
     * @param {string} message
     * @param {number} httpStatus
     * @param {*}      responseData — safe to store (never contains our own secrets)
     * @param {object} [context]
     */
    constructor(message, httpStatus = 0, responseData = null, context = {}) {
        super(message);
        this.name = 'DtdcApiError';
        this.httpStatus = httpStatus;
        this.responseData = responseData;
        this.correlationId = context.correlationId || null;
        this.endpoint = context.endpoint || null;
        /**
         * Whether the caller may safely try again. A 4xx means our payload is
         * wrong and repeating it just burns quota; a timeout or a 5xx means the
         * carrier is unwell and the same request could succeed later.
         */
        this.retryable = context.retryable ?? (httpStatus === 0 || httpStatus >= 500 || httpStatus === 429);
    }
}

// ─── Tracking Token Cache ──────────────────────────────────────────────────────

let _trackingToken = { value: null, expiresAt: 0 };

export const clearTrackingTokenCache = () => { _trackingToken = { value: null, expiresAt: 0 }; };

// ─── Fetch Helpers ─────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Execute a fetch with a timeout, bounded retries and a correlation id.
 *
 * Retries cover transport failures AND 5xx/429 responses. The original code
 * only retried when `fetch` itself threw, so a DTDC gateway returning 502 —
 * by far the most common transient failure — was surfaced as a hard error on
 * the first attempt.
 *
 * @param {string} url
 * @param {object} options
 * @param {number} retries additional attempts beyond the first
 */
const safeFetch = async (url, options = {}, retries = 0) => {
    const correlationId = crypto.randomUUID();
    const timeout = options.timeout ?? dtdcConfig.timeoutMs;
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timer);

            const transient = response.status >= 500 || response.status === 429;
            if (transient && attempt < retries) {
                lastError = new DtdcApiError(
                    `DTDC responded ${response.status}`,
                    response.status, null, { correlationId, endpoint: url }
                );
                await sleep(500 * 2 ** attempt);
                continue;
            }

            return { response, correlationId };
        } catch (err) {
            clearTimeout(timer);
            const isTimeout = err.name === 'AbortError';
            lastError = new DtdcApiError(
                isTimeout
                    ? `DTDC request timed out after ${timeout}ms`
                    : `DTDC network error: ${err.message}`,
                0, null, { correlationId, endpoint: url }
            );

            if (attempt < retries) {
                await sleep(500 * 2 ** attempt);
                continue;
            }
        }

        break;
    }

    throw lastError ?? new DtdcApiError('DTDC request failed', 0, null, { correlationId, endpoint: url });
};

/**
 * Read a response body once and return JSON when it parses, raw text otherwise.
 *
 * `response.json()` consumes the stream even when it throws, so the previous
 * `try json() catch text()` shape could never reach its fallback — every
 * non-JSON response came back as `null`. DTDC's tracking-auth endpoint answers
 * with a bare token string, which is exactly the case that mattered.
 */
const parseResponseBody = async (response) => {
    let text;
    try {
        text = await response.text();
    } catch {
        return null;
    }
    if (text === '' || text == null) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
};

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Book a consignment with DTDC.
 * NOT retried — booking is not idempotent, and a retried timeout is how a
 * customer ends up with two parcels and one payment.
 *
 * @param {object} consignmentData — single consignment payload
 * @returns {Promise<object>} — { reference_number, customer_reference_number, ... }
 */
export const createShipment = async (consignmentData) => {
    const endpoints = dtdcConfig.getEndpoints();

    const { response, correlationId } = await safeFetch(endpoints.booking, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': dtdcConfig.apiKey },
        body: JSON.stringify({ consignments: [consignmentData] }),
    });

    const body = await parseResponseBody(response);

    if (!response.ok) {
        throw new DtdcApiError(
            `DTDC booking failed (HTTP ${response.status})`,
            response.status, body, { correlationId, endpoint: 'booking' }
        );
    }

    const first = Array.isArray(body?.data) ? body.data[0] : null;

    if (body?.status !== 'OK' || !first?.success) {
        throw new DtdcApiError(
            `DTDC booking rejected: ${first?.message || first?.reason || 'no reason supplied'}`,
            response.status, body,
            // A rejection is a verdict on our payload, not a transient fault.
            { correlationId, endpoint: 'booking', retryable: false }
        );
    }

    if (!first.reference_number) {
        throw new DtdcApiError(
            'DTDC booking succeeded but returned no reference number',
            response.status, body, { correlationId, endpoint: 'booking', retryable: false }
        );
    }

    return first;
};

/**
 * Cancel a DTDC shipment by AWB number.
 * Retried — cancellation is idempotent.
 */
export const cancelShipment = async (awbNumber) => {
    const endpoints = dtdcConfig.getEndpoints();

    const { response, correlationId } = await safeFetch(endpoints.cancel, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': dtdcConfig.apiKey },
        body: JSON.stringify({ AWBNo: [awbNumber], customerCode: dtdcConfig.customerCode }),
    }, dtdcConfig.retryAttempts);

    const body = await parseResponseBody(response);

    if (!response.ok) {
        throw new DtdcApiError(
            `DTDC cancellation failed for ${awbNumber} (HTTP ${response.status})`,
            response.status, body, { correlationId, endpoint: 'cancel' }
        );
    }

    return body;
};

/**
 * Check pincode serviceability between origin and destination.
 */
export const checkServiceability = async (orgPincode, desPincode) => {
    const endpoints = dtdcConfig.getEndpoints();

    const { response, correlationId } = await safeFetch(endpoints.pincode, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgPincode, desPincode }),
    }, dtdcConfig.retryAttempts);

    const body = await parseResponseBody(response);

    if (!response.ok) {
        throw new DtdcApiError(
            'DTDC serviceability check failed',
            response.status, body, { correlationId, endpoint: 'pincode' }
        );
    }

    return body;
};

/**
 * Authenticate with DTDC tracking API and return a token.
 * Cached for 55 minutes (tokens last ~1 hour).
 */
export const authenticateTracking = async () => {
    if (_trackingToken.value && _trackingToken.expiresAt > Date.now()) {
        return _trackingToken.value;
    }

    if (!dtdcConfig.trackingUsername || !dtdcConfig.trackingPassword) {
        throw new DtdcApiError(
            'DTDC tracking credentials are not configured',
            0, null, { endpoint: 'trackingAuth', retryable: false }
        );
    }

    const endpoints = dtdcConfig.getEndpoints();
    const url = new URL(endpoints.trackingAuth);
    url.searchParams.set('username', dtdcConfig.trackingUsername);
    url.searchParams.set('password', dtdcConfig.trackingPassword);

    const { response, correlationId } = await safeFetch(url.toString(), { method: 'GET' }, 1);
    const body = await parseResponseBody(response);

    if (!response.ok) {
        throw new DtdcApiError(
            'DTDC tracking auth failed',
            response.status, body, { correlationId, endpoint: 'trackingAuth' }
        );
    }

    // DTDC answers with the bare token as text/plain; the object shapes below
    // are defensive against the gateway being changed to wrap it.
    const token = typeof body === 'string'
        ? body.trim()
        : body?.token || body?.access_token || body?.data?.token || null;

    if (!token) {
        throw new DtdcApiError(
            'Unable to extract tracking token from DTDC auth response',
            response.status, body, { correlationId, endpoint: 'trackingAuth' }
        );
    }

    _trackingToken = { value: token, expiresAt: Date.now() + 55 * 60 * 1000 };
    return token;
};

/**
 * Get tracking details for an AWB from DTDC.
 *
 * A 401 means the cached token expired early. The cache is cleared and the
 * call retried once with a fresh token, rather than surfacing a transient auth
 * failure to the vendor.
 */
export const getTrackingDetails = async (awbNumber, { allowReauth = true } = {}) => {
    const endpoints = dtdcConfig.getEndpoints();
    const token = await authenticateTracking();

    const { response, correlationId } = await safeFetch(endpoints.trackingDetails, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-access-token': token,
        },
        body: JSON.stringify({ trkType: 'cnno', strcnno: awbNumber, addtnlDtl: 'Y' }),
    }, dtdcConfig.retryAttempts);

    const body = await parseResponseBody(response);

    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            clearTrackingTokenCache();
            if (allowReauth) return getTrackingDetails(awbNumber, { allowReauth: false });
        }
        throw new DtdcApiError(
            `DTDC tracking lookup failed for ${awbNumber}`,
            response.status, body, { correlationId, endpoint: 'trackingDetails' }
        );
    }

    return body;
};

/**
 * Get shipping label PDF for an AWB.
 * Returns the raw Response object so the caller can stream it.
 */
export const getShippingLabel = async (awbNumber, format = 'pdf') => {
    const endpoints = dtdcConfig.getEndpoints();
    const url = new URL(endpoints.label);
    url.searchParams.set('reference_number', awbNumber);
    url.searchParams.set('label_code', 'SHIP_LABEL_4X6');
    url.searchParams.set('label_format', format);

    const { response, correlationId } = await safeFetch(url.toString(), {
        method: 'GET',
        headers: { 'api-key': dtdcConfig.apiKey },
    }, dtdcConfig.retryAttempts);

    if (!response.ok) {
        throw new DtdcApiError(
            `Failed to fetch shipping label for ${awbNumber} (HTTP ${response.status})`,
            response.status, null, { correlationId, endpoint: 'label' }
        );
    }

    return response;
};

export default {
    createShipment,
    cancelShipment,
    checkServiceability,
    authenticateTracking,
    clearTrackingTokenCache,
    getTrackingDetails,
    getShippingLabel,
    DtdcApiError,
};
