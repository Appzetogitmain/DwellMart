import { useState, useEffect } from "react";
import { FiSave } from "react-icons/fi";
import { useSettingsStore } from "../../../../shared/store/settingsStore";
import AnimatedSelect from "../AnimatedSelect";

const PaymentSettings = () => {
  const { settings, updateSettings, initialize } = useSettingsStore();
  const [formData, setFormData] = useState({});

  useEffect(() => {
    initialize();
    if (settings && settings.payment) {
      setFormData(settings.payment);
    }
  }, []);

  useEffect(() => {
    if (settings && settings.payment) {
      setFormData(settings.payment);
    }
  }, [settings]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    updateSettings("payment", formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-gray-800">Payment Methods</h3>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="codEnabled"
            checked={formData.codEnabled || false}
            onChange={handleChange}
            className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
          />
          <span className="text-sm font-semibold text-gray-700">
            Cash on Delivery (COD)
          </span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="cardEnabled"
            checked={formData.cardEnabled || false}
            onChange={handleChange}
            className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
          />
          <span className="text-sm font-semibold text-gray-700">
            Credit/Debit Card
          </span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="walletEnabled"
            checked={formData.walletEnabled || false}
            onChange={handleChange}
            className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
          />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="upiEnabled"
            checked={formData.upiEnabled !== false}
            onChange={handleChange}
            className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
          />
          <span className="text-sm font-semibold text-gray-700">
            UPI / GPay / PhonePe / Paytm
          </span>
        </label>
      </div>

      <div className="space-y-4 border-t pt-6">
        <h3 className="text-lg font-bold text-gray-800">Cashfree Payment Gateway</h3>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="cashfreeEnabled"
            checked={formData.cashfreeEnabled !== false}
            onChange={handleChange}
            className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
          />
          <span className="text-sm font-semibold text-gray-700">
            Enable Cashfree Payments PG
          </span>
        </label>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Environment
          </label>
          <AnimatedSelect
            name="cashfreeEnv"
            value={formData.cashfreeEnv || "sandbox"}
            onChange={handleChange}
            options={[
              { value: 'sandbox', label: 'Sandbox (Testing)' },
              { value: 'production', label: 'Production (Live)' },
            ]}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Cashfree App ID (Client ID)
          </label>
          <input
            type="text"
            name="cashfreeAppId"
            value={formData.cashfreeAppId || ""}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Enter Cashfree App ID"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Cashfree Secret Key
          </label>
          <input
            type="password"
            name="cashfreeSecretKey"
            value={formData.cashfreeSecretKey || ""}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Enter Cashfree Secret Key"
          />
        </div>
      </div>



      <div className="flex justify-end">
        <button
          type="submit"
          className="flex items-center gap-2 px-6 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold">
          <FiSave />
          Save Settings
        </button>
      </div>
    </form>
  );
};

export default PaymentSettings;
