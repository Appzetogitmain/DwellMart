import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  handleWebhook,
} from '../../src/modules/payment/controllers/razorpay.controller.js';
import {
  verifyRazorpayWebhookSignature,
  setMockRazorpayHandler,
} from '../../src/services/billing/razorpay.service.js';
import { CheckoutSession } from '../../src/models/CheckoutSession.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const controllerPath = path.resolve(
  __dirname,
  '../../src/modules/payment/controllers/razorpay.controller.js'
);

const TEST_WEBHOOK_SECRET = 'unit_test_dedicated_dummy_secret_xyz123';

const createMockRes = () => {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
};

const createMockReq = ({ headers = {}, body = {}, rawBody } = {}) => {
  const serialized = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    headers: { ...headers },
    body: typeof body === 'string' ? JSON.parse(body) : body,
    rawBody: rawBody !== undefined ? rawBody : serialized,
  };
};

const computeHmac = (payload, secret = TEST_WEBHOOK_SECRET) => {
  return crypto
    .createHmac('sha256', secret)
    .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
    .digest('hex');
};

describe('Phase 19 — P0-SEC-01 Razorpay Webhook Missing-Signature Bypass Remediation', () => {
  const origWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const origKeySecret = process.env.RAZORPAY_KEY_SECRET;
  const origFindOne = CheckoutSession.findOne;

  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    delete process.env.RAZORPAY_KEY_SECRET;
    setMockRazorpayHandler(null);
    CheckoutSession.findOne = async () => null;
  });

  afterEach(() => {
    if (origWebhookSecret !== undefined) {
      process.env.RAZORPAY_WEBHOOK_SECRET = origWebhookSecret;
    } else {
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
    }
    if (origKeySecret !== undefined) {
      process.env.RAZORPAY_KEY_SECRET = origKeySecret;
    } else {
      delete process.env.RAZORPAY_KEY_SECRET;
    }
    setMockRazorpayHandler(null);
    CheckoutSession.findOne = origFindOne;
  });

  describe('1. Webhook Signature Guard Rejections', () => {
    test('missing X-Razorpay-Signature header is rejected with HTTP 400', async () => {
      const payload = { event: 'order.paid', payload: {} };
      const req = createMockReq({
        headers: {}, // No x-razorpay-signature
        body: payload,
      });
      const res = createMockRes();

      await handleWebhook(req, res);

      assert.strictEqual(res.statusCode, 400, 'Must respond with HTTP 400 on missing signature');
      assert.strictEqual(res.body?.status, 'invalid_signature', 'Body must specify invalid_signature status');
    });

    test('empty string signature is rejected with HTTP 400', async () => {
      const payload = { event: 'payment.captured', payload: {} };
      const req = createMockReq({
        headers: { 'x-razorpay-signature': '' },
        body: payload,
      });
      const res = createMockRes();

      await handleWebhook(req, res);

      assert.strictEqual(res.statusCode, 400, 'Must respond with HTTP 400 on empty signature');
      assert.strictEqual(res.body?.status, 'invalid_signature');
    });

    test('whitespace-only signature is rejected with HTTP 400', async () => {
      const payload = { event: 'payment.captured', payload: {} };
      const req = createMockReq({
        headers: { 'x-razorpay-signature': '    \t   ' },
        body: payload,
      });
      const res = createMockRes();

      await handleWebhook(req, res);

      assert.strictEqual(res.statusCode, 400, 'Must respond with HTTP 400 on whitespace signature');
      assert.strictEqual(res.body?.status, 'invalid_signature');
    });

    test('invalid / mismatched signature is rejected with HTTP 400', async () => {
      const payload = { event: 'order.paid', payload: {} };
      const req = createMockReq({
        headers: { 'x-razorpay-signature': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' },
        body: payload,
      });
      const res = createMockRes();

      await handleWebhook(req, res);

      assert.strictEqual(res.statusCode, 400, 'Must respond with HTTP 400 on mismatched signature');
      assert.strictEqual(res.body?.status, 'invalid_signature');
    });

    test('tampered payload with original signature is rejected with HTTP 400', async () => {
      const originalPayload = { event: 'order.paid', amount: 1000 };
      const validSig = computeHmac(originalPayload);

      // Attacker altered payload but kept original signature
      const tamperedPayload = { event: 'order.paid', amount: 50000 };
      const req = createMockReq({
        headers: { 'x-razorpay-signature': validSig },
        body: tamperedPayload,
      });
      const res = createMockRes();

      await handleWebhook(req, res);

      assert.strictEqual(res.statusCode, 400, 'Must respond with HTTP 400 on tampered payload');
      assert.strictEqual(res.body?.status, 'invalid_signature');
    });
  });

  describe('2. Missing Webhook Secret Handling', () => {
    test('missing webhook secret fails verification safely', async () => {
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
      delete process.env.RAZORPAY_KEY_SECRET;

      const rawBody = JSON.stringify({ event: 'order.paid' });
      const isValid = await verifyRazorpayWebhookSignature({
        rawBody,
        signature: 'some_sig',
      });

      assert.strictEqual(isValid, false, 'verifyRazorpayWebhookSignature must return false when no secret exists');

      // Also verify controller rejection when no secret is configured
      const req = createMockReq({
        headers: { 'x-razorpay-signature': 'some_sig' },
        body: { event: 'order.paid' },
      });
      const res = createMockRes();

      await handleWebhook(req, res);
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body?.status, 'invalid_signature');
    });
  });

  describe('3. Valid Signature Acceptance & Event Routing', () => {
    test('unsupported webhook event with valid signature is safely acknowledged with HTTP 200', async () => {
      const payload = { event: 'subscription.charged', payload: {} };
      const rawBody = JSON.stringify(payload);
      const signature = computeHmac(rawBody);

      const req = createMockReq({
        headers: { 'x-razorpay-signature': signature },
        body: payload,
        rawBody,
      });
      const res = createMockRes();

      await handleWebhook(req, res);

      assert.strictEqual(res.statusCode, 200, 'Valid signature on non-order event must return HTTP 200');
      assert.strictEqual(res.body?.status, 'ok');
    });

    test('existing order.paid event with valid signature proceeds to processing and returns HTTP 200', async () => {
      let findOneCalled = false;
      CheckoutSession.findOne = async (query) => {
        findOneCalled = true;
        return null; // session not found in unit test is fine
      };

      const payload = {
        event: 'order.paid',
        payload: {
          order: {
            entity: {
              id: 'order_test_valid_123',
              receipt: 'test_receipt_none',
            },
          },
          payment: {
            entity: {
              id: 'pay_test_valid_456',
              order_id: 'order_test_valid_123',
            },
          },
        },
      };
      const rawBody = JSON.stringify(payload);
      const signature = computeHmac(rawBody);

      const req = createMockReq({
        headers: { 'x-razorpay-signature': signature },
        body: payload,
        rawBody,
      });
      const res = createMockRes();

      await handleWebhook(req, res);

      assert.strictEqual(findOneCalled, true, 'order.paid must proceed to look up session');
      assert.strictEqual(res.statusCode, 200, 'Valid signature on order.paid must return HTTP 200');
      assert.strictEqual(res.body?.status, 'ok');
    });

    test('existing payment.captured event with valid signature proceeds to processing and returns HTTP 200', async () => {
      let findOneCalled = false;
      CheckoutSession.findOne = async (query) => {
        findOneCalled = true;
        return null;
      };

      const payload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_test_valid_789',
              order_id: 'order_test_valid_789',
              notes: { sessionId: 'CS-test-session-123' },
            },
          },
        },
      };
      const rawBody = JSON.stringify(payload);
      const signature = computeHmac(rawBody);

      const req = createMockReq({
        headers: { 'x-razorpay-signature': signature },
        body: payload,
        rawBody,
      });
      const res = createMockRes();

      await handleWebhook(req, res);

      assert.strictEqual(findOneCalled, true, 'payment.captured must proceed to look up session');
      assert.strictEqual(res.statusCode, 200, 'Valid signature on payment.captured must return HTTP 200');
      assert.strictEqual(res.body?.status, 'ok');
    });
  });

  describe('4. Source Code Contract & Security Anti-Bypass Guard', () => {
    test('handleWebhook source code strictly rejects missing or falsy signatures without bypass', () => {
      const source = fs.readFileSync(controllerPath, 'utf8');

      // The old vulnerable pattern was: if (signature) { verify... }
      const hasOldVulnerability = /if\s*\(\s*signature\s*\)\s*\{\s*(?:await\s+)?verifyRazorpayWebhookSignature/m.test(source);
      assert.strictEqual(
        hasOldVulnerability,
        false,
        'handleWebhook must NOT use optional "if (signature)" guard around verification'
      );

      // Ensure mandatory signature check exists
      assert.ok(
        source.includes('!signature'),
        'handleWebhook must explicitly check for missing signature (!signature)'
      );
      assert.ok(
        source.includes('verifyRazorpayWebhookSignature'),
        'handleWebhook must invoke verifyRazorpayWebhookSignature'
      );
    });
  });
});
