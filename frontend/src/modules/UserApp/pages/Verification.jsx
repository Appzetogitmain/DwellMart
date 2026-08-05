import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import { FiArrowLeft, FiCheck, FiShield } from 'react-icons/fi';
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
    'Failed to resend code. Please try again.'
  ]);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { verifyOTP, resendOTP, pendingEmail, isLoading } = useAuthStore();
  const [codes, setCodes] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef([]);

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

  const handleResend = async () => {
    if (!email) return;
    try {
      await resendOTP(email);
      toast.success(t('Verification code sent to your email'));
    } catch (error) {
      toast.error(error?.message || t('Failed to resend code. Please try again.'));
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

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-3">
                  <FiShield className="text-xs" />
                  <span>{t('Email Verification')}</span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-1.5">{t('Verification code')}</h1>
                <p className="text-slate-400 text-xs sm:text-sm">
                  {t("Enter the verification code we've sent to your")}{' '}
                  <span className="font-medium text-amber-400">{email || t('email')}</span>
                </p>
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
                  disabled={isLoading || codes.some(code => !code)}
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
                    className="text-amber-400 hover:text-amber-300 font-bold transition-colors underline underline-offset-4 decoration-amber-500/40 hover:decoration-amber-400"
                  >
                    {t('Resend')}
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


