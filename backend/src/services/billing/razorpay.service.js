import mongoose from 'mongoose';
import crypto from 'node:crypto';
import ApiError from '../../utils/ApiError.js';
import Settings from '../../models/Settings.model.js';

let mockRazorpayHandler = null;

/**
 * Test hook to mock Razorpay responses in unit and integration test suites.
 * @param {object|null} handler
 */
export const setMockRazorpayHandler = (handler) => {
    mockRazorpayHandler = handler;
};

/**
 * Retrieve Razorpay credentials from Settings collection with environment variable fallback.
 */
export const getRazorpayCredentials = async () => {
    let keyId = process.env.RAZORPAY_KEY_ID || '';
    let keySecret = process.env.RAZORPAY_KEY_SECRET || '';
    let webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    let env = process.env.RAZORPAY_ENV || 'test';

    if (mongoose.connection?.readyState === 1) {
        try {
            const dbSettings = await Settings.findOne({ key: 'payment' }).lean();
            if (dbSettings?.value) {
                const paymentConfig = dbSettings.value;
                if (paymentConfig.razorpayKeyId?.trim()) keyId = paymentConfig.razorpayKeyId.trim();
                if (paymentConfig.razorpayKeySecret?.trim()) keySecret = paymentConfig.razorpayKeySecret.trim();
                if (paymentConfig.razorpayWebhookSecret?.trim()) webhookSecret = paymentConfig.razorpayWebhookSecret.trim();
                if (paymentConfig.razorpayEnv?.trim()) env = paymentConfig.razorpayEnv.trim();
            }
        } catch {
            // Fall back to environment variables
        }
    }

    const isLive = String(env).toLowerCase().includes('live') || String(env).toLowerCase().includes('prod');

    return {
        keyId: String(keyId).trim(),
        keySecret: String(keySecret).trim(),
        webhookSecret: String(webhookSecret).trim(),
        env: isLive ? 'live' : 'test',
        environment: isLive ? 'live' : 'test',
        baseUrl: 'https://api.razorpay.com/v1',
    };
};

/**
 * Create a new Razorpay Order.
 *
 * @param {object} params
 * @param {number} params.amount  Amount in INR (standard rupees)
 * @param {string} [params.currency='INR']
 * @param {string} [params.receipt] Local identifier e.g. sessionId or orderId
 * @param {object} [params.notes] Metadata dictionary
 * @returns {Promise<{ orderId: string, amount: number, amountInPaise: number, currency: string, keyId: string, environment: string, raw: object }>}
 */
export const createRazorpayOrder = async ({
    amount,
    currency = 'INR',
    receipt,
    notes = {},
}) => {
    if (mockRazorpayHandler?.createOrder) {
        return mockRazorpayHandler.createOrder({ amount, currency, receipt, notes });
    }

    const creds = await getRazorpayCredentials();
    if (!creds.keyId || !creds.keySecret) {
        throw new ApiError(400, 'Razorpay API credentials are not configured. Please check Admin Payment Settings.');
    }

    const numericAmount = Number(amount || 0);
    if (numericAmount <= 0) {
        throw new ApiError(400, 'Payment gateway cannot process a ₹0 order. Use the free-order or COD checkout path for fully-discounted orders.');
    }

    // Razorpay requires integer amount in smallest currency unit (paise for INR)
    const amountInPaise = Math.round(numericAmount * 100);

    const payload = {
        amount: amountInPaise,
        currency: String(currency || 'INR').toUpperCase(),
        ...(receipt ? { receipt: String(receipt).slice(-40) } : {}),
        payment_capture: 1, // Auto-capture payment on authorization
        notes: {
            ...notes,
            dwellmart_receipt: String(receipt || ''),
        },
    };

    const authHeader = 'Basic ' + Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64');

    const response = await fetch(`${creds.baseUrl}/orders`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
        },
        body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
        const errorDesc = data?.error?.description || data?.message || 'Razorpay order creation failed.';
        throw new ApiError(response.status || 500, `Razorpay error: ${errorDesc}`);
    }

    return {
        orderId: data.id,
        amount: data.amount / 100, // back in standard currency units
        amountInPaise: data.amount,
        currency: data.currency,
        keyId: creds.keyId,
        environment: creds.env,
        raw: data,
    };
};

/**
 * Fetch a Razorpay Order by orderId.
 */
export const fetchRazorpayOrder = async (orderId) => {
    if (mockRazorpayHandler?.fetchOrder) {
        return mockRazorpayHandler.fetchOrder(orderId);
    }

    const creds = await getRazorpayCredentials();
    if (!creds.keyId || !creds.keySecret) {
        throw new ApiError(400, 'Razorpay API credentials are not configured.');
    }

    const authHeader = 'Basic ' + Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64');
    const response = await fetch(`${creds.baseUrl}/orders/${encodeURIComponent(orderId)}`, {
        method: 'GET',
        headers: {
            Authorization: authHeader,
        },
    });

    const data = await response.json();
    if (!response.ok) {
        throw new ApiError(response.status || 500, data?.error?.description || 'Failed to fetch Razorpay order.');
    }

    return data;
};

/**
 * Fetch payment details from Razorpay by paymentId.
 */
export const fetchRazorpayPayment = async (paymentId) => {
    if (mockRazorpayHandler?.fetchPayment) {
        return mockRazorpayHandler.fetchPayment(paymentId);
    }

    const creds = await getRazorpayCredentials();
    if (!creds.keyId || !creds.keySecret) {
        throw new ApiError(400, 'Razorpay API credentials are not configured.');
    }

    const authHeader = 'Basic ' + Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64');
    const response = await fetch(`${creds.baseUrl}/payments/${encodeURIComponent(paymentId)}`, {
        method: 'GET',
        headers: {
            Authorization: authHeader,
        },
    });

    const data = await response.json();
    if (!response.ok) {
        throw new ApiError(response.status || 500, data?.error?.description || 'Failed to fetch Razorpay payment.');
    }

    return data;
};

/**
 * Verify client-returned payment signature (HMAC-SHA256).
 *
 * @param {object} params
 * @param {string} params.orderId
 * @param {string} params.paymentId
 * @param {string} params.signature
 * @returns {Promise<boolean>}
 */
export const verifyRazorpayPaymentSignature = async ({ orderId, paymentId, signature }) => {
    if (mockRazorpayHandler?.verifySignature) {
        return mockRazorpayHandler.verifySignature({ orderId, paymentId, signature });
    }

    if (!orderId || !paymentId || !signature) {
        return false;
    }

    const creds = await getRazorpayCredentials();
    if (!creds.keySecret) {
        return false;
    }

    const body = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
        .createHmac('sha256', creds.keySecret)
        .update(body)
        .digest('hex');

    try {
        const expectedBuf = Buffer.from(expectedSignature, 'utf-8');
        const signatureBuf = Buffer.from(String(signature).trim(), 'utf-8');
        if (expectedBuf.length !== signatureBuf.length) {
            return false;
        }
        return crypto.timingSafeEqual(expectedBuf, signatureBuf);
    } catch {
        return false;
    }
};

/**
 * Verify Razorpay Webhook signature.
 *
 * @param {object} params
 * @param {string|Buffer} params.rawBody
 * @param {string} params.signature
 * @returns {Promise<boolean>}
 */
export const verifyRazorpayWebhookSignature = async ({ rawBody, signature }) => {
    if (mockRazorpayHandler?.verifyWebhookSignature) {
        return mockRazorpayHandler.verifyWebhookSignature({ rawBody, signature });
    }

    if (!rawBody || !signature) {
        return false;
    }

    const creds = await getRazorpayCredentials();
    const secret = creds.webhookSecret || creds.keySecret;
    if (!secret) {
        return false;
    }

    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

    try {
        const expectedBuf = Buffer.from(expectedSignature, 'utf-8');
        const signatureBuf = Buffer.from(String(signature).trim(), 'utf-8');
        if (expectedBuf.length !== signatureBuf.length) {
            return false;
        }
        return crypto.timingSafeEqual(expectedBuf, signatureBuf);
    } catch {
        return false;
    }
};

/**
 * Issue an automated refund through Razorpay.
 *
 * @param {object} params
 * @param {string} params.paymentId Razorpay payment ID (e.g. pay_xxx)
 * @param {number} params.amount    Amount in standard currency units (INR)
 * @param {string} [params.receipt] Idempotency refund key
 * @param {object} [params.notes]
 * @returns {Promise<{ refundId: string, status: string, amount: number, raw: object }>}
 */
export const createRazorpayRefund = async ({
    paymentId,
    orderId,
    amount,
    receipt,
    notes = {},
}) => {
    if (mockRazorpayHandler?.createRefund) {
        return mockRazorpayHandler.createRefund({ paymentId, orderId, amount, receipt, notes });
    }

    const creds = await getRazorpayCredentials();
    if (!creds.keyId || !creds.keySecret) {
        throw new ApiError(400, 'Razorpay API credentials are not configured.');
    }

    const numericAmount = Number(amount || 0);
    if (numericAmount <= 0) {
        throw new ApiError(400, 'Refund amount must be greater than zero.');
    }

    const authHeader = 'Basic ' + Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64');

    let resolvedPaymentId = paymentId;
    if (!resolvedPaymentId && orderId) {
        try {
            const orderPaymentsRes = await fetch(`${creds.baseUrl}/orders/${encodeURIComponent(orderId)}/payments`, {
                method: 'GET',
                headers: { Authorization: authHeader },
            });
            if (orderPaymentsRes.ok) {
                const orderPaymentsData = await orderPaymentsRes.json();
                const successfulPayment = (orderPaymentsData.items || []).find(
                    (p) => p.status === 'captured' || p.status === 'authorized'
                );
                if (successfulPayment?.id) {
                    resolvedPaymentId = successfulPayment.id;
                }
            }
        } catch {
            // Ignore error here and fail below if no payment id could be resolved
        }
    }

    if (!resolvedPaymentId) {
        throw new ApiError(400, 'Cannot issue Razorpay refund: paymentId could not be identified.');
    }

    const amountInPaise = Math.round(numericAmount * 100);

    const payload = {
        amount: amountInPaise,
        ...(receipt ? { receipt: String(receipt).slice(-40) } : {}),
        notes: {
            ...notes,
            refund_reason: notes?.reason || notes?.note || 'Customer return / cancellation',
        },
    };

    const response = await fetch(`${creds.baseUrl}/payments/${encodeURIComponent(resolvedPaymentId)}/refund`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
        },
        body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
        const errorDesc = data?.error?.description || data?.message || 'Razorpay refund failed.';
        throw new ApiError(response.status || 500, `Razorpay refund error: ${errorDesc}`);
    }

    return {
        refundId: data.id,
        status: data.status,
        amount: (data.amount || amountInPaise) / 100,
        raw: data,
    };
};
