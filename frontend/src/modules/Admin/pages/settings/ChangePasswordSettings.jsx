import { useState } from 'react';
import { FiLock, FiKey, FiEye, FiEyeOff, FiCheck, FiAlertCircle, FiRefreshCw } from 'react-icons/fi';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { changeAdminPassword } from '../../services/adminService';
import { useAdminAuthStore } from '../../store/adminStore';

const ChangePasswordSettings = () => {
  const { admin } = useAdminAuthStore();
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};

    if (!formData.currentPassword) {
      errs.currentPassword = 'Current password is required';
    }

    if (!formData.newPassword) {
      errs.newPassword = 'New password is required';
    } else if (formData.newPassword.length < 6) {
      errs.newPassword = 'New password must be at least 6 characters long';
    }

    if (!formData.confirmPassword) {
      errs.confirmPassword = 'Confirm password is required';
    } else if (formData.newPassword !== formData.confirmPassword) {
      errs.confirmPassword = 'New passwords do not match';
    }

    if (
      formData.currentPassword &&
      formData.newPassword &&
      formData.currentPassword === formData.newPassword
    ) {
      errs.newPassword = 'New password must be different from your current password';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await changeAdminPassword(formData.currentPassword, formData.newPassword);
      toast.success('Password changed successfully.');
      setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setErrors({});
    } catch (error) {
      const errMsg =
        error?.response?.data?.message ||
        error?.message ||
        'Failed to change password. Please verify your current password.';
      toast.error(errMsg);
      if (errMsg.toLowerCase().includes('current password')) {
        setErrors((prev) => ({ ...prev, currentPassword: errMsg }));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-2xl"
    >
      <div className="mb-6 pb-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FiKey className="text-amber-600 text-xl" />
            Change Admin Password
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Logged in as <strong className="text-gray-700">{admin?.email || 'admin@admin.com'}</strong> ({admin?.role || 'Admin'})
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Current Password */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
            Current Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-base pointer-events-none" />
            <input
              type={showCurrent ? 'text' : 'password'}
              name="currentPassword"
              value={formData.currentPassword}
              onChange={handleChange}
              placeholder="Enter your current password"
              className={`w-full pl-10 pr-11 py-2.5 bg-gray-50 border rounded-xl text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:bg-white focus:ring-2 transition-all font-medium ${
                errors.currentPassword
                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                  : 'border-gray-200 focus:border-amber-500 focus:ring-amber-500/20'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-amber-600 transition-colors p-1"
            >
              {showCurrent ? <FiEyeOff className="text-base" /> : <FiEye className="text-base" />}
            </button>
          </div>
          {errors.currentPassword && (
            <p className="mt-1 text-xs text-red-500 flex items-center gap-1 font-medium">
              <FiAlertCircle className="text-xs shrink-0" />
              <span>{errors.currentPassword}</span>
            </p>
          )}
        </div>

        {/* New Password */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
            New Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-base pointer-events-none" />
            <input
              type={showNew ? 'text' : 'password'}
              name="newPassword"
              value={formData.newPassword}
              onChange={handleChange}
              placeholder="Enter new password (min. 6 characters)"
              className={`w-full pl-10 pr-11 py-2.5 bg-gray-50 border rounded-xl text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:bg-white focus:ring-2 transition-all font-medium ${
                errors.newPassword
                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                  : 'border-gray-200 focus:border-amber-500 focus:ring-amber-500/20'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-amber-600 transition-colors p-1"
            >
              {showNew ? <FiEyeOff className="text-base" /> : <FiEye className="text-base" />}
            </button>
          </div>
          {errors.newPassword && (
            <p className="mt-1 text-xs text-red-500 flex items-center gap-1 font-medium">
              <FiAlertCircle className="text-xs shrink-0" />
              <span>{errors.newPassword}</span>
            </p>
          )}
        </div>

        {/* Confirm New Password */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
            Confirm New Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-base pointer-events-none" />
            <input
              type={showConfirm ? 'text' : 'password'}
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Re-enter new password"
              className={`w-full pl-10 pr-11 py-2.5 bg-gray-50 border rounded-xl text-gray-900 placeholder:text-gray-400 text-sm focus:outline-none focus:bg-white focus:ring-2 transition-all font-medium ${
                errors.confirmPassword
                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                  : 'border-gray-200 focus:border-amber-500 focus:ring-amber-500/20'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-amber-600 transition-colors p-1"
            >
              {showConfirm ? <FiEyeOff className="text-base" /> : <FiEye className="text-base" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="mt-1 text-xs text-red-500 flex items-center gap-1 font-medium">
              <FiAlertCircle className="text-xs shrink-0" />
              <span>{errors.confirmPassword}</span>
            </p>
          )}
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <FiRefreshCw className="animate-spin text-sm" />
                <span>Updating Password...</span>
              </>
            ) : (
              <>
                <FiCheck className="text-base stroke-[3]" />
                <span>Change Password</span>
              </>
            )}
          </button>
        </div>
      </form>
    </motion.div>
  );
};

export default ChangePasswordSettings;
