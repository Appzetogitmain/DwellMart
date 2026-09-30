import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { motion } from 'framer-motion';
import { FiTrendingUp, FiCalendar } from 'react-icons/fi';
import { formatPrice } from '../../../../shared/utils/helpers';
import { formatDate } from '../../utils/adminHelpers';

const SalesTrendChart = ({ data = [], loading = false }) => {
  // If loading, show skeleton
  if (loading) {
    return (
      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200 animate-pulse">
        <div className="h-6 w-36 bg-gray-200 rounded mb-2"></div>
        <div className="h-4 w-56 bg-gray-100 rounded mb-6"></div>
        <div className="h-[280px] w-full bg-gray-50 rounded-lg flex items-center justify-center">
          <div className="text-gray-300 text-sm">Loading sales trend...</div>
        </div>
      </div>
    );
  }

  // Format data for chart
  const formattedData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    return data.map((item) => {
      let displayDate = item.date;
      let fullDate = item.date;
      try {
        const d = new Date(item.date);
        if (!isNaN(d.getTime())) {
          displayDate = formatDate(d, { month: 'short', day: 'numeric' });
          fullDate = formatDate(d, { day: 'numeric', month: 'short', year: 'numeric' });
        }
      } catch (e) {
        // fallback to original string
      }
      return {
        ...item,
        displayDate,
        fullDate,
        sales: Number(item.sales) || 0,
        orders: Number(item.orders) || 0,
      };
    });
  }, [data]);

  const hasSalesData = formattedData.some((item) => item.sales > 0 || item.orders > 0);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload;
      return (
        <div className="bg-white/95 backdrop-blur-md p-3 sm:p-4 rounded-xl shadow-xl border border-gray-200">
          <p className="text-xs sm:text-sm font-semibold text-gray-800 mb-2 pb-1.5 border-b border-gray-100 flex items-center gap-1.5">
            <FiCalendar className="text-gray-400 text-xs" />
            {point.fullDate || point.date}
          </p>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-medium text-gray-600">Sales:</span>
              <span className="text-sm font-bold text-green-600">
                {formatPrice(point.sales)}
              </span>
            </div>
            {point.orders > 0 && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-medium text-gray-500">Orders:</span>
                <span className="text-xs font-semibold text-gray-700">
                  {point.orders}
                </span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-200"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-2">
        <div>
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <FiTrendingUp className="text-green-600" />
            Sales Trend
          </h3>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Sales Amount (₹) over time for the selected date range
          </p>
        </div>
      </div>

      {!hasSalesData ? (
        <div className="h-[280px] flex flex-col items-center justify-center text-gray-400">
          <FiTrendingUp className="w-10 h-10 mb-2 text-gray-300" />
          <p className="text-sm font-semibold text-gray-600">
            No sales data available for the selected period.
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Try adjusting your date range or filters.
          </p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto scrollbar-admin">
          <ResponsiveContainer width="100%" height={300} minHeight={250}>
            <LineChart
              data={formattedData}
              margin={{ top: 10, right: 20, left: 10, bottom: 25 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="displayDate"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
                angle={-30}
                textAnchor="end"
                height={45}
              />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `₹${Number(val || 0).toLocaleString('en-IN')}`}
                width={70}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="sales"
                name="Sales Amount"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={{ fill: '#10b981', r: 4, strokeWidth: 1.5, stroke: '#fff' }}
                activeDot={{ r: 6, fill: '#059669', stroke: '#fff', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
};

export default SalesTrendChart;
