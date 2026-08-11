import { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { FiPlus, FiEdit, FiTrash2, FiSave } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import ConfirmModal from "../../components/ConfirmModal";
import AnimatedSelect from "../../components/AnimatedSelect";
import { formatPrice } from "../../../../shared/utils/helpers";
import {
  getTaxPricingRules,
  updateTaxPricingRules,
} from "../../services/adminService";
import { useCategoryStore } from "../../../../shared/store/categoryStore";
import toast from "react-hot-toast";

const TaxPricing = () => {
  const location = useLocation();
  const isAppRoute = location.pathname.startsWith("/app");
  const { categories, initialize: initCategories } = useCategoryStore();

  useEffect(() => {
    initCategories();
  }, [initCategories]);

  const applicableOptions = useMemo(() => {
    const baseOptions = [{ value: "all", label: "All Products" }];
    const catOptions = (categories || []).map((cat) => ({
      value: cat.slug || cat.name?.toLowerCase() || String(cat.id || cat._id),
      label: cat.name,
    }));

    const combined = [...baseOptions, ...catOptions];
    const existingValues = new Set(combined.map((o) => o.value));

    // Retain legacy default options as fallback if not already present
    const legacyDefaults = [
      { value: "electronics", label: "Electronics" },
      { value: "clothing", label: "Clothing" },
      { value: "services", label: "Services" },
    ];

    legacyDefaults.forEach((item) => {
      if (!existingValues.has(item.value)) {
        combined.push(item);
      }
    });

    return combined;
  }, [categories]);

  const getApplicableLabel = (val) => {
    const found = applicableOptions.find((opt) => opt.value === val);
    if (found) return found.label;
    if (!val || val === "all") return "All Products";
    return val;
  };
  const [taxRules, setTaxRules] = useState([
    {
      id: 1,
      name: "Standard Tax",
      rate: 18,
      type: "percentage",
      applicableTo: "all",
      status: "active",
    },
    {
      id: 2,
      name: "GST",
      rate: 5,
      type: "percentage",
      applicableTo: "electronics",
      status: "active",
    },
    {
      id: 3,
      name: "Service Tax",
      rate: 10,
      type: "percentage",
      applicableTo: "services",
      status: "inactive",
    },
  ]);
  const [pricingRules, setPricingRules] = useState([
    {
      id: 1,
      name: "Bulk Discount",
      type: "discount",
      value: 10,
      minQuantity: 10,
      status: "active",
    },
    {
      id: 2,
      name: "VIP Pricing",
      type: "markup",
      value: 5,
      applicableTo: "vip",
      status: "active",
    },
  ]);
  const [editingTax, setEditingTax] = useState(null);
  const [editingPricing, setEditingPricing] = useState(null);
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    id: null,
    type: null,
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadRules = async () => {
      try {
        const response = await getTaxPricingRules();
        const payload = response?.data || {};
        if (Array.isArray(payload.taxRules) && payload.taxRules.length > 0) {
          setTaxRules(payload.taxRules);
        }
        if (Array.isArray(payload.pricingRules) && payload.pricingRules.length > 0) {
          setPricingRules(payload.pricingRules);
        }
      } catch (error) {
        // interceptor handles toasts
      }
    };

    loadRules();
  }, []);

  const persistRules = async (nextTaxRules, nextPricingRules, successMessage) => {
    setIsSaving(true);
    try {
      await updateTaxPricingRules({
        taxRules: nextTaxRules,
        pricingRules: nextPricingRules,
      });
      setTaxRules(nextTaxRules);
      setPricingRules(nextPricingRules);
      if (successMessage) toast.success(successMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTax = async (taxData) => {
    const currentTaxRules = [...taxRules];
    const currentPricingRules = [...pricingRules];
    let nextTaxRules = [];

    if (editingTax) {
      nextTaxRules = currentTaxRules.map((t) =>
          t.id === editingTax.id ? { ...taxData, id: editingTax.id } : t
        );
      await persistRules(nextTaxRules, currentPricingRules, "Tax rule updated");
    } else {
      nextTaxRules = [...currentTaxRules, { ...taxData, id: currentTaxRules.length + 1 }];
      await persistRules(nextTaxRules, currentPricingRules, "Tax rule added");
    }
    setEditingTax(null);
  };

  const handleSavePricing = async (pricingData) => {
    const currentTaxRules = [...taxRules];
    const currentPricingRules = [...pricingRules];
    let nextPricingRules = [];

    if (editingPricing) {
      nextPricingRules = currentPricingRules.map((p) =>
          p.id === editingPricing.id
            ? { ...pricingData, id: editingPricing.id }
            : p
        );
      await persistRules(currentTaxRules, nextPricingRules, "Pricing rule updated");
    } else {
      nextPricingRules = [
        ...currentPricingRules,
        { ...pricingData, id: currentPricingRules.length + 1 },
      ];
      await persistRules(currentTaxRules, nextPricingRules, "Pricing rule added");
    }
    setEditingPricing(null);
  };

  const handleDelete = async () => {
    const currentTaxRules = [...taxRules];
    const currentPricingRules = [...pricingRules];

    if (deleteModal.type === "tax") {
      const nextTaxRules = currentTaxRules.filter((t) => t.id !== deleteModal.id);
      await persistRules(nextTaxRules, currentPricingRules, "Tax rule deleted");
    } else {
      const nextPricingRules = currentPricingRules.filter((p) => p.id !== deleteModal.id);
      await persistRules(currentTaxRules, nextPricingRules, "Pricing rule deleted");
    }
    setDeleteModal({ isOpen: false, id: null, type: null });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6">
      <div className="lg:hidden">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
          Tax & Pricing
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          Manage tax rules and pricing strategies
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tax Rules */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800">Tax Rules</h2>
            <button
              onClick={() => setEditingTax({})}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-semibold">
              <FiPlus />
              <span>Add Tax Rule</span>
            </button>
          </div>

          <div className="space-y-3">
            {taxRules.map((tax) => (
              <div
                key={tax.id}
                className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800">{tax.name}</h3>
                    <div className="mt-2 space-y-1 text-sm text-gray-600">
                      <p>Rate: {tax.rate}%</p>
                      <p>Type: {tax.type}</p>
                      <p>Applicable To: {getApplicableLabel(tax.applicableTo)}</p>
                      <p
                        className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          tax.status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}>
                        {tax.status}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingTax(tax)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <FiEdit />
                    </button>
                    <button
                      onClick={() =>
                        setDeleteModal({
                          isOpen: true,
                          id: tax.id,
                          type: "tax",
                        })
                      }
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing Rules */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800">Pricing Rules</h2>
            <button
              onClick={() => setEditingPricing({})}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-semibold">
              <FiPlus />
              <span>Add Pricing Rule</span>
            </button>
          </div>

          <div className="space-y-3">
            {pricingRules.map((pricing) => (
              <div
                key={pricing.id}
                className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800">
                      {pricing.name}
                    </h3>
                    <div className="mt-2 space-y-1 text-sm text-gray-600">
                      <p>Type: {pricing.type}</p>
                      <p>Value: {pricing.value}%</p>
                      {pricing.minQuantity && (
                        <p>Min Quantity: {pricing.minQuantity}</p>
                      )}
                      <p
                        className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          pricing.status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}>
                        {pricing.status}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingPricing(pricing)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <FiEdit />
                    </button>
                    <button
                      onClick={() =>
                        setDeleteModal({
                          isOpen: true,
                          id: pricing.id,
                          type: "pricing",
                        })
                      }
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Edit Tax Modal */}
      <AnimatePresence>
        {editingTax !== null && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => setEditingTax(null)}
              className="fixed inset-0 bg-black/50 z-[10000]"
            />

            {/* Modal Content - Mobile: Slide up from bottom, Desktop: Center with scale */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`fixed inset-0 z-[10000] flex ${
                isAppRoute ? "items-start pt-[10px]" : "items-end"
              } sm:items-center justify-center p-4 pointer-events-none`}>
              <motion.div
                variants={{
                  hidden: {
                    y: isAppRoute ? "-100%" : "100%",
                    scale: 0.95,
                    opacity: 0,
                  },
                  visible: {
                    y: 0,
                    scale: 1,
                    opacity: 1,
                    transition: {
                      type: "spring",
                      damping: 22,
                      stiffness: 350,
                      mass: 0.7,
                    },
                  },
                  exit: {
                    y: isAppRoute ? "-100%" : "100%",
                    scale: 0.95,
                    opacity: 0,
                    transition: {
                      type: "spring",
                      damping: 30,
                      stiffness: 400,
                    },
                  },
                }}
                initial="hidden"
                animate="visible"
                exit="exit"
                onClick={(e) => e.stopPropagation()}
                className={`bg-white ${
                  isAppRoute ? "rounded-b-3xl" : "rounded-t-3xl"
                } sm:rounded-xl shadow-xl p-6 max-w-md w-full pointer-events-auto`}
                style={{ willChange: "transform" }}>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  {editingTax.id ? "Edit Tax Rule" : "Add Tax Rule"}
                </h3>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const formData = new FormData(e.target);
                    try {
                      await handleSaveTax({
                        name: String(formData.get("name") || editingTax.name || "").trim(),
                        rate: parseFloat(formData.get("rate") || editingTax.rate || 0),
                        type: formData.get("type") || editingTax.type || "percentage",
                        applicableTo: formData.get("applicableTo") || editingTax.applicableTo || "all",
                        status: formData.get("status") || editingTax.status || "active",
                      });
                    } catch (error) {
                      // interceptor handles toasts
                    }
                  }}
                  className="space-y-4">
                  <input
                    type="text"
                    name="name"
                    defaultValue={editingTax.name || ""}
                    placeholder="Tax Name"
                    required
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <input
                    type="number"
                    name="rate"
                    defaultValue={editingTax.rate || ""}
                    placeholder="Tax Rate (%)"
                    required
                    step="0.01"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <AnimatedSelect
                    name="type"
                    value={editingTax.type || "percentage"}
                    onChange={(e) => {
                      setEditingTax({ ...editingTax, type: e.target.value });
                      const form = e.target.closest("form");
                      if (form) {
                        const typeInput = form.querySelector('[name="type"]');
                        if (typeInput) typeInput.value = e.target.value;
                      }
                    }}
                    options={[
                      { value: "percentage", label: "Percentage" },
                      { value: "fixed", label: "Fixed Amount" },
                    ]}
                  />
                  <AnimatedSelect
                    name="applicableTo"
                    value={editingTax.applicableTo || "all"}
                    searchable={true}
                    placeholder="Search category or select option..."
                    onChange={(e) => {
                      setEditingTax({
                        ...editingTax,
                        applicableTo: e.target.value,
                      });
                      const form = e.target.closest("form");
                      if (form) {
                        const applicableInput = form.querySelector(
                          '[name="applicableTo"]'
                        );
                        if (applicableInput)
                          applicableInput.value = e.target.value;
                      }
                    }}
                    options={applicableOptions}
                  />
                  <AnimatedSelect
                    name="status"
                    value={editingTax.status || "active"}
                    onChange={(e) => {
                      setEditingTax({ ...editingTax, status: e.target.value });
                      const form = e.target.closest("form");
                      if (form) {
                        const statusInput =
                          form.querySelector('[name="status"]');
                        if (statusInput) statusInput.value = e.target.value;
                      }
                    }}
                    options={[
                      { value: "active", label: "Active" },
                      { value: "inactive", label: "Inactive" },
                    ]}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold">
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTax(null)}
                      className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-semibold">
                      Cancel
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Edit Pricing Modal */}
      <AnimatePresence>
        {editingPricing !== null && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => setEditingPricing(null)}
              className="fixed inset-0 bg-black/50 z-[10000]"
            />

            {/* Modal Content - Mobile: Slide up from bottom, Desktop: Center with scale */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`fixed inset-0 z-[10000] flex ${
                isAppRoute ? "items-start pt-[10px]" : "items-end"
              } sm:items-center justify-center p-4 pointer-events-none`}>
              <motion.div
                variants={{
                  hidden: {
                    y: isAppRoute ? "-100%" : "100%",
                    scale: 0.95,
                    opacity: 0,
                  },
                  visible: {
                    y: 0,
                    scale: 1,
                    opacity: 1,
                    transition: {
                      type: "spring",
                      damping: 22,
                      stiffness: 350,
                      mass: 0.7,
                    },
                  },
                  exit: {
                    y: isAppRoute ? "-100%" : "100%",
                    scale: 0.95,
                    opacity: 0,
                    transition: {
                      type: "spring",
                      damping: 30,
                      stiffness: 400,
                    },
                  },
                }}
                initial="hidden"
                animate="visible"
                exit="exit"
                onClick={(e) => e.stopPropagation()}
                className={`bg-white ${
                  isAppRoute ? "rounded-b-3xl" : "rounded-t-3xl"
                } sm:rounded-xl shadow-xl p-6 max-w-md w-full pointer-events-auto`}
                style={{ willChange: "transform" }}>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  {editingPricing.id ? "Edit Pricing Rule" : "Add Pricing Rule"}
                </h3>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const formData = new FormData(e.target);
                    try {
                      await handleSavePricing({
                        name: String(formData.get("name") || editingPricing.name || "").trim(),
                        type: formData.get("type") || editingPricing.type || "discount",
                        value: parseFloat(formData.get("value") || editingPricing.value || 0),
                        minQuantity: formData.get("minQuantity")
                          ? parseInt(formData.get("minQuantity"))
                          : editingPricing.minQuantity || null,
                        applicableTo: formData.get("applicableTo") || editingPricing.applicableTo || null,
                        status: formData.get("status") || editingPricing.status || "active",
                      });
                    } catch (error) {
                      // interceptor handles toasts
                    }
                  }}
                  className="space-y-4">
                  <input
                    type="text"
                    name="name"
                    defaultValue={editingPricing.name || ""}
                    placeholder="Rule Name"
                    required
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <AnimatedSelect
                    name="type"
                    value={editingPricing.type || "discount"}
                    onChange={(e) => {
                      setEditingPricing({
                        ...editingPricing,
                        type: e.target.value,
                      });
                      const form = e.target.closest("form");
                      if (form) {
                        const typeInput = form.querySelector('[name="type"]');
                        if (typeInput) typeInput.value = e.target.value;
                      }
                    }}
                    options={[
                      { value: "discount", label: "Discount" },
                      { value: "markup", label: "Markup" },
                    ]}
                  />
                  <input
                    type="number"
                    name="value"
                    defaultValue={editingPricing.value || ""}
                    placeholder="Value (%)"
                    required
                    step="0.01"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <input
                    type="number"
                    name="minQuantity"
                    defaultValue={editingPricing.minQuantity || ""}
                    placeholder="Min Quantity (optional)"
                    min="1"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <input
                    type="text"
                    name="applicableTo"
                    defaultValue={editingPricing.applicableTo || ""}
                    placeholder="Applicable To (optional, e.g., vip, category)"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <AnimatedSelect
                    name="status"
                    value={editingPricing.status || "active"}
                    onChange={(e) => {
                      setEditingPricing({
                        ...editingPricing,
                        status: e.target.value,
                      });
                      const form = e.target.closest("form");
                      if (form) {
                        const statusInput =
                          form.querySelector('[name="status"]');
                        if (statusInput) statusInput.value = e.target.value;
                      }
                    }}
                    options={[
                      { value: "active", label: "Active" },
                      { value: "inactive", label: "Inactive" },
                    ]}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-semibold">
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingPricing(null)}
                      className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-semibold">
                      Cancel
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, id: null, type: null })}
        onConfirm={handleDelete}
        title="Delete Rule?"
        message="Are you sure you want to delete this rule? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </motion.div>
  );
};

export default TaxPricing;
