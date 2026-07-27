import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import { FiArrowLeft, FiCheck } from 'react-icons/fi';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import MobileLayout from "../components/Layout/MobileLayout";
import PageTransition from '../../../shared/components/PageTransition';
import { useAuthStore } from '../../../shared/store/authStore';
import { usePageTranslation } from '../../../hooks/usePageTranslation';

const MobileVerification = () => {
  const { getTranslatedText: t } = usePageTranslation([
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
        <div className="w-full min-h-screen flex items-center justify-center px-4 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md"
          >
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              {/* Back Button */}
              <button
                onClick={() => navigate(-1)}
                className="mb-6 flex items-center text-gray-600 hover:text-gray-900 transition-colors"
              >
                <FiArrowLeft className="mr-2" size={20} />
                <span className="text-sm font-medium">{t('Back')}</span>
              </button>

              {/* Header */}
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('Verification')}</h1>

                {/* Verification Icon */}
                <div className="flex justify-center mb-6">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full bg-purple-100 flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-purple-200 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-purple-500 flex items-center justify-center">
                          <FiCheck className="text-white" size={24} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('Verification code')}</h2>
                <p className="text-sm text-gray-600">
                  {t("Enter the verification code we've sent to your")}{' '}
                  <span className="font-medium text-gray-900">{email || t('email')}</span>
                </p>
              </div>

              {/* Code Input Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex justify-center gap-3">
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
                      className={`w-14 h-14 rounded-full border-2 text-center text-xl font-semibold focus:outline-none transition-all ${code
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-200 focus:border-purple-500 text-gray-900'
                        }`}
                    />
                  ))}
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading || codes.some(code => !code)}
                  className="w-full bg-primary-500 hover:bg-primary-600 text-white py-3.5 rounded-xl font-semibold text-base transition-all duration-300 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? t('Verifying...') : t('Confirm')}
                </button>
              </form>

              {/* Resend Link */}
              <div className="mt-6 text-center">
                <p className="text-sm text-gray-600">
                  {t("Didn't receive the code?")}{' '}
                  <button
                    onClick={handleResend}
                    className="text-primary-600 hover:text-primary-700 font-semibold"
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

