import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiAlertTriangle, FiAlertCircle, FiInfo, FiX, FiLoader } from 'react-icons/fi';

/**
 * Universal Configurable Confirmation Modal
 * Reusable across Vendor, Delivery, Admin, and Customer modules.
 */
const ConfirmationModal = ({
    isOpen,
    onClose,
    onConfirm,
    title = 'Confirm Action',
    subtitle = 'Are you sure you want to proceed?',
    warningText = null,
    severity = 'danger', // 'danger' | 'warning' | 'info'
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    isLoading = false,
}) => {
    if (!isOpen) return null;

    const severityConfig = {
        danger: {
            icon: FiAlertTriangle,
            iconBg: 'bg-rose-500/10 text-rose-500 border-rose-500/30',
            buttonBg: 'bg-rose-600 hover:bg-rose-700 text-white',
            border: 'border-rose-500/20',
        },
        warning: {
            icon: FiAlertCircle,
            iconBg: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
            buttonBg: 'bg-amber-500 hover:bg-amber-600 text-black font-bold',
            border: 'border-amber-500/20',
        },
        info: {
            icon: FiInfo,
            iconBg: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
            buttonBg: 'bg-brand-primary hover:bg-brand-primaryHover text-black font-bold',
            border: 'border-blue-500/20',
        },
    }[severity] || severityConfig.danger;

    const IconComponent = severityConfig.icon;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 10 }}
                    onClick={(e) => e.stopPropagation()}
                    className={`w-full max-w-md bg-surface border ${severityConfig.border} rounded-2xl p-5 shadow-2xl space-y-4`}
                >
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-3 rounded-xl border ${severityConfig.iconBg}`}>
                                <IconComponent className="text-xl" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-content">{title}</h3>
                                <p className="text-xs text-content-secondary">{subtitle}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-content-secondary hover:bg-surface-muted transition-colors"
                        >
                            <FiX className="text-lg" />
                        </button>
                    </div>

                    {warningText && (
                        <div className="p-3 bg-surface-muted border border-border rounded-xl text-xs text-content-secondary leading-relaxed">
                            <span className="font-semibold text-content block mb-0.5">Consequences:</span>
                            {warningText}
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isLoading}
                            className="px-4 py-2.5 bg-surface-muted hover:bg-border text-content-secondary rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                            {cancelText}
                        </button>
                        <button
                            type="button"
                            onClick={onConfirm}
                            disabled={isLoading}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${severityConfig.buttonBg} disabled:opacity-50`}
                        >
                            {isLoading && <FiLoader className="animate-spin text-sm" />}
                            {isLoading ? 'Processing...' : confirmText}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default React.memo(ConfirmationModal);
