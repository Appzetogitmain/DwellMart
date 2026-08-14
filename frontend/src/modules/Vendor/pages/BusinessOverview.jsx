import { useEffect, useState } from 'react';
import { FiShoppingBag, FiUsers, FiDollarSign } from 'react-icons/fi';
import api from '../../../shared/utils/api';
import { WORKSPACE_LABELS } from '../hooks/useVendorWorkspace';

const formatCurrency = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));

const BusinessOverview = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get('/vendor/business-overview').then((response) => setData(response?.data || response)).finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="py-16 text-center text-slate-500">Loading business overview…</div>;
  const totals = data?.totals || {};
  return (
    <section className="space-y-6">
      <div><h1 className="text-2xl font-bold text-slate-900">Business Overview</h1><p className="text-slate-500">Read-only performance across all approved channels.</p></div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[[FiDollarSign, 'Total revenue', formatCurrency(totals.revenue)], [FiShoppingBag, 'Total orders', totals.orders || 0], [FiUsers, 'Unique customers', totals.customers || 0]].map(([Icon, label, value]) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Icon className="text-2xl text-amber-500"/><p className="mt-3 text-sm text-slate-500">{label}</p><p className="text-2xl font-bold text-slate-900">{value}</p></article>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Object.entries(data?.channels || {}).map(([channel, item]) => (
          <article key={channel} className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="font-bold text-slate-900">{WORKSPACE_LABELS[channel]}</h2>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-sm"><div><dt className="text-slate-500">Revenue</dt><dd className="font-semibold">{formatCurrency(item.revenue)}</dd></div><div><dt className="text-slate-500">Orders</dt><dd className="font-semibold">{item.orders}</dd></div><div><dt className="text-slate-500">Customers</dt><dd className="font-semibold">{item.customers}</dd></div></dl>
          </article>
        ))}
      </div>
    </section>
  );
};
export default BusinessOverview;

