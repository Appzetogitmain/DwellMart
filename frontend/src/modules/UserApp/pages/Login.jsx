import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { FiMail, FiLock, FiEye, FiEyeOff, FiPhone, FiArrowLeft } from 'react-icons/fi';
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
    formState: { errors },
  } = useForm();

  // Reset loading state on mount to prevent any 'auto-trigger' or stuck state
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
    console.log('Login onSubmit triggered', data);
    try {
      await login(data.email, data.password, rememberMe);
      replayPendingAction();
      toast.success(t('Login successful!'));
      clearPostLoginRedirect();
      navigate(from === '/login' ? '/home' : from, { replace: true });
    } catch (error) {
      // Extract backend message
      const backendMessage = error?.response?.data?.message || error?.message || '';
      const normalized = String(backendMessage).toLowerCase();

      // Check for verification needed
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

      // Handle common error cases with translations
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
        <div className="w-full min-h-screen flex items-start justify-center px-4 pt-6 pb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md"
          >
            <div className="bg-white rounded-2xl p-6 shadow-sm relative">
              {/* Back Button */}
              <button
                onClick={() => navigate(-1)}
                className="mb-2 -ml-2 inline-flex items-center gap-2 text-gray-400 hover:text-primary-600 transition-all group px-2 py-1 rounded-lg hover:bg-primary-50/50"
              >
                <FiArrowLeft className="text-xl group-hover:-translate-x-1 transition-transform" />
                <span className="text-sm font-semibold tracking-wide">{t('Back')}</span>
              </button>

              {/* Header */}
              <div className="text-center mb-8">
                <div className="flex justify-center mb-4">
                  <div className="bg-slate-950 px-6 py-3.5 rounded-2xl border border-amber-500/30 shadow-xl inline-flex items-center justify-center">
                    <img
                      src={loginLogo}
                      alt="DwellMart Logo"
                      className="h-14 sm:h-16 w-auto object-contain drop-shadow-md"
                    />
                  </div>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('Welcome Back')}</h1>
                <p className="text-sm text-gray-600">{t('Login to access your account')}</p>
              </div>

              {/* Login Form */}
               <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t('Email Address')}
                  </label>
                  <div className="relative">
                    <FiMail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      {...register('email', {
                        required: t('Email is required'),
                        validate: (value) =>
                          !value || isValidEmail(value) || t('Please enter a valid email'),
                      })}
                      className={`w-full pl-12 pr-4 py-3 rounded-xl border-2 ${errors.email
                          ? 'border-red-300 focus:border-red-500'
                          : 'border-gray-200 focus:border-primary-500'
                        } focus:outline-none transition-colors text-base`}
                      placeholder={t('your.email@example.com')}
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                  )}
                </div>

                {/* Password */}
                 <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t('Password')}
                  </label>
                  <div className="relative">
                    <FiLock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      {...register('password', {
                        required: t('Password is required'),
                        minLength: {
                          value: 6,
                          message: t('Password must be at least 6 characters'),
                        },
                      })}
                      className={`w-full pl-12 pr-12 py-3 rounded-xl border-2 ${errors.password
                          ? 'border-red-300 focus:border-red-500'
                          : 'border-gray-200 focus:border-primary-500'
                        } focus:outline-none transition-colors text-base`}
                      placeholder={t('Enter your password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
                  )}
                </div>

                {/* Remember Me & Forgot Password */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">{t('Remember me')}</span>
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    {t('Forget password?')}
                  </Link>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-primary-500 hover:bg-primary-600 text-white py-3.5 rounded-xl font-semibold text-base transition-all duration-300 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? t('Logging in...') : t('Log In')}
                </button>
              </form>

              {/* Sign Up Link */}
              <div className="mt-6 text-center">
                <p className="text-sm text-gray-600">
                  {t("Don't have an account?")}{' '}
                  <Link
                    to="/register"
                    className="text-primary-600 hover:text-primary-700 font-semibold"
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
