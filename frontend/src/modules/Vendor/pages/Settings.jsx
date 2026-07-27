import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiSettings, FiCreditCard, FiTruck, FiUser } from 'react-icons/fi';
import { motion } from 'framer-motion';
import StoreSettings from './settings/StoreSettings';
import PaymentSettings from './settings/PaymentSettings';
import ShippingSettings from './settings/ShippingSettings';

const VendorSettings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get active tab from URL or default to 'store'
  const getActiveTabFromUrl = () => {
    const path = location.pathname;
    if (path.includes('/payment') || path.includes('/payment-settings')) return 'payment';
    if (path.includes('/shipping') || path.includes('/shipping-settings')) return 'shipping';
    if (path.includes('/store')) return 'store';
    return 'store';
  };

  const [activeTab, setActiveTab] = useState(getActiveTabFromUrl());

  useEffect(() => {
    setActiveTab(getActiveTabFromUrl());
  }, [location.pathname]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (tabId === 'store') {
      navigate('/vendor/settings/store');
    } else if (tabId === 'payment') {
      navigate('/vendor/settings/payment');
    } else if (tabId === 'shipping') {
      navigate('/vendor/settings/shipping');
    }
  };

  const tabs = [
    { id: 'store', label: 'Store Settings', icon: FiSettings, component: StoreSettings, route: '/vendor/settings' },
    { id: 'payment', label: 'Payment Settings', icon: FiCreditCard, component: PaymentSettings, route: '/vendor/settings/payment-settings' },
    { id: 'shipping', label: 'Shipping Settings', icon: FiTruck, component: ShippingSettings, route: '/vendor/settings/shipping-settings' },
  ];

  const ActiveComponent = tabs.find((tab) => tab.id === activeTab)?.component || StoreSettings;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-full overflow-x-hidden"
    >
      {/* Header */}
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Settings</h1>
        <p className="text-sm sm:text-base text-gray-600">Configure your vendor store settings</p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 max-w-full overflow-x-hidden">
        <div className="border-b border-gray-200 overflow-x-hidden">
          <div className="flex overflow-x-auto scrollbar-hide -mx-1 px-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b-2 transition-colors whitespace-nowrap text-xs sm:text-sm ${
                    activeTab === tab.id
                      ? 'border-purple-600 text-purple-600 font-semibold'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <Icon className="text-base sm:text-lg" />
                  <span className="hidden xs:inline">{tab.label}</span>
                  <span className="xs:hidden">{tab.label.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-3 sm:p-4 md:p-6">
          <ActiveComponent />
        </div>
      </div>
    </motion.div>
  );
};

export default VendorSettings;

