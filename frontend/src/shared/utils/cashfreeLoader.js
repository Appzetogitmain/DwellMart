const CASHFREE_SCRIPT_URL = 'https://sdk.cashfree.com/js/v3/cashfree.js';
let cashfreeScriptPromise = null;

export const loadCashfreeSDK = () => {
  if (typeof window !== 'undefined' && window.Cashfree) {
    return Promise.resolve(window.Cashfree);
  }

  if (!cashfreeScriptPromise) {
    cashfreeScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = CASHFREE_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve(window.Cashfree);
      script.onerror = () => {
        cashfreeScriptPromise = null;
        reject(new Error('Failed to load Cashfree Payment SDK.'));
      };
      document.body.appendChild(script);
    });
  }

  return cashfreeScriptPromise;
};

export const getCashfreeInstance = async (mode = 'sandbox') => {
  const Cashfree = await loadCashfreeSDK();
  const sdkMode = mode === 'production' || mode === 'prod' ? 'production' : 'sandbox';
  return Cashfree({ mode: sdkMode });
};
