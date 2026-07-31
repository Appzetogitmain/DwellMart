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
        <div className="w-full min-h-screen flex items-center justify-center px-4 py-8 bg-surface-muted">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md"
          >
            <div className="bg-surface rounded-2xl p-6 shadow-xl border border-border">
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-content mb-2">{t('Reset Password')}</h1>
                <p className="text-sm text-content-secondary">
                  {t('Set a new password for')} <span className="font-medium text-content">{email || t('your account')}</span>
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-content-secondary mb-2">{t('New Password')}</label>
                  <div className="relative">
                    <FiLock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-content-muted" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                      placeholder={t('Enter new password')}
                      className="w-full pl-12 pr-12 py-3 rounded-xl border-2 border-border bg-surface text-content focus:border-brand-primary focus:outline-none transition-colors text-base"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-content-muted hover:text-content-secondary transition-colors"
                    >
                      {showPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-content-secondary mb-2">{t('Confirm Password')}</label>
                  <div className="relative">
                    <FiLock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-content-muted" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                      placeholder={t('Confirm new password')}
                      className="w-full pl-12 pr-12 py-3 rounded-xl border-2 border-border bg-surface text-content focus:border-brand-primary focus:outline-none transition-colors text-base"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-content-muted hover:text-content-secondary transition-colors"
                    >
                      {showConfirmPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-brand-primary hover:bg-brand-primaryHover text-black py-3.5 rounded-xl font-semibold text-base transition-all duration-300 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? t('Resetting...') : t('Reset Password')}
                </button>
              </form>

              <div className="text-center pt-6">
                <Link to="/login" className="inline-flex items-center gap-2 text-sm text-content-secondary hover:text-content font-medium">
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
