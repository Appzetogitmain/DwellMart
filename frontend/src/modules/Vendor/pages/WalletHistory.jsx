import React, { useState, useMemo, useEffect } from "react";
import {
  FiDollarSign,
  FiClock,
  FiCheckCircle,
  FiAlertCircle,
  FiX,
  FiSend,
  FiShield,
} from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import Badge from "../../../shared/components/Badge";
import ExportButton from "../../Admin/components/ExportButton";
import AnimatedSelect from "../../Admin/components/AnimatedSelect";
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
          description: `Earning from Order ${c.orderDisplayId || c.orderRef || c.orderId}`,
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
        <p className="text-gray-500">Please log in to view wallet history</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            Wallet History
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            View your earnings and payment history
          </p>
        </div>
      </div>

      {/* Rejection Alert Banner (if recent payout was rejected) */}
      {recentRejectedSettlement && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start justify-between gap-3 shadow-sm">
          <div className="flex items-start gap-3">
            <FiAlertCircle className="text-red-600 text-xl flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-red-900 text-sm">
                Recent Payout Request Rejected ({formatPrice(recentRejectedSettlement.amount)})
              </h4>
              <p className="text-xs text-red-700 mt-1">
                Reason: <strong>{recentRejectedSettlement.rejectionReason || "Bank account details verification failed."}</strong>
              </p>
              <p className="text-[11px] text-red-600 mt-1 font-medium">
                The funds have been safely returned to your withdrawable balance.
              </p>
            </div>
          </div>
          <button
            onClick={() => setRecentRejectedSettlement(null)}
            className="text-red-400 hover:text-red-700 p-1 rounded-lg transition-colors">
            <FiX className="text-lg" />
          </button>
        </div>
      )}

      {/* Wallet Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <p className="text-blue-100 font-medium">Total Earnings</p>
            <FiDollarSign className="text-2xl text-blue-200" />
          </div>
          <p className="text-3xl font-bold">{formatPrice(walletBalance)}</p>
          <p className="text-sm text-blue-100 mt-2">All time earnings</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-green-100 font-medium">Withdrawable Balance</p>
              <FiCheckCircle className="text-2xl text-green-200" />
            </div>
            <p className="text-3xl font-bold">{formatPrice(withdrawableBalance)}</p>
            <p className="text-sm text-green-100 mt-2">Available to withdraw</p>
          </div>
          <button
            onClick={() => setRequestPayoutModalOpen(true)}
            disabled={isRequesting || withdrawableBalance < 500 || requestedBalance > 0}
            className={`mt-4 w-full py-2.5 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 ${
              withdrawableBalance >= 500 && requestedBalance === 0
                ? "bg-white text-green-800 hover:bg-green-50 shadow-md"
                : "bg-green-400/50 text-green-100 cursor-not-allowed"
            }`}>
            <FiSend /> {requestedBalance > 0 ? "Payout Pending" : "Request Payout"}
          </button>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <p className="text-orange-100 font-medium">Locked Balance</p>
            <FiClock className="text-2xl text-orange-200" />
          </div>
          <p className="text-3xl font-bold">{formatPrice(lockedBalance)}</p>
          <p className="text-sm text-orange-100 mt-2">7-Day Escrow Period</p>
        </div>
        {requestedBalance > 0 ? (
          <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <p className="text-purple-100 font-medium">Payout Requested</p>
              <FiClock className="text-2xl text-purple-200" />
            </div>
            <p className="text-3xl font-bold">{formatPrice(requestedBalance)}</p>
            <p className="text-sm text-purple-100 mt-2">Awaiting Admin Transfer</p>
          </div>
        ) : null}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <AnimatedSelect
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            options={[
              { value: "all", label: "All Transactions" },
              { value: "earning", label: "Earnings Only" },
              { value: "settlement", label: "Settlements Only" },
            ]}
            className="w-full sm:w-auto min-w-[180px]"
          />
          <div className="flex flex-col sm:flex-row gap-2 flex-1">
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) =>
                setDateRange({ ...dateRange, start: e.target.value })
              }
              placeholder="Start Date"
              className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) =>
                setDateRange({ ...dateRange, end: e.target.value })
              }
              placeholder="End Date"
              className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
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
            ]}
            filename="vendor-wallet-history"
          />
        </div>

        {/* Transactions Table */}
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading wallet history...</p>
          </div>
        ) : filteredTransactions.length > 0 ? (
          <div className="space-y-3">
            {filteredTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100/80 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="font-bold text-gray-800 text-base">
                      {transaction.description}
                    </h3>
                    <Badge
                      variant={
                        transaction.type === "earning" ? "info" : "success"
                      }>
                      {transaction.type === "earning"
                        ? "EARNING"
                        : "SETTLEMENT"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Date</p>
                      <p className="font-semibold text-gray-800">
                        {new Date(transaction.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Net Amount</p>
                      <p className="font-bold text-green-600 text-base">
                        {formatPrice(transaction.amount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Status</p>
                      <Badge
                        variant={
                          transaction.status === "completed" || transaction.status === "paid"
                            ? "success"
                            : transaction.status === "escrow" || transaction.status === "pending" || transaction.status === "requested"
                            ? "warning"
                            : "error"
                        }>
                        {transaction.status === "escrow"
                          ? "LOCKED (7-DAY ESCROW)"
                          : transaction.status === "requested"
                          ? "AWAITING TRANSFER"
                          : transaction.status === "rejected"
                          ? "REJECTED"
                          : (transaction.status?.toUpperCase() || "N/A")}
                      </Badge>
                    </div>
                    {transaction.paymentMethod && (
                      <div>
                        <p className="text-xs text-gray-500 font-medium">Payment Method</p>
                        <p className="font-semibold text-gray-800 capitalize">
                          {transaction.paymentMethod.replace("_", " ")}
                        </p>
                      </div>
                    )}
                  </div>
                  {transaction.rejectionReason && (
                    <p className="text-xs text-red-600 mt-2 font-medium bg-red-50 p-2 rounded-lg border border-red-100">
                      Reason for Rejection: {transaction.rejectionReason}
                    </p>
                  )}
                  {transaction.transactionId && (
                    <p className="text-xs text-gray-500 mt-2 font-mono">
                      UTR Ref: {transaction.transactionId}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">No transactions found</p>
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
              <div className="flex items-center gap-3 mb-4 text-green-700">
                <div className="p-3 bg-green-50 rounded-xl border border-green-100">
                  <FiSend className="text-2xl text-green-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    Request Payout
                  </h3>
                  <p className="text-xs text-gray-500">
                    Submit withdrawal request to DwellMart Admin
                  </p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-xl border border-green-100">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-600 font-medium">
                      Withdrawable Amount
                    </span>
                    <span className="text-2xl font-bold text-green-700">
                      {formatPrice(withdrawableBalance)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 flex justify-between pt-2 border-t border-green-200/50 mt-2">
                    <span>Payment Method:</span>
                    <strong className="text-gray-800">Bank Transfer / UPI</strong>
                  </div>
                </div>

                <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 text-xs space-y-1.5 text-gray-600">
                  <div className="flex justify-between">
                    <span>Vendor:</span>
                    <strong className="text-gray-800">{vendor?.storeName || vendor?.name}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Bank Name:</span>
                    <strong className="text-gray-800">{vendor?.bankDetails?.bankName || "Registered Bank"}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Account Number:</span>
                    <strong className="text-gray-800 font-mono">
                      {vendor?.bankDetails?.accountNumber
                        ? "•••• " + vendor.bankDetails.accountNumber.slice(-4)
                        : "Registered Account"}
                    </strong>
                  </div>
                </div>

                <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 text-xs text-blue-800 flex items-start gap-2">
                  <FiShield className="text-blue-600 text-base flex-shrink-0 mt-0.5" />
                  <span>
                    Your request will be submitted to Admin for direct bank transfer.
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
                  className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold shadow-md transition-colors flex items-center gap-2">
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
