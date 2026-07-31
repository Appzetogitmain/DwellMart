import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { FiMail, FiLock, FiEye, FiEyeOff, FiUser, FiPhone, FiArrowLeft } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../../shared/store/authStore';
import { isValidEmail, isValidPhone } from '../../../shared/utils/helpers';
import toast from 'react-hot-toast';
import MobileLayout from "../components/Layout/MobileLayout";
import PageTransition from '../../../shared/components/PageTransition';
import { usePageTranslation } from '../../../hooks/usePageTranslation';
import { loginLogo } from '../../../shared/utils/imagePaths';
import { Input, Button, Card } from '../../../shared/components/ui';

const COUNTRY_PHONE_CONFIGS = {
  '+91': {
    code: '+91',
    label: '🇮🇳 +91',
    digits: 10,
    placeholder: 'Enter 10-digit number',
    message: 'India phone number must be 10 digits starting with 6-9',
  },
  '+1': {
    code: '+1',
    label: '🇺🇸 +1',
    digits: 10,
    placeholder: 'Enter 10-digit number',
    message: 'USA/Canada phone number must be 10 digits starting with 2-9',
  },
  '+880': {
    code: '+880',
    label: '🇧🇩 +880',
    digits: 10,
    placeholder: 'Enter 10-digit number (e.g. 1712345678)',
    message: 'Bangladesh phone number must be 10 digits starting with 13-19',
  },
  '+44': {
    code: '+44',
    label: '🇬🇧 +44',
    digits: 10,
    placeholder: 'Enter 10-digit mobile number',
    message: 'UK mobile number must be 10 digits starting with 7',
  },
  '+971': {
    code: '+971',
    label: '🇦🇪 +971',
    digits: 9,
    placeholder: 'Enter 9-digit number',
    message: 'UAE mobile number must be 9 digits starting with 5',
  },
  '+966': {
    code: '+966',
    label: '🇸🇦 +966',
    digits: 9,
    placeholder: 'Enter 9-digit number',
    message: 'Saudi phone number must be 9 digits starting with 5',
  },
};

const MobileRegister = () => {
  const { getTranslatedText: t } = usePageTranslation([
    'Back',
    'Get Started Now',
    'Create an account to explore our platform',
    'Sign Up',
    'Log In',
    'First Name',
    'Last Name',
    'Email Address',
    'Phone Number',
    'Set Password',
    'Creating Account...',
    'Already have an account?',
    'Sign In',
    'First name is required',
    'First name must be at least 2 characters',
    'Last name is required',
    'Last name must be at least 2 characters',
    'Numbers and special characters are not allowed',
    'Email is required',
    'Please enter a valid email',
    'Phone number is required',
    'Password is required',
    'Password must be at least 6 characters',
    'Registration successful!',
    'Registration failed. Please try again.',
    'Raj',
    'Sarkar',
    'your.email@example.com',
    'Create a password'
  ]);

  const navigate = useNavigate();
  const { register: registerUser, isLoading } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    mode: 'onChange',
    defaultValues: {
      countryCode: '+91',
      phone: '',
    },
  });

  const selectedCountryCode = watch('countryCode') || '+91';
  const countryConfig = COUNTRY_PHONE_CONFIGS[selectedCountryCode] || COUNTRY_PHONE_CONFIGS['+91'];

  const onSubmit = async (data) => {
    try {
      const fullName = `${data.firstName} ${data.lastName}`;
      const phone = `${data.countryCode}${data.phone}`;

      await registerUser(fullName, data.email, data.password, phone);
      toast.success(t('Registration successful!'));
      navigate('/verification', { state: { email: data.email } });
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message;
      toast.error(errorMessage || t('Registration failed. Please try again.'));
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
                  <div className="bg-surface-header px-5 py-3 rounded-2xl border border-border shadow-md inline-flex items-center justify-center">
                    <img
                      src={loginLogo}
                      alt="DwellMart Logo"
                      className="h-10 sm:h-12 w-auto object-contain drop-shadow-md"
                    />
                  </div>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-textColor-primary tracking-tight mb-1">
                  {t('Get Started Now')}
                </h1>
                <p className="text-xs sm:text-sm text-textColor-muted font-medium">
                  {t('Create an account to explore our platform')}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                
                {/* First Name & Last Name Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {/* First Name */}
                  <Input
                    label={t('First Name')}
                    placeholder={t('Raj')}
                    leftIcon={<FiUser />}
                    error={errors.firstName?.message}
                    {...register('firstName', {
                      required: t('First name is required'),
                      minLength: {
                        value: 2,
                        message: t('First name must be at least 2 characters'),
                      },
                      pattern: {
                        value: /^[a-zA-Z\s\'-]+$/,
                        message: t('Numbers and special characters are not allowed'),
                      },
                    })}
                  />

                  {/* Last Name */}
                  <Input
                    label={t('Last Name')}
                    placeholder={t('Sarkar')}
                    leftIcon={<FiUser />}
                    error={errors.lastName?.message}
                    {...register('lastName', {
                      required: t('Last name is required'),
                      minLength: {
                        value: 2,
                        message: t('Last name must be at least 2 characters'),
                      },
                      pattern: {
                        value: /^[a-zA-Z\s\'-]+$/,
                        message: t('Numbers and special characters are not allowed'),
                      },
                    })}
                  />
                </div>

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

                {/* Phone Number */}
                <div>
                  <label className="block text-xs font-bold text-textColor-secondary uppercase tracking-wider mb-1.5">
                    {t('Phone Number')}
                  </label>
                  <div className="flex gap-2">
                    <select
                      {...register('countryCode', {
                        required: true,
                        onChange: (e) => {
                          const newCode = e.target.value;
                          const config = COUNTRY_PHONE_CONFIGS[newCode] || COUNTRY_PHONE_CONFIGS['+91'];
                          const currentPhone = watch('phone') || '';
                          const sanitized = currentPhone.slice(0, config.digits);
                          setValue('phone', sanitized, { shouldValidate: true });
                        },
                      })}
                      className="w-28 px-2 py-3 rounded-xl border border-borderToken-default bg-surface-card text-textColor-primary focus:border-brand-primary text-xs font-bold outline-none cursor-pointer"
                    >
                      {Object.values(COUNTRY_PHONE_CONFIGS).map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <div className="relative flex-1">
                      <FiPhone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-textColor-muted text-base" />
                      <input
                        type="tel"
                        maxLength={countryConfig.digits}
                        {...register('phone', {
                          required: t('Phone number is required'),
                          validate: (value) => {
                            if (!value) return true;
                            const clean = value.replace(/\D/g, '');
                            if (clean.length !== countryConfig.digits) {
                              return t(`Phone number for ${selectedCountryCode} must be exactly ${countryConfig.digits} digits`);
                            }
                            return isValidPhone(clean, selectedCountryCode) || t(countryConfig.message);
                          },
                        })}
                        onInput={(e) => {
                          e.target.value = e.target.value.replace(/\D/g, '').slice(0, countryConfig.digits);
                        }}
                        onKeyDown={(e) => {
                          const allowedKeys = ['Backspace', 'Tab', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
                          if (allowedKeys.includes(e.key) || e.ctrlKey || e.metaKey) return;
                          if (!/^[0-9]$/.test(e.key)) {
                            e.preventDefault();
                          }
                        }}
                        className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                          errors.phone
                            ? 'border-status-error bg-status-error/10 focus:border-status-error'
                            : 'border-borderToken-default bg-surface-card text-textColor-primary focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20'
                        } outline-none`}
                        placeholder={t(countryConfig.placeholder)}
                      />
                    </div>
                  </div>
                  {errors.phone && (
                    <p className="mt-1 text-xs text-status-error font-medium">{errors.phone.message}</p>
                  )}
                </div>

                {/* Password */}
                <Input
                  label={t('Set Password')}
                  type="password"
                  placeholder={t('Create a password')}
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

                {/* Submit Button */}
                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  isLoading={isLoading}
                  className="mt-4"
                >
                  {t('Sign Up')}
                </Button>
              </form>

              {/* Sign In Link */}
              <div className="mt-6 text-center pt-4 border-t border-borderToken-light">
                <p className="text-xs text-textColor-muted font-medium">
                  {t('Already have an account?')}{' '}
                  <Link
                    to="/login"
                    className="text-brand-primary font-bold hover:underline transition-all"
                  >
                    {t('Sign In')}
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

export default MobileRegister;
