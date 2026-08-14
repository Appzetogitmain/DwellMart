import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  FiAlertCircle,
  FiArrowRight,
  FiCheck,
  FiCreditCard,
  FiLoader,
  FiRefreshCw,
  FiShield,
  FiStar,
} from 'react-icons/fi';
import {
  changeVendorSubscriptionPlan,
  getVendorSubscription,
  getVendorSubscriptionPlans,
} from '../services/vendorService';
import api from '../../../shared/utils/api';
import { getCashfreeInstance } from '../../../shared/utils/cashfreeLoader';

const intervalDays = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

const formatDate = (value) => {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const formatPrice = (plan) => {
  const inr = Number(plan?.pricing?.inr ?? plan?.price_inr ?? 0);
  const usd = Number(plan?.pricing?.usd ?? plan?.price_usd ?? 0);
  if (inr === 0 && usd === 0) return 'Free';
  if (plan?.displayCurrency === 'INR' || (inr > 0 && usd === 0)) {
    return `Rs. ${inr.toFixed(0)}`;
  }
  return `$${usd.toFixed(2)}`;
};

const getPlanAmount = (plan) => {
  if (typeof plan?.displayPrice === 'number') return Number(plan.displayPrice || 0);
  return Number(plan?.pricing?.usd ?? plan?.price_usd ?? plan?.pricing?.inr ?? plan?.price_inr ?? 0);
};

const getPlanIntervalDays = (plan) => {
  const count = Math.max(Number.parseInt(plan?.interval_count, 10) || 1, 1);
  const interval = String(plan?.interval || 'month');
  return count * (intervalDays[interval] || 30);
};

const getDailyRate = (plan) => {
  const days = Math.max(getPlanIntervalDays(plan), 1);
  return getPlanAmount(plan) / days;
};

const getDaysRemaining = (endDate) => {
  if (!endDate) return 0;
  const diff = new Date(endDate).getTime() - Date.now();
  return Math.max(Math.ceil(diff / (24 * 60 * 60 * 1000)), 0);
};

const getProgress = (startDate, endDate) => {
  if (!startDate || !endDate) return 100;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const now = Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 100;
  return Math.min(Math.max(((now - start) / (end - start)) * 100, 0), 100);
};

const getPlanFeatures = (plan) => {
  if (Array.isArray(plan?.featureHighlights)) return plan.featureHighlights;
  if (Array.isArray(plan?.features?.highlights)) return plan.features.highlights;
  if (Array.isArray(plan?.features)) return plan.features;
  return [];
};

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const SubscriptionManagement = () => {
  const [subscription, setSubscription] = useState(null);
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const currentPlan = subscription?.plan || null;
  const gateway = 'internal';
  const currentPlanId = String(currentPlan?._id || currentPlan?.id || subscription?.planId || '');
  const daysRemaining = getDaysRemaining(subscription?.current_period_end);
  const progress = getProgress(subscription?.current_period_start, subscription?.current_period_end);
  const currentDailyRate = currentPlan ? getDailyRate(currentPlan) : 0;

  const sortedPlans = useMemo(() => (
    [...plans].sort((left, right) => getDailyRate(left) - getDailyRate(right))
  ), [plans]);

  const upgradeOptions = useMemo(() => (
    sortedPlans.filter((plan) => (
      String(plan._id || plan.id) !== currentPlanId
      && getDailyRate(plan) > currentDailyRate
    ))
  ), [currentDailyRate, currentPlanId, sortedPlans]);

  const loadSubscriptionData = async ({ quiet = false } = {}) => {
    if (quiet) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const [subscriptionRes, plansRes] = await Promise.all([
        getVendorSubscription(),
        getVendorSubscriptionPlans(),
      ]);
      const subscriptionData = subscriptionRes?.data?.subscription || null;
      setSubscription(subscriptionData);
      setPlans(Array.isArray(plansRes?.data) ? plansRes.data : []);
      setSelectedPlanId(String(subscriptionData?.plan?._id || subscriptionData?.plan?.id || ''));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const pollSubscription = async (attempt = 0) => {
    const response = await getVendorSubscription();
    const nextSubscription = response?.data?.subscription || null;
    setSubscription(nextSubscription);

    if (response?.data?.isActive) {
      toast.success('Subscription updated successfully.');
      return true;
    }

    if (attempt >= 8) {
      toast.success('Payment submitted. Give the billing webhook a moment, then refresh this page.');
      return false;
    }

    await wait(3000);
    return pollSubscription(attempt + 1);
  };

  useEffect(() => {
    loadSubscriptionData();
  }, []);



  const handlePlanChange = async (plan) => {
    const planId = String(plan?._id || plan?.id || '');
    if (!planId) return;

    if (planId === currentPlanId && subscription?.isActive) {
      toast.success('This is your current active plan.');
      return;
    }

    setSelectedPlanId(planId);
    setIsSubmitting(true);
    try {
      const isFree = plan?.isFree || (Number(plan?.pricing?.inr ?? plan?.price_inr ?? 0) === 0 && Number(plan?.pricing?.usd ?? plan?.price_usd ?? 0) === 0);
      const email = subscription?.vendor?.email || localStorage.getItem('vendor-email');

      /* Online gateway payment options commented out as requested (preserved for future enablement):
      if (!isFree && email) {
        try {
          const sessionRes = await api.post('/payments/cashfree/session', {
            subscriptionPlanId: planId,
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
          console.warn("Cashfree plan change notice:", cfErr);
        }
      }
      */

      const response = await changeVendorSubscriptionPlan(planId);
      const data = response?.data || {};

      if (data.subscription) {
        setSubscription(data.subscription);
      }

      toast.success(data.message || 'Subscription updated successfully.');
      await loadSubscriptionData({ quiet: true });
    } catch (error) {
      // A paid plan is only activated once the gateway confirms payment. When
      // checkout is cancelled or fails, the server declines the change rather
      // than upgrading for free — surface that as a payment prompt, not a
      // generic failure.
      const status = error?.response?.status;
      const body = error?.response?.data;
      if (status === 402 || body?.data?.paymentRequired) {
        toast.error('Payment was not completed. Your plan has not been changed.');
      } else {
        toast.error(body?.message || error.message || 'Could not update subscription.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPlanActionLabel = (plan) => {
    const planId = String(plan?._id || plan?.id || '');
    if (planId === currentPlanId && subscription?.isActive) return 'Current Plan';
    if (!currentPlan) return 'Choose Plan';
    return getDailyRate(plan) > currentDailyRate ? 'Upgrade Plan' : 'Switch Plan';
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-slate-600 shadow-sm">
          <FiLoader className="animate-spin text-teal-600" />
          Loading subscription details...
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Vendor Billing</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">Subscription Management</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Review your active plan, renewal date, and available plan changes for your store.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadSubscriptionData({ quiet: true })}
          disabled={isRefreshing}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FiRefreshCw className={isRefreshing ? 'animate-spin' : ''} />
          Refresh Status
        </button>
      </div>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
                <FiShield />
                {subscription?.isActive ? 'Active subscription' : 'Needs attention'}
              </div>
              <h2 className="mt-4 text-3xl font-black text-slate-950">{currentPlan?.name || 'No active plan'}</h2>
              <p className="mt-2 text-sm text-slate-500">
                {currentPlan
                  ? `${formatPrice(currentPlan, gateway)} per ${currentPlan.intervalLabel || currentPlan.interval || 'billing cycle'}`
                  : 'Choose a plan to continue selling on DwellMart.'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-left lg:text-right">
              <p className="text-sm font-semibold text-slate-500">Days Remaining</p>
              <p className="mt-1 text-4xl font-black text-slate-950">{daysRemaining}</p>
              <p className="mt-1 text-xs text-slate-500">Expires on {formatDate(subscription?.current_period_end)}</p>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Billing cycle progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-teal-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-slate-600 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase text-slate-400">Started</p>
                <p className="mt-1 font-bold text-slate-800">{formatDate(subscription?.current_period_start)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase text-slate-400">Gateway</p>
                <p className="mt-1 font-bold uppercase text-slate-800">{gateway}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase text-slate-400">Payment</p>
                <p className="mt-1 font-bold capitalize text-slate-800">{subscription?.latest_payment_status || 'pending'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-teal-100 bg-teal-50 p-5 shadow-sm sm:p-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-600 text-white">
            <FiStar size={22} />
          </div>
          <h2 className="mt-4 text-xl font-black text-slate-900">Upgrade Options</h2>
          <p className="mt-2 text-sm text-slate-600">
            Higher plans are calculated by daily plan value, so longer billing cycles compare fairly.
          </p>
          <div className="mt-5 space-y-3">
            {upgradeOptions.length > 0 ? (
              upgradeOptions.slice(0, 3).map((plan) => (
                <button
                  key={plan._id || plan.id}
                  type="button"
                  onClick={() => handlePlanChange(plan)}
                  disabled={isSubmitting}
                  className="flex w-full items-center justify-between rounded-xl border border-teal-200 bg-white p-4 text-left transition hover:border-teal-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div>
                    <p className="font-bold text-slate-900">{plan.name}</p>
                    <p className="text-sm text-slate-500">{formatPrice(plan, gateway)} per {plan.intervalLabel || plan.interval || 'cycle'}</p>
                  </div>
                  <FiArrowRight className="text-teal-700" />
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-teal-200 bg-white p-4 text-sm text-slate-600">
                You are already on the highest daily-value plan available for your billing region.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">Available Plans</h2>
            <p className="mt-1 text-sm text-slate-500">Switch plans from here. Paid changes may open a secure payment step.</p>
          </div>
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-teal-700">
              <FiLoader className="animate-spin" />
              Preparing billing...
            </span>
          ) : null}
        </div>

        {sortedPlans.length > 0 ? (
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedPlans.map((plan) => {
              const planId = String(plan._id || plan.id || '');
              const isCurrent = planId === currentPlanId && subscription?.isActive;
              const isUpgrade = currentPlan && getDailyRate(plan, gateway) > currentDailyRate;

              return (
                <div
                  key={planId}
                  className={`flex min-h-[280px] flex-col rounded-2xl border p-5 transition ${
                    isCurrent
                      ? 'border-teal-500 bg-teal-50'
                      : isUpgrade
                        ? 'border-amber-200 bg-amber-50/40'
                        : 'border-slate-200 bg-white hover:border-teal-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-black text-slate-900">{plan.name}</h3>
                      <p className="mt-1 text-sm text-slate-500">per {plan.intervalLabel || plan.interval || 'cycle'}</p>
                    </div>
                    {isCurrent ? (
                      <span className="rounded-full bg-teal-600 px-3 py-1 text-xs font-bold text-white">Current</span>
                    ) : isUpgrade ? (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">Upgrade</span>
                    ) : null}
                  </div>

                  <p className="mt-5 text-3xl font-black text-slate-950">{formatPrice(plan, gateway)}</p>

                  <ul className="mt-5 flex-1 space-y-2">
                    {getPlanFeatures(plan).slice(0, 5).map((feature, index) => (
                      <li key={`${planId}-${index}`} className="flex items-start gap-2 text-sm text-slate-600">
                        <FiCheck className="mt-0.5 flex-shrink-0 text-teal-600" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => handlePlanChange(plan)}
                    disabled={isSubmitting || isCurrent}
                    className={`mt-5 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      isCurrent
                        ? 'bg-slate-200 text-slate-500'
                        : 'bg-teal-600 text-white hover:bg-teal-700'
                    }`}
                  >
                    <FiCreditCard />
                    {getPlanActionLabel(plan)}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
            <FiAlertCircle className="mx-auto mb-3 text-2xl" />
            No subscription plans are available right now.
          </div>
        )}
      </section>
    </motion.div>
  );
};

export default SubscriptionManagement;
