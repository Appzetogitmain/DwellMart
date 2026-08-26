import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiArrowLeft,
  FiArrowRight,
  FiBriefcase,
  FiCheck,
  FiCreditCard,
  FiEye,
  FiEyeOff,
  FiFileText,
  FiLock,
  FiMail,
  FiPhone,
  FiShoppingBag,
  FiStar,
  FiUser,
  FiX,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../shared/utils/api';
import { useSettingsStore } from '../../../shared/store/settingsStore';

const STEPS = ['Plans', 'Registration', 'Payment', 'Thank You'];
const ONBOARDING_STORAGE_KEY = 'vendor-onboarding-email:/vendor/register';

const VendorRegister = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { settings, initialize: initializeSettings } = useSettingsStore();
  const wholesaleMarketplaceEnabled = settings?.features?.wholesaleMarketplaceEnabled === true;
  const quickCommerceEnabled = settings?.features?.quickCommerceEnabled === true;
  const [currentStep, setCurrentStep] = useState(0);
  const [plans, setPlans] = useState([]);
  const [onboardingEmail, setOnboardingEmail] = useState('');
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [termsContent, setTermsContent] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [registrationDocument, setRegistrationDocument] = useState(null);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState('');

  const [documentType, setDocumentType] = useState('tradeLicense');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [paymentState, setPaymentState] = useState('idle');

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

  const paymentEmail = onboardingEmail || sessionStorage.getItem(ONBOARDING_STORAGE_KEY) || formData.email.trim().toLowerCase();
  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const syncFromStatus = async (email, availablePlans = plans, { suppressToast = false } = {}) => {
    if (!email) {
      return false;
    }

    const response = await api.post('/vendor/auth/onboarding-status', { email });
    const data = response?.data || {};

    if (data.nextStep === 'verify_phone') {
      // Registration itself proves the mobile number and resumes the account.
      sessionStorage.setItem(ONBOARDING_STORAGE_KEY, email);
      setOnboardingEmail(email);
      return false;
    }

    if (data.nextStep === 'choose_plan') {
      sessionStorage.setItem(ONBOARDING_STORAGE_KEY, email);
      setOnboardingEmail(email);
      setSelectedPlan(null);
      setPaymentState('idle');
      setCurrentStep(0);
      if (!suppressToast) {
        toast.success('Resume your onboarding by choosing a subscription plan.');
      }
      return false;
    }

    if (data.nextStep === 'complete_payment') {
      const plan = data.selectedPlan || availablePlans.find((item) => item._id === data.selectedPlanId) || null;
      sessionStorage.setItem(ONBOARDING_STORAGE_KEY, email);
      setOnboardingEmail(email);
      setSelectedPlan(plan);
      setCurrentStep(2);
      return false;
    }

    if (data.nextStep === 'awaiting_admin_approval') {
      sessionStorage.removeItem(ONBOARDING_STORAGE_KEY);
      setOnboardingEmail('');
      setPaymentState('confirmed');
      setCurrentStep(3);
      if (!suppressToast) {
        toast.success('Onboarding completed! Please await admin approval.');
      }
      return true;
    }

    if (data.nextStep === 'approved') {
      sessionStorage.removeItem(ONBOARDING_STORAGE_KEY);
      toast.success('Your vendor account is already active. Please login.');
      navigate('/vendor/login', { replace: true });
      return true;
    }

    if (data.nextStep === 'rejected' || data.nextStep === 'suspended') {
      sessionStorage.removeItem(ONBOARDING_STORAGE_KEY);
      toast.error('This vendor account cannot continue onboarding. Please contact support.');
      return true;
    }

    return false;
  };

  const pollStatus = async (email, availablePlans = plans, attempt = 0) => {
    if (!email) return false;

    const done = await syncFromStatus(email, availablePlans, { suppressToast: attempt > 0 });
    if (done) {
      return true;
    }

    if (attempt >= 8) {
      setPaymentState('pending');
      return false;
    }

    await wait(3000);
    return pollStatus(email, availablePlans, attempt + 1);
  };

  const resumeOnboarding = async (email, availablePlans = plans) => {
    await syncFromStatus(email, availablePlans);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [plansRes, termsRes] = await Promise.all([
          api.get('/subscription-plans'),
          api.get('/vendor-terms'),
        ]);
        const fetchedPlans = plansRes?.data || [];
        setPlans(fetchedPlans);
        setTermsContent(termsRes?.data?.content || '');
        const savedEmail = sessionStorage.getItem(ONBOARDING_STORAGE_KEY) || '';
        const resumeEmail = location.state?.resumeEmail || savedEmail;
        if (resumeEmail) {
          setOnboardingEmail(resumeEmail);
        }

        const queryParams = new URLSearchParams(window.location.search);
        if (
          (queryParams.get('payment') === 'processing'
            || queryParams.get('redirect_status')
            || queryParams.get('success') === 'true')
          && (savedEmail || resumeEmail)
        ) {
          setPaymentState('processing');
          await pollStatus(savedEmail || resumeEmail, fetchedPlans);
          window.history.replaceState({}, document.title, window.location.pathname);
        } else if (queryParams.get('canceled') === 'true') {
          toast.error('Payment was canceled.');
          window.history.replaceState({}, document.title, window.location.pathname);
        } else if (resumeEmail) {
          await resumeOnboarding(resumeEmail, fetchedPlans);
        }
      } catch (error) {
        console.error('Failed to fetch vendor registration data:', error);
      }
    };
    fetchData();
    initializeSettings();
  }, [location.state, navigate]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    // Changing the number after proving it would invalidate the proof.
    if (name === 'phone' && isPhoneVerified) return;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

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

  const handleRequestOtp = async () => {
    const phone = formData.phone?.trim();
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      toast.error('Please enter a valid mobile number.');
      return;
    }

    setIsSendingOtp(true);
    try {
      await api.post('/vendor/auth/request-registration-otp', { phone });
      setShowOtpInput(true);
      toast.success('Verification code sent to your WhatsApp.');
    } catch (error) {
      // This code has no email fallback by design, so a delivery failure has to
      // be surfaced rather than swallowed.
      toast.error(error?.response?.data?.message || 'Could not send the WhatsApp code.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    const otp = phoneOtp.trim();
    if (!/^\d{6}$/.test(otp)) {
      toast.error('Please enter a valid 6-digit code.');
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
      toast.success('Mobile number verified successfully.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Invalid verification code.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleSelectPlan = (plan) => {
    setSelectedPlan(plan);
    setCurrentStep(1);
  };



  const handleFreePlanActivation = async () => {
    if (!selectedPlan?._id) {
      toast.error('Please select a subscription plan.');
      return;
    }

    setIsLoading(true);
    setPaymentState('processing');
    try {
      const response = await api.post('/subscription/initiate', {
        email: paymentEmail,
        selectedPlanId: selectedPlan._id,
      });
      const data = response?.data || {};
      if (data.status === 'active' || data.alreadyActive) {
        await syncFromStatus(paymentEmail, plans);
        return;
      }
      await pollStatus(paymentEmail, plans);
    } catch (error) {
      console.error('Free plan activation error:', error);
      setPaymentState('failed');
      toast.error('Could not complete onboarding.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.name || !formData.email || !formData.phone || !formData.password || !formData.storeName) {
      toast.error('Please fill in all required fields.');
      return;
    }
    if (!selectedPlan?._id) {
      toast.error('Please select a subscription plan.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    if (formData.password.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }
    if (!agreedToTerms) {
      toast.error('You must agree to the Terms & Conditions.');
      return;
    }

    const wholesaleRequested = wholesaleMarketplaceEnabled && formData.sellingChannels.wholesale;
    const quickCommerceRequested = quickCommerceEnabled && formData.sellingChannels.quickCommerce;
    if (!formData.sellingChannels.retail && !wholesaleRequested && !quickCommerceRequested) {
      toast.error('Please enable at least one selling channel (Retail, Wholesale, or Quick Commerce).');
      return;
    }

    setIsLoading(true);
    try {
      const submitData = new FormData();
      submitData.append('name', formData.name.trim());
      submitData.append('email', formData.email.trim().toLowerCase());
      submitData.append('password', formData.password);
      submitData.append('phone', formData.phone.trim());
      submitData.append('storeName', formData.storeName.trim());
      submitData.append('selectedPlanId', selectedPlan._id);
      submitData.append('documentType', documentType);
      submitData.append('agreedToTerms', true);
      if (registrationDocument) {
        submitData.append('document', registrationDocument);
      }
      submitData.append('sellingChannels', JSON.stringify({
        retail: { enabled: formData.sellingChannels.retail },
        wholesale: { enabled: wholesaleRequested },
        quickCommerce: { enabled: quickCommerceRequested },
      }));

      const response = await api.post('/vendor/auth/register', submitData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const responseData = response?.data || {};
      const email = (responseData.email || formData.email).trim().toLowerCase();
      
      if (responseData.resume) {
        toast.success(response.message || 'Resuming your application.');
      } else {
        toast.success('Registration successful!');
      }

      const nextStep = responseData.nextStep;
      if (nextStep === 'complete_payment') {
        sessionStorage.setItem(ONBOARDING_STORAGE_KEY, email);
        setSelectedPlan(responseData.selectedPlan);
        setOnboardingEmail(email);
        setCurrentStep(2);
      } else if (nextStep === 'awaiting_admin_approval') {
        sessionStorage.removeItem(ONBOARDING_STORAGE_KEY);
        toast.success('Registration complete. Awaiting admin approval.');
        navigate('/vendor/login');
      }
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || 'Registration failed. Please try again.';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#221300] via-[#3a2403] to-[#1a1204] px-3 sm:px-4 py-6 sm:py-8 overflow-x-hidden">
      <div className="mx-auto max-w-5xl">
        <Link
          to="/vendor/login"
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-white/80 hover:text-white"
        >
          <FiArrowLeft />
          Back to Vendor Login
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-white md:text-4xl">Register As Vendor</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/70">
            Choose your subscription plan first, then register and complete payment to finish onboarding.
          </p>
        </div>

        <div className="mb-8 sm:mb-12 w-full max-w-2xl mx-auto px-1 sm:px-4">
          <div className="flex items-start justify-between">
            {STEPS.map((step, index) => (
              <div key={step} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center shrink-0">
                  <div
                    className={`flex h-8 w-8 sm:h-10 sm:w-10 md:h-11 md:w-11 items-center justify-center rounded-full text-xs sm:text-sm font-bold shadow-sm sm:shadow-md transition-all ${
                      index < currentStep
                        ? 'bg-[#ffc101] text-black'
                        : index === currentStep
                        ? 'bg-white text-[#5a3a00] ring-2 sm:ring-4 ring-[#ffc101]/20 font-extrabold'
                        : 'bg-white/10 text-white/60'
                    }`}
                  >
                    {index < currentStep ? <FiCheck className="stroke-[3] text-xs sm:text-sm" /> : index + 1}
                  </div>
                  <span
                    className={`mt-1.5 text-[10px] sm:text-xs font-bold text-center whitespace-nowrap ${
                      index <= currentStep ? 'text-white' : 'text-white/50'
                    }`}
                  >
                    {step}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div className="flex-1 mx-1 sm:mx-2 md:mx-3 -mt-4 sm:-mt-5">
                    <div
                      className={`h-0.5 sm:h-1 w-full rounded-full transition-colors ${
                        index < currentStep ? 'bg-[#ffc101]' : 'bg-white/10'
                      }`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {currentStep === 0 && (
            <motion.div
              key="plans"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="mb-6 text-center text-white">
                <h2 className="text-2xl font-bold">Choose Your Membership Plan</h2>
                <p className="mt-2 text-sm text-white/70">
                  Paid plans open the payment options first, then continue to registration.
                </p>
              </div>

              {plans.length === 0 ? (
                <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-white/70">
                  No plans available at the moment.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {plans.map((plan) => (
                    <div
                      key={plan._id}
                      className={`relative rounded-3xl border p-6 text-white shadow-2xl backdrop-blur ${
                        plan.isMostPopular
                          ? 'border-[#ffc101]/70 bg-white/10 ring-2 ring-[#ffc101]/30'
                          : 'border-white/10 bg-white/5'
                      }`}
                    >
                      {plan.isMostPopular && (
                        <div className="absolute right-0 top-0 flex items-center gap-1 rounded-bl-2xl bg-[#ffc101] px-3 py-1 text-xs font-bold text-black">
                          <FiStar />
                          MOST POPULAR
                        </div>
                      )}
                      <h3 className="text-lg font-bold">{plan.name}</h3>
                      <div className="mt-3 flex flex-col gap-0">
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-extrabold">
                            {plan.isFree ? 'FREE' : `Rs. ${Number(plan.pricing?.inr || 0).toFixed(0)}`}
                          </span>
                          {!plan.isFree && (
                            <span className="text-sm text-white/60">/ {plan.intervalLabel}</span>
                          )}
                        </div>
                        {!plan.isFree && (
                          <div className="text-base font-semibold text-white/80">
                            $ {Number(plan.pricing?.usd || 0).toFixed(2)} USD
                          </div>
                        )}
                      </div>

                      {plan.featureHighlights?.length > 0 && (
                        <ul className="mt-5 space-y-2">
                          {plan.featureHighlights.map((feature, index) => (
                            <li key={`${plan._id}-${index}`} className="flex items-start gap-2 text-sm text-white/80">
                              <FiCheck className="mt-0.5 flex-shrink-0 text-[#ffd042]" />
                              {feature}
                            </li>
                          ))}
                        </ul>
                      )}
                      <button
                        type="button"
                        onClick={() => handleSelectPlan(plan)}
                        className={`mt-6 w-full rounded-2xl py-3 font-semibold ${
                          plan.isTrial
                            ? 'bg-slate-100 text-slate-900 hover:bg-white'
                            : 'bg-[#ffc101] text-black hover:bg-[#ffd042]'
                        }`}
                      >
                        {selectedPlan?._id === plan._id ? 'Selected Plan' : 'Continue with Plan'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {currentStep === 1 && (
            <motion.div
              key="register"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="mx-auto max-w-3xl"
            >
              <div className="mb-6 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setCurrentStep(0)}
                  className="inline-flex items-center gap-2 text-sm font-medium text-white/75 hover:text-white"
                >
                  <FiArrowLeft />
                  Back to Plans
                </button>
                {onboardingEmail && (
                  <span className="rounded-full bg-[#ffc101]/15 px-3 py-1 text-sm font-semibold text-[#ffd042]">
                    Verified: {onboardingEmail}
                  </span>
                )}
              </div>

              <div className="rounded-[28px] border border-white/10 bg-white/95 p-6 text-gray-900 shadow-2xl md:p-8">
                {selectedPlan && (
                  <div className="mb-6 rounded-xl border border-[#ffc101]/30 bg-[#ffc101]/10 p-4 text-sm text-[#5a3a00]">
                    Selected plan: <strong>{selectedPlan.name}</strong>
                    {selectedPlan.isFree ? ' (Free)' : ` (Rs. ${Number(selectedPlan.pricing?.inr || 0).toFixed(0)} / $${Number(selectedPlan.pricing?.usd || 0).toFixed(2)})`}
                  </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-600">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          required
                          placeholder="John Doe"
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#ffc101] focus:outline-none focus:ring-2 focus:ring-[#ffc101]/20"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-600">
                        Email <span className="text-red-500">*</span>
                      </label>
                      {/* Collected for correspondence only. The proven contact
                          is the mobile number below. */}
                      <div className="relative">
                        <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleChange}
                          required
                          placeholder="vendor@example.com"
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#ffc101] focus:outline-none focus:ring-2 focus:ring-[#ffc101]/20"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-600">
                        Phone <span className="text-red-500">*</span>
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <FiPhone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            type="tel"
                            name="phone"
                            value={formData.phone}
                            onChange={handleChange}
                            readOnly={isPhoneVerified}
                            required
                            placeholder="+919876543210"
                            className={`w-full rounded-xl border py-3 pl-10 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ffc101]/20 ${
                              isPhoneVerified ? 'bg-green-50 border-green-200 font-semibold' : 'border-gray-200 bg-gray-50 focus:border-[#ffc101]'
                            }`}
                          />
                          {isPhoneVerified && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-green-600">
                              <FiCheck className="stroke-[3]" />
                            </div>
                          )}
                        </div>
                        {!isPhoneVerified && (
                          <button
                            type="button"
                            onClick={handleRequestOtp}
                            disabled={isSendingOtp || !formData.phone}
                            className="rounded-xl bg-[#ffc101] px-4 py-3 text-sm font-semibold text-black hover:bg-[#ffd042] disabled:opacity-50"
                          >
                            {isSendingOtp ? 'Sending...' : showOtpInput ? 'Resend' : 'Verify'}
                          </button>
                        )}
                      </div>

                      {!isPhoneVerified && (
                        <p className="mt-1.5 text-xs text-gray-500">
                          We will send a 6-digit code to this number on WhatsApp.
                        </p>
                      )}

                      {showOtpInput && !isPhoneVerified && (
                        <div className="mt-3 flex gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={phoneOtp}
                            onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ''))}
                            placeholder="6-digit code"
                            className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-center text-sm font-bold tracking-widest text-gray-800 focus:border-[#ffc101] focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleVerifyOtp}
                            disabled={isVerifyingOtp || phoneOtp.length !== 6}
                            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
                          >
                            {isVerifyingOtp ? '...' : 'Confirm'}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-1.5 block text-sm font-medium text-gray-600">
                        Store Name <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <FiBriefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          name="storeName"
                          value={formData.storeName}
                          onChange={handleChange}
                          required
                          placeholder="My Awesome Company"
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#ffc101] focus:outline-none focus:ring-2 focus:ring-[#ffc101]/20"
                        />
                      </div>
                    </div>

                    {(wholesaleMarketplaceEnabled || quickCommerceEnabled) && (
                      <div className="md:col-span-2 rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <p className="mb-3 text-sm font-semibold text-gray-700">Selling Channels</p>
                        <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={formData.sellingChannels.retail}
                              onChange={(event) => handleRetailToggle(event.target.checked)}
                              className="h-4 w-4 rounded border-gray-300 text-[#ffc101] focus:ring-[#ffc101]"
                            />
                            Retail Marketplace
                          </label>
                          {wholesaleMarketplaceEnabled && (
                            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={formData.sellingChannels.wholesale}
                                onChange={(event) => handleWholesaleToggle(event.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-[#ffc101] focus:ring-[#ffc101]"
                              />
                              Wholesale Marketplace
                            </label>
                          )}
                          {quickCommerceEnabled && (
                            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={formData.sellingChannels.quickCommerce}
                                onChange={(event) => handleQuickCommerceToggle(event.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-[#ffc101] focus:ring-[#ffc101]"
                              />
                              Quick Commerce
                            </label>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-gray-500">At least one selling channel must stay enabled.</p>
                      </div>
                    )}

                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-600">
                        Document Type
                      </label>
                      <select
                        value={documentType}
                        onChange={(event) => setDocumentType(event.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 focus:border-[#ffc101] focus:outline-none focus:ring-2 focus:ring-[#ffc101]/20"
                      >
                        <option value="tradeLicense">Trade Licence</option>
                        <option value="gst">GST</option>
                        <option value="msme">MSME</option>
                        <option value="uin">Enrolment ID/UIN</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-600">
                        {documentType === 'gst' ? 'GST Document' : documentType === 'msme' ? 'MSME Document' : documentType === 'uin' ? 'Enrolment ID/UIN Document' : 'Trade Licence Document'}
                      </label>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,image/*"
                        onChange={(event) => setRegistrationDocument(event.target.files?.[0] || null)}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 file:mr-4 file:rounded-full file:border-0 file:bg-[#fff4bf] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#8a5a00] hover:file:bg-[#ffe082]"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-600">
                        Password <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          name="password"
                          value={formData.password}
                          onChange={handleChange}
                          required
                          placeholder="Min 6 characters"
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-10 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#ffc101] focus:outline-none focus:ring-2 focus:ring-[#ffc101]/20"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                        >
                          {showPassword ? <FiEyeOff /> : <FiEye />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-600">
                        Confirm Password <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          name="confirmPassword"
                          value={formData.confirmPassword}
                          onChange={handleChange}
                          required
                          placeholder="Re-enter password"
                          className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-10 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[#ffc101] focus:outline-none focus:ring-2 focus:ring-[#ffc101]/20"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword((prev) => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                        >
                          {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <label className="flex cursor-pointer items-start gap-3 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={agreedToTerms}
                        onChange={(event) => setAgreedToTerms(event.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-[#ffc101] focus:ring-[#ffc101]"
                      />
                      <span>
                        I agree to the{' '}
                        <button
                          type="button"
                          onClick={() => setShowTermsModal(true)}
                          className="font-medium text-[#8a5a00] underline"
                        >
                          Terms & Conditions
                        </button>
                        <span className="text-red-500"> *</span>
                      </span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || !agreedToTerms || !isPhoneVerified}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#ffc101] py-3 font-semibold text-black hover:bg-[#ffd042] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {!isPhoneVerified ? 'Verify Mobile Number First' : isLoading ? 'Registering...' : (
                      <>
                        Register as Vendor <FiArrowRight />
                      </>
                    )}
                  </button>

                  <div className="text-center pt-1">
                    <p className="text-sm text-gray-600">
                      Already registered?{' '}
                      <button
                        type="button"
                        onClick={() => navigate('/vendor/login')}
                        className="font-semibold text-[#8a5a00] hover:text-[#5a3a00]"
                      >
                        Vendor Login
                      </button>
                    </p>
                  </div>
                </form>
              </div>
            </motion.div>
          )}

          {currentStep === 2 && (
            <motion.div
              key="payment"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="mx-auto max-w-xl"
            >
              <div className="rounded-[28px] border border-white/10 bg-white/95 p-8 text-gray-900 shadow-2xl">
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#fff4bf] text-3xl text-[#b77900]">
                    <FiCreditCard />
                  </div>
                  <h2 className="text-2xl font-bold">
                    {!selectedPlan?.isFree && !selectedPlan?.isTrial ? 'Complete Your Payment' : 'Complete Your Onboarding'}
                  </h2>
                  <p className="mt-2 text-gray-500">
                    {!selectedPlan?.isFree && !selectedPlan?.isTrial
                      ? 'Your registration is saved. Pay now to finish onboarding.'
                      : 'Your registration is saved. Finish onboarding to submit your application. Activation happens after payment confirmation.'}
                  </p>
                </div>

                {selectedPlan && (
                  <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-gray-500">Selected Plan</p>
                        <h3 className="text-xl font-bold text-gray-800">{selectedPlan.name}</h3>
                        <p className="mt-1 text-sm text-gray-500">
                          Duration: {selectedPlan.durationDays} day{selectedPlan.durationDays > 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-500">Amount</p>
                        <div className="text-right">
                          <p className="text-2xl font-extrabold text-gray-900">
                            {selectedPlan.isFree ? 'FREE' : `Rs. ${Number(selectedPlan.pricing?.inr || 0).toFixed(0)}`}
                          </p>
                          {!selectedPlan.isFree && (
                            <p className="text-base font-bold text-gray-700">
                              $ {Number(selectedPlan.pricing?.usd || 0).toFixed(2)} USD
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {paymentState === 'processing' && (
                  <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Waiting for payment confirmation from the gateway. This page will update automatically.
                  </div>
                )}

                {paymentState === 'pending' && (
                  <div className="mt-6 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                    Payment is still pending confirmation. Please wait a moment, then try the payment step again if needed.
                  </div>
                )}

                {paymentState === 'failed' && (
                  <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    We could not confirm the payment yet. Please retry the payment step.
                  </div>
                )}

                <div className="mt-6 flex flex-col gap-3">
                  {!selectedPlan?.isFree && !selectedPlan?.isTrial ? (
                    <button
                      type="button"
                      onClick={() => {
                        setTempSelectedPlan(selectedPlan);
                        setShowPaymentModal(true);
                      }}
                      disabled={isLoading || paymentState === 'processing'}
                      className="w-full rounded-xl bg-[#ffc101] py-3 font-semibold text-black hover:bg-[#ffd042] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isLoading ? 'Preparing Checkout...' : paymentState === 'processing' ? 'Checking Payment Status...' : paymentState === 'checkout_open' ? 'Payment Window Open' : 'Choose Payment Method'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleFreePlanActivation}
                      disabled={isLoading || !selectedPlan || paymentState === 'processing'}
                      className="w-full rounded-xl bg-[#ffc101] py-3 font-semibold text-black hover:bg-[#ffd042] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isLoading ? 'Completing...' : paymentState === 'processing' ? 'Checking Payment Status...' : 'Complete Onboarding'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="w-full rounded-xl bg-gray-100 py-3 font-medium text-gray-700 hover:bg-gray-200"
                  >
                    Back to Registration
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {currentStep === 3 && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mx-auto max-w-md"
            >
              <div className="rounded-[28px] border border-white/10 bg-white/95 p-8 text-center text-gray-900 shadow-2xl">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#fff4bf] text-3xl text-[#b77900]">
                  <FiCheck />
                </div>
                <h2 className="text-2xl font-bold">Registration Successful!</h2>
                <p className="mt-2 text-gray-500">
                  Your account and plan selection are complete. Our team will review your application after verification and payment confirmation.
                </p>
                {selectedPlan && (
                  <p className="mt-5 rounded-xl bg-gray-50 p-3 text-sm text-gray-500">
                    You selected the <strong>{selectedPlan.name}</strong> plan.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => navigate('/vendor/login')}
                  className="mt-6 w-full rounded-xl bg-[#ffc101] py-3 font-semibold text-black hover:bg-[#ffd042]"
                >
                  Go to Vendor Login
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showTermsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
            onClick={() => setShowTermsModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-3xl bg-white text-gray-900 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b p-4">
                <div className="flex items-center gap-2">
                  <FiFileText className="text-[#b77900]" />
                  <h3 className="font-bold">Terms & Conditions</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTermsModal(false)}
                  className="text-xl text-gray-400 hover:text-gray-600"
                >
                  x
                </button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto p-4">
                {termsContent ? (
                  <div
                    className="prose prose-sm max-w-none text-gray-600"
                    dangerouslySetInnerHTML={{ __html: termsContent }}
                  />
                ) : (
                  <p className="py-8 text-center text-gray-400">No terms & conditions have been set yet.</p>
                )}
              </div>
              <div className="border-t p-4">
                <button
                  type="button"
                  onClick={() => {
                    setAgreedToTerms(true);
                    setShowTermsModal(false);
                  }}
                  className="w-full rounded-xl bg-[#ffc101] py-2.5 font-semibold text-black hover:bg-[#ffd042]"
                >
                  I Agree
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VendorRegister;
