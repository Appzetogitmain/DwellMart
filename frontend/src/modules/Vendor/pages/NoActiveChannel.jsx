import { Link } from 'react-router-dom';
import { FiAlertCircle, FiArrowRight, FiClock, FiXCircle } from 'react-icons/fi';
import { useVendorAuthStore } from '../store/vendorAuthStore';
import { WORKSPACE_LABELS } from '../hooks/useVendorWorkspace';

/**
 * Explicit state for an approved vendor holding no readable channel.
 *
 * This case is reachable in normal operation — every channel paused then
 * disabled, an application still pending review, or an account approved before
 * any channel was activated. Previously there was no screen for it: the
 * workspace guard bounced to the picker, the picker rendered an empty grid,
 * and every other route returned a raw `NO_ACTIVE_CHANNEL` 403 surfaced as a
 * generic error toast.
 */

const STATUS_PRESENTATION = {
  requested: { icon: FiClock, tone: 'text-amber-600 bg-amber-50 border-amber-200', label: 'Awaiting review' },
  rejected: { icon: FiXCircle, tone: 'text-rose-600 bg-rose-50 border-rose-200', label: 'Not approved' },
  disabled: { icon: FiAlertCircle, tone: 'text-slate-500 bg-slate-50 border-slate-200', label: 'Not enabled' },
  paused: { icon: FiClock, tone: 'text-amber-600 bg-amber-50 border-amber-200', label: 'Paused' },
};

const CHANNEL_PATHS = { retail: 'retail', wholesale: 'wholesale', quick_commerce: 'quickCommerce' };

const NoActiveChannel = () => {
  const vendor = useVendorAuthStore((state) => state.vendor);
  const channels = vendor?.channels || {};

  const hasPendingRequest = Object.values(CHANNEL_PATHS)
    .some((path) => channels?.[path]?.status === 'requested');

  return (
    <section className="max-w-3xl mx-auto py-10">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-2xl font-bold text-slate-900">No selling channel is active yet</h1>
        <p className="mt-2 text-slate-700">
          {hasPendingRequest
            ? 'Your channel application is with our team. You will be notified as soon as it is reviewed.'
            : 'Your account is approved, but no selling channel is enabled. Apply for a channel to start selling.'}
        </p>
      </div>

      <div className="mt-6 grid gap-3">
        {Object.entries(CHANNEL_PATHS).map(([channel, path]) => {
          const status = channels?.[path]?.status || 'disabled';
          const presentation = STATUS_PRESENTATION[status] || STATUS_PRESENTATION.disabled;
          const Icon = presentation.icon;
          const reason = channels?.[path]?.reason;
          return (
            <div key={channel} className={`flex items-start gap-3 rounded-xl border p-4 ${presentation.tone}`}>
              <Icon className="mt-0.5 text-lg shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{WORKSPACE_LABELS[channel]}</p>
                <p className="text-sm">{presentation.label}</p>
                {reason ? <p className="mt-1 text-sm text-slate-600">Reason: {reason}</p> : null}
              </div>
            </div>
          );
        })}
      </div>

      <Link
        to="/vendor/channels"
        className="mt-7 inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 font-bold text-slate-900 hover:bg-amber-500"
      >
        Go to Selling Channels <FiArrowRight />
      </Link>

      <p className="mt-4 text-sm text-slate-500">
        Your account, subscription, wallet and bank details remain available from your profile.
      </p>
    </section>
  );
};

export default NoActiveChannel;
