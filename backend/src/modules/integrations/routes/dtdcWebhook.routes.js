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
import { processDtdcWebhook } from '../../../services/shipping/dtdcShipment.service.js';

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

    if (safeEqual(req.headers['x-webhook-secret'], secret)) return next();

    console.warn('[DTDC Webhook] Rejected: invalid or missing signature');
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
    const payload = req.body;

    const awbNumber = String(payload?.awb ?? payload?.awbNumber ?? payload?.reference_number ?? '').trim();
    const scanCode = String(payload?.status ?? payload?.scanCode ?? '').trim();

    // Bad payloads are acknowledged, not retried — they will never improve.
    if (!awbNumber) {
        return res.status(200).json(new ApiResponse(200, null, 'Ignored: missing AWB'));
    }
    if (!scanCode) {
        return res.status(200).json(new ApiResponse(200, null, 'Ignored: missing status'));
    }

    try {
        const { skipped, reason } = await processDtdcWebhook(awbNumber, scanCode, payload);

        return res.status(200).json(new ApiResponse(
            200,
            null,
            skipped ? `Acknowledged: ${reason || 'no action required'}` : 'Webhook processed'
        ));
    } catch (error) {
        // A genuine server-side fault. DTDC SHOULD retry this one, so say so.
        console.error(`[DTDC Webhook] Error processing AWB ${awbNumber}:`, error.message);
        return res.status(500).json({ success: false, message: 'Webhook processing failed' });
    }
}));

export default router;
