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

    const sanitizedPhone = String(customer.phone || '9999999999').replace(/\D/g, '').slice(-10) || '9999999999';
    const payload = {
        order_id: String(orderId),
        order_amount: Math.max(Number(amount || 0), 1),
        order_currency: String(currency || 'INR').toUpperCase(),
        customer_details: {
            customer_id: String(customer.id || customer._id || `cust_${Date.now()}`),
            customer_name: String(customer.name || 'Customer').trim(),
            customer_email: String(customer.email || 'customer@dwellmart.com').trim(),
            customer_phone: sanitizedPhone,
        },
        order_meta: {
            return_url: returnUrl || `http://localhost:3000/order-confirmation/${orderId}?order_id={order_id}`,
            notify_url: notifyUrl || null,
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

export const fetchCashfreeOrder = async (orderId) => {
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
    const creds = await getCashfreeCredentials();
    if (!creds.secretKey || !signature || !timestamp) return false;

    try {
        const dataToSign = timestamp + rawBody;
        const expectedSignature = crypto
            .createHmac('sha256', creds.secretKey)
            .update(dataToSign)
            .digest('base64');
        return expectedSignature === signature;
    } catch {
        return false;
    }
};

export { getCashfreeCredentials };
