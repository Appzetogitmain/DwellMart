import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiCheck, FiMail, FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';
import MobileLayout from '../components/Layout/MobileLayout';
import PageTransition from '../../../shared/components/PageTransition';
import { useAuthStore } from '../../../shared/store/authStore';
import { usePageTranslation } from '../../../hooks/usePageTranslation';

const OTP_LENGTH = 6;

const MobileForgotPassword = () => {
  const { getTranslatedText: t } = usePageTranslation([
    'Please enter your email.',
    'If the email exists, reset OTP has been sent.',
    'Please enter the full OTP.',
    'OTP verified. Please set your new password.',
    'Forgot Password',
    'Enter your account email to receive OTP.',
    'Enter the OTP sent to',
    'Email Address',
    'your.email@example.com',
    'Sending OTP...',
    'Send OTP',
    'Resend OTP',
    'Change Email',
    'Verifying...',
    'Verify OTP',
    'Back to Login'
  ]);
  const navigate = useNavigate();
  const { forgotPassword, verifyResetOtp, isLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState('request');
  const [codes, setCodes] = useState(Array(OTP_LENGTH).fill(''));
  const inputRefs = useRef([]);

  useEffect(() => {
    if (step === 'verify' && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [step]);

  const handleRequestOtp = async (e) => {
    if (e) e.preventDefault();
    if (!email.trim()) {
      toast.error(t('Please enter your email.'));
      return;
    }

    try {
      await forgotPassword(email.trim().toLowerCase());
      toast.success(t('If the email exists, reset OTP has been sent.'));
      setStep('verify');
    } catch (error) {
      const message = String(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          ''
      ).toLowerCase();

      if (
        message.includes('verify your email') ||
        message.includes('verification otp has been sent')
      ) {
        navigate('/verification', {
          state: { email: email.trim().toLowerCase() },
          replace: true,
        });
      }
    }
  };

  const handleCodeChange = (index, value) => {
    if (value.length > 1 || (value && !/^\d$/.test(value))) return;
    const next = [...codes];
    next[index] = value;
    setCodes(next);
    if (value && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !codes[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').trim();
    if (!/^\d{6}$/.test(pasted)) return;
    setCodes(pasted.split(''));
    inputRefs.current[OTP_LENGTH - 1]?.focus();
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const otp = codes.join('');
    if (otp.length !== OTP_LENGTH) {
      toast.error(t('Please enter the full OTP.'));
      return;
    }

    try {
      await verifyResetOtp(email.trim().toLowerCase(), otp);
      toast.success(t('OTP verified. Please set your new password.'));
      navigate(`/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch {
      // Global API interceptor shows toast
    }
  };

  return (
    <PageTransition>
      <MobileLayout showBottomNav={false} showCartBar={false}>
        <div className="w-full min-h-screen flex items-center justify-center px-4 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md"
          >
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('Forgot Password')}</h1>
                <p className="text-sm text-gray-600">
                  {step === 'request'
                    ? t('Enter your account email to receive OTP.')
                    : `${t('Enter the OTP sent to')} ${email}`}
                </p>
              </div>

              {step === 'request' ? (
                <form onSubmit={handleRequestOtp} className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">{t('Email Address')}</label>
                    <div className="relative">
                      <FiMail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={t('your.email@example.com')}
                        className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-primary-500 focus:outline-none transition-colors text-base"
                        required
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-primary-500 hover:bg-primary-600 text-white py-3.5 rounded-xl font-semibold text-base transition-all duration-300 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? t('Sending OTP...') : t('Send OTP')}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-5">
                  <div className="flex justify-center gap-2">
                    {codes.map((code, index) => (
                      <input
                        key={index}
                        ref={(el) => (inputRefs.current[index] = el)}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={code}
                        onChange={(e) => handleCodeChange(index, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(index, e)}
                        onPaste={index === 0 ? handlePaste : undefined}
                        className="w-11 h-11 text-center text-lg font-bold bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 text-gray-800"
                      />
                    ))}
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={handleRequestOtp}
                      disabled={isLoading}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium disabled:text-gray-400 inline-flex items-center gap-2"
                    >
                      <FiRefreshCw />
                      {t('Resend OTP')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep('request')}
                      className="text-sm text-gray-600 hover:text-gray-800 font-medium"
                    >
                      {t('Change Email')}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-primary-500 hover:bg-primary-600 text-white py-3.5 rounded-xl font-semibold text-base transition-all duration-300 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isLoading ? t('Verifying...') : <><FiCheck /> {t('Verify OTP')}</>}
                  </button>
                </form>
              )}

              <div className="text-center pt-6">
                <Link to="/login" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 font-medium">
                  <FiArrowLeft />
                  {t('Back to Login')}
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileForgotPassword;
