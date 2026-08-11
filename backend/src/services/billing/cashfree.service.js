import crypto from 'node:crypto';
import ApiError from '../../utils/ApiError.js';
import Settings from '../../models/Settings.model.js';

const getCashfreeCredentials = async () => {
    let appId = process.env.CASHFREE_APP_ID || '';
    let secretKey = process.env.CASHFREE_SECRET_KEY || '';
    let env = process.env.CASHFREE_ENV || 'sandbox';

    try {
        const dbSettings = await Settings.findOne({ key: 'payment' });
        if (dbSettings?.value) {
            const paymentConfig = dbSettings.value;
            if (paymentConfig.cashfreeAppId) appId = paymentConfig.cashfreeAppId;
            if (paymentConfig.cashfreeSecretKey) secretKey = paymentConfig.cashfreeSecretKey;
            if (paymentConfig.cashfreeEnv) env = paymentConfig.cashfreeEnv;
        }
    } catch {
        // Fall back to environment variables
    }

    const baseUrl = env === 'production' || env === 'prod'
        ? 'https://api.cashfree.com/pg'
        : 'https://sandbox.cashfree.com/pg';

    return {
        appId: appId.trim(),
        secretKey: secretKey.trim(),
        env: env.toLowerCase().includes('prod') ? 'production' : 'sandbox',
        baseUrl,
    };
};

export const createCashfreeOrder = async ({
    orderId,
    amount,
    currency = 'INR',
    customer = {},
    returnUrl,
    notifyUrl,
}) => {
    const creds = await getCashfreeCredentials();

    if (!creds.appId || !creds.secretKey) {
        throw new ApiError(400, 'Cashfree API credentials are not configured.');
    }

    const numericAmount = Number(amount || 0);

    // P2-SEC-08 FIX: Do NOT silently charge ₹1 on free/fully-discounted orders.
    // A customer who receives 100% coupon discount owes ₹0 — charging ₹1 is unauthorized.
    // Callers must detect total === 0 and route to a free-order/COD path instead.
    if (numericAmount <= 0) {
        throw new ApiError(400, 'Payment gateway cannot process a ₹0 order. Use the free-order or COD checkout path for fully-discounted orders.');
    }

    const sanitizedPhone = String(customer.phone || '9999999999').replace(/\D/g, '').slice(-10) || '9999999999';
    const payload = {
        order_id: String(orderId),
        order_amount: Math.round(numericAmount * 100) / 100, // round to 2 decimal places
        order_currency: String(currency || 'INR').toUpperCase(),
        customer_details: {
            customer_id: String(customer.id || customer._id || `cust_${Date.now()}`),
            customer_name: String(customer.name || 'Customer').trim(),
            customer_email: String(customer.email || 'customer@dwellmart.com').trim(),
            customer_phone: sanitizedPhone,
        },
        order_meta: {
            return_url: returnUrl || `http://localhost:3000/order-confirmation/${orderId}?order_id={order_id}`,
            ...(notifyUrl ? { notify_url: notifyUrl } : {}),
        },
    };

    const response = await fetch(`${creds.baseUrl}/orders`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-version': '2023-08-01',
            'x-client-id': creds.appId,
            'x-client-secret': creds.secretKey,
        },
        body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new ApiError(
            response.status,
            data?.message || data?.error?.message || 'Failed to create Cashfree order.'
        );
    }

    return {
        cfOrderId: data.cf_order_id,
        orderId: data.order_id,
        paymentSessionId: data.payment_session_id,
        orderStatus: data.order_status,
        environment: creds.env,
    };
};

let _mockHandler = null;

export const setMockCashfreeHandler = (handler) => {
    _mockHandler = handler;
};

export const fetchCashfreeOrder = async (orderId) => {
    if (_mockHandler?.fetchOrder) return _mockHandler.fetchOrder(orderId);

    const creds = await getCashfreeCredentials();

    if (!creds.appId || !creds.secretKey) {
        throw new ApiError(400, 'Cashfree API credentials are not configured.');
    }

    const response = await fetch(`${creds.baseUrl}/orders/${encodeURIComponent(orderId)}`, {
        method: 'GET',
        headers: {
            'x-api-version': '2023-08-01',
            'x-client-id': creds.appId,
            'x-client-secret': creds.secretKey,
        },
    });

    const data = await response.json();

    if (!response.ok) {
        throw new ApiError(
            response.status,
            data?.message || data?.error?.message || 'Failed to fetch Cashfree order status.'
        );
    }

    return data;
};

export const fetchCashfreeOrderPayments = async (orderId) => {
    if (_mockHandler?.fetchPayments) return _mockHandler.fetchPayments(orderId);

    const creds = await getCashfreeCredentials();

    if (!creds.appId || !creds.secretKey) {
        throw new ApiError(400, 'Cashfree API credentials are not configured.');
    }

    const response = await fetch(`${creds.baseUrl}/orders/${encodeURIComponent(orderId)}/payments`, {
        method: 'GET',
        headers: {
            'x-api-version': '2023-08-01',
            'x-client-id': creds.appId,
            'x-client-secret': creds.secretKey,
        },
    });

    const data = await response.json();

    if (!response.ok) {
        return [];
    }

    return Array.isArray(data) ? data : [];
};

export const verifyCashfreeSignature = async (rawBody, timestamp, signature) => {
    if (_mockHandler?.verifySignature) return _mockHandler.verifySignature(rawBody, timestamp, signature);

    const creds = await getCashfreeCredentials();
    if (!creds.secretKey || !signature || !timestamp) return false;

    try {
        // P2-SEC-02 FIX: Enforce a 5-minute replay window.
        // Webhooks with a stale timestamp are rejected regardless of signature validity.
        // This makes replay attacks impractical — an attacker cannot replay a valid webhook
        // after the window expires even if they intercepted the request.
        const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
        const webhookTimeMs = Number(timestamp) * 1000; // Cashfree sends Unix seconds
        const ageMs = Date.now() - webhookTimeMs;
        if (Math.abs(ageMs) > REPLAY_WINDOW_MS) {
            console.warn(`[Cashfree Webhook] Rejected: timestamp age ${Math.round(ageMs / 1000)}s exceeds 5-minute window.`);
            return false;
        }

        const dataToSign = timestamp + rawBody;
        const expectedSignature = crypto
            .createHmac('sha256', creds.secretKey)
            .update(dataToSign)
            .digest('base64');

        // Timing-safe comparison to prevent HMAC oracle attacks
        const expectedBuf = Buffer.from(expectedSignature);
        const actualBuf   = Buffer.from(signature);
        if (expectedBuf.length !== actualBuf.length) return false;
        return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch {
        return false;
    }
};

export { getCashfreeCredentials };
