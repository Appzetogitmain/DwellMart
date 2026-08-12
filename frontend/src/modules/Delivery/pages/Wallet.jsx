import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiTrendingUp,
  FiClock,
  FiLock,
  FiCheckCircle,
  FiXCircle,
  FiAlertTriangle,
  FiRefreshCw,
  FiSend,
  FiCreditCard,
  FiDownload,
  FiInfo,
  FiSlash,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../shared/utils/api';
import PageTransition from '../../../shared/components/PageTransition';
import { formatPrice } from '../../../shared/utils/helpers';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'withdrawals', label: 'Withdrawals' },
  { id: 'payout', label: 'Payout Details' },
];

const StatusPill = ({ status }) => {
  const map = {
    paid: ['bg-emerald-500/10 text-emerald-400 border-emerald-500/20', FiCheckCircle, 'Paid'],
    approved: ['bg-sky-500/10 text-sky-400 border-sky-500/20', FiCheckCircle, 'Approved'],
    processing: ['bg-sky-500/10 text-sky-400 border-sky-500/20', FiClock, 'Processing'],
    pending: ['bg-amber-500/10 text-amber-400 border-amber-500/20', FiClock, 'Under Review'],
    rejected: ['bg-rose-500/10 text-rose-400 border-rose-500/20', FiXCircle, 'Rejected'],
    failed: ['bg-rose-500/10 text-rose-400 border-rose-500/20', FiXCircle, 'Failed'],
    cancelled: ['bg-slate-500/20 text-slate-400 border-slate-500/30', FiSlash, 'Cancelled'],
  };
  const [cls, Icon, label] = map[status] || ['bg-slate-500/10 text-slate-400 border-slate-500/20', FiInfo, status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${cls}`}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </span>
  );
};

const StateChip = ({ state }) => {
  const map = {
    PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    AVAILABLE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    LOCKED: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    SETTLED: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    REVERSED: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  };
  return (
    <span className={`inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${map[state] || map.SETTLED}`}>
      {state}
    </span>
  );
};

const SkeletonCard = () => (
  <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 animate-pulse space-y-3">
    <div className="h-3 w-24 bg-slate-800 rounded" />
    <div className="h-7 w-32 bg-slate-800 rounded" />
    <div className="h-2 w-40 bg-slate-800/70 rounded" />
  </div>
);

const Wallet = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [payoutDetails, setPayoutDetails] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amount, setAmount] = useState('');

  const [payoutForm, setPayoutForm] = useState({
    method: 'upi', upiId: '', accountName: '', accountNumber: '', ifscCode: '', bankName: '',
  });
  const [isSavingPayout, setIsSavingPayout] = useState(false);

  const unwrap = (res, key) => res?.data?.data?.[key] ?? res?.data?.[key] ?? [];

  const loadAll = useCallback(async (showToast = false) => {
    try {
      if (showToast) setIsRefreshing(true); else setIsLoading(true);
      setLoadError('');

      const [summaryRes, txRes, wdRes, payoutRes] = await Promise.all([
        api.get('/delivery/wallet/summary'),
        api.get('/delivery/wallet/transactions', { params: { limit: 50 } }),
        api.get('/delivery/wallet/withdrawals', { params: { limit: 25 } }),
        api.get('/delivery/wallet/payout-details'),
      ]);

      const summaryPayload = summaryRes?.data?.data || summaryRes?.data || {};
      setSummary(summaryPayload);
      setTransactions(unwrap(txRes, 'transactions'));
      setWithdrawals(unwrap(wdRes, 'requests'));

      const payout = payoutRes?.data?.data || payoutRes?.data || {};
      setPayoutDetails(payout);
      if (payout.method) {
        setPayoutForm((prev) => ({
          ...prev,
          method: payout.method,
          upiId: payout.upiId || '',
          accountName: payout.accountName || '',
          ifscCode: payout.ifscCode || '',
          bankName: payout.bankName || '',
          accountNumber: '',
        }));
      }

      if (showToast) toast.success('Wallet refreshed');
    } catch (err) {
      setLoadError(err?.response?.data?.message || 'We could not load your wallet. Pull to refresh or try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const openWithdraw = () => {
    if (!summary?.canWithdraw) {
      toast.error(summary?.blockers?.[0]?.message || 'Withdrawals are not available right now.');
      return;
    }
    setAmount(String(summary.availableBalance));
    setIsWithdrawOpen(true);
  };

  const submitWithdrawal = async (e) => {
    e.preventDefault();
    const numeric = Number(amount);
    if (!numeric || numeric <= 0) { toast.error('Enter a valid amount.'); return; }
    if (numeric > summary.availableBalance) {
      toast.error(`Amount cannot exceed your available balance (${formatPrice(summary.availableBalance)}).`);
      return;
    }
    if (numeric < summary.policy.minWithdrawalAmount) {
      toast.error(`The minimum withdrawal is ${formatPrice(summary.policy.minWithdrawalAmount)}.`);
      return;
    }

    try {
      setIsSubmitting(true);
      // Idempotency key survives a retry on a flaky mobile connection, so a
      // double-tap or an auto-retry cannot create two withdrawals.
      await api.post('/delivery/wallet/withdrawals', { amount: numeric }, {
        headers: { 'x-idempotency-key': `wd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
      });
      toast.success('Withdrawal request submitted for review.');
      setIsWithdrawOpen(false);
      loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not submit the withdrawal request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelWithdrawal = async (id) => {
    try {
      await api.post(`/delivery/wallet/withdrawals/${id}/cancel`);
      toast.success('Request cancelled. Funds are back in your available balance.');
      loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not cancel the request.');
    }
  };

  const savePayoutDetails = async (e) => {
    e.preventDefault();
    try {
      setIsSavingPayout(true);
      const body = payoutForm.method === 'upi'
        ? { method: 'upi', upiId: payoutForm.upiId.trim(), accountName: payoutForm.accountName.trim() }
        : {
            method: 'bank_transfer',
            accountNumber: payoutForm.accountNumber.trim(),
            ifscCode: payoutForm.ifscCode.trim().toUpperCase(),
            accountName: payoutForm.accountName.trim(),
            bankName: payoutForm.bankName.trim(),
          };
      await api.put('/delivery/wallet/payout-details', body);
      toast.success('Payout details saved.');
      loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not save your payout details.');
    } finally {
      setIsSavingPayout(false);
    }
  };

  const downloadStatement = async () => {
    try {
      const res = await api.get('/delivery/wallet/statement', {
        params: { format: 'csv' },
        responseType: 'blob',
      });
      const blob = new Blob([res?.data ?? res], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wallet-statement-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('Statement downloaded.');
    } catch {
      toast.error('Could not download the statement.');
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <PageTransition>
        <div className="space-y-6 pb-12">
          <div className="h-24 rounded-2xl bg-slate-900/60 border border-slate-800 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
          <div className="h-64 rounded-2xl bg-slate-900/40 border border-slate-800/80 animate-pulse" />
        </div>
      </PageTransition>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <PageTransition>
        <div className="flex flex-col items-center justify-center py-24 px-6 text-center gap-4">
          <span className="p-4 rounded-2xl bg-rose-500/10 text-rose-400"><FiAlertTriangle className="w-8 h-8" /></span>
          <div>
            <h2 className="text-lg font-bold text-slate-100">Wallet unavailable</h2>
            <p className="text-sm text-slate-400 mt-1 max-w-sm">{loadError}</p>
          </div>
          <button
            onClick={() => loadAll()}
            className="px-4 py-2 text-sm font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors"
          >
            Try again
          </button>
        </div>
      </PageTransition>
    );
  }

  const stats = [
    { label: 'Available', value: summary.availableBalance, icon: FiTrendingUp, tone: 'emerald', hint: 'Ready to withdraw' },
    { label: 'Pending', value: summary.pendingBalance, icon: FiClock, tone: 'amber', hint: summary.nextMaturingAt ? `Next matures ${new Date(summary.nextMaturingAt).toLocaleDateString('en-IN')}` : 'Matures after the return window' },
    { label: 'Locked', value: summary.lockedBalance, icon: FiLock, tone: 'sky', hint: 'Held against an open request' },
    { label: 'Lifetime Earned', value: summary.lifetimeEarned, icon: FiCheckCircle, tone: 'slate', hint: `${formatPrice(summary.lifetimeWithdrawn)} withdrawn` },
  ];

  const toneMap = {
    emerald: 'bg-emerald-500/10 text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-400',
    sky: 'bg-sky-500/10 text-sky-400',
    slate: 'bg-slate-500/10 text-slate-300',
  };

  return (
    <PageTransition>
      <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800 backdrop-blur-xl">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
              <FiTrendingUp className="text-emerald-400" /> Earnings & Wallet
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Your delivery earnings, and payouts to your UPI or bank account.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => loadAll(true)}
              disabled={isRefreshing}
              className="px-3.5 py-2 text-sm font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 rounded-xl border border-slate-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <FiRefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              onClick={openWithdraw}
              disabled={!summary.canWithdraw}
              title={summary.canWithdraw ? 'Request a payout' : summary.blockers?.[0]?.message}
              className="px-4 py-2 text-sm font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FiSend className="w-4 h-4" /> Withdraw
            </button>
          </div>
        </div>

        {/* Why the Withdraw button is disabled — never leave a dead control unexplained */}
        {!summary.canWithdraw && summary.blockers?.length > 0 && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
            <div className="flex items-center gap-2">
              <FiAlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <h4 className="text-sm font-semibold text-amber-300">Withdrawals are paused</h4>
            </div>
            <ul className="space-y-1 pl-6">
              {summary.blockers.map((blocker) => (
                <li key={blocker.code} className="text-xs text-amber-400/90 list-disc">{blocker.message}</li>
              ))}
            </ul>
          </div>
        )}

        {/* COD interlock context */}
        {summary.codCashInHand > 0 && (
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 flex items-start gap-3">
            <FiInfo className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400">
              You are holding <strong className="text-slate-200">{formatPrice(summary.codCashInHand)}</strong> in
              COD cash that belongs to DwellMart. This is separate from your earnings and must be settled
              from the Cash &amp; Settlement screen.
            </p>
          </div>
        )}

        {/* Balances */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(({ label, value, icon: Icon, tone, hint }) => (
            <div key={label} className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">{label}</span>
                <span className={`p-2 rounded-xl ${toneMap[tone]}`}><Icon className="w-4 h-4" /></span>
              </div>
              <p className="text-2xl font-bold text-slate-100 tabular-nums">{formatPrice(value)}</p>
              <p className="text-[11px] text-slate-500">{hint}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-slate-900/60 border border-slate-800 rounded-xl overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-semibold rounded-lg whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-emerald-400 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Overview ─────────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-4">
              <h3 className="text-sm font-bold text-slate-200">How your earnings work</h3>
              <ol className="space-y-3 text-xs text-slate-400">
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-amber-500/15 text-amber-400 grid place-items-center font-bold shrink-0">1</span>
                  <span>Every completed delivery credits your wallet as <strong className="text-amber-400">Pending</strong>.</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center font-bold shrink-0">2</span>
                  <span>Once the customer&apos;s return window closes, it becomes <strong className="text-emerald-400">Available</strong> to withdraw.</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-sky-500/15 text-sky-400 grid place-items-center font-bold shrink-0">3</span>
                  <span>When you request a payout the amount is <strong className="text-sky-400">Locked</strong> until it is paid.</span>
                </li>
              </ol>
            </div>

            {summary.openWithdrawal && (
              <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                    <FiClock className="w-4 h-4" /> Withdrawal in progress
                  </h4>
                  <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/20 px-2.5 py-1 rounded-full border border-amber-500/30">
                    {summary.openWithdrawal.requestNumber}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block">Amount</span>
                    <strong className="text-slate-100 text-sm">{formatPrice(summary.openWithdrawal.amount)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Status</span>
                    <StatusPill status={summary.openWithdrawal.status} />
                  </div>
                  <div>
                    <span className="text-slate-400 block">Requested</span>
                    <strong className="text-slate-200">{new Date(summary.openWithdrawal.requestedAt || summary.openWithdrawal.createdAt).toLocaleDateString('en-IN')}</strong>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={downloadStatement}
              className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 rounded-xl border border-slate-700 transition-colors flex items-center justify-center gap-2"
            >
              <FiDownload className="w-4 h-4" /> Download statement (CSV)
            </button>
          </div>
        )}

        {/* ── Transactions ─────────────────────────────────────────────────── */}
        {activeTab === 'transactions' && (
          <div className="rounded-2xl bg-slate-900/40 border border-slate-800/80 overflow-hidden">
            {transactions.length === 0 ? (
              <div className="py-16 px-6 text-center space-y-3">
                <span className="inline-flex p-4 rounded-2xl bg-slate-800/60 text-slate-500"><FiTrendingUp className="w-7 h-7" /></span>
                <h3 className="text-sm font-bold text-slate-300">No transactions yet</h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Complete your first delivery and your earnings will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {transactions.map((tx) => (
                  <div key={tx._id} className="p-4 flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-200">
                          {tx.type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
                        </span>
                        <StateChip state={tx.state} />
                      </div>
                      <p className="text-xs text-slate-500 truncate">{tx.description || '—'}</p>
                      <p className="text-[11px] text-slate-600">
                        {new Date(tx.createdAt).toLocaleString('en-IN')}
                        {tx.orderId?.orderId ? ` · Order ${tx.orderId.orderId}` : ''}
                      </p>
                    </div>
                    <span className={`text-sm font-bold tabular-nums shrink-0 ${tx.direction === 'CREDIT' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {tx.direction === 'CREDIT' ? '+' : '−'}{formatPrice(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Withdrawals ──────────────────────────────────────────────────── */}
        {activeTab === 'withdrawals' && (
          <div className="rounded-2xl bg-slate-900/40 border border-slate-800/80 overflow-hidden">
            {withdrawals.length === 0 ? (
              <div className="py-16 px-6 text-center space-y-3">
                <span className="inline-flex p-4 rounded-2xl bg-slate-800/60 text-slate-500"><FiSend className="w-7 h-7" /></span>
                <h3 className="text-sm font-bold text-slate-300">No withdrawals yet</h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  When you request a payout it will show here with its review status.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {withdrawals.map((wd) => (
                  <div key={wd._id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-100 tabular-nums">{formatPrice(wd.amount)}</p>
                        <p className="text-[11px] font-mono text-slate-500">{wd.requestNumber}</p>
                      </div>
                      <StatusPill status={wd.status} />
                    </div>
                    <p className="text-[11px] text-slate-600">
                      {new Date(wd.requestedAt || wd.createdAt).toLocaleString('en-IN')}
                      {' · '}{wd.method === 'upi' ? 'UPI' : 'Bank transfer'}
                      {wd.utr ? ` · UTR ${wd.utr}` : ''}
                    </p>
                    {wd.rejectionReason && (
                      <p className="text-xs text-rose-400/90 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                        {wd.rejectionReason}
                      </p>
                    )}
                    {wd.failureReason && (
                      <p className="text-xs text-rose-400/90 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                        {wd.failureReason}
                      </p>
                    )}
                    {wd.status === 'pending' && (
                      <button
                        onClick={() => cancelWithdrawal(wd._id)}
                        className="text-xs font-semibold text-slate-400 hover:text-rose-400 transition-colors"
                      >
                        Cancel request
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Payout details ───────────────────────────────────────────────── */}
        {activeTab === 'payout' && (
          <form onSubmit={savePayoutDetails} className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <FiCreditCard className="text-emerald-400" /> Where should we pay you?
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Changing this pauses withdrawals for {summary.policy?.payoutCoolingOffHours ?? 24} hours for your security.
                </p>
              </div>
              {payoutDetails?.isVerified && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <FiCheckCircle className="w-3.5 h-3.5" /> Verified
                </span>
              )}
            </div>

            {payoutDetails?.isInCoolingOff && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
                <FiClock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-400/90">
                  Withdrawals resume on {new Date(payoutDetails.coolingOffUntil).toLocaleString('en-IN')}.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              {['upi', 'bank_transfer'].map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPayoutForm((p) => ({ ...p, method }))}
                  className={`flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl border transition-colors ${
                    payoutForm.method === method
                      ? 'bg-emerald-400/10 border-emerald-400/40 text-emerald-300'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {method === 'upi' ? 'UPI' : 'Bank account'}
                </button>
              ))}
            </div>

            {payoutForm.method === 'upi' ? (
              <div className="space-y-1.5">
                <label htmlFor="upiId" className="text-xs font-semibold text-slate-400">UPI ID</label>
                <input
                  id="upiId"
                  value={payoutForm.upiId}
                  onChange={(e) => setPayoutForm((p) => ({ ...p, upiId: e.target.value }))}
                  placeholder="name@bank"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-800/60 border border-slate-700 rounded-xl text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-400/50"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="accountName" className="text-xs font-semibold text-slate-400">Account holder name</label>
                  <input
                    id="accountName"
                    value={payoutForm.accountName}
                    onChange={(e) => setPayoutForm((p) => ({ ...p, accountName: e.target.value }))}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-800/60 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-400/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="accountNumber" className="text-xs font-semibold text-slate-400">
                    Account number {payoutDetails?.accountNumberMasked ? `(current ${payoutDetails.accountNumberMasked})` : ''}
                  </label>
                  <input
                    id="accountNumber"
                    inputMode="numeric"
                    value={payoutForm.accountNumber}
                    onChange={(e) => setPayoutForm((p) => ({ ...p, accountNumber: e.target.value }))}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-800/60 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-400/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="ifscCode" className="text-xs font-semibold text-slate-400">IFSC code</label>
                  <input
                    id="ifscCode"
                    value={payoutForm.ifscCode}
                    onChange={(e) => setPayoutForm((p) => ({ ...p, ifscCode: e.target.value.toUpperCase() }))}
                    placeholder="HDFC0001234"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-800/60 border border-slate-700 rounded-xl text-slate-100 placeholder:text-slate-600 uppercase focus:outline-none focus:border-emerald-400/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="bankName" className="text-xs font-semibold text-slate-400">Bank name (optional)</label>
                  <input
                    id="bankName"
                    value={payoutForm.bankName}
                    onChange={(e) => setPayoutForm((p) => ({ ...p, bankName: e.target.value }))}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-800/60 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-400/50"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSavingPayout}
              className="px-5 py-2.5 text-sm font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSavingPayout ? 'Saving…' : 'Save payout details'}
            </button>
          </form>
        )}

        {/* ── Withdraw modal ───────────────────────────────────────────────── */}
        {typeof document !== 'undefined' && createPortal(
          <AnimatePresence>
            {isWithdrawOpen && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-2xl"
                >
                  <div>
                    <h3 className="text-lg font-bold text-slate-100">Request a payout</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Available: <strong className="text-emerald-400">{formatPrice(summary.availableBalance)}</strong>
                    </p>
                  </div>

                  <form onSubmit={submitWithdrawal} className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="wdAmount" className="text-xs font-semibold text-slate-400">Amount</label>
                      <input
                        id="wdAmount"
                        type="number"
                        step="0.01"
                        min={summary.policy?.minWithdrawalAmount ?? 1}
                        max={summary.availableBalance}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm bg-slate-800/60 border border-slate-700 rounded-xl text-slate-100 tabular-nums focus:outline-none focus:border-emerald-400/50"
                      />
                      <p className="text-[11px] text-slate-500">
                        Minimum {formatPrice(summary.policy?.minWithdrawalAmount ?? 0)} · Maximum {formatPrice(summary.policy?.maxWithdrawalAmount ?? 0)} per request
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 text-xs text-slate-400">
                      Paid to{' '}
                      <strong className="text-slate-200">
                        {payoutDetails?.method === 'upi'
                          ? payoutDetails.upiId
                          : `${payoutDetails?.bankName || 'your bank'} ${payoutDetails?.accountNumberMasked || ''}`}
                      </strong>
                    </div>

                    <div className="flex gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsWithdrawOpen(false)}
                        className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? 'Submitting…' : 'Submit request'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
      </div>
    </PageTransition>
  );
};

export default Wallet;
