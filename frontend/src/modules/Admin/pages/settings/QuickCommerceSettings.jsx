import { useState, useEffect } from 'react';
import { FiSave, FiSettings, FiRefreshCw, FiZap, FiTruck, FiClock, FiShield } from 'react-icons/fi';
import { motion } from 'framer-motion';
import api from '../../../../shared/utils/api';
import toast from 'react-hot-toast';
import { Button } from '../../../../shared/components/ui';

export default function QuickCommerceSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    baseDeliveryFee: 30,
    perKmDeliveryFee: 10,
    freeDeliveryAboveSubtotal: 500,
    averageSpeedKmph: 25,
    maxServiceRadiusKm: 10,
    vendorAckTimeoutSecs: 120,
    defaultPreparationMins: 10,
  });

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/settings/quick_commerce');
      const data = res?.data?.value || res?.data || {};
      setFormData((prev) => ({
        baseDeliveryFee: data.baseDeliveryFee ?? prev.baseDeliveryFee,
        perKmDeliveryFee: data.perKmDeliveryFee ?? prev.perKmDeliveryFee,
        freeDeliveryAboveSubtotal: data.freeDeliveryAboveSubtotal ?? prev.freeDeliveryAboveSubtotal,
        averageSpeedKmph: data.averageSpeedKmph ?? prev.averageSpeedKmph,
        maxServiceRadiusKm: data.maxServiceRadiusKm ?? prev.maxServiceRadiusKm,
        vendorAckTimeoutSecs: data.vendorAckTimeoutSecs ?? prev.vendorAckTimeoutSecs,
        defaultPreparationMins: data.defaultPreparationMins ?? prev.defaultPreparationMins,
      }));
    } catch (err) {
      toast.error('Failed to load Quick Commerce settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value === '' ? '' : Number(value),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/admin/settings/quick_commerce', formData);
      toast.success('Quick Commerce settings saved successfully!');
    } catch (err) {
      // api.js shows toast error
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <FiRefreshCw className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FiZap className="text-amber-500" /> Quick Commerce Economics & Configuration
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure delivery fees, service radius limits, store response timeouts and speed models in real time.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchSettings}
          className="flex items-center gap-1.5"
        >
          <FiRefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Delivery Fees & Pricing */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 border-b border-gray-100 pb-3">
            <FiTruck className="text-blue-600" /> Delivery Pricing & Thresholds
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Base Delivery Fee
              </label>
              <input
                type="number"
                name="baseDeliveryFee"
                min="0"
                step="1"
                value={formData.baseDeliveryFee}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                required
              />
              <span className="text-[11px] text-gray-500 mt-1 block">Fixed fee per order</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Per-KM Delivery Fee
              </label>
              <input
                type="number"
                name="perKmDeliveryFee"
                min="0"
                step="0.5"
                value={formData.perKmDeliveryFee}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                required
              />
              <span className="text-[11px] text-gray-500 mt-1 block">Distance charge rate per km</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Free Delivery Above
              </label>
              <input
                type="number"
                name="freeDeliveryAboveSubtotal"
                min="0"
                step="10"
                value={formData.freeDeliveryAboveSubtotal}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                required
              />
              <span className="text-[11px] text-gray-500 mt-1 block">Waive delivery fee for cart total</span>
            </div>
          </div>
        </div>

        {/* Speed & Dispatch Controls */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 border-b border-gray-100 pb-3">
            <FiClock className="text-amber-600" /> Service Radius & ETA Engine
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Maximum Service Radius (km)
              </label>
              <input
                type="number"
                name="maxServiceRadiusKm"
                min="1"
                max="25"
                step="1"
                value={formData.maxServiceRadiusKm}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                required
              />
              <span className="text-[11px] text-gray-500 mt-1 block">Platform service ceiling for stores</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Average Rider Speed (km/h)
              </label>
              <input
                type="number"
                name="averageSpeedKmph"
                min="5"
                max="100"
                step="1"
                value={formData.averageSpeedKmph}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                required
              />
              <span className="text-[11px] text-gray-500 mt-1 block">Used by travel time calculation</span>
            </div>
          </div>
        </div>

        {/* Operational Timeouts */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2 border-b border-gray-100 pb-3">
            <FiShield className="text-purple-600" /> Operational & Escalation Timeouts
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Store Ack Timeout (seconds)
              </label>
              <input
                type="number"
                name="vendorAckTimeoutSecs"
                min="30"
                max="1800"
                step="10"
                value={formData.vendorAckTimeoutSecs}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                required
              />
              <span className="text-[11px] text-gray-500 mt-1 block">Max time before un-responded store escalates</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Default Kitchen Prep (minutes)
              </label>
              <input
                type="number"
                name="defaultPreparationMins"
                min="1"
                max="120"
                step="1"
                value={formData.defaultPreparationMins}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                required
              />
              <span className="text-[11px] text-gray-500 mt-1 block">Baseline order preparation time</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={saving}
            className="px-8 font-semibold flex items-center gap-2"
          >
            <FiSave className="w-4 h-4" /> Save Quick Commerce Settings
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
