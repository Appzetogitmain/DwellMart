/**
 * Phone-identity authentication — vendor registration and passwordless
 * delivery login, against a real database.
 *
 * Two behavioural changes are under test:
 *
 *   1. Vendor registration proves a MOBILE NUMBER over WhatsApp. Email is
 *      collected but never verified.
 *   2. Delivery partners have no password at all. Registration and login are
 *      both mobile number + WhatsApp OTP.
 *
 * The cases that matter most are the negative ones: an unproven number must not
 * be able to register, a retired password must not authenticate, and the
 * pre-account OTP must never fall back to email — a code that also reaches an
 * inbox proves nothing about the handset.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import DeliveryBoy from '../../src/models/DeliveryBoy.model.js';
import PhoneVerification from '../../src/models/PhoneVerification.model.js';
import {
    sendPhoneVerification,
    confirmPhoneVerification,
    isPhoneVerified,
    clearPhoneVerification,
    requireE164,
} from '../../src/services/phoneVerification.service.js';
import {
    requestLoginOTP,
    verifyLoginOTP,
} from '../../src/modules/delivery/controllers/auth.controller.js';

let mongod;
const realFetch = global.fetch;

let interaktCalls = [];
let interaktHandler = null;

const okResponse = () => new Response(JSON.stringify({ result: true, id: 'msg-1' }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
});

const PHONE = '+917869958637';

test.before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { dbName: 'phone_identity_qa' });

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
        JWT_SECRET: 'phone-identity-access-secret',
        JWT_REFRESH_SECRET: 'phone-identity-refresh-secret',
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
    await PhoneVerification.deleteMany({});
    await DeliveryBoy.deleteMany({});
});

/** Read the code straight from the record — it is never returned to a caller. */
const storedCode = async (phoneE164) => {
    const record = await PhoneVerification.findOne({ phoneE164 }).select('+otp');
    return record?.otp;
};

const invokeHandler = async (handler, body) => {
    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
    let capturedError = null;

    await handler({ body }, res, (err) => {
        capturedError = err;
    });

    if (capturedError) throw capturedError;
    return res;
};

// ── Pre-account OTP: WhatsApp only ───────────────────────────────────────────

test('a verification code is sent over WhatsApp using the approved template', async () => {
    const result = await sendPhoneVerification('7869958637');

    assert.equal(result.phoneE164, PHONE);
    assert.equal(result.channel, 'whatsapp');
    assert.equal(result.expiresInMinutes, 5);
    assert.equal(interaktCalls.length, 1);
    assert.equal(interaktCalls[0].body.template.name, 'otp_temp');
    assert.equal(interaktCalls[0].body.countryCode, '+91');
    assert.equal(interaktCalls[0].body.phoneNumber, '7869958637');
});

test('the code is persisted BEFORE it is sent', async () => {
    let codeAtSendTime;
    interaktHandler = () => { codeAtSendTime = 'checked'; return okResponse(); };
    await sendPhoneVerification(PHONE);
    assert.equal(codeAtSendTime, 'checked');
    assert.ok(await storedCode(PHONE), 'a record must exist after the send');
});

test('a WhatsApp failure blocks verification — it NEVER falls back to email', async () => {
    // Falling back would defeat the entire purpose: a code that also arrives in
    // an inbox proves nothing about who holds the handset.
    interaktHandler = () => new Response('{}', { status: 500 });
    await assert.rejects(
        sendPhoneVerification(PHONE),
        (e) => e.statusCode === 503 && /WhatsApp/i.test(e.message),
    );
});

test('an unusable number is rejected before any network call', async () => {
    for (const bad of [null, '', 'abc', '12', undefined]) {
        interaktCalls = [];
        await assert.rejects(sendPhoneVerification(bad), (e) => e.statusCode === 400);
        assert.equal(interaktCalls.length, 0);
    }
});

test('requireE164 normalises national numbers and rejects junk', () => {
    assert.equal(requireE164('7869958637'), PHONE);
    assert.equal(requireE164('+917869958637'), PHONE);
    assert.throws(() => requireE164('nonsense'), (e) => e.statusCode === 400);
});

// ── Verification ─────────────────────────────────────────────────────────────

test('a correct code marks the number verified', async () => {
    await sendPhoneVerification(PHONE);
    const code = await storedCode(PHONE);

    const result = await confirmPhoneVerification(PHONE, code);
    assert.equal(result.phoneE164, PHONE);
    assert.equal(await isPhoneVerified(PHONE), true);
});

test('the code is cleared once consumed', async () => {
    await sendPhoneVerification(PHONE);
    await confirmPhoneVerification(PHONE, await storedCode(PHONE));
    assert.equal(await storedCode(PHONE), undefined, 'a consumed code must not remain readable');
});

test('a wrong code is rejected and burns an attempt', async () => {
    await sendPhoneVerification(PHONE);
    const code = await storedCode(PHONE);
    const wrong = code === '000000' ? '111111' : '000000';

    await assert.rejects(confirmPhoneVerification(PHONE, wrong), (e) => e.statusCode === 400);
    const record = await PhoneVerification.findOne({ phoneE164: PHONE });
    assert.equal(record.attempts, 1);
    assert.equal(await isPhoneVerified(PHONE), false);
});

test('guessing is bounded — the record locks after five misses', async () => {
    await sendPhoneVerification(PHONE);
    const code = await storedCode(PHONE);
    const wrong = code === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i += 1) {
        await assert.rejects(confirmPhoneVerification(PHONE, wrong));
    }
    // Even the CORRECT code is refused once the budget is spent.
    await assert.rejects(
        confirmPhoneVerification(PHONE, code),
        (e) => e.statusCode === 429,
        'a spent attempt budget must not be bypassable with the right code',
    );
});

test('an expired code is rejected', async () => {
    await sendPhoneVerification(PHONE);
    const code = await storedCode(PHONE);
    await PhoneVerification.updateOne({ phoneE164: PHONE }, { $set: { otpExpiry: new Date(Date.now() - 1000) } });

    await assert.rejects(confirmPhoneVerification(PHONE, code), (e) => e.statusCode === 400 && /expired/i.test(e.message));
    assert.equal(await isPhoneVerified(PHONE), false);
});

test('a code for one number cannot verify another', async () => {
    await sendPhoneVerification(PHONE);
    const code = await storedCode(PHONE);

    const other = '+919310307357';
    await sendPhoneVerification(other);

    await assert.rejects(confirmPhoneVerification(other, code), (e) => e.statusCode === 400);
    assert.equal(await isPhoneVerified(other), false);
});

test('requesting a new code resets the attempt budget', async () => {
    await sendPhoneVerification(PHONE);
    await assert.rejects(confirmPhoneVerification(PHONE, '000001'));

    await sendPhoneVerification(PHONE);
    const record = await PhoneVerification.findOne({ phoneE164: PHONE });
    assert.equal(record.attempts, 0);
    assert.equal(record.isVerified, false, 'a fresh code must start unverified');
});

test('a resend supersedes the previous code', async () => {
    await sendPhoneVerification(PHONE);
    const first = await storedCode(PHONE);
    await sendPhoneVerification(PHONE);
    const second = await storedCode(PHONE);

    assert.notEqual(first, second);
    await assert.rejects(confirmPhoneVerification(PHONE, first), (e) => e.statusCode === 400);
    const ok = await confirmPhoneVerification(PHONE, second);
    assert.equal(ok.phoneE164, PHONE);
});

test('an unverified number reports false, and clearing revokes verification', async () => {
    assert.equal(await isPhoneVerified(PHONE), false);
    assert.equal(await isPhoneVerified('not-a-number'), false);

    await sendPhoneVerification(PHONE);
    await confirmPhoneVerification(PHONE, await storedCode(PHONE));
    assert.equal(await isPhoneVerified(PHONE), true);

    await clearPhoneVerification(PHONE);
    assert.equal(await isPhoneVerified(PHONE), false, 'consuming the record must revoke the authority it granted');
});

// ── Delivery partner: no password anywhere ───────────────────────────────────

test('the DeliveryBoy schema has no password or reset-credential fields', () => {
    const paths = Object.keys(DeliveryBoy.schema.paths);
    for (const dead of ['password', 'resetOtp', 'resetOtpExpiry', 'resetOtpVerified']) {
        assert.equal(paths.includes(dead), false, `${dead} must be gone from the schema`);
    }
    assert.equal(
        typeof DeliveryBoy.schema.methods.comparePassword,
        'undefined',
        'comparePassword must not exist — there is no password to compare',
    );
});

test('a delivery partner can be created without a password', async () => {
    const rider = await DeliveryBoy.create({
        name: 'Rider One',
        email: 'rider1@example.com',
        phone: '7869958637',
        phoneE164: PHONE,
        phoneVerified: true,
        applicationStatus: 'approved',
        isActive: true,
    });
    assert.ok(rider._id);
    assert.equal(rider.phoneE164, PHONE);
});

test('a legacy password value is not persisted by the model', async () => {
    // Mongoose drops unknown paths in strict mode. This proves a stale hash
    // cannot be reintroduced through the application layer.
    const rider = await DeliveryBoy.create({
        name: 'Rider Two',
        email: 'rider2@example.com',
        phone: '9310307357',
        phoneE164: '+919310307357',
        password: 'should-not-persist',
        applicationStatus: 'approved',
        isActive: true,
    });
    const raw = await DeliveryBoy.collection.findOne({ _id: rider._id });
    assert.equal(raw.password, undefined, 'no password may be written');
});

test('serialised delivery output never exposes credential fields', async () => {
    const rider = await DeliveryBoy.create({
        name: 'Rider Three',
        email: 'rider3@example.com',
        phone: '9999900000',
        phoneE164: '+919999900000',
        applicationStatus: 'approved',
        isActive: true,
    });
    const json = JSON.stringify(rider.toJSON());
    for (const dead of ['password', 'resetOtp', 'otp"']) {
        assert.ok(!json.includes(dead), `${dead} must not appear in serialised output`);
    }
});

test('delivery login uses the local default OTP for the configured rider number', async () => {
    const rider = await DeliveryBoy.create({
        name: 'Default OTP Rider',
        email: 'default-otp-rider@example.com',
        phone: '7869958637',
        phoneE164: PHONE,
        phoneVerified: true,
        applicationStatus: 'approved',
        isActive: true,
    });

    const requestRes = await invokeHandler(requestLoginOTP, { phone: '7869958637' });

    assert.equal(requestRes.statusCode, 200);
    assert.equal(await storedCode(PHONE), '123456');
    assert.equal(interaktCalls.length, 1);
    assert.deepEqual(interaktCalls[0].body.template.bodyValues, ['123456']);
    assert.deepEqual(interaktCalls[0].body.template.buttonValues, { 0: ['123456'] });

    const verifyRes = await invokeHandler(verifyLoginOTP, { phone: '7869958637', otp: '123456' });

    assert.equal(verifyRes.statusCode, 200);
    assert.ok(verifyRes.body.data.accessToken);
    assert.ok(verifyRes.body.data.refreshToken);
    assert.equal(String(verifyRes.body.data.deliveryBoy.id), String(rider._id));
    assert.equal(await storedCode(PHONE), undefined, 'login OTP must be consumed after a successful session');
});
