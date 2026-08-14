import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FiShoppingBag, FiLayers, FiZap, FiCheckCircle, FiClock, FiAlertCircle, FiArrowRight } from 'react-icons/fi';
import api from '../../../shared/utils/api';
import { WORKSPACE_LABELS } from '../hooks/useVendorWorkspace';

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
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState('');

  const load = () =>
    api.get('/vendor/auth/channels').then((response) => setSummary(response?.data || response));

  useEffect(() => {
    load();
  }, []);

  const apply = async (channel) => {
    setBusy(channel);
    try {
      const response = await api.post(`/vendor/auth/channels/${channel}/apply`, {});
      setSummary(response?.data || response);
      toast.success('Channel application submitted successfully.');
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

          return (
            <article
              key={channel}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-md transition-shadow"
            >
              <div>
                {/* Header */}
                <div className="flex items-center justify-between gap-3">
                  <div className={`w-10 h-10 rounded-xl ${config.bg} ${config.border} border flex items-center justify-center`}>
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
              </div>

              {/* Action Buttons */}
              <div className="mt-6 pt-4 border-t border-slate-100">
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

                {state.status === 'requested' && (
                  <button
                    disabled={isBusy}
                    onClick={() => withdraw(channel)}
                    className="w-full rounded-xl border border-slate-300 hover:bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isBusy ? 'Withdrawing...' : 'Withdraw Request'}
                  </button>
                )}

                {state.status === 'active' && (
                  <div className="flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-xl border border-emerald-200">
                    <FiCheckCircle className="text-sm" />
                    <span>Channel is Active & Enabled</span>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default SellingChannels;

