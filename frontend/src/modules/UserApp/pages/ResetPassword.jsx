import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiEye, FiEyeOff, FiLock } from 'react-icons/fi';
import toast from 'react-hot-toast';
import MobileLayout from '../components/Layout/MobileLayout';
import PageTransition from '../../../shared/components/PageTransition';
import { useAuthStore } from '../../../shared/store/authStore';
import { usePageTranslation } from '../../../hooks/usePageTranslation';

const MobileResetPassword = () => {
  const { getTranslatedText: t } = usePageTranslation([
    'Session expired. Please start forgot password again.',
    'Please fill both password fields.',
    'Passwords do not match.',
    'Password reset successful. Please login.',
    'Reset Password',
    'Set a new password for',
    'your account',
    'New Password',
    'Enter new password',
    'Confirm Password',
    'Confirm new password',
    'Resetting...',
    'Back to Login'
  ]);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { resetPassword, isLoading } = useAuthStore();

  const email = location.state?.email || searchParams.get('email') || '';
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) {
      toast.error(t('Session expired. Please start forgot password again.'));
      navigate('/forgot-password', { replace: true });
      return;
    }
    if (!formData.password || !formData.confirmPassword) {
      toast.error(t('Please fill both password fields.'));
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error(t('Passwords do not match.'));
      return;
    }

    try {
      await resetPassword(email, formData.password, formData.confirmPassword);
      toast.success(t('Password reset successful. Please login.'));
      navigate('/login', { replace: true });
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
                <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('Reset Password')}</h1>
                <p className="text-sm text-gray-600">
                  {t('Set a new password for')} <span className="font-medium text-gray-900">{email || t('your account')}</span>
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">{t('New Password')}</label>
                  <div className="relative">
                    <FiLock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                      placeholder={t('Enter new password')}
                      className="w-full pl-12 pr-12 py-3 rounded-xl border-2 border-gray-200 focus:border-primary-500 focus:outline-none transition-colors text-base"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">{t('Confirm Password')}</label>
                  <div className="relative">
                    <FiLock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                      placeholder={t('Confirm new password')}
                      className="w-full pl-12 pr-12 py-3 rounded-xl border-2 border-gray-200 focus:border-primary-500 focus:outline-none transition-colors text-base"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showConfirmPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-primary-500 hover:bg-primary-600 text-white py-3.5 rounded-xl font-semibold text-base transition-all duration-300 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? t('Resetting...') : t('Reset Password')}
                </button>
              </form>

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

export default MobileResetPassword;
