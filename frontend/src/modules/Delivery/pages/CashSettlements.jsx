import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiDollarSign,
  FiCreditCard,
  FiClock,
  FiCheckCircle,
  FiXCircle,
  FiAlertTriangle,
  FiRefreshCw,
  FiSend,
  FiInfo,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../shared/utils/api';
import PageTransition from '../../../shared/components/PageTransition';
import { formatPrice } from '../../../shared/utils/helpers';

const CashSettlements = () => {
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [settlementMethod, setSettlementMethod] = useState('cash'); // Default physical cash
  const [amount, setAmount] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

  const loadData = async (showToast = false) => {
    try {
      if (showToast) setIsRefreshing(true);
      else setIsLoading(true);

      const [summaryRes, historyRes] = await Promise.all([
        api.get('/delivery/cash-settlements/summary'),
        api.get('/delivery/cash-settlements/history'),
      ]);

      const summaryPayload = summaryRes?.data?.data || summaryRes?.data || {};
      const historyPayload = historyRes?.data?.data?.settlements || historyRes?.data?.settlements || [];

      setSummary(summaryPayload);
      setHistory(historyPayload);
      if (summaryPayload.cashInHand) {
        setAmount(String(summaryPayload.cashInHand));
      }

      if (showToast) toast.success('Cash & settlement data refreshed');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load cash settlement data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenModal = () => {
    if (!summary || summary.cashInHand <= 0) {
      toast.error('You currently have no pending Cash In Hand to settle.');
      return;
    }
    if (summary.pendingSettlement) {
      toast.error('You already have a pending settlement request under review.');
      return;
    }
    setAmount(String(summary.cashInHand));
    setSettlementMethod('cash');
    setReferenceNumber('');
    setNotes('');
    setIsModalOpen(true);
  };

  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error('Please enter a valid positive settlement amount.');
      return;
    }
    if (numAmount > summary.cashInHand) {
      toast.error(`Settlement amount cannot exceed available Cash In Hand (${formatPrice(summary.cashInHand)}).`);
      return;
    }

    if (['upi', 'bank_transfer'].includes(settlementMethod) && (!referenceNumber || referenceNumber.trim().length < 3)) {
      toast.error('Reference / UTR number is required for digital settlements.');
      return;
    }

    try {
      setIsSubmitting(true);
      await api.post('/delivery/cash-settlements/request', {
        amount: numAmount,
        settlementMethod,
        referenceNumber: referenceNumber.trim(),
        notes: notes.trim(),
      });

      toast.success('Settlement request submitted to Admin successfully!');
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to submit settlement request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <FiCheckCircle className="w-3.5 h-3.5" /> Completed
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <FiClock className="w-3.5 h-3.5" /> Under Review
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <FiXCircle className="w-3.5 h-3.5" /> Rejected
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-500/20 text-slate-400 border border-slate-500/30">
            <FiXCircle className="w-3.5 h-3.5" /> Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20">
            {status}
          </span>
        );
    }
  };

  return (
    <PageTransition>
      <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800 backdrop-blur-xl">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
              <FiDollarSign className="text-emerald-400" /> Cash & Settlements
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage your Cash In Hand liabilities and submit handover settlement requests to Admin.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => loadData(true)}
              disabled={isRefreshing}
              className="px-3.5 py-2 text-sm font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 rounded-xl border border-slate-700 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <FiRefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              onClick={handleOpenModal}
              disabled={!summary || summary.cashInHand <= 0 || !!summary.pendingSettlement}
              className="px-4 py-2 text-sm font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FiSend className="w-4 h-4" /> Request Settlement
            </button>
          </div>
        </div>

        {/* Limit Warning Alert */}
        {summary?.isBlockedByLimit && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
            <FiAlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-amber-300">COD Cash Limit Exceeded</h4>
              <p className="text-xs text-amber-400/90 mt-0.5">
                Your Cash In Hand ({formatPrice(summary.cashInHand)}) has reached your maximum limit ({formatPrice(summary.maxCodCashLimit)}). New COD order assignments are blocked until you settle your cash with Admin.
              </p>
            </div>
          </div>
        )}

        {/* Settlement Under Review Banner */}
        {summary?.pendingSettlement && (
          <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FiClock className="w-5 h-5 text-amber-400" />
                <h4 className="text-sm font-bold text-amber-300">Settlement Under Review</h4>
              </div>
              <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/20 px-2.5 py-1 rounded-full border border-amber-500/30">
                {summary.pendingSettlement.settlementNumber}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block">Requested Amount</span>
                <strong className="text-slate-100 text-sm font-bold">{formatPrice(summary.pendingSettlement.amount)}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Handover Method</span>
                <strong className="text-slate-200 capitalize font-medium">{summary.pendingSettlement.settlementMethod?.replace('_', ' ')}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Requested Date</span>
                <strong className="text-slate-200 font-medium">{new Date(summary.pendingSettlement.requestedAt || summary.pendingSettlement.createdAt).toLocaleDateString()}</strong>
              </div>
              <div>
                <span className="text-slate-400 block">Status</span>
                <span className="text-amber-400 font-semibold">Pending Admin Review</span>
              </div>
            </div>
            <p className="text-xs text-amber-400/90 italic border-t border-amber-500/20 pt-2">
              Please wait for Admin to confirm your cash settlement before creating another request.
            </p>
          </div>
        )}

        {/* Summary Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400">Cash In Hand</span>
              <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                <FiDollarSign className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-100">
              {isLoading ? '...' : formatPrice(summary?.cashInHand || 0)}
            </div>
            <p className="text-xs text-slate-500">Unsettled cash from delivered COD orders</p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400">Pending Settlement</span>
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                <FiClock className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-bold text-amber-400">
              {isLoading ? '...' : formatPrice(summary?.pendingSettlementAmount || 0)}
            </div>
            <p className="text-xs text-slate-500">
              {summary?.pendingSettlement ? summary.pendingSettlement.settlementNumber : 'No request pending'}
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400">COD Collected Today</span>
              <span className="p-2 rounded-xl bg-sky-500/10 text-sky-400">
                <FiCreditCard className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-100">
              {isLoading ? '...' : formatPrice(summary?.codCollectedToday || 0)}
            </div>
            <p className="text-xs text-slate-500">Total COD collected today</p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400">Max COD Limit</span>
              <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
                <FiInfo className="w-4 h-4" />
              </span>
            </div>
            <div className="text-2xl font-bold text-slate-100">
              {isLoading ? '...' : formatPrice(summary?.maxCodCashLimit || 5000)}
            </div>
            <p className="text-xs text-slate-500">Configured platform cash threshold</p>
          </div>
        </div>

        {/* Settlement History */}
        <div className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="font-semibold text-slate-200">Settlement History</h3>
            <span className="text-xs text-slate-500">{history.length} records</span>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-slate-500 text-sm">Loading settlement history...</div>
          ) : history.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">No settlement history found.</div>
          ) : (
            <div className="divide-y divide-slate-800/60 overflow-x-auto">
              {history.map((item) => (
                <div key={item._id} className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-800/20 transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-slate-200">{item.settlementNumber}</span>
                      {getStatusBadge(item.status)}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-3">
                      <span>Method: <strong className="text-slate-300 capitalize">{item.settlementMethod.replace('_', ' ')}</strong></span>
                      {item.referenceNumber && <span>UTR/Ref: <code className="text-slate-300">{item.referenceNumber}</code></span>}
                      <span>Requested: {new Date(item.requestedAt || item.createdAt).toLocaleDateString()}</span>
                    </div>
                    {item.rejectionReason && (
                      <p className="text-xs text-rose-400 mt-1">Reason: {item.rejectionReason}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-base font-bold text-slate-100">{formatPrice(item.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Settlement Modal Portal */}
        {typeof document !== 'undefined' && createPortal(
          <AnimatePresence>
            {isModalOpen && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xl my-auto max-h-[85vh] overflow-y-auto"
                >
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <h3 className="text-lg font-bold text-slate-100">Request Cash Settlement</h3>
                    <button
                      onClick={() => setIsModalOpen(false)}
                      className="text-slate-400 hover:text-slate-200 text-sm"
                    >
                      ✕
                    </button>
                  </div>

                  <form onSubmit={handleSubmitRequest} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        Available Cash In Hand
                      </label>
                      <div className="p-3 rounded-xl bg-slate-800/60 font-bold text-emerald-400 text-lg border border-slate-700/60">
                        {formatPrice(summary?.cashInHand || 0)}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        Settlement Amount (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Enter amount to hand over"
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                        Handover Method
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setSettlementMethod('cash')}
                          className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                            settlementMethod === 'cash'
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Physical Cash
                        </button>
                        <button
                          type="button"
                          onClick={() => setSettlementMethod('upi')}
                          className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                            settlementMethod === 'upi'
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          UPI Transfer
                        </button>
                        <button
                          type="button"
                          onClick={() => setSettlementMethod('bank_transfer')}
                          className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                            settlementMethod === 'bank_transfer'
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Bank Transfer
                        </button>
                      </div>
                    </div>

                    {['upi', 'bank_transfer'].includes(settlementMethod) && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">
                          UTR / Transaction Reference No. <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={referenceNumber}
                          onChange={(e) => setReferenceNumber(e.target.value)}
                          placeholder="Enter UTR or Bank Reference ID"
                          required
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        Notes (Optional)
                      </label>
                      <textarea
                        rows={2}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add any instructions or remarks"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500 resize-none"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-all shadow-md disabled:opacity-50"
                      >
                        {isSubmitting ? 'Submitting...' : 'Submit Request'}
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

export default CashSettlements;
