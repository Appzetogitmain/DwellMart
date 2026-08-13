import { useState, useEffect, useMemo } from "react";
import { FiDollarSign, FiTrendingUp, FiTrendingDown } from "react-icons/fi";
import { motion } from "framer-motion";
import ProfitLossChart from "../../components/Analytics/ProfitLossChart";
import AnimatedSelect from "../../components/AnimatedSelect";
import { formatPrice } from '../../../../shared/utils/helpers';
import api from '../../../../shared/utils/api';
import { useAnalyticsStore } from "../../../../shared/store/analyticsStore";

const getRangeForPeriod = (period) => {
  const now = new Date();
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let startDate = new Date(endDate);

  if (period === 'week') {
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

const ProfitLoss = () => {
  const [period, setPeriod] = useState("month");
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [plSummary, setPlSummary] = useState(null);
  const { financialSummary, fetchFinancialSummary } = useAnalyticsStore();

  // Commission-based platform economics, computed server-side.
  useEffect(() => {
    let mounted = true;
    const range = getRangeForPeriod(period);
    api
      .get('/admin/analytics/pl-summary', { params: range })
      .then((res) => {
        if (mounted) setPlSummary(res?.data || null);
      })
      .catch(() => {
        if (mounted) setPlSummary(null);
      });
    return () => {
      mounted = false;
    };
  }, [period]);

  useEffect(() => {
    const periodMap = {
      week: 'daily',
      month: 'daily',
      year: 'monthly'
    };
    const range = getRangeForPeriod(period);
    let mounted = true;

    const run = async () => {
      setIsPageLoading(true);
      try {
        await fetchFinancialSummary(periodMap[period] || 'monthly', range);
      } finally {
        if (mounted) setIsPageLoading(false);
      }
    };

    run();
    return () => {
      mounted = false;
    };
  }, [period, fetchFinancialSummary]);

  const chartData = useMemo(() => {
    return financialSummary.map(item => ({
      ...item,
      date: item._id,
    }));
  }, [financialSummary]);

  /**
   * Composition of GMV — presentational only.
   *
   * These are the parts that MAKE UP `Order.total`, not deductions from it.
   * The previous version computed
   *   netProfit = revenue − (tax + shipping + discount)
   * which double-counts every term: `Order.total` already includes tax and
   * shipping and is already net of discount. It also contained no commission,
   * no vendor payout and no COGS, so the number it labelled "Net Profit" was
   * not a profit under any definition.
   *
   * Actual platform economics now come from `/analytics/pl-summary`, which is
   * commission-based — see `plSummary` below.
   */
  const financials = useMemo(() => {
    const gmv = financialSummary.reduce((sum, item) => sum + (item.revenue || 0), 0);
    const totalTax = financialSummary.reduce((sum, item) => sum + (item.tax || 0), 0);
    const totalDelivery = financialSummary.reduce((sum, item) => sum + (item.delivery || 0), 0);
    const totalDiscount = financialSummary.reduce((sum, item) => sum + (item.discount || 0), 0);

    return { gmv, totalTax, totalDelivery, totalDiscount };
  }, [financialSummary]);

  if (isPageLoading && financialSummary.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
          Profit & Loss
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          View financial performance and profitability
        </p>
      </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <AnimatedSelect
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          options={[
            { value: "week", label: "Last 7 Days" },
            { value: "month", label: "Last 30 Days" },
            { value: "year", label: "Last Year" },
          ]}
          className="min-w-[140px]"
        />
      </div>

      {/* Platform economics — commission-based, computed server-side. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Commission Revenue</p>
            <FiTrendingUp className="text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-600">
            {plSummary ? formatPrice(plSummary.commissionRevenue) : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">What the platform actually earns</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Refunds Issued</p>
            <FiTrendingDown className="text-red-600" />
          </div>
          <p className="text-2xl font-bold text-red-600">
            {plSummary ? formatPrice(plSummary.refunded) : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Settled refunds only</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-600">Net Platform Revenue</p>
            <FiDollarSign className="text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {plSummary ? formatPrice(plSummary.netPlatformRevenue) : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Commission less refunds</p>
        </div>
      </div>

      {/* GMV composition. These are the PARTS of order totals, not deductions
          from them — labelled as such so nobody subtracts them again. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold text-gray-800 mb-1">Gross Merchandise Value</h3>
          <p className="text-xs text-gray-500 mb-4">Total transacted through the platform (paid orders)</p>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">GMV</span>
            <span className="font-bold text-gray-800">
              {plSummary ? formatPrice(plSummary.gmv) : formatPrice(financials.gmv)}
            </span>
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="text-gray-600">Owed to vendors</span>
            <span className="font-bold text-gray-800">
              {plSummary ? formatPrice(plSummary.vendorEarnings) : '—'}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold text-gray-800 mb-1">GMV Composition</h3>
          <p className="text-xs text-gray-500 mb-4">
            Components already included in GMV — not deductions from it
          </p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Tax collected</span>
              <span className="font-semibold text-gray-700">{formatPrice(financials.totalTax)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Shipping collected</span>
              <span className="font-semibold text-gray-700">{formatPrice(financials.totalDelivery)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Discounts given</span>
              <span className="font-semibold text-gray-700">{formatPrice(financials.totalDiscount)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
        <strong>Basis:</strong> platform revenue is commission earned, not gross merchandise value.
        Operating costs and cost of goods are not held in this system, so a true net profit
        cannot be computed here.
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Financial Trends</h3>
          <AnimatedSelect
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            options={[
              { value: "week", label: "Last 7 Days" },
              { value: "month", label: "Last 30 Days" },
              { value: "year", label: "Last Year" },
            ]}
            className="min-w-[140px]"
          />
        </div>
        <ProfitLossChart data={chartData} period={period} />
      </div>
    </motion.div>
  );
};

export default ProfitLoss;
