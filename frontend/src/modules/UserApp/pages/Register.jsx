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

const MobileRegister = () => {
  const { getTranslatedText: t } = usePageTranslation([
    'Back',
    'Get Started Now',
    'Create an account or log in to explore about our app',
    'Sign Up',
    'Log In',
    'First Name',
    'Last Name',
    'EmailAddress',
    'Email',
    'Phone Number',
    'Set Password',
    'Creating Account...',
    'Already have an account?',
    'Sign In',
    'First name is required',
    'First name must be at least 2 characters',
    'Last name is required',
    'Last name must be at least 2 characters',
    'Email is required',
    'Please enter a valid email',
    'Phone number is required',
    'Please enter a valid phone number',
    'Password is required',
    'Password must be at least 6 characters',
    'Registration successful!',
    'Registration failed. Please try again.',
    'Raj',
    'Sarkar',
    'sarkarraj0766@gmail.com',
    '4547260592',
    'Create a password'
  ]);
  const navigate = useNavigate();
  const { register: registerUser, isLoading } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [formMode, setFormMode] = useState('signup'); // 'signup' or 'login'

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm();

  const password = watch('password');

  const handleModeChange = (mode) => {
    setFormMode(mode);
    if (mode === 'login') {
      navigate('/login');
    }
  };

  const onSubmit = async (data) => {
    try {
      // Combine first name and last name
      const fullName = `${data.firstName} ${data.lastName}`;
      // Backend stores a normalized 10-digit phone value.
      const phone = data.phone;

      await registerUser(fullName, data.email, data.password, phone);
      toast.success(t('Registration successful!'));
      // Navigate to verification page
      navigate('/verification', { state: { email: data.email } });
    } catch (error) {
      toast.error(error.message || t('Registration failed. Please try again.'));
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
                <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('Get Started Now')}</h1>
                <p className="text-sm text-gray-600">{t('Create an account or log in to explore about our app')}</p>
              </div>

              {/* Sign Up / Log In Toggle */}
              <div className="mb-6">
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => handleModeChange('signup')}
                    className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all duration-200 ${formMode === 'signup'
                        ? 'bg-primary-500 text-white shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    {t('Sign Up')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeChange('login')}
                    className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all duration-200 ${formMode === 'login'
                        ? 'bg-primary-500 text-white shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    {t('Log In')}
                  </button>
                </div>
              </div>

              {/* Register Form */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {/* First Name */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t('First Name')}
                  </label>
                  <div className="relative">
                    <FiUser className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      {...register('firstName', {
                        required: t('First name is required'),
                        minLength: {
                          value: 2,
                          message: t('First name must be at least 2 characters'),
                        },
                      })}
                      className={`w-full pl-12 pr-4 py-3 rounded-xl border-2 ${errors.firstName
                          ? 'border-red-300 focus:border-red-500'
                          : 'border-gray-200 focus:border-primary-500'
                        } focus:outline-none transition-colors text-base`}
                      placeholder={t('Raj')}
                    />
                  </div>
                  {errors.firstName && (
                    <p className="mt-1 text-sm text-red-600">{errors.firstName.message}</p>
                  )}
                </div>

                {/* Last Name */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t('Last Name')}
                  </label>
                  <div className="relative">
                    <FiUser className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      {...register('lastName', {
                        required: t('Last name is required'),
                        minLength: {
                          value: 2,
                          message: t('Last name must be at least 2 characters'),
                        },
                      })}
                      className={`w-full pl-12 pr-4 py-3 rounded-xl border-2 ${errors.lastName
                          ? 'border-red-300 focus:border-red-500'
                          : 'border-gray-200 focus:border-primary-500'
                        } focus:outline-none transition-colors text-base`}
                      placeholder={t('Sarkar')}
                    />
                  </div>
                  {errors.lastName && (
                    <p className="mt-1 text-sm text-red-600">{errors.lastName.message}</p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t('Email')}
                  </label>
                  <div className="relative">
                    <FiMail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      {...register('email', {
                        required: t('Email is required'),
                        validate: (value) =>
                          isValidEmail(value) || t('Please enter a valid email'),
                      })}
                      className={`w-full pl-12 pr-4 py-3 rounded-xl border-2 ${errors.email
                          ? 'border-red-300 focus:border-red-500'
                          : 'border-gray-200 focus:border-primary-500'
                        } focus:outline-none transition-colors text-base`}
                      placeholder={t('sarkarraj0766@gmail.com')}
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t('Phone Number')}
                  </label>
                  <div className="flex gap-2">
                    <select
                      {...register('countryCode', { required: true })}
                      className="w-24 px-3 py-3 rounded-xl border-2 border-gray-200 focus:border-primary-500 focus:outline-none text-sm"
                    >
                      <option value="+880">+880</option>
                      <option value="+1">+1</option>
                      <option value="+91">+91</option>
                      <option value="+44">+44</option>
                    </select>
                    <div className="relative flex-1">
                      <FiPhone className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                      <input
                        type="tel"
                        {...register('phone', {
                          required: t('Phone number is required'),
                          validate: (value) =>
                            isValidPhone(value) || t('Please enter a valid phone number'),
                        })}
                        className={`w-full pl-12 pr-4 py-3 rounded-xl border-2 ${errors.phone
                            ? 'border-red-300 focus:border-red-500'
                            : 'border-gray-200 focus:border-primary-500'
                          } focus:outline-none transition-colors text-base`}
                        placeholder={t('4547260592')}
                      />
                    </div>
                  </div>
                  {errors.phone && (
                    <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t('Set Password')}
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
                      placeholder={t('Create a password')}
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

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-primary-500 hover:bg-primary-600 text-white py-3.5 rounded-xl font-semibold text-base transition-all duration-300 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? t('Creating Account...') : t('Sign Up')}
                </button>
              </form>

              {/* Sign In Link */}
              <div className="mt-6 text-center">
                <p className="text-sm text-gray-600">
                  {t('Already have an account?')}{' '}
                  <Link
                    to="/login"
                    className="text-primary-600 hover:text-primary-700 font-semibold"
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
