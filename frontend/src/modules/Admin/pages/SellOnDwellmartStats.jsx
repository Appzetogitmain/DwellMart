import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FiUsers,
  FiPackage,
  FiMapPin,
  FiCheckCircle,
  FiDollarSign,
  FiShoppingBag,
  FiTruck,
  FiTrendingUp,
  FiCreditCard,
  FiSave,
  FiRefreshCw,
  FiAlertCircle,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../../../shared/utils/api';

const initialFormData = {
  activeVendors: '',
  productsSold: '',
  citiesCovered: '',
  onTimeDeliveryRate: '',
  todaysRevenue: '',
  ordersToday: '',
  expressDeliveries: '',
  revenueGrowthPercent: '',
  dailySettlementAmount: '',
};

const SellOnDwellmartStats = () => {
  const [formData, setFormData] = useState(initialFormData);
  const [initialData, setInitialData] = useState(initialFormData);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setFieldErrors({});
    try {
      const response = await api.get('/admin/sell-on-dwellmart/stats');
      const data = response?.data || response || {};
      const stats = {
        activeVendors: data.activeVendors ?? '',
        productsSold: data.productsSold ?? '',
        citiesCovered: data.citiesCovered ?? '',
        onTimeDeliveryRate: data.onTimeDeliveryRate ?? '',
        todaysRevenue: data.todaysRevenue ?? '',
        ordersToday: data.ordersToday ?? '',
        expressDeliveries: data.expressDeliveries ?? '',
        revenueGrowthPercent: data.revenueGrowthPercent ?? '',
        dailySettlementAmount: data.dailySettlementAmount ?? '',
      };
      setFormData(stats);
      setInitialData(stats);
    } catch (error) {
      console.error('Failed to load Sell On Dwell Mart statistics:', error);
      toast.error('Failed to load statistics from server.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validateForm = () => {
    const errors = {};
    const htmlTagRegex = /<[^>]*>/i;

    const fields = [
      { key: 'activeVendors', label: 'Active Vendors' },
      { key: 'productsSold', label: 'Products Sold' },
      { key: 'citiesCovered', label: 'Cities Covered' },
      { key: 'onTimeDeliveryRate', label: 'On-Time Express Delivery Rate' },
      { key: 'todaysRevenue', label: "Today's Revenue" },
      { key: 'ordersToday', label: 'Orders Today' },
      { key: 'expressDeliveries', label: 'Express Deliveries' },
      { key: 'revenueGrowthPercent', label: 'Revenue Growth %' },
      { key: 'dailySettlementAmount', label: 'Daily Settlement Amount' },
    ];

    for (const f of fields) {
      const val = (formData[f.key] || '').trim();
      if (!val) {
        errors[f.key] = `${f.label} cannot be empty.`;
      } else if (val.length > 50) {
        errors[f.key] = `${f.label} must be under 50 characters.`;
      } else if (htmlTagRegex.test(val)) {
        errors[f.key] = `${f.label} contains invalid characters or HTML tags.`;
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error('Please fix the validation errors before saving.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        activeVendors: formData.activeVendors.trim(),
        productsSold: formData.productsSold.trim(),
        citiesCovered: formData.citiesCovered.trim(),
        onTimeDeliveryRate: formData.onTimeDeliveryRate.trim(),
        todaysRevenue: formData.todaysRevenue.trim(),
        ordersToday: formData.ordersToday.trim(),
        expressDeliveries: formData.expressDeliveries.trim(),
        revenueGrowthPercent: formData.revenueGrowthPercent.trim(),
        dailySettlementAmount: formData.dailySettlementAmount.trim(),
      };

      const response = await api.put('/admin/sell-on-dwellmart/stats', payload);
      const data = response?.data || response || {};
      const saved = {
        activeVendors: data.activeVendors || payload.activeVendors,
        productsSold: data.productsSold || payload.productsSold,
        citiesCovered: data.citiesCovered || payload.citiesCovered,
        onTimeDeliveryRate: data.onTimeDeliveryRate || payload.onTimeDeliveryRate,
        todaysRevenue: data.todaysRevenue || payload.todaysRevenue,
        ordersToday: data.ordersToday || payload.ordersToday,
        expressDeliveries: data.expressDeliveries || payload.expressDeliveries,
        revenueGrowthPercent: data.revenueGrowthPercent || payload.revenueGrowthPercent,
        dailySettlementAmount: data.dailySettlementAmount || payload.dailySettlementAmount,
      };

      setFormData(saved);
      setInitialData(saved);
      toast.success('Sell On Dwell Mart statistics updated successfully!');
    } catch (error) {
      console.error('Failed to update statistics:', error);
      const msg = error?.response?.data?.message || 'Failed to save statistics.';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = JSON.stringify(formData) !== JSON.stringify(initialData);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-gray-200 dark:border-gray-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            Sell on DwellMart Statistics
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage the live marketing counters and promotional seller dashboard numbers displayed on{' '}
            <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-amber-600 dark:text-amber-400">
              /sell-on-dwellmart
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchStats}
            disabled={isLoading || isSaving}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            <FiRefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Loading Sell on DwellMart statistics...
          </p>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-8">
          {/* Section 1: Landing Page Trust Metrics */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm space-y-6"
          >
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                1
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Landing Page Trust Metrics
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Four high-impact social proof counters displayed in the main trust strip.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Active Vendors */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-2">
                  <FiUsers className="w-4 h-4 text-amber-500" />
                  Active Vendors
                  <span className="text-xs font-normal text-gray-400 dark:text-gray-500 normal-case">(Label: VERIFIED)</span>
                </label>
                <input
                  type="text"
                  value={formData.activeVendors}
                  onChange={(e) => handleChange('activeVendors', e.target.value)}
                  placeholder="e.g. 500+, 750+"
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm font-medium bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white transition-all focus:ring-2 focus:ring-amber-500/20 focus:bg-white dark:focus:bg-gray-900 ${
                    fieldErrors.activeVendors
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-gray-200 dark:border-gray-700 focus:border-amber-500'
                  }`}
                />
                {fieldErrors.activeVendors ? (
                  <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="w-3.5 h-3.5" />
                    {fieldErrors.activeVendors}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-400">Displayed on the first trust card (Active Vendors).</p>
                )}
              </div>

              {/* Products Sold */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-2">
                  <FiPackage className="w-4 h-4 text-amber-500" />
                  Products Sold
                  <span className="text-xs font-normal text-gray-400 dark:text-gray-500 normal-case">(Label: NATIONWIDE)</span>
                </label>
                <input
                  type="text"
                  value={formData.productsSold}
                  onChange={(e) => handleChange('productsSold', e.target.value)}
                  placeholder="e.g. 100K+, 150K+, 1.2M+"
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm font-medium bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white transition-all focus:ring-2 focus:ring-amber-500/20 focus:bg-white dark:focus:bg-gray-900 ${
                    fieldErrors.productsSold
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-gray-200 dark:border-gray-700 focus:border-amber-500'
                  }`}
                />
                {fieldErrors.productsSold ? (
                  <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="w-3.5 h-3.5" />
                    {fieldErrors.productsSold}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-400">Displayed on the second trust card (Products Sold).</p>
                )}
              </div>

              {/* Cities Covered */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-2">
                  <FiMapPin className="w-4 h-4 text-amber-500" />
                  Cities Covered
                  <span className="text-xs font-normal text-gray-400 dark:text-gray-500 normal-case">(Label: EXPRESS HUBS)</span>
                </label>
                <input
                  type="text"
                  value={formData.citiesCovered}
                  onChange={(e) => handleChange('citiesCovered', e.target.value)}
                  placeholder="e.g. 50+, 75+, 100+"
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm font-medium bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white transition-all focus:ring-2 focus:ring-amber-500/20 focus:bg-white dark:focus:bg-gray-900 ${
                    fieldErrors.citiesCovered
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-gray-200 dark:border-gray-700 focus:border-amber-500'
                  }`}
                />
                {fieldErrors.citiesCovered ? (
                  <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="w-3.5 h-3.5" />
                    {fieldErrors.citiesCovered}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-400">Displayed on the third trust card (Cities Covered).</p>
                )}
              </div>

              {/* On-Time Express Delivery Rate */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-2">
                  <FiCheckCircle className="w-4 h-4 text-amber-500" />
                  On-Time Express Delivery Rate
                  <span className="text-xs font-normal text-gray-400 dark:text-gray-500 normal-case">(Label: SLA GUARANTEED)</span>
                </label>
                <input
                  type="text"
                  value={formData.onTimeDeliveryRate}
                  onChange={(e) => handleChange('onTimeDeliveryRate', e.target.value)}
                  placeholder="e.g. 99.9%, 99.95%"
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm font-medium bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white transition-all focus:ring-2 focus:ring-amber-500/20 focus:bg-white dark:focus:bg-gray-900 ${
                    fieldErrors.onTimeDeliveryRate
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-gray-200 dark:border-gray-700 focus:border-amber-500'
                  }`}
                />
                {fieldErrors.onTimeDeliveryRate ? (
                  <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="w-3.5 h-3.5" />
                    {fieldErrors.onTimeDeliveryRate}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-400">Displayed on the fourth trust card (SLA Guaranteed).</p>
                )}
              </div>
            </div>
          </motion.div>

          {/* Section 2: Promotional Seller Dashboard Metrics */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm space-y-6"
          >
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                2
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Promotional Seller Dashboard Metrics
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Business numbers rendered inside the interactive seller portal mockup window in the Hero section.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Today's Revenue */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-2">
                  <FiDollarSign className="w-4 h-4 text-emerald-500" />
                  Today&apos;s Revenue
                </label>
                <input
                  type="text"
                  value={formData.todaysRevenue}
                  onChange={(e) => handleChange('todaysRevenue', e.target.value)}
                  placeholder="e.g. ₹4,85,200, ₹6,25,000"
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm font-medium bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white transition-all focus:ring-2 focus:ring-emerald-500/20 focus:bg-white dark:focus:bg-gray-900 ${
                    fieldErrors.todaysRevenue
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-gray-200 dark:border-gray-700 focus:border-emerald-500'
                  }`}
                />
                {fieldErrors.todaysRevenue ? (
                  <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="w-3.5 h-3.5" />
                    {fieldErrors.todaysRevenue}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-400">Top-left metric card in the mock window.</p>
                )}
              </div>

              {/* Revenue Growth % */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-2">
                  <FiTrendingUp className="w-4 h-4 text-emerald-500" />
                  Revenue Growth % vs Yesterday
                </label>
                <input
                  type="text"
                  value={formData.revenueGrowthPercent}
                  onChange={(e) => handleChange('revenueGrowthPercent', e.target.value)}
                  placeholder="e.g. +28.4%, +31.2%"
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm font-medium bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white transition-all focus:ring-2 focus:ring-emerald-500/20 focus:bg-white dark:focus:bg-gray-900 ${
                    fieldErrors.revenueGrowthPercent
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-gray-200 dark:border-gray-700 focus:border-emerald-500'
                  }`}
                />
                {fieldErrors.revenueGrowthPercent ? (
                  <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="w-3.5 h-3.5" />
                    {fieldErrors.revenueGrowthPercent}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-400">Displayed below today&apos;s revenue (e.g. ↑ +28.4% vs yesterday).</p>
                )}
              </div>

              {/* Orders Today */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-2">
                  <FiShoppingBag className="w-4 h-4 text-emerald-500" />
                  Orders Today
                </label>
                <input
                  type="text"
                  value={formData.ordersToday}
                  onChange={(e) => handleChange('ordersToday', e.target.value)}
                  placeholder="e.g. 389, 475"
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm font-medium bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white transition-all focus:ring-2 focus:ring-emerald-500/20 focus:bg-white dark:focus:bg-gray-900 ${
                    fieldErrors.ordersToday
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-gray-200 dark:border-gray-700 focus:border-emerald-500'
                  }`}
                />
                {fieldErrors.ordersToday ? (
                  <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="w-3.5 h-3.5" />
                    {fieldErrors.ordersToday}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-400">Top-right metric card in the mock window.</p>
                )}
              </div>

              {/* Express Deliveries */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-2">
                  <FiTruck className="w-4 h-4 text-emerald-500" />
                  Express Deliveries
                </label>
                <input
                  type="text"
                  value={formData.expressDeliveries}
                  onChange={(e) => handleChange('expressDeliveries', e.target.value)}
                  placeholder="e.g. 142, 210"
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm font-medium bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white transition-all focus:ring-2 focus:ring-emerald-500/20 focus:bg-white dark:focus:bg-gray-900 ${
                    fieldErrors.expressDeliveries
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-gray-200 dark:border-gray-700 focus:border-emerald-500'
                  }`}
                />
                {fieldErrors.expressDeliveries ? (
                  <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="w-3.5 h-3.5" />
                    {fieldErrors.expressDeliveries}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-400">Displayed below orders today (e.g. 142 Express Deliveries).</p>
                )}
              </div>

              {/* Daily Settlement Amount */}
              <div className="md:col-span-2 lg:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-2">
                  <FiCreditCard className="w-4 h-4 text-emerald-500" />
                  Daily Settlement Amount
                </label>
                <input
                  type="text"
                  value={formData.dailySettlementAmount}
                  onChange={(e) => handleChange('dailySettlementAmount', e.target.value)}
                  placeholder="e.g. ₹1,48,250, ₹2,10,000"
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm font-medium bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white transition-all focus:ring-2 focus:ring-emerald-500/20 focus:bg-white dark:focus:bg-gray-900 ${
                    fieldErrors.dailySettlementAmount
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-gray-200 dark:border-gray-700 focus:border-emerald-500'
                  }`}
                />
                {fieldErrors.dailySettlementAmount ? (
                  <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="w-3.5 h-3.5" />
                    {fieldErrors.dailySettlementAmount}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-400">Displayed in the Automated Daily Settlement strip at the bottom of the mockup window.</p>
                )}
              </div>
            </div>
          </motion.div>

          {/* Action Bar */}
          <div className="flex items-center justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-800">
            <button
              type="button"
              onClick={() => {
                setFormData(initialData);
                setFieldErrors({});
              }}
              disabled={!hasChanges || isSaving}
              className="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-40 transition-colors"
            >
              Reset Changes
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 active:bg-amber-700 rounded-xl shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <FiRefreshCw className="w-4 h-4 animate-spin" />
                  Saving Changes...
                </>
              ) : (
                <>
                  <FiSave className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default SellOnDwellmartStats;
