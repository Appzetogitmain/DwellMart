import { useCallback, useEffect, useState } from 'react';
import { FiCheckCircle, FiCreditCard, FiRefreshCw, FiSearch, FiXCircle } from 'react-icons/fi';
import { motion } from 'framer-motion';
import Badge from '../../../../shared/components/Badge';
import DataTable from '../../components/DataTable';
import api from '../../../../shared/utils/api';

const VendorSubscriptions = () => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const fetchSubscriptions = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/admin/vendor-subscriptions', {
        params: { page: currentPage, limit: 15 },
      });
      const data = response?.data || {};
      setSubscriptions(data.subscriptions || []);
      setPagination(data.pagination || { total: 0, page: 1, pages: 1 });
    } finally {
      setIsLoading(false);
    }
  }, [currentPage]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const filtered = subscriptions.filter((subscription) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return [subscription.vendor?.storeName, subscription.vendor?.email, subscription.plan?.name, subscription.gateway]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  const columns = [
    {
      key: 'vendor',
      label: 'Vendor',
      render: (_, row) => (
        <div>
          <p className="font-semibold text-slate-900">{row.vendor?.storeName || row.vendor?.name || 'Unknown vendor'}</p>
          <p className="text-xs text-slate-500">{row.vendor?.email || 'No email'}</p>
        </div>
      ),
    },
    {
      key: 'plan',
      label: 'Plan',
      render: (_, row) => (
        <div>
          <p className="font-semibold text-slate-900">{row.plan?.name || 'Unknown plan'}</p>
          <p className="text-xs text-slate-500">
            Rs. {Number(row.plan?.pricing?.inr ?? 0).toFixed(0)} / ${Number(row.plan?.pricing?.usd ?? 0).toFixed(2)} | {row.plan?.intervalLabel || row.plan?.interval}
          </p>
        </div>
      ),
    },
    {
      key: 'gateway',
      label: 'Gateway',
      render: (_, row) => String(row.gateway || 'internal').toUpperCase(),
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => (
        <Badge variant={row.status === 'active' ? 'success' : row.status === 'past_due' ? 'warning' : 'error'}>
          {String(row.status || 'unknown').toUpperCase()}
        </Badge>
      ),
    },
    {
      key: 'period',
      label: 'Current Period',
      render: (_, row) => (
        <div className="text-sm text-slate-600">
          <div>{row.current_period_start ? new Date(row.current_period_start).toLocaleDateString() : 'N/A'}</div>
          <div>{row.current_period_end ? new Date(row.current_period_end).toLocaleDateString() : 'N/A'}</div>
        </div>
      ),
    },
    {
      key: 'payment',
      label: 'Payment',
      render: (_, row) => (
        <Badge variant={row.latest_payment_status === 'paid' ? 'success' : row.latest_payment_status === 'failed' ? 'error' : 'warning'}>
          {String(row.latest_payment_status || 'pending').toUpperCase()}
        </Badge>
      ),
    },
  ];

  const stats = {
    total: pagination.total,
    active: subscriptions.filter((row) => row.status === 'active').length,
    pastDue: subscriptions.filter((row) => row.status === 'past_due').length,
    canceled: subscriptions.filter((row) => row.status === 'canceled').length,
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Vendor Subscriptions</h1>
          <p className="mt-1 text-sm text-slate-500">Monitor live vendor subscription status and active plans.</p>
        </div>
        <button type="button" onClick={fetchSubscriptions} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 font-semibold text-slate-600 transition hover:bg-slate-100">
          <FiRefreshCw className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Total', value: stats.total, icon: FiCreditCard, tone: 'text-sky-600 bg-sky-50' },
          { label: 'Active', value: stats.active, icon: FiCheckCircle, tone: 'text-emerald-600 bg-emerald-50' },
          { label: 'Past Due', value: stats.pastDue, icon: FiCreditCard, tone: 'text-amber-600 bg-amber-50' },
          { label: 'Canceled', value: stats.canceled, icon: FiXCircle, tone: 'text-rose-600 bg-rose-50' },
        ].map((card) => (
          <div key={card.label} className="rounded-[24px] border border-slate-200 bg-white p-5">
            <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full ${card.tone}`}>
              <card.icon />
            </div>
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{isLoading ? 'N/A' : card.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <FiSearch className="text-slate-400" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by vendor, plan, or gateway"
            className="w-full bg-transparent text-sm text-slate-700 outline-none"
          />
        </div>

        <DataTable data={filtered} columns={columns} pagination={false} />

        {pagination.pages > 1 ? (
          <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4">
            <p className="text-sm text-slate-500">Page {pagination.page} of {pagination.pages}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setCurrentPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50">Previous</button>
              <button type="button" onClick={() => setCurrentPage((value) => Math.min(pagination.pages, value + 1))} disabled={currentPage === pagination.pages} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-50">Next</button>
            </div>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
};

export default VendorSubscriptions;


