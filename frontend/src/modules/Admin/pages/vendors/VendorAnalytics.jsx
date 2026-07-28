import { useMemo, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiBarChart2,
  FiTrendingUp,
  FiDollarSign,
  FiShoppingBag,
  FiPackage,
} from "react-icons/fi";
import { motion } from "framer-motion";
import { formatPrice } from "../../../../shared/utils/helpers";
import { useVendorStore } from "../../store/vendorStore";
const VendorAnalytics = () => {
  const navigate = useNavigate();
  const { vendors, initialize } = useVendorStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  const approvedVendors = vendors.filter((v) => v.status === "approved");

  // Calculate vendor statistics
  const vendorStats = useMemo(() => {
    return approvedVendors
      .map((vendor) => {
        return {
          ...vendor,
          totalOrders: vendor.totalOrders || 0,
          totalRevenue: vendor.totalRevenue || 0,
          totalEarnings: vendor.totalEarnings || 0,
          pendingEarnings: vendor.pendingEarnings || 0,
          paidEarnings: vendor.paidEarnings || 0,
        };
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [approvedVendors]);

  const overallStats = useMemo(() => {
    return {
      totalVendors: approvedVendors.length,
      totalOrders: vendorStats.reduce((sum, v) => sum + v.totalOrders, 0),
      totalRevenue: vendorStats.reduce((sum, v) => sum + v.totalRevenue, 0),
      totalEarnings: vendorStats.reduce((sum, v) => sum + v.totalEarnings, 0),
    };
  }, [approvedVendors.length, vendorStats]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            Vendor Analytics
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            View performance analytics for all vendors
          </p>
        </div>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Vendors</p>
            <FiPackage className="text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {overallStats.totalVendors}
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Orders</p>
            <FiShoppingBag className="text-green-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {overallStats.totalOrders}
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Revenue</p>
            <FiDollarSign className="text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {formatPrice(overallStats.totalRevenue)}
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Earnings</p>
            <FiTrendingUp className="text-orange-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {formatPrice(overallStats.totalEarnings)}
          </p>
        </div>
      </div>

      {/* Vendor Performance Table */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h2 className="text-lg font-bold text-gray-800 mb-4">
          Vendor Performance
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                  Vendor
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                  Orders
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                  Revenue
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                  Earnings
                </th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">
                  Pending
                </th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {vendorStats.map((vendor) => (
                <tr
                  key={vendor.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/admin/vendors/${vendor.id}`)}>
                  <td className="py-3 px-4">
                    <div>
                      <p className="font-semibold text-gray-800">
                        {vendor.storeName || vendor.name}
                      </p>
                      <p className="text-xs text-gray-500">{vendor.email}</p>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="font-semibold text-gray-800">
                      {vendor.totalOrders}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="font-semibold text-gray-800">
                      {formatPrice(vendor.totalRevenue)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="font-semibold text-green-600">
                      {formatPrice(vendor.totalEarnings)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="font-semibold text-yellow-600">
                      {formatPrice(vendor.pendingEarnings)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/admin/vendors/${vendor.id}`);
                      }}
                      className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {vendorStats.length === 0 && (
          <div className="text-center py-12">
            <FiBarChart2 className="text-4xl text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No vendor data available</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default VendorAnalytics;
