import { useState, useEffect } from 'react';
import { FiSave, FiCreditCard, FiTruck } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useSettingsStore } from '../../../../shared/store/settingsStore';
import AnimatedSelect from '../../components/AnimatedSelect';
import toast from 'react-hot-toast';

const PaymentShippingSettings = () => {
  const { settings, updateSettings, fetchCategorySettings } = useSettingsStore();
  const [paymentData, setPaymentData] = useState({});
  const [shippingData, setShippingData] = useState({
    freeShippingThreshold: 1000,
    defaultShippingRate: 65,
    shippingMethods: ['standard'],
  });
  const [activeSection, setActiveSection] = useState('payment');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);
      try {
        const [payData, shipData] = await Promise.all([
          fetchCategorySettings('payment'),
          fetchCategorySettings('shipping'),
        ]);

        if (payData && Object.keys(payData).length > 0) {
          setPaymentData(payData);
        }
        if (shipData && Object.keys(shipData).length > 0) {
          setShippingData({
            freeShippingThreshold: shipData.freeShippingThreshold !== undefined ? shipData.freeShippingThreshold : 1000,
            defaultShippingRate: shipData.defaultShippingRate !== undefined ? shipData.defaultShippingRate : 65,
            shippingMethods: shipData.shippingMethods || ['standard'],
            ...shipData,
          });
        }
      } catch (err) {
        console.error('Failed to load payment/shipping settings', err);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [fetchCategorySettings]);

  const handlePaymentChange = (e) => {
    const { name, value, type, checked } = e.target;
    setPaymentData({
      ...paymentData,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleShippingChange = (e) => {
    const { name, value } = e.target;
    setShippingData({
      ...shippingData,
      [name]: value,
    });
  };

  const handleShippingMethodToggle = (method) => {
    const methods = shippingData.shippingMethods || [];
    if (methods.includes(method)) {
      setShippingData({
        ...shippingData,
        shippingMethods: methods.filter((m) => m !== method),
      });
    } else {
      setShippingData({
        ...shippingData,
        shippingMethods: [...methods, method],
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const formattedShipping = {
        ...shippingData,
        freeShippingThreshold: shippingData.freeShippingThreshold === '' ? 0 : Number(shippingData.freeShippingThreshold),
        defaultShippingRate: shippingData.defaultShippingRate === '' ? 0 : Number(shippingData.defaultShippingRate),
      };

      const sanitizedPayment = {
        codEnabled: !!paymentData.codEnabled,
        cardEnabled: !!paymentData.cardEnabled,
        walletEnabled: !!paymentData.walletEnabled,
        upiEnabled: !!paymentData.upiEnabled,
        cashfreeEnabled: paymentData.cashfreeEnabled !== false,
        razorpayEnabled: !!paymentData.razorpayEnabled,
        defaultGateway: paymentData.defaultGateway || 'auto',
        platformFee: paymentData.platformFee === '' || paymentData.platformFee === undefined ? 0 : Math.max(0, Number(paymentData.platformFee)),
        handlingFee: paymentData.handlingFee === '' || paymentData.handlingFee === undefined ? 0 : Math.max(0, Number(paymentData.handlingFee)),
        codFee: paymentData.codFee === '' || paymentData.codFee === undefined ? 0 : Math.max(0, Number(paymentData.codFee)),
        codAdvancePaymentEnabled: paymentData.codAdvancePaymentEnabled !== undefined ? !!paymentData.codAdvancePaymentEnabled : true,
      };

      await updateSettings('payment', sanitizedPayment);
      await updateSettings('shipping', formattedShipping);
      toast.success('Settings saved successfully');
    } catch (error) {
      toast.error('Failed to save settings');
    }
  };

  const sections = [
    { id: 'payment', label: 'Payment Methods', icon: FiCreditCard },
    { id: 'shipping', label: 'Shipping Settings', icon: FiTruck },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-full overflow-x-hidden"
    >
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Payment & Shipping</h1>
        <p className="text-sm sm:text-base text-gray-600">Configure payment methods and shipping options</p>
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
                      ? 'border-primary-600 text-primary-600 font-semibold'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                    }`}
                >
                  <Icon className="text-base sm:text-lg" />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-3 sm:p-4 md:p-6">
          {/* Payment Section */}
          {activeSection === 'payment' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">Payment Methods</h3>
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        name="codEnabled"
                        checked={paymentData.codEnabled || false}
                        onChange={handlePaymentChange}
                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 flex-shrink-0"
                      />
                      <span className="text-sm font-semibold text-gray-700 truncate">Cash on Delivery (COD)</span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        name="cardEnabled"
                        checked={paymentData.cardEnabled || false}
                        onChange={handlePaymentChange}
                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 flex-shrink-0"
                      />
                      <span className="text-sm font-semibold text-gray-700 truncate">Credit/Debit Card</span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        name="walletEnabled"
                        checked={paymentData.walletEnabled || false}
                        onChange={handlePaymentChange}
                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 flex-shrink-0"
                      />
                      <span className="text-sm font-semibold text-gray-700 truncate">Digital Wallet</span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        name="upiEnabled"
                        checked={paymentData.upiEnabled || false}
                        onChange={handlePaymentChange}
                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 flex-shrink-0"
                      />
                      <span className="text-sm font-semibold text-gray-700 truncate">UPI / QR Code</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Fees & COD Advance Deposit Configuration */}
              <div className="border-t border-gray-200 pt-6 space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-800">Order Fees & COD Settings</h3>
                  <p className="text-sm text-gray-600">
                    Configure platform fee, handling charges, and Cash on Delivery upfront payment rules.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Handling Fee (₹)
                    </label>
                    <input
                      type="number"
                      name="handlingFee"
                      min="0"
                      step="1"
                      value={paymentData.handlingFee !== undefined ? paymentData.handlingFee : 0}
                      onChange={handlePaymentChange}
                      placeholder="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Applied to all orders (prepaid & COD)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      Platform Fee (₹)
                    </label>
                    <input
                      type="number"
                      name="platformFee"
                      min="0"
                      step="1"
                      value={paymentData.platformFee !== undefined ? paymentData.platformFee : 0}
                      onChange={handlePaymentChange}
                      placeholder="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Applied to all orders (prepaid & COD)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      COD Fee / Charges (₹)
                    </label>
                    <input
                      type="number"
                      name="codFee"
                      min="0"
                      step="1"
                      value={paymentData.codFee !== undefined ? paymentData.codFee : 0}
                      onChange={handlePaymentChange}
                      placeholder="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Applied only to COD orders</p>
                  </div>
                </div>

                <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-lg space-y-2">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="codAdvancePaymentEnabled"
                      name="codAdvancePaymentEnabled"
                      checked={paymentData.codAdvancePaymentEnabled !== false}
                      onChange={handlePaymentChange}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 flex-shrink-0"
                    />
                    <label htmlFor="codAdvancePaymentEnabled" className="text-sm font-semibold text-gray-800 cursor-pointer">
                      Require Online Advance Fee Payment for COD Orders
                    </label>
                  </div>
                  <p className="text-xs text-gray-600 pl-7">
                    When enabled, customers must pay the combined fee (<strong>COD Fee + Handling Fee + Platform Fee</strong>) online via UPI/Card before placing a COD order. The remaining order balance will be collected in cash at delivery. If disabled, 100% of the amount is collected at delivery.
                  </p>
                </div>
              </div>

              {/* Gateway Preference */}
              <div className="border-t border-gray-200 pt-6 space-y-4">
                <h3 className="text-lg font-bold text-gray-800">Gateway Preference</h3>
                <p className="text-sm text-gray-600">
                  When both gateways are enabled, select which gateway will automatically process online payments (customers will not be asked to choose).
                </p>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Default Online Gateway
                  </label>
                  <AnimatedSelect
                    name="defaultGateway"
                    value={paymentData.defaultGateway || "cashfree"}
                    onChange={handlePaymentChange}
                    options={[
                      { value: 'cashfree', label: 'Cashfree' },
                      { value: 'razorpay', label: 'Razorpay' },
                      { value: 'auto', label: 'Auto (Cashfree with Razorpay fallback)' },
                    ]}
                  />
                </div>
              </div>

              {/* Razorpay Payment Gateway */}
              <div className="border-t border-gray-200 pt-6 space-y-4">
                <h3 className="text-lg font-bold text-gray-800">Razorpay Payment Gateway</h3>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      name="razorpayEnabled"
                      checked={paymentData.razorpayEnabled || false}
                      onChange={handlePaymentChange}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 flex-shrink-0"
                    />
                    <span className="text-sm font-semibold text-gray-700">Enable Razorpay PG</span>
                  </div>
                </div>
              </div>

              {/* Cashfree Payment Gateway */}
              <div className="border-t border-gray-200 pt-6 space-y-4">
                <h3 className="text-lg font-bold text-gray-800">Cashfree Payment Gateway</h3>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 p-3 sm:p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      name="cashfreeEnabled"
                      checked={paymentData.cashfreeEnabled !== false}
                      onChange={handlePaymentChange}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 flex-shrink-0"
                    />
                    <span className="text-sm font-semibold text-gray-700">Enable Cashfree Payments PG</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Shipping Section */}
          {activeSection === 'shipping' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Free Shipping Threshold
                  </label>
                  <input
                    type="number"
                    name="freeShippingThreshold"
                    value={shippingData.freeShippingThreshold ?? ''}
                    onChange={handleShippingChange}
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Free shipping for orders above this amount</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Default Shipping Rate
                  </label>
                  <input
                    type="number"
                    name="defaultShippingRate"
                    value={shippingData.defaultShippingRate ?? ''}
                    onChange={handleShippingChange}
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Default shipping cost</p>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Shipping Methods</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={shippingData.shippingMethods?.includes('standard') || false}
                      onChange={() => handleShippingMethodToggle('standard')}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm font-semibold text-gray-700">Standard Shipping</span>
                  </label>
                  <label className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={shippingData.shippingMethods?.includes('express') || false}
                      onChange={() => handleShippingMethodToggle('express')}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm font-semibold text-gray-700">Express Shipping</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4 sm:pt-6 border-t border-gray-200 mt-4 sm:mt-6">
            <button
              type="submit"
              className="flex items-center gap-2 px-4 sm:px-6 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold text-sm sm:text-base w-full sm:w-auto"
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

export default PaymentShippingSettings;

