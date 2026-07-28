
import { useState, useEffect } from 'react';
import { FiSave, FiCreditCard, FiLock } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import { updateVendorBankDetails } from '../../services/vendorService';
import AnimatedSelect from '../../../Admin/components/AnimatedSelect';
import toast from 'react-hot-toast';

const PaymentSettings = () => {
  const { vendor } = useVendorAuthStore();
  const [formData, setFormData] = useState({
    bankDetails: {
      accountName: '',
      accountNumber: '',
      ifscCode: '',
      bankName: '',
    },
  });
  const [activeSection, setActiveSection] = useState('bank');

  useEffect(() => {
    if (vendor && vendor.bankDetails) {
      setFormData({
        bankDetails: vendor.bankDetails || {
          accountName: '',
          accountNumber: '',
          ifscCode: '',
          bankName: '',
          upiId: '',
        },
      });
    }
  }, [vendor]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith('bank_')) {
      const bankField = name.replace('bank_', '');
      setFormData({
        ...formData,
        bankDetails: {
          ...formData.bankDetails,
          [bankField]: value,
        },
      });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!vendor) return;

    try {
      // Save bank details via dedicated endpoint
      await updateVendorBankDetails({
        accountName: formData.bankDetails.accountName,
        accountNumber: formData.bankDetails.accountNumber,
        ifscCode: formData.bankDetails.ifscCode,
        bankName: formData.bankDetails.bankName,
        upiId: formData.bankDetails.upiId,
      });
      toast.success('Payment settings saved successfully');
    } catch {
      // api.js shows toast
    }
  };

  const sections = [
    { id: 'bank', label: 'Bank Details', icon: FiCreditCard },
  ];

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
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Payment Settings</h1>
        <p className="text-sm sm:text-base text-gray-600">Configure your payment and bank details</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 max-w-full overflow-x-hidden">
        <div className="border-b border-gray-200 overflow-x-hidden">
          <div className="flex overflow-x-auto scrollbar-hide -mx-1 px-1">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b-2 transition-colors whitespace-nowrap text-xs sm:text-sm ${activeSection === section.id
                    ? 'border-purple-600 text-purple-600 font-semibold'
                    : 'border-transparent text-gray-600 hover:text-gray-800'
                    } `}
                >
                  <Icon className="text-base sm:text-lg" />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-3 sm:p-4 md:p-6">
          {/* Bank Details Section */}
          {activeSection === 'bank' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Account Holder Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="bank_accountName"
                    value={formData.bankDetails.accountName || ''}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Account Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="bank_accountNumber"
                    value={formData.bankDetails.accountNumber || ''}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    IFSC Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="bank_ifscCode"
                    value={formData.bankDetails.ifscCode || ''}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="BANK0001234"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Bank Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="bank_bankName"
                    value={formData.bankDetails.bankName || ''}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    UPI ID (Optional)
                  </label>
                  <input
                    type="text"
                    name="bank_upiId"
                    value={formData.bankDetails.upiId || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="example@upi"
                  />
                </div>
              </div>

              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> Your bank details are encrypted and secure. These details are used for commission payouts.
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4 sm:pt-6 border-t border-gray-200 mt-4 sm:mt-6">
            <button
              type="submit"
              className="flex items-center gap-2 px-4 sm:px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all font-semibold text-sm sm:text-base w-full sm:w-auto"
            >
              <FiSave />
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
};

export default PaymentSettings;

