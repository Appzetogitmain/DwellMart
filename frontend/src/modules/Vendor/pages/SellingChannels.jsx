import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  FiShoppingBag,
  FiLayers,
  FiZap,
  FiCheckCircle,
  FiClock,
  FiAlertCircle,
  FiArrowRight,
  FiSettings,
  FiX,
  FiAlertTriangle,
} from 'react-icons/fi';
import api from '../../../shared/utils/api';
import { WORKSPACE_LABELS } from '../hooks/useVendorWorkspace';
import { useVendorAuthStore } from '../store/vendorAuthStore';
import QuickCommerceSettingsForm from '../components/QuickCommerceSettingsForm';

const CHANNEL_CONFIGS = {
  retail: {
    path: 'retail',
    label: 'Retail Marketplace',
    icon: FiShoppingBag,
    color: 'text-sky-500',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/20',
    description: 'Sell products directly to retail shoppers across the nation.',
  },
  wholesale: {
    path: 'wholesale',
    label: 'Wholesale Marketplace',
    icon: FiLayers,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    description: 'Supply bulk products and wholesale orders to verified B2B buyers.',
  },
  quick_commerce: {
    path: 'quickCommerce',
    label: 'Quick Commerce',
    icon: FiZap,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    description: 'Deliver essentials in 10-15 minutes to customers in your local service area.',
  },
};

const getStatusBadge = (status) => {
  switch (status) {
    case 'active':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          ACTIVE
        </span>
      );
    case 'requested':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
          <FiClock className="text-xs" />
          UNDER REVIEW
        </span>
      );
    case 'rejected':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20">
          <FiAlertCircle className="text-xs" />
          REJECTED
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
          DISABLED
        </span>
      );
  }
};

const SellingChannels = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { refreshProfile } = useVendorAuthStore();
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState('');
  const [isQcModalOpen, setIsQcModalOpen] = useState(false);

  const load = async () => {
    try {
      const response = await api.get('/vendor/auth/channels');
      setSummary(response?.data || response);
    } catch {
      // Ignored
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Auto-open QC setup modal if ?setup=quick_commerce is present
  useEffect(() => {
    const setup = searchParams.get('setup');
    if (setup === 'quick_commerce' || setup === 'quickCommerce' || setup === 'qc') {
      setIsQcModalOpen(true);
    }
  }, [searchParams]);

  const handleCloseQcModal = () => {
    setIsQcModalOpen(false);
    if (searchParams.get('setup')) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('setup');
        return next;
      }, { replace: true });
    }
  };

  const apply = async (channel) => {
    setBusy(channel);
    try {
      const response = await api.post(`/vendor/auth/channels/${channel}/apply`, {});
      setSummary(response?.data || response);
      toast.success('Channel application submitted successfully.');
      if (channel === 'quick_commerce') {
        setIsQcModalOpen(true);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to submit application');
    } finally {
      setBusy('');
    }
  };

  const withdraw = async (channel) => {
    setBusy(channel);
    try {
      const response = await api.delete(`/vendor/auth/channels/${channel}/request`);
      setSummary(response?.data || response);
      toast.success('Application withdrawn.');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to withdraw');
    } finally {
      setBusy('');
    }
  };

  const isQcConfigured = summary?.quickCommerceReadiness?.ready ?? Boolean(
    summary?.quickCommerceProfile?.storeType &&
      (summary?.quickCommerceProfile?.location?.coordinates?.length === 2 ||
        summary?.quickCommerceProfile?.servicedPincodes?.length) &&
      summary?.quickCommerceProfile?.serviceRadiusKm &&
      summary?.quickCommerceProfile?.preparationTimeMins !== undefined
  );

  return (
    <section className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Selling Channels</h1>
        <p className="text-sm text-slate-500 mt-1">
          Apply for additional channels without creating another account or subscription.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(CHANNEL_CONFIGS).map(([channel, config]) => {
          const state = summary?.channels?.[config.path] || { status: 'disabled' };
          const Icon = config.icon;
          const isBusy = busy === channel;
          const isQC = channel === 'quick_commerce';

          return (
            <article
              key={channel}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-md transition-shadow"
            >
              <div>
                {/* Header */}
                <div className="flex items-center justify-between gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl ${config.bg} ${config.border} border flex items-center justify-center`}
                  >
                    <Icon className={`text-xl ${config.color}`} />
                  </div>
                  {getStatusBadge(state.status)}
                </div>

                {/* Title & Description */}
                <div className="mt-4">
                  <h2 className="text-base font-bold text-slate-900">
                    {WORKSPACE_LABELS[channel] || config.label}
                  </h2>
                  <p className="text-xs text-slate-500 leading-relaxed mt-1">
                    {config.description}
                  </p>
                </div>

                {/* Rejection / Status Reason */}
                {state.reason && (
                  <div className="mt-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                    <strong>Note:</strong> {state.reason}
                  </div>
                )}

                {/* Quick Commerce Setup Readiness Notice */}
                {isQC && state.status === 'requested' && (
                  <div
                    className={`mt-3 p-2.5 rounded-xl text-xs flex items-start gap-2 border ${
                      isQcConfigured
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}
                  >
                    {isQcConfigured ? (
                      <FiCheckCircle className="text-emerald-600 mt-0.5 shrink-0" />
                    ) : (
                      <FiAlertTriangle className="text-amber-600 mt-0.5 shrink-0" />
                    )}
                    <span>
                      {isQcConfigured
                        ? 'Store setup submitted. Ready for admin activation.'
                        : 'Store setup is required before this channel can be activated.'}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-6 pt-4 border-t border-slate-100 space-y-2">
                {['disabled', 'rejected'].includes(state.status) && (
                  <button
                    disabled={isBusy}
                    onClick={() => apply(channel)}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-900 shadow-xs hover:shadow transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <span>{isBusy ? 'Submitting...' : 'Apply for Channel'}</span>
                    {!isBusy && <FiArrowRight className="text-sm" />}
                  </button>
                )}

                {state.status === 'requested' && isQC && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsQcModalOpen(true)}
                      className={`w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all shadow-xs hover:shadow cursor-pointer ${
                        isQcConfigured
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
                          : 'bg-amber-500 hover:bg-amber-600 text-white'
                      }`}
                    >
                      <FiSettings className="text-base" />
                      <span>{isQcConfigured ? 'Edit Store Setup' : 'Complete Setup'}</span>
                    </button>
                    <button
                      disabled={isBusy}
                      onClick={() => withdraw(channel)}
                      className="w-full rounded-xl border border-slate-200 hover:bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {isBusy ? 'Withdrawing...' : 'Withdraw Request'}
                    </button>
                  </>
                )}

                {state.status === 'requested' && !isQC && (
                  <button
                    disabled={isBusy}
                    onClick={() => withdraw(channel)}
                    className="w-full rounded-xl border border-slate-300 hover:bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isBusy ? 'Withdrawing...' : 'Withdraw Request'}
                  </button>
                )}

                {state.status === 'active' && (
                  <>
                    <div className="flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-xl border border-emerald-200">
                      <FiCheckCircle className="text-sm" />
                      <span>Channel is Active & Enabled</span>
                    </div>
                    {isQC && (
                      <button
                        type="button"
                        onClick={() => setIsQcModalOpen(true)}
                        className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                      >
                        <FiSettings className="text-xs" />
                        <span>Store & Delivery Settings</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Quick Commerce Setup Modal */}
      {isQcModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4">
            <div className="relative w-full sm:max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[90vh] bg-white rounded-t-3xl sm:rounded-2xl flex flex-col shadow-2xl overflow-hidden">
              {/* Sticky Header */}
              <div className="sticky top-0 bg-white z-20 px-4 py-3.5 sm:px-6 sm:py-4 border-b border-slate-200 flex items-center justify-between shrink-0 shadow-xs">
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <FiZap className="text-xl text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                      Quick Commerce Operational Setup
                    </h3>
                    <p className="text-xs text-slate-500 truncate">
                      Set fulfillment location, radius, store type & delivery parameters
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCloseQcModal}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
                  title="Close"
                >
                  <FiX className="text-xl" />
                </button>
              </div>

              {/* Scrollable Form Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 sm:p-8 overscroll-contain">
                <QuickCommerceSettingsForm
                  vendor={summary}
                  onSaved={async () => {
                    await load();
                    await refreshProfile();
                    handleCloseQcModal();
                    toast.success('Quick Commerce setup saved! Your settings are under review.');
                  }}
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </section>
  );
};

export default SellingChannels;

