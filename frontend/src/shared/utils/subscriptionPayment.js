import api from './api';
import { getCashfreeInstance } from './cashfreeLoader';
import { openRazorpayCheckout } from './razorpayLoader';

/**
 * Resolves the effective gateway for subscription payments based on admin settings
 * and optional user preference.
 */
export const resolveEffectiveGateway = (paymentSettings = {}, preferredGateway = 'auto') => {
  const safeSettings = paymentSettings || {};
  const isCashfreeEnabled = safeSettings.cashfreeEnabled !== false;
  const isRazorpayEnabled = safeSettings.razorpayEnabled === true;

  if (isCashfreeEnabled && isRazorpayEnabled) {
    if (preferredGateway && preferredGateway !== 'auto') {
      return preferredGateway;
    }
    if (safeSettings.defaultGateway === 'cashfree') {
      return 'cashfree';
    }
    return 'razorpay';
  }

  if (isRazorpayEnabled) return 'razorpay';
  return 'cashfree';
};

/**
 * Execute vendor subscription checkout with either Razorpay or Cashfree.
 *
 * @param {object} params
 * @param {string} params.planId
 * @param {string} [params.planName]
 * @param {string} params.email
 * @param {string} [params.name]
 * @param {string} [params.phone]
 * @param {string} [params.preferredGateway]
 * @param {object} [params.paymentSettings]
 * @param {Function} [params.onStatusChange]
 * @returns {Promise<{ isPaid: boolean, subscription?: object, gateway: string, raw?: object }>}
 */
export const executeSubscriptionPayment = async ({
  planId,
  planName = 'Vendor Subscription',
  email,
  name = '',
  phone = '',
  preferredGateway = 'auto',
  paymentSettings,
  onStatusChange = () => {},
}) => {
  let settings = paymentSettings;
  if (!settings) {
    try {
      const res = await api.get('/settings/payment');
      settings = res.data?.data || res.data || {};
    } catch {
      settings = {};
    }
  }

  const gateway = resolveEffectiveGateway(settings, preferredGateway);
  onStatusChange('initiating');

  if (gateway === 'razorpay') {
    // ── Razorpay Path ────────────────────────────────────────────────────────
    const sessionRes = await api.post('/payments/razorpay/session', {
      subscriptionPlanId: planId,
      email,
    });
    const sessionData = sessionRes.data?.data || sessionRes.data || {};
    const { keyId, rzpOrderId, amount, currency } = sessionData;

    if (!keyId || !rzpOrderId) {
      throw new Error(sessionData?.message || 'Could not initiate Razorpay payment session.');
    }

    onStatusChange('checkout_open');

    let rzpResponse;
    try {
      rzpResponse = await openRazorpayCheckout({
        key: keyId,
        amount,
        currency: currency || 'INR',
        order_id: rzpOrderId,
        name: 'DwellMart',
        description: `Plan: ${planName}`,
        prefill: {
          name: name || '',
          email: email || '',
          contact: phone || '',
        },
        theme: {
          color: '#10b981',
        },
      });
    } catch (rzpErr) {
      if (rzpErr?.message === 'PAYMENT_DISMISSED') {
        const dismissedErr = new Error('PAYMENT_DISMISSED');
        dismissedErr.isDismissed = true;
        throw dismissedErr;
      }
      throw rzpErr;
    }

    onStatusChange('processing');
    const verifyRes = await api.post('/payments/razorpay/verify', {
      subscriptionPlanId: planId,
      email,
      razorpay_order_id: rzpResponse.razorpay_order_id,
      razorpay_payment_id: rzpResponse.razorpay_payment_id,
      razorpay_signature: rzpResponse.razorpay_signature,
    });
    const verifyData = verifyRes.data?.data || verifyRes.data || {};

    return {
      isPaid: Boolean(verifyData.isPaid),
      subscription: verifyData.subscription,
      gateway: 'razorpay',
      raw: verifyData,
    };
  }

  // ── Cashfree Path ──────────────────────────────────────────────────────────
  const sessionRes = await api.post('/payments/cashfree/session', {
    subscriptionPlanId: planId,
    email,
  });
  const { paymentSessionId, orderId: cfOrderId, environment } = sessionRes.data?.data || sessionRes.data || sessionRes || {};

  if (!paymentSessionId) {
    throw new Error(sessionRes?.message || 'Could not initiate Cashfree payment session.');
  }

  onStatusChange('checkout_open');
  const cashfree = await getCashfreeInstance(environment || 'sandbox');
  try {
    await cashfree.checkout({
      paymentSessionId,
      redirectTarget: '_modal',
    });
  } catch (modalErr) {
    console.warn('Cashfree checkout modal notice:', modalErr);
  }

  onStatusChange('processing');
  const verifyRes = await api.post('/payments/cashfree/verify', { orderId: cfOrderId });
  const verifyData = verifyRes.data?.data || verifyRes.data || verifyRes || {};

  return {
    isPaid: Boolean(verifyData.isPaid),
    subscription: verifyData.subscription,
    gateway: 'cashfree',
    raw: verifyData,
  };
};
