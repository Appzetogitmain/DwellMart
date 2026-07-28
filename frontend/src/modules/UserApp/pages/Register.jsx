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
      toast.error(error.message || t('Registration failed. Please try again.'));
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
                  {t('Get Started Now')}
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 font-medium">
                  {t('Create an account to explore our platform')}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                
                {/* First Name & Last Name Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {/* First Name */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                      {t('First Name')}
                    </label>
                    <div className="relative">
                      <FiUser className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-base" />
                      <input
                        type="text"
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
                        className={`w-full pl-10 pr-3 py-3 rounded-xl border text-sm font-medium transition-all ${
                          errors.firstName
                            ? 'border-red-300 bg-red-50/20 focus:border-red-500'
                            : 'border-gray-200 bg-gray-50/40 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                        } outline-none`}
                        placeholder={t('Raj')}
                      />
                    </div>
                    {errors.firstName && (
                      <p className="mt-1 text-xs text-red-500 font-medium">{errors.firstName.message}</p>
                    )}
                  </div>

                  {/* Last Name */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                      {t('Last Name')}
                    </label>
                    <div className="relative">
                      <FiUser className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-base" />
                      <input
                        type="text"
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
                        className={`w-full pl-10 pr-3 py-3 rounded-xl border text-sm font-medium transition-all ${
                          errors.lastName
                            ? 'border-red-300 bg-red-50/20 focus:border-red-500'
                            : 'border-gray-200 bg-gray-50/40 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                        } outline-none`}
                        placeholder={t('Sarkar')}
                      />
                    </div>
                    {errors.lastName && (
                      <p className="mt-1 text-xs text-red-500 font-medium">{errors.lastName.message}</p>
                    )}
                  </div>
                </div>

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

                {/* Phone Number */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
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
                      className="w-28 px-2 py-3 rounded-xl border border-gray-200 bg-gray-50/40 focus:bg-white focus:border-emerald-500 text-xs font-bold outline-none cursor-pointer"
                    >
                      {Object.values(COUNTRY_PHONE_CONFIGS).map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <div className="relative flex-1">
                      <FiPhone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-base" />
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
                            ? 'border-red-300 bg-red-50/20 focus:border-red-500'
                            : 'border-gray-200 bg-gray-50/40 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                        } outline-none`}
                        placeholder={t(countryConfig.placeholder)}
                      />
                    </div>
                  </div>
                  {errors.phone && (
                    <p className="mt-1 text-xs text-red-500 font-medium">{errors.phone.message}</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    {t('Set Password')}
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
                      placeholder={t('Create a password')}
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

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 rounded-xl font-bold text-sm text-white gradient-green shadow-md hover:shadow-emerald-200 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed mt-4 active:scale-[0.99]"
                >
                  {isLoading ? t('Creating Account...') : t('Sign Up')}
                </button>
              </form>

              {/* Sign In Link */}
              <div className="mt-6 text-center pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 font-medium">
                  {t('Already have an account?')}{' '}
                  <Link
                    to="/login"
                    className="text-emerald-600 hover:text-emerald-700 font-bold hover:underline transition-all"
                  >
                    {t('Sign In')}
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

export default MobileRegister;
