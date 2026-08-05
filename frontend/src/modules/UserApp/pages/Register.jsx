import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { FiMail, FiLock, FiEye, FiEyeOff, FiUser, FiPhone, FiArrowLeft, FiUserCheck, FiArrowRight } from 'react-icons/fi';
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
    'Customer Registration',
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
            className="w-full max-w-md relative z-10 my-6 sm:my-10"
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

              {/* Logo & Header */}
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
                      alt="DwellMart Logo"
                      className="h-12 sm:h-14 w-auto object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                    />
                  </div>
                </motion.div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-3">
                  <FiUserCheck className="text-xs" />
                  <span>{t('Customer Registration')}</span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-1.5">
                  {t('Get Started Now')}
                </h1>
                <p className="text-slate-400 text-xs sm:text-sm">
                  {t('Create an account to explore our platform')}
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                
                {/* First Name & Last Name Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {/* First Name */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                      {t('First Name')}
                    </label>
                    <div className="relative">
                      <FiUser className="absolute left-4 top-1/2 transform -translate-y-1/2 text-amber-500/80 text-lg pointer-events-none" />
                      <input
                        type="text"
                        placeholder={t('Raj')}
                        className={`w-full pl-11 pr-4 py-3 bg-slate-950/80 border ${
                          errors.firstName ? 'border-red-500 focus:border-red-500' : 'border-slate-700/80 focus:border-amber-500'
                        } rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
                          errors.firstName ? 'focus:ring-red-500/20' : 'focus:ring-amber-500/20'
                        } transition-all font-medium text-sm hover:border-slate-600`}
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
                    </div>
                    {errors.firstName && (
                      <p className="mt-1.5 text-xs text-red-400 font-medium">{errors.firstName.message}</p>
                    )}
                  </div>

                  {/* Last Name */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                      {t('Last Name')}
                    </label>
                    <div className="relative">
                      <FiUser className="absolute left-4 top-1/2 transform -translate-y-1/2 text-amber-500/80 text-lg pointer-events-none" />
                      <input
                        type="text"
                        placeholder={t('Sarkar')}
                        className={`w-full pl-11 pr-4 py-3 bg-slate-950/80 border ${
                          errors.lastName ? 'border-red-500 focus:border-red-500' : 'border-slate-700/80 focus:border-amber-500'
                        } rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
                          errors.lastName ? 'focus:ring-red-500/20' : 'focus:ring-amber-500/20'
                        } transition-all font-medium text-sm hover:border-slate-600`}
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
                    {errors.lastName && (
                      <p className="mt-1.5 text-xs text-red-400 font-medium">{errors.lastName.message}</p>
                    )}
                  </div>
                </div>

                {/* Email Address */}
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

                {/* Phone Number */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
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
                      className="w-28 px-3 py-3 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-xs font-bold outline-none cursor-pointer transition-all hover:border-slate-600"
                    >
                      {Object.values(COUNTRY_PHONE_CONFIGS).map((item) => (
                        <option key={item.code} value={item.code} className="bg-slate-900 text-white">
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <div className="relative flex-1">
                      <FiPhone className="absolute left-4 top-1/2 transform -translate-y-1/2 text-amber-500/80 text-lg pointer-events-none" />
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
                        className={`w-full pl-11 pr-4 py-3 bg-slate-950/80 border ${
                          errors.phone ? 'border-red-500 focus:border-red-500' : 'border-slate-700/80 focus:border-amber-500'
                        } rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
                          errors.phone ? 'focus:ring-red-500/20' : 'focus:ring-amber-500/20'
                        } transition-all font-medium text-sm hover:border-slate-600`}
                        placeholder={t(countryConfig.placeholder)}
                      />
                    </div>
                  </div>
                  {errors.phone && (
                    <p className="mt-1.5 text-xs text-red-400 font-medium">{errors.phone.message}</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                    {t('Set Password')}
                  </label>
                  <div className="relative">
                    <FiLock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-amber-500/80 text-lg pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder={t('Create a password')}
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

                {/* Submit Button */}
                <motion.button
                  type="submit"
                  disabled={isLoading}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:via-yellow-400 hover:to-amber-500 text-slate-950 rounded-xl font-bold text-sm sm:text-base shadow-[0_4px_20px_rgba(212,175,55,0.3)] hover:shadow-[0_6px_25px_rgba(212,175,55,0.45)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group mt-2"
                >
                  {isLoading ? (
                    <span>{t('Creating Account...')}</span>
                  ) : (
                    <>
                      <span>{t('Sign Up')}</span>
                      <FiArrowRight className="text-lg group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </motion.button>
              </form>

              {/* Sign In Link */}
              <div className="text-center pt-4 border-t border-slate-800/80 mt-6">
                <p className="text-xs sm:text-sm text-slate-400">
                  {t('Already have an account?')}{' '}
                  <Link
                    to="/login"
                    className="text-amber-400 hover:text-amber-300 font-bold transition-colors underline underline-offset-4 decoration-amber-500/40 hover:decoration-amber-400"
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

