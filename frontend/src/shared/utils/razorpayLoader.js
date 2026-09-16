const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
let razorpayScriptPromise = null;

export const loadRazorpaySDK = () => {
  if (typeof window !== 'undefined' && window.Razorpay) {
    return Promise.resolve(window.Razorpay);
  }

  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = RAZORPAY_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve(window.Razorpay);
      script.onerror = () => {
        razorpayScriptPromise = null;
        reject(new Error('Failed to load Razorpay Checkout SDK.'));
      };
      document.body.appendChild(script);
    });
  }

  return razorpayScriptPromise;
};

/**
 * Open Razorpay Checkout modal and return a Promise that resolves on successful payment
 * or rejects if user cancels or payment fails.
 *
 * @param {object} options Razorpay Standard Checkout options (key, amount, currency, order_id, name, prefill, etc.)
 * @returns {Promise<{ razorpay_payment_id: string, razorpay_order_id: string, razorpay_signature: string }>}
 */
export const openRazorpayCheckout = async (options = {}) => {
  const Razorpay = await loadRazorpaySDK();
  return new Promise((resolve, reject) => {
    let completed = false;

    const rzpOptions = {
      ...options,
      handler: (response) => {
        completed = true;
        resolve(response);
      },
      modal: {
        ...(options.modal || {}),
        ondismiss: () => {
          if (!completed) {
            if (options.modal?.ondismiss) {
              try {
                options.modal.ondismiss();
              } catch {}
            }
            reject(new Error('PAYMENT_DISMISSED'));
          }
        },
      },
    };

    const rzpInstance = new Razorpay(rzpOptions);
    rzpInstance.on('payment.failed', (response) => {
      completed = true;
      const error = response?.error || {};
      const err = new Error(error.description || 'Razorpay payment failed.');
      err.code = error.code;
      err.reason = error.reason;
      err.metadata = error.metadata;
      reject(err);
    });

    rzpInstance.open();
  });
};
