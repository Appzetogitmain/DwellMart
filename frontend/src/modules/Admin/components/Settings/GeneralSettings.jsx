import { useState, useEffect } from 'react';
import { FiSave } from 'react-icons/fi';
import { useSettingsStore } from '../../../../shared/store/settingsStore';
import AnimatedSelect from '../AnimatedSelect';

const GeneralSettings = () => {
  const { settings, updateSettings, initialize } = useSettingsStore();
  const [formData, setFormData] = useState({});

  useEffect(() => {
    initialize();
    if (settings && settings.general) {
      setFormData(settings.general);
    }
  }, []);

  useEffect(() => {
    if (settings && settings.general) {
      setFormData(settings.general);
    }
  }, [settings]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    updateSettings('general', formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Store Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="storeName"
            value={formData.storeName || ''}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Store Logo URL
          </label>
          <input
            type="text"
            name="storeLogo"
            value={formData.storeLogo || ''}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Contact Email
          </label>
          <input
            type="email"
            name="contactEmail"
            value={formData.contactEmail || ''}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Contact Phone
          </label>
          <input
            type="tel"
            name="contactPhone"
            value={formData.contactPhone || ''}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Timezone
          </label>
          <AnimatedSelect
            name="timezone"
            value={formData.timezone || 'Asia/Kolkata'}
            onChange={handleChange}
            options={[
              { value: 'Asia/Kolkata', label: 'India Standard Time (IST - Asia/Kolkata)' },
              { value: 'UTC', label: 'UTC' },
              { value: 'America/New_York', label: 'Eastern Time' },
              { value: 'America/Chicago', label: 'Central Time' },
              { value: 'America/Denver', label: 'Mountain Time' },
              { value: 'America/Los_Angeles', label: 'Pacific Time' },
            ]}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Currency
          </label>
          <AnimatedSelect
            name="currency"
            value={formData.currency || 'INR'}
            onChange={handleChange}
            options={[
              { value: 'INR', label: 'INR (₹)' },
              { value: 'USD', label: 'USD ($)' },
              { value: 'EUR', label: 'EUR (€)' },
              { value: 'GBP', label: 'GBP (£)' },
            ]}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          className="flex items-center gap-2 px-6 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold"
        >
          <FiSave />
          Save Settings
        </button>
      </div>
    </form>
  );
};

export default GeneralSettings;

