/**
 * Interakt webhook — signature, acknowledgement-speed and side-effect suite.
 *
 * Exercised over a real Express app with the SAME body-parser configuration
 * app.js uses, because the whole signature scheme depends on `req.rawBody`
 * being the exact bytes that were signed. A test that hand-builds a request
 * object would verify the HMAC against a re-serialised body and pass while
 * production fails.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import express from 'express';

import whatsappWebhookRoutes, { processDeliveryEvent } from '../../src/modules/integrations/routes/whatsappWebhook.routes.js';

const SECRET = 'test-webhook-secret-not-real';

/** Mirrors app.js: the raw body must be preserved for HMAC verification. */
const buildApp = () => {
    const app = express();
    app.use(express.json({
        verify: (req, _res, buf) => { req.rawBody = buf.toString(); },
    }));
    app.use('/api/integrations', whatsappWebhookRoutes);
    return app;
};

let server;
let baseUrl;

test.before(async () => {
    server = buildApp().listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

const sign = (body, secret = SECRET) => `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;

const post = async (payload, { signature, secret, raw } = {}) => {
    const body = raw ?? JSON.stringify(payload);
    const headers = { 'Content-Type': 'application/json' };
    const sig = signature !== undefined ? signature : sign(body, secret || SECRET);
    if (sig !== null) headers['Interakt-Signature'] = sig;
    return fetch(`${baseUrl}/api/integrations/webhook/whatsapp`, { method: 'POST', headers, body });
};

const statusPayload = (type = 'message_api_delivered', overrides = {}) => ({
    version: '1.0',
    timestamp: '2026-08-19T10:00:00Z',
    type,
    data: {
        customer: { id: 'cust-1', channel_phone_number: '917869958637' },
        message: {
            id: 'msg-1',
            message_status: 'Delivered',
            meta_data: { source: 'PublicInterakt', source_data: { callback_data: 'otp_verification_abc123' } },
            ...overrides,
        },
    },
});

const withSecret = async (value, fn) => {
    const saved = process.env.INTERAKT_WEBHOOK_SECRET;
    if (value === undefined) delete process.env.INTERAKT_WEBHOOK_SECRET;
    else process.env.INTERAKT_WEBHOOK_SECRET = value;
    try { return await fn(); } finally {
        if (saved === undefined) delete process.env.INTERAKT_WEBHOOK_SECRET;
        else process.env.INTERAKT_WEBHOOK_SECRET = saved;
    }
};

// ── Fail-closed when unconfigured ────────────────────────────────────────────

test('with NO secret configured the endpoint is inert and rejects everything', async () => {
    await withSecret(undefined, async () => {
        const res = await post(statusPayload());
        assert.equal(res.status, 503, 'must fail closed, never accept unsigned traffic');
    });
});

test('an empty secret is treated as unconfigured, not as a valid empty key', async () => {
    await withSecret('', async () => {
        const res = await post(statusPayload());
        assert.equal(res.status, 503);
    });
});

// ── Signature verification ───────────────────────────────────────────────────

test('a correctly signed request is accepted', async () => {
    await withSecret(SECRET, async () => {
        const res = await post(statusPayload());
        assert.equal(res.status, 200);
    });
});

test('a missing signature header is rejected', async () => {
    await withSecret(SECRET, async () => {
        const res = await post(statusPayload(), { signature: null });
        assert.equal(res.status, 401);
    });
});

test('a signature from the wrong secret is rejected', async () => {
    await withSecret(SECRET, async () => {
        const res = await post(statusPayload(), { secret: 'the-wrong-secret' });
        assert.equal(res.status, 401);
    });
});

test('malformed signatures are rejected as 401, never crash as 500', async () => {
    // The length-safety guard exists precisely so an attacker-controlled header
    // cannot turn timingSafeEqual's RangeError into a length oracle.
    await withSecret(SECRET, async () => {
        for (const bad of ['', 'sha256=', 'sha256=zz', 'garbage', 'sha256=' + 'a'.repeat(63), 'sha256=' + 'a'.repeat(65)]) {
            const res = await post(statusPayload(), { signature: bad });
            assert.equal(res.status, 401, `signature ${JSON.stringify(bad)} should be 401`);
        }
    });
});

test('a tampered body invalidates a previously valid signature', async () => {
    await withSecret(SECRET, async () => {
        const original = JSON.stringify(statusPayload());
        const tampered = JSON.stringify(statusPayload('message_api_failed'));
        const res = await post(null, { raw: tampered, signature: sign(original) });
        assert.equal(res.status, 401);
    });
});

test('a bare hex digest without the sha256= prefix is also accepted', async () => {
    await withSecret(SECRET, async () => {
        const body = JSON.stringify(statusPayload());
        const bare = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
        const res = await post(null, { raw: body, signature: bare });
        assert.equal(res.status, 200);
    });
});

// ── Acknowledgement contract ─────────────────────────────────────────────────

test('acknowledgement is well inside the three-second budget', async () => {
    await withSecret(SECRET, async () => {
        const started = Date.now();
        const res = await post(statusPayload());
        const elapsed = Date.now() - started;
        assert.equal(res.status, 200);
        // Interakt disables the webhook after five slow/failed deliveries in
        // ten minutes, so this budget is the whole endpoint's survival.
        assert.ok(elapsed < 3000, `acknowledged in ${elapsed}ms, must be under 3000ms`);
    });
});

test('unknown events and malformed payloads still acknowledge 200', async () => {
    await withSecret(SECRET, async () => {
        for (const payload of [
            { type: 'message_received' },
            { type: 'totally_unknown_event' },
            { nonsense: true },
            {},
        ]) {
            const res = await post(payload);
            assert.equal(res.status, 200, `${JSON.stringify(payload)} must not earn a retry storm`);
        }
    });
});

test('a duplicate delivery of the same event is accepted idempotently', async () => {
    await withSecret(SECRET, async () => {
        const payload = statusPayload();
        const first = await post(payload);
        const second = await post(payload);
        assert.equal(first.status, 200);
        assert.equal(second.status, 200);
    });
});

// ── Side effects ─────────────────────────────────────────────────────────────

test('a delivery failure is recorded but issues NO replacement OTP', () => {
    // Minting a code from a background callback would invalidate the one the
    // user is mid-way through typing, unprompted.
    const result = processDeliveryEvent(statusPayload('message_api_failed', {
        channel_error_code: '131026',
        channel_failure_reason: 'Message undeliverable',
    }));
    assert.equal(result.handled, true);
    assert.equal(result.status, 'failed');
    assert.equal('newOtp' in result, false);
    assert.equal('otp' in result, false);
});

test('non-OTP traffic is ignored rather than interpreted', () => {
    const payload = statusPayload('message_api_delivered');
    payload.data.message.meta_data.source_data.callback_data = 'order_update_123';
    const result = processDeliveryEvent(payload);
    assert.equal(result.handled, false);
    assert.equal(result.reason, 'not_an_otp_message');
});

test('unsupported event types are reported as unhandled', () => {
    assert.equal(processDeliveryEvent({ type: 'message_received' }).handled, false);
    assert.equal(processDeliveryEvent({}).handled, false);
});

test('all four API delivery states are recognised', () => {
    for (const type of ['message_api_sent', 'message_api_delivered', 'message_api_read', 'message_api_failed']) {
        assert.equal(processDeliveryEvent(statusPayload(type)).handled, true, type);
    }
});

// ── Secrecy ──────────────────────────────────────────────────────────────────

test('the webhook secret never reaches a log line', async () => {
    const lines = [];
    const origWarn = console.warn;
    const origLog = console.log;
    console.warn = (...a) => lines.push(a.map(String).join(' '));
    console.log = (...a) => lines.push(a.map(String).join(' '));
    try {
        await withSecret(SECRET, async () => {
            await post(statusPayload(), { secret: 'wrong' });
            await post(statusPayload());
        });
        await withSecret(undefined, async () => { await post(statusPayload()); });
    } finally {
        console.warn = origWarn;
        console.log = origLog;
    }
    const output = lines.join('\n');
    assert.ok(!output.includes(SECRET), 'the signing secret must never be logged');
});
