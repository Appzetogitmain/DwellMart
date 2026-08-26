import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FiArrowLeft,
  FiBriefcase,
  FiCheck,
  FiCreditCard,
  FiFileText,
  FiLoader,
  FiLock,
  FiMail,
  FiPhone,
  FiShoppingBag,
  FiStar,
  FiUser,
  FiX,
} from 'react-icons/fi';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getPublicSubscriptionPlans,
  getVendorOnboardingStatus,
  initiateVendorOnboardingSubscription,
  selectVendorSubscriptionPlan,
} from '../services/vendorService';
import api from '../../../shared/utils/api';
import { getCashfreeInstance } from '../../../shared/utils/cashfreeLoader';
import { usePageTranslation } from '../../../hooks/usePageTranslation';
import { useDynamicTranslation } from '../../../hooks/useDynamicTranslation';
import { useSettingsStore } from '../../../shared/store/settingsStore';

const STEPS_KEYS = ['Plans', 'Registration', 'Payment', 'Done'];

const formatPrice = (plan, t) => {
  const inr = Number(plan?.pricing?.inr ?? plan?.price_inr ?? 0);
  const usd = Number(plan?.pricing?.usd ?? plan?.price_usd ?? 0);
  if (inr === 0 && usd === 0) return t('Free');
  return `${t('Rs.')} ${inr.toFixed(0)} / ${t('$')}${usd.toFixed(2)}`;
};

const getIntervalLabel = (plan, t) => {
  const count = Number.parseInt(plan?.interval_count, 10) || 1;
  const interval = plan?.interval || 'month';
  if (count === 1) return t(interval);
  return `${count} ${t(`${interval}s`)}`;
};

const getHighlights = (plan) => {
  if (Array.isArray(plan?.featureHighlights)) return plan.featureHighlights;
  if (Array.isArray(plan?.features?.highlights)) return plan.features.highlights;
  return [];
};

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const SubscriptionOnboardingWizard = ({
  emailStorageKey,
  returnTo,
  title,
  subtitle,
}) => {
  const { getTranslatedText: t } = usePageTranslation([
    'Plans', 'Registration', 'Payment', 'Done',
    'Free', 'Popular', 'per', 'Selected', 'Choose Plan',
    'Back to plans', 'Full name', 'Company name', 'Company Name', 'Store name', 'Email', 'Phone',
    'Store description', 'Street', 'City', 'State', 'Zip code', 'Country',
    'Password', 'Confirm password', 'Hide', 'Show', 'Trade Licence', 'GST', 'MSME', 'Enrolment ID/UIN',
    'I agree to the', 'Terms & Conditions', 'Register and Continue to Payment',
    'Complete your subscription', 'Activate your free trial', 'Start your free trial without any payment required.',
    'Billing becomes active only after webhook confirmation updates MongoDB.',
    'Waiting for billing confirmation. This page will keep checking automatically.',
    'Payment is still pending confirmation. Please give the gateway a moment and retry if needed.',
    'Billing could not be confirmed. Please retry the payment step.',
    'Preparing checkout...', 'Checking payment status...', 'Payment window open',
    'Start secure payment', 'Activate free plan', 'Activating...', 'Back to registration',
    'Subscription submitted successfully',
    'Your billing is synced from the gateway and your vendor account is now awaiting admin approval.',
    'Go to vendor login', 'DwellMart Vendor Billing', 'No terms are configured yet.',
    'Please upload your', 'document.', 'Passwords do not match.',
    'You must agree to the Terms & Conditions.', 'Unable to load vendor onboarding.',
    'Your vendor account is already active. Please login.',
    'This onboarding cannot continue. Please contact support.',
    'Authorization received. Waiting for billing confirmation.',
    'Payment window was closed.', 'Unable to start payment.',
    'Please complete registration first.', 'Please select a subscription plan first.',
    'Verify', 'Sending...', 'Resend', 'Confirm', 'Verified', 'Verify mobile number first', 'Verification code sent to your WhatsApp.', 'Mobile number verified successfully.', 'Please enter a valid mobile number.', 'Please enter a valid 6-digit code.', 'Could not send the WhatsApp code.', 'Invalid verification code.',
    'Selling Channels', 'Retail Marketplace', 'Wholesale Marketplace', 'Quick Commerce',
    'At least one selling channel must stay enabled.', 'GST Number', 'Business Name',
    'Wholesale Contact Name', 'Wholesale Contact Phone', 'Bulk Order Support Email',
    'Registered business name', 'Contact person for bulk orders',
    'Please provide your GST number, business name, wholesale contact, and support email.',
    'At least one selling channel (Retail, Wholesale, or Quick Commerce) must stay enabled.'
  ]);

  const { settings } = useSettingsStore();
  const wholesaleMarketplaceEnabled = settings?.features?.wholesaleMarketplaceEnabled === true;
  const quickCommerceEnabled = settings?.features?.quickCommerceEnabled === true;

  const { translateArray, translateText, translateBatch, translateObject } = useDynamicTranslation();
  const STEPS = STEPS_KEYS.map(key => t(key));
  const location = useLocation();
  const navigate = useNavigate();
  const selectionStorageKey = `${emailStorageKey}:selection-token`;

  const [step, setStep] = useState(0);
  const [plans, setPlans] = useState([]);
  const [translatedPlans, setTranslatedPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectionToken, setSelectionToken] = useState('');
  const [onboardingEmail, setOnboardingEmail] = useState('');
  const [termsContent, setTermsContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [paymentState, setPaymentState] = useState('idle');
  const [showTerms, setShowTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [documentFile, setDocumentFile] = useState(null);
  const [documentType, setDocumentType] = useState('tradeLicense');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  // The MOBILE NUMBER is what gets verified now. The email address is collected
  // for correspondence and is never verified.
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    storeName: '',
    sellingChannels: {
      retail: true,
      wholesale: false,
      quickCommerce: false,
    },
  });

  const paymentEmail = onboardingEmail || sessionStorage.getItem(emailStorageKey) || formData.email.trim().toLowerCase();

  const persistEmail = (email) => {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return;
    sessionStorage.setItem(emailStorageKey, normalized);
    setOnboardingEmail(normalized);
  };

  const clearStorage = () => {
    sessionStorage.removeItem(emailStorageKey);
    sessionStorage.removeItem(selectionStorageKey);
    setOnboardingEmail('');
    setSelectionToken('');
  };

  const syncFromStatus = async (email, availablePlans = plans, { resetPaymentState = false } = {}) => {
    const response = await getVendorOnboardingStatus(email);
    const data = response?.data || {};
    const matchedPlan = data.selectedPlan || availablePlans.find((plan) => plan._id === data.selectedPlanId) || null;
    if (matchedPlan) {
      const translated = await translateObject(matchedPlan, ['name', 'intervalLabel']);
      const highlights = await translateBatch(getHighlights(translated));
      setSelectedPlan({ ...translated, featureHighlights: highlights });
    }

    if (data.nextStep === 'verify_phone') {
      // No standalone verification page any more: the mobile number is proven
      // inside registration itself, which also resumes a part-finished account.
      persistEmail(email);
      setStep(0);
      return false;
    }
    if (data.nextStep === 'choose_plan') {
      persistEmail(email);
      setStep(0);
      if (resetPaymentState) setPaymentState('idle');
      return false;
    }
    if (data.nextStep === 'complete_payment') {
      persistEmail(email);
      setStep(2);
      if (resetPaymentState) setPaymentState('idle');
      return false;
    }
    if (data.nextStep === 'awaiting_admin_approval') {
      setStep(3);
      setPaymentState('confirmed');
      clearStorage();
      return true;
    }
    if (data.nextStep === 'approved') {
      toast.success(t('Your vendor account is already active. Please login.'));
      navigate('/vendor/login', { replace: true });
      return true;
    }
    if (data.nextStep === 'rejected' || data.nextStep === 'suspended') {
      toast.error(t('This onboarding cannot continue. Please contact support.'));
      navigate('/vendor/login', { replace: true });
      return true;
    }
    return false;
  };

  const pollStatus = async (email, attempt = 0) => {
    if (!email) return false;
    const done = await syncFromStatus(email);
    if (done) return true;
    if (attempt >= 8) {
      setPaymentState('pending');
      return false;
    }
    await wait(3000);
    return pollStatus(email, attempt + 1);
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const savedEmail = sessionStorage.getItem(emailStorageKey) || '';
        const savedToken = sessionStorage.getItem(selectionStorageKey) || '';
        const resumeEmail = location.state?.resumeEmail || savedEmail;
        const [plansRes, termsRes] = await Promise.all([
          getPublicSubscriptionPlans(),
          api.get('/vendor-terms'),
        ]);
        const fetchedPlans = plansRes?.data || plansRes || [];
        setPlans(fetchedPlans);
        
        // Translate plans
        const translated = await translateArray(fetchedPlans, ['name', 'intervalLabel']);
        // Deeply translate highlights
        const fullyTranslated = await Promise.all(translated.map(async p => {
          const highlights = await translateBatch(getHighlights(p));
          return { ...p, featureHighlights: highlights };
        }));
        setTranslatedPlans(fullyTranslated);
        setTermsContent(termsRes?.data?.content || '');
        setSelectionToken(savedToken);

        const query = new URLSearchParams(window.location.search);
        if ((query.get('payment') === 'processing' || query.get('redirect_status')) && resumeEmail) {
          persistEmail(resumeEmail);
          setStep(2);
          setPaymentState('processing');
          await pollStatus(resumeEmail);
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }

        if (query.get('payment') === 'processing' || query.get('redirect_status')) {
          setPaymentState('processing');
        }

        if (resumeEmail) {
          await syncFromStatus(resumeEmail, fetchedPlans, { resetPaymentState: true });
        }
      } catch (error) {
        toast.error(t('Unable to load vendor onboarding.'));
      }
    };

    bootstrap();
  }, [emailStorageKey, selectionStorageKey, location.state]);

  // Transalate plans when loaded or language changes
  useEffect(() => {
    if (plans.length === 0) return;
    
    const translateAll = async () => {
      const translated = await translateArray(plans, ['name', 'intervalLabel']);
      const fullyTranslated = await Promise.all(translated.map(async p => {
        const highlights = await translateBatch(getHighlights(p));
        return { ...p, featureHighlights: highlights };
      }));
      setTranslatedPlans(fullyTranslated);
      
      // Also update selectedPlan if it exists
      if (selectedPlan) {
        const matched = fullyTranslated.find(p => p._id === selectedPlan._id);
        if (matched) setSelectedPlan(matched);
      }
    };
    
    translateAll();
  }, [plans, translateArray, translateBatch, translateObject]);

  const handleRetailToggle = (checked) => {
    setFormData((prev) => ({
      ...prev,
      sellingChannels: { ...prev.sellingChannels, retail: checked },
    }));
  };

  const handleWholesaleToggle = (checked) => {
    setFormData((prev) => ({
      ...prev,
      sellingChannels: { ...prev.sellingChannels, wholesale: checked },
    }));
  };

  const handleQuickCommerceToggle = (checked) => {
    setFormData((prev) => ({
      ...prev,
      sellingChannels: { ...prev.sellingChannels, quickCommerce: checked },
    }));
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    // Changing the number after verifying it invalidates the proof.
    if (name === 'phone' && isPhoneVerified) return;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleRequestOtp = async () => {
    const phone = formData.phone?.trim();
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      toast.error(t('Please enter a valid mobile number.'));
      return;
    }

    setIsSendingOtp(true);
    try {
      await api.post('/vendor/auth/request-registration-otp', { phone });
      setShowOtpInput(true);
      toast.success(t('Verification code sent to your WhatsApp.'));
    } catch (error) {
      // There is no email fallback for this code by design, so a delivery
      // failure has to be shown rather than swallowed.
      toast.error(
        error?.response?.data?.message
        || t('Could not send the WhatsApp code. Check the number and try again.')
      );
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    const otp = phoneOtp.trim();
    if (!/^\d{6}$/.test(otp)) {
      toast.error(t('Please enter a valid 6-digit code.'));
      return;
    }

    setIsVerifyingOtp(true);
    try {
      await api.post('/vendor/auth/verify-registration-otp', {
        phone: formData.phone,
        otp,
      });
      setIsPhoneVerified(true);
      setShowOtpInput(false);
      toast.success(t('Mobile number verified successfully.'));
    } catch (error) {
      toast.error(error?.response?.data?.message || t('Invalid verification code.'));
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleSelectPlan = async (plan) => {
    setIsLoading(true);
    try {
      const response = await selectVendorSubscriptionPlan(plan._id);
      const token = response?.data?.selectionToken || '';
      setSelectedPlan(plan);
      setSelectionToken(token);
      sessionStorage.setItem(selectionStorageKey, token);
      setStep(1);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    if (!selectedPlan?._id || !selectionToken) {
      toast.error(t('Please select a subscription plan first.'));
      setStep(0);
      return;
    }

    const wholesaleRequested = wholesaleMarketplaceEnabled && formData.sellingChannels.wholesale;
    const quickCommerceRequested = quickCommerceEnabled && formData.sellingChannels.quickCommerce;

    if (!formData.sellingChannels.retail && !wholesaleRequested && !quickCommerceRequested) {
      toast.error(t('At least one selling channel (Retail, Wholesale, or Quick Commerce) must stay enabled.'));
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error(t('Passwords do not match.'));
      return;
    }
    if (!agreedToTerms) {
      toast.error(t('You must agree to the Terms & Conditions.'));
      return;
    }

    setIsLoading(true);
    try {
      const payload = new FormData();
      payload.append('name', formData.name.trim());
      payload.append('email', formData.email.trim().toLowerCase());
      payload.append('password', formData.password);
      payload.append('phone', formData.phone.trim());
      payload.append('storeName', formData.storeName.trim());
      payload.append('selectionToken', selectionToken);
      payload.append('selectedPlanId', selectedPlan._id);
      payload.append('documentType', documentType);
      payload.append('agreedToTerms', true);
      if (documentFile) {
        payload.append('document', documentFile);
      }

      payload.append('sellingChannels', JSON.stringify({
        retail: { enabled: formData.sellingChannels.retail },
        wholesale: { enabled: wholesaleRequested },
        quickCommerce: { enabled: quickCommerceRequested },
      }));

      const response = await api.post('/vendor/auth/register', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const responseData = response?.data || {};
      const email = String(responseData.email || formData.email || '').trim().toLowerCase();
      persistEmail(email);
      if (responseData.selectedPlan) {
        setSelectedPlan(responseData.selectedPlan);
      }

      if (responseData.resume || responseData.nextStep === 'complete_payment') {
        setStep(2);
        return;
      }

      if (responseData.nextStep === 'awaiting_admin_approval') {
        setStep(3);
        setPaymentState('confirmed');
        clearStorage();
        return;
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePayment = async () => {
    if (!paymentEmail) {
      toast.error(t('Please complete registration first.'));
      return;
    }

    setIsLoading(true);
    setPaymentState('idle');

    const isFree = selectedPlan?.isFree || (Number(selectedPlan?.pricing?.inr ?? selectedPlan?.price_inr ?? 0) === 0 && Number(selectedPlan?.pricing?.usd ?? selectedPlan?.price_usd ?? 0) === 0);

    try {
      if (isFree) {
        const response = await initiateVendorOnboardingSubscription(paymentEmail, {
          selectionToken,
          selectedPlanId: selectedPlan?._id,
        });
        const data = response?.data || response || {};
        if (data.subscription?.plan) {
          setSelectedPlan(data.subscription.plan);
        }
        setStep(3);
        setPaymentState('confirmed');
        clearStorage();
        toast.success(t('Subscription activated successfully!'));
      } else {
        // Paid Plan — Initiate Cashfree Checkout Session
        const sessionRes = await api.post('/payments/cashfree/session', {
          subscriptionPlanId: selectedPlan?._id,
          email: paymentEmail,
        });
        const { paymentSessionId, orderId: cfOrderId, environment } = sessionRes.data?.data || sessionRes.data || sessionRes || {};

        if (!paymentSessionId) {
          throw new Error(sessionRes?.message || 'Could not initiate payment session.');
        }

        setPaymentState('checkout_open');
        const cashfree = await getCashfreeInstance(environment || 'sandbox');
        try {
          await cashfree.checkout({
            paymentSessionId,
            redirectTarget: '_modal',
          });
        } catch (modalErr) {
          console.warn('Cashfree modal notice:', modalErr);
        }

        // Verify payment status with server
        setPaymentState('processing');
        const verifyRes = await api.post('/payments/cashfree/verify', { orderId: cfOrderId });
        const verifyData = verifyRes.data?.data || verifyRes.data || verifyRes || {};

        if (verifyData.isPaid) {
          setStep(3);
          setPaymentState('confirmed');
          clearStorage();
          toast.success(t('Subscription activated successfully!'));
        } else {
          setPaymentState('failed');
          toast.error(t('Payment was not completed. Please retry.'));
        }
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast.error(error.response?.data?.message || error.message || t('Unable to activate subscription.'));
      setPaymentState('failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="mx-auto w-full max-w-5xl px-2 sm:px-4">
        <div className="mb-6 sm:mb-8 text-center text-slate-900 px-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 md:text-4xl leading-tight">{title}</h2>
          <p className="mt-2 mx-auto max-w-2xl text-xs sm:text-sm text-slate-600 md:text-base">{subtitle}</p>
        </div>

        {/* Wizard Step Progress Bar */}
        <div className="mb-8 sm:mb-12 w-full max-w-xl mx-auto px-1 sm:px-4">
          <div className="flex items-center justify-between">
            {STEPS.map((label, index) => (
              <div key={label} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center shrink-0">
                  <div
                    className={`flex h-8 w-8 sm:h-10 sm:w-10 md:h-11 md:w-11 items-center justify-center rounded-full text-xs sm:text-sm font-bold shadow-sm sm:shadow-md transition-all ${
                      index < step
                        ? 'bg-emerald-600 text-white'
                        : index === step
                        ? 'bg-[#ffc101] text-black ring-2 sm:ring-4 ring-[#ffc101]/30 font-extrabold'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {index < step ? <FiCheck className="stroke-[3] text-xs sm:text-sm" /> : index + 1}
                  </div>
                  <span className={`mt-1.5 text-[10px] sm:text-xs font-bold text-center whitespace-nowrap ${index <= step ? 'text-slate-900' : 'text-slate-400'}`}>
                    {label}
                  </span>
                </div>
                {index < STEPS.length - 1 ? (
                  <div className="flex-1 mx-1 sm:mx-2 md:mx-3 -mt-4 sm:-mt-5">
                    <div className={`h-0.5 sm:h-1 w-full rounded-full transition-colors ${index < step ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* STEP 0: Membership Plans */}
          {step === 0 ? (
            <motion.div key="plans" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div className="mb-8 text-center">
                <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900">{t('Choose Your Membership Plan')}</h3>
                <p className="mt-2 text-xs sm:text-sm text-slate-600">
                  {t('Paid plans open the payment options first, then continue to registration.')}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-3 items-stretch">
                {(() => {
                  const popularPlan = translatedPlans.find((p) => p.isMostPopular) || translatedPlans.find((p) => p.name?.toLowerCase().includes('yearly')) || translatedPlans[1];
                  const popularPlanId = popularPlan?._id;

                  return translatedPlans.map((plan) => {
                    const isPopular = plan._id === popularPlanId;
                    return (
                      <div
                        key={plan._id}
                        className={`relative flex flex-col justify-between rounded-2xl sm:rounded-3xl border-2 p-5 sm:p-8 text-slate-900 shadow-xl backdrop-blur transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl h-full ${
                          selectedPlan?._id === plan._id || isPopular
                            ? 'border-[#D4AF37] bg-white ring-4 ring-[#ffc101]/20 shadow-amber-500/10'
                            : 'border-slate-200 bg-white hover:border-amber-400'
                        }`}
                      >
                        {isPopular ? (
                          <div className="absolute right-0 top-0 flex items-center gap-1 rounded-tr-3xl rounded-bl-2xl bg-[#ffc101] px-4 py-1.5 text-xs font-extrabold text-black shadow-md">
                            <FiStar className="fill-black text-xs" />
                            {t('MOST POPULAR')}
                          </div>
                        ) : null}

                        <div className="flex-1 flex flex-col">
                          <h3 className="text-xl font-extrabold text-slate-900">{plan.name}</h3>
                          
                          <div className="mt-4 flex flex-col gap-0 border-b border-slate-100 pb-5">
                            <div className="flex items-baseline gap-1">
                              <span className="text-3xl sm:text-4xl font-black text-slate-900">
                                {formatPrice(plan, t)}
                              </span>
                            </div>
                            <span className="mt-1.5 text-xs font-semibold text-slate-500">{t('per')} {getIntervalLabel(plan, t)}</span>
                          </div>

                          <ul className="mt-6 space-y-3 flex-1">
                            {getHighlights(plan).map((feature) => (
                              <li key={`${plan._id}-${feature}`} className="flex items-start gap-2.5 text-xs font-medium text-slate-700">
                                <FiCheck className="mt-0.5 flex-shrink-0 text-amber-500 font-bold text-base" />
                                <span>{feature}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSelectPlan(plan)}
                          disabled={isLoading}
                          className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-extrabold bg-[#ffc101] text-black hover:bg-[#ffd042] hover:shadow-amber-500/20 shadow-md transition-all disabled:opacity-60"
                        >
                          {isLoading && selectedPlan?._id === plan._id ? <FiLoader className="animate-spin text-lg" /> : null}
                          {selectedPlan?._id === plan._id ? t('Continue with Plan') : t('Choose Plan')}
                        </button>
                      </div>
                    );
                  });
                })()}
              </div>
            </motion.div>
          ) : null}

          {/* STEP 1: Vendor Registration Form */}
          {step === 1 ? (
            <motion.div key="register" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="mx-auto max-w-3xl">
              <div className="mb-6 flex items-center justify-between">
                <button type="button" onClick={() => setStep(0)} className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-amber-600">
                  <FiArrowLeft />
                  {t('Back to plans')}
                </button>
                {selectedPlan ? <span className="rounded-full bg-amber-100 px-4 py-1.5 text-xs font-extrabold text-amber-800 border border-amber-300">{selectedPlan.name}</span> : null}
              </div>

              <form onSubmit={handleRegister} className="rounded-2xl sm:rounded-3xl md:rounded-[32px] border border-slate-200 bg-white p-4 sm:p-6 md:p-10 shadow-2xl text-slate-900">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-6 border-b border-slate-100 pb-3">
                  Store Owner & Business Details
                </h3>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="relative block">
                    <span className="text-xs font-bold text-slate-700 mb-1 block">Full Name <span className="text-red-500">*</span></span>
                    <div className="relative">
                      <FiUser className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input name="name" value={formData.name} onChange={handleChange} required placeholder={t('Full name')} className="w-full rounded-xl border border-slate-300 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#ffc101] focus:bg-white transition-colors" />
                    </div>
                  </label>

                  <label className="relative block">
                    <span className="text-xs font-bold text-slate-700 mb-1 block">{t('Company Name')} <span className="text-red-500">*</span></span>
                    <div className="relative">
                      <FiBriefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input name="storeName" value={formData.storeName} onChange={handleChange} required placeholder={t('Company name')} className="w-full rounded-xl border border-slate-300 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#ffc101] focus:bg-white transition-colors" />
                    </div>
                  </label>

                  {/* Email — collected for correspondence, never verified */}
                  <label className="relative block">
                    <span className="text-xs font-bold text-slate-700 mb-1 block">Email Address <span className="text-red-500">*</span></span>
                    <div className="relative">
                      <FiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        required
                        placeholder={t('Email')}
                        className="w-full rounded-xl border border-slate-300 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#ffc101] focus:bg-white transition-colors"
                      />
                    </div>
                  </label>

                  {/* Mobile number & WhatsApp OTP verification */}
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-slate-700">Mobile Number <span className="text-red-500">*</span></span>
                    <div className="flex gap-2">
                      <label className="relative flex-1">
                        <FiPhone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          name="phone"
                          value={formData.phone}
                          onChange={handleChange}
                          readOnly={isPhoneVerified}
                          required
                          placeholder={t('Mobile number with country code')}
                          className={`w-full rounded-xl border py-3 pl-10 pr-4 text-sm outline-none transition-colors ${
                            isPhoneVerified ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-bold' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-[#ffc101] focus:bg-white'
                          }`}
                        />
                        {isPhoneVerified && (
                          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-600">
                            <FiCheck className="stroke-[3]" />
                          </div>
                        )}
                      </label>
                      {!isPhoneVerified && (
                        <button
                          type="button"
                          onClick={handleRequestOtp}
                          disabled={isSendingOtp || !formData.phone}
                          className="rounded-xl bg-[#ffc101] px-4 py-3 text-xs font-extrabold text-black hover:bg-[#ffd042] disabled:opacity-50 shadow-sm"
                        >
                          {isSendingOtp ? t('Sending...') : showOtpInput ? t('Resend') : t('Verify')}
                        </button>
                      )}
                    </div>

                    {!isPhoneVerified && (
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {t('We will send a verification code to this number on WhatsApp.')}
                      </p>
                    )}

                    {showOtpInput && !isPhoneVerified && (
                      <div className="mt-2 flex gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={phoneOtp}
                          onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ''))}
                          placeholder="6-digit WhatsApp code"
                          className="flex-1 rounded-xl border border-slate-300 bg-amber-50/50 px-4 py-2 text-center text-sm font-bold tracking-widest text-slate-900 focus:border-[#ffc101] outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleVerifyOtp}
                          disabled={isVerifyingOtp || phoneOtp.length !== 6}
                          className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          {isVerifyingOtp ? '...' : t('Confirm')}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Selling Channels */}
                  {(wholesaleMarketplaceEnabled || quickCommerceEnabled) && (
                    <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="mb-3 text-xs font-extrabold text-slate-900 uppercase tracking-wider">{t('Selling Channels')}</p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                        <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-800">
                          <input
                            type="checkbox"
                            checked={formData.sellingChannels.retail}
                            onChange={(event) => handleRetailToggle(event.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-[#ffc101] focus:ring-[#ffc101]"
                          />
                          {t('Retail Marketplace')}
                        </label>
                        {wholesaleMarketplaceEnabled && (
                          <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-800">
                            <input
                              type="checkbox"
                              checked={formData.sellingChannels.wholesale}
                              onChange={(event) => handleWholesaleToggle(event.target.checked)}
                              className="h-4 w-4 rounded border-slate-300 text-[#ffc101] focus:ring-[#ffc101]"
                            />
                            {t('Wholesale Marketplace')}
                          </label>
                        )}
                        {quickCommerceEnabled && (
                          <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-800">
                            <input
                              type="checkbox"
                              checked={formData.sellingChannels.quickCommerce}
                              onChange={(event) => handleQuickCommerceToggle(event.target.checked)}
                              className="h-4 w-4 rounded border-slate-300 text-[#ffc101] focus:ring-[#ffc101]"
                            />
                            {t('Quick Commerce')}
                          </label>
                        )}
                      </div>
                      <p className="mt-2 text-[11px] text-slate-500">{t('At least one selling channel must stay enabled.')}</p>
                    </div>
                  )}

                  {/* Security Credentials */}
                  <label className="relative block">
                    <span className="text-xs font-bold text-slate-700 mb-1 block">Password <span className="text-red-500">*</span></span>
                    <div className="relative">
                      <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type={showPassword ? 'text' : 'password'} name="password" value={formData.password} onChange={handleChange} required placeholder={t('Password')} className="w-full rounded-xl border border-slate-300 bg-slate-50 py-3 pl-10 pr-12 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#ffc101] focus:bg-white" />
                      <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500 hover:text-slate-900">{showPassword ? t('Hide') : t('Show')}</button>
                    </div>
                  </label>

                  <label className="relative block">
                    <span className="text-xs font-bold text-slate-700 mb-1 block">Confirm Password <span className="text-red-500">*</span></span>
                    <div className="relative">
                      <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type={showConfirmPassword ? 'text' : 'password'} name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required placeholder={t('Confirm password')} className="w-full rounded-xl border border-slate-300 bg-slate-50 py-3 pl-10 pr-12 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#ffc101] focus:bg-white" />
                      <button type="button" onClick={() => setShowConfirmPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500 hover:text-slate-900">{showConfirmPassword ? t('Hide') : t('Show')}</button>
                    </div>
                  </label>

                  {/* Document Upload */}
                  <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="mb-2 text-xs font-extrabold text-slate-900 uppercase tracking-wider">Business Document Upload</p>
                    <div className="flex flex-col sm:flex-row gap-3 items-center">
                      <select value={documentType} onChange={(event) => setDocumentType(event.target.value)} className="rounded-xl border border-slate-300 bg-white text-slate-900 px-3.5 py-2.5 text-xs font-bold outline-none focus:border-[#ffc101]">
                        <option value="tradeLicense">{t('Trade Licence')}</option>
                        <option value="gst">{t('GST')}</option>
                        <option value="msme">{t('MSME')}</option>
                        <option value="uin">{t('Enrolment ID/UIN')}</option>
                      </select>
                      <input type="file" accept=".pdf,.doc,.docx,image/*" onChange={(event) => setDocumentFile(event.target.files?.[0] || null)} className="flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white" />
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <label className="flex items-start gap-3 text-xs font-medium text-slate-700">
                    <input type="checkbox" checked={agreedToTerms} onChange={(event) => setAgreedToTerms(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#ffc101]" />
                    <span>{t('I agree to the')} <button type="button" onClick={() => setShowTerms(true)} className="font-extrabold text-amber-700 underline">{t('Terms & Conditions')}</button></span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !isPhoneVerified}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ffc101] px-4 py-4 text-sm font-extrabold text-black transition hover:bg-[#ffd042] disabled:opacity-50 shadow-lg shadow-amber-500/20"
                >
                  {isLoading ? <FiLoader className="animate-spin text-lg" /> : null}
                  {!isPhoneVerified ? t('Verify mobile number first') : t('Register and Continue to Payment')}
                </button>
              </form>
            </motion.div>
          ) : null}

          {/* STEP 2: Subscription Checkout */}
          {step === 2 ? (
            <motion.div key="payment" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mx-auto max-w-xl">
              <div className="rounded-2xl sm:rounded-3xl md:rounded-[32px] border border-slate-200 bg-white p-5 sm:p-8 shadow-2xl text-slate-900 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                  {selectedPlan?.isFree ? <FiStar size={28} /> : <FiCreditCard size={28} />}
                </div>

                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                  {selectedPlan?.isFree ? t('Activate your free trial') : t('Complete your subscription')}
                </h2>

                <p className="mt-2 text-xs sm:text-sm text-slate-600">
                  {selectedPlan?.isFree ? t('Start your free trial without any payment required.') : t('Billing becomes active only after gateway payment confirmation.')}
                </p>

                {selectedPlan ? (
                  <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5 text-center text-slate-900 font-bold text-xs sm:text-sm">
                    {selectedPlan.name} | {formatPrice(selectedPlan, t)} | {t('per')} {getIntervalLabel(selectedPlan, t)}
                  </div>
                ) : null}

                {paymentState === 'processing' ? <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs font-bold text-amber-800">{t('Waiting for billing confirmation. This page will keep checking automatically.')}</div> : null}
                {paymentState === 'pending' ? <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs font-bold text-amber-800">{t('Payment is still pending confirmation. Please give the gateway a moment and retry if needed.')}</div> : null}
                {paymentState === 'failed' ? <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs font-bold text-rose-800">{t('Billing could not be confirmed. Please retry the payment step.')}</div> : null}

                <div className="mt-6 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={handlePayment}
                    disabled={isLoading || paymentState === 'processing'}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ffc101] px-4 py-3.5 sm:py-4 font-extrabold text-black transition hover:bg-[#ffd042] disabled:opacity-60 shadow-lg shadow-amber-500/20 text-sm sm:text-base cursor-pointer"
                  >
                    {isLoading ? <FiLoader className="animate-spin text-lg" /> : (selectedPlan?.isFree ? <FiCheck /> : <FiCreditCard />)}
                    {isLoading ? (selectedPlan?.isFree ? t('Activating...') : t('Preparing checkout...')) : paymentState === 'processing' ? t('Checking payment status...') : paymentState === 'checkout_open' ? t('Payment window open') : (selectedPlan?.isFree ? t('Activate free plan') : t('Start secure payment'))}
                  </button>

                  <button type="button" onClick={() => setStep(1)} className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer">{t('Back to registration')}</button>
                </div>
              </div>
            </motion.div>
          ) : null}

          {/* STEP 3: Completion Celebration */}
          {step === 3 ? (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto max-w-lg">
              <div className="rounded-2xl sm:rounded-3xl md:rounded-[32px] border border-slate-200 bg-white p-5 sm:p-8 text-center shadow-2xl text-slate-900">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><FiCheck size={32} className="stroke-[3]" /></div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">{t('Subscription submitted successfully')}</h2>
                <p className="mt-3 text-xs sm:text-sm text-slate-600">{t('Your billing is synced from the gateway and your vendor account is now awaiting admin approval.')}</p>
                <button type="button" onClick={() => navigate('/vendor/login')} className="mt-6 w-full rounded-2xl bg-[#ffc101] px-4 py-3.5 font-extrabold text-black transition hover:bg-[#ffd042] shadow-lg shadow-amber-500/20 text-sm sm:text-base">{t('Go to vendor login')}</button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showTerms ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 p-4" onClick={() => setShowTerms(false)}>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="w-full max-w-2xl overflow-hidden rounded-[28px] bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-slate-200 p-5">
                <div className="flex items-center gap-2"><FiFileText className="text-teal-700" /><h3 className="font-bold text-slate-900">{t('Terms & Conditions')}</h3></div>
                <button type="button" onClick={() => setShowTerms(false)} className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><FiX /></button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto p-5">{termsContent ? <div className="prose prose-sm max-w-none text-slate-600" dangerouslySetInnerHTML={{ __html: termsContent }} /> : <p className="text-sm text-slate-500">{t('No terms are configured yet.')}</p>}</div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
};

export default SubscriptionOnboardingWizard;


