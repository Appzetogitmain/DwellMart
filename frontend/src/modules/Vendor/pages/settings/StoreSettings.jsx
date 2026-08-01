import { useState, useEffect } from "react";
import { FiSave, FiGlobe, FiShoppingBag, FiUpload, FiTrash2, FiLoader, FiToggleRight, FiZap } from "react-icons/fi";
import { motion } from "framer-motion";
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import { uploadVendorImage } from "../../services/vendorService";
import { useSettingsStore } from "../../../../shared/store/settingsStore";
import QuickCommerceSettingsForm from "../../components/QuickCommerceSettingsForm";
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
  const quickCommerceEnabled = settings?.features?.quickCommerceEnabled === true;
  const [formData, setFormData] = useState({});
  const [activeSection, setActiveSection] = useState("identity");
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [retailEnabled, setRetailEnabled] = useState(true);
  const [wholesaleEnabled, setWholesaleEnabled] = useState(false);
  const [quickCommerceChannelEnabled, setQuickCommerceChannelEnabled] = useState(false);
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
      setQuickCommerceChannelEnabled(vendor.sellingChannels?.quickCommerce?.enabled === true);
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
    if (!retailEnabled && !wholesaleEnabled && !quickCommerceChannelEnabled) {
      toast.error("Please enable at least one selling channel (Retail, Wholesale, or Quick Commerce).");
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
          quickCommerce: { enabled: quickCommerceChannelEnabled },
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

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select a valid image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size must be less than 5MB");
      return;
    }

    setIsUploadingLogo(true);
    try {
      const res = await uploadVendorImage(file, "vendors/logos");
      const uploaded = res?.data ?? res;
      const imageUrl = uploaded?.url || uploaded?.secure_url || "";

      if (imageUrl) {
        setFormData((prev) => ({ ...prev, storeLogo: imageUrl }));
        toast.success("Store logo uploaded successfully");
      } else {
        toast.error("Failed to retrieve uploaded image URL");
      }
    } catch (err) {
      console.error("Logo upload error:", err);
      toast.error("Failed to upload store logo");
    } finally {
      setIsUploadingLogo(false);
      e.target.value = "";
    }
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
    // Shown when any optional selling channel is available platform-wide.
    ...(wholesaleMarketplaceEnabled || quickCommerceEnabled
      ? [{ id: "wholesale", label: "Selling Channels", icon: FiToggleRight }]
      : []),
    // Operating profile is only meaningful once the vendor is on the channel.
    ...(quickCommerceEnabled && vendor?.sellingChannels?.quickCommerce?.enabled === true
      ? [{ id: "quickCommerce", label: "Quick Commerce", icon: FiZap }]
      : []),
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

        {activeSection === "quickCommerce" ? (
          <div className="p-3 sm:p-4 md:p-6">
            <QuickCommerceSettingsForm vendor={vendor} />
          </div>
        ) : activeSection === "wholesale" ? (
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

            {wholesaleMarketplaceEnabled && (
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
            )}

            {quickCommerceEnabled && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 border border-gray-200 rounded-lg">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-gray-800">Quick Commerce</h4>
                  <p className="text-xs text-gray-600">Sell to nearby customers with fast, hyperlocal delivery</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={quickCommerceChannelEnabled}
                    onChange={(e) => setQuickCommerceChannelEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>
            )}

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
                    Store Logo
                  </label>
                  <div className="flex items-center gap-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    {/* Logo Preview */}
                    <div className="w-16 h-16 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center overflow-hidden border-2 border-purple-200 shadow-sm flex-shrink-0">
                      {formData.storeLogo ? (
                        <img
                          src={formData.storeLogo}
                          alt="Store Logo"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = "none";
                          }}
                        />
                      ) : (
                        <span className="text-xl">
                          {(formData.storeName || vendor?.storeName || "S").charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>

                    {/* Upload Actions */}
                    <div className="flex-1 flex flex-wrap items-center gap-2">
                      <label
                        htmlFor="store-logo-upload"
                        className={`inline-flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 cursor-pointer text-xs font-semibold transition-all ${
                          isUploadingLogo ? "opacity-50 pointer-events-none" : ""
                        }`}
                      >
                        {isUploadingLogo ? (
                          <>
                            <FiLoader className="animate-spin text-sm" />
                            <span>Uploading...</span>
                          </>
                        ) : (
                          <>
                            <FiUpload className="text-sm" />
                            <span>Upload Logo</span>
                          </>
                        )}
                      </label>
                      <input
                        id="store-logo-upload"
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />

                      {formData.storeLogo && (
                        <button
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, storeLogo: "" }))}
                          className="inline-flex items-center gap-1 px-3 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 text-xs font-semibold transition-all"
                        >
                          <FiTrash2 className="text-sm" />
                          <span>Remove</span>
                        </button>
                      )}
                      <p className="w-full text-[11px] text-gray-500 mt-1">
                        PNG, JPG, or WEBP up to 5MB. Recommended: square image.
                      </p>
                    </div>
                  </div>
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
