import { useState, useEffect, useMemo } from 'react';
import { FiBarChart2, FiTrendingUp } from 'react-icons/fi';
import { motion } from 'framer-motion';
import RevenueChart from '../components/Analytics/RevenueChart';
import SalesChart from '../components/Analytics/SalesChart';
import TimePeriodFilter from '../components/Analytics/TimePeriodFilter';
import WholesaleOverviewPanel from '../components/Analytics/WholesaleOverviewPanel';
import ExportButton from '../components/ExportButton';
import { formatCurrency } from '../utils/adminHelpers';
import { getDashboardStats, getRevenueData } from '../services/adminService';

const getRangeForPeriod = (period) => {
  const now = new Date();
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let startDate = new Date(endDate);

  if (period === 'today') {
    startDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 0, 0, 0, 0);
  } else if (period === 'week') {
    startDate.setDate(endDate.getDate() - 6);
  } else if (period === 'month') {
    startDate.setDate(endDate.getDate() - 29);
  } else {
    startDate.setFullYear(endDate.getFullYear() - 1);
    startDate.setDate(endDate.getDate() + 1);
  }

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
};

const Analytics = () => {
  const [period, setPeriod] = useState('month');
  const [isLoading, setIsLoading] = useState(true);
  const [analyticsSummary, setAnalyticsSummary] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    totalProducts: 0,
    totalCustomers: 0,
    revenueChange: 0,
    ordersChange: 0,
    productsChange: 0,
    customersChange: 0,
  });
  const [revenueData, setRevenueData] = useState([]);

  const mapUiPeriodToApiPeriod = (uiPeriod) => {
    if (uiPeriod === 'today' || uiPeriod === 'week') return 'daily';
    if (uiPeriod === 'month') return 'daily';
    return 'monthly';
  };

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const apiPeriod = mapUiPeriodToApiPeriod(period);
        const range = getRangeForPeriod(period);
        const [statsRes, revenueRes] = await Promise.allSettled([
          getDashboardStats(),
          getRevenueData(apiPeriod, range),
        ]);

        if (mounted && statsRes.status === 'fulfilled') {
          const stats = statsRes.value?.data || {};
          setAnalyticsSummary({
            totalRevenue: stats.totalRevenue || 0,
            totalOrders: stats.totalOrders || 0,
            totalProducts: stats.totalProducts || 0,
            totalCustomers: stats.totalUsers || 0,
            revenueChange: 0,
            ordersChange: 0,
            productsChange: 0,
            customersChange: 0,
          });
        }

        if (mounted && revenueRes.status === 'fulfilled') {
          const mappedRevenue = (revenueRes.value?.data || []).map((item) => ({
            date: item._id,
            revenue: item.revenue || 0,
            orders: item.orders || 0,
          }));
          setRevenueData(mappedRevenue);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    fetchData();
    return () => {
      mounted = false;
    };
  }, [period]);

  const visibleRevenueData = useMemo(() => revenueData || [], [revenueData]);

  if (isLoading && visibleRevenueData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
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
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Analytics & Reports</h1>
          <p className="text-gray-600">Detailed analytics and performance metrics</p>
        </div>
        <div className="flex items-center gap-3">
          <TimePeriodFilter selectedPeriod={period} onPeriodChange={setPeriod} />
          <ExportButton
            data={visibleRevenueData}
            headers={[
              { label: 'Date', accessor: (row) => row.date },
              { label: 'Revenue', accessor: (row) => formatCurrency(row.revenue) },
              { label: 'Orders', accessor: (row) => row.orders },
            ]}
            filename="analytics_report"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Revenue</p>
            <FiBarChart2 className="text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {formatCurrency(analyticsSummary.totalRevenue)}
          </p>
          <div className="flex items-center gap-1 mt-2">
            <FiTrendingUp className="text-green-600" />
            <span className="text-sm text-green-600">{analyticsSummary.revenueChange}%</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Orders</p>
            <FiBarChart2 className="text-green-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">{analyticsSummary.totalOrders}</p>
          <div className="flex items-center gap-1 mt-2">
            <FiTrendingUp className="text-green-600" />
            <span className="text-sm text-green-600">{analyticsSummary.ordersChange}%</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Products</p>
            <FiBarChart2 className="text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">{analyticsSummary.totalProducts}</p>
          <div className="flex items-center gap-1 mt-2">
            <FiTrendingUp className="text-green-600" />
            <span className="text-sm text-green-600">{analyticsSummary.productsChange}%</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Total Customers</p>
            <FiBarChart2 className="text-orange-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">{analyticsSummary.totalCustomers}</p>
          <div className="flex items-center gap-1 mt-2">
            <FiTrendingUp className="text-green-600" />
            <span className="text-sm text-green-600">{analyticsSummary.customersChange}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenueChart data={visibleRevenueData} period={period} />
        <SalesChart data={visibleRevenueData} period={period} />
      </div>

      {/* Renders only when the Wholesale Marketplace feature flag is enabled. */}
      <WholesaleOverviewPanel />
    </motion.div>
  );
};

export default Analytics;

