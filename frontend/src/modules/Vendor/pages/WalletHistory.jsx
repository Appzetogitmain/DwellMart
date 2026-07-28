import { useState, useMemo, useEffect } from "react";
import {
  FiDollarSign,
  FiClock,
  FiCheckCircle,
} from "react-icons/fi";
import { motion } from "framer-motion";
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
  const [isLoading, setIsLoading] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  const vendorId = vendor?.id || vendor?._id;

  useEffect(() => {
    if (!vendorId) return;

    const fetchWallet = async () => {
      setIsLoading(true);
      try {
        const res = await getVendorEarnings();
        const data = res?.data ?? res;
        const commissions = Array.isArray(data?.commissions) ? data.commissions : [];
        const settlements = Array.isArray(data?.settlements) ? data.settlements : [];

        const allTransactions = [
          ...commissions.map((c) => ({
            id: c._id || c.id,
            type: "earning",
            orderId: c.orderDisplayId || c.orderRef || c.orderId,
            amount: c.vendorEarnings,
            commission: c.commission,
            status: c.effectiveStatus || c.status,
            date: c.createdAt,
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
            status: s.status === "failed" ? "failed" : "paid",
            date: s.createdAt,
            description: "Settlement Payment",
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
    
    fetchWallet();
  }, [vendorId]);

  const handleRequestPayout = async () => {
    if (!walletSummary || (walletSummary.withdrawableEarnings || 0) < 500) {
      toast.error("Minimum withdrawable balance must be ₹500.");
      return;
    }
    
    if (window.confirm("Are you sure you want to request a payout for your available balance?")) {
      setIsRequesting(true);
      try {
        await requestVendorPayout({ paymentMethod: "bank_transfer" });
        toast.success("Payout request submitted successfully!");
        // Refresh wallet
        const res = await getVendorEarnings();
        setWalletSummary(res?.data?.summary || res?.summary || null);
        // (ideally we should also refresh transactions, but a page reload works too or just refreshing state)
        window.location.reload();
      } catch (err) {
        toast.error(err?.response?.data?.message || "Failed to request payout");
      } finally {
        setIsRequesting(false);
      }
    }
  };

  const filteredTransactions = useMemo(() => {
    let filtered = transactions;

    // Filter by type
    if (filterType !== "all") {
      filtered = filtered.filter((t) => t.type === filterType);
    }

    // Filter by status
    if (filterType === "earning") {
      // For earnings, we can filter by status (pending/paid)
      // This is handled by the filterType already
    }

    // Filter by date range
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

  // Calculate wallet balance
  const walletBalance = useMemo(() => {
    if (!walletSummary) return 0;
    return walletSummary.totalEarnings;
  }, [walletSummary]);

  const withdrawableBalance = useMemo(() => {
    if (!walletSummary) return 0;
    return walletSummary.withdrawableEarnings || 0;
  }, [walletSummary]);

  const lockedBalance = useMemo(() => {
    if (!walletSummary) return 0;
    return walletSummary.lockedEarnings || 0;
  }, [walletSummary]);

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to view wallet history</p>
      </div>
    );
  }

  const columns = [
    {
      key: "date",
      label: "Date",
      sortable: true,
      render: (value) => new Date(value).toLocaleDateString(),
    },
    {
      key: "description",
      label: "Description",
      sortable: true,
    },
    {
      key: "type",
      label: "Type",
      sortable: true,
      render: (value) => (
        <Badge variant={value === "earning" ? "info" : "success"}>
          {value === "earning" ? "Earning" : "Settlement"}
        </Badge>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      sortable: true,
      render: (value) => (
        <span className="font-semibold text-green-600">
          {formatPrice(value)}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (value) => (
        <Badge
          variant={
            value === "paid"
              ? "success"
              : value === "pending"
                ? "warning"
                : "error"
          }>
          {value?.toUpperCase() || "N/A"}
        </Badge>
      ),
    },
    {
      key: "paymentMethod",
      label: "Payment Method",
      sortable: false,
      render: (value) => (
        <span className="text-sm text-gray-600 capitalize">
          {value ? value.replace("_", " ") : "N/A"}
        </span>
      ),
    },
  ];

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

      {/* Wallet Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <p className="text-blue-100">Total Earnings</p>
            <FiDollarSign className="text-2xl text-blue-200" />
          </div>
          <p className="text-3xl font-bold">{formatPrice(walletBalance)}</p>
          <p className="text-sm text-blue-100 mt-2">All time earnings</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-green-100">Withdrawable Balance</p>
              <FiCheckCircle className="text-2xl text-green-200" />
            </div>
            <p className="text-3xl font-bold">{formatPrice(withdrawableBalance)}</p>
            <p className="text-sm text-green-100 mt-2">Available to withdraw</p>
          </div>
          <button
            onClick={handleRequestPayout}
            disabled={isRequesting || withdrawableBalance < 500}
            className={`mt-4 w-full py-2 rounded-lg font-semibold transition-colors ${
              withdrawableBalance >= 500 
                ? "bg-white text-green-700 hover:bg-green-50" 
                : "bg-green-400/50 text-green-100 cursor-not-allowed"
            }`}
          >
            {isRequesting ? "Processing..." : "Request Payout"}
          </button>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <p className="text-orange-100">Locked Balance</p>
            <FiClock className="text-2xl text-orange-200" />
          </div>
          <p className="text-3xl font-bold">{formatPrice(lockedBalance)}</p>
          <p className="text-sm text-orange-100 mt-2">7-Day Escrow Period</p>
        </div>
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
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-gray-800">
                      {transaction.description}
                    </h3>
                    <Badge
                      variant={
                        transaction.type === "earning" ? "info" : "success"
                      }>
                      {transaction.type === "earning"
                        ? "Earning"
                        : "Settlement"}
                    </Badge>
                    {transaction.orderId && (
                      <span className="text-sm text-gray-500">
                        Order: {transaction.orderId}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Date</p>
                      <p className="font-semibold text-gray-800">
                        {new Date(transaction.date).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Amount</p>
                      <p className="font-semibold text-green-600">
                        {formatPrice(transaction.amount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Status</p>
                      <Badge
                        variant={
                          transaction.status === "paid"
                            ? "success"
                            : transaction.status === "pending"
                              ? "warning"
                              : "error"
                        }>
                        {transaction.status?.toUpperCase() || "N/A"}
                      </Badge>
                    </div>
                    {transaction.paymentMethod && (
                      <div>
                        <p className="text-gray-600">Payment Method</p>
                        <p className="font-semibold text-gray-800 capitalize">
                          {transaction.paymentMethod.replace("_", " ")}
                        </p>
                      </div>
                    )}
                  </div>
                  {transaction.transactionId && (
                    <p className="text-xs text-gray-500 mt-2">
                      Transaction ID: {transaction.transactionId}
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
    </motion.div>
  );
};

export default WalletHistory;
