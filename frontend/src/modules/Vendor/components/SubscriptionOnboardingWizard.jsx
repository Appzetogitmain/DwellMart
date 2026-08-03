import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FiArrowLeft,
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
import StripeSubscriptionForm from './StripeSubscriptionForm';
import api from '../../../shared/utils/api';
import { usePageTranslation } from '../../../hooks/usePageTranslation';
import { useDynamicTranslation } from '../../../hooks/useDynamicTranslation';
import { useSettingsStore } from '../../../shared/store/settingsStore';

const STEPS_KEYS = ['Plans', 'Registration', 'Payment', 'Done'];
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
    'Back to plans', 'Full name', 'Store name', 'Email', 'Phone',
    'Store description', 'Street', 'City', 'State', 'Zip code', 'Country',
    'Password', 'Confirm password', 'Hide', 'Show', 'Trade Licence', 'GST',
    'I agree to the', 'Terms & Conditions', 'Register and verify email',
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
    'Please verify your email first.', 'Please select a subscription plan first.',
    'Verify', 'Sending...', 'Resend', 'Confirm', 'Verified', 'Verify email first', 'Verification code sent to your email.', 'Email verified successfully.', 'Please enter a valid email address.', 'Please enter a valid 6-digit code.',
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
  const [showStripe, setShowStripe] = useState(false);
  const [stripeConfig, setStripeConfig] = useState({ clientSecret: '', publishableKey: '' });
  const [documentFile, setDocumentFile] = useState(null);
  const [documentType, setDocumentType] = useState('tradeLicense');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [emailOtp, setEmailOtp] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    storeName: '',
    storeDescription: '',
    address: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: '',
    },
    sellingChannels: {
      retail: true,
      wholesale: false,
      quickCommerce: false,
    },
    wholesaleProfile: {
      gstNumber: '',
      businessName: '',
      wholesaleContactName: '',
      wholesaleContactPhone: '',
      bulkOrderSupportEmail: '',
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

    if (data.nextStep === 'verify_email') {
      navigate('/vendor/verification', { replace: true, state: { email, returnTo } });
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
    if (name === 'email' && isEmailVerified) return;
    if (name.startsWith('address.')) {
      const field = name.split('.')[1];
      setFormData((prev) => ({
        ...prev,
        address: { ...prev.address, [field]: value },
      }));
      return;
    }
    if (name.startsWith('wholesaleProfile.')) {
      const field = name.split('.')[1];
      setFormData((prev) => ({
        ...prev,
        wholesaleProfile: { ...prev.wholesaleProfile, [field]: value },
      }));
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleRequestOtp = async () => {
    const email = formData.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error(t('Please enter a valid email address.'));
      return;
    }

    setIsSendingOtp(true);
    try {
      await api.post('/vendor/auth/request-registration-otp', { email });
      setShowOtpInput(true);
      toast.success(t('Verification code sent to your email.'));
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    const otp = emailOtp.trim();
    if (!/^\d{6}$/.test(otp)) {
      toast.error(t('Please enter a valid 6-digit code.'));
      return;
    }

    setIsVerifyingOtp(true);
    try {
      await api.post('/vendor/auth/verify-registration-otp', {
        email: formData.email,
        otp,
      });
      setIsEmailVerified(true);
      setShowOtpInput(false);
      toast.success(t('Email verified successfully.'));
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleSelectPlan = async (plan) => {
    setIsLoading(true);
    try {
      const response = await selectVendorSubscriptionPlan(plan._id, formData.address.country);
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

    if (wholesaleRequested) {
      const { gstNumber, businessName, wholesaleContactName, wholesaleContactPhone, bulkOrderSupportEmail } = formData.wholesaleProfile;
      if (!gstNumber?.trim() || !businessName?.trim() || !wholesaleContactName?.trim() || !wholesaleContactPhone?.trim() || !bulkOrderSupportEmail?.trim()) {
        toast.error(t('Please provide your GST number, business name, wholesale contact, and support email.'));
        return;
      }
    }

    if (!documentFile) {
      toast.error(`${t('Please upload your')} ${documentType === 'gst' ? t('GST') : t('Trade Licence')} ${t('document.')}`);
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
      payload.append('storeDescription', formData.storeDescription.trim());
      payload.append('selectionToken', selectionToken);
      payload.append('selectedPlanId', selectedPlan._id);
      payload.append('documentType', documentType);
      payload.append('address', JSON.stringify(formData.address));
      payload.append('agreedToTerms', true);
      payload.append('document', documentFile);

      payload.append('sellingChannels', JSON.stringify({
        retail: { enabled: formData.sellingChannels.retail },
        wholesale: { enabled: wholesaleRequested },
        quickCommerce: { enabled: quickCommerceRequested },
      }));

      if (wholesaleRequested) {
        payload.append('wholesaleProfile', JSON.stringify(formData.wholesaleProfile));
      }

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

  const openRazorpayCheckout = async (checkout) => {
    if (!checkout?.keyId || !checkout?.subscriptionId) {
      throw new Error('Razorpay checkout is not configured for this subscription.');
    }

    const Razorpay = await loadRazorpayScript();
    const instance = new Razorpay({
      key: checkout.keyId,
      subscription_id: checkout.subscriptionId,
      name: t('DwellMart Vendor Billing'),
      description: selectedPlan ? `${selectedPlan.name} ${t('subscription')}` : t('Vendor subscription'),
      prefill: {
        name: formData.name,
        email: paymentEmail,
        contact: formData.phone,
      },
      theme: { color: '#0f766e' },
      handler: async (responseData) => {
        try {
          setPaymentState('processing');
          await api.post('/subscription/confirm', {
            email: paymentEmail,
            gateway: 'razorpay',
            subscriptionId: checkout.subscriptionId,
            paymentId: responseData?.razorpay_payment_id,
            signature: responseData?.razorpay_signature,
          });
          toast.success(t('Authorization received. Waiting for billing confirmation.'));
          await pollStatus(paymentEmail);
        } catch (error) {
          setPaymentState('failed');
          toast.error(error?.message || t('Billing could not be confirmed. Please retry the payment step.'));
        }
      },
      modal: {
        ondismiss: () => {
          setPaymentState('idle');
          toast.error(t('Payment window was closed.'));
        },
      },
    });
    setPaymentState('checkout_open');
    instance.open();
  };

  const handlePayment = async () => {
    if (!paymentEmail) {
      toast.error(t('Please verify your email first.'));
      return;
    }

    setIsLoading(true);
    try {
      const response = await initiateVendorOnboardingSubscription(paymentEmail, {
        selectionToken,
        selectedPlanId: selectedPlan?._id,
      });
      const data = response?.data || {};
      if (data.subscription?.plan) {
        setSelectedPlan(data.subscription.plan);
      }

      if (data.status === 'active' || data.alreadyActive) {
        setStep(3);
        setPaymentState('confirmed');
        clearStorage();
        return;
      }

      if (data.gateway === 'stripe') {
        if (!data.checkout?.clientSecret || !data.checkout?.publishableKey) {
          throw new Error('Stripe checkout is not configured for this subscription.');
        }
        setStripeConfig({
          clientSecret: data.checkout.clientSecret,
          publishableKey: data.checkout.publishableKey,
        });
        setShowStripe(true);
        return;
      }

      if (data.gateway === 'razorpay') {
        await openRazorpayCheckout(data.checkout);
      }
    } catch (error) {
      toast.error(error.message || t('Unable to start payment.'));
      setPaymentState('failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8 text-center text-white">
          <h2 className="text-3xl font-extrabold text-white md:text-4xl">{title}</h2>
          <p className="mt-2 mx-auto max-w-3xl text-sm text-white/70 md:text-base">{subtitle}</p>
        </div>

        <div className="mb-10 flex items-center justify-center">
          {STEPS.map((label, index) => (
            <div key={label} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${
                    index < step
                      ? 'bg-[#ffc101] text-black'
                      : index === step
                      ? 'bg-white text-[#5a3a00] ring-4 ring-[#ffc101]/20'
                      : 'bg-white/10 text-white/60'
                  }`}
                >
                  {index < step ? <FiCheck /> : index + 1}
                </div>
                <span className={`mt-2 text-xs font-semibold ${index <= step ? 'text-white' : 'text-white/50'}`}>{label}</span>
              </div>
              {index < STEPS.length - 1 ? (
                <div className={`mx-2 h-1 w-14 rounded-full md:w-24 ${index < step ? 'bg-[#ffc101]' : 'bg-white/10'}`} />
              ) : null}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 0 ? (
            <motion.div key="plans" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div className="mb-6 text-center text-white">
                <h3 className="text-2xl font-bold">{t('Choose Your Membership Plan')}</h3>
                <p className="mt-2 text-sm text-white/70">
                  {t('Paid plans open the payment options first, then continue to registration.')}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {translatedPlans.map((plan) => (
                  <div
                    key={plan._id}
                    className={`relative rounded-3xl border p-6 text-white shadow-2xl backdrop-blur transition-all ${
                      selectedPlan?._id === plan._id || plan.isMostPopular
                        ? 'border-[#ffc101]/70 bg-white/10 ring-2 ring-[#ffc101]/30'
                        : 'border-white/10 bg-white/5'
                    }`}
                  >
                    {plan.isMostPopular ? (
                      <div className="absolute right-0 top-0 flex items-center gap-1 rounded-bl-2xl bg-[#ffc101] px-3 py-1 text-xs font-bold text-black">
                        <FiStar />
                        {t('MOST POPULAR')}
                      </div>
                    ) : null}
                    <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                    <div className="mt-3 flex flex-col gap-0">
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-extrabold text-white">
                          {formatPrice(plan, t)}
                        </span>
                      </div>
                      <span className="mt-1 text-xs text-white/60">{t('per')} {getIntervalLabel(plan, t)}</span>
                    </div>

                    <ul className="mt-5 space-y-2">
                      {getHighlights(plan).map((feature) => (
                        <li key={`${plan._id}-${feature}`} className="flex items-start gap-2 text-sm text-white/80">
                          <FiCheck className="mt-0.5 flex-shrink-0 text-[#ffd042]" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={() => handleSelectPlan(plan)}
                      disabled={isLoading}
                      className={`mt-6 flex w-full items-center justify-center gap-2 rounded-2xl py-3 font-bold transition disabled:opacity-60 ${
                        selectedPlan?._id === plan._id || !plan.isFree
                          ? 'bg-[#ffc101] text-black hover:bg-[#ffd042]'
                          : 'bg-white text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      {isLoading && selectedPlan?._id === plan._id ? <FiLoader className="animate-spin" /> : null}
                      {selectedPlan?._id === plan._id ? t('Continue with Plan') : t('Choose Plan')}
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : null}

          {step === 1 ? (
            <motion.div key="register" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="mx-auto max-w-3xl">
              <div className="mb-6 flex items-center justify-between">
                <button type="button" onClick={() => setStep(0)} className="inline-flex items-center gap-2 text-sm font-semibold text-white/75 hover:text-white">
                  <FiArrowLeft />
                  {t('Back to plans')}
                </button>
                {selectedPlan ? <span className="rounded-full bg-[#ffc101]/15 px-4 py-1.5 text-sm font-bold text-[#ffd042] border border-[#ffc101]/30">{selectedPlan.name}</span> : null}
              </div>
              <form onSubmit={handleRegister} className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur md:p-8 text-white">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="relative">
                    <FiUser className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                    <input name="name" value={formData.name} onChange={handleChange} required placeholder={t('Full name')} className="w-full rounded-2xl border border-white/10 bg-white/10 py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/40 outline-none focus:border-[#ffc101]" />
                  </label>
                  <label className="relative">
                    <FiShoppingBag className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                    <input name="storeName" value={formData.storeName} onChange={handleChange} required placeholder={t('Store name')} className="w-full rounded-2xl border border-white/10 bg-white/10 py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/40 outline-none focus:border-[#ffc101]" />
                  </label>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <label className="relative flex-1">
                        <FiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                        <input
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleChange}
                          readOnly={isEmailVerified}
                          required
                          placeholder={t('Email')}
                          className={`w-full rounded-2xl border py-3 pl-10 pr-4 text-sm outline-none ${
                            isEmailVerified ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-white/10 border-white/10 text-white placeholder:text-white/40 focus:border-[#ffc101]'
                          }`}
                        />
                        {isEmailVerified && (
                          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-400">
                            <FiCheck className="stroke-[3]" />
                          </div>
                        )}
                      </label>
                      {!isEmailVerified && (
                        <button
                          type="button"
                          onClick={handleRequestOtp}
                          disabled={isSendingOtp || !formData.email}
                          className="rounded-2xl bg-[#ffc101] px-4 py-3 text-sm font-bold text-black hover:bg-[#ffd042] disabled:opacity-50"
                        >
                          {isSendingOtp ? t('Sending...') : showOtpInput ? t('Resend') : t('Verify')}
                        </button>
                      )}
                    </div>

                    {showOtpInput && !isEmailVerified && (
                      <div className="mt-1 flex gap-2">
                        <input
                          type="text"
                          maxLength={6}
                          value={emailOtp}
                          onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ''))}
                          placeholder="6-digit code"
                          className="flex-1 rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-center text-sm font-bold tracking-widest text-white focus:border-[#ffc101] outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleVerifyOtp}
                          disabled={isVerifyingOtp || emailOtp.length !== 6}
                          className="rounded-2xl bg-white px-4 py-2 text-sm font-bold text-black hover:bg-slate-100 disabled:opacity-50"
                        >
                          {isVerifyingOtp ? '...' : t('Confirm')}
                        </button>
                      </div>
                    )}
                  </div>
                  <label className="relative">
                    <FiPhone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                    <input name="phone" value={formData.phone} onChange={handleChange} required placeholder={t('Phone')} className="w-full rounded-2xl border border-white/10 bg-white/10 py-3 pl-10 pr-4 text-sm text-white placeholder:text-white/40 outline-none focus:border-[#ffc101]" />
                  </label>
                  <textarea name="storeDescription" value={formData.storeDescription} onChange={handleChange} rows={3} placeholder={t('Store description')} className="md:col-span-2 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-[#ffc101]" />
                  <input name="address.street" value={formData.address.street} onChange={handleChange} placeholder={t('Street')} className="md:col-span-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-[#ffc101]" />
                  <input name="address.city" value={formData.address.city} onChange={handleChange} placeholder={t('City')} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-[#ffc101]" />
                  <input name="address.state" value={formData.address.state} onChange={handleChange} placeholder={t('State')} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-[#ffc101]" />
                  <input name="address.zipCode" value={formData.address.zipCode} onChange={handleChange} placeholder={t('Zip code')} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-[#ffc101]" />
                  <input name="address.country" value={formData.address.country} onChange={handleChange} placeholder={t('Country')} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-[#ffc101]" />
                  
                  {(wholesaleMarketplaceEnabled || quickCommerceEnabled) && (
                    <div className="md:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="mb-3 text-sm font-semibold text-white/90">{t('Selling Channels')}</p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-white/80">
                          <input
                            type="checkbox"
                            checked={formData.sellingChannels.retail}
                            onChange={(event) => handleRetailToggle(event.target.checked)}
                            className="h-4 w-4 rounded border-white/20 text-[#ffc101] focus:ring-[#ffc101]"
                          />
                          {t('Retail Marketplace')}
                        </label>
                        {wholesaleMarketplaceEnabled && (
                          <label className="flex cursor-pointer items-center gap-2 text-sm text-white/80">
                            <input
                              type="checkbox"
                              checked={formData.sellingChannels.wholesale}
                              onChange={(event) => handleWholesaleToggle(event.target.checked)}
                              className="h-4 w-4 rounded border-white/20 text-[#ffc101] focus:ring-[#ffc101]"
                            />
                            {t('Wholesale Marketplace')}
                          </label>
                        )}
                        {quickCommerceEnabled && (
                          <label className="flex cursor-pointer items-center gap-2 text-sm text-white/80">
                            <input
                              type="checkbox"
                              checked={formData.sellingChannels.quickCommerce}
                              onChange={(event) => handleQuickCommerceToggle(event.target.checked)}
                              className="h-4 w-4 rounded border-white/20 text-[#ffc101] focus:ring-[#ffc101]"
                            />
                            {t('Quick Commerce')}
                          </label>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-white/50">{t('At least one selling channel must stay enabled.')}</p>

                      {formData.sellingChannels.wholesale && (
                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-white/70">
                              {t('GST Number')} <span className="text-red-400">*</span>
                            </label>
                            <input
                              name="wholesaleProfile.gstNumber"
                              value={formData.wholesaleProfile.gstNumber}
                              onChange={handleChange}
                              required={formData.sellingChannels.wholesale}
                              placeholder="22AAAAA0000A1Z5"
                              className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-[#ffc101] outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-white/70">
                              {t('Business Name')} <span className="text-red-400">*</span>
                            </label>
                            <input
                              name="wholesaleProfile.businessName"
                              value={formData.wholesaleProfile.businessName}
                              onChange={handleChange}
                              required={formData.sellingChannels.wholesale}
                              placeholder={t('Registered business name')}
                              className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-[#ffc101] outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-white/70">
                              {t('Wholesale Contact Name')} <span className="text-red-400">*</span>
                            </label>
                            <input
                              name="wholesaleProfile.wholesaleContactName"
                              value={formData.wholesaleProfile.wholesaleContactName}
                              onChange={handleChange}
                              required={formData.sellingChannels.wholesale}
                              placeholder={t('Contact person for bulk orders')}
                              className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-[#ffc101] outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-white/70">
                              {t('Wholesale Contact Phone')} <span className="text-red-400">*</span>
                            </label>
                            <input
                              name="wholesaleProfile.wholesaleContactPhone"
                              value={formData.wholesaleProfile.wholesaleContactPhone}
                              onChange={handleChange}
                              required={formData.sellingChannels.wholesale}
                              placeholder="+1234567890"
                              className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-[#ffc101] outline-none"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="mb-1.5 block text-xs font-medium text-white/70">
                              {t('Bulk Order Support Email')} <span className="text-red-400">*</span>
                            </label>
                            <input
                              type="email"
                              name="wholesaleProfile.bulkOrderSupportEmail"
                              value={formData.wholesaleProfile.bulkOrderSupportEmail}
                              onChange={handleChange}
                              required={formData.sellingChannels.wholesale}
                              placeholder="bulkorders@yourstore.com"
                              className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-[#ffc101] outline-none"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <label className="relative">
                    <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                    <input type={showPassword ? 'text' : 'password'} name="password" value={formData.password} onChange={handleChange} required placeholder={t('Password')} className="w-full rounded-2xl border border-white/10 bg-white/10 py-3 pl-10 pr-12 text-sm text-white placeholder:text-white/40 outline-none focus:border-[#ffc101]" />
                    <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-white/60 hover:text-white">{showPassword ? t('Hide') : t('Show')}</button>
                  </label>
                  <label className="relative">
                    <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                    <input type={showConfirmPassword ? 'text' : 'password'} name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} required placeholder={t('Confirm password')} className="w-full rounded-2xl border border-white/10 bg-white/10 py-3 pl-10 pr-12 text-sm text-white placeholder:text-white/40 outline-none focus:border-[#ffc101]" />
                    <button type="button" onClick={() => setShowConfirmPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-white/60 hover:text-white">{showConfirmPassword ? t('Hide') : t('Show')}</button>
                  </label>
                  <select value={documentType} onChange={(event) => setDocumentType(event.target.value)} className="rounded-2xl border border-white/10 bg-[#251a0c] text-white px-4 py-3 text-sm outline-none focus:border-[#ffc101]">
                    <option value="tradeLicense" className="bg-[#251a0c] text-white">{t('Trade Licence')}</option>
                    <option value="gst" className="bg-[#251a0c] text-white">{t('GST')}</option>
                  </select>
                  <input type="file" accept=".pdf,.doc,.docx,image/*" onChange={(event) => setDocumentFile(event.target.files?.[0] || null)} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white/80 file:mr-4 file:rounded-full file:border-0 file:bg-[#ffc101] file:px-4 file:py-2 file:font-bold file:text-black" />
                </div>
                <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-4">
                  <label className="flex items-start gap-3 text-sm text-white/80">
                    <input type="checkbox" checked={agreedToTerms} onChange={(event) => setAgreedToTerms(event.target.checked)} className="mt-1 h-4 w-4 rounded border-white/20 text-[#ffc101]" />
                    <span>{t('I agree to the')} <button type="button" onClick={() => setShowTerms(true)} className="font-bold text-[#ffd042] underline">{t('Terms & Conditions')}</button></span>
                  </label>
                </div>
                 <button
                   type="submit"
                   disabled={isLoading || !isEmailVerified}
                   className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ffc101] px-4 py-3.5 font-bold text-black transition hover:bg-[#ffd042] disabled:opacity-50"
                 >
                   {isLoading ? <FiLoader className="animate-spin" /> : null}
                   {!isEmailVerified ? t('Verify email first') : t('Register')}
                 </button>
              </form>
            </motion.div>
          ) : null}

          {step === 2 ? (
            <motion.div key="payment" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mx-auto max-w-2xl">
              <div className="rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur text-white text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#ffc101]/20 text-[#ffd042]">
                  {selectedPlan?.isFree ? <FiStar size={28} /> : <FiCreditCard size={28} />}
                </div>
                <h2 className="text-2xl font-bold text-white">
                  {selectedPlan?.isFree ? t('Activate your free trial') : t('Complete your subscription')}
                </h2>
                <p className="mt-2 text-sm text-white/70">
                  {selectedPlan?.isFree ? t('Start your free trial without any payment required.') : t('Billing becomes active only after webhook confirmation updates MongoDB.')}
                </p>
                {selectedPlan ? <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5 text-center text-white/90 font-semibold">{selectedPlan.name} | {formatPrice(selectedPlan, t)} | {t('per')} {getIntervalLabel(selectedPlan, t)}</div> : null}
                {paymentState === 'processing' ? <div className="mt-6 rounded-3xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-300">{t('Waiting for billing confirmation. This page will keep checking automatically.')}</div> : null}
                {paymentState === 'pending' ? <div className="mt-6 rounded-3xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-300">{t('Payment is still pending confirmation. Please give the gateway a moment and retry if needed.')}</div> : null}
                {paymentState === 'failed' ? <div className="mt-6 rounded-3xl border border-rose-500/30 bg-rose-500/10 px-4 py-4 text-sm text-rose-300">{t('Billing could not be confirmed. Please retry the payment step.')}</div> : null}
                <div className="mt-6 flex flex-col gap-3">
                  <button type="button" onClick={handlePayment} disabled={isLoading || paymentState === 'processing'} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ffc101] px-4 py-3.5 font-bold text-black transition hover:bg-[#ffd042] disabled:opacity-60">
                    {isLoading ? <FiLoader className="animate-spin" /> : (selectedPlan?.isFree ? <FiCheck /> : <FiCreditCard />)}
                    {isLoading ? (selectedPlan?.isFree ? t('Activating...') : t('Preparing checkout...')) : paymentState === 'processing' ? t('Checking payment status...') : paymentState === 'checkout_open' ? t('Payment window open') : (selectedPlan?.isFree ? t('Activate free plan') : t('Start secure payment'))}
                  </button>
                  <button type="button" onClick={() => setStep(1)} className="rounded-2xl border border-white/20 bg-white/5 px-4 py-3 font-semibold text-white/80 hover:bg-white/10 hover:text-white transition">{t('Back to registration')}</button>
                </div>
              </div>
            </motion.div>
          ) : null}

          {step === 3 ? (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto max-w-lg">
              <div className="rounded-[32px] border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur text-white">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#ffc101]/20 text-[#ffd042]"><FiCheck size={28} /></div>
                <h2 className="text-2xl font-bold text-white">{t('Subscription submitted successfully')}</h2>
                <p className="mt-3 text-sm text-white/70">{t('Your billing is synced from the gateway and your vendor account is now awaiting admin approval.')}</p>
                <button type="button" onClick={() => navigate('/vendor/login')} className="mt-6 w-full rounded-2xl bg-[#ffc101] px-4 py-3.5 font-bold text-black transition hover:bg-[#ffd042]">{t('Go to vendor login')}</button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <StripeSubscriptionForm
        open={showStripe}
        clientSecret={stripeConfig.clientSecret}
        publishableKey={stripeConfig.publishableKey}
        onClose={() => setShowStripe(false)}
        onSubmitted={async () => {
          setShowStripe(false);
          setPaymentState('processing');
          await pollStatus(paymentEmail);
        }}
      />

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


