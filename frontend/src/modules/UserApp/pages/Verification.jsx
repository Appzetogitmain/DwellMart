import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import { FiArrowLeft, FiCheck, FiShield, FiMessageCircle } from 'react-icons/fi';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import MobileLayout from "../components/Layout/MobileLayout";
import PageTransition from '../../../shared/components/PageTransition';
import { useAuthStore } from '../../../shared/store/authStore';
import { usePageTranslation } from '../../../hooks/usePageTranslation';
import { loginLogo } from '../../../shared/utils/imagePaths';

const MobileVerification = () => {
  const { getTranslatedText: t } = usePageTranslation([
    'Email Verification',
    'Verification',
    'Verification code',
    "Enter the verification code we've sent to your",
    'email',
    'Verifying...',
    'Confirm',
    "Didn't receive the code?",
    'Resend',
    'Back',
    'Please enter the complete verification code',
    'Verification successful!',
    'Invalid verification code. Please try again.',
    'Verification code sent to your email',
    'Verification code sent to your WhatsApp',
    'WhatsApp Verification',
    'Enter the verification code we sent to your WhatsApp.',
    'Check your email inbox, including the spam folder.',
    'Code expires in',
    'Your code has expired. Please request a new code.',
    'Too many code requests. Please wait before trying again.',
    'Sending...',
    'Failed to resend code. Please try again.'
  ]);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const {
    verifyOTP, resendOTP, pendingEmail, isLoading,
    otpChannel, otpExpiresInMinutes, otpRequestedAt,
  } = useAuthStore();
  const [codes, setCodes] = useState(['', '', '', '', '', '']);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const inputRefs = useRef([]);

  // The server reports where it actually delivered the code. Never infer this
  // from "a phone number was supplied" — WhatsApp may have failed and fallen
  // back to email, and telling the user to check the wrong place strands them.
  const deliveredViaWhatsApp = otpChannel === 'whatsapp';
  const isExpired = secondsLeft <= 0 && Boolean(otpRequestedAt);

  const email =
    String(location.state?.email || pendingEmail || searchParams.get('email') || '')
      .trim()
      .toLowerCase();

  // Focus first input on mount
  useEffect(() => {
    if (!email) {
      navigate('/register', { replace: true });
      return;
    }
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [email, navigate]);

  // Countdown to the code's five-minute expiry. Held equal to the backend
  // window and to the WhatsApp template validity — a UI that promises longer
  // than the code lives is worse than no timer at all.
  useEffect(() => {
    if (!otpRequestedAt) return undefined;
    const totalMs = (otpExpiresInMinutes || 5) * 60 * 1000;

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((otpRequestedAt + totalMs - Date.now()) / 1000));
      setSecondsLeft(remaining);
      return remaining;
    };

    if (tick() === 0) return undefined;
    const timer = setInterval(() => {
      if (tick() === 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [otpRequestedAt, otpExpiresInMinutes]);

  const formatCountdown = (total) => {
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const handleChange = (index, value) => {
    // Only allow single digit
    if (value.length > 1 || (value && !/^\d$/.test(value))) return;

    const newCodes = [...codes];
    newCodes[index] = value;
    setCodes(newCodes);

    // Auto-focus next input
    if (value && index < codes.length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    // Handle backspace
    if (e.key === 'Backspace' && !codes[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();
    if (pastedData.length === codes.length && /^\d+$/.test(pastedData)) {
      const newCodes = pastedData.split('');
      setCodes(newCodes);
      inputRefs.current[codes.length - 1]?.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const verificationCode = codes.join('');

    if (verificationCode.length !== codes.length) {
      toast.error(t('Please enter the complete verification code'));
      return;
    }

    try {
      await verifyOTP(email, verificationCode);
      toast.success(t('Verification successful!'));
      navigate('/home');
    } catch (error) {
      toast.error(t('Invalid verification code. Please try again.'));
    }
  };

  // Resend is ALWAYS user-initiated. Nothing here auto-resends: each send costs
  // a real message and issues a new code that invalidates the one the user may
  // already be typing.
  const handleResend = async () => {
    if (!email || isResending) return;
    setIsResending(true);
    try {
      const result = await resendOTP(email);
      setCodes(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      toast.success(
        result?.otpChannel === 'whatsapp'
          ? t('Verification code sent to your WhatsApp')
          : t('Verification code sent to your email')
      );
    } catch (error) {
      const status = error?.response?.status;
      if (status === 429) {
        toast.error(
          error?.response?.data?.message
          || t('Too many code requests. Please wait before trying again.')
        );
      } else {
        toast.error(error?.message || t('Failed to resend code. Please try again.'));
      }
    } finally {
      setIsResending(false);
    }
  };

  return (
    <PageTransition>
      <MobileLayout showBottomNav={false} showCartBar={false}>
        <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex items-center justify-center p-4 relative overflow-hidden select-none">
          {/* Background Ambient Glows & Mesh Grid */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-amber-500/10 rounded-full blur-[140px] pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-[450px] h-[450px] bg-slate-800/30 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:32px_32px] opacity-25 pointer-events-none" />

          {/* Main Card */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="w-full max-w-md relative z-10"
          >
            <div className="relative rounded-3xl bg-slate-900/90 backdrop-blur-2xl border border-amber-500/20 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] overflow-hidden p-8 sm:p-10">
              {/* Top Gold Accent Line */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-500" />

              {/* Back Button */}
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-amber-400 transition-colors mb-4"
              >
                <FiArrowLeft className="text-sm" />
                <span>{t('Back')}</span>
              </button>

              {/* Header & Logo */}
              <div className="text-center mb-8">
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.4 }}
                  className="flex justify-center mb-5"
                >
                  <div className="bg-slate-950 px-7 py-3.5 rounded-2xl border border-amber-500/30 shadow-[0_0_30px_rgba(212,175,55,0.15)] inline-flex items-center justify-center">
                    <img
                      src={loginLogo}
                      alt="DwellMart Logo"
                      className="h-12 sm:h-14 w-auto object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                    />
                  </div>
                </motion.div>

                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-3 border ${
                  deliveredViaWhatsApp
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                }`}>
                  {deliveredViaWhatsApp ? <FiMessageCircle className="text-xs" /> : <FiShield className="text-xs" />}
                  <span>{deliveredViaWhatsApp ? t('WhatsApp Verification') : t('Email Verification')}</span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-1.5">{t('Verification code')}</h1>
                <p className="text-slate-400 text-xs sm:text-sm">
                  {deliveredViaWhatsApp
                    ? t('Enter the verification code we sent to your WhatsApp.')
                    : <>
                        {t("Enter the verification code we've sent to your")}{' '}
                        <span className="font-medium text-amber-400">{email || t('email')}</span>
                      </>}
                </p>

                {/* The code was NOT delivered where the user expected. Say so
                    plainly rather than leaving them watching a silent phone. */}
                {otpChannel === 'email' && (
                  <p className="mt-2 text-[11px] text-slate-500">
                    {t('Check your email inbox, including the spam folder.')}
                  </p>
                )}

                {/* Countdown / expiry. Held equal to the five-minute backend window. */}
                {otpRequestedAt && (
                  <div className="mt-4">
                    {isExpired ? (
                      <p className="text-xs font-semibold text-red-400">
                        {t('Your code has expired. Please request a new code.')}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400">
                        {t('Code expires in')}{' '}
                        <span className={`font-bold tabular-nums ${secondsLeft <= 60 ? 'text-red-400' : 'text-amber-400'}`}>
                          {formatCountdown(secondsLeft)}
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Code Input Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex justify-center gap-2.5 sm:gap-3">
                  {codes.map((code, index) => (
                    <input
                      key={index}
                      ref={(el) => (inputRefs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={code}
                      onChange={(e) => handleChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      onPaste={index === 0 ? handlePaste : undefined}
                      className={`w-11 sm:w-12 h-12 rounded-xl border text-center text-lg font-bold transition-all ${
                        code
                          ? 'border-amber-500 bg-amber-500/10 text-amber-400 shadow-[0_0_15px_rgba(212,175,55,0.2)]'
                          : 'border-slate-700/80 bg-slate-950/80 focus:border-amber-500 text-white'
                      } focus:outline-none focus:ring-2 focus:ring-amber-500/20`}
                    />
                  ))}
                </div>

                {/* Submit Button */}
                <motion.button
                  type="submit"
                  disabled={isLoading || isExpired || codes.some(code => !code)}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:via-yellow-400 hover:to-amber-500 text-slate-950 rounded-xl font-bold text-sm sm:text-base shadow-[0_4px_20px_rgba(212,175,55,0.3)] hover:shadow-[0_6px_25px_rgba(212,175,55,0.45)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group mt-2"
                >
                  {isLoading ? t('Verifying...') : <><FiCheck className="text-lg" /> <span>{t('Confirm')}</span></>}
                </motion.button>
              </form>

              {/* Resend Link */}
              <div className="mt-6 text-center pt-4 border-t border-slate-800/80">
                <p className="text-xs sm:text-sm text-slate-400">
                  {t("Didn't receive the code?")}{' '}
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={isResending}
                    className="text-amber-400 hover:text-amber-300 font-bold transition-colors underline underline-offset-4 decoration-amber-500/40 hover:decoration-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isResending ? t('Sending...') : t('Resend')}
                  </button>
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileVerification;


