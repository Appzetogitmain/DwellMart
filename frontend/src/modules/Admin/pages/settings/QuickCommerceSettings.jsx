import { useState, useEffect } from 'react';
import {
  FiSave,
  FiRefreshCw,
  FiZap,
  FiTruck,
  FiClock,
  FiShield,
  FiPercent,
  FiPackage,
  FiCompass,
  FiCheckCircle,
  FiNavigation,
} from 'react-icons/fi';
import { motion } from 'framer-motion';
import api from '../../../../shared/utils/api';
import toast from 'react-hot-toast';

export default function QuickCommerceSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    baseDeliveryFee: 25,
    perKmDeliveryFee: 8,
    freeDeliveryAboveSubtotal: 500,
    freeDeliveryEnabled: true,
    packagingFee: 0,
    averageSpeedKmph: 20,
    maxServiceRadiusKm: 25,
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
        freeDeliveryEnabled: data.freeDeliveryEnabled ?? prev.freeDeliveryEnabled,
        packagingFee: data.packagingFee ?? prev.packagingFee,
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
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value === '' ? '' : Number(value),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/admin/settings/quick_commerce', formData);
      toast.success('✓ Quick Commerce settings saved successfully!');
    } catch (err) {
      // api.js shows toast error
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[450px]">
        <div className="flex flex-col items-center gap-3">
          <FiRefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
          <p className="text-sm font-medium text-gray-500">Loading Quick Commerce Configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto space-y-6 pb-12"
    >
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-6 rounded-2xl border border-amber-200/60 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
              <FiZap className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Quick Commerce Economics & Configuration
            </h1>
          </div>
          <p className="text-sm text-gray-600 pl-11">
            Configure delivery fees, service radius limits, store response timeouts, and dispatch speed models in real time.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchSettings}
          className="self-start sm:self-auto px-4 py-2 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 font-semibold text-sm flex items-center gap-2 shadow-xs transition-all hover:shadow-sm"
        >
          <FiRefreshCw className={`w-4 h-4 text-amber-600 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Delivery Pricing & Thresholds */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <FiTruck className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Delivery Pricing & Thresholds</h2>
                <p className="text-xs text-gray-500">Set base customer fees, per-km distance charges, and packaging</p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
              Pricing Rules
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Base Delivery Fee */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1">
                Base Delivery Fee (₹)
              </label>
              <div className="relative rounded-xl">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400 font-bold text-sm">
                  ₹
                </div>
                <input
                  type="number"
                  name="baseDeliveryFee"
                  min="0"
                  step="1"
                  value={formData.baseDeliveryFee}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50/50 pl-8 pr-3.5 py-2.5 text-sm font-semibold text-gray-900 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-all"
                  required
                />
              </div>
              <p className="text-[11px] text-gray-500">Fixed starting fee applied to every order</p>
            </div>

            {/* Per-KM Delivery Fee */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                Per-KM Delivery Fee (₹)
              </label>
              <div className="relative rounded-xl">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400 font-bold text-sm">
                  ₹
                </div>
                <input
                  type="number"
                  name="perKmDeliveryFee"
                  min="0"
                  step="0.5"
                  value={formData.perKmDeliveryFee}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50/50 pl-8 pr-3.5 py-2.5 text-sm font-semibold text-gray-900 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-all"
                  required
                />
              </div>
              <p className="text-[11px] text-gray-500">Distance rate charged per kilometer</p>
            </div>

            {/* Packaging Fee */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                Packaging Fee (₹)
              </label>
              <div className="relative rounded-xl">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400 font-bold text-sm">
                  ₹
                </div>
                <input
                  type="number"
                  name="packagingFee"
                  min="0"
                  step="1"
                  value={formData.packagingFee}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50/50 pl-8 pr-3.5 py-2.5 text-sm font-semibold text-gray-900 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-all"
                  required
                />
              </div>
              <p className="text-[11px] text-gray-500">Default store handling & packaging charge</p>
            </div>

            {/* Free Delivery Threshold */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                Free Delivery Above (₹)
              </label>
              <div className="relative rounded-xl">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400 font-bold text-sm">
                  ₹
                </div>
                <input
                  type="number"
                  name="freeDeliveryAboveSubtotal"
                  min="0"
                  step="10"
                  value={formData.freeDeliveryAboveSubtotal}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50/50 pl-8 pr-3.5 py-2.5 text-sm font-semibold text-gray-900 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-all"
                  required
                />
              </div>
              <p className="text-[11px] text-gray-500">Cart subtotal required for zero delivery fee</p>
            </div>

            {/* Toggle Switch Container */}
            <div className="sm:col-span-2 flex items-center justify-between p-4 rounded-xl border border-gray-200/80 bg-gray-50/60 hover:bg-gray-50 transition-colors">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-gray-900 uppercase tracking-wider block">
                  Enable Free Delivery Threshold
                </span>
                <span className="text-xs text-gray-500 block">
                  Automatically waive delivery fee when order subtotal exceeds threshold
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={formData.freeDeliveryEnabled}
                onClick={() =>
                  setFormData((prev) => ({
                    ...prev,
                    freeDeliveryEnabled: !prev.freeDeliveryEnabled,
                  }))
                }
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                  formData.freeDeliveryEnabled ? 'bg-emerald-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    formData.freeDeliveryEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Section 2: Service Radius & ETA Engine */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <FiClock className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Service Radius & ETA Engine</h2>
                <p className="text-xs text-gray-500">Configure geographical range ceiling and rider speed matrix</p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
              Dispatch & SLA
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                Maximum Service Radius (km)
              </label>
              <div className="relative rounded-xl">
                <input
                  type="number"
                  name="maxServiceRadiusKm"
                  min="1"
                  max="50"
                  step="1"
                  value={formData.maxServiceRadiusKm}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50/50 px-3.5 py-2.5 text-sm font-semibold text-gray-900 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-all"
                  required
                />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-xs text-gray-400 font-bold">
                  km
                </div>
              </div>
              <p className="text-[11px] text-gray-500">Maximum coverage radius allowed for Quick Commerce stores</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                Average Rider Speed (km/h)
              </label>
              <div className="relative rounded-xl">
                <input
                  type="number"
                  name="averageSpeedKmph"
                  min="5"
                  max="100"
                  step="1"
                  value={formData.averageSpeedKmph}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50/50 px-3.5 py-2.5 text-sm font-semibold text-gray-900 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-all"
                  required
                />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-xs text-gray-400 font-bold">
                  km/h
                </div>
              </div>
              <p className="text-[11px] text-gray-500">Speed multiplier used for promised customer ETA calculations</p>
            </div>
          </div>
        </div>

        {/* Section 3: Operational & Escalation Timeouts */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                <FiShield className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Operational & Escalation Timeouts</h2>
                <p className="text-xs text-gray-500">Store acceptance thresholds and default kitchen preparation time</p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-100">
              Escalation Queues
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                Store Ack Timeout (seconds)
              </label>
              <div className="relative rounded-xl">
                <input
                  type="number"
                  name="vendorAckTimeoutSecs"
                  min="30"
                  max="1800"
                  step="10"
                  value={formData.vendorAckTimeoutSecs}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50/50 px-3.5 py-2.5 text-sm font-semibold text-gray-900 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-all"
                  required
                />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-xs text-gray-400 font-bold">
                  sec
                </div>
              </div>
              <p className="text-[11px] text-gray-500">Time allowed for vendor to accept before order escalates to admin console</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                Default Kitchen Prep (minutes)
              </label>
              <div className="relative rounded-xl">
                <input
                  type="number"
                  name="defaultPreparationMins"
                  min="1"
                  max="120"
                  step="1"
                  value={formData.defaultPreparationMins}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50/50 px-3.5 py-2.5 text-sm font-semibold text-gray-900 focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:outline-none transition-all"
                  required
                />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-xs text-gray-400 font-bold">
                  min
                </div>
              </div>
              <p className="text-[11px] text-gray-500">Default baseline prep time assumed for stores without custom prep profile</p>
            </div>
          </div>
        </div>

        {/* Action Button Bar */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="gradient-green text-white font-bold py-3.5 px-8 rounded-xl shadow-md hover:shadow-glow-green hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2.5 text-sm disabled:opacity-60 cursor-pointer"
          >
            <FiSave className="w-4 h-4" />
            <span>{saving ? 'Saving Changes...' : 'Save Quick Commerce Settings'}</span>
          </button>
        </div>
      </form>
    </motion.div>
  );
}

