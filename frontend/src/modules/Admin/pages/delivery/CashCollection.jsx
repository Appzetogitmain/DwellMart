import { useState, useEffect } from "react";
import {
  FiSearch,
  FiDollarSign,
  FiCheckCircle,
  FiClock,
  FiXCircle,
  FiAlertTriangle,
  FiFileText,
  FiCreditCard,
  FiRefreshCw,
} from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import DataTable from "../../components/DataTable";
import Pagination from "../../components/Pagination";
import Badge from "../../../../shared/components/Badge";
import AnimatedSelect from "../../components/AnimatedSelect";
import { formatCurrency } from "../../utils/adminHelpers";
import {
  settleCash as settleCashApi,
  getAllDeliveryBoys,
  getDeliverySettlements,
  rejectDeliveryCashSettlement,
  cancelDeliveryCashSettlement,
} from "../../services/adminService";
import toast from "react-hot-toast";

const CashCollection = () => {
  const [activeTab, setActiveTab] = useState("requests"); // 'requests' | 'riders'
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [requests, setRequests] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 20,
    pages: 1,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSettlingId, setIsSettlingId] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const itemsPerPage = 20;

  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === "requests") {
        const res = await getDeliverySettlements({
          page: currentPage,
          limit: itemsPerPage,
          status: statusFilter !== "all" ? statusFilter : undefined,
          search: searchQuery || undefined,
        });
        const payload = res?.data?.data || res?.data || {};
        setRequests(payload.settlements || []);
        setPagination(payload.pagination || { total: 0, page: 1, limit: itemsPerPage, pages: 1 });
      } else {
        const response = await getAllDeliveryBoys({
          search: searchQuery || undefined,
          page: currentPage,
          limit: itemsPerPage,
        });
        const rows = (response?.data?.deliveryBoys || []).map((boy) => ({
          ...boy,
          id: boy.id || boy._id,
          cashInHand: Number(boy.cashInHand ?? boy.stats?.cashInHand ?? 0),
          totalDeliveries: Number(boy.totalDeliveries ?? boy.stats?.totalDeliveries ?? 0),
          cashCollected: Number(boy.cashCollected || 0),
          isBlockedByLimit: boy.isBlockedByLimit || false,
          maxCodCashLimit: boy.maxCodCashLimit || 5000,
        }));
        setDeliveryBoys(rows);
        setPagination(response?.data?.pagination || {
          total: rows.length,
          page: 1,
          limit: itemsPerPage,
          pages: 1,
        });
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 300);
    return () => clearTimeout(timer);
  }, [activeTab, searchQuery, statusFilter, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery, statusFilter]);

  const handleConfirmSettlement = async (req) => {
    const boyId = req.deliveryBoyId?._id || req.deliveryBoyId?.id || req.deliveryBoyId;
    if (!boyId) return;

    try {
      setIsConfirming(true);
      await settleCashApi(boyId, {
        settlementId: req._id,
        amount: req.amount,
        settlementMethod: req.settlementMethod,
        referenceNumber: req.referenceNumber,
      });
      toast.success(`Settlement of ${formatCurrency(req.amount)} confirmed!`);
      setSelectedRequest(null);
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to confirm settlement");
      setSelectedRequest(null);
      fetchData();
    } finally {
      setIsConfirming(false);
    }
  };

  const handleRejectSettlement = async (e) => {
    e.preventDefault();
    if (!selectedRequest || !rejectReason.trim()) {
      toast.error("Please provide a rejection reason.");
      return;
    }

    try {
      setIsConfirming(true);
      await rejectDeliveryCashSettlement(selectedRequest._id, rejectReason.trim());
      toast.success("Settlement request rejected.");
      setIsRejectModalOpen(false);
      setSelectedRequest(null);
      setRejectReason("");
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to reject settlement");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleCancelSettlement = async (req) => {
    if (!req?._id) return;
    try {
      setIsConfirming(true);
      await cancelDeliveryCashSettlement(req._id, "Cancelled by Admin: Insufficient rider cash in hand or stale request");
      toast.success("Stale settlement request cancelled.");
      setSelectedRequest(null);
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to cancel settlement");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleDirectSettleRider = async (row) => {
    if (!row?.id || Number(row.cashInHand || 0) <= 0) return;
    setIsSettlingId(row.id);
    try {
      await settleCashApi(row.id, { amount: row.cashInHand });
      toast.success(`Settled cash for ${row.name}`);
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to settle rider cash");
    } finally {
      setIsSettlingId(null);
    }
  };

  const requestColumns = [
    {
      key: "settlementNumber",
      label: "Receipt / Rider",
      render: (value, row) => (
        <div>
          <span className="font-mono text-xs font-bold text-gray-800 block">{value}</span>
          <p className="font-semibold text-gray-900 text-sm">{row.deliveryBoyId?.name || "Rider"}</p>
          <p className="text-xs text-gray-500">{row.deliveryBoyId?.phone || ""}</p>
        </div>
      ),
    },
    {
      key: "amount",
      label: "Amount Requested",
      render: (value, row) => (
        <div>
          <span className="font-bold text-emerald-600 text-base">{formatCurrency(value || 0)}</span>
          {row.isInvalid && (
            <span className="block text-[10px] font-bold text-red-600">
              Rider Cash: {formatCurrency(row.riderCashInHand || 0)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "settlementMethod",
      label: "Handover Method",
      render: (value, row) => (
        <div>
          <span className="capitalize font-semibold text-gray-700 text-sm flex items-center gap-1">
            <FiCreditCard className="text-gray-400" /> {value?.replace("_", " ")}
          </span>
          {row.referenceNumber && (
            <code className="text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
              UTR: {row.referenceNumber}
            </code>
          )}
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (value, row) => {
        if (row.isInvalid && value === "pending") {
          return <Badge variant="danger">INVALID SETTLEMENT</Badge>;
        }
        if (value === "completed") return <Badge variant="success">Completed</Badge>;
        if (value === "pending") return <Badge variant="warning">Pending Review</Badge>;
        if (value === "rejected") return <Badge variant="danger">Rejected</Badge>;
        if (value === "cancelled") return <Badge variant="secondary">Cancelled</Badge>;
        return <Badge>{value}</Badge>;
      },
    },
    {
      key: "actions",
      label: "Actions",
      render: (_, row) => {
        if (row.status === "pending" && row.isInvalid) {
          return (
            <button
              onClick={() => handleCancelSettlement(row)}
              disabled={isConfirming}
              className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
            >
              <FiXCircle /> Cancel Request
            </button>
          );
        }
        if (row.status === "pending") {
          return (
            <button
              onClick={() => setSelectedRequest(row)}
              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-xs font-semibold flex items-center gap-1"
            >
              <FiCheckCircle /> Review & Confirm
            </button>
          );
        }
        return (
          <button
            onClick={() => setSelectedRequest(row)}
            className="px-2.5 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Details
          </button>
        );
      },
    },
  ];

  const riderColumns = [
    {
      key: "name",
      label: "Delivery Partner",
      render: (value, row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold">
            {value.charAt(0)}
          </div>
          <div>
            <p className="font-semibold text-gray-800">{value}</p>
            <p className="text-xs text-gray-500">{row.phone}</p>
          </div>
        </div>
      ),
    },
    {
      key: "cashInHand",
      label: "Cash In Hand",
      render: (value, row) => (
        <div>
          <div className="flex items-center gap-1.5">
            <FiDollarSign className="text-emerald-600" />
            <span className="font-bold text-gray-900 text-base">{formatCurrency(value || 0)}</span>
          </div>
          {row.isBlockedByLimit && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 mt-0.5">
              <FiAlertTriangle /> COD Limit Exceeded
            </span>
          )}
        </div>
      ),
    },
    {
      key: "totalDeliveries",
      label: "Total Deliveries",
    },
    {
      key: "actions",
      label: "Actions",
      render: (_, row) =>
        row.cashInHand > 0 ? (
          <button
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-semibold flex items-center gap-2"
            disabled={isSettlingId === row.id}
            onClick={() => handleDirectSettleRider(row)}
          >
            <FiCheckCircle />
            {isSettlingId === row.id ? "Settling..." : "Settle Cash"}
          </button>
        ) : (
          <Badge variant="success">Settled</Badge>
        ),
    },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Cash Collection & Settlements</h1>
          <p className="text-sm text-gray-600 mt-1">
            Review delivery partner COD cash handovers and settle pending cash liabilities.
          </p>
        </div>
        <button
          onClick={fetchData}
          className="px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 self-start sm:self-auto"
        >
          <FiRefreshCw className={isLoading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("requests")}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "requests"
              ? "border-primary-600 text-primary-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Settlement Requests
        </button>
        <button
          onClick={() => setActiveTab("riders")}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "riders"
              ? "border-primary-600 text-primary-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Delivery Partners Cash Balances
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by rider name, phone or email..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>

          <AnimatedSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={
              activeTab === "requests"
                ? [
                    { value: "all", label: "All Request Statuses" },
                    { value: "pending", label: "Pending Review" },
                    { value: "completed", label: "Completed" },
                    { value: "rejected", label: "Rejected" },
                  ]
                : [
                    { value: "all", label: "All Riders" },
                    { value: "pending", label: "Pending Cash Collection" },
                  ]
            }
            className="min-w-[140px]"
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <DataTable
          data={activeTab === "requests" ? requests : deliveryBoys}
          columns={activeTab === "requests" ? requestColumns : riderColumns}
          pagination={false}
        />
        <Pagination
          currentPage={pagination.page || currentPage}
          totalPages={pagination.pages || 1}
          totalItems={pagination.total || 0}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          className="mt-6"
        />
      </div>

      {/* Request Details & Confirm Modal */}
      <AnimatePresence>
        {selectedRequest && !isRejectModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-white border border-gray-200 rounded-2xl p-6 space-y-5 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Settlement Details</h3>
                  <p className="text-xs font-mono text-gray-500">{selectedRequest.settlementNumber}</p>
                </div>
                <button onClick={() => setSelectedRequest(null)} className="text-gray-400 hover:text-gray-600">
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 flex justify-between items-center">
                  <span className="text-gray-600">Rider Name:</span>
                  <strong className="text-gray-900 font-semibold">{selectedRequest.deliveryBoyId?.name || "Rider"}</strong>
                </div>

                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex justify-between items-center">
                  <span className="text-emerald-800">Settlement Amount:</span>
                  <strong className="text-emerald-700 font-bold text-lg">{formatCurrency(selectedRequest.amount)}</strong>
                </div>

                <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 flex justify-between items-center">
                  <span className="text-gray-600">Handover Method:</span>
                  <span className="capitalize font-semibold text-gray-900">{selectedRequest.settlementMethod?.replace("_", " ")}</span>
                </div>

                {selectedRequest.referenceNumber && (
                  <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 flex justify-between items-center">
                    <span className="text-indigo-800">Bank / UPI UTR Ref:</span>
                    <code className="text-indigo-900 font-bold font-mono">{selectedRequest.referenceNumber}</code>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 flex justify-between items-center">
                  <span className="text-gray-600">Requested Date:</span>
                  <span className="text-gray-800">{new Date(selectedRequest.requestedAt || selectedRequest.createdAt).toLocaleString()}</span>
                </div>

                {selectedRequest.notes && (
                  <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                    <span className="text-gray-500 block text-xs mb-1">Rider Notes:</span>
                    <p className="text-gray-800 italic">{selectedRequest.notes}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Close
                </button>

                {selectedRequest.status === "pending" && (
                  <>
                    <button
                      onClick={() => setIsRejectModalOpen(true)}
                      className="px-4 py-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
                    >
                      Reject Request
                    </button>
                    <button
                      disabled={isConfirming}
                      onClick={() => handleConfirmSettlement(selectedRequest)}
                      className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-md disabled:opacity-50"
                    >
                      {isConfirming ? "Confirming..." : "Confirm Cash Received"}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reject Reason Modal */}
      <AnimatePresence>
        {isRejectModalOpen && selectedRequest && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-6 space-y-4 shadow-2xl"
            >
              <h3 className="text-lg font-bold text-gray-900">Reject Cash Settlement</h3>
              <p className="text-xs text-gray-600">
                Provide a reason for rejecting settlement request <strong>{selectedRequest.settlementNumber}</strong>. The rider will be notified.
              </p>

              <form onSubmit={handleRejectSettlement} className="space-y-4">
                <textarea
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter rejection reason..."
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setIsRejectModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isConfirming}
                    className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isConfirming ? "Rejecting..." : "Confirm Rejection"}
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

export default CashCollection;
