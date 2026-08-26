/**
 * OTP channel selection — policy regression suite.
 *
 * The rules under test are the ones whose failure is silent or dangerous:
 * a reset code delivered to an unproven number, two channels carrying two
 * different codes, or a WhatsApp outage turning into a failed login.
 *
 * Runs without a database: the recipient is a minimal stand-in exposing the
 * fields the service actually touches, so the policy can be asserted directly.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    sendOTP,
    sendResetOTP,
    resolveWhatsAppEligibility,
    OtpPurpose,
    OtpChannel,
    OTP_EXPIRY_MS,
    OTP_EXPIRY_MINUTES,
    isOTPMatch,
} from '../../src/services/otp.service.js';

const realFetch = global.fetch;

/** Minimal stand-in for a Mongoose document. */
const makeRecipient = (overrides = {}) => ({
    _id: 'abc123',
    email: 'user@example.com',
    phoneE164: '+917869958637',
    phoneVerified: false,
    otp: undefined,
    otpExpiry: undefined,
    resetOtp: undefined,
    resetOtpExpiry: undefined,
    resetOtpVerified: undefined,
    saved: 0,
    async save() { this.saved += 1; },
    ...overrides,
});

const withEnv = async (overrides, fn) => {
    const saved = {};
    for (const [k, v] of Object.entries(overrides)) {
        saved[k] = process.env[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
    try {
        return await fn();
    } finally {
        for (const [k, v] of Object.entries(saved)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
        global.fetch = realFetch;
    }
};

/** WhatsApp live-ish, but with fetch stubbed. Email has no SMTP, so it fails. */
const WA_ON = {
    WHATSAPP_ENABLED: 'true',
    WHATSAPP_OTP_ENABLED: 'true',
    WHATSAPP_DRY_RUN: 'false',
    INTERAKT_API_KEY: 'TEST_KEY',
    USE_MOCK_OTP: undefined,
    NODE_ENV: 'test',
};

const okResponse = () => new Response(JSON.stringify({ result: true, id: 'm-1' }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
});

// ── The five-minute rule ─────────────────────────────────────────────────────

test('OTP validity is five minutes, matching the otp_temp template', () => {
    // A backend window longer than the template's validity would leave a code
    // valid after WhatsApp has already discarded the message carrying it.
    assert.equal(OTP_EXPIRY_MS, 5 * 60 * 1000);
    assert.equal(OTP_EXPIRY_MINUTES, 5);
});

test('the persisted expiry is five minutes out, for both purposes', async () => {
    await withEnv({ ...WA_ON, WHATSAPP_ENABLED: 'false' }, async () => {
        // Bracket the call rather than allowing a fixed tolerance: the expiry is
        // stamped at some instant inside [before, after], so the only correct
        // assertion is that it lands in that window plus OTP_EXPIRY_MS. A
        // tolerance-based check flakes on a loaded machine.
        const before = Date.now();
        const user = makeRecipient();
        await sendOTP(user, 'email_verification');
        const after = Date.now();

        const expiry = user.otpExpiry.getTime();
        assert.ok(
            expiry >= before + OTP_EXPIRY_MS && expiry <= after + OTP_EXPIRY_MS,
            `verification expiry ${expiry} outside [${before + OTP_EXPIRY_MS}, ${after + OTP_EXPIRY_MS}]`,
        );

        const resetBefore = Date.now();
        const resetUser = makeRecipient();
        await sendResetOTP(resetUser);
        const resetAfter = Date.now();

        const resetExpiry = resetUser.resetOtpExpiry.getTime();
        assert.ok(
            resetExpiry >= resetBefore + OTP_EXPIRY_MS && resetExpiry <= resetAfter + OTP_EXPIRY_MS,
            `reset expiry ${resetExpiry} outside its window`,
        );
    });
});

// ── One code, one record ─────────────────────────────────────────────────────

test('WhatsApp and email carry the SAME code against the SAME record', async () => {
    await withEnv(WA_ON, async () => {
        let sentCode = null;
        let storedAtSendTime = null;
        const user = makeRecipient();
        global.fetch = async (_u, opts) => {
            sentCode = JSON.parse(opts.body).template.bodyValues[0];
            storedAtSendTime = user.otp;
            return okResponse();
        };
        const result = await sendOTP(user, 'email_verification');

        assert.equal(sentCode, result.otp, 'WhatsApp must carry the generated code');
        assert.equal(user.otp, result.otp, 'the stored record must hold that same code');
        // Ordering matters: the code is persisted BEFORE it is sent, so a crash
        // mid-send can never leave the user holding a code we did not store.
        assert.equal(storedAtSendTime, result.otp, 'the code must be persisted before it is sent');
    });
});

test('the code is six digits from a cryptographic source, and differs per call', async () => {
    await withEnv({ ...WA_ON, WHATSAPP_ENABLED: 'false' }, async () => {
        const codes = new Set();
        for (let i = 0; i < 40; i += 1) {
            const u = makeRecipient();
            const r = await sendOTP(u, 'v');
            assert.match(r.otp, /^\d{6}$/);
            codes.add(r.otp);
        }
        assert.ok(codes.size > 30, `expected high entropy, got ${codes.size} distinct of 40`);
    });
});

test('purposes write to different fields and do not collide', async () => {
    await withEnv({ ...WA_ON, WHATSAPP_ENABLED: 'false' }, async () => {
        const user = makeRecipient();
        const verify = await sendOTP(user, 'email_verification');
        const reset = await sendResetOTP(user);

        assert.equal(user.otp, verify.otp, 'verification code must survive a reset request');
        assert.equal(user.resetOtp, reset.otp);
        assert.notEqual(user.otp, user.resetOtp);
        assert.equal(user.resetOtpVerified, false, 'a fresh reset code starts unverified');
    });
});

// ── Channel policy: verification ─────────────────────────────────────────────

test('registration/verification uses WhatsApp even when the phone is UNVERIFIED', async () => {
    // Sending the code is how the number becomes verified; requiring
    // verification first would be circular.
    await withEnv(WA_ON, async () => {
        global.fetch = async () => okResponse();
        const user = makeRecipient({ phoneVerified: false });
        const result = await sendOTP(user, 'email_verification');
        assert.equal(result.channel, OtpChannel.WHATSAPP);
        assert.equal(result.whatsappAttempted, true);
    });
});

// ── Channel policy: password reset ───────────────────────────────────────────

test('password reset REFUSES WhatsApp when the phone is unverified', async () => {
    await withEnv(WA_ON, async () => {
        let called = false;
        global.fetch = async () => { called = true; return okResponse(); };
        const user = makeRecipient({ phoneVerified: false });
        const result = await sendResetOTP(user);

        assert.equal(called, false, 'a reset code must never reach an unproven number');
        assert.equal(result.whatsappAttempted, false);
        assert.equal(result.failureReason, 'phone_not_verified');
        assert.notEqual(result.channel, OtpChannel.WHATSAPP);
    });
});

test('password reset USES WhatsApp once the phone is verified', async () => {
    await withEnv(WA_ON, async () => {
        global.fetch = async () => okResponse();
        const user = makeRecipient({ phoneVerified: true });
        const result = await sendResetOTP(user);
        assert.equal(result.channel, OtpChannel.WHATSAPP);
    });
});

test('eligibility matrix is exhaustive and explicit', () => {
    const cases = [
        [{ phoneE164: '+917869958637', phoneVerified: true }, OtpPurpose.VERIFICATION, true, null],
        [{ phoneE164: '+917869958637', phoneVerified: false }, OtpPurpose.VERIFICATION, true, null],
        [{ phoneE164: '+917869958637', phoneVerified: true }, OtpPurpose.PASSWORD_RESET, true, null],
        [{ phoneE164: '+917869958637', phoneVerified: false }, OtpPurpose.PASSWORD_RESET, false, 'phone_not_verified'],
        [{ phoneE164: null, phoneVerified: true }, OtpPurpose.VERIFICATION, false, 'no_valid_phone'],
        [{ phoneE164: '9876543210', phoneVerified: true }, OtpPurpose.VERIFICATION, false, 'no_valid_phone'],
        [{ phoneE164: 'garbage', phoneVerified: true }, OtpPurpose.VERIFICATION, false, 'no_valid_phone'],
        [{}, OtpPurpose.VERIFICATION, false, 'no_valid_phone'],
    ];

    const saved = { ...process.env };
    Object.assign(process.env, { WHATSAPP_ENABLED: 'true', WHATSAPP_OTP_ENABLED: 'true', WHATSAPP_DRY_RUN: 'true' });
    try {
        for (const [recipient, purpose, expected, reason] of cases) {
            const got = resolveWhatsAppEligibility(recipient, purpose);
            assert.equal(got.eligible, expected, `${JSON.stringify(recipient)} / ${purpose}`);
            if (reason) assert.equal(got.reason, reason);
        }
    } finally {
        process.env = saved;
    }
});

// ── Fallback behaviour ───────────────────────────────────────────────────────

test('every WhatsApp failure mode falls back instead of throwing', async () => {
    const failures = [
        ['http 500', async () => new Response('{}', { status: 500 })],
        ['http 401', async () => new Response('{}', { status: 401 })],
        ['http 429', async () => new Response('{}', { status: 429 })],
        ['result:false', async () => new Response(JSON.stringify({ result: false, message: 'no' }), { status: 200 })],
        ['network', async () => { throw new Error('ECONNREFUSED'); }],
        ['garbage body', async () => new Response('<html>oops</html>', { status: 502 })],
    ];

    for (const [label, stub] of failures) {
        await withEnv(WA_ON, async () => {
            global.fetch = stub;
            const user = makeRecipient();
            // Must resolve, never reject: an auth flow cannot 500 because a
            // vendor is unwell.
            const result = await sendOTP(user, 'email_verification');
            assert.equal(result.whatsappAttempted, true, label);
            assert.notEqual(result.channel, OtpChannel.WHATSAPP, label);
            assert.ok(result.failureReason, `${label} should record a reason`);
            assert.equal(user.otp, result.otp, `${label}: the code is still stored and usable`);
        });
    }
});

test('a recipient with no phone goes straight to email without calling out', async () => {
    await withEnv(WA_ON, async () => {
        let called = false;
        global.fetch = async () => { called = true; return okResponse(); };
        const user = makeRecipient({ phoneE164: null });
        const result = await sendOTP(user, 'email_verification');
        assert.equal(called, false);
        assert.equal(result.whatsappAttempted, false);
        assert.equal(result.failureReason, 'no_valid_phone');
    });
});

test('disabling WhatsApp preserves the original email-only behaviour', async () => {
    await withEnv({ ...WA_ON, WHATSAPP_ENABLED: 'false' }, async () => {
        let called = false;
        global.fetch = async () => { called = true; return okResponse(); };
        const user = makeRecipient();
        const result = await sendOTP(user, 'email_verification');
        assert.equal(called, false);
        assert.equal(result.whatsappAttempted, false);
        assert.equal(user.otp, result.otp);
    });
});

// ── Dual delivery ────────────────────────────────────────────────────────────

test('dual delivery still reports WhatsApp as the primary channel', async () => {
    await withEnv({ ...WA_ON, WHATSAPP_OTP_DUAL_DELIVERY: 'true' }, async () => {
        global.fetch = async () => okResponse();
        const user = makeRecipient();
        const result = await sendOTP(user, 'email_verification');
        // Email is a safety net, not the headline. The UI tells the user where
        // to look, and it should say WhatsApp.
        assert.equal(result.channel, OtpChannel.WHATSAPP);
    });
});

test('dual delivery does not generate a second code or a second record write', async () => {
    await withEnv({ ...WA_ON, WHATSAPP_OTP_DUAL_DELIVERY: 'true' }, async () => {
        const sent = [];
        global.fetch = async (_u, opts) => { sent.push(JSON.parse(opts.body).template.bodyValues[0]); return okResponse(); };
        const user = makeRecipient();
        const result = await sendOTP(user, 'email_verification');
        assert.equal(sent.length, 1, 'exactly one WhatsApp send');
        assert.equal(user.otp, result.otp, 'one code, held on one record');
        // Writes are to the SAME document, never a second OTP record.
        assert.ok(user.saved >= 1 && user.saved <= 2, `unexpected write count ${user.saved}`);
    });
});

// ── No automatic resend ──────────────────────────────────────────────────────

test('a failed WhatsApp send is never automatically retried', async () => {
    await withEnv(WA_ON, async () => {
        let calls = 0;
        global.fetch = async () => { calls += 1; return new Response('{}', { status: 500 }); };
        await sendOTP(makeRecipient(), 'email_verification');
        assert.equal(calls, 1, 'auto-resend would bill twice and issue conflicting codes');
    });
});

test('each explicit resend issues a NEW code that supersedes the old one', async () => {
    await withEnv({ ...WA_ON, WHATSAPP_ENABLED: 'false' }, async () => {
        const user = makeRecipient();
        const first = await sendOTP(user, 'email_verification');
        const second = await sendOTP(user, 'email_verification');
        assert.notEqual(first.otp, second.otp);
        assert.equal(user.otp, second.otp, 'the newest code is the stored one');
        assert.equal(isOTPMatch(user.otp, first.otp), false, 'the superseded code must no longer verify');
        assert.equal(isOTPMatch(user.otp, second.otp), true);
    });
});

// ── Secrecy ──────────────────────────────────────────────────────────────────

test('a WhatsApp failure never logs the code or the full phone number', async () => {
    const lines = [];
    const origWarn = console.warn;
    const origLog = console.log;
    console.warn = (...a) => lines.push(a.map(String).join(' '));
    console.log = (...a) => lines.push(a.map(String).join(' '));
    let code = null;
    try {
        await withEnv(WA_ON, async () => {
            global.fetch = async () => new Response('{}', { status: 500 });
            const r = await sendOTP(makeRecipient(), 'email_verification');
            code = r.otp;
        });
    } finally {
        console.warn = origWarn;
        console.log = origLog;
    }
    const output = lines.join('\n');
    assert.ok(!output.includes(code), 'the OTP code must never be logged');
    assert.ok(!output.includes('7869958637'), 'the full phone must never be logged');
});
