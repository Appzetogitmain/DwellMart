import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { FiUser, FiMail, FiPhone, FiLock, FiEye, FiEyeOff, FiSave, FiCamera, FiArrowLeft, FiPackage, FiMapPin, FiLogOut, FiChevronRight, FiBell } from 'react-icons/fi';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import MobileLayout from "../components/Layout/MobileLayout";
import { useAuthStore } from '../../../shared/store/authStore';
import { isValidEmail, isValidPhone } from '../../../shared/utils/helpers';
import toast from 'react-hot-toast';
import PageTransition from '../../../shared/components/PageTransition';
import PasswordStrengthMeter from '../components/Mobile/PasswordStrengthMeter';
import { useUserNotificationStore } from '../store/userNotificationStore';
import { usePageTranslation } from '../../../hooks/usePageTranslation';

const MobileProfile = () => {
  const { getTranslatedText: t } = usePageTranslation([
    'My Profile',
    'Manage your personal information and security settings',
    'My Account',
    'Personal Info',
    'Security',
    'Password',
    'View Profile',
    'Personal Information',
    'My Orders',
    'My Addresses',
    'Notifications',
    'Change Password',
    'Sign Out',
    'Profile Picture',
    'JPG, PNG or GIF. Max size 5MB',
    'Full Name',
    'Your full name',
    'Name is required',
    'Name must be at least 2 characters',
    'Email Address',
    'your.email@example.com',
    'Email is required',
    'Please enter a valid email',
    'Email cannot be changed from profile settings.',
    'Phone Number',
    '1234567890',
    'Please enter a valid phone number',
    'Saving...',
    'Save Changes',
    'Current Password',
    'Current password is required',
    'New Password',
    'New password is required',
    'Password must be at least 6 characters',
    'Confirm New Password',
    'Please confirm your password',
    'Passwords do not match',
    'Changing Password...',
    'Profile updated successfully!',
    'Failed to update profile',
    'Password changed successfully!',
    'Failed to change password',
    'Logged out successfully',
    'Only JPEG, PNG, WEBP and GIF images are allowed.',
    'Image size must be 5MB or less.',
    'Profile picture updated successfully!',
    'Failed to upload profile picture',
    'Account Settings',
    'Confirm Password'
  ]);
  const navigate = useNavigate();
  const { user, updateProfile, uploadProfileAvatar, changePassword, logout, isLoading } = useAuthStore();
  const avatarInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState('menu'); // 'menu', 'personal', 'password'
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false
  );
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const unreadNotificationCount = useUserNotificationStore((state) => state.unreadCount);
  const ensureNotificationHydrated = useUserNotificationStore((state) => state.ensureHydrated);

  const {
    register: registerPersonal,
    handleSubmit: handleSubmitPersonal,
    reset: resetPersonal,
    formState: { errors: personalErrors },
  } = useForm({
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
      phone: user?.phone || '',
    },
  });

  const {
    register: registerPassword,
    handleSubmit: handleSubmitPassword,
    watch,
    formState: { errors: passwordErrors },
    reset: resetPassword,
  } = useForm();

  const newPassword = watch('newPassword');

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isDesktop && activeTab === 'menu') {
      setActiveTab('personal');
    }
  }, [isDesktop, activeTab]);

  useEffect(() => {
    resetPersonal({
      name: user?.name || '',
      email: user?.email || '',
      phone: user?.phone || '',
    });
  }, [user, resetPersonal]);

  useEffect(() => {
    ensureNotificationHydrated();
  }, [ensureNotificationHydrated]);

  const onPersonalSubmit = async (data) => {
    try {
      await updateProfile({
        name: data?.name,
        phone: data?.phone,
      });
      toast.success(t('Profile updated successfully!'));
    } catch (error) {
      toast.error(error.message || t('Failed to update profile'));
    }
  };

  const onPasswordSubmit = async (data) => {
    try {
      await changePassword(data.currentPassword, data.newPassword);
      toast.success(t('Password changed successfully!'));
      resetPassword();
    } catch (error) {
      toast.error(error.message || t('Failed to change password'));
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/home');
    toast.success(t('Logged out successfully'));
  };

  const handleAvatarPick = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isValidType = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type);
    if (!isValidType) {
      toast.error(t('Only JPEG, PNG, WEBP and GIF images are allowed.'));
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('Image size must be 5MB or less.'));
      event.target.value = '';
      return;
    }

    try {
      await uploadProfileAvatar(file);
      toast.success(t('Profile picture updated successfully!'));
    } catch (error) {
      toast.error(error?.message || t('Failed to upload profile picture'));
    } finally {
      event.target.value = '';
    }
  };

  const menuOptions = [
    { id: 'personal', label: t('Personal Information'), icon: FiUser, color: 'text-blue-600', bg: 'bg-blue-50' },
    { id: 'orders', label: t('My Orders'), icon: FiPackage, color: 'text-orange-600', bg: 'bg-orange-50', link: '/orders' },
    { id: 'addresses', label: t('My Addresses'), icon: FiMapPin, color: 'text-green-600', bg: 'bg-green-50', link: '/addresses' },
    {
      id: 'notifications',
      label: t('Notifications'),
      icon: FiBell,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      link: '/notifications',
      badge: unreadNotificationCount > 0 ? unreadNotificationCount : null,
    },
    { id: 'password', label: t('Change Password'), icon: FiLock, color: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={true}>
          <div className="w-full pb-24 lg:pb-12 max-w-7xl mx-auto min-h-screen bg-surface-muted">
            {/* Desktop Header */}
            <div className="hidden lg:block px-4 py-8">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => navigate(-1)}
                  className="p-2 hover:bg-surface-muted rounded-full transition-colors bg-surface shadow-sm border border-border"
                >
                  <FiArrowLeft className="text-xl text-content-secondary" />
                </button>
                <div>
                  <h1 className="text-3xl font-bold text-content">{t('My Profile')}</h1>
                  <p className="text-content-muted mt-1">{t('Manage your personal information and security settings')}</p>
                </div>
              </div>
            </div>

            <div className="lg:hidden px-4 py-4 bg-surface border-b border-border sticky top-0 z-30">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => activeTab === 'menu' ? navigate(-1) : setActiveTab('menu')}
                  className="p-2 hover:bg-surface-muted rounded-full transition-colors"
                >
                  <FiArrowLeft className="text-xl text-content-secondary" />
                </button>
                <h1 className="text-xl font-bold text-content">
                  {activeTab === 'menu' ? t('My Account') : activeTab === 'personal' ? t('Personal Info') : t('Security')}
                </h1>
              </div>
            </div>

            <div className="lg:grid lg:grid-cols-12 lg:gap-8 lg:px-4">
              {/* Desktop Sidebar */}
              <div className="hidden lg:block lg:col-span-3">
                <div className="bg-surface rounded-2xl border border-border overflow-hidden shadow-sm sticky top-24">
                  <div className="p-2 space-y-1">
                    <button
                      onClick={() => setActiveTab('personal')}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left font-medium ${activeTab === 'personal'
                        ? 'bg-surface-muted text-brand-primary font-bold'
                        : 'text-content-secondary hover:bg-surface-muted'
                        }`}
                    >
                      <FiUser className="text-lg" />
                      {t('Personal Info')}
                    </button>
                    <button
                      onClick={() => setActiveTab('password')}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left font-medium ${activeTab === 'password'
                        ? 'bg-surface-muted text-brand-primary font-bold'
                        : 'text-content-secondary hover:bg-surface-muted'
                        }`}
                    >
                      <FiLock className="text-lg" />
                      {t('Password')}
                    </button>
                  </div>
                </div>
              </div>

              {/* Content Area */}
              <div className="px-4 py-4 lg:p-0 lg:col-span-9">
                {/* Dashboard Menu (Mobile Only) */}
                {!isDesktop && activeTab === 'menu' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="lg:hidden space-y-6"
                  >
                    {/* User Profile Summary Card */}
                    <div className="glass-card rounded-2xl p-6 flex flex-col items-center text-center shadow-sm">
                      <div className="w-20 h-20 rounded-full bg-brand-primary flex items-center justify-center text-black text-3xl font-bold mb-4 shadow-lg">
                        {user?.avatar ? (
                          <img
                            src={user.avatar}
                            alt={user?.name || 'User'}
                            className="w-20 h-20 rounded-full object-cover"
                          />
                        ) : (
                          user?.name?.charAt(0).toUpperCase() || 'U'
                        )}
                      </div>
                      <h2 className="text-xl font-extrabold text-content mb-1">{user?.name}</h2>
                      <p className="text-content-muted text-sm mb-4 font-medium">{user?.email}</p>
                      <div className="w-full">
                        <button
                          onClick={() => setActiveTab('personal')}
                          className="w-full py-3 rounded-xl bg-surface-muted text-brand-primary font-bold text-sm border border-border"
                        >
                          {t('View Profile')}
                        </button>
                      </div>
                    </div>

                    {/* Menu Options */}
                    <div className="space-y-3">
                      <p className="px-2 text-xs font-bold text-content-muted uppercase tracking-wider">{t('Account Settings')}</p>
                      <div className="glass-card rounded-2xl overflow-hidden divide-y divide-border-light shadow-sm border border-border">
                        {menuOptions.map((option) => (
                          option.link ? (
                            <Link
                              key={option.id}
                              to={option.link}
                              className="w-full flex items-center justify-between p-4 hover:bg-surface-muted transition-colors bg-surface"
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-xl ${option.bg} ${option.color} flex items-center justify-center`}>
                                  <option.icon className="text-lg" />
                                </div>
                                <span className="font-bold text-content-secondary text-sm">{option.label}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {option.badge ? (
                                  <span className="min-w-[20px] h-5 px-1 rounded-full bg-status-error text-white text-[10px] font-bold flex items-center justify-center">
                                    {option.badge > 99 ? '99+' : option.badge}
                                  </span>
                                ) : null}
                                <FiChevronRight className="text-content-muted" />
                              </div>
                            </Link>
                          ) : (
                            <button
                              key={option.id}
                              onClick={() => option.action ? option.action() : setActiveTab(option.id)}
                              className="w-full flex items-center justify-between p-4 hover:bg-surface-muted transition-colors bg-surface"
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-xl ${option.bg} ${option.color} flex items-center justify-center`}>
                                  <option.icon className="text-lg" />
                                </div>
                                <span className="font-bold text-content-secondary text-sm">{option.label}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {option.badge ? (
                                  <span className="min-w-[20px] h-5 px-1 rounded-full bg-status-error text-white text-[10px] font-bold flex items-center justify-center">
                                    {option.badge > 99 ? '99+' : option.badge}
                                  </span>
                                ) : null}
                                <FiChevronRight className="text-content-muted" />
                              </div>
                            </button>
                          )
                        ))}
                      </div>
                    </div>

                    {/* Logout Option */}
                    <div className="pt-2">
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-3 p-4 glass-card rounded-2xl text-status-error font-bold text-sm shadow-sm border border-status-errorBg hover:bg-status-errorBg transition-colors bg-surface"
                      >
                        <FiLogOut className="text-lg" />
                        <span>{t('Sign Out')}</span>
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Personal Information Tab */}
                {activeTab === 'personal' && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card rounded-2xl p-4 lg:p-8"
                  >
                    {/* Avatar */}
                    <div className="flex items-center gap-4 mb-6">
                      <div className="relative">
                        <div className="w-20 h-20 rounded-full bg-brand-primary flex items-center justify-center text-black text-2xl font-bold overflow-hidden">
                          {user?.avatar ? (
                            <img
                              src={user.avatar}
                              alt={user?.name || 'User'}
                              className="w-20 h-20 rounded-full object-cover"
                            />
                          ) : (
                            user?.name?.charAt(0).toUpperCase() || 'U'
                          )}
                        </div>
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          onChange={handleAvatarChange}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={handleAvatarPick}
                          disabled={isLoading}
                          className="absolute bottom-0 right-0 w-8 h-8 bg-brand-primary rounded-full flex items-center justify-center text-black hover:bg-brand-primaryHover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <FiCamera className="text-sm" />
                        </button>
                      </div>
                      <div>
                        <p className="text-content-secondary text-sm mb-1">{t('Profile Picture')}</p>
                        <p className="text-xs text-content-muted">{t('JPG, PNG or GIF. Max size 5MB')}</p>
                      </div>
                    </div>

                    <form onSubmit={handleSubmitPersonal(onPersonalSubmit)} className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-content-secondary mb-2">
                          {t('Full Name')}
                        </label>
                        <div className="relative">
                          <FiUser className="absolute left-4 top-1/2 transform -translate-y-1/2 text-content-muted" />
                          <input
                            type="text"
                            {...registerPersonal('name', {
                              required: t('Name is required'),
                              minLength: {
                                value: 2,
                                message: t('Name must be at least 2 characters'),
                              },
                            })}
                            className={`w-full pl-12 pr-4 py-3 rounded-xl border-2 ${personalErrors.name
                              ? 'border-status-error focus:border-status-error'
                              : 'border-border focus:border-brand-primary'
                              } focus:outline-none transition-colors text-base bg-surface text-content`}
                            placeholder={t('Your full name')}
                          />
                        </div>
                        <AnimatePresence>
                          {personalErrors.name && (
                            <motion.p
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0 }}
                              className="mt-1 text-sm text-red-600"
                            >
                              {personalErrors.name.message}
                            </motion.p>
                          )}
                        </AnimatePresence>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-content-secondary mb-2">
                          {t('Email Address')}
                        </label>
                        <div className="relative">
                          <FiMail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-content-muted" />
                          <input
                            type="email"
                            {...registerPersonal('email', {
                              required: t('Email is required'),
                              validate: (value) =>
                                isValidEmail(value) || t('Please enter a valid email'),
                            })}
                            readOnly
                            className={`w-full pl-12 pr-4 py-3 rounded-xl border-2 ${personalErrors.email
                              ? 'border-status-error focus:border-status-error'
                              : 'border-border focus:border-brand-primary'
                              } focus:outline-none transition-colors text-base bg-surface-muted text-content-muted cursor-not-allowed`}
                            placeholder={t('your.email@example.com')}
                          />
                        </div>
                        <p className="mt-1 text-xs text-content-muted">
                          {t('Email cannot be changed from profile settings.')}
                        </p>
                        <AnimatePresence>
                          {personalErrors.email && (
                            <motion.p
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0 }}
                              className="mt-1 text-sm text-red-600"
                            >
                              {personalErrors.email.message}
                            </motion.p>
                          )}
                        </AnimatePresence>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-content-secondary mb-2">
                          {t('Phone Number')}
                        </label>
                        <div className="relative">
                          <FiPhone className="absolute left-4 top-1/2 transform -translate-y-1/2 text-content-muted" />
                          <input
                            type="tel"
                            {...registerPersonal('phone', {
                              validate: (value) =>
                                !value || isValidPhone(value) || t('Please enter a valid phone number'),
                            })}
                            className={`w-full pl-12 pr-4 py-3 rounded-xl border-2 ${personalErrors.phone
                              ? 'border-status-error focus:border-status-error'
                              : 'border-border focus:border-brand-primary'
                              } focus:outline-none transition-colors text-base bg-surface text-content`}
                            placeholder={t('1234567890')}
                          />
                        </div>
                        <AnimatePresence>
                          {personalErrors.phone && (
                            <motion.p
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0 }}
                              className="mt-1 text-sm text-red-600"
                            >
                              {personalErrors.phone.message}
                            </motion.p>
                          )}
                        </AnimatePresence>
                      </div>

                      <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-brand-primary text-black py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-brand-primaryHover transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <FiSave />
                        {isLoading ? t('Saving...') : t('Save Changes')}
                      </button>
                    </form>
                  </motion.div>
                )}

                {/* Change Password Tab */}
                {activeTab === 'password' && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card rounded-2xl p-4 lg:p-8"
                  >
                    <h2 className="text-lg font-bold text-content mb-4">{t('Change Password')}</h2>

                    <form onSubmit={handleSubmitPassword(onPasswordSubmit)} className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-content-secondary mb-2">
                          {t('Current Password')}
                        </label>
                        <div className="relative">
                          <FiLock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-content-muted" />
                          <input
                            type={showCurrentPassword ? 'text' : 'password'}
                            {...registerPassword('currentPassword', {
                              required: t('Current password is required'),
                            })}
                            className={`w-full pl-12 pr-12 py-3 rounded-xl border-2 ${passwordErrors.currentPassword
                              ? 'border-status-error focus:border-status-error'
                              : 'border-border focus:border-brand-primary'
                              } focus:outline-none transition-colors text-sm sm:text-base bg-surface text-content`}
                            placeholder={t('Current Password')}
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            className="absolute right-4 top-1/2 transform -translate-y-1/2 text-content-muted hover:text-content-secondary"
                          >
                            {showCurrentPassword ? <FiEyeOff /> : <FiEye />}
                          </button>
                        </div>
                        {passwordErrors.currentPassword && (
                          <p className="mt-1 text-sm text-red-600">
                            {passwordErrors.currentPassword.message}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-content-secondary mb-2">
                          {t('New Password')}
                        </label>
                        <div className="relative">
                          <FiLock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-content-muted" />
                          <input
                            type={showNewPassword ? 'text' : 'password'}
                            {...registerPassword('newPassword', {
                              required: t('New password is required'),
                              minLength: {
                                value: 6,
                                message: t('Password must be at least 6 characters'),
                              },
                            })}
                            className={`w-full pl-12 pr-12 py-3 rounded-xl border-2 ${passwordErrors.newPassword
                              ? 'border-status-error focus:border-status-error'
                              : 'border-border focus:border-brand-primary'
                              } focus:outline-none transition-colors text-sm sm:text-base bg-surface text-content`}
                            placeholder={t('New Password')}
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-4 top-1/2 transform -translate-y-1/2 text-content-muted hover:text-content-secondary"
                          >
                            {showNewPassword ? <FiEyeOff /> : <FiEye />}
                          </button>
                        </div>
                        {passwordErrors.newPassword && (
                          <motion.p
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="mt-1 text-sm text-red-600"
                          >
                            {passwordErrors.newPassword.message}
                          </motion.p>
                        )}
                        <PasswordStrengthMeter password={newPassword} />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-content-secondary mb-2">
                          {t('Confirm New Password')}
                        </label>
                        <div className="relative">
                          <FiLock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-content-muted" />
                          <input
                            type={showConfirmPassword ? 'text' : 'password'}
                            {...registerPassword('confirmPassword', {
                              required: t('Please confirm your password'),
                              validate: (value) =>
                                value === newPassword || t('Passwords do not match'),
                            })}
                            className={`w-full pl-12 pr-12 py-3 rounded-xl border-2 ${passwordErrors.confirmPassword
                              ? 'border-status-error focus:border-status-error'
                              : 'border-border focus:border-brand-primary'
                              } focus:outline-none transition-colors text-sm sm:text-base bg-surface text-content`}
                            placeholder={t('Confirm Password')}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-4 top-1/2 transform -translate-y-1/2 text-content-muted hover:text-content-secondary"
                          >
                            {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
                          </button>
                        </div>
                        {passwordErrors.confirmPassword && (
                          <p className="mt-1 text-sm text-red-600">
                            {passwordErrors.confirmPassword.message}
                          </p>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-brand-primary text-black py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-brand-primaryHover transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <FiSave />
                        {isLoading ? t('Changing Password...') : t('Change Password')}
                      </button>
                    </form>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileProfile;

