import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FiAlertCircle, FiArrowLeft, FiCheck, FiCheckCircle, FiLoader } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  changeVendorSubscriptionPlan,
  getVendorSubscriptionPlans,
} from '../services/vendorService';
import api from '../../../shared/utils/api';
import { getCashfreeInstance } from '../../../shared/utils/cashfreeLoader';

import { useVendorAuthStore } from '../store/vendorAuthStore';

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

const VendorRenewSubscription = () => {
  const navigate = useNavigate();
  const { vendor } = useVendorAuthStore();
  const isLoggedIn = Boolean(vendor || localStorage.getItem('vendor-token'));
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const response = await getVendorSubscriptionPlans();
        const rawPlans = Array.isArray(response?.data) ? response.data : [];
        // Renewals are strictly for paid plans — filter out free/trial plans
        const paidPlans = rawPlans.filter(
          (p) => !p.isFree && !p.isTrial && (Number(p?.pricing?.inr ?? p?.price_inr ?? 0) > 0 || Number(p?.pricing?.usd ?? p?.price_usd ?? 0) > 0)
        );
        setPlans(paidPlans);
      } finally {
        setIsLoading(false);
      }
    };

    bootstrap();
  }, []);

  const handleSubmit = async () => {
    if (!selectedPlanId) {
      toast.error('Please select a plan first.');
      return;
    }

    const selectedPlan = plans.find((p) => p._id === selectedPlanId);
    const isFree = selectedPlan?.isFree || selectedPlan?.isTrial || (Number(selectedPlan?.pricing?.inr ?? selectedPlan?.price_inr ?? 0) === 0 && Number(selectedPlan?.pricing?.usd ?? selectedPlan?.price_usd ?? 0) === 0);
    if (isFree) {
      toast.error('Free trial is not available for renewal. Please select a paid plan.');
      return;
    }
    const email = vendor?.email || localStorage.getItem('vendor-email');

    setIsSubmitting(true);
    try {
      if (!isFree && email) {
        try {
          const sessionRes = await api.post('/payments/cashfree/session', {
            subscriptionPlanId: selectedPlanId,
            email,
          });
          const { paymentSessionId, orderId: cfOrderId, environment } = sessionRes.data?.data || sessionRes.data || {};

          if (paymentSessionId) {
            const cashfree = await getCashfreeInstance(environment || 'sandbox');
            await cashfree.checkout({
              paymentSessionId,
              redirectTarget: "_modal",
            });
            await api.post('/payments/cashfree/verify', { orderId: cfOrderId });
          }
        } catch (cfErr) {
          console.warn("Cashfree renewal notice:", cfErr);
        }
      }

      await changeVendorSubscriptionPlan(selectedPlanId);
      toast.success('Subscription updated successfully.');
      navigate(isLoggedIn ? '/vendor/dashboard' : '/vendor/login', { replace: true });
    } catch (error) {
      toast.error(error.message || 'Could not update subscription.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
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
            Choose a plan to renew, upgrade, or change your vendor plan.
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
              className="flex items-center justify-center gap-2 rounded-2xl bg-teal-600 px-10 py-3 font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60 cursor-pointer"
            >
              {isSubmitting ? <FiLoader className="animate-spin" /> : <FiCheckCircle />}
              {isSubmitting ? 'Updating plan...' : 'Confirm Plan Update'}
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
  );
};

export default VendorRenewSubscription;
