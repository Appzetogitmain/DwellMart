import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FiAlertCircle, FiArrowLeft, FiCheck, FiCreditCard, FiLoader } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import StripeSubscriptionForm from '../components/StripeSubscriptionForm';
import {
  changeVendorSubscriptionPlan,
  getVendorSubscription,
  getVendorSubscriptionPlans,
} from '../services/vendorService';

import { useVendorAuthStore } from '../store/vendorAuthStore';

const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';
let razorpayScriptPromise = null;

const loadRazorpayScript = () => {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = RAZORPAY_SCRIPT;
      script.async = true;
      script.onload = () => resolve(window.Razorpay);
      script.onerror = () => reject(new Error('Failed to load Razorpay checkout.'));
      document.body.appendChild(script);
    });
  }
  return razorpayScriptPromise;
};

const formatPrice = (plan) => {
  const inr = Number(plan?.pricing?.inr ?? plan?.price_inr ?? 0);
  const usd = Number(plan?.pricing?.usd ?? plan?.price_usd ?? 0);
  if (inr === 0 && usd === 0) return 'Free';
  return `Rs. ${inr.toFixed(0)} / $${usd.toFixed(2)}`;
};

const getIntervalLabel = (plan) => plan?.intervalLabel || (() => {
  const count = Number.parseInt(plan?.interval_count, 10) || 1;
  const interval = plan?.interval || 'month';
  const unit = count === 1 ? interval : `${interval}s`;
  return count === 1 ? unit : `${count} ${unit}`;
})();

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const VendorRenewSubscription = () => {
  const navigate = useNavigate();
  const { vendor } = useVendorAuthStore();
  const isLoggedIn = Boolean(vendor || localStorage.getItem('vendor-token'));
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showStripe, setShowStripe] = useState(false);
  const [stripeConfig, setStripeConfig] = useState({ clientSecret: '', publishableKey: '' });

  const refreshSubscription = async (attempt = 0) => {
    try {
      const response = await getVendorSubscription();
      if (response?.data?.isActive) {
        toast.success('Subscription is active again.');
        navigate('/vendor/dashboard', { replace: true });
        return true;
      }
    } catch {
      // ignore while polling
    }

    if (attempt >= 8) {
      toast.success('Payment submitted. Give the billing webhook a moment, then refresh if needed.');
      return false;
    }

    await wait(3000);
    return refreshSubscription(attempt + 1);
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const response = await getVendorSubscriptionPlans();
        setPlans(response?.data || []);
      } finally {
        setIsLoading(false);
      }
    };

    bootstrap();
  }, []);

  const openRazorpay = async (checkout, plan) => {
    const Razorpay = await loadRazorpayScript();
    const instance = new Razorpay({
      key: checkout.keyId,
      subscription_id: checkout.subscriptionId,
      name: 'DwellMart Vendor Billing',
      description: `${plan.name} subscription`,
      theme: { color: '#0f766e' },
      handler: async () => {
        toast.success('Authorization received. Waiting for subscription confirmation.');
        await refreshSubscription();
      },
    });
    instance.open();
  };

  const handleSubmit = async () => {
    if (!selectedPlanId) {
      toast.error('Please select a plan first.');
      return;
    }

    const plan = plans.find((entry) => entry._id === selectedPlanId);
    setIsSubmitting(true);
    try {
      const response = await changeVendorSubscriptionPlan(selectedPlanId);
      const data = response?.data || {};

      if (data.subscription?.isActive) {
        toast.success('Subscription updated successfully.');
        navigate('/vendor/dashboard', { replace: true });
        return;
      }

      if (data.gateway === 'stripe') {
        if (data.checkout?.clientSecret) {
          setStripeConfig({
            clientSecret: data.checkout.clientSecret,
            publishableKey: data.checkout.publishableKey,
          });
          setShowStripe(true);
        } else {
          await refreshSubscription();
        }
        return;
      }

      if (data.gateway === 'razorpay' && plan) {
        await openRazorpay(data.checkout, plan);
        return;
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-slate-50 p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto w-full max-w-4xl py-10"
        >
          <div className="mb-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <FiAlertCircle size={30} />
            </div>
            <h1 className="text-3xl font-black text-slate-900">Update your subscription</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm text-slate-500">
              Choose a plan to renew, upgrade, or downgrade your vendor billing. Stripe changes support proration, while Razorpay transitions safely through a new recurring subscription.
            </p>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <FiLoader className="animate-spin text-2xl text-teal-600" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => (
                <button
                  key={plan._id}
                  type="button"
                  onClick={() => setSelectedPlanId(plan._id)}
                  className={`rounded-[28px] border p-6 text-left transition ${
                    selectedPlanId === plan._id
                      ? 'border-teal-500 bg-teal-50/80 shadow-lg shadow-teal-100'
                      : 'border-slate-200 bg-white hover:border-teal-300'
                  }`}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">{plan.name}</h2>
                      <p className="mt-1 text-sm text-slate-500">per {getIntervalLabel(plan)}</p>
                    </div>
                    {selectedPlanId === plan._id ? (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-600 text-white">
                        <FiCheck />
                      </span>
                    ) : null}
                  </div>
                  <p className="text-3xl font-black text-slate-900">{formatPrice(plan)}</p>
                  <ul className="mt-5 space-y-2">
                    {(plan.featureHighlights || []).map((feature) => (
                      <li key={`${plan._id}-${feature}`} className="text-sm text-slate-600">
                        {feature}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          )}

          {!isLoading ? (
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!selectedPlanId || isSubmitting}
                className="flex items-center justify-center gap-2 rounded-2xl bg-teal-600 px-10 py-3 font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
              >
                {isSubmitting ? <FiLoader className="animate-spin" /> : <FiCreditCard />}
                {isSubmitting ? 'Preparing checkout...' : 'Continue to billing'}
              </button>
              <button
                type="button"
                onClick={() => navigate(isLoggedIn ? '/vendor/dashboard' : '/vendor/login')}
                className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-10 py-3 font-semibold text-slate-700 transition hover:bg-slate-100 shadow-2xs cursor-pointer"
              >
                <FiArrowLeft />
                {isLoggedIn ? 'Back to Dashboard' : 'Back to Login'}
              </button>
            </div>
          ) : null}
        </motion.div>
      </div>

      <StripeSubscriptionForm
        open={showStripe}
        clientSecret={stripeConfig.clientSecret}
        publishableKey={stripeConfig.publishableKey}
        onClose={() => setShowStripe(false)}
        onSubmitted={async () => {
          setShowStripe(false);
          await refreshSubscription();
        }}
      />
    </>
  );
};

export default VendorRenewSubscription;


