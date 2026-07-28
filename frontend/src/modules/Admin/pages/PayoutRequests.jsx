import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FiCheckCircle, FiClock, FiDollarSign } from "react-icons/fi";
import api from "../../../shared/utils/api";
import { formatPrice } from "../../../shared/utils/helpers";
import toast from "react-hot-toast";

const PayoutRequests = () => {
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("pending");

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      // Assuming Admin API is at /admin/settlements
      const res = await api.get(`/admin/settlements?status=${filter}`);
      setRequests(res.data?.data?.settlements || res.data?.settlements || res.settlements || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to fetch payout requests");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [filter]);

  const handleApprove = async (id) => {
    if (!window.confirm("Are you sure you want to approve this payout? Funds should have already been transferred.")) return;
    try {
      await api.put(`/admin/settlements/${id}/approve`);
      toast.success("Payout approved successfully");
      fetchRequests();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to approve payout");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            Vendor Payout Requests
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Review and approve vendor withdrawals
          </p>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setFilter("pending")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              filter === "pending"
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => setFilter("completed")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              filter === "completed"
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Completed
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : requests.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No requests found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-600">
                  <th className="p-4">Vendor</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Method</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requests.map((req) => (
                  <tr key={req._id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4">
                      <div className="font-medium text-gray-800">
                        {req.vendorId?.storeName || req.vendorId?.name || "Unknown"}
                      </div>
                      <div className="text-sm text-gray-500">{req.vendorId?.email}</div>
                    </td>
                    <td className="p-4 font-bold text-gray-800">
                      {formatPrice(req.amount)}
                    </td>
                    <td className="p-4">
                      <span className="capitalize text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">
                        {req.paymentMethod?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-gray-600">
                      {new Date(req.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                          req.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : "bg-orange-100 text-orange-700"
                        }`}
                      >
                        {req.status === "completed" ? <FiCheckCircle /> : <FiClock />}
                        <span className="capitalize">{req.status}</span>
                      </span>
                    </td>
                    <td className="p-4">
                      {req.status === "pending" && (
                        <button
                          onClick={() => handleApprove(req._id)}
                          className="bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                        >
                          Approve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default PayoutRequests;
