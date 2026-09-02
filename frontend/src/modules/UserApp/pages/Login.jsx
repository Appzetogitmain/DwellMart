import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { FiMail, FiLock, FiEye, FiEyeOff, FiArrowLeft, FiUser, FiArrowRight } from 'react-icons/fi';
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
    'Customer Portal',
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
                      alt="Dwell Mart Logo"
                      className="h-12 sm:h-14 w-auto object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                    />
                  </div>
                </motion.div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-3">
                  <FiUser className="text-xs" />
                  <span>{t('Customer Portal')}</span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-1.5">
                  {t('Welcome Back')}
                </h1>
                <p className="text-slate-400 text-xs sm:text-sm">
                  {t('Login to access your account')}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {/* Email Field */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                    {t('Email Address')}
                  </label>
                  <div className="relative">
                    <FiMail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-amber-500/80 text-lg pointer-events-none" />
                    <input
                      type="email"
                      placeholder={t('your.email@example.com')}
                      className={`w-full pl-11 pr-4 py-3 bg-slate-950/80 border ${
                        errors.email ? 'border-red-500 focus:border-red-500' : 'border-slate-700/80 focus:border-amber-500'
                      } rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
                        errors.email ? 'focus:ring-red-500/20' : 'focus:ring-amber-500/20'
                      } transition-all font-medium text-sm hover:border-slate-600`}
                      {...register('email', {
                        required: t('Email is required'),
                        validate: (value) =>
                          !value || isValidEmail(value) || t('Please enter a valid email'),
                      })}
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1.5 text-xs text-red-400 font-medium">{errors.email.message}</p>
                  )}
                </div>

                {/* Password Field */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                    {t('Password')}
                  </label>
                  <div className="relative">
                    <FiLock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-amber-500/80 text-lg pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder={t('Enter your password')}
                      className={`w-full pl-11 pr-11 py-3 bg-slate-950/80 border ${
                        errors.password ? 'border-red-500 focus:border-red-500' : 'border-slate-700/80 focus:border-amber-500'
                      } rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
                        errors.password ? 'focus:ring-red-500/20' : 'focus:ring-amber-500/20'
                      } transition-all font-medium text-sm hover:border-slate-600`}
                      {...register('password', {
                        required: t('Password is required'),
                        minLength: {
                          value: 6,
                          message: t('Password must be at least 6 characters'),
                        },
                      })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-amber-400 transition-colors p-1"
                    >
                      {showPassword ? <FiEyeOff /> : <FiEye />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="mt-1.5 text-xs text-red-400 font-medium">{errors.password.message}</p>
                  )}
                </div>

                {/* Remember Me & Forgot Password */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500/30 focus:ring-offset-slate-900 cursor-pointer accent-amber-500"
                    />
                    <span className="text-xs sm:text-sm text-slate-300 group-hover:text-white transition-colors">
                      {t('Remember me')}
                    </span>
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-xs sm:text-sm text-amber-400 hover:text-amber-300 font-medium transition-colors"
                  >
                    {t('Forget password?')}
                  </Link>
                </div>

                {/* Submit Button */}
                <motion.button
                  type="submit"
                  disabled={isLoading}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:via-yellow-400 hover:to-amber-500 text-slate-950 rounded-xl font-bold text-sm sm:text-base shadow-[0_4px_20px_rgba(212,175,55,0.3)] hover:shadow-[0_6px_25px_rgba(212,175,55,0.45)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group mt-2"
                >
                  {isLoading ? (
                    <span>{t('Logging in...')}</span>
                  ) : (
                    <>
                      <span>{t('Log In')}</span>
                      <FiArrowRight className="text-lg group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </motion.button>

                {/* Sign Up Link */}
                <div className="text-center pt-4 border-t border-slate-800/80 mt-6">
                  <p className="text-xs sm:text-sm text-slate-400">
                    {t("Don't have an account?")}{' '}
                    <Link
                      to="/register"
                      className="text-amber-400 hover:text-amber-300 font-bold transition-colors underline underline-offset-4 decoration-amber-500/40 hover:decoration-amber-400"
                    >
                      {t('Sign Up')}
                    </Link>
                  </p>
                </div>
              </form>
            </div>
          </motion.div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileLogin;

