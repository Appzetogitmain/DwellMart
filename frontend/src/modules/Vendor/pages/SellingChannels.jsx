import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../../shared/utils/api';
import { WORKSPACE_LABELS } from '../hooks/useVendorWorkspace';

const channelPaths = { retail: 'retail', wholesale: 'wholesale', quick_commerce: 'quickCommerce' };

const SellingChannels = () => {
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState('');
  const [wholesaleProfile, setWholesaleProfile] = useState({ gstNumber: '', businessName: '', wholesaleContactName: '', wholesaleContactPhone: '', bulkOrderSupportEmail: '' });
  const load = () => api.get('/vendor/auth/channels').then((response) => setSummary(response?.data || response));
  useEffect(() => { load(); }, []);
  const apply = async (channel) => {
    setBusy(channel);
    try {
      const payload = channel === 'wholesale' ? { wholesaleProfile } : {};
      const response = await api.post(`/vendor/auth/channels/${channel}/apply`, payload);
      setSummary(response?.data || response); toast.success('Channel application submitted.');
    } finally { setBusy(''); }
  };
  const withdraw = async (channel) => {
    setBusy(channel);
    try { const response = await api.delete(`/vendor/auth/channels/${channel}/request`); setSummary(response?.data || response); toast.success('Application withdrawn.'); }
    finally { setBusy(''); }
  };
  return (
    <section className="space-y-6 max-w-5xl">
      <div><h1 className="text-2xl font-bold text-slate-900">Selling Channels</h1><p className="text-slate-500">Apply for additional channels without creating another account or subscription.</p></div>
      <div className="grid gap-5 lg:grid-cols-3">
        {Object.entries(channelPaths).map(([channel, path]) => {
          const state = summary?.channels?.[path] || { status: 'disabled' };
          return <article key={channel} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3"><h2 className="font-bold text-slate-900">{WORKSPACE_LABELS[channel]}</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase text-slate-600">{state.status}</span></div>
            {state.reason && <p className="mt-3 text-sm text-rose-600">{state.reason}</p>}
            {channel === 'wholesale' && ['disabled', 'rejected'].includes(state.status) && <div className="mt-4 space-y-2">
              {Object.keys(wholesaleProfile).map((field) => <input key={field} value={wholesaleProfile[field]} onChange={(e) => setWholesaleProfile((value) => ({ ...value, [field]: e.target.value }))} placeholder={field.replace(/([A-Z])/g, ' $1')} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />)}
            </div>}
            {['disabled', 'rejected'].includes(state.status) && <button disabled={busy === channel} onClick={() => apply(channel)} className="mt-5 w-full rounded-xl bg-amber-400 px-4 py-2.5 font-bold text-slate-900 disabled:opacity-50">Apply</button>}
            {state.status === 'requested' && <button disabled={busy === channel} onClick={() => withdraw(channel)} className="mt-5 w-full rounded-xl border border-slate-300 px-4 py-2.5 font-semibold text-slate-700">Withdraw request</button>}
          </article>;
        })}
      </div>
    </section>
  );
};
export default SellingChannels;

