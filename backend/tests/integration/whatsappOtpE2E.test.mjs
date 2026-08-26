/**
 * WhatsApp OTP — end-to-end flows against a real database.
 *
 * Boots an in-memory MongoDB with the real Mongoose models and stubs
 * `global.fetch` so the Interakt client is exercised for real without touching
 * the live vendor. Every flow here is one the specification names, plus the
 * security cases that decide whether the feature is safe to ship.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import User from '../../src/models/User.model.js';
import {
    sendOTP,
    sendResetOTP,
    sendPhoneVerificationOTP,
    isOTPMatch,
    OtpChannel,
    OTP_EXPIRY_MS,
} from '../../src/services/otp.service.js';

let mongod;
const realFetch = global.fetch;

/** Records every Interakt call the client makes. */
let interaktCalls = [];
let interaktHandler = null;

const okResponse = () => new Response(JSON.stringify({ result: true, id: 'msg-1' }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
});

test.before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { dbName: 'whatsapp_otp_e2e' });

    global.fetch = async (url, options) => {
        interaktCalls.push({ url: String(url), body: JSON.parse(options.body) });
        return interaktHandler ? interaktHandler() : okResponse();
    };

    Object.assign(process.env, {
        WHATSAPP_ENABLED: 'true',
        WHATSAPP_OTP_ENABLED: 'true',
        WHATSAPP_DRY_RUN: 'false',
        INTERAKT_API_KEY: 'TEST_KEY_NOT_REAL',
        WHATSAPP_DEFAULT_COUNTRY_CODE: '+91',
        NODE_ENV: 'test',
    });
    delete process.env.USE_MOCK_OTP;
});

test.after(async () => {
    global.fetch = realFetch;
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

test.beforeEach(async () => {
    interaktCalls = [];
    interaktHandler = null;
    await User.deleteMany({});
});

const makeUser = async (overrides = {}) => User.create({
    name: 'Test User',
    email: `u${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`,
    password: 'Password123!',
    phone: '7869958637',
    phoneE164: '+917869958637',
    ...overrides,
});

/** The verification step as the controller performs it. */
const verifyAccountOtp = async (user, submitted) => {
    const fresh = await User.findById(user._id).select('+otp +otpExpiry +otpDeliveredVia');
    if (!isOTPMatch(fresh.otp, submitted)) return { ok: false, reason: 'invalid' };
    if (fresh.otpExpiry < Date.now()) return { ok: false, reason: 'expired' };

    fresh.isVerified = true;
    if (fresh.otpDeliveredVia === 'whatsapp') fresh.phoneVerified = true;
    fresh.otp = undefined;
    fresh.otpExpiry = undefined;
    fresh.otpDeliveredVia = undefined;
    await fresh.save();
    return { ok: true };
};

// ── FLOW 1: registration over WhatsApp ───────────────────────────────────────

test('FLOW 1: register → WhatsApp OTP → verify → account verified', async () => {
    const user = await makeUser();
    const delivery = await sendOTP(user, 'email_verification');

    assert.equal(delivery.channel, OtpChannel.WHATSAPP);
    assert.equal(interaktCalls.length, 1);
    assert.equal(interaktCalls[0].body.template.name, 'otp_temp');
    assert.deepEqual(interaktCalls[0].body.template.bodyValues, [delivery.otp]);
    assert.deepEqual(interaktCalls[0].body.template.buttonValues, { 0: [delivery.otp] });

    const result = await verifyAccountOtp(user, delivery.otp);
    assert.equal(result.ok, true);

    const stored = await User.findById(user._id);
    assert.equal(stored.isVerified, true);
});

test('FLOW 1b: WhatsApp-only delivery proves the phone and sets phoneVerified', async () => {
    const user = await makeUser();
    const delivery = await sendPhoneVerificationOTP(user);

    assert.equal(delivery.channel, OtpChannel.WHATSAPP);
    assert.equal(delivery.emailSent, false, 'phone proof requires WhatsApp to be the sole carrier');
    assert.equal(delivery.provenance, 'whatsapp');

    await verifyAccountOtp(user, delivery.otp);
    const stored = await User.findById(user._id);
    assert.equal(stored.phoneVerified, true);
});

test('FLOW 1c: the phone is proven if and ONLY if email did not also carry the code', async () => {
    // The security-bearing invariant. If the same code reached the inbox,
    // possession proves nothing about the handset, and treating it as proof
    // would let email-only access unlock the WhatsApp password-reset path.
    //
    // Note: this environment has no SMTP host, so `emailSent` is false here and
    // WhatsApp genuinely IS the sole carrier — which is exactly why the
    // assertion is written against `emailSent` rather than against the
    // dual-delivery switch. The switch expresses intent; `emailSent` records
    // what actually happened, and only that can justify trusting the number.
    const saved = process.env.WHATSAPP_OTP_DUAL_DELIVERY;
    process.env.WHATSAPP_OTP_DUAL_DELIVERY = 'true';
    try {
        const user = await makeUser();
        const delivery = await sendOTP(user, 'email_verification');

        assert.equal(
            delivery.provenance === 'whatsapp',
            delivery.emailSent === false,
            'provenance must be whatsapp exactly when email did not carry the code',
        );

        await verifyAccountOtp(user, delivery.otp);
        const stored = await User.findById(user._id);
        assert.equal(
            stored.phoneVerified === true,
            delivery.provenance === 'whatsapp',
            'phoneVerified must follow provenance, never the mere presence of a phone',
        );
    } finally {
        if (saved === undefined) delete process.env.WHATSAPP_OTP_DUAL_DELIVERY;
        else process.env.WHATSAPP_OTP_DUAL_DELIVERY = saved;
    }
});

test('FLOW 1d: when email DOES carry the code, the phone is not proven', async () => {
    // Directly exercises the branch the environment above cannot reach, by
    // asserting the provenance rule itself rather than a delivery side effect.
    const user = await makeUser();
    const delivery = await sendOTP(user, 'email_verification');

    // Simulate the production case: email went out alongside WhatsApp.
    const fresh = await User.findById(user._id).select('+otp +otpExpiry +otpDeliveredVia');
    fresh.otpDeliveredVia = 'email';
    await fresh.save();

    await verifyAccountOtp(user, delivery.otp);
    const stored = await User.findById(user._id);
    assert.notEqual(stored.phoneVerified, true, 'a code that also reached the inbox proves nothing');
    assert.equal(stored.isVerified, true, 'the account is still verified');
});

// ── FLOW 2 & 3: login, and the fallback ──────────────────────────────────────

test('FLOW 2: login verification is delivered over WhatsApp', async () => {
    const user = await makeUser({ isVerified: false });
    const delivery = await sendOTP(user, 'email_verification');
    assert.equal(delivery.channel, OtpChannel.WHATSAPP);
    assert.equal((await verifyAccountOtp(user, delivery.otp)).ok, true);
});

test('FLOW 3: WhatsApp unavailable → email fallback, and the code still verifies', async () => {
    interaktHandler = () => new Response('{}', { status: 500 });
    const user = await makeUser();
    const delivery = await sendOTP(user, 'email_verification');

    assert.equal(delivery.whatsappAttempted, true);
    assert.notEqual(delivery.channel, OtpChannel.WHATSAPP);
    assert.ok(delivery.failureReason);

    // The essential property: the outage costs the user nothing.
    assert.equal((await verifyAccountOtp(user, delivery.otp)).ok, true);
});

// ── FLOW 4 & 5: password reset ───────────────────────────────────────────────

test('FLOW 4: verified phone → reset OTP goes over WhatsApp', async () => {
    const user = await makeUser({ phoneVerified: true, isVerified: true });
    const delivery = await sendResetOTP(user);

    assert.equal(delivery.channel, OtpChannel.WHATSAPP);
    const stored = await User.findById(user._id).select('+resetOtp +resetOtpExpiry +resetOtpVerified');
    assert.equal(stored.resetOtp, delivery.otp);
    assert.equal(stored.resetOtpVerified, false);
});

test('FLOW 5: UNVERIFIED phone → reset OTP must NOT touch WhatsApp', async () => {
    const user = await makeUser({ phoneVerified: false, isVerified: true });
    const delivery = await sendResetOTP(user);

    assert.equal(interaktCalls.length, 0, 'a password-reset code must never reach an unproven number');
    assert.equal(delivery.failureReason, 'phone_not_verified');
    assert.notEqual(delivery.channel, OtpChannel.WHATSAPP);
});

test('FLOW 5b: changing the phone revokes verification, closing the reset path', async () => {
    const user = await makeUser({ phoneVerified: true, isVerified: true });
    user.phoneE164 = '+919999900000';
    user.phoneVerified = false; // as updateProfile does on a number change
    await user.save();

    interaktCalls = [];
    const delivery = await sendResetOTP(user);
    assert.equal(interaktCalls.length, 0);
    assert.equal(delivery.failureReason, 'phone_not_verified');
});

// ── FLOW 6: expiry and resend ────────────────────────────────────────────────

test('FLOW 6: a code older than five minutes is rejected, and resend issues a new one', async () => {
    const user = await makeUser();
    const first = await sendOTP(user, 'email_verification');

    // Age the stored code past its window rather than sleeping five minutes.
    await User.updateOne(
        { _id: user._id },
        { $set: { otpExpiry: new Date(Date.now() - 1000) } },
    );
    assert.deepEqual(await verifyAccountOtp(user, first.otp), { ok: false, reason: 'expired' });

    const fresh = await User.findById(user._id).select('+otp +otpExpiry');
    const second = await sendOTP(fresh, 'email_verification');
    assert.notEqual(second.otp, first.otp);
    assert.equal((await verifyAccountOtp(fresh, second.otp)).ok, true);
});

test('FLOW 6b: the persisted window is exactly five minutes', async () => {
    const user = await makeUser();
    const before = Date.now();
    await sendOTP(user, 'email_verification');
    const after = Date.now();

    const stored = await User.findById(user._id).select('+otpExpiry');
    const expiry = stored.otpExpiry.getTime();
    // Bracketed, not tolerance-based — see the unit-suite note.
    assert.ok(
        expiry >= before + OTP_EXPIRY_MS && expiry <= after + OTP_EXPIRY_MS,
        `expiry ${expiry} outside [${before + OTP_EXPIRY_MS}, ${after + OTP_EXPIRY_MS}]`,
    );
});

// ── FLOW 8: security ─────────────────────────────────────────────────────────

test('FLOW 8a: a superseded code no longer verifies', async () => {
    const user = await makeUser();
    const first = await sendOTP(user, 'email_verification');
    const fresh = await User.findById(user._id).select('+otp +otpExpiry');
    const second = await sendOTP(fresh, 'email_verification');

    assert.equal((await verifyAccountOtp(user, first.otp)).ok, false, 'the old code must die');
    assert.equal((await verifyAccountOtp(user, second.otp)).ok, true);
});

test('FLOW 8b: a consumed code cannot be replayed', async () => {
    const user = await makeUser();
    const delivery = await sendOTP(user, 'email_verification');
    assert.equal((await verifyAccountOtp(user, delivery.otp)).ok, true);
    assert.equal((await verifyAccountOtp(user, delivery.otp)).ok, false, 'replay must fail');
});

test('FLOW 8c: a wrong code is rejected', async () => {
    const user = await makeUser();
    const delivery = await sendOTP(user, 'email_verification');
    const wrong = delivery.otp === '000000' ? '111111' : '000000';
    assert.equal((await verifyAccountOtp(user, wrong)).ok, false);
});

test("FLOW 8d: one user's code cannot verify another user's account", async () => {
    const alice = await makeUser({ email: 'alice@example.com' });
    const bob = await makeUser({ email: 'bob@example.com' });

    const aliceOtp = await sendOTP(alice, 'email_verification');
    const freshBob = await User.findById(bob._id).select('+otp +otpExpiry');
    await sendOTP(freshBob, 'email_verification');

    assert.equal((await verifyAccountOtp(bob, aliceOtp.otp)).ok, false, 'cross-account OTP must fail');
    const storedBob = await User.findById(bob._id);
    assert.notEqual(storedBob.isVerified, true);
});

test('FLOW 8e: the OTP is never returned through profile serialisation', async () => {
    const user = await makeUser();
    await sendOTP(user, 'email_verification');
    const fetched = await User.findById(user._id);
    const serialised = JSON.stringify(fetched.toJSON ? fetched.toJSON() : fetched);
    assert.ok(!serialised.includes('"otp"'), 'the OTP field must not surface on a normal read');
    assert.equal(fetched.otp, undefined);
});

test('FLOW 8f: an unaddressable phone never reaches Interakt', async () => {
    const user = await makeUser({ phoneE164: null, phone: '' });
    const delivery = await sendOTP(user, 'email_verification');
    assert.equal(interaktCalls.length, 0);
    assert.equal(delivery.failureReason, 'no_valid_phone');
});

test('FLOW 8g: the code is never placed in the Interakt URL or headers', async () => {
    const user = await makeUser();
    const delivery = await sendOTP(user, 'email_verification');
    const call = interaktCalls[0];
    assert.ok(!call.url.includes(delivery.otp), 'the code must not travel in the URL');
    assert.equal(call.body.countryCode, '+91');
    assert.equal(call.body.phoneNumber, '7869958637');
});
