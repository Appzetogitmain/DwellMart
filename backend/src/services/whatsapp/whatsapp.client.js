/**
 * Interakt WhatsApp API Client
 *
 * Single boundary for ALL HTTP communication with Interakt.
 * Uses native fetch (Node 18+). Never logs credentials.
 *
 * Deliberately NOT retried
 * ────────────────────────
 * The DTDC client documents why booking is not retried: a retried timeout is
 * how a customer ends up with two parcels and one payment. The same reasoning
 * is sharper here. A WhatsApp send is not idempotent — Interakt allocates a
 * message id per call — so retrying an ambiguous response delivers two
 * messages, bills twice, and leaves the user holding two codes when only the
 * newest one verifies. Resending is a user-initiated action, never automatic.
 */

import crypto from 'crypto';
import whatsappConfig from '../../config/whatsapp.js';
import { splitE164, maskPhone } from '../../utils/phone.js';
import { buildOtpTemplatePayload } from './whatsapp.templates.js';

// ─── Custom Error ──────────────────────────────────────────────────────────────

export class WhatsAppApiError extends Error {
    /**
     * @param {string} message
     * @param {number} httpStatus
     * @param {*}      responseData — Interakt's body; never contains our own secrets
     * @param {object} [context]
     */
    constructor(message, httpStatus = 0, responseData = null, context = {}) {
        super(message);
        this.name = 'WhatsAppApiError';
        this.httpStatus = httpStatus;
        this.responseData = responseData;
        this.correlationId = context.correlationId || null;
        this.endpoint = context.endpoint || null;
        this.reason = context.reason || null;
        /**
         * Whether a LATER, user-initiated resend could plausibly succeed. This
         * never triggers an automatic retry — it only tells the caller whether
         * the failure was transient (offer resend) or terminal (fall back).
         */
        this.retryable = context.retryable
            ?? (httpStatus === 0 || httpStatus >= 500 || httpStatus === 429);
    }
}

// ─── Response Parsing ──────────────────────────────────────────────────────────

/**
 * Read a response body once and return JSON when it parses, raw text otherwise.
 *
 * `response.json()` consumes the stream even when it throws, so a
 * `try json() catch text()` shape can never reach its fallback. Interakt
 * returns HTML from its edge on some error paths, which is exactly that case.
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

/** Truncate an upstream body before it reaches a log line. */
const summarise = (body) => {
    if (body == null) return null;
    const asText = typeof body === 'string' ? body : JSON.stringify(body);
    return asText.length > 300 ? `${asText.slice(0, 300)}…` : asText;
};

// ─── Payload Construction ──────────────────────────────────────────────────────

/**
 * Build the complete Interakt send payload for an OTP.
 *
 * Exported separately from the send so payload construction can be asserted
 * without a network stub, and so dry-run and live mode provably build the
 * identical object rather than two that merely look alike.
 *
 * @param {object} params
 * @param {string} params.phoneE164      destination in E.164
 * @param {string} params.code           verification code
 * @param {string} [params.callbackData] echoed back on delivery webhooks
 * @throws {WhatsAppApiError} when the destination cannot be addressed
 */
export const buildOtpPayload = ({ phoneE164, code, callbackData = '' }) => {
    const parts = splitE164(phoneE164);
    if (!parts) {
        throw new WhatsAppApiError(
            'Destination phone is not a valid E.164 number',
            0, null, { reason: 'invalid_phone', retryable: false }
        );
    }

    return {
        // Interakt requires these as SEPARATE fields, and the national part
        // must not repeat the dial code.
        countryCode: parts.countryCode,
        phoneNumber: parts.phoneNumber,
        type: 'Template',
        ...(callbackData ? { callbackData: String(callbackData).slice(0, 512) } : {}),
        template: buildOtpTemplatePayload({ code, languageCode: whatsappConfig.templateLanguage }),
    };
};

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Send an OTP over WhatsApp. Never retried — see the module note.
 *
 * @returns {Promise<{sent: boolean, messageId: string|null, dryRun: boolean, correlationId: string}>}
 * @throws  {WhatsAppApiError} on any failure; the caller falls back to email
 */
export const sendOtpMessage = async ({ phoneE164, code, callbackData = '' }) => {
    const correlationId = crypto.randomUUID();

    const reason = whatsappConfig.unavailableReason();
    if (reason) {
        throw new WhatsAppApiError(
            `WhatsApp unavailable: ${reason}`,
            0, null, { correlationId, reason, retryable: false }
        );
    }

    // Throws on an unaddressable number before any network work happens.
    const payload = buildOtpPayload({ phoneE164, code, callbackData });
    const endpoint = whatsappConfig.endpoints.message;

    if (whatsappConfig.dryRun) {
        // The code itself is never logged — only the shape of the request.
        console.log('[WhatsApp][dry-run] would POST', JSON.stringify({
            endpoint,
            correlationId,
            countryCode: payload.countryCode,
            phoneNumber: maskPhone(payload.phoneNumber),
            template: payload.template.name,
            languageCode: payload.template.languageCode,
            bodyValueCount: payload.template.bodyValues.length,
            hasButtonValues: Boolean(payload.template.buttonValues),
        }));
        return { sent: true, messageId: null, dryRun: true, correlationId };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), whatsappConfig.timeoutMs);

    let response;
    try {
        response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                // Interakt's key is ALREADY base64. Re-encoding it yields a 401.
                Authorization: `Basic ${whatsappConfig.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
    } catch (err) {
        const isTimeout = err.name === 'AbortError';
        throw new WhatsAppApiError(
            isTimeout
                ? `Interakt request timed out after ${whatsappConfig.timeoutMs}ms`
                : `Interakt network error: ${err.message}`,
            0, null,
            { correlationId, endpoint, reason: isTimeout ? 'timeout' : 'network', retryable: true }
        );
    } finally {
        clearTimeout(timer);
    }

    const body = await parseResponseBody(response);

    if (!response.ok) {
        throw new WhatsAppApiError(
            `Interakt responded ${response.status}`,
            response.status, summarise(body),
            { correlationId, endpoint, reason: `http_${response.status}` }
        );
    }

    // A 2xx carrying `result: false` is a rejected send, not a delivered one.
    if (body && typeof body === 'object' && body.result === false) {
        throw new WhatsAppApiError(
            `Interakt rejected the message: ${body.message || 'unknown reason'}`,
            response.status, summarise(body),
            { correlationId, endpoint, reason: 'rejected', retryable: false }
        );
    }

    const messageId = (body && typeof body === 'object' && body.id) ? String(body.id) : null;
    return { sent: true, messageId, dryRun: false, correlationId };
};

export default { sendOtpMessage, buildOtpPayload, WhatsAppApiError };
