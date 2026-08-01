import { useState } from 'react';
import { FiX, FiAlertCircle, FiMessageSquare } from 'react-icons/fi';
import { useSupportChatStore } from '../../store/supportChatStore';

export const REASON_OPTIONS_BY_ROLE = {
    customer: [
        { key: 'ORDER_ISSUE', label: 'Order Issue' },
        { key: 'PAYMENT', label: 'Payment Problem' },
        { key: 'REFUND', label: 'Refund Request' },
        { key: 'ACCOUNT', label: 'Account Issue' },
        { key: 'DELIVERY', label: 'Delivery Delay' },
        { key: 'RETURN', label: 'Return / Exchange' },
        { key: 'TECHNICAL', label: 'Technical Issue' },
        { key: 'OTHER', label: 'Other' },
    ],
    vendor: [
        { key: 'PRODUCT', label: 'Product Approval' },
        { key: 'SUBSCRIPTION', label: 'Subscription Issue' },
        { key: 'SETTLEMENT', label: 'Payment Settlement' },
        { key: 'COMMISSION', label: 'Commission Query' },
        { key: 'VERIFICATION', label: 'Store Verification' },
        { key: 'TECHNICAL', label: 'Technical Support' },
        { key: 'OTHER', label: 'Other' },
    ],
    delivery: [
        { key: 'ASSIGNMENT', label: 'Delivery Assignment' },
        { key: 'COD', label: 'COD Collection' },
        { key: 'PAYMENT', label: 'Payment Settlement' },
        { key: 'ROUTE', label: 'Route Issue' },
        { key: 'TECHNICAL', label: 'App Technical Issue' },
        { key: 'OTHER', label: 'Other' },
    ],
};

export const getReasonLabel = (reasonKey) => {
    if (!reasonKey) return 'Support Request';
    const uppercase = String(reasonKey).toUpperCase();
    for (const list of Object.values(REASON_OPTIONS_BY_ROLE)) {
        const found = list.find((item) => item.key === uppercase);
        if (found) return found.label;
    }
    return reasonKey.replace('_', ' ');
};

const NewConversationModal = ({ isOpen, onClose, role = 'customer', theme = 'light' }) => {
    const { createNewConversation, isSending } = useSupportChatStore();
    const normalizedRole = String(role || '').toLowerCase() === 'user' ? 'customer' : role;
    const reasons = REASON_OPTIONS_BY_ROLE[normalizedRole] || REASON_OPTIONS_BY_ROLE.customer;

    const [reasonKey, setReasonKey] = useState(reasons[0]?.key || 'ORDER_ISSUE');
    const [description, setDescription] = useState('');
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const isDark = theme === 'dark';
    const isOther = reasonKey === 'OTHER';
    const charCount = description.trim().length;
    const isOtherInvalid = isOther && charCount < 20;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (isOtherInvalid) {
            setError('Description is required for "Other" and must be at least 20 characters.');
            return;
        }

        const success = await createNewConversation({
            reason: reasonKey,
            description: description.trim(),
        });

        if (success) {
            setDescription('');
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
            <div className={`rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border transform transition-all ${
                isDark
                    ? 'bg-slate-900 border-amber-500/30 text-white shadow-[0_25px_60px_rgba(0,0,0,0.8)]'
                    : 'bg-white border-gray-100 text-gray-900'
            }`}>
                {/* Header */}
                <div className={`flex items-center justify-between p-5 border-b ${
                    isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-gray-50/50 border-gray-100'
                }`}>
                    <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl ${
                            isDark ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'bg-primary-100 text-primary-600'
                        }`}>
                            <FiMessageSquare className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-gray-900'}`}>New Support Request</h3>
                            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Contact DwellMart Support Desk</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className={`p-2 rounded-lg transition-colors ${
                            isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                        <FiX className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {error && (
                        <div className={`flex items-center gap-2 p-3 text-sm rounded-xl border ${
                            isDark ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-red-50 text-red-700 border-red-100'
                        }`}>
                            <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Support Reason Dropdown */}
                    <div>
                        <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${
                            isDark ? 'text-slate-300' : 'text-gray-700'
                        }`}>
                            Select Support Reason <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={reasonKey}
                            onChange={(e) => {
                                setReasonKey(e.target.value);
                                setError('');
                            }}
                            className={`w-full px-4 py-3 rounded-xl text-sm transition-all focus:outline-none ${
                                isDark
                                    ? 'bg-slate-950 border border-slate-700 text-white focus:border-amber-400'
                                    : 'bg-white border border-gray-200 text-gray-800 focus:ring-2 focus:ring-primary-500'
                            }`}
                            required
                        >
                            {reasons.map((r) => (
                                <option key={r.key} value={r.key} className={isDark ? 'bg-slate-900 text-white' : ''}>
                                    {r.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Description */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className={`block text-xs font-bold uppercase tracking-wider ${
                                isDark ? 'text-slate-300' : 'text-gray-700'
                            }`}>
                                Issue Description {isOther && <span className="text-red-500">*</span>}
                            </label>
                            {isOther && (
                                <span
                                    className={`text-xs font-medium ${
                                        charCount >= 20 ? 'text-emerald-400' : 'text-amber-400'
                                    }`}
                                >
                                    {charCount} / 20 chars min
                                </span>
                            )}
                        </div>
                        <textarea
                            value={description}
                            onChange={(e) => {
                                setDescription(e.target.value);
                                setError('');
                            }}
                            rows={4}
                            placeholder={
                                isOther
                                    ? 'Please describe your issue in detail (minimum 20 characters required)...'
                                    : 'Add additional details or references if applicable (optional)...'
                            }
                            className={`w-full px-4 py-3 rounded-xl text-sm transition-all resize-none focus:outline-none ${
                                isDark
                                    ? 'bg-slate-950 border border-slate-700 text-white placeholder-slate-500 focus:border-amber-400'
                                    : 'bg-white border border-gray-200 text-gray-800 placeholder-gray-400 focus:ring-2 focus:ring-primary-500'
                            }`}
                            required={isOther}
                        />
                    </div>

                    {/* Buttons */}
                    <div className={`flex items-center justify-end gap-3 pt-4 border-t ${
                        isDark ? 'border-slate-800' : 'border-gray-100'
                    }`}>
                        <button
                            type="button"
                            onClick={onClose}
                            className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-colors ${
                                isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSending || (isOther && isOtherInvalid)}
                            className={`px-6 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50 ${
                                isDark
                                    ? 'bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-slate-950 hover:from-amber-400 hover:to-amber-500'
                                    : 'bg-primary-600 text-white hover:bg-primary-700'
                            }`}
                        >
                            {isSending ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    <span>Submitting...</span>
                                </>
                            ) : (
                                <span>Start Conversation</span>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default NewConversationModal;
