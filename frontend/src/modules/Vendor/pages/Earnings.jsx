import { useState, useMemo, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  FiTrendingUp,
  FiClock,
  FiCheckCircle,
  FiFileText,
} from "react-icons/fi";
import { MdCurrencyRupee } from "react-icons/md";
import { motion } from "framer-motion";
import Badge from "../../../shared/components/Badge";
import ExportButton from "../../Admin/components/ExportButton";
import AnimatedSelect from "../../Admin/components/AnimatedSelect";
import { formatPrice } from "../../../shared/utils/helpers";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import { getVendorEarnings } from "../services/vendorService";

const Earnings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { vendor } = useVendorAuthStore();

  const getActiveTab = () => {
    const path = location.pathname;
    if (path.includes("/commission-history")) return "commission";
    if (path.includes("/settlement-history")) return "settlement";
    return "overview";
  };

  const [activeTab, setActiveTab] = useState(getActiveTab());
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [commissions, setCommissions] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [earningsSummary, setEarningsSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setActiveTab(getActiveTab());
  }, [location.pathname]);

  const vendorId = vendor?.id || vendor?._id;

  useEffect(() => {
    if (!vendorId) return;

    const fetchEarnings = async () => {
      setIsLoading(true);
      try {
        const res = await getVendorEarnings();
        const data = res?.data ?? res;
        setCommissions(data?.commissions ?? []);
        setSettlements(data?.settlements ?? []);
        setEarningsSummary(data?.summary ?? null);
      } catch {
        // errors handled by api.js toast
      } finally {
        setIsLoading(false);
      }
    };

    fetchEarnings();
  }, [vendorId]);

  const filteredCommissions = useMemo(() => {
    if (selectedStatus === "all") return commissions;
    return commissions.filter(
      (c) => (c.effectiveStatus || c.status) === selectedStatus
    );
  }, [commissions, selectedStatus]);

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to view earnings</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Loading earnings data...</p>
      </div>
    );
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === "overview") {
      navigate("/vendor/earnings");
    } else if (tab === "commission") {
      navigate("/vendor/earnings/commission-history");
    } else if (tab === "settlement") {
      navigate("/vendor/earnings/settlement-history");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            Earnings
          </h1>
          <p className="text-gray-600">
            View your earnings and commission history
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <div className="flex overflow-x-auto scrollbar-hide -mx-1 px-1">
            <button
              onClick={() => handleTabChange("overview")}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap text-sm ${activeTab === "overview"
                ? "border-purple-600 text-purple-600 font-semibold"
                : "border-transparent text-gray-600 hover:text-gray-800"
                }`}>
              <MdCurrencyRupee />
              <span>Overview</span>
            </button>
            <button
              onClick={() => handleTabChange("commission")}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap text-sm ${activeTab === "commission"
                ? "border-purple-600 text-purple-600 font-semibold"
                : "border-transparent text-gray-600 hover:text-gray-800"
                }`}>
              <FiFileText />
              <span>Commission History</span>
            </button>
            <button
              onClick={() => handleTabChange("settlement")}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap text-sm ${activeTab === "settlement"
                ? "border-purple-600 text-purple-600 font-semibold"
                : "border-transparent text-gray-600 hover:text-gray-800"
                }`}>
              <FiCheckCircle />
              <span>Settlement History</span>
            </button>
          </div>
        </div>

        <div className="p-3 sm:p-4 md:p-6">
          {/* Earnings Summary Cards - Show on Overview tab */}
          {activeTab === "overview" && (
            <div className="mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 shadow-sm border border-green-200">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-green-700 font-medium">
                      Total Earnings
                    </p>
                    <MdCurrencyRupee className="text-green-600" />
                  </div>
                  <p className="text-2xl font-bold text-green-800">
                    {earningsSummary
                      ? formatPrice(earningsSummary.totalEarnings)
                      : formatPrice(0)}
                  </p>
                  <p className="text-xs text-green-600 mt-1">All time</p>
                </div>

                <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl p-6 shadow-sm border border-yellow-200">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-yellow-700 font-medium">
                      Pending
                    </p>
                    <FiClock className="text-yellow-600" />
                  </div>
                  <p className="text-2xl font-bold text-yellow-800">
                    {earningsSummary
                      ? formatPrice(earningsSummary.pendingEarnings)
                      : formatPrice(0)}
                  </p>
                  <p className="text-xs text-yellow-600 mt-1">
                    Awaiting settlement
                  </p>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-6 shadow-sm border border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-blue-700 font-medium">Paid</p>
                    <FiCheckCircle className="text-blue-600" />
                  </div>
                  <p className="text-2xl font-bold text-blue-800">
                    {earningsSummary
                      ? formatPrice(earningsSummary.paidEarnings)
                      : formatPrice(0)}
                  </p>
                  <p className="text-xs text-blue-600 mt-1">Settled</p>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 shadow-sm border border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-purple-700 font-medium">
                      Total Orders
                    </p>
                    <FiTrendingUp className="text-purple-600" />
                  </div>
                  <p className="text-2xl font-bold text-purple-800">
                    {earningsSummary ? earningsSummary.totalOrders : 0}
                  </p>
                  <p className="text-xs text-purple-600 mt-1">With earnings</p>
                </div>
                
                <div className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-xl p-6 shadow-sm border border-pink-200">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-pink-700 font-medium">
                      Commission Rate
                    </p>
                    <FiFileText className="text-pink-600" />
                  </div>
                  <p className="text-2xl font-bold text-pink-800">
                    {vendor?.commissionRate !== undefined 
                      ? `${(vendor.commissionRate * 100).toFixed(1)}%` 
                      : "N/A"}
                  </p>
                  <p className="text-xs text-pink-600 mt-1">Platform fee</p>
                </div>
              </div>
            </div>
          )}

          {/* Commission History Section */}
          {(activeTab === "overview" || activeTab === "commission") && (
            <div className={activeTab === "overview" ? "mb-6" : ""}>
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-lg font-bold text-gray-800 mb-1">
                      Commission History
                    </h2>
                    <p className="text-sm text-gray-600">
                      View all your commission records
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <AnimatedSelect
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value)}
                      options={[
                        { value: "all", label: "All Status" },
                        { value: "pending", label: "Pending" },
                        { value: "paid", label: "Paid" },
                        { value: "cancelled", label: "Cancelled" },
                      ]}
                      className="min-w-[140px]"
                    />
                    <ExportButton
                      data={filteredCommissions}
                      headers={[
                        {
                          label: "Order",
                          accessor: (row) =>
                            row.orderDisplayId ||
                            (typeof row.orderId === "object"
                              ? row.orderId?.orderId || row.orderId?._id
                              : row.orderId),
                        },
                        {
                          label: "Date",
                          accessor: (row) =>
                            new Date(row.createdAt).toLocaleDateString(),
                        },
                        {
                          label: "Subtotal",
                          accessor: (row) => formatPrice(row.subtotal),
                        },
                        {
                          label: "Commission",
                          accessor: (row) => formatPrice(row.commission),
                        },
                        {
                          label: "Your Earnings",
                          accessor: (row) => formatPrice(row.vendorEarnings),
                        },
                        { label: "Status", accessor: (row) => row.status },
                      ]}
                      filename="vendor-commissions"
                    />
                  </div>
                </div>

                {filteredCommissions.length > 0 ? (
                  <div className="space-y-3">
                    {filteredCommissions.map((commission) => (
                      <div
                        key={commission._id ?? commission.id}
                        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-gray-800">
                              {commission.orderDisplayId ||
                                (typeof commission.orderId === "object"
                                  ? commission.orderId?.orderId ||
                                    commission.orderId?._id
                                  : commission.orderId)}
                            </h3>
                            <Badge
                              variant={
                                (commission.effectiveStatus || commission.status) ===
                                "paid"
                                  ? "success"
                                  : (commission.effectiveStatus ||
                                      commission.status) === "pending"
                                    ? "warning"
                                    : "error"
                              }>
                              {(commission.effectiveStatus || commission.status)?.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-gray-600">Date</p>
                              <p className="font-semibold text-gray-800">
                                {new Date(
                                  commission.createdAt
                                ).toLocaleDateString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-600">Subtotal</p>
                              <p className="font-semibold text-gray-800">
                                {formatPrice(commission.subtotal)}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-600">Commission</p>
                              <p className="font-semibold text-red-600">
                                -{formatPrice(commission.commission)}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-600">Your Earnings</p>
                              <p className="font-semibold text-green-600">
                                {formatPrice(commission.vendorEarnings)}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              navigate(
                                `/vendor/orders/${commission.orderRef || commission.orderId}`
                              )
                            }
                            className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
                            View Order
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FiFileText className="text-4xl text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 mb-2">
                      No commission records found
                    </p>
                    <p className="text-sm text-gray-400">
                      {selectedStatus !== "all"
                        ? "Try selecting a different status"
                        : "Commissions will appear here once you receive orders"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Settlement History Section */}
          {(activeTab === "overview" || activeTab === "settlement") &&
            settlements.length > 0 && (
              <div>
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-lg font-bold text-gray-800 mb-1">
                        Settlement History
                      </h2>
                      <p className="text-sm text-gray-600">
                        View your payment settlements
                      </p>
                    </div>
                    <ExportButton
                      data={settlements}
                      headers={[
                        {
                          label: "Settlement ID",
                          accessor: (row) => row._id || row.id,
                        },
                        {
                          label: "Date",
                          accessor: (row) =>
                            new Date(row.createdAt).toLocaleDateString(),
                        },
                        {
                          label: "Amount",
                          accessor: (row) => formatPrice(row.amount),
                        },
                        {
                          label: "Payment Method",
                          accessor: (row) => row.paymentMethod,
                        },
                        {
                          label: "Transaction ID",
                          accessor: (row) => row.transactionId || "N/A",
                        },
                      ]}
                      filename="vendor-settlements"
                    />
                  </div>

                  <div className="space-y-3">
                    {settlements.map((settlement) => (
                      <div
                        key={settlement._id || settlement.id}
                        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-gray-800">
                              {settlement._id || settlement.id}
                            </h3>
                            <Badge
                              variant={
                                settlement.status === "failed"
                                  ? "error"
                                  : "success"
                              }
                            >
                              {String(settlement.status || "completed").toUpperCase()}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-gray-600">Date Paid</p>
                              <p className="font-semibold text-gray-800">
                                {new Date(
                                  settlement.createdAt
                                ).toLocaleDateString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-600">Amount</p>
                              <p className="font-semibold text-green-600">
                                {formatPrice(settlement.amount)}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-600">Payment Method</p>
                              <p className="font-semibold text-gray-800 capitalize">
                                {settlement.paymentMethod?.replace("_", " ") ||
                                  "N/A"}
                              </p>
                            </div>
                            {settlement.transactionId && (
                              <div>
                                <p className="text-gray-600">Transaction ID</p>
                                <p className="font-semibold text-gray-800 text-xs">
                                  {settlement.transactionId}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          {activeTab === "settlement" && settlements.length === 0 && (
            <div className="text-center py-12">
              <FiCheckCircle className="text-4xl text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">No settlement records found</p>
              <p className="text-sm text-gray-400">
                Settlements will appear here once your commissions are paid
              </p>
            </div>
          )}

        </div>
      </div>
    </motion.div>
  );
};

export default Earnings;
