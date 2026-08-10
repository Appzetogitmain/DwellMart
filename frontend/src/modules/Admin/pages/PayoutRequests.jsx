import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiCheckCircle,
  FiClock,
  FiXCircle,
  FiDollarSign,
  FiCopy,
  FiEye,
  FiEyeOff,
  FiAlertCircle,
  FiX,
  FiCheck,
} from "react-icons/fi";
import api from "../../../shared/utils/api";
import { formatPrice } from "../../../shared/utils/helpers";
import toast from "react-hot-toast";

const PayoutRequests = () => {
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("pending");

  // Modals state
  const [bankInfoModal, setBankInfoModal] = useState(null); // request object
  const [approveModal, setApproveModal] = useState(null); // request object
  const [rejectModal, setRejectModal] = useState(null); // request object

  // Form inputs for modals
  const [utrNumber, setUtrNumber] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMaskedAccount, setShowMaskedAccount] = useState(true);
  const [copiedField, setCopiedField] = useState(null);

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const res = await api.get(`/admin/settlements?status=${filter}`);
      setRequests(
        res.data?.data?.settlements ||
          res.data?.settlements ||
          res.settlements ||
          []
      );
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to fetch payout requests"
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [filter]);

  const handleCopy = (text, fieldName) => {
    if (!text || text === "N/A") return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    toast.success(`Copied ${fieldName} to clipboard!`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const confirmApprove = async () => {
    if (!approveModal) return;
    const utr = utrNumber.trim();
    if (!utr || utr.length < 3) {
      toast.error("Please enter a valid Bank UTR / Transaction Reference ID.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.put(`/admin/settlements/${approveModal._id}/approve`, {
        transactionId: utr,
      });
      toast.success(`✓ Payout approved successfully. UTR: ${utr}`);
      setApproveModal(null);
      setUtrNumber("");
      fetchRequests();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "✕ Failed to approve payout"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmReject = async () => {
    if (!rejectModal) return;
    if (!rejectionReason.trim() || rejectionReason.trim().length < 3) {
      toast.error("Please provide a valid rejection reason.");
      return;
    }

    setIsSubmitting(true);
    try {
      await api.put(`/admin/settlements/${rejectModal._id}/reject`, {
        reason: rejectionReason.trim(),
      });
      toast.success("✕ Payout request rejected. Funds returned to vendor balance.");
      setRejectModal(null);
      setRejectionReason("");
      fetchRequests();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "✕ Failed to reject payout"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const maskAccountNumber = (accNo) => {
    if (!accNo || accNo.length < 4) return accNo || "N/A";
    return "•••• •••• " + accNo.slice(-4);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-1">
            Vendor Payout Requests
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Review, transfer funds, approve or reject vendor withdrawals
          </p>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-1">
          {["all", "pending", "completed", "rejected"].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize ${
                filter === tab
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500 font-medium">
            Loading payout requests...
          </div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center text-gray-500 font-medium">
            No {filter !== "all" ? filter : ""} payout requests found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="p-4">Vendor</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Method</th>
                  <th className="p-4">Request Date</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {requests.map((req) => (
                  <tr
                    key={req._id}
                    className="hover:bg-gray-50/80 transition-colors">
                    <td className="p-4">
                      <div className="font-semibold text-gray-900">
                        {req.vendorId?.storeName ||
                          req.vendorId?.name ||
                          "Unknown Vendor"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {req.vendorId?.email}
                      </div>
                    </td>
                    <td className="p-4 font-bold text-gray-900 text-base">
                      {formatPrice(req.amount)}
                    </td>
                    <td className="p-4">
                      <span className="capitalize text-xs font-medium text-gray-700 bg-gray-100 px-2.5 py-1 rounded-md border border-gray-200">
                        {req.paymentMethod?.replace("_", " ")}
                      </span>
                    </td>
                    <td className="p-4 text-gray-600">
                      {new Date(req.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                          req.status === "completed"
                            ? "bg-green-100 text-green-800"
                            : req.status === "rejected"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                        }`}>
                        {req.status === "completed" ? (
                          <FiCheckCircle />
                        ) : req.status === "rejected" ? (
                          <FiXCircle />
                        ) : (
                          <FiClock />
                        )}
                        <span className="capitalize">{req.status}</span>
                      </span>
                      {req.transactionId && (
                        <div className="text-xs text-gray-500 mt-1 font-mono">
                          UTR: {req.transactionId}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setBankInfoModal(req)}
                          className="bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors">
                          Bank Info
                        </button>
                        {req.status === "pending" && (
                          <>
                            <button
                              onClick={() => {
                                setApproveModal(req);
                                setUtrNumber("");
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1">
                              <FiCheck /> Approve
                            </button>
                            <button
                              onClick={() => {
                                setRejectModal(req);
                                setRejectionReason("");
                              }}
                              className="bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1">
                              <FiX /> Reject
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 1. BANK INFO MODAL ────────────────────────────────────────────── */}
      <AnimatePresence>
        {bankInfoModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg border border-gray-100">
              <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-4">
                <h3 className="text-xl font-bold text-gray-900">
                  Vendor Bank & Payout Details
                </h3>
                <button
                  onClick={() => setBankInfoModal(null)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                  <FiX className="text-xl" />
                </button>
              </div>

              <div className="space-y-4 mb-6">
                <div className="bg-blue-50/70 p-4 rounded-xl border border-blue-100 flex justify-between items-center">
                  <div>
                    <p className="text-xs font-medium text-blue-600">
                      Requested Amount
                    </p>
                    <p className="text-2xl font-bold text-blue-900">
                      {formatPrice(bankInfoModal.amount)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-blue-600">
                      Payment Method
                    </p>
                    <p className="text-sm font-bold text-blue-900 capitalize">
                      {bankInfoModal.paymentMethod?.replace("_", " ")}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-200/80">
                  <div className="flex justify-between items-center border-b border-gray-200/60 pb-2">
                    <div>
                      <p className="text-xs text-gray-500 font-medium">
                        Store & Vendor
                      </p>
                      <p className="font-semibold text-gray-800 text-sm">
                        {bankInfoModal.vendorId?.storeName ||
                          bankInfoModal.vendorId?.name}
                      </p>
                    </div>
                    <span className="text-xs text-gray-500">
                      ID: {bankInfoModal.vendorId?._id?.slice(-6)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xs text-gray-500 font-medium">
                        Account Holder
                      </p>
                      <p className="font-semibold text-gray-800 text-sm">
                        {bankInfoModal.vendorId?.bankDetails?.accountName ||
                          "N/A"}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <p className="text-xs text-gray-500 font-medium">
                        Account Number
                      </p>
                      <p className="font-mono font-bold text-gray-900 text-sm">
                        {showMaskedAccount
                          ? maskAccountNumber(
                              bankInfoModal.vendorId?.bankDetails?.accountNumber
                            )
                          : bankInfoModal.vendorId?.bankDetails?.accountNumber ||
                            "N/A"}
                      </p>
                    </div>
                    <div className="flex gap-1 items-center">
                      <button
                        onClick={() =>
                          setShowMaskedAccount(!showMaskedAccount)
                        }
                        className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
                        title={
                          showMaskedAccount ? "Show Account" : "Mask Account"
                        }>
                        {showMaskedAccount ? <FiEye /> : <FiEyeOff />}
                      </button>
                      <button
                        onClick={() =>
                          handleCopy(
                            bankInfoModal.vendorId?.bankDetails?.accountNumber,
                            "Account Number"
                          )
                        }
                        className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium">
                        <FiCopy /> Copy
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-200/60">
                    <div>
                      <p className="text-xs text-gray-500 font-medium">
                        Bank Name
                      </p>
                      <p className="font-semibold text-gray-800 text-sm">
                        {bankInfoModal.vendorId?.bankDetails?.bankName || "N/A"}
                      </p>
                    </div>
                    <div>
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-gray-500 font-medium">
                          IFSC Code
                        </p>
                        <button
                          onClick={() =>
                            handleCopy(
                              bankInfoModal.vendorId?.bankDetails?.ifscCode,
                              "IFSC Code"
                            )
                          }
                          className="text-blue-600 text-xs font-semibold flex items-center gap-0.5 hover:underline">
                          <FiCopy className="text-[10px]" /> Copy
                        </button>
                      </div>
                      <p className="font-mono font-bold text-gray-900 text-sm">
                        {bankInfoModal.vendorId?.bankDetails?.ifscCode || "N/A"}
                      </p>
                    </div>
                  </div>

                  {bankInfoModal.vendorId?.bankDetails?.upiId && (
                    <div className="pt-2 border-t border-gray-200/60 flex justify-between items-center">
                      <div>
                        <p className="text-xs text-gray-500 font-medium">
                          UPI ID
                        </p>
                        <p className="font-mono font-semibold text-gray-900 text-sm">
                          {bankInfoModal.vendorId.bankDetails.upiId}
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          handleCopy(
                            bankInfoModal.vendorId.bankDetails.upiId,
                            "UPI ID"
                          )
                        }
                        className="text-blue-600 text-xs font-semibold flex items-center gap-1 hover:underline">
                        <FiCopy /> Copy
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setBankInfoModal(null)}
                  className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-sm font-semibold transition-colors">
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── 2. APPROVE PAYOUT CONFIRMATION MODAL ──────────────────────────── */}
      <AnimatePresence>
        {approveModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-gray-100">
              <div className="flex items-center gap-3 mb-4 text-emerald-600">
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                  <FiCheckCircle className="text-2xl" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    Approve Vendor Payout
                  </h3>
                  <p className="text-xs text-gray-500">
                    Confirm bank transfer and complete payout
                  </p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-100">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-600 font-medium">
                      Payout Amount
                    </span>
                    <span className="text-2xl font-bold text-emerald-700">
                      {formatPrice(approveModal.amount)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Vendor:{" "}
                    <strong className="text-gray-800">
                      {approveModal.vendorId?.storeName ||
                        approveModal.vendorId?.name}
                    </strong>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                  <FiAlertCircle className="text-amber-600 text-lg flex-shrink-0 mt-0.5" />
                  <span>
                    Please ensure funds have already been transferred to the vendor bank account before confirming.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Bank UTR / Transaction Reference ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={utrNumber}
                    onChange={(e) => setUtrNumber(e.target.value)}
                    placeholder="Enter the UTR/reference number received from the bank"
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setApproveModal(null)}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition-colors">
                  Cancel
                </button>
                <button
                  onClick={confirmApprove}
                  disabled={isSubmitting || utrNumber.trim().length < 3}
                  className={`px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition-colors flex items-center gap-2 ${
                    utrNumber.trim().length >= 3
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-emerald-300 cursor-not-allowed"
                  }`}>
                  {isSubmitting ? "Approving..." : "Confirm Approval"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── 3. REJECT PAYOUT CONFIRMATION MODAL ───────────────────────────── */}
      <AnimatePresence>
        {rejectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-gray-100">
              <div className="flex items-center gap-3 mb-4 text-red-600">
                <div className="p-3 bg-red-50 rounded-xl border border-red-100">
                  <FiXCircle className="text-2xl" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    Reject Payout Request
                  </h3>
                  <p className="text-xs text-gray-500">
                    Return funds to vendor's withdrawable balance
                  </p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="bg-red-50/60 p-4 rounded-xl border border-red-100">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-600 font-medium">
                      Payout Amount
                    </span>
                    <span className="text-2xl font-bold text-red-700">
                      {formatPrice(rejectModal.amount)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Vendor:{" "}
                    <strong className="text-gray-800">
                      {rejectModal.vendorId?.storeName ||
                        rejectModal.vendorId?.name}
                    </strong>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Rejection Reason <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="e.g. Incorrect bank account number or invalid IFSC code."
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:outline-none resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setRejectModal(null)}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-semibold transition-colors">
                  Cancel
                </button>
                <button
                  onClick={confirmReject}
                  disabled={isSubmitting || rejectionReason.trim().length < 3}
                  className={`px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition-colors flex items-center gap-2 ${
                    rejectionReason.trim().length >= 3
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-red-300 cursor-not-allowed"
                  }`}>
                  {isSubmitting ? "Rejecting..." : "Reject Payout"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default PayoutRequests;
