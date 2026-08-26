/**
 * Phone normalisation — pure-logic regression suite.
 *
 * The rules under test are the ones whose failure is silent: a number that
 * normalises to the wrong country still looks like a valid number, and a
 * `splitE164` that leaves the dial code on the national part produces a
 * message Interakt accepts and never delivers.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { toE164, isValidE164, splitE164, maskPhone, defaultDialCode } from '../../src/utils/phone.js';

test('toE164: bare Indian national number gains the default dial code', () => {
    assert.equal(toE164('9876543210'), '+919876543210');
    assert.equal(toE164('9424999443'), '+919424999443'); // bare Indian number starting with 94
    assert.equal(toE164('9212345678'), '+919212345678'); // bare Indian number starting with 92
    assert.equal(toE164('8801234567'), '+918801234567'); // bare Indian number starting with 880
});

test('toE164: formatting characters are ignored', () => {
    assert.equal(toE164('98765 43210'), '+919876543210');
    assert.equal(toE164('987-654-3210'), '+919876543210');
    assert.equal(toE164(' 9876543210 '), '+919876543210');
});

test('toE164: an explicit + is authoritative and never re-prefixed', () => {
    assert.equal(toE164('+919876543210'), '+919876543210');
    assert.equal(toE164('+14155550132'), '+14155550132');
    assert.equal(toE164('+971501234567'), '+971501234567');
});

test('toE164: trunk zero and 00 international prefixes are stripped', () => {
    assert.equal(toE164('09876543210'), '+919876543210');
    assert.equal(toE164('00919876543210'), '+919876543210');
});

test('toE164: an already-complete number is not double-prefixed', () => {
    // The bug this guards: 919876543210 becoming +91919876543210.
    assert.equal(toE164('919876543210'), '+919876543210');
    assert.equal(toE164('919310307357'), '+919310307357');
});

test('toE164: missing and malformed values yield null, never a partial number', () => {
    for (const bad of [null, undefined, '', '   ', 'abc', 'not-a-phone', '+', '12', '0']) {
        assert.equal(toE164(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
});

test('toE164: over-long input is rejected rather than truncated', () => {
    assert.equal(toE164('+1234567890123456789'), null);
});

test('toE164: an explicit dial-code override wins over the default', () => {
    assert.equal(toE164('5551234567', '1'), '+15551234567');
});

test('defaultDialCode: honours env, falls back to 91', () => {
    const original = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE;
    try {
        delete process.env.WHATSAPP_DEFAULT_COUNTRY_CODE;
        assert.equal(defaultDialCode(), '91');
        process.env.WHATSAPP_DEFAULT_COUNTRY_CODE = '+44';
        assert.equal(defaultDialCode(), '44');
        assert.equal(toE164('7911123456'), '+447911123456');
    } finally {
        if (original === undefined) delete process.env.WHATSAPP_DEFAULT_COUNTRY_CODE;
        else process.env.WHATSAPP_DEFAULT_COUNTRY_CODE = original;
    }
});

test('isValidE164: accepts well-formed, rejects everything else', () => {
    assert.equal(isValidE164('+919876543210'), true);
    for (const bad of ['919876543210', '+0919876543210', '+91', '', null, undefined, '+abc']) {
        assert.equal(isValidE164(bad), false, `expected false for ${JSON.stringify(bad)}`);
    }
});

test('splitE164: dial code is removed from the national part', () => {
    // Interakt rejects delivery when the national part repeats the dial code.
    assert.deepEqual(splitE164('9876543210'), { countryCode: '+91', phoneNumber: '9876543210' });
    assert.deepEqual(splitE164('+919876543210'), { countryCode: '+91', phoneNumber: '9876543210' });
    assert.deepEqual(splitE164('+14155550132'), { countryCode: '+1', phoneNumber: '4155550132' });
    assert.deepEqual(splitE164('+971501234567'), { countryCode: '+971', phoneNumber: '501234567' });
});

test('splitE164: unusable input yields null rather than a half-formed pair', () => {
    for (const bad of [null, '', 'abc', '12']) {
        assert.equal(splitE164(bad), null);
    }
});

test('maskPhone: reveals at most the last four digits', () => {
    assert.equal(maskPhone('+917869958637'), '••••8637');
    assert.equal(maskPhone('9876543210'), '••••3210');
    assert.equal(maskPhone(''), '(none)');
    assert.equal(maskPhone(null), '(none)');
    // The full number must never survive masking.
    assert.ok(!maskPhone('+917869958637').includes('786995'));
});
