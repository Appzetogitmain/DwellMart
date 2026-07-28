import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { FiMail, FiLock, FiEye, FiEyeOff, FiArrowLeft } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../../shared/store/authStore';
import { useCartStore } from '../../../shared/store/useStore';
import { useWishlistStore } from '../../../shared/store/wishlistStore';
import {
  clearPostLoginRedirect,
  consumePostLoginAction,
  getPostLoginRedirect,
} from '../../../shared/utils/postLoginAction';
import { isValidEmail } from '../../../shared/utils/helpers';
import toast from 'react-hot-toast';
import MobileLayout from '../components/Layout/MobileLayout';
import PageTransition from '../../../shared/components/PageTransition';
import { usePageTranslation } from '../../../hooks/usePageTranslation';
import { loginLogo } from '../../../shared/utils/imagePaths';

const MobileLogin = () => {
  const { getTranslatedText: t } = usePageTranslation([
    'Back',
    'Welcome Back',
    'Login to access your account',
    'Email Address',
    'your.email@example.com',
    'Email is required',
    'Please enter a valid email',
    'Password',
    'Enter your password',
    'Password is required',
    'Password must be at least 6 characters',
    'Remember me',
    'Forget password?',
    'Logging in...',
    'Log In',
    "Don't have an account?",
    'Sign Up',
    'Login successful!',
    'Login failed. Please try again.',
    'Please verify your email first.',
    'Invalid email or password.',
    'Your account has been deactivated.'
  ]);
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, touchedFields },
  } = useForm({
    mode: 'onChange',
  });

  // Reset loading state on mount to prevent stuck loading states
  useEffect(() => {
    useAuthStore.setState({ isLoading: false });
  }, []);

  const storedFrom = getPostLoginRedirect();
  const from = location.state?.from?.pathname || storedFrom || '/home';

  const replayPendingAction = () => {
    const action = consumePostLoginAction();
    if (!action?.type) return;

    if (action.type === 'cart:add' && action.payload) {
      useCartStore.getState().addItem(action.payload);
      return;
    }

    if (action.type === 'wishlist:add' && action.payload) {
      useWishlistStore.getState().addItem(action.payload);
    }
  };

  const onSubmit = async (data) => {
    try {
      await login(data.email, data.password, rememberMe);
      replayPendingAction();
      toast.success(t('Login successful!'));
      clearPostLoginRedirect();
      navigate(from === '/login' ? '/home' : from, { replace: true });
    } catch (error) {
      const backendMessage = error?.response?.data?.message || error?.message || '';
      const normalized = String(backendMessage).toLowerCase();

      if (
        normalized.includes('email not verified') ||
        normalized.includes('verify your email')
      ) {
        toast.error(t('Please verify your email first.'));
        navigate('/verification', {
          state: { email: String(data.email || '').trim().toLowerCase() },
          replace: true,
        });
        return;
      }

      if (normalized.includes('invalid email or password')) {
        toast.error(t('Invalid email or password.'));
      } else if (normalized.includes('deactivated')) {
        toast.error(t('Your account has been deactivated.'));
      } else {
        toast.error(backendMessage || t('Login failed. Please try again.'));
      }
    }
  };

  return (
    <PageTransition>
      <MobileLayout showBottomNav={false} showCartBar={false}>
        <div className="min-h-[85vh] w-full flex flex-col justify-center items-center px-4 py-6 sm:py-12 bg-gradient-to-b from-gray-50/50 via-white to-gray-50">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-md"
          >
            {/* Main Card */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-[0_10px_40px_rgba(0,0,0,0.04)] border border-gray-100 relative">
              
              {/* Back Button */}
              <button
                onClick={() => navigate(-1)}
                className="mb-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-all text-xs font-semibold border border-gray-200/80"
              >
                <FiArrowLeft className="text-sm" />
                <span>{t('Back')}</span>
              </button>

              {/* Logo & Header */}
              <div className="text-center mb-6 sm:mb-8">
                <div className="flex justify-center mb-4">
                  <div className="bg-[#0B132A] px-5 py-3 rounded-2xl border border-amber-400/20 shadow-md inline-flex items-center justify-center">
                    <img
                      src={loginLogo}
                      alt="DwellMart Logo"
                      className="h-10 sm:h-12 w-auto object-contain drop-shadow-md"
                    />
                  </div>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight mb-1">
                  {t('Welcome Back')}
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 font-medium">
                  {t('Login to access your account')}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-5">
                {/* Email Address */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    {t('Email Address')}
                  </label>
                  <div className="relative">
                    <FiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-base" />
                    <input
                      type="email"
                      {...register('email', {
                        required: t('Email is required'),
                        validate: (value) =>
                          !value || isValidEmail(value) || t('Please enter a valid email'),
                      })}
                      className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                        errors.email
                          ? 'border-red-300 bg-red-50/20 focus:border-red-500'
                          : 'border-gray-200 bg-gray-50/40 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                      } outline-none`}
                      placeholder={t('your.email@example.com')}
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1 text-xs text-red-500 font-medium">{errors.email.message}</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    {t('Password')}
                  </label>
                  <div className="relative">
                    <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-base" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      {...register('password', {
                        required: t('Password is required'),
                        minLength: {
                          value: 6,
                          message: t('Password must be at least 6 characters'),
                        },
                      })}
                      className={`w-full pl-10 pr-11 py-3 rounded-xl border text-sm font-medium transition-all ${
                        errors.password
                          ? 'border-red-300 bg-red-50/20 focus:border-red-500'
                          : 'border-gray-200 bg-gray-50/40 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                      } outline-none`}
                      placeholder={t('Enter your password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                    >
                      {showPassword ? <FiEyeOff className="text-base" /> : <FiEye className="text-base" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="mt-1 text-xs text-red-500 font-medium">{errors.password.message}</p>
                  )}
                </div>

                {/* Remember Me & Forgot Password */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500 accent-emerald-600"
                    />
                    <span className="ml-2 text-xs text-gray-600 font-medium">{t('Remember me')}</span>
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-bold hover:underline transition-all"
                  >
                    {t('Forget password?')}
                  </Link>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 rounded-xl font-bold text-sm text-white gradient-green shadow-md hover:shadow-emerald-200 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed mt-2 active:scale-[0.99]"
                >
                  {isLoading ? t('Logging in...') : t('Log In')}
                </button>
              </form>

              {/* Sign Up Link */}
              <div className="mt-6 text-center pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 font-medium">
                  {t("Don't have an account?")}{' '}
                  <Link
                    to="/register"
                    className="text-emerald-600 hover:text-emerald-700 font-bold hover:underline transition-all"
                  >
                    {t('Sign Up')}
                  </Link>
                </p>
              </div>

            </div>
          </motion.div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileLogin;
