/**
 * Interakt WhatsApp Webhook Routes
 *
 * POST /api/integrations/webhook/whatsapp — delivery-status callbacks.
 *
 * ── ACTIVATION STATUS ──────────────────────────────────────────────────────
 * This endpoint is INERT until `INTERAKT_WEBHOOK_SECRET` is configured. The
 * secret has not been issued for this account yet, so the route is mounted and
 * fully tested but rejects every request: an unauthenticated endpoint that
 * accepts vendor-shaped payloads is not something to leave open "until the
 * secret arrives".
 *
 * ── THREE RULES SHAPE EVERYTHING HERE ──────────────────────────────────────
 *
 * First, an unauthenticated caller must never be able to influence anything.
 * The signature check is a hard gate and fails closed when unconfigured.
 *
 * Second, Interakt requires a 200 within THREE SECONDS, performs NO retries,
 * and disables the webhook entirely after five failures in ten minutes. So the
 * handler acknowledges first and does its work afterwards. Nothing that can
 * block — no database round-trip, no outbound call — happens before the
 * response is sent.
 *
 * Third, a delivery failure never mints a new OTP. The code already exists and
 * is already stored; issuing another one from a background callback would
 * invalidate the code the user may be mid-way through typing, and would do it
 * without anyone asking. Recovery is the user's explicit resend, and the email
 * fallback that already went out alongside.
 */

import { Router } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import whatsappConfig from '../../../config/whatsapp.js';

const router = Router();

/**
 * Length-safe constant-time comparison.
 *
 * `crypto.timingSafeEqual` throws RangeError when the buffers differ in length,
 * so feeding it an attacker-controlled header turns every malformed signature
 * into an unhandled 500 — and a 500 is itself an oracle telling the caller
 * their guess was the wrong *length*.
 */
const safeEqual = (a, b) => {
    const bufA = Buffer.from(String(a ?? ''), 'utf8');
    const bufB = Buffer.from(String(b ?? ''), 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Verify the `Interakt-Signature` header: HMAC-SHA256 over the RAW body,
 * hex encoded, prefixed `sha256=`.
 *
 * The raw body is preserved globally by the `express.json({ verify })` hook in
 * app.js. Re-serialising `req.body` would not reproduce the signed bytes — key
 * order and whitespace both change — so the raw buffer is the only valid input.
 */
export const verifyInteraktSignature = (req, res, next) => {
    const secret = whatsappConfig.webhookSecret;

    // Fail closed, in every environment. There is no development convenience
    // worth an open endpoint here, and a silently-accepted unsigned webhook is
    // exactly the bug this check exists to prevent.
    if (!secret) {
        console.warn('[WhatsApp Webhook] Rejected: INTERAKT_WEBHOOK_SECRET is not configured');
        return res.status(503).json({ success: false, message: 'Webhook not configured' });
    }

    const header = req.headers['interakt-signature'];
    if (!header || typeof header !== 'string') {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!req.rawBody) {
        // Without the exact signed bytes the signature cannot be checked, and
        // an unverifiable request is an unauthorised one.
        console.warn('[WhatsApp Webhook] Rejected: raw body unavailable');
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Accept `sha256=<hex>`; tolerate a bare hex digest from a future revision.
    const provided = header.startsWith('sha256=') ? header.slice(7) : header;
    const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');

    if (!safeEqual(provided, expected)) {
        console.warn('[WhatsApp Webhook] Rejected: invalid signature');
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    return next();
};

/**
 * A generous ceiling that still bounds what a leaked secret can do, and stops
 * an unauthenticated flood from reaching the HMAC computation at volume.
 */
const webhookRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many webhook requests' },
});

/** Delivery-status events Interakt emits for API-initiated template sends. */
const STATUS_EVENTS = new Set([
    'message_api_sent',
    'message_api_delivered',
    'message_api_read',
    'message_api_failed',
]);

/**
 * Record what the callback reported.
 *
 * Runs AFTER the response has been sent, so it can never contribute to the
 * three-second budget. Deliberately observational: it writes a log line and
 * nothing else. It does not touch the OTP record, and above all it does not
 * issue a replacement code — see the module note.
 */
export const processDeliveryEvent = (payload) => {
    const type = String(payload?.type || '').trim();
    if (!STATUS_EVENTS.has(type)) return { handled: false, reason: 'unsupported_event' };

    const message = payload?.data?.message || {};
    const callbackData = message?.meta_data?.source_data?.callback_data || null;

    // Only OTP sends carry this marker. Anything else is not ours to interpret.
    if (callbackData && !String(callbackData).startsWith('otp_')) {
        return { handled: false, reason: 'not_an_otp_message' };
    }

    if (type === 'message_api_failed') {
        // Operator signal only. The user's recovery path is the email that was
        // already sent alongside, plus an explicit resend.
        console.warn('[WhatsApp Webhook] OTP delivery failed', JSON.stringify({
            messageId: message?.id || null,
            errorCode: message?.channel_error_code || null,
            reason: message?.channel_failure_reason || null,
            callbackData,
        }));
        return { handled: true, status: 'failed' };
    }

    console.log('[WhatsApp Webhook] OTP delivery status', JSON.stringify({
        messageId: message?.id || null,
        status: message?.message_status || type,
        callbackData,
    }));
    return { handled: true, status: message?.message_status || type };
};

/**
 * POST /webhook/whatsapp
 *
 * Always answers 200 once the signature is valid — including for payloads we
 * do not act on. Interakt performs no retries and disables the webhook after
 * repeated non-200s, so answering 4xx/5xx to an event that will never become
 * actionable only costs us the endpoint.
 */
router.post('/webhook/whatsapp', webhookRateLimiter, verifyInteraktSignature, (req, res) => {
    const payload = req.body;

    // Acknowledge FIRST. Everything below this line is after the fact.
    res.status(200).json({ success: true });

    setImmediate(() => {
        try {
            processDeliveryEvent(payload);
        } catch (error) {
            console.error('[WhatsApp Webhook] Post-acknowledgement processing failed:', error.message);
        }
    });
});

export default router;
