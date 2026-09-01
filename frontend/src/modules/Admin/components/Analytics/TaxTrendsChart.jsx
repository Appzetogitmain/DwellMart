import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Bar,
  ComposedChart,
  Line,
} from "recharts";
import {
  formatDate,
  formatCurrency,
  filterByDateRange,
  getDateRange,
} from "../../utils/adminHelpers";
import { motion } from "framer-motion";
import { FiTrendingUp, FiFileText } from "react-icons/fi";

const TaxTrendsChart = ({ taxData = [], dateRange = { start: "", end: "" } }) => {
  const [period, setPeriod] = useState("all");

  const filteredData = useMemo(() => {
    if (!taxData || taxData.length === 0) return [];

    // If a custom date range is set in the parent page:
    if (dateRange.start || dateRange.end) {
      const start = dateRange.start ? new Date(dateRange.start) : new Date(0);
      const end = dateRange.end ? new Date(dateRange.end) : new Date(8640000000000000);
      end.setHours(23, 59, 59, 999);

      return taxData
        .filter((item) => {
          const itemDate = new Date(item.date);
          return itemDate >= start && itemDate <= end;
        })
        .map((item) => ({
          ...item,
          dateLabel: formatDate(item.date, { month: "short", day: "numeric" }),
          taxRate: item.taxRate || 18,
        }));
    }

    if (period === "all") {
      return taxData.map((item) => ({
        ...item,
        dateLabel: formatDate(item.date, { month: "short", day: "numeric" }),
        taxRate: item.taxRate || 18,
      }));
    }

    const range = getDateRange(period);
    const filtered = filterByDateRange(taxData, range.start, range.end);
    // If chosen period has no data (e.g. start of new month), show all available
    const dataToUse = filtered.length > 0 ? filtered : taxData;

    return dataToUse.map((item) => ({
      ...item,
      dateLabel: formatDate(item.date, { month: "short", day: "numeric" }),
      taxRate: item.taxRate || 18,
    }));
  }, [taxData, period, dateRange]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white/95 backdrop-blur-md p-4 rounded-xl shadow-2xl border border-gray-200/80">
          <p className="text-sm font-semibold text-gray-800 mb-3 pb-2 border-b border-gray-200">
            {label}
          </p>
          <div className="space-y-2">
            {payload.map((entry, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-xs font-medium text-gray-600">
                    {entry.name}:
                  </span>
                </div>
                <span
                  className="text-sm font-bold"
                  style={{ color: entry.color }}>
                  {entry.name.includes("Tax") || entry.name.includes("Revenue")
                    ? formatCurrency(entry.value)
                    : `${entry.value}%`}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-gray-200">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center gap-2">
            <FiTrendingUp className="text-primary-600" /> Tax Collection Trends
          </h3>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Tax collection, gross revenue, and effective tax rates
          </p>
        </div>

        {/* Period tabs (only active when no custom dateRange is selected) */}
        {!dateRange.start && !dateRange.end && (
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {[
              { key: "all", label: "All Time" },
              { key: "month", label: "This Month" },
              { key: "week", label: "7 Days" },
              { key: "year", label: "This Year" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setPeriod(tab.key)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                  period === tab.key
                    ? "bg-white text-slate-900 shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {filteredData.length === 0 ? (
        <div className="h-[300px] flex flex-col items-center justify-center text-slate-400">
          <FiFileText className="w-10 h-10 mb-2 opacity-40 text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">No tax data available for selected range</p>
          <p className="text-xs text-slate-400 mt-0.5">Try choosing 'All Time' or adjusting the date filters.</p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto scrollbar-admin">
          <ResponsiveContainer width="100%" height={350} minHeight={300}>
            <ComposedChart
              data={filteredData}
              margin={{ top: 10, right: 20, left: 10, bottom: 25 }}>
              <defs>
                <linearGradient id="colorTax" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#f1f5f9"
                opacity={0.8}
              />
              <XAxis
                dataKey="dateLabel"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#e2e8f0" }}
                angle={-30}
                textAnchor="end"
                height={50}
              />
              <YAxis
                yAxisId="left"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `₹${Number(value || 0).toLocaleString('en-IN')}`}
                width={70}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${value}%`}
                width={45}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                yAxisId="left"
                dataKey="taxAmount"
                fill="url(#colorTax)"
                radius={[6, 6, 0, 0]}
                name="Tax Collected"
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="total"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#colorRevenue)"
                name="Total Revenue"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="taxRate"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ fill: "#f59e0b", r: 4 }}
                activeDot={{ r: 6 }}
                name="Tax Rate %"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
};

export default TaxTrendsChart;
