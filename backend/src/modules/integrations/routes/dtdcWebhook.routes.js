/**
 * DTDC Webhook Routes
 *
 * POST /api/integrations/webhook/dtdc — receives tracking push events from DTDC.
 *
 * Two rules shape everything here.
 *
 * First, an unauthenticated caller must never be able to move an order. The
 * secret check is therefore a hard gate, and in production a missing secret
 * fails closed rather than waving traffic through with a log line.
 *
 * Second, once a request IS authentic, DTDC must be told "received" for
 * anything we are not going to act on — an unknown AWB, a replayed event, a
 * scan code we do not model. Answering 4xx/5xx to those only earns a retry
 * storm for an event that will never become actionable.
 */

import { Router } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import dtdcConfig from '../../../config/dtdc.js';
import { processDtdcWebhook, parseDtdcPushPayload } from '../../../services/shipping/dtdcShipment.service.js';

const router = Router();

/**
 * Length-safe constant-time comparison.
 *
 * `crypto.timingSafeEqual` throws RangeError when the buffers differ in
 * length, so feeding it an attacker-controlled header turned every malformed
 * signature into an unhandled 500 rather than a 401 — and a 500 is itself an
 * oracle telling the caller their guess was the wrong *length*.
 */
const safeEqual = (a, b) => {
    const bufA = Buffer.from(String(a ?? ''), 'utf8');
    const bufB = Buffer.from(String(b ?? ''), 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Verify DTDC webhook authenticity.
 *
 * Accepts either:
 *   - `x-dtdc-signature`: HMAC-SHA256 of the raw body, hex encoded;
 *   - `x-webhook-secret`: the shared secret verbatim.
 */
const verifyDtdcWebhook = (req, res, next) => {
    const secret = dtdcConfig.webhookSecret;

    if (!secret) {
        // Fail closed in production. An unauthenticated endpoint that writes
        // order status is a far worse outage than a rejected webhook.
        if (dtdcConfig.environment === 'production' || process.env.NODE_ENV === 'production') {
            console.error('[DTDC Webhook] Rejected: DTDC_WEBHOOK_SECRET is not configured');
            return res.status(503).json({ success: false, message: 'Webhook not configured' });
        }
        console.warn('[DTDC Webhook] No DTDC_WEBHOOK_SECRET configured — accepting unsigned request (non-production only)');
        return next();
    }

    const signature = req.headers['x-dtdc-signature'];
    if (signature && req.rawBody) {
        const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
        if (safeEqual(signature, expected)) return next();
    }

    /**
     * Header names DTDC actually uses for the shared token.
     *
     * `token` is the one their integration team sends — confirmed from the test
     * curl they ran against this endpoint. The others are accepted because the
     * document only says "the Authentication Token if any" without naming a
     * header, and refusing a correct secret over a header-name disagreement is
     * a pointless outage.
     *
     * Every candidate is compared in constant time against the same secret, so
     * accepting several names widens no attack surface: an attacker still has
     * to produce the secret itself.
     */
    const tokenHeaders = ['x-webhook-secret', 'token', 'x-api-key', 'authorization'];
    for (const header of tokenHeaders) {
        const value = req.headers[header];
        if (!value) continue;
        // Tolerate "Bearer <token>" on the authorization header.
        const candidate = String(value).replace(/^Bearer\s+/i, '').trim();
        if (safeEqual(candidate, secret)) return next();
    }

    console.warn('[DTDC Webhook] Rejected: invalid or missing token');
    return res.status(401).json({ success: false, message: 'Unauthorized' });
};

/**
 * A generous ceiling that still bounds the damage a leaked secret can do, and
 * stops an unauthenticated flood from reaching the signature check at volume.
 */
const webhookRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many webhook requests' },
});

/**
 * POST /webhook/dtdc
 *
 * Expected payload:
 *   {
 *     awb: "X0012189453",
 *     status: "DEL",
 *     location: "Mumbai",
 *     description: "Delivered to consignee",
 *     timestamp: "2024-01-15T10:30:00Z"
 *   }
 */
router.post('/webhook/dtdc', webhookRateLimiter, verifyDtdcWebhook, asyncHandler(async (req, res) => {
    // DTDC pushes an envelope carrying a shipment and an ARRAY of incremental
    // scan events, not a single flat event. See `parseDtdcPushPayload`.
    const { awbNumber, events } = parseDtdcPushPayload(req.body);

    // Bad payloads are acknowledged, not retried — they will never improve.
    if (!awbNumber) {
        return res.status(200).json(new ApiResponse(200, null, 'Ignored: missing AWB'));
    }
    if (events.length === 0) {
        return res.status(200).json(new ApiResponse(200, null, 'Ignored: no scan events'));
    }

    try {
        // Oldest first, so the shipment walks its ladder in the order the
        // parcel actually moved rather than the order the array happened to
        // arrive in.
        const ordered = [...events].sort((a, b) => {
            const at = a.occurredAt ? a.occurredAt.getTime() : 0;
            const bt = b.occurredAt ? b.occurredAt.getTime() : 0;
            return at - bt;
        });

        let applied = 0;
        let lastReason = null;

        for (const event of ordered) {
            const { skipped, reason } = await processDtdcWebhook(
                awbNumber,
                event.scanCode,
                { ...event.raw, description: event.description, location: event.location, reason: event.remarks },
                event.occurredAt
            );
            if (skipped) lastReason = reason;
            else applied += 1;
        }

        return res.status(200).json(new ApiResponse(
            200,
            null,
            applied > 0
                ? `Processed ${applied} of ${ordered.length} event(s)`
                : `Acknowledged: ${lastReason || 'no action required'}`
        ));
    } catch (error) {
        // A genuine server-side fault. DTDC SHOULD retry this one, so say so.
        console.error(`[DTDC Webhook] Error processing AWB ${awbNumber}:`, error.message);
        return res.status(500).json({ success: false, message: 'Webhook processing failed' });
    }
}));

export default router;
