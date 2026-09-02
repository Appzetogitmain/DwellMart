import React, { useState, useMemo, useEffect } from "react";
import {
  FiClock,
  FiCheckCircle,
  FiAlertCircle,
  FiX,
  FiSend,
  FiShield,
  FiArrowDownRight,
  FiArrowUpRight,
  FiCalendar,
  FiCopy,
  FiLock,
  FiFilter,
  FiDownload,
} from "react-icons/fi";
import { FaCoins } from "react-icons/fa6";
import { motion, AnimatePresence } from "framer-motion";
import ExportButton from "../../Admin/components/ExportButton";
import { formatPrice } from "../../../shared/utils/helpers";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import { getVendorEarnings, requestVendorPayout } from "../services/vendorService";
import toast from "react-hot-toast";

const WalletHistory = () => {
  const { vendor } = useVendorAuthStore();

  const [transactions, setTransactions] = useState([]);
  const [filterType, setFilterType] = useState("all");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [walletSummary, setWalletSummary] = useState(null);
  const [recentRejectedSettlement, setRecentRejectedSettlement] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestPayoutModalOpen, setRequestPayoutModalOpen] = useState(false);
  const [copiedUtr, setCopiedUtr] = useState(null);

  const vendorId = vendor?.id || vendor?._id;

  const fetchWallet = async () => {
    if (!vendorId) return;
    setIsLoading(true);
    try {
      const res = await getVendorEarnings();
      const data = res?.data ?? res;
      const commissions = Array.isArray(data?.commissions) ? data.commissions : [];
      const settlements = Array.isArray(data?.settlements) ? data.settlements : [];

      const rejected = settlements.find((s) => s.status === "rejected");
      if (rejected) {
        setRecentRejectedSettlement(rejected);
      }

      const allTransactions = [
        ...commissions.map((c) => ({
          id: c._id || c.id,
          type: "earning",
          orderId: c.orderDisplayId || c.orderRef || c.orderId,
          amount: c.vendorEarnings,
          commission: c.commission,
          status: c.isEscrowLocked ? "escrow" : (c.effectiveStatus || c.status),
          isEscrowLocked: c.isEscrowLocked,
          date: c.orderDate || c.createdAt,
          description: `Order Revenue (${c.orderDisplayId || c.orderRef || c.orderId})`,
          paymentMethod: null,
          transactionId: null,
        })),
        ...settlements.map((s) => ({
          id: s._id || s.id,
          type: "settlement",
          orderId: null,
          amount: s.amount,
          commission: 0,
          status: s.status,
          rejectionReason: s.rejectionReason,
          isEscrowLocked: false,
          date: s.createdAt,
          description: s.status === "rejected" ? "Payout Request Rejected" : "Settlement Payout",
          paymentMethod: s.paymentMethod,
          transactionId: s.transactionId,
        })),
      ].sort((a, b) => new Date(b.date) - new Date(a.date));

      setTransactions(allTransactions);
      setWalletSummary(data?.summary || null);
    } catch {
      setTransactions([]);
      setWalletSummary(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWallet();
  }, [vendorId]);

  const confirmRequestPayout = async () => {
    if (!walletSummary || (walletSummary.withdrawableEarnings || 0) < 500) {
      toast.error("Minimum withdrawable balance must be ₹500.");
      return;
    }

    setIsRequesting(true);
    try {
      await requestVendorPayout({ paymentMethod: "bank_transfer" });
      toast.success("✓ Payout request submitted successfully!");
      setRequestPayoutModalOpen(false);
      await fetchWallet();
    } catch (err) {
      toast.error(err?.response?.data?.message || "✕ Failed to request payout.");
    } finally {
      setIsRequesting(false);
    }
  };

  const handleCopyUtr = (utr) => {
    if (!utr) return;
    navigator.clipboard.writeText(utr);
    setCopiedUtr(utr);
    toast.success(`Copied UTR: ${utr}`);
    setTimeout(() => setCopiedUtr(null), 2000);
  };

  const filteredTransactions = useMemo(() => {
    let filtered = transactions;

    if (filterType !== "all") {
      filtered = filtered.filter((t) => t.type === filterType);
    }

    if (dateRange.start) {
      filtered = filtered.filter(
        (t) => new Date(t.date) >= new Date(dateRange.start)
      );
    }
    if (dateRange.end) {
      filtered = filtered.filter(
        (t) => new Date(t.date) <= new Date(dateRange.end)
      );
    }

    return filtered;
  }, [transactions, filterType, dateRange]);

  const walletBalance = walletSummary?.totalEarnings || 0;
  const withdrawableBalance = walletSummary?.withdrawableEarnings || 0;
  const lockedBalance = walletSummary?.lockedEarnings || 0;
  const requestedBalance = walletSummary?.requestedEarnings || 0;

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 font-medium">Please log in to view wallet history</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-full overflow-x-hidden">
      
      {/* ── Top Header Bar ────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Wallet History & Ledger
            </h1>
            <span className="bg-emerald-50 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-emerald-200">
              Live Balance
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Real-time track of vendor net earnings, 7-day escrow maturities, and bank payout requests.
          </p>
        </div>

        <button
          onClick={() => setRequestPayoutModalOpen(true)}
          disabled={isRequesting || withdrawableBalance < 500 || requestedBalance > 0}
          className={`px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 ${
            withdrawableBalance >= 500 && requestedBalance === 0
              ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-600/20 hover:scale-[1.02]"
              : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
          }`}>
          <FiSend className="text-base" />
          <span>{requestedBalance > 0 ? "Payout Request Pending" : "Request Payout"}</span>
        </button>
      </div>

      {/* ── Rejection Alert Banner ─────────────────────────────────────── */}
      <AnimatePresence>
        {recentRejectedSettlement && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-2xl p-4 flex items-start justify-between gap-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-100 rounded-xl text-red-600">
                <FiAlertCircle className="text-xl flex-shrink-0" />
              </div>
              <div>
                <h4 className="font-bold text-red-950 text-sm">
                  Payout Request Rejected ({formatPrice(recentRejectedSettlement.amount)})
                </h4>
                <p className="text-xs text-red-800 mt-1">
                  Reason: <strong className="font-semibold">{recentRejectedSettlement.rejectionReason || "Bank account details verification failed."}</strong>
                </p>
                <p className="text-[11px] text-red-700 mt-1 font-semibold flex items-center gap-1">
                  <FiCheckCircle /> The funds have been safely returned to your withdrawable balance.
                </p>
              </div>
            </div>
            <button
              onClick={() => setRecentRejectedSettlement(null)}
              className="text-red-400 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-100 transition-colors">
              <FiX className="text-lg" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Wallet Metric Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Total Earnings */}
        <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 rounded-2xl p-5 text-white shadow-xl shadow-indigo-600/10 border border-indigo-500/20 relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/5 rounded-full blur-xl group-hover:scale-125 transition-transform" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-indigo-200 uppercase tracking-wider">
              Total Revenue
            </span>
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md">
              <FaCoins className="text-xl text-indigo-100" />
            </div>
          </div>
          <p className="text-3xl font-extrabold tracking-tight">{formatPrice(walletBalance)}</p>
          <p className="text-xs text-indigo-200 mt-2 font-medium">All-time net earnings</p>
        </div>

        {/* 2. Withdrawable Balance */}
        <div className="bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-800 rounded-2xl p-5 text-white shadow-xl shadow-emerald-600/10 border border-emerald-500/20 relative overflow-hidden group flex flex-col justify-between">
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/5 rounded-full blur-xl group-hover:scale-125 transition-transform" />
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-emerald-200 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
                Withdrawable
              </span>
              <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md">
                <FiCheckCircle className="text-xl text-emerald-100" />
              </div>
            </div>
            <p className="text-3xl font-extrabold tracking-tight">{formatPrice(withdrawableBalance)}</p>
            <p className="text-xs text-emerald-100 mt-2 font-medium">Available to transfer to bank</p>
          </div>
        </div>

        {/* 3. Locked Escrow Balance */}
        <div className="bg-gradient-to-br from-amber-500 via-orange-600 to-amber-700 rounded-2xl p-5 text-white shadow-xl shadow-amber-500/10 border border-amber-400/20 relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/5 rounded-full blur-xl group-hover:scale-125 transition-transform" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-amber-100 uppercase tracking-wider">
              Escrow Hold
            </span>
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md">
              <FiLock className="text-xl text-amber-100" />
            </div>
          </div>
          <p className="text-3xl font-extrabold tracking-tight">{formatPrice(lockedBalance)}</p>
          <p className="text-xs text-amber-100 mt-2 font-medium">Matures automatically after 7 days</p>
        </div>

        {/* 4. Payout Requested Card */}
        {requestedBalance > 0 ? (
          <div className="bg-gradient-to-br from-purple-600 via-fuchsia-700 to-pink-800 rounded-2xl p-5 text-white shadow-xl shadow-purple-600/10 border border-purple-500/20 relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/5 rounded-full blur-xl group-hover:scale-125 transition-transform" />
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-purple-200 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-300 animate-ping" />
                Requested
              </span>
              <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md">
                <FiClock className="text-xl text-purple-100" />
              </div>
            </div>
            <p className="text-3xl font-extrabold tracking-tight">{formatPrice(requestedBalance)}</p>
            <p className="text-xs text-purple-200 mt-2 font-medium">Awaiting Admin Bank Transfer</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Payout Threshold
              </span>
              <FiShield className="text-lg text-gray-400" />
            </div>
            <p className="text-2xl font-bold text-gray-900">₹500.00</p>
            <p className="text-xs text-gray-500 mt-2 font-medium">Minimum balance required for withdrawal</p>
          </div>
        )}
      </div>

      {/* ── Filters & Controls Container ───────────────────────────────── */}
      <div className="bg-white rounded-2xl p-5 shadow-xs border border-gray-200/80 space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          
          {/* Segmented Filter Buttons */}
          <div className="flex bg-gray-100/80 p-1 rounded-xl border border-gray-200/60 self-start">
            {[
              { id: "all", label: "All Activity" },
              { id: "earning", label: "Earnings" },
              { id: "settlement", label: "Payouts" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterType(tab.id)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  filterType === tab.id
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-800"
                }`}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Date Pickers & Export */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl">
              <FiCalendar className="text-gray-400 text-sm" />
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) =>
                  setDateRange({ ...dateRange, start: e.target.value })
                }
                className="bg-transparent text-xs font-semibold text-gray-700 focus:outline-none"
              />
              <span className="text-gray-400 text-xs">to</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) =>
                  setDateRange({ ...dateRange, end: e.target.value })
                }
                className="bg-transparent text-xs font-semibold text-gray-700 focus:outline-none"
              />
            </div>

            <ExportButton
              data={filteredTransactions}
              headers={[
                {
                  label: "Date",
                  accessor: (row) => new Date(row.date).toLocaleDateString(),
                },
                { label: "Description", accessor: (row) => row.description },
                { label: "Type", accessor: (row) => row.type },
                { label: "Amount", accessor: (row) => formatPrice(row.amount) },
                { label: "Status", accessor: (row) => row.status },
                {
                  label: "Payment Method",
                  accessor: (row) => row.paymentMethod || "N/A",
                },
                {
                  label: "UTR Reference",
                  accessor: (row) => row.transactionId || "N/A",
                },
              ]}
              filename="vendor-wallet-history"
            />
          </div>
        </div>

        {/* ── Transactions List Card Group ─────────────────────────────── */}
        {isLoading ? (
          <div className="text-center py-16">
            <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500">Fetching wallet ledger...</p>
          </div>
        ) : filteredTransactions.length > 0 ? (
          <div className="space-y-3 pt-2">
            {filteredTransactions.map((transaction) => {
              const isEarning = transaction.type === "earning";
              return (
                <div
                  key={transaction.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white border border-gray-200/70 hover:border-gray-300 hover:shadow-sm transition-all group">
                  
                  {/* Left Info Group */}
                  <div className="flex items-start sm:items-center gap-3.5 flex-1">
                    <div
                      className={`p-3 rounded-2xl flex-shrink-0 ${
                        isEarning
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                          : "bg-purple-50 text-purple-600 border border-purple-100"
                      }`}>
                      {isEarning ? (
                        <FiArrowUpRight className="text-xl" />
                      ) : (
                        <FiArrowDownRight className="text-xl" />
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold text-gray-900 text-sm sm:text-base group-hover:text-emerald-700 transition-colors">
                          {transaction.description}
                        </h4>
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md tracking-wider ${
                            isEarning
                              ? "bg-blue-50 text-blue-700 border border-blue-100"
                              : "bg-purple-50 text-purple-700 border border-purple-100"
                          }`}>
                          {transaction.type}
                        </span>
                        {transaction.transactionId && (
                          <button
                            onClick={() => handleCopyUtr(transaction.transactionId)}
                            className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-0.5 rounded-md transition-colors"
                            title="Click to copy UTR">
                            <FiCopy className="text-[10px]" />
                            <span>UTR: {transaction.transactionId}</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>
                          {new Date(transaction.date).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        {transaction.paymentMethod && (
                          <>
                            <span>•</span>
                            <span className="capitalize">
                              {transaction.paymentMethod.replace("_", " ")}
                            </span>
                          </>
                        )}
                      </div>

                      {transaction.rejectionReason && (
                        <p className="text-xs text-red-700 font-semibold bg-red-50 px-2.5 py-1 rounded-lg border border-red-100 mt-1">
                          Rejection Reason: {transaction.rejectionReason}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right Amount & Status Group */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                    <div className="text-left sm:text-right">
                      <p className="text-xs text-gray-400 font-semibold">Net Amount</p>
                      <p
                        className={`text-base sm:text-lg font-extrabold ${
                          isEarning ? "text-emerald-600" : "text-purple-600"
                        }`}>
                        {isEarning ? "+" : ""} {formatPrice(transaction.amount)}
                      </p>
                    </div>

                    <div className="flex-shrink-0">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                          transaction.status === "completed" || transaction.status === "paid"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            : transaction.status === "requested"
                            ? "bg-purple-100 text-purple-800 border border-purple-200"
                            : transaction.status === "escrow" || transaction.status === "pending"
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : "bg-red-100 text-red-800 border border-red-200"
                        }`}>
                        {transaction.status === "completed" || transaction.status === "paid" ? (
                          <FiCheckCircle className="text-emerald-600" />
                        ) : transaction.status === "escrow" ? (
                          <FiLock className="text-amber-600" />
                        ) : transaction.status === "requested" ? (
                          <FiClock className="text-purple-600" />
                        ) : (
                          <FiAlertCircle className="text-red-600" />
                        )}
                        <span className="capitalize">
                          {transaction.status === "escrow"
                            ? "Locked (Escrow)"
                            : transaction.status === "requested"
                            ? "Awaiting Transfer"
                            : transaction.status}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
            <FiFilter className="text-3xl text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-600">No transactions match your filters</p>
            <p className="text-xs text-gray-400 mt-1">Try resetting your date range or transaction type</p>
          </div>
        )}
      </div>

      {/* ── CUSTOM REQUEST PAYOUT CONFIRMATION MODAL ──────────────────────── */}
      <AnimatePresence>
        {requestPayoutModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-gray-100">
              <div className="flex items-center gap-3 mb-4 text-emerald-700">
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                  <FiSend className="text-2xl text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    Request Payout
                  </h3>
                  <p className="text-xs text-gray-500">
                    Submit withdrawal request to Dwell Mart Admin
                  </p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-4 rounded-xl border border-emerald-100">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-600 font-semibold">
                      Withdrawable Amount
                    </span>
                    <span className="text-2xl font-bold text-emerald-700">
                      {formatPrice(withdrawableBalance)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 flex justify-between pt-2 border-t border-emerald-200/50 mt-2">
                    <span>Payment Method:</span>
                    <strong className="text-gray-800">Bank Transfer / UPI</strong>
                  </div>
                </div>

                <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 text-xs space-y-2 text-gray-600">
                  <div className="flex justify-between">
                    <span>Vendor:</span>
                    <strong className="text-gray-900 font-semibold">{vendor?.storeName || vendor?.name}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Bank Name:</span>
                    <strong className="text-gray-900 font-semibold">{vendor?.bankDetails?.bankName || "Registered Bank"}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Account Number:</span>
                    <strong className="text-gray-900 font-mono font-bold">
                      {vendor?.bankDetails?.accountNumber
                        ? "•••• " + vendor.bankDetails.accountNumber.slice(-4)
                        : "Registered Account"}
                    </strong>
                  </div>
                </div>

                <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 text-xs text-blue-900 flex items-start gap-2">
                  <FiShield className="text-blue-600 text-base flex-shrink-0 mt-0.5" />
                  <span>
                    Your payout request will be submitted to Admin for direct bank transfer.
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setRequestPayoutModalOpen(false)}
                  disabled={isRequesting}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition-colors">
                  Cancel
                </button>
                <button
                  onClick={confirmRequestPayout}
                  disabled={isRequesting}
                  className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-sm font-bold shadow-md transition-all flex items-center gap-2">
                  {isRequesting ? "Submitting..." : "Confirm Request"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default WalletHistory;
