import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSave, FiTruck, FiInfo, FiExternalLink } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import toast from 'react-hot-toast';

const ShippingSettings = () => {
  const { vendor, updateProfile } = useVendorAuthStore();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    shippingEnabled: true,
    handlingTime: 1, // days
    processingTime: 1, // days
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (vendor) {
      setFormData({
        shippingEnabled: vendor.shippingEnabled !== false,
        handlingTime: vendor.handlingTime || 1,
        processingTime: vendor.processingTime || 1,
      });
    }
  }, [vendor]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!vendor) return;

    setIsSaving(true);
    try {
      await updateProfile({
        shippingEnabled: formData.shippingEnabled,
        handlingTime: parseInt(formData.handlingTime, 10) || 1,
        processingTime: parseInt(formData.processingTime, 10) || 1,
      });
      toast.success('Shipping settings saved successfully');
    } catch {
      // api.js handles error feedback
    } finally {
      setIsSaving(false);
    }
  };

  if (!vendor) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Loading vendor information...</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-full overflow-x-hidden"
    >
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Shipping Settings</h1>
        <p className="text-sm sm:text-base text-gray-600">Configure fulfillment handling times and preferences</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 max-w-full overflow-x-hidden">
        <div className="p-4 sm:p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-gray-800 font-bold text-base sm:text-lg">
            <FiTruck className="text-primary-600 text-xl" />
            <span>Fulfillment & Handling Settings</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/vendor/shipping-management')}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors"
          >
            <span>View Shipping Rates</span>
            <FiExternalLink className="text-xs" />
          </button>
        </div>

        {/* Informational Notice */}
        <div className="p-4 sm:p-6 bg-primary-50/60 border-b border-primary-100/80 flex items-start gap-3">
          <FiInfo className="text-primary-600 text-lg flex-shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-primary-900 leading-relaxed">
            <p className="font-semibold mb-0.5">Admin-Managed Shipping Rates</p>
            <p className="text-primary-800/90">
              Customer shipping rates and delivery rules are centrally configured by the Dwell Mart Admin. You can view all applicable rates in{' '}
              <button
                type="button"
                onClick={() => navigate('/vendor/shipping-management')}
                className="underline font-semibold text-primary-700 hover:text-primary-900"
              >
                Shipping Management
              </button>
              .
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6">
          <div className="flex items-center gap-3 p-4 border border-gray-200 rounded-xl bg-gray-50/50">
            <input
              type="checkbox"
              id="shippingEnabled"
              name="shippingEnabled"
              checked={formData.shippingEnabled}
              onChange={handleChange}
              className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
            />
            <label htmlFor="shippingEnabled" className="cursor-pointer">
              <span className="text-sm font-semibold text-gray-800">Enable Marketplace Delivery</span>
              <p className="text-xs text-gray-500 mt-0.5">Allow customers to order products with national/local delivery</p>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Order Processing Time (Days)
              </label>
              <input
                type="number"
                name="processingTime"
                value={formData.processingTime}
                onChange={handleChange}
                min="0"
                step="1"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">Average time to confirm and pack order items</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Dispatch / Handling Time (Days)
              </label>
              <input
                type="number"
                name="handlingTime"
                value={formData.handlingTime}
                onChange={handleChange}
                min="0"
                step="1"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">Time to hand over parcel to the courier partner</p>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-100">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-all font-semibold text-sm disabled:opacity-60 shadow-xs"
            >
              <FiSave className="text-base" />
              <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
};

export default ShippingSettings;
