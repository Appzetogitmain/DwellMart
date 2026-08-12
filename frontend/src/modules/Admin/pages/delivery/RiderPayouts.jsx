import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiDollarSign,
  FiCheckCircle,
  FiXCircle,
  FiClock,
  FiAlertTriangle,
  FiRefreshCw,
  FiSearch,
  FiTrendingUp,
  FiLock,
  FiActivity,
} from "react-icons/fi";
import toast from "react-hot-toast";
import Pagination from "../../components/Pagination";
import AnimatedSelect from "../../components/AnimatedSelect";
import { formatCurrency } from "../../utils/adminHelpers";
import {
  getRiderWithdrawals,
  approveRiderWithdrawal,
  rejectRiderWithdrawal,
  markRiderWithdrawalPaid,
  markRiderWithdrawalFailed,
  getRiderWalletAnalytics,
} from "../../services/adminService";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending review" },
  { value: "approved", label: "Approved" },
  { value: "paid", label: "Paid" },
  { value: "rejected", label: "Rejected" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

const StatusBadge = ({ status }) => {
  const map = {
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    approved: "bg-sky-100 text-sky-700 border-sky-200",
    processing: "bg-sky-100 text-sky-700 border-sky-200",
    paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
    rejected: "bg-rose-100 text-rose-700 border-rose-200",
    failed: "bg-rose-100 text-rose-700 border-rose-200",
    cancelled: "bg-gray-100 text-gray-600 border-gray-200",
  };
  return (
    <span className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-full border capitalize ${map[status] || map.cancelled}`}>
      {status}
    </span>
  );
};

const StatCard = ({ label, value, hint, icon: Icon, tone = "gray" }) => {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    sky: "bg-sky-50 text-sky-600",
    rose: "bg-rose-50 text-rose-600",
    gray: "bg-gray-100 text-gray-600",
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500">{label}</span>
        <span className={`p-2 rounded-lg ${tones[tone]}`}><Icon className="w-4 h-4" /></span>
      </div>
      <p className="text-2xl font-bold text-gray-800 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
};

const RiderPayouts = () => {
  const [requests, setRequests] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [modal, setModal] = useState({ type: null, request: null });
  const [reason, setReason] = useState("");
  const [utr, setUtr] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = useCallback(async (page = 1, showToast = false) => {
    try {
      if (showToast) setIsRefreshing(true); else setIsLoading(true);
      setLoadError("");

      const [listRes, analyticsRes] = await Promise.all([
        getRiderWithdrawals({ page, limit: 20, status, search }),
        getRiderWalletAnalytics({ days: 30 }),
      ]);

      const payload = listRes?.data?.data || listRes?.data || {};
      setRequests(payload.requests || []);
      setPagination(payload.pagination || { page: 1, pages: 1, total: 0 });
      setAnalytics(analyticsRes?.data?.data || analyticsRes?.data || null);

      if (showToast) toast.success("Payout queue refreshed");
    } catch (err) {
      setLoadError(err?.response?.data?.message || "Could not load the payout queue.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [status, search]);

  useEffect(() => { loadData(1); }, [loadData]);

  const closeModal = () => {
    setModal({ type: null, request: null });
    setReason("");
    setUtr("");
  };

  const submitAction = async (e) => {
    e.preventDefault();
    const { type, request } = modal;
    if (!request) return;

    try {
      setIsSubmitting(true);
      if (type === "approve") {
        await approveRiderWithdrawal(request._id, reason.trim());
        toast.success("Withdrawal approved.");
      } else if (type === "reject") {
        if (reason.trim().length < 5) { toast.error("Give a reason of at least 5 characters."); return; }
        await rejectRiderWithdrawal(request._id, reason.trim());
        toast.success("Withdrawal rejected and funds released.");
      } else if (type === "paid") {
        if (utr.trim().length < 6) { toast.error("Enter the UTR or bank reference (at least 6 characters)."); return; }
        await markRiderWithdrawalPaid(request._id, { utr: utr.trim(), notes: reason.trim() });
        toast.success("Payout recorded.");
      } else if (type === "failed") {
        if (reason.trim().length < 5) { toast.error("Give a failure reason of at least 5 characters."); return; }
        await markRiderWithdrawalFailed(request._id, reason.trim());
        toast.success("Marked failed and funds released.");
      }
      closeModal();
      loadData(pagination.page);
    } catch (err) {
      toast.error(err?.response?.data?.message || "The action could not be completed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const liability = analytics?.liability;
  const aging = analytics?.aging;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Rider Payouts</h1>
          <p className="text-gray-600 text-sm mt-1">
            Review and settle delivery partner withdrawal requests.
          </p>
        </div>
        <button
          onClick={() => loadData(pagination.page, true)}
          disabled={isRefreshing}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <FiRefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Liability KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-white rounded-xl border border-gray-200 animate-pulse" />
          ))}
        </div>
      ) : liability && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Outstanding Liability"
            value={formatCurrency(liability.totalOutstandingLiability)}
            hint={`Across ${liability.walletCount} rider wallet(s)`}
            icon={FiDollarSign}
            tone="rose"
          />
          <StatCard
            label="Available to Withdraw"
            value={formatCurrency(liability.availableLiability)}
            hint={`${formatCurrency(liability.pendingLiability)} still maturing`}
            icon={FiTrendingUp}
            tone="emerald"
          />
          <StatCard
            label="Locked in Requests"
            value={formatCurrency(liability.lockedLiability)}
            hint={`${aging?.openCount ?? 0} open request(s)`}
            icon={FiLock}
            tone="sky"
          />
          <StatCard
            label="Oldest Open Request"
            value={`${aging?.oldestHours ?? 0}h`}
            hint={aging?.buckets?.over72h?.count
              ? `${aging.buckets.over72h.count} waiting over 72h`
              : "Nothing over 72h"}
            icon={FiClock}
            tone={aging?.buckets?.over72h?.count ? "amber" : "gray"}
          />
        </div>
      )}

      {/* Correction-rate signal */}
      {analytics?.corrections?.reversalCount > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
          <FiActivity className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-amber-800">
              {analytics.corrections.reversalRatePercent}% of earnings were reversed in the last {analytics.corrections.windowDays} days
            </h4>
            <p className="text-xs text-amber-700 mt-0.5">
              {analytics.corrections.reversalCount} reversal(s) worth {formatCurrency(analytics.corrections.reversalAmount)}.
              A rising rate usually points at a rate card or delivery-status problem upstream.
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by rider name, email, phone, or request number"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
          />
        </div>
        <div className="w-full sm:w-56">
          <AnimatedSelect
            value={status}
            onChange={(value) => setStatus(value)}
            options={STATUS_OPTIONS}
          />
        </div>
      </div>

      {/* Queue */}
      {loadError ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center space-y-3">
          <FiAlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
          <p className="text-sm text-gray-600">{loadError}</p>
          <button onClick={() => loadData(1)} className="px-4 py-2 text-sm font-semibold text-white bg-gray-800 rounded-lg">
            Try again
          </button>
        </div>
      ) : isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse bg-gray-50" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center space-y-3">
          <span className="inline-flex p-4 rounded-2xl bg-gray-100 text-gray-400"><FiDollarSign className="w-7 h-7" /></span>
          <h3 className="text-sm font-bold text-gray-700">No withdrawal requests</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            {status === "pending"
              ? "Nothing is waiting for review right now."
              : "No requests match the current filters."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3">Rider</th>
                  <th className="px-4 py-3">Request</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Wallet</th>
                  <th className="px-4 py-3 text-right">COD Dues</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requests.map((request) => (
                  <tr key={request._id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-800">{request.deliveryBoyId?.name || "Unknown"}</p>
                      <p className="text-xs text-gray-500">{request.deliveryBoyId?.phone || request.deliveryBoyId?.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs text-gray-700">{request.requestNumber}</p>
                      <p className="text-xs text-gray-500">
                        {request.method === "upi" ? "UPI" : "Bank"} · {request.ageHours}h ago
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-800 tabular-nums">
                      {formatCurrency(request.amount)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums">
                      <span className="text-emerald-600 font-semibold">{formatCurrency(request.riderAvailableBalance)}</span>
                      <span className="block text-gray-400">avail.</span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums">
                      {/* Surfaced next to the amount on purpose: paying a rider
                          who is still holding platform cash is the costliest
                          mistake available on this screen. */}
                      <span className={request.riderCodCashInHand > 0 ? "text-rose-600 font-bold" : "text-gray-400"}>
                        {formatCurrency(request.riderCodCashInHand)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={request.status} />
                      {request.riderPayoutBlocked && (
                        <span className="block mt-1 text-[10px] font-bold text-rose-600 uppercase">Payouts blocked</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {request.status === "pending" && (
                          <>
                            <button
                              onClick={() => setModal({ type: "approve", request })}
                              className="px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => setModal({ type: "reject", request })}
                              className="px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {request.status === "approved" && (
                          <>
                            <button
                              onClick={() => setModal({ type: "paid", request })}
                              className="px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                            >
                              Mark paid
                            </button>
                            <button
                              onClick={() => setModal({ type: "failed", request })}
                              className="px-2.5 py-1.5 text-xs font-semibold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                              Failed
                            </button>
                          </>
                        )}
                        {["paid", "rejected", "failed", "cancelled"].includes(request.status) && (
                          <span className="text-xs text-gray-400">
                            {request.utr ? `UTR ${request.utr}` : "—"}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination.pages > 1 && (
            <div className="p-4 border-t border-gray-200">
              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.pages}
                onPageChange={(page) => loadData(page)}
              />
            </div>
          )}
        </div>
      )}

      {/* Action modal */}
      <AnimatePresence>
        {modal.type && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white rounded-2xl p-6 space-y-5 shadow-2xl"
            >
              <div>
                <h3 className="text-lg font-bold text-gray-800">
                  {modal.type === "approve" && "Approve withdrawal"}
                  {modal.type === "reject" && "Reject withdrawal"}
                  {modal.type === "paid" && "Record payout"}
                  {modal.type === "failed" && "Mark payout failed"}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {formatCurrency(modal.request?.amount)} to{" "}
                  <strong>{modal.request?.deliveryBoyId?.name}</strong>
                  {modal.request?.payoutSnapshot?.method === "upi"
                    ? ` · ${modal.request.payoutSnapshot.upiId}`
                    : ` · ${modal.request?.payoutSnapshot?.bankName || "bank"} ${modal.request?.payoutSnapshot?.accountNumberMasked || ""}`}
                </p>
              </div>

              {modal.request?.riderCodCashInHand > 0 && modal.type === "approve" && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2">
                  <FiAlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-700">
                    This rider is holding <strong>{formatCurrency(modal.request.riderCodCashInHand)}</strong> in
                    unremitted COD cash. Confirm it is settled before approving.
                  </p>
                </div>
              )}

              <form onSubmit={submitAction} className="space-y-4">
                {modal.type === "paid" && (
                  <div className="space-y-1.5">
                    <label htmlFor="utr" className="text-xs font-semibold text-gray-600">
                      UTR / bank reference <span className="text-rose-600">*</span>
                    </label>
                    <input
                      id="utr"
                      value={utr}
                      onChange={(e) => setUtr(e.target.value)}
                      placeholder="e.g. N123456789012345"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
                    />
                    <p className="text-[11px] text-gray-500">
                      Recorded against the payout and unique across all payouts.
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="reason" className="text-xs font-semibold text-gray-600">
                    {modal.type === "approve" || modal.type === "paid" ? "Notes (optional)" : "Reason"}
                    {(modal.type === "reject" || modal.type === "failed") && <span className="text-rose-600"> *</span>}
                  </label>
                  <textarea
                    id="reason"
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={
                      modal.type === "reject" ? "The rider sees this. Explain the decision."
                        : modal.type === "failed" ? "What did the bank or rail report?"
                        : "Internal notes"
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-40 ${
                      modal.type === "reject" || modal.type === "failed"
                        ? "bg-rose-600 hover:bg-rose-700"
                        : "bg-emerald-600 hover:bg-emerald-700"
                    }`}
                  >
                    {isSubmitting ? "Working…" : "Confirm"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default RiderPayouts;
