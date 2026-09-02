import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiLock, FiKey, FiEye, FiEyeOff, FiX, FiCheck, FiAlertCircle, FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { changeAdminPassword } from '../services/adminService';

const ChangePasswordModal = ({ isOpen, onClose }) => {
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

  if (!isOpen) return null;

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

  const handleClose = () => {
    if (isSubmitting) return;
    setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setErrors({});
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await changeAdminPassword(formData.currentPassword, formData.newPassword);
      toast.success('Password changed successfully.');
      handleClose();
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
    <AnimatePresence>
      <div className="fixed inset-0 z-[10005] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        />

        {/* Modal Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative w-full max-w-md rounded-3xl bg-slate-900 border border-amber-500/25 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden z-10"
        >
          {/* Top Gold Line */}
          <div className="h-1 bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-500" />

          {/* Close Button */}
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close"
          >
            <FiX className="text-lg" />
          </button>

          <div className="p-6 sm:p-7">
            {/* Header */}
            <div className="flex items-center gap-3.5 mb-5">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm shrink-0">
                <FiKey className="text-xl" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Change Password</h3>
                <p className="text-xs text-slate-400">Update your admin account credentials</p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Current Password */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Current Password <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none" />
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    name="currentPassword"
                    value={formData.currentPassword}
                    onChange={handleChange}
                    placeholder="Enter current password"
                    className={`w-full pl-10 pr-10 py-2.5 bg-slate-950 border rounded-xl text-white placeholder:text-slate-600 text-sm focus:outline-none focus:ring-2 transition-all ${
                      errors.currentPassword
                        ? 'border-red-500/80 focus:border-red-500 focus:ring-red-500/20'
                        : 'border-slate-700 focus:border-amber-500 focus:ring-amber-500/20'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-400 transition-colors"
                  >
                    {showCurrent ? <FiEyeOff className="text-sm" /> : <FiEye className="text-sm" />}
                  </button>
                </div>
                {errors.currentPassword && (
                  <p className="mt-1 text-xs text-red-400 flex items-center gap-1 font-medium">
                    <FiAlertCircle className="text-xs shrink-0" />
                    <span>{errors.currentPassword}</span>
                  </p>
                )}
              </div>

              {/* New Password */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  New Password <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none" />
                  <input
                    type={showNew ? 'text' : 'password'}
                    name="newPassword"
                    value={formData.newPassword}
                    onChange={handleChange}
                    placeholder="Enter new password (min. 6 characters)"
                    className={`w-full pl-10 pr-10 py-2.5 bg-slate-950 border rounded-xl text-white placeholder:text-slate-600 text-sm focus:outline-none focus:ring-2 transition-all ${
                      errors.newPassword
                        ? 'border-red-500/80 focus:border-red-500 focus:ring-red-500/20'
                        : 'border-slate-700 focus:border-amber-500 focus:ring-amber-500/20'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-400 transition-colors"
                  >
                    {showNew ? <FiEyeOff className="text-sm" /> : <FiEye className="text-sm" />}
                  </button>
                </div>
                {errors.newPassword && (
                  <p className="mt-1 text-xs text-red-400 flex items-center gap-1 font-medium">
                    <FiAlertCircle className="text-xs shrink-0" />
                    <span>{errors.newPassword}</span>
                  </p>
                )}
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Confirm New Password <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none" />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="Re-enter new password"
                    className={`w-full pl-10 pr-10 py-2.5 bg-slate-950 border rounded-xl text-white placeholder:text-slate-600 text-sm focus:outline-none focus:ring-2 transition-all ${
                      errors.confirmPassword
                        ? 'border-red-500/80 focus:border-red-500 focus:ring-red-500/20'
                        : 'border-slate-700 focus:border-amber-500 focus:ring-amber-500/20'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-400 transition-colors"
                  >
                    {showConfirm ? <FiEyeOff className="text-sm" /> : <FiEye className="text-sm" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="mt-1 text-xs text-red-400 flex items-center gap-1 font-medium">
                    <FiAlertCircle className="text-xs shrink-0" />
                    <span>{errors.confirmPassword}</span>
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_2px_12px_rgba(212,175,55,0.25)] flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <FiRefreshCw className="animate-spin text-xs" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <FiCheck className="text-sm stroke-[3]" />
                      <span>Change Password</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ChangePasswordModal;
