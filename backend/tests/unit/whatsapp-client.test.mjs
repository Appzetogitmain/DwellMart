/**
 * Interakt WhatsApp client — payload, failure and secrecy regression suite.
 *
 * Everything here runs without a database and without touching the network:
 * `global.fetch` is stubbed per test. The rules under test are the ones whose
 * failure is silent — a payload Interakt accepts but never delivers, a retry
 * that bills twice, or a secret that reaches a log line.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import whatsappConfig from '../../src/config/whatsapp.js';
import {
    buildOtpPayload,
    sendOtpMessage,
    WhatsAppApiError,
} from '../../src/services/whatsapp/whatsapp.client.js';
import {
    buildOtpTemplatePayload,
    isRegisteredTemplate,
    getTemplateSpec,
    WhatsAppTemplates,
} from '../../src/services/whatsapp/whatsapp.templates.js';

const realFetch = global.fetch;

/** Run `fn` with a specific env, restoring whatever was there before. */
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

const LIVE = { WHATSAPP_ENABLED: 'true', WHATSAPP_OTP_ENABLED: 'true', WHATSAPP_DRY_RUN: 'false', INTERAKT_API_KEY: 'TEST_KEY_NOT_REAL' };

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
});

// ── Template registry ────────────────────────────────────────────────────────

test('template registry contains otp_temp and nothing else', () => {
    assert.equal(isRegisteredTemplate('otp_temp'), true);
    // The account also holds this Utility template. It must NOT be sendable:
    // this phase is OTP-only.
    assert.equal(isRegisteredTemplate('update_regarding_case'), false);
    assert.equal(isRegisteredTemplate('order_shipped'), false);
    assert.equal(Object.keys(WhatsAppTemplates).length, 1);
});

test('otp_temp spec matches the approved Interakt template', () => {
    const spec = getTemplateSpec('otp_temp');
    assert.equal(spec.category, 'AUTHENTICATION');
    assert.equal(spec.bodyVariableCount, 1);
    assert.equal(spec.hasCopyCodeButton, true);
    assert.equal(spec.maxCodeLength, 15);
});

test('the code is placed in BOTH bodyValues and buttonValues', () => {
    // Interakt: "send the same auth code in both the body and button values."
    // Body-only produces a success response and no delivered message.
    const t = buildOtpTemplatePayload({ code: '482913' });
    assert.deepEqual(t.bodyValues, ['482913']);
    assert.deepEqual(t.buttonValues, { 0: ['482913'] });
});

test('template builder rejects an absent or over-long code', () => {
    assert.throws(() => buildOtpTemplatePayload({ code: '' }), /requires a code/);
    assert.throws(() => buildOtpTemplatePayload({ code: '1234567890123456' }), /exceeds 15/);
});

// ── Payload construction ─────────────────────────────────────────────────────

test('payload matches the confirmed Interakt contract exactly', () => {
    const payload = buildOtpPayload({ phoneE164: '+917869958637', code: '482913', callbackData: 'otp_abc' });
    assert.deepEqual(payload, {
        countryCode: '+91',
        phoneNumber: '7869958637',
        type: 'Template',
        callbackData: 'otp_abc',
        template: {
            name: 'otp_temp',
            languageCode: 'en',
            bodyValues: ['482913'],
            buttonValues: { 0: ['482913'] },
        },
    });
});

test('the national part never repeats the dial code', () => {
    // Sending +91 alongside 917869958637 is accepted and never delivered.
    const payload = buildOtpPayload({ phoneE164: '+917869958637', code: '111111' });
    assert.equal(payload.countryCode, '+91');
    assert.ok(!payload.phoneNumber.startsWith('91'), 'national part must not carry the dial code');
});

test('callbackData is omitted when absent and capped at 512 chars', () => {
    assert.equal('callbackData' in buildOtpPayload({ phoneE164: '+917869958637', code: '1' }), false);
    const long = buildOtpPayload({ phoneE164: '+917869958637', code: '1', callbackData: 'x'.repeat(900) });
    assert.equal(long.callbackData.length, 512);
});

test('an unaddressable phone throws before any network work', () => {
    let fetched = false;
    global.fetch = async () => { fetched = true; return jsonResponse({}); };
    for (const bad of [null, '', 'abc', '12', '+']) {
        assert.throws(
            () => buildOtpPayload({ phoneE164: bad, code: '482913' }),
            (e) => e instanceof WhatsAppApiError && e.reason === 'invalid_phone' && e.retryable === false,
        );
    }
    assert.equal(fetched, false);
    global.fetch = realFetch;
});

// ── Configuration gating ─────────────────────────────────────────────────────

test('send is refused when WhatsApp is disabled, and never calls out', async () => {
    await withEnv({ WHATSAPP_ENABLED: 'false', WHATSAPP_DRY_RUN: 'false' }, async () => {
        let called = false;
        global.fetch = async () => { called = true; return jsonResponse({}); };
        await assert.rejects(
            sendOtpMessage({ phoneE164: '+917869958637', code: '482913' }),
            (e) => e instanceof WhatsAppApiError && e.reason === 'whatsapp_disabled',
        );
        assert.equal(called, false);
    });
});

test('send is refused when the API key is missing outside dry-run', async () => {
    await withEnv({ WHATSAPP_ENABLED: 'true', WHATSAPP_DRY_RUN: 'false', INTERAKT_API_KEY: undefined }, async () => {
        let called = false;
        global.fetch = async () => { called = true; return jsonResponse({}); };
        await assert.rejects(
            sendOtpMessage({ phoneE164: '+917869958637', code: '482913' }),
            (e) => e.reason === 'missing_api_key',
        );
        assert.equal(called, false);
    });
});

test('dry-run builds the payload, returns success, and never calls Interakt', async () => {
    await withEnv({ WHATSAPP_ENABLED: 'true', WHATSAPP_DRY_RUN: 'true', INTERAKT_API_KEY: undefined }, async () => {
        let called = false;
        global.fetch = async () => { called = true; return jsonResponse({}); };
        const result = await sendOtpMessage({ phoneE164: '+917869958637', code: '482913' });
        assert.equal(result.sent, true);
        assert.equal(result.dryRun, true);
        assert.equal(called, false, 'dry-run must not reach the network');
        assert.ok(result.correlationId);
    });
});

// ── Live-path behaviour ──────────────────────────────────────────────────────

test('a successful send returns the Interakt message id', async () => {
    await withEnv(LIVE, async () => {
        global.fetch = async () => jsonResponse({ result: true, message: 'created', id: 'msg-123' }, 201);
        const result = await sendOtpMessage({ phoneE164: '+917869958637', code: '482913' });
        assert.equal(result.sent, true);
        assert.equal(result.messageId, 'msg-123');
        assert.equal(result.dryRun, false);
    });
});

test('the API key is sent verbatim, never re-encoded', async () => {
    await withEnv(LIVE, async () => {
        let seen = null;
        global.fetch = async (_url, opts) => { seen = opts.headers.Authorization; return jsonResponse({ result: true, id: 'x' }, 201); };
        await sendOtpMessage({ phoneE164: '+917869958637', code: '482913' });
        // Double-encoding is the classic Interakt failure: an opaque 401.
        assert.equal(seen, 'Basic TEST_KEY_NOT_REAL');
    });
});

test('a 2xx carrying result:false is treated as a failure, not a send', async () => {
    await withEnv(LIVE, async () => {
        global.fetch = async () => jsonResponse({ result: false, message: 'template not found' }, 200);
        await assert.rejects(
            sendOtpMessage({ phoneE164: '+917869958637', code: '482913' }),
            (e) => e.reason === 'rejected' && e.retryable === false,
        );
    });
});

test('4xx is terminal; 429 and 5xx are marked resendable', async () => {
    for (const [status, expectRetryable] of [[401, false], [403, false], [429, true], [500, true], [502, true]]) {
        await withEnv(LIVE, async () => {
            global.fetch = async () => jsonResponse({ message: 'nope' }, status);
            await assert.rejects(
                sendOtpMessage({ phoneE164: '+917869958637', code: '482913' }),
                (e) => e.httpStatus === status && e.retryable === expectRetryable,
                `status ${status}`,
            );
        });
    }
});

test('a timeout is surfaced as retryable and aborts the request', async () => {
    await withEnv({ ...LIVE, WHATSAPP_TIMEOUT_MS: '30' }, async () => {
        global.fetch = async (_url, opts) => new Promise((_resolve, reject) => {
            opts.signal.addEventListener('abort', () => {
                const err = new Error('aborted');
                err.name = 'AbortError';
                reject(err);
            });
        });
        await assert.rejects(
            sendOtpMessage({ phoneE164: '+917869958637', code: '482913' }),
            (e) => e.reason === 'timeout' && e.retryable === true,
        );
    });
});

test('a malformed (non-JSON) body does not crash the client', async () => {
    await withEnv(LIVE, async () => {
        global.fetch = async () => new Response('<html>502 Bad Gateway</html>', { status: 502 });
        await assert.rejects(
            sendOtpMessage({ phoneE164: '+917869958637', code: '482913' }),
            (e) => e instanceof WhatsAppApiError && e.httpStatus === 502,
        );
    });
});

test('a 2xx with an empty body still succeeds, with a null message id', async () => {
    await withEnv(LIVE, async () => {
        global.fetch = async () => new Response('', { status: 201 });
        const result = await sendOtpMessage({ phoneE164: '+917869958637', code: '482913' });
        assert.equal(result.sent, true);
        assert.equal(result.messageId, null);
    });
});

// ── No automatic retry ───────────────────────────────────────────────────────

test('a failing send is attempted EXACTLY once — no automatic retry', async () => {
    // A retried send bills twice and leaves the user holding two codes when
    // only the newest verifies.
    for (const status of [500, 429, 401]) {
        await withEnv(LIVE, async () => {
            let calls = 0;
            global.fetch = async () => { calls += 1; return jsonResponse({ message: 'fail' }, status); };
            await assert.rejects(sendOtpMessage({ phoneE164: '+917869958637', code: '482913' }));
            assert.equal(calls, 1, `status ${status} must not be retried`);
        });
    }
});

test('a timed-out send is not retried either', async () => {
    await withEnv({ ...LIVE, WHATSAPP_TIMEOUT_MS: '30' }, async () => {
        let calls = 0;
        global.fetch = async (_url, opts) => {
            calls += 1;
            return new Promise((_r, reject) => {
                opts.signal.addEventListener('abort', () => {
                    const err = new Error('aborted'); err.name = 'AbortError'; reject(err);
                });
            });
        };
        await assert.rejects(sendOtpMessage({ phoneE164: '+917869958637', code: '482913' }));
        assert.equal(calls, 1, 'an ambiguous timeout must never be auto-resent');
    });
});

// ── Secrecy ──────────────────────────────────────────────────────────────────

test('neither the OTP code nor the API key ever reaches a log line', async () => {
    const lines = [];
    const originalLog = console.log;
    const originalWarn = console.warn;
    console.log = (...a) => lines.push(a.map(String).join(' '));
    console.warn = (...a) => lines.push(a.map(String).join(' '));

    try {
        await withEnv({ WHATSAPP_ENABLED: 'true', WHATSAPP_DRY_RUN: 'true', INTERAKT_API_KEY: 'SUPER_SECRET_KEY' }, async () => {
            await sendOtpMessage({ phoneE164: '+917869958637', code: '482913' });
        });
    } finally {
        console.log = originalLog;
        console.warn = originalWarn;
    }

    const output = lines.join('\n');
    assert.ok(output.length > 0, 'dry-run should log something');
    assert.ok(!output.includes('482913'), 'the OTP code must never be logged');
    assert.ok(!output.includes('SUPER_SECRET_KEY'), 'the API key must never be logged');
    assert.ok(!output.includes('7869958637'), 'the full phone number must never be logged');
    assert.ok(output.includes('8637'), 'the masked last-four should still be present for diagnosis');
});

test('correlation ids are unique per send', async () => {
    await withEnv({ WHATSAPP_ENABLED: 'true', WHATSAPP_DRY_RUN: 'true' }, async () => {
        const a = await sendOtpMessage({ phoneE164: '+917869958637', code: '111111' });
        const b = await sendOtpMessage({ phoneE164: '+917869958637', code: '222222' });
        assert.notEqual(a.correlationId, b.correlationId);
    });
});

test('config defaults are safe: disabled, and reporting why', () => {
    const saved = { ...process.env };
    delete process.env.WHATSAPP_ENABLED;
    delete process.env.WHATSAPP_DRY_RUN;
    try {
        assert.equal(whatsappConfig.enabled, false, 'WhatsApp must be OFF unless explicitly enabled');
        assert.equal(whatsappConfig.isConfigured(), false);
        assert.equal(whatsappConfig.unavailableReason(), 'whatsapp_disabled');
    } finally {
        process.env = saved;
    }
});
