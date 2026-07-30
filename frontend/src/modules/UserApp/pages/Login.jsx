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
import { Input, Button, Card } from '../../../shared/components/ui';

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
      <div className="min-h-[85vh] w-full flex flex-col justify-center items-center px-4 py-6 sm:py-12 bg-surface-background">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          {/* Main Card */}
          <Card variant="elevated" padding="lg" className="relative">
            {/* Back Button */}
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<FiArrowLeft />}
              onClick={() => navigate(-1)}
              className="mb-4"
            >
              {t('Back')}
            </Button>

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
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-1 text-textColor-primary">
                {t('Welcome Back')}
              </h1>
              <p className="text-xs sm:text-sm text-textColor-muted font-medium">
                {t('Login to access your account')}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-5">
              {/* Email Address */}
              <Input
                label={t('Email Address')}
                type="email"
                placeholder={t('your.email@example.com')}
                leftIcon={<FiMail />}
                error={errors.email?.message}
                {...register('email', {
                  required: t('Email is required'),
                  validate: (value) =>
                    !value || isValidEmail(value) || t('Please enter a valid email'),
                })}
              />

              {/* Password */}
              <Input
                label={t('Password')}
                type="password"
                placeholder={t('Enter your password')}
                leftIcon={<FiLock />}
                error={errors.password?.message}
                {...register('password', {
                  required: t('Password is required'),
                  minLength: {
                    value: 6,
                    message: t('Password must be at least 6 characters'),
                  },
                })}
              />

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 text-brand-primary border-borderToken-default rounded focus:ring-brand-primary accent-brand-primary"
                  />
                  <span className="ml-2 text-xs text-textColor-secondary font-medium">{t('Remember me')}</span>
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs text-brand-primary hover:underline font-bold transition-all"
                >
                  {t('Forget password?')}
                </Link>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                variant="primary"
                fullWidth
                isLoading={isLoading}
                className="mt-2"
              >
                {t('Log In')}
              </Button>
            </form>

            {/* Sign Up Link */}
            <div className="mt-6 text-center pt-4 border-t border-borderToken-light">
              <p className="text-xs text-textColor-muted font-medium">
                {t("Don't have an account?")}{' '}
                <Link
                  to="/register"
                  className="text-brand-primary font-bold hover:underline transition-all"
                >
                  {t('Sign Up')}
                </Link>
              </p>
            </div>

          </Card>
        </motion.div>
      </div>
    </MobileLayout>
    </PageTransition>
  );
};

export default MobileLogin;
