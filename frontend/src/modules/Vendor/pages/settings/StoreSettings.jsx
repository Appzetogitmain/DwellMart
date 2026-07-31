import { useState, useEffect } from "react";
import { FiSave, FiGlobe, FiShoppingBag, FiToggleRight } from "react-icons/fi";
import { motion } from "framer-motion";
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import { useSettingsStore } from "../../../../shared/store/settingsStore";

import toast from "react-hot-toast";

const emptyWholesaleProfile = {
  gstNumber: "",
  businessName: "",
  businessAddress: { street: "", city: "", state: "", zipCode: "", country: "" },
  wholesaleContactName: "",
  wholesaleContactPhone: "",
  bulkOrderSupportEmail: "",
};

const StoreSettings = () => {
  const { vendor, updateProfile, updateSellingChannels } = useVendorAuthStore();
  const { settings, initialize: initializeSettings } = useSettingsStore();
  const wholesaleMarketplaceEnabled = settings?.features?.wholesaleMarketplaceEnabled === true;
  const [formData, setFormData] = useState({});
  const [activeSection, setActiveSection] = useState("identity");
  const [retailEnabled, setRetailEnabled] = useState(true);
  const [wholesaleEnabled, setWholesaleEnabled] = useState(false);
  const [wholesaleProfile, setWholesaleProfile] = useState(emptyWholesaleProfile);
  const [isSavingChannels, setIsSavingChannels] = useState(false);

  useEffect(() => {
    initializeSettings();
  }, []);

  useEffect(() => {
    if (vendor) {
      setFormData({
        storeName: vendor.storeName || "",
        storeLogo: vendor.storeLogo || "",
        storeDescription: vendor.storeDescription || "",
        phone: vendor.phone || "",
        address: vendor.address
          ? `${vendor.address.street || ""}, ${vendor.address.city || ""}, ${vendor.address.state || ""
          } ${vendor.address.zipCode || ""}`
          : "",
      });
      setRetailEnabled(vendor.sellingChannels?.retail?.enabled !== false);
      setWholesaleEnabled(vendor.sellingChannels?.wholesale?.enabled === true);
      setWholesaleProfile({
        ...emptyWholesaleProfile,
        ...(vendor.wholesaleProfile || {}),
        businessAddress: {
          ...emptyWholesaleProfile.businessAddress,
          ...(vendor.wholesaleProfile?.businessAddress || {}),
        },
      });
    }
  }, [vendor]);

  const handleWholesaleProfileChange = (field, value) => {
    setWholesaleProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleWholesaleAddressChange = (field, value) => {
    setWholesaleProfile((prev) => ({
      ...prev,
      businessAddress: { ...prev.businessAddress, [field]: value },
    }));
  };

  const handleSaveSellingChannels = async () => {
    if (!retailEnabled && !wholesaleEnabled) {
      toast.error("Please enable at least one selling channel (Retail or Wholesale).");
      return;
    }
    if (wholesaleEnabled) {
      const { gstNumber, businessName, wholesaleContactName, wholesaleContactPhone, bulkOrderSupportEmail } = wholesaleProfile;
      if (!gstNumber || !businessName || !wholesaleContactName || !wholesaleContactPhone || !bulkOrderSupportEmail) {
        toast.error("Please fill in GST number, business name, wholesale contact, and support email.");
        return;
      }
    }

    setIsSavingChannels(true);
    try {
      await updateSellingChannels({
        sellingChannels: {
          retail: { enabled: retailEnabled },
          wholesale: { enabled: wholesaleEnabled },
        },
        wholesaleProfile,
      });
      toast.success("Selling channels updated successfully");
    } catch {
      // api.js shows toast
    } finally {
      setIsSavingChannels(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!vendor) return;

    try {
      // Parse address string into the object shape the backend expects
      let addressData = vendor.address || {};
      if (formData.address) {
        const addressParts = formData.address.split(",");
        if (addressParts.length >= 3) {
          addressData = {
            street: addressParts[0].trim(),
            city: addressParts[1].trim(),
            state: addressParts[2].trim().split(" ")[0],
            zipCode: addressParts[2].trim().split(" ")[1] || "",
            country: vendor.address?.country || "India",
          };
        }
      }

      // Only send fields accepted by PUT /vendor/auth/profile
      await updateProfile({
        storeName: formData.storeName,
        storeLogo: formData.storeLogo,
        storeDescription: formData.storeDescription,
        phone: formData.phone,
        address: addressData,
      });
      toast.success("Store settings saved successfully");
    } catch {
      // api.js shows toast
    }
  };

  const sections = [
    { id: "identity", label: "Store Identity", icon: FiShoppingBag },
    { id: "contact", label: "Contact Info", icon: FiGlobe },
    ...(wholesaleMarketplaceEnabled ? [{ id: "wholesale", label: "Selling Channels", icon: FiToggleRight }] : []),
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
      className="space-y-6 max-w-full overflow-x-hidden">
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
          Store Settings
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          Configure your store identity and information
        </p>
      </div>

      {/* Section Tabs */}
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
                      ? "border-purple-600 text-purple-600 font-semibold"
                      : "border-transparent text-gray-600 hover:text-gray-800"
                    }`}>
                  <Icon className="text-base sm:text-lg" />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {activeSection === "wholesale" ? (
          <div className="p-3 sm:p-4 md:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 border border-gray-200 rounded-lg">
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-gray-800">Retail Marketplace</h4>
                <p className="text-xs text-gray-600">Sell individual items at retail price</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  checked={retailEnabled}
                  onChange={(e) => setRetailEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 border border-gray-200 rounded-lg">
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-gray-800">Wholesale Marketplace</h4>
                <p className="text-xs text-gray-600">Sell in bulk with quantity-based pricing tiers</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  checked={wholesaleEnabled}
                  onChange={(e) => setWholesaleEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            <p className="text-xs text-gray-500">At least one selling channel must stay enabled.</p>

            {wholesaleEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 border-t border-gray-200 pt-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    GST Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={wholesaleProfile.gstNumber}
                    onChange={(e) => handleWholesaleProfileChange("gstNumber", e.target.value)}
                    required={wholesaleEnabled}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Business Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={wholesaleProfile.businessName}
                    onChange={(e) => handleWholesaleProfileChange("businessName", e.target.value)}
                    required={wholesaleEnabled}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Wholesale Contact Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={wholesaleProfile.wholesaleContactName}
                    onChange={(e) => handleWholesaleProfileChange("wholesaleContactName", e.target.value)}
                    required={wholesaleEnabled}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Wholesale Contact Phone <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={wholesaleProfile.wholesaleContactPhone}
                    onChange={(e) => handleWholesaleProfileChange("wholesaleContactPhone", e.target.value)}
                    required={wholesaleEnabled}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Bulk Order Support Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={wholesaleProfile.bulkOrderSupportEmail}
                    onChange={(e) => handleWholesaleProfileChange("bulkOrderSupportEmail", e.target.value)}
                    required={wholesaleEnabled}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Business Address</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Street"
                      value={wholesaleProfile.businessAddress.street}
                      onChange={(e) => handleWholesaleAddressChange("street", e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <input
                      type="text"
                      placeholder="City"
                      value={wholesaleProfile.businessAddress.city}
                      onChange={(e) => handleWholesaleAddressChange("city", e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <input
                      type="text"
                      placeholder="State"
                      value={wholesaleProfile.businessAddress.state}
                      onChange={(e) => handleWholesaleAddressChange("state", e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <input
                      type="text"
                      placeholder="Zip Code"
                      value={wholesaleProfile.businessAddress.zipCode}
                      onChange={(e) => handleWholesaleAddressChange("zipCode", e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <input
                      type="text"
                      placeholder="Country"
                      value={wholesaleProfile.businessAddress.country}
                      onChange={(e) => handleWholesaleAddressChange("country", e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 sm:col-span-2"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4 sm:pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={handleSaveSellingChannels}
                disabled={isSavingChannels}
                className="flex items-center gap-2 px-4 sm:px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all font-semibold text-sm sm:text-base w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed">
                <FiSave />
                {isSavingChannels ? "Saving..." : "Save Selling Channels"}
              </button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="p-3 sm:p-4 md:p-6">
          {/* Store Identity Section */}
          {activeSection === "identity" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Store Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="storeName"
                    value={formData.storeName || ""}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Store Logo URL
                  </label>
                  <input
                    type="text"
                    name="storeLogo"
                    value={formData.storeLogo || ""}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="data/logos/logo.png"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Store Description
                  </label>
                  <textarea
                    name="storeDescription"
                    value={formData.storeDescription || ""}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Brief description of your store"
                  />
                </div>
                
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Platform Commission Rate
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      disabled
                      value={vendor?.commissionRate !== undefined ? `${(vendor.commissionRate * 100).toFixed(1)}%` : "N/A"}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 font-medium cursor-not-allowed"
                    />
                    <div className="mt-1 text-xs text-gray-500">
                      This is the fee percentage deducted by the platform from your earnings.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Contact Info Section */}
          {activeSection === "contact" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Contact Phone <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone || ""}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Address
                  </label>
                  <textarea
                    name="address"
                    value={formData.address || ""}
                    onChange={handleChange}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Street, City, State ZIP"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4 sm:pt-6 border-t border-gray-200 mt-4 sm:mt-6">
            <button
              type="submit"
              className="flex items-center gap-2 px-4 sm:px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all font-semibold text-sm sm:text-base w-full sm:w-auto">
              <FiSave />
              Save Settings
            </button>
          </div>
        </form>
        )}
      </div>
    </motion.div>
  );
};

export default StoreSettings;
