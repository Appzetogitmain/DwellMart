import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  getRazorpayCredentials,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
  createRazorpayRefund,
  setMockRazorpayHandler,
} from '../../src/services/billing/razorpay.service.js';

test('Razorpay Service - Credentials resolution', async () => {
  const creds = await getRazorpayCredentials();
  assert.ok(creds.baseUrl.includes('api.razorpay.com'), 'Should target Razorpay API');
  assert.ok(creds.environment === 'test' || creds.environment === 'live', 'Should have a valid environment');
});

test('Razorpay Service - Webhook secret credentials resolution', async () => {
  const dummySecret = 'test_dummy_wh_secret_abc';
  const orig = process.env.RAZORPAY_WEBHOOK_SECRET;
  try {
    process.env.RAZORPAY_WEBHOOK_SECRET = dummySecret;
    const creds = await getRazorpayCredentials();
    assert.strictEqual(creds.webhookSecret, dummySecret, 'Must read RAZORPAY_WEBHOOK_SECRET from environment');
  } finally {
    if (orig !== undefined) {
      process.env.RAZORPAY_WEBHOOK_SECRET = orig;
    } else {
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
    }
  }
});

test('Razorpay Service - Client payment signature verification', async () => {
  const testKeySecret = 'test_secret_12345';
  process.env.RAZORPAY_KEY_SECRET = testKeySecret;

  const orderId = 'order_test_998877';
  const paymentId = 'pay_test_112233';
  const validSignature = crypto
    .createHmac('sha256', testKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  // Valid signature
  const isValid = await verifyRazorpayPaymentSignature({
    orderId,
    paymentId,
    signature: validSignature,
  });
  assert.equal(isValid, true, 'Valid HMAC signature must verify successfully');

  // Invalid / Tampered signature
  const isTampered = await verifyRazorpayPaymentSignature({
    orderId,
    paymentId,
    signature: 'bad_signature_hash',
  });
  assert.equal(isTampered, false, 'Tampered HMAC signature must fail verification');

  // Missing fields
  const isMissing = await verifyRazorpayPaymentSignature({
    orderId: '',
    paymentId,
    signature: validSignature,
  });
  assert.equal(isMissing, false, 'Missing orderId must fail verification');
});

test('Razorpay Service - Webhook signature verification', async () => {
  const testWebhookSecret = 'webhook_secret_9988';
  process.env.RAZORPAY_WEBHOOK_SECRET = testWebhookSecret;

  const rawBody = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_123' } } } });
  const validWebhookSig = crypto
    .createHmac('sha256', testWebhookSecret)
    .update(rawBody)
    .digest('hex');

  const isValid = await verifyRazorpayWebhookSignature({
    rawBody,
    signature: validWebhookSig,
  });
  assert.equal(isValid, true, 'Valid webhook signature must verify');

  const isInvalid = await verifyRazorpayWebhookSignature({
    rawBody,
    signature: 'invalid_sig',
  });
  assert.equal(isInvalid, false, 'Invalid webhook signature must fail');
});

test('Razorpay Service - Refund amount validation', async () => {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_mock';
  process.env.RAZORPAY_KEY_SECRET = 'rzp_secret_mock';

  await assert.rejects(
    async () => {
      await createRazorpayRefund({ paymentId: 'pay_123', amount: 0 });
    },
    /Refund amount must be greater than zero/,
    'Should reject zero refund amount'
  );

  await assert.rejects(
    async () => {
      await createRazorpayRefund({ paymentId: 'pay_123', amount: -50 });
    },
    /Refund amount must be greater than zero/,
    'Should reject negative refund amount'
  );
});

test('Razorpay Service - Mock handler hook', async () => {
  let mockRefundCalled = false;
  setMockRazorpayHandler({
    createRefund: async ({ paymentId, amount, receipt }) => {
      mockRefundCalled = true;
      return {
        refundId: 'rfnd_mock_123',
        status: 'processed',
        amount,
        raw: { id: 'rfnd_mock_123', payment_id: paymentId, receipt },
      };
    },
  });

  const refundResult = await createRazorpayRefund({
    paymentId: 'pay_abc',
    amount: 250,
    receipt: 'rcpt_001',
  });

  assert.equal(mockRefundCalled, true, 'Mock handler must be invoked');
  assert.equal(refundResult.refundId, 'rfnd_mock_123');
  assert.equal(refundResult.status, 'processed');
  assert.equal(refundResult.amount, 250);

  // Clear mock handler
  setMockRazorpayHandler(null);
});
