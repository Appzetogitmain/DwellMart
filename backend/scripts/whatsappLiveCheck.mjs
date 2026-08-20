#!/usr/bin/env node
/**
 * One-shot live WhatsApp OTP check.
 *
 * Sends exactly ONE real message to WHATSAPP_TEST_PHONE and exits. This is an
 * operator tool, never part of an automated suite: every run costs a real
 * message credit and rings a real handset, so it refuses to run unless the
 * destination is stated explicitly and live mode is deliberately selected.
 *
 * Usage:
 *   node scripts/whatsappLiveCheck.mjs            # dry-run, costs nothing
 *   node scripts/whatsappLiveCheck.mjs --live     # sends ONE real message
 */

import 'dotenv/config';
import crypto from 'crypto';
import { toE164, maskPhone } from '../src/utils/phone.js';

const live = process.argv.includes('--live');

if (live) {
    process.env.WHATSAPP_ENABLED = 'true';
    process.env.WHATSAPP_OTP_ENABLED = 'true';
    process.env.WHATSAPP_DRY_RUN = 'false';
} else {
    process.env.WHATSAPP_ENABLED = 'true';
    process.env.WHATSAPP_OTP_ENABLED = 'true';
    process.env.WHATSAPP_DRY_RUN = 'true';
}

const { sendOtpMessage } = await import('../src/services/whatsapp/whatsapp.client.js');

const target = toE164(process.env.WHATSAPP_TEST_PHONE || '');
if (!target) {
    console.error('✗ WHATSAPP_TEST_PHONE is not set to a usable number.');
    process.exit(1);
}

if (live && !process.env.INTERAKT_API_KEY) {
    console.error('✗ INTERAKT_API_KEY is not set — cannot perform a live send.');
    process.exit(1);
}

const code = crypto.randomInt(100000, 999999).toString();

console.log(`→ mode=${live ? 'LIVE (one real message)' : 'dry-run'} target=${maskPhone(target)} template=otp_temp`);

try {
    const result = await sendOtpMessage({ phoneE164: target, code, callbackData: 'livecheck' });
    console.log('✓ send accepted:', JSON.stringify({
        sent: result.sent,
        dryRun: result.dryRun,
        messageId: result.messageId,
        correlationId: result.correlationId,
    }));
    if (live) console.log('  Check the handset. The code is not printed here by design.');
    process.exit(0);
} catch (error) {
    console.error('✗ send failed:', JSON.stringify({
        name: error.name,
        reason: error.reason,
        httpStatus: error.httpStatus,
        retryable: error.retryable,
        message: error.message,
        upstream: error.responseData,
    }));
    process.exit(1);
}
