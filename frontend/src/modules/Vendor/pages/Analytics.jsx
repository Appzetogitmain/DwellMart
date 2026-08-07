import { useState, useMemo, useEffect } from "react";
import {
  FiBarChart2,
  FiTrendingUp,
  FiPackage,
  FiShoppingBag,
  FiLayers,
} from "react-icons/fi";
import { MdCurrencyRupee } from "react-icons/md";
import { motion } from "framer-motion";
import RevenueLineChart from "../../Admin/components/Analytics/RevenueLineChart";
import SalesBarChart from "../../Admin/components/Analytics/SalesBarChart";
import OrderStatusPieChart from "../../Admin/components/Analytics/OrderStatusPieChart";
import RevenueVsOrdersChart from "../../Admin/components/Analytics/RevenueVsOrdersChart";
import TimePeriodFilter from "../../Admin/components/Analytics/TimePeriodFilter";
import ExportButton from "../../Admin/components/ExportButton";
import { formatPrice } from "../../../shared/utils/helpers";
import { filterByDateRange, getDateRange } from "../../Admin/utils/adminHelpers";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import { getVendorAnalyticsOverview } from "../services/vendorService";
import { getVendorCapabilities } from "../../../shared/config/vendorCapabilities";

const Analytics = () => {
  const { vendor } = useVendorAuthStore();
  const [period, setPeriod] = useState("month");
  const [analyticsData, setAnalyticsData] = useState([]);
  const [statusData, setStatusData] = useState([]);
  const [summary, setSummary] = useState({
    totalRevenue: 0,
    pendingEarnings: 0,
    totalOrders: 0,
    totalProducts: 0,
  });
  const [wholesale, setWholesale] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const vendorId = vendor?.id || vendor?._id;
  const caps = getVendorCapabilities(vendor?.vendorType ?? 'retail');
  // Wholesale analytics section only visible for vendors with bulk pricing capability.
  const showWholesale = caps.features.bulkPricing === true;

  useEffect(() => {
    if (!vendorId) {
      setAnalyticsData([]);
      setStatusData([]);
      setSummary({
        totalRevenue: 0,
        pendingEarnings: 0,
        totalOrders: 0,
        totalProducts: 0,
      });
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const res = await getVendorAnalyticsOverview({ period });
        const data = res?.data ?? res;

        const timeseries = Array.isArray(data?.timeseries) ? data.timeseries : [];
        setAnalyticsData(timeseries);
        setStatusData(Array.isArray(data?.statusBreakdown) ? data.statusBreakdown : []);
        setWholesale(data?.wholesale ?? null);
        setSummary({
          totalRevenue: data?.summary?.totalRevenue ?? 0,
          pendingEarnings: data?.summary?.pendingEarnings ?? 0,
          totalOrders: data?.summary?.totalOrders ?? 0,
          totalProducts: data?.summary?.totalProducts ?? 0,
        });
      } catch {
        setAnalyticsData([]);
        setStatusData([]);
        setWholesale(null);
        setSummary({
          totalRevenue: 0,
          pendingEarnings: 0,
          totalOrders: 0,
          totalProducts: 0,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [vendorId, period]);

  const exportData = useMemo(() => {
    const range = getDateRange(period);
    return filterByDateRange(analyticsData, range.start, range.end);
  }, [analyticsData, period]);

  const analyticsSummary = useMemo(() => {
    const recentRevenue = analyticsData.slice(-7).reduce((sum, d) => sum + d.revenue, 0);
    const previousRevenue = analyticsData
      .slice(-14, -7)
      .reduce((sum, d) => sum + d.revenue, 0);

    const revenueChange =
      previousRevenue > 0
        ? (((recentRevenue - previousRevenue) / previousRevenue) * 100).toFixed(1)
        : recentRevenue > 0
          ? 100
          : 0;

    const recentOrders = analyticsData.slice(-7).reduce((sum, d) => sum + d.orders, 0);
    const previousOrders = analyticsData
      .slice(-14, -7)
      .reduce((sum, d) => sum + d.orders, 0);

    const ordersChange =
      previousOrders > 0
        ? (((recentOrders - previousOrders) / previousOrders) * 100).toFixed(1)
        : recentOrders > 0
          ? 100
          : 0;

    return {
      ...summary,
      revenueChange: parseFloat(revenueChange),
      ordersChange: parseFloat(ordersChange),
    };
  }, [analyticsData, summary]);

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to view analytics</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <p className="text-gray-500 text-center">Loading analytics...</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="lg:hidden">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
            Analytics & Reports
          </h1>
          <p className="text-gray-600">Your store performance and metrics</p>
        </div>
        <div className="flex items-center gap-3">
          <TimePeriodFilter selectedPeriod={period} onPeriodChange={setPeriod} />
          <ExportButton
            data={exportData}
            headers={[
              { label: "Date", accessor: (row) => row.date },
              { label: "Revenue", accessor: (row) => formatPrice(row.revenue) },
              { label: "Orders", accessor: (row) => row.orders },
            ]}
            filename="vendor-analytics-report"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Revenue</p>
            <MdCurrencyRupee className="text-green-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {formatPrice(analyticsSummary.totalRevenue)}
          </p>
          <div className="flex items-center gap-1 mt-2">
            <FiTrendingUp className="text-green-600" />
            <span className="text-sm text-green-600">
              {analyticsSummary.revenueChange}%
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Orders</p>
            <FiShoppingBag className="text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {analyticsSummary.totalOrders}
          </p>
          <div className="flex items-center gap-1 mt-2">
            <FiTrendingUp className="text-green-600" />
            <span className="text-sm text-green-600">
              {analyticsSummary.ordersChange}%
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Products</p>
            <FiPackage className="text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {analyticsSummary.totalProducts}
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Pending Earnings</p>
            <FiBarChart2 className="text-orange-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {formatPrice(analyticsSummary.pendingEarnings)}
          </p>
          <p className="text-xs text-gray-500 mt-2">Awaiting settlement</p>
        </div>
      </div>

      {/* Wholesale Analytics — only for vendors on the wholesale channel */}
      {showWholesale && wholesale && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-800">Wholesale Performance</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Retail Orders</p>
                <FiShoppingBag className="text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-gray-800">{wholesale.retailOrders ?? 0}</p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Wholesale Orders</p>
                <FiLayers className="text-emerald-600" />
              </div>
              <p className="text-2xl font-bold text-gray-800">{wholesale.wholesaleOrders ?? 0}</p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Bulk Revenue</p>
                <MdCurrencyRupee className="text-green-600" />
              </div>
              <p className="text-2xl font-bold text-gray-800">
                {formatPrice(wholesale.bulkRevenue ?? 0)}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                {formatPrice(wholesale.customerSavings ?? 0)} passed to customers
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Most Used Tier</p>
                <FiTrendingUp className="text-purple-600" />
              </div>
              <p className="text-2xl font-bold text-gray-800">
                {wholesale.mostUsedTier ? `${wholesale.mostUsedTier.minQty}+ units` : "—"}
              </p>
              {wholesale.mostUsedTier && (
                <p className="text-xs text-gray-500 mt-2">
                  Applied {wholesale.mostUsedTier.timesUsed} time
                  {wholesale.mostUsedTier.timesUsed === 1 ? "" : "s"}
                </p>
              )}
            </div>
          </div>

          {wholesale.topBulkProducts?.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 overflow-x-auto">
              <h3 className="text-base font-bold text-gray-800 mb-4">Top Bulk Products</h3>
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="pb-2 font-semibold">Product</th>
                    <th className="pb-2 font-semibold text-right">Units</th>
                    <th className="pb-2 font-semibold text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {wholesale.topBulkProducts.map((product) => (
                    <tr key={product.productId} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 text-gray-800 font-medium">{product.name}</td>
                      <td className="py-2 text-right text-gray-600">{product.unitsSold}</td>
                      <td className="py-2 text-right text-gray-800 font-semibold">
                        {formatPrice(product.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {analyticsData.length > 0 ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RevenueLineChart data={analyticsData} period={period} />
            <SalesBarChart data={analyticsData} period={period} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RevenueVsOrdersChart data={analyticsData} period={period} />
            <OrderStatusPieChart data={statusData} />
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-200 text-center">
          <FiBarChart2 className="text-4xl text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-2">No analytics data available</p>
          <p className="text-sm text-gray-400">
            Analytics will appear here once you start receiving orders
          </p>
        </div>
      )}
    </motion.div>
  );
};

export default Analytics;
