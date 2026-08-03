import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  FiArrowLeft,
  FiCheck,
  FiX,
  FiPhone,
  FiMail,
  FiPackage,
  FiCalendar,
  FiRefreshCw,
  FiShoppingBag,
  FiDollarSign,
  FiAlertCircle,
  FiEdit,
} from "react-icons/fi";
import { motion } from "framer-motion";
import Badge from "../../../../shared/components/Badge";
import AnimatedSelect from "../../../Admin/components/AnimatedSelect";
import { formatPrice, getPlaceholderImage } from "../../../../shared/utils/helpers";
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import {
  getVendorReturnRequestById,
  updateVendorReturnRequestStatus,
} from "../../services/vendorService";
import toast from "react-hot-toast";

const statusTransitions = {
  pending: ["approved", "rejected"],
  approved: ["processing", "completed"],
  processing: ["completed"],
  rejected: [],
  completed: [],
};

const ReturnRequestDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { vendor } = useVendorAuthStore();
  const [returnRequest, setReturnRequest] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [status, setStatus] = useState("");

  const vendorId = vendor?.id;

  useEffect(() => {
    if (!vendorId) return;

    const fetchReturnRequest = async () => {
      try {
        const res = await getVendorReturnRequestById(id);
        const data = res?.data ?? res;
        if (!data) {
          toast.error("Return request not found");
          navigate("/vendor/return-requests");
          return;
        }
        setReturnRequest(data);
        setStatus(data.status);
      } catch {
        toast.error("Return request not found");
        navigate("/vendor/return-requests");
      }
    };

    fetchReturnRequest();
  }, [id, navigate, vendorId]);

  const handleStatusUpdate = async (
    newStatus,
    action = "",
    options = {}
  ) => {
    const statusData = { status: newStatus };
    if (newStatus === "approved" && action === "approve") {
      statusData.refundStatus = "pending";
    } else if (newStatus === "completed" && action === "process-refund") {
      statusData.refundStatus = "processed";
    } else if (newStatus === "completed" && !action) {
      statusData.refundStatus = "processed";
    } else if (
      newStatus === "approved" &&
      !action &&
      returnRequest?.refundStatus !== "processed"
    ) {
      statusData.refundStatus = "pending";
    }
    if (newStatus === "rejected" && options?.rejectionReason !== undefined) {
      statusData.rejectionReason = options.rejectionReason;
    }

    try {
      const res = await updateVendorReturnRequestStatus(id, statusData);
      const updatedRequest = res?.data ?? res;
      if (!updatedRequest) return;
      setReturnRequest(updatedRequest);
      setStatus(updatedRequest.status);
      setIsEditing(false);
    } catch {
      return;
    }

    const statusMessages = {
      approve: "Return request approved",
      reject: "Return request rejected",
      "process-refund": "Refund processed successfully",
    };

    toast.success(statusMessages[action] || "Status updated successfully");
  };

  const handleStatusSave = () => {
    if (status !== returnRequest.status) {
      if (status === "rejected") {
        const reason = window.prompt(
          "Optional rejection reason (visible in return details):",
          returnRequest?.rejectionReason || ""
        );
        handleStatusUpdate(status, "", { rejectionReason: reason || "" });
        return;
      }
      handleStatusUpdate(status);
    } else {
      setIsEditing(false);
    }
  };

  const getStatusVariant = (status) => {
    const statusMap = {
      pending: "warning",
      approved: "success",
      rejected: "error",
      processing: "info",
      completed: "success",
    };
    return statusMap[status] || "warning";
  };

  if (!returnRequest || !vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const allowedNextStatuses = statusTransitions[returnRequest.status] || [];
  const editableStatusOptions = [returnRequest.status, ...allowedNextStatuses]
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .map((value) => ({
      value,
      label: value.charAt(0).toUpperCase() + value.slice(1),
    }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <FiArrowLeft className="text-lg text-gray-600" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
              {returnRequest.id}
            </h1>
            <p className="text-xs text-gray-500">
              Requested on{" "}
              {new Date(returnRequest.requestDate).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <AnimatedSelect
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                options={editableStatusOptions}
                className="min-w-[140px]"
              />
              <button
                onClick={handleStatusSave}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-semibold">
                <FiCheck className="text-sm" />
                Save
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setStatus(returnRequest.status);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold">
                <FiX className="text-sm" />
                Cancel
              </button>
            </>
          ) : (
            <>
              <Badge variant={getStatusVariant(returnRequest.status)}>
                {returnRequest.status}
              </Badge>
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-semibold">
                <FiEdit className="text-sm" />
                Edit Status
              </button>
              {returnRequest.status === "pending" && (
                <>
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          "Are you sure you want to approve this return request?"
                        )
                      ) {
                        handleStatusUpdate("approved", "approve");
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-semibold">
                    <FiCheck className="text-sm" />
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          "Are you sure you want to reject this return request?"
                        )
                      ) {
                        const reason = window.prompt(
                          "Optional rejection reason (visible in return details):",
                          returnRequest?.rejectionReason || ""
                        );
                        handleStatusUpdate("rejected", "reject", {
                          rejectionReason: reason || "",
                        });
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-semibold">
                    <FiX className="text-sm" />
                    Reject
                  </button>
                </>
              )}
              {returnRequest.status === "approved" &&
                returnRequest.refundStatus === "pending" && (
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          "Process refund for this return request?"
                        )
                      ) {
                        handleStatusUpdate("completed", "process-refund");
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-semibold">
                    <FiRefreshCw className="text-sm" />
                    Process Refund
                  </button>
                )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Return Overview */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiPackage className="text-primary-600 text-base" />
              Return Overview
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Refund Amount</p>
                <p className="font-bold text-gray-800 text-lg">
                  {formatPrice(returnRequest.refundAmount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Items</p>
                <p className="font-semibold text-gray-800">
                  {returnRequest.items.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Refund Status</p>
                <Badge
                  variant={
                    returnRequest.refundStatus === "processed"
                      ? "success"
                      : returnRequest.refundStatus === "failed"
                      ? "error"
                      : "warning"
                  }
                  className="text-xs">
                  {returnRequest.refundStatus}
                </Badge>
              </div>
            </div>
          </div>

          {/* Original Order Link */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiShoppingBag className="text-primary-600 text-base" />
              Original Order
            </h2>
            <Link
              to={`/vendor/orders/${returnRequest.orderId}`}
              className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-semibold text-sm">
              <span>View Order: {returnRequest.orderId}</span>
              <FiArrowLeft className="rotate-180 text-xs" />
            </Link>
          </div>

          {/* Return Items */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiPackage className="text-primary-600 text-base" />
              Items Being Returned ({returnRequest.items.length})
            </h2>
            <div className="space-y-2">
              {returnRequest.items.map((item, index) => (
                <div
                  key={item.id || index}
                  className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.name || "Product"}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                      onError={(e) => {
                        e.target.src = getPlaceholderImage(100, 100, "Product");
                      }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-800 truncate">
                      {item.name || "Unknown Product"}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs text-gray-600">
                        {formatPrice(item.price || 0)} × {item.quantity || 1}
                      </p>
                      {item.reason && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                          {item.reason}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="font-bold text-sm text-gray-800">
                    {formatPrice((item.price || 0) * (item.quantity || 1))}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Return Reason */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiAlertCircle className="text-primary-600 text-base" />
              Return Reason
            </h2>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-gray-500 mb-1">Reason</p>
                <p className="font-semibold text-sm text-gray-800">
                  {returnRequest.reason}
                </p>
              </div>
              {returnRequest.description && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Description</p>
                  <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                    {returnRequest.description}
                  </p>
                </div>
              )}
              {returnRequest.rejectionReason && (
                <div>
                  <p className="text-xs text-red-500 mb-1">Rejection Reason</p>
                  <p className="text-sm text-red-700 bg-red-50 p-3 rounded-lg">
                    {returnRequest.rejectionReason}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Customer Information */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiMail className="text-primary-600 text-base" />
              Customer Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">Name</p>
                <p className="font-semibold text-sm text-gray-800">
                  {returnRequest.customer.name}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Email</p>
                <a
                  href={`mailto:${returnRequest.customer.email}`}
                  className="font-semibold text-xs text-blue-600 hover:text-blue-800 break-all">
                  {returnRequest.customer.email}
                </a>
              </div>
              {returnRequest.customer.phone && (
                <div>
                  <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <FiPhone className="text-xs" />
                    Phone
                  </p>
                  <a
                    href={`tel:${returnRequest.customer.phone}`}
                    className="font-semibold text-sm text-gray-800 hover:text-blue-600">
                    {returnRequest.customer.phone}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Refund Summary */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiDollarSign className="text-primary-600 text-base" />
              Refund Summary
            </h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Items Total</span>
                <span className="font-semibold">
                  {formatPrice(
                    returnRequest.items.reduce(
                      (sum, item) =>
                        sum + (item.price || 0) * (item.quantity || 1),
                      0
                    )
                  )}
                </span>
              </div>
              <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between">
                <span className="font-bold text-gray-800">Refund Amount</span>
                <span className="font-bold text-lg text-gray-800">
                  {formatPrice(returnRequest.refundAmount)}
                </span>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Refund Status</p>
                <Badge
                  variant={
                    returnRequest.refundStatus === "processed"
                      ? "success"
                      : returnRequest.refundStatus === "failed"
                      ? "error"
                      : "warning"
                  }>
                  {returnRequest.refundStatus}
                </Badge>
              </div>
            </div>
          </div>

          {/* Status Timeline */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiCalendar className="text-primary-600 text-base" />
              Status Timeline
            </h2>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800">
                    Request Submitted
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(returnRequest.requestDate).toLocaleDateString()}
                  </p>
                </div>
              </div>
              {returnRequest.status === "approved" && (
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">
                      Approved
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(returnRequest.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}
              {returnRequest.status === "processing" && (
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">
                      Processing
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(returnRequest.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}
              {returnRequest.status === "completed" && (
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">
                      Completed
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(returnRequest.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}
              {returnRequest.status === "rejected" && (
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">
                      Rejected
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(returnRequest.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3">
              Quick Actions
            </h2>
            <div className="space-y-1.5">
              <Link
                to={`/vendor/orders/${returnRequest.orderId}`}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-xs font-semibold">
                <FiShoppingBag className="text-sm" />
                View Original Order
              </Link>
              <button
                onClick={() =>
                  (window.location.href = `mailto:${returnRequest.customer.email}`)
                }
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-xs font-semibold">
                <FiMail className="text-sm" />
                Email Customer
              </button>
              {returnRequest.customer.phone && (
                <button
                  onClick={() =>
                    (window.location.href = `tel:${returnRequest.customer.phone}`)
                  }
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-xs font-semibold">
                  <FiPhone className="text-sm" />
                  Call Customer
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ReturnRequestDetail;
