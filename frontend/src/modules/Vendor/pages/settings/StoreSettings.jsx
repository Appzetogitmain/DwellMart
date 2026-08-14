import { useState, useEffect } from "react";
import {
  FiSave, FiGlobe, FiShoppingBag, FiUpload, FiTrash2,
  FiLoader, FiZap, FiInfo, FiTruck, FiFileText, FiBriefcase,
} from "react-icons/fi";
import { motion } from "framer-motion";
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import { uploadVendorImage } from "../../services/vendorService";
import QuickCommerceSettingsForm from "../../components/QuickCommerceSettingsForm";
import { getVendorCapabilities, VENDOR_TYPE_LABELS } from "../../../../shared/config/vendorCapabilities";
import { useVendorWorkspace } from '../../hooks/useVendorWorkspace';
import toast from "react-hot-toast";

/**
 * Icon map for settings section tabs — keyed by settingsSections[].id
 */
const SECTION_ICONS = {
  identity:     FiShoppingBag,
  contact:      FiGlobe,
  quickCommerce: FiZap,
  shipping:     FiTruck,
  returns:      FiFileText,
  businessInfo: FiBriefcase,
  gst:          FiFileText,
  businessType: FiInfo,
};

/**
 * StoreSettings — fully capability-driven.
 * Tabs are derived from caps.settingsSections, no hardcoded vendorType checks.
 */
const StoreSettings = () => {
  const { vendor, updateProfile } = useVendorAuthStore();

  const { workspace } = useVendorWorkspace();
  const vendorType = workspace ?? vendor?.activeWorkspaces?.[0] ?? "retail";
  const vendorTypeLabel = VENDOR_TYPE_LABELS[vendorType] ?? "Retail";
  const caps = getVendorCapabilities(vendorType);

  // Tabs come entirely from capability config
  const settingsSections = caps.settingsSections ?? [];

  const [formData, setFormData] = useState({});
  const [activeSection, setActiveSection] = useState(settingsSections[0]?.id ?? "identity");
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  useEffect(() => {
    if (vendor) {
      const formatAddressString = (addr) => {
        if (!addr) return "";
        if (typeof addr === "string") return addr;
        if (addr.formattedAddress) return addr.formattedAddress;
        const parts = [addr.street, addr.city, addr.state, addr.zipCode].filter(Boolean);
        return parts.length > 0 ? parts.join(", ") : "";
      };

      setFormData({
        storeName:        vendor.storeName || "",
        storeLogo:        vendor.storeLogo || "",
        storeDescription: vendor.storeDescription || "",
        phone:            vendor.phone || "",
        address:          formatAddressString(vendor.address),
      });
    }
  }, [vendor]);

  // Reset activeSection when vendor type changes (caps may expose different sections)
  useEffect(() => {
    setActiveSection(settingsSections[0]?.id ?? "identity");
  }, [vendorType]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select a valid image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image size must be less than 5MB"); return; }
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
    } catch {
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
      let addressData = vendor.address || {};
      if (formData.address !== undefined) {
        const raw = String(formData.address || "").trim();
        const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
        addressData = {
          street: parts[0] || raw,
          city: parts[1] || vendor.address?.city || "",
          state: parts[2] ? parts[2].split(" ")[0] : (vendor.address?.state || ""),
          zipCode: parts[2] && parts[2].split(" ")[1] ? parts[2].split(" ")[1] : (parts[3] || vendor.address?.zipCode || ""),
          country: vendor.address?.country || "India",
          formattedAddress: raw,
        };
      }
      await updateProfile({
        storeName:        formData.storeName,
        storeLogo:        formData.storeLogo,
        storeDescription: formData.storeDescription,
        phone:            formData.phone,
        address:          addressData,
      });
      toast.success("Store settings saved successfully");
    } catch {
      // api.js shows toast
    }
  };

  if (!vendor) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Loading vendor information...</p>
      </div>
    );
  }

  /**
   * Render the content for the active settings section.
   * Each case corresponds to settingsSections[].component.
   */
  const renderSectionContent = () => {
    const activeConfig = settingsSections.find((s) => s.id === activeSection);
    const component = activeConfig?.component;

    switch (component) {
      // ── Quick Commerce settings ──────────────────────────────────────────────
      case "QuickCommerceSettings":
        return (
          <div className="p-3 sm:p-4 md:p-6">
            <QuickCommerceSettingsForm vendor={vendor} />
          </div>
        );

      // ── Business Type info (read-only) ────────────────────────────────────────
      case "BusinessTypeInfo":
        return (
          <div className="p-3 sm:p-4 md:p-6">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 space-y-4">
              <div className="flex items-start gap-3">
                <FiInfo className="text-blue-500 text-xl flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-base font-semibold text-blue-900">Business Type</h3>
                  <p className="text-sm text-blue-700 mt-1">
                    Your business type is assigned by the DwellMart admin team and determines your
                    marketplace experience, available features, and order workflows.
                  </p>
                </div>
              </div>

              <div className="bg-white border border-blue-100 rounded-lg p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
                  <FiShoppingBag className="text-primary-600 text-xl" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Current Business Type</p>
                  <span className="inline-block px-3 py-1 bg-primary-600 text-white text-sm font-semibold rounded-full uppercase tracking-wide">
                    {vendorTypeLabel}
                  </span>
                </div>
              </div>

              <div className="border-t border-blue-100 pt-4">
                <h4 className="text-sm font-semibold text-blue-800 mb-2">Enabled Features</h4>
                <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {caps && Object.entries(caps.features || {}).map(([key, enabled]) => (
                    <li
                      key={key}
                      className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded ${
                        enabled ? "text-green-700 bg-green-50" : "text-gray-400 bg-gray-50 line-through"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${enabled ? "bg-green-500" : "bg-gray-300"}`} />
                      {key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-xs text-blue-600 italic">
                To change your business type, please contact the DwellMart admin team.
              </p>
            </div>
          </div>
        );

      // ── Shipping settings placeholder ─────────────────────────────────────────
      case "ShippingSettings":
        return (
          <div className="p-3 sm:p-4 md:p-6">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <FiTruck className="text-amber-500 text-xl flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-base font-semibold text-amber-900">Shipping Settings</h3>
                  <p className="text-sm text-amber-700 mt-1">
                    Configure shipping zones and rates from the Shipping Management section.
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      // ── Return policy placeholder ─────────────────────────────────────────────
      case "ReturnSettings":
        return (
          <div className="p-3 sm:p-4 md:p-6">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
              <h3 className="text-base font-semibold text-gray-800 mb-2">Return Policy</h3>
              <p className="text-sm text-gray-600">
                Your return policy is configured globally. Contact the admin team to update it.
              </p>
            </div>
          </div>
        );

      // ── Business Info (Wholesale) ─────────────────────────────────────────────
      case "BusinessInfoSettings":
        return (
          <div className="p-3 sm:p-4 md:p-6">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 space-y-4">
              <h3 className="text-base font-semibold text-gray-800">Business Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Company Name</label>
                  <input
                    type="text"
                    value={vendor?.storeName || ""}
                    disabled
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Business Type</label>
                  <input
                    type="text"
                    value={vendorTypeLabel}
                    disabled
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 italic">
                Business registration details are verified during onboarding. Contact admin to update.
              </p>
            </div>
          </div>
        );

      // ── GST (Wholesale) ───────────────────────────────────────────────────────
      case "GSTSettings":
        return (
          <div className="p-3 sm:p-4 md:p-6">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
              <h3 className="text-base font-semibold text-gray-800 mb-2">GST Information</h3>
              <p className="text-sm text-gray-600">
                Your GST registration details are verified by the admin team and cannot be changed here.
              </p>
              {vendor?.gstNumber && (
                <div className="mt-4 p-3 bg-white border border-gray-200 rounded-lg">
                  <p className="text-xs text-gray-500">GST Number</p>
                  <p className="font-semibold text-gray-800">{vendor.gstNumber}</p>
                </div>
              )}
            </div>
          </div>
        );

      // ── Identity + Contact (form-based, default) ──────────────────────────────
      case "IdentitySettings":
      case "ContactSettings":
      default:
        return (
          <form onSubmit={handleSubmit} className="p-3 sm:p-4 md:p-6">
            {/* Store Identity */}
            {(component === "IdentitySettings" || activeSection === "identity") && (
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
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Store Logo</label>
                    <div className="flex items-center gap-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="w-16 h-16 rounded-full bg-primary-600 text-white font-bold flex items-center justify-center overflow-hidden border-2 border-amber-200 shadow-sm flex-shrink-0">
                        {formData.storeLogo ? (
                          <img
                            src={formData.storeLogo}
                            alt="Store Logo"
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.style.display = "none"; }}
                          />
                        ) : (
                          <span className="text-xl">
                            {(formData.storeName || vendor?.storeName || "S").charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 flex flex-wrap items-center gap-2">
                        <label
                          htmlFor="store-logo-upload"
                          className={`inline-flex items-center gap-1.5 px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 cursor-pointer text-xs font-semibold transition-all ${
                            isUploadingLogo ? "opacity-50 pointer-events-none" : ""
                          }`}
                        >
                          {isUploadingLogo ? (
                            <><FiLoader className="animate-spin text-sm" /><span>Uploading...</span></>
                          ) : (
                            <><FiUpload className="text-sm" /><span>Upload Logo</span></>
                          )}
                        </label>
                        <input id="store-logo-upload" type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                        {formData.storeLogo && (
                          <button
                            type="button"
                            onClick={() => setFormData((prev) => ({ ...prev, storeLogo: "" }))}
                            className="inline-flex items-center gap-1 px-3 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 text-xs font-semibold transition-all"
                          >
                            <FiTrash2 className="text-sm" /><span>Remove</span>
                          </button>
                        )}
                        <p className="w-full text-[11px] text-gray-500 mt-1">PNG, JPG, or WEBP up to 5MB.</p>
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Store Description</label>
                    <textarea
                      name="storeDescription"
                      value={formData.storeDescription || ""}
                      onChange={handleChange}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="Brief description of your store"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Platform Commission Rate</label>
                    <input
                      type="text"
                      disabled
                      value={vendor?.commissionRate !== undefined ? `${(vendor.commissionRate * 100).toFixed(1)}%` : "N/A"}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 font-medium cursor-not-allowed"
                    />
                    <p className="mt-1 text-xs text-gray-500">Fee percentage deducted by the platform from your earnings.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Contact Info */}
            {(component === "ContactSettings" || activeSection === "contact") && (
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
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Address</label>
                    <textarea
                      name="address"
                      value={formData.address || ""}
                      onChange={handleChange}
                      rows={2}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="Street, City, State ZIP"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4 sm:pt-6 border-t border-gray-200 mt-4 sm:mt-6">
              <button
                type="submit"
                className="flex items-center gap-2 px-4 sm:px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-all font-semibold text-sm sm:text-base w-full sm:w-auto"
              >
                <FiSave />
                Save Settings
              </button>
            </div>
          </form>
        );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-full overflow-x-hidden"
    >
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">Store Settings</h1>
        <p className="text-sm sm:text-base text-gray-600">Configure your store identity and information</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 max-w-full overflow-x-hidden">
        {/* Tabs — generated from caps.settingsSections */}
        <div className="border-b border-gray-200 overflow-x-hidden">
          <div className="flex overflow-x-auto scrollbar-hide -mx-1 px-1">
            {settingsSections.map((section) => {
              const Icon = SECTION_ICONS[section.id] ?? FiInfo;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-6 py-3 sm:py-4 border-b-2 transition-colors whitespace-nowrap text-xs sm:text-sm ${
                    activeSection === section.id
                      ? "border-amber-500 text-amber-600 font-semibold"
                      : "border-transparent text-gray-600 hover:text-gray-800"
                  }`}
                >
                  <Icon className="text-base sm:text-lg" />
                  <span>{section.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content — rendered by capability config component key */}
        {renderSectionContent()}
      </div>
    </motion.div>
  );
};

export default StoreSettings;
