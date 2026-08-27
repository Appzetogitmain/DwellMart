import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FiSave, FiUpload, FiX } from "react-icons/fi";
import { motion } from "framer-motion";
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import { useVendorProductStore } from "../../store/vendorProductStore";
import { useCategoryStore } from "../../../../shared/store/categoryStore";
import { useBrandStore } from "../../../../shared/store/brandStore";
import { uploadVendorImage, uploadVendorImages, getVendorTaxPricingRules } from "../../services/vendorService";
import CategorySelector from "../../../Admin/components/CategorySelector";
import AnimatedSelect from "../../../Admin/components/AnimatedSelect";
import WholesalePricingSection from "../../../../shared/components/WholesalePricingSection";
import ShippingSection from "../../components/ProductSections/ShippingSection";
import QuickCommerceProductSection from "../../../../shared/components/QuickCommerceProductSection";
import toast from "react-hot-toast";
import {
  emptyWholesaleState,
  buildWholesalePayload,
  validateWholesaleState,
} from "../../../../shared/utils/wholesale";
import {
  emptyQuickCommerceState,
  buildQuickCommercePayload,
  validateQuickCommerceState,
} from "../../../../shared/utils/quickCommerceProduct";
import { getQuickCommerceCategories } from "../../../Admin/services/adminService";
import {
  parseVariantAxis,
  buildVariantCombinations,
  syncVariantPricesWithAxes,
  buildVariantPayload,
} from "../../utils/variantHelpers";
import { getVendorCapabilities } from "../../../../shared/config/vendorCapabilities";
import { useVendorWorkspace } from '../../hooks/useVendorWorkspace';

const AddProduct = () => {
  const navigate = useNavigate();
  const { vendor } = useVendorAuthStore();
  const { addProduct, isSaving } = useVendorProductStore();
  const { categories, initialize: initCategories } = useCategoryStore();
  const { brands, initialize: initBrands } = useBrandStore();

  const vendorId = vendor?.id;
  const { workspace } = useVendorWorkspace();
  const caps = getVendorCapabilities(workspace ?? vendor?.activeWorkspaces?.[0] ?? 'retail');
  const sections = caps.allowedFormSections;

  const [formData, setFormData] = useState({
    name: "",
    unit: "",
    price: "",
    originalPrice: "",
    image: "",
    images: [],
    categoryId: null,
    subcategoryId: null,
    brandId: null,
    stock: "in_stock",
    stockQuantity: "",
    totalAllowedQuantity: "",
    minimumOrderQuantity: "",
    warrantyPeriod: "",
    guaranteePeriod: "",
    hsnCode: "",
    shipping: { weight: "", weightUnit: "kg", length: "", width: "", height: "", dimensionUnit: "cm" },
    flashSale: false,
    isNewArrival: false,
    isFeatured: false,
    isVisible: true,
    codAllowed: true,
    returnable: true,
    cancelable: true,
    taxRate: 18,
    taxIncluded: false,
    description: "",
    tags: [],
    variants: {
      sizes: [],
      colors: [],
      materials: [],
      attributes: [],
      prices: {},
      stockMap: {},
      imageMap: {},
      defaultVariant: {},
      defaultSelection: {},
    },
    seoTitle: "",
    seoDescription: "",
    relatedProducts: [],
    faqs: [],
  });
  const [taxRules, setTaxRules] = useState([]);
  const [wholesaleState, setWholesaleState] = useState(emptyWholesaleState());
  const [quickCommerceState, setQuickCommerceState] = useState(emptyQuickCommerceState());
  const [quickCommerceCategories, setQuickCommerceCategories] = useState([]);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [variantAxisInput, setVariantAxisInput] = useState({
    sizes: "",
    colors: "",
  });
  const variantCombinations = useMemo(
    () =>
      buildVariantCombinations(
        formData.variants?.sizes || [],
        formData.variants?.colors || [],
        formData.variants?.attributes || []
      ),
    [formData.variants?.sizes, formData.variants?.colors, formData.variants?.attributes]
  );
  const currentExperience = workspace === 'quick_commerce' ? 'quick_commerce' : 'marketplace';

  const selectedCategoryName = useMemo(() => {
    const targetId = formData.subcategoryId || formData.categoryId;
    if (!targetId) return '';
    const found = (categories || []).find((c) => String(c.id || c._id) === String(targetId));
    return found ? found.name : '';
  }, [formData.categoryId, formData.subcategoryId, categories]);

  useEffect(() => {
    initCategories(currentExperience);
    initBrands();
  }, [currentExperience, initCategories, initBrands]);

  useEffect(() => {
    if (workspace === 'wholesale') {
      setWholesaleState((state) => ({ ...state, retailEnabled: false, wholesaleEnabled: true }));
    }
    if (workspace === 'quick_commerce') {
      setQuickCommerceState((state) => ({ ...state, quickCommerceEnabled: true }));
    }
  }, [workspace]);

  // Auto-sync Quick Commerce category ID from top category selection in QC workspace
  useEffect(() => {
    if (workspace === 'quick_commerce') {
      const targetId = formData.subcategoryId || formData.categoryId;
      if (targetId && String(quickCommerceState.quickCommerceCategoryId) !== String(targetId)) {
        setQuickCommerceState((prev) => ({
          ...prev,
          quickCommerceCategoryId: String(targetId),
        }));
      }
    }
  }, [workspace, formData.categoryId, formData.subcategoryId, quickCommerceState.quickCommerceCategoryId]);

  // Quick Commerce categories live in a separate tree from Marketplace.
  // Only load them if this vendor type supports Quick Commerce.
  useEffect(() => {
    if (!caps.allowedFormSections.quickCommerce) return;
    let cancelled = false;
    const loadQuickCommerceCategories = async () => {
      try {
        const response = await getQuickCommerceCategories();
        const list = response?.data ?? response;
        if (!cancelled && Array.isArray(list)) {
          setQuickCommerceCategories(list.map((cat) => ({ ...cat, id: cat._id || cat.id })));
        }
      } catch {
        if (!cancelled) setQuickCommerceCategories([]);
      }
    };
    loadQuickCommerceCategories();
    return () => { cancelled = true; };
  }, [caps.allowedFormSections.quickCommerce]);

  useEffect(() => {
    const fetchTaxRules = async () => {
      try {
        const response = await getVendorTaxPricingRules();
        if (response?.data?.taxRules) {
          setTaxRules(response.data.taxRules.filter(rule => rule.status === 'active'));
        }
      } catch (error) {
        console.error("Failed to fetch tax rules", error);
      }
    };
    fetchTaxRules();
  }, []);

  useEffect(() => {
    if (!vendorId) {
      toast.error("Please log in to add products");
      navigate("/vendor/login");
    }
  }, [vendorId, navigate]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  /**
   * `shipping` is nested, which the flat `handleChange` above cannot address
   * without inventing dotted-name parsing for a single section.
   */
  const handleShipping = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      shipping: { ...(prev.shipping || {}), [field]: value },
    }));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast.error("Please select an image file");
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size should be less than 5MB");
        return;
      }

      setIsUploadingMedia(true);
      try {
        const res = await uploadVendorImage(file, "vendors/products");
        const uploaded = res?.data ?? res;
        setFormData((prev) => ({
          ...prev,
          image: uploaded?.url || "",
        }));
        toast.success("Main image uploaded");
      } catch {
        // errors handled by api.js
      } finally {
        setIsUploadingMedia(false);
      }
    }
  };

  const handleGalleryUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const validFiles = files.filter((file) => {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} is not an image file`);
        return false;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} size should be less than 5MB`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    setIsUploadingMedia(true);
    try {
      const res = await uploadVendorImages(validFiles, "vendors/products");
      const uploaded = res?.data ?? res;
      const uploadedUrls = Array.isArray(uploaded)
        ? uploaded.map((u) => u?.url).filter(Boolean)
        : [];

      setFormData((prev) => ({
        ...prev,
        images: [...prev.images, ...uploadedUrls],
      }));
      toast.success(`${uploadedUrls.length} image(s) added to gallery`);
    } catch {
      // errors handled by api.js
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const removeGalleryImage = (index) => {
    setFormData({
      ...formData,
      images: formData.images.filter((_, i) => i !== index),
    });
  };

  const handleFaqChange = (index, field, value) => {
    setFormData((prev) => {
      const nextFaqs = [...(prev.faqs || [])];
      nextFaqs[index] = {
        ...(nextFaqs[index] || { question: "", answer: "" }),
        [field]: value,
      };
      return { ...prev, faqs: nextFaqs };
    });
  };

  const addFaq = () => {
    setFormData((prev) => ({
      ...prev,
      faqs: [...(prev.faqs || []), { question: "", answer: "" }],
    }));
  };

  const removeFaq = (index) => {
    setFormData((prev) => ({
      ...prev,
      faqs: (prev.faqs || []).filter((_, i) => i !== index),
    }));
  };

  const updateVariantAxes = (axis, rawText) => {
    const parsed = parseVariantAxis(rawText);
    const nextSizes = axis === "sizes" ? parsed : (formData.variants?.sizes || []);
    const nextColors = axis === "colors" ? parsed : (formData.variants?.colors || []);
    const synced = syncVariantPricesWithAxes(
      formData.variants?.prices || {},
      formData.variants?.stockMap || {},
      formData.variants?.imageMap || {},
      nextSizes,
      nextColors,
      formData.variants?.attributes || [],
      formData.price
    );

    setFormData((prev) => ({
      ...prev,
      variants: {
        ...prev.variants,
        sizes: nextSizes,
        colors: nextColors,
        prices: synced.prices,
        stockMap: synced.stockMap,
        imageMap: synced.imageMap,
        defaultVariant: {
          size: String(prev.variants?.defaultVariant?.size || ""),
          color: String(prev.variants?.defaultVariant?.color || ""),
        },
      },
    }));
  };

  const updateVariantAttributes = (nextAttributes) => {
    const synced = syncVariantPricesWithAxes(
      formData.variants?.prices || {},
      formData.variants?.stockMap || {},
      formData.variants?.imageMap || {},
      formData.variants?.sizes || [],
      formData.variants?.colors || [],
      nextAttributes,
      formData.price
    );

    setFormData((prev) => ({
      ...prev,
      variants: {
        ...prev.variants,
        attributes: nextAttributes,
        prices: synced.prices,
        stockMap: synced.stockMap,
        imageMap: synced.imageMap,
      },
    }));
  };

  const addAttributeRow = () => {
    const current = Array.isArray(formData.variants?.attributes) ? formData.variants.attributes : [];
    updateVariantAttributes([...current, { name: "", values: [] }]);
  };

  const removeAttributeRow = (index) => {
    const current = Array.isArray(formData.variants?.attributes) ? formData.variants.attributes : [];
    updateVariantAttributes(current.filter((_, i) => i !== index));
  };

  const updateAttributeName = (index, name) => {
    const current = Array.isArray(formData.variants?.attributes) ? formData.variants.attributes : [];
    const next = [...current];
    next[index] = { ...(next[index] || {}), name: String(name || "") };
    updateVariantAttributes(next);
  };

  const updateAttributeValues = (index, rawValues) => {
    const current = Array.isArray(formData.variants?.attributes) ? formData.variants.attributes : [];
    const next = [...current];
    const values = parseVariantAxis(rawValues);
    next[index] = { ...(next[index] || {}), values };
    updateVariantAttributes(next);
  };

  const addVariantAxisValues = (axis, rawInput) => {
    const parsed = parseVariantAxis(rawInput);
    if (!parsed.length) return;
    const current = Array.isArray(formData?.variants?.[axis]) ? formData.variants[axis] : [];
    const merged = parseVariantAxis([...current, ...parsed].join(", "));
    updateVariantAxes(axis, merged.join(", "));
    setVariantAxisInput((prev) => ({ ...prev, [axis]: "" }));
  };

  const removeVariantAxisValue = (axis, valueToRemove) => {
    const current = Array.isArray(formData?.variants?.[axis]) ? formData.variants[axis] : [];
    const next = current.filter((value) => String(value) !== String(valueToRemove));
    updateVariantAxes(axis, next.join(", "));
  };

  const handleVariantAxisInputKeyDown = (axis, e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addVariantAxisValues(axis, variantAxisInput[axis]);
    }
  };

  const handleVariantImageUpload = async (variantKey, file) => {
    if (!file || !variantKey) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB");
      return;
    }

    setIsUploadingMedia(true);
    try {
      const res = await uploadVendorImage(file, "vendors/products/variants");
      const uploaded = res?.data ?? res;
      const imageUrl = uploaded?.url || "";
      if (!imageUrl) return;
      setFormData((prev) => ({
        ...prev,
        variants: {
          ...prev.variants,
          imageMap: {
            ...(prev.variants?.imageMap || {}),
            [variantKey]: imageUrl,
          },
        },
      }));
      toast.success("Variant image uploaded");
    } catch {
      // api interceptor handles error toast
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!vendorId) {
      toast.error("Please log in to add products");
      return;
    }

    if (!formData.name || !formData.price || !formData.stockQuantity || !formData.categoryId) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Determine final categoryId
    const finalCategoryId = formData.subcategoryId
      ? formData.subcategoryId
      : formData.categoryId ?? null;

    const parsedPrice = parseFloat(formData.price);
    const parsedOriginalPrice = formData.originalPrice
      ? parseFloat(formData.originalPrice)
      : null;
    const parsedStockQuantity = parseInt(formData.stockQuantity, 10);
    const parsedTotalAllowedQuantity = formData.totalAllowedQuantity
      ? parseInt(formData.totalAllowedQuantity, 10)
      : null;
    const parsedMinimumOrderQuantity = formData.minimumOrderQuantity
      ? parseInt(formData.minimumOrderQuantity, 10)
      : null;

    if (!Number.isFinite(parsedPrice) || !Number.isFinite(parsedStockQuantity)) {
      toast.error("Please enter valid numeric values");
      return;
    }

    const hasInvalidFaq = (formData.faqs || []).some((faq) => {
      const question = String(faq?.question || "").trim();
      const answer = String(faq?.answer || "").trim();
      return (question && !answer) || (!question && answer);
    });
    if (hasInvalidFaq) {
      toast.error("Each FAQ must have both question and answer");
      return;
    }

    const quickCommerceError = validateQuickCommerceState(quickCommerceState);
    if (quickCommerceError) {
      toast.error(quickCommerceError);
      return;
    }

    const wholesaleError = validateWholesaleState(
      wholesaleState,
      parsedPrice,
      parsedStockQuantity,
      quickCommerceState?.quickCommerceEnabled === true
    );
    if (wholesaleError) {
      toast.error(wholesaleError);
      return;
    }

    /**
     * Blank inputs are dropped rather than sent as "". The validator types
     * these as numbers, so a blank string would fail every save by a vendor
     * who has not measured the product yet. `source` is server-authored and is
     * never sent from the client.
     */
    const buildShippingPayload = () => {
      if (!sections.shipping) return {};
      const raw = formData.shipping || {};
      const numeric = {};
      for (const key of ['weight', 'length', 'width', 'height']) {
        const value = raw[key];
        if (value !== '' && value !== null && value !== undefined) numeric[key] = Number(value);
      }
      if (Object.keys(numeric).length === 0) return {};
      return {
        shipping: {
          ...numeric,
          weightUnit: raw.weightUnit || 'kg',
          dimensionUnit: raw.dimensionUnit || 'cm',
        },
      };
    };

    const payload = {
      ...formData,
      price: parsedPrice,
      originalPrice: parsedOriginalPrice,
      stockQuantity: parsedStockQuantity,
      totalAllowedQuantity: parsedTotalAllowedQuantity,
      minimumOrderQuantity: parsedMinimumOrderQuantity,
      warrantyPeriod: formData.warrantyPeriod || null,
      guaranteePeriod: formData.guaranteePeriod || null,
      hsnCode: formData.hsnCode || null,
      categoryId: finalCategoryId,
      subcategoryId: formData.subcategoryId ? formData.subcategoryId : null,
      brandId: formData.brandId ?? null,
      faqs: (formData.faqs || [])
        .map((faq) => ({
          question: String(faq?.question || "").trim(),
          answer: String(faq?.answer || "").trim(),
        }))
        .filter((faq) => faq.question && faq.answer),
      variants: buildVariantPayload(formData.variants || {}),
      ...buildShippingPayload(),
      ...(caps.allowedFormSections.wholesalePricing ? buildWholesalePayload(wholesaleState) : {}),
      ...(caps.allowedFormSections.quickCommerce
        ? buildQuickCommercePayload({
            ...quickCommerceState,
            quickCommerceEnabled: workspace === 'quick_commerce' ? true : quickCommerceState.quickCommerceEnabled,
            quickCommerceCategoryId:
              workspace === 'quick_commerce'
                ? (quickCommerceState.quickCommerceCategoryId || finalCategoryId)
                : quickCommerceState.quickCommerceCategoryId,
          })
        : {}),
    };

    const result = await addProduct(payload);
    if (result) {
      navigate("/vendor/products/manage-products");
    }
  };

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to add products</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3">
      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200 space-y-4">
        {/* Basic Information */}
        <div>
          <h2 className="text-base font-bold text-gray-800 mb-2">
            Basic Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                placeholder="Enter product name"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Unit
              </label>
              <input
                type="text"
                name="unit"
                value={formData.unit}
                onChange={handleChange}
                placeholder="e.g., Piece, Kilogram, Gram, Pair"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              <CategorySelector
                value={formData.categoryId}
                subcategoryId={formData.subcategoryId}
                onChange={handleChange}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Brand
              </label>
              <AnimatedSelect
                name="brandId"
                value={formData.brandId || ""}
                onChange={handleChange}
                placeholder="Select Brand"
                options={[
                  { value: "", label: "Select Brand" },
                  ...brands
                    .filter((brand) => brand.isActive !== false)
                    .map((brand) => ({ value: String(brand.id), label: brand.name })),
                ]}
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                placeholder="Enter product description..."
              />
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div>
          <h2 className="text-base font-bold text-gray-800 mb-2">Pricing</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Price <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="price"
                value={formData.price}
                onChange={handleChange}
                required
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Original Price (for discount)
              </label>
              <input
                type="number"
                name="originalPrice"
                value={formData.originalPrice}
                onChange={handleChange}
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Tax Bracket <span className="text-red-500">*</span>
              </label>
              <select
                name="taxRate"
                value={formData.taxRate}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              >
                {taxRules.map((rule, idx) => (
                  <option key={rule.id || idx} value={rule.rate}>
                    {rule.name} ({rule.rate}%)
                  </option>
                ))}
                {taxRules.length === 0 && (
                  <option value="18">Standard Tax (18%)</option>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Tax Calculation <span className="text-red-500">*</span>
              </label>
              <select
                name="taxIncluded"
                value={formData.taxIncluded}
                onChange={(e) => setFormData(prev => ({...prev, taxIncluded: e.target.value === 'true'}))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              >
                <option value="false">Tax Excluded (Net Price)</option>
                <option value="true">Tax Included (Gross Price)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Product Media */}
        <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-3 sm:p-4 border-2 border-primary-200 shadow-lg">
          <h2 className="text-base font-bold text-primary-800 mb-3 flex items-center gap-2">
            <FiUpload className="text-lg" />
            Product Media
          </h2>

          <div className="space-y-3">
            {/* Main Image */}
            <div className="bg-white rounded-lg p-3 border border-primary-200">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">
                Main Image
              </h3>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Upload Main Image
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="main-image-upload"
                  />
                  <label
                    htmlFor="main-image-upload"
                    className="flex items-center justify-center gap-2 w-full px-3 py-2 border-2 border-dashed border-primary-300 rounded-lg cursor-pointer hover:border-primary-500 hover:bg-primary-50 transition-colors bg-white">
                    <FiUpload className="text-base text-primary-600" />
                    <span className="text-xs font-medium text-gray-700">
                      {formData.image
                        ? "Change Main Image"
                        : "Choose Main Image"}
                    </span>
                  </label>
                </div>
                {formData.image && (
                  <div className="mt-2 flex items-start gap-3">
                    <img
                      src={formData.image}
                      alt="Main Preview"
                      className="w-24 h-24 object-cover rounded-lg border-2 border-primary-300 shadow-md"
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, image: "" })}
                      className="mt-1 px-3 py-1.5 text-xs text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors font-medium">
                      Remove Image
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Product Gallery */}
            <div className="bg-white rounded-lg p-3 border border-primary-200">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">
                Product Gallery
              </h3>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Upload Gallery Images (Multiple)
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleGalleryUpload}
                    className="hidden"
                    id="gallery-upload"
                  />
                  <label
                    htmlFor="gallery-upload"
                    className="flex items-center justify-center gap-2 w-full px-3 py-2 border-2 border-dashed border-primary-300 rounded-lg cursor-pointer hover:border-primary-500 hover:bg-primary-50 transition-colors bg-white">
                    <FiUpload className="text-base text-primary-600" />
                    <span className="text-xs font-medium text-gray-700">
                      Choose Gallery Images
                    </span>
                  </label>
                </div>
                {formData.images && formData.images.length > 0 && (
                  <div className="mt-2">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {formData.images.map((img, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={img}
                            alt={`Gallery ${index + 1}`}
                            className="w-full h-24 object-cover rounded-lg border-2 border-primary-300 shadow-md"
                            onError={(e) => {
                              e.target.style.display = "none";
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => removeGalleryImage(index)}
                            className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                            title="Remove image">
                            <FiX className="text-xs" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {formData.images.length} image(s) in gallery
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Inventory */}
        <div>
          <h2 className="text-base font-bold text-gray-800 mb-2">Inventory</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Stock Quantity <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="stockQuantity"
                value={formData.stockQuantity}
                onChange={handleChange}
                required
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Stock Status
              </label>
              <AnimatedSelect
                name="stock"
                value={formData.stock}
                onChange={handleChange}
                options={[
                  { value: 'in_stock', label: 'In Stock' },
                  { value: 'low_stock', label: 'Low Stock' },
                  { value: 'out_of_stock', label: 'Out of Stock' },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Shipping — parcel data for the courier. Absent for Quick Commerce,
            which is delivered by internal riders. */}
        {sections.shipping && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <ShippingSection formData={formData} handleShipping={handleShipping} />
          </div>
        )}

        {/* Wholesale & Bulk Pricing (Wholesale vendors only) */}
        {sections.wholesalePricing && (
          <WholesalePricingSection
            value={wholesaleState}
            onChange={setWholesaleState}
            retailPrice={formData.price}
            stockQuantity={formData.stockQuantity}
            disabled={isSaving}
          />
        )}

        {/* Quick Commerce Details (Quick Commerce vendors only) */}
        {sections.quickCommerce && (
          <QuickCommerceProductSection
            value={quickCommerceState}
            onChange={setQuickCommerceState}
            categories={quickCommerceCategories}
            isWorkspaceQuickCommerce={workspace === 'quick_commerce'}
            syncedCategoryName={selectedCategoryName}
            disabled={isSaving}
          />
        )}

        {/* Product Variants (Retail & Wholesale vendors) */}
        {sections.variants && (
          <div>
            <h2 className="text-base font-bold text-gray-800 mb-2">
              Product Variants
            </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Sizes
              </label>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {(formData.variants?.sizes || []).map((size) => (
                    <span
                      key={size}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs border border-blue-200"
                    >
                      {size}
                      <button
                        type="button"
                        onClick={() => removeVariantAxisValue("sizes", size)}
                        className="text-blue-700 hover:text-blue-900"
                      >
                        <FiX className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={variantAxisInput.sizes}
                    onChange={(e) =>
                      setVariantAxisInput((prev) => ({ ...prev, sizes: e.target.value }))
                    }
                    onKeyDown={(e) => handleVariantAxisInputKeyDown("sizes", e)}
                    onBlur={() => addVariantAxisValues("sizes", variantAxisInput.sizes)}
                    placeholder="Type size and press Enter (e.g. S, M, L)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => addVariantAxisValues("sizes", variantAxisInput.sizes)}
                    className="px-3 py-2 text-xs font-semibold border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Colors
              </label>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {(formData.variants?.colors || []).map((color) => (
                    <span
                      key={color}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs border border-emerald-200"
                    >
                      {color}
                      <button
                        type="button"
                        onClick={() => removeVariantAxisValue("colors", color)}
                        className="text-emerald-700 hover:text-emerald-900"
                      >
                        <FiX className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={variantAxisInput.colors}
                    onChange={(e) =>
                      setVariantAxisInput((prev) => ({ ...prev, colors: e.target.value }))
                    }
                    onKeyDown={(e) => handleVariantAxisInputKeyDown("colors", e)}
                    onBlur={() => addVariantAxisValues("colors", variantAxisInput.colors)}
                    placeholder="Type color and press Enter (e.g. Red, Blue)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => addVariantAxisValues("colors", variantAxisInput.colors)}
                    className="px-3 py-2 text-xs font-semibold border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-gray-700">
                  Dynamic Attributes (optional)
                </label>
                <button
                  type="button"
                  onClick={addAttributeRow}
                  className="px-2 py-1 text-xs font-semibold border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Add Attribute
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mb-2">
                Example: RAM {"->"} 8GB, 16GB | Storage {"->"} 128GB, 256GB
              </p>
              <div className="space-y-2">
                {(formData.variants?.attributes || []).map((attribute, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      value={attribute?.name || ""}
                      onChange={(e) => updateAttributeName(index, e.target.value)}
                      placeholder="Attribute name"
                      className="md:col-span-3 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    />
                    <input
                      type="text"
                      value={(attribute?.values || []).join(", ")}
                      onChange={(e) => updateAttributeValues(index, e.target.value)}
                      placeholder="Values (comma separated)"
                      className="md:col-span-8 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeAttributeRow(index)}
                      className="md:col-span-1 px-2 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
                      aria-label="Remove attribute"
                    >
                      <FiX className="w-4 h-4 mx-auto" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            {variantCombinations.length > 0 && (
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <p className="text-xs font-semibold text-gray-700 mb-2">
                  Variant Prices
                </p>
                <div className="space-y-2">
                  {variantCombinations.map((combo) => (
                    <div key={combo.key} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
                      <p className="text-xs text-gray-700 md:col-span-1">
                        {combo.label || ((combo.size || "Any Size") + " / " + (combo.color || "Any Color"))}
                      </p>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.variants?.prices?.[combo.key] ?? ""}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          setFormData((prev) => ({
                            ...prev,
                            variants: {
                              ...prev.variants,
                              prices: {
                                ...(prev.variants?.prices || {}),
                                [combo.key]: nextValue === "" ? "" : Number(nextValue),
                              },
                            },
                          }));
                        }}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs"
                        placeholder="Use base price"
                      />
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={formData.variants?.stockMap?.[combo.key] ?? ""}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          setFormData((prev) => ({
                            ...prev,
                            variants: {
                              ...prev.variants,
                              stockMap: {
                                ...(prev.variants?.stockMap || {}),
                                [combo.key]: nextValue === "" ? "" : Number(nextValue),
                              },
                            },
                          }));
                        }}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs"
                        placeholder="Variant stock"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          accept="image/*"
                          id={`variant-image-${combo.key}`}
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleVariantImageUpload(combo.key, file);
                            e.target.value = "";
                          }}
                        />
                        <label
                          htmlFor={`variant-image-${combo.key}`}
                          className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs cursor-pointer hover:bg-gray-100"
                        >
                          Upload
                        </label>
                        {formData.variants?.imageMap?.[combo.key] && (
                          <img
                            src={formData.variants.imageMap[combo.key]}
                            alt="Variant"
                            className="w-8 h-8 rounded object-cover border border-gray-300"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <select
                    value={formData.variants?.defaultVariant?.size || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        variants: {
                          ...prev.variants,
                          defaultVariant: {
                            ...(prev.variants?.defaultVariant || {}),
                            size: e.target.value,
                          },
                        },
                      }))
                    }
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs"
                  >
                    <option value="">Default size (optional)</option>
                    {(formData.variants?.sizes || []).map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                  <select
                    value={formData.variants?.defaultVariant?.color || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        variants: {
                          ...prev.variants,
                          defaultVariant: {
                            ...(prev.variants?.defaultVariant || {}),
                            color: e.target.value,
                          },
                        },
                      }))
                    }
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-xs"
                  >
                    <option value="">Default color (optional)</option>
                    {(formData.variants?.colors || []).map((color) => (
                      <option key={color} value={color}>{color}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        {/* Tags */}
        <div>
          <h2 className="text-base font-bold text-gray-800 mb-2">Tags</h2>
          <div>
            <input
              type="text"
              value={(formData.tags || []).join(", ")}
              onChange={(e) => {
                const tags = e.target.value
                  .split(",")
                  .map((t) => t.trim())
                  .filter((t) => t);
                setFormData({ ...formData, tags });
              }}
              placeholder="tag1, tag2, tag3"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Separate tags with commas
            </p>
          </div>
        </div>

        {/* Options */}
        <div>
          <h2 className="text-base font-bold text-gray-800 mb-2">
            Product Options
          </h2>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="flashSale"
                checked={formData.flashSale}
                onChange={handleChange}
                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
              />
              <span className="text-xs font-semibold text-gray-700">
                Flash Sale
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="isNewArrival"
                checked={formData.isNewArrival}
                onChange={handleChange}
                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
              />
              <span className="text-xs font-semibold text-gray-700">
                New Arrival
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="isFeatured"
                checked={formData.isFeatured}
                onChange={handleChange}
                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
              />
              <span className="text-xs font-semibold text-gray-700">
                Featured Product
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="isVisible"
                checked={formData.isVisible}
                onChange={handleChange}
                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
              />
              <span className="text-xs font-semibold text-gray-700">
                Visible to Customers
              </span>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-gray-200">
          <button
            type="button"
            onClick={() => navigate("/vendor/products/manage-products")}
            className="w-full sm:w-auto px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold text-sm">
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || isUploadingMedia}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold text-sm disabled:opacity-60 disabled:cursor-not-allowed">
            <FiSave />
            {isUploadingMedia ? "Uploading Media..." : isSaving ? "Creating..." : "Create Product"}
          </button>
        </div>

        {/* Product FAQs */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold text-gray-800">Product FAQs</h2>
            <button
              type="button"
              onClick={addFaq}
              className="px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Add FAQ
            </button>
          </div>
          <div className="space-y-3">
            {(formData.faqs || []).map((faq, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-600">FAQ #{index + 1}</p>
                  <button
                    type="button"
                    onClick={() => removeFaq(index)}
                    className="text-xs text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
                <input
                  type="text"
                  value={faq.question || ""}
                  onChange={(e) => handleFaqChange(index, "question", e.target.value)}
                  placeholder="Question"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white"
                />
                <textarea
                  value={faq.answer || ""}
                  onChange={(e) => handleFaqChange(index, "answer", e.target.value)}
                  rows={2}
                  placeholder="Answer"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white"
                />
              </div>
            ))}
            {(formData.faqs || []).length === 0 && (
              <p className="text-xs text-gray-500">No FAQs added yet.</p>
            )}
          </div>
        </div>
      </form>
    </motion.div>
  );
};

export default AddProduct;

