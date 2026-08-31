import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FiSave } from "react-icons/fi";
import { motion } from "framer-motion";

import { useVendorAuthStore } from "../../store/vendorAuthStore";
import { useVendorProductStore } from "../../store/vendorProductStore";
import { useCategoryStore } from "../../../../shared/store/categoryStore";
import { useBrandStore } from "../../../../shared/store/brandStore";
import { getVendorCapabilities } from "../../../../shared/config/vendorCapabilities";
import { useVendorWorkspace } from '../../hooks/useVendorWorkspace';

import { uploadVendorImage, uploadVendorImages, getVendorTaxPricingRules } from "../../services/vendorService";
import { getQuickCommerceCategories } from "../../../Admin/services/adminService";

import WholesalePricingSection from "../../../../shared/components/WholesalePricingSection";
import QuickCommerceProductSection from "../../../../shared/components/QuickCommerceProductSection";

import GeneralSection    from "../../components/ProductSections/GeneralSection";
import MediaSection      from "../../components/ProductSections/MediaSection";
import PricingSection    from "../../components/ProductSections/PricingSection";
import InventorySection  from "../../components/ProductSections/InventorySection";
import ShippingSection   from "../../components/ProductSections/ShippingSection";
import VariantsSection   from "../../components/ProductSections/VariantsSection";
import VisibilitySection from "../../components/ProductSections/VisibilitySection";
import TagsAndFAQsSection from "../../components/ProductSections/TagsAndFAQsSection";

import toast from "react-hot-toast";
import {
  emptyWholesaleState,
  wholesaleStateFromProduct,
  buildWholesalePayload,
  validateWholesaleState,
} from "../../../../shared/utils/wholesale";
import {
  emptyQuickCommerceState,
  quickCommerceStateFromProduct,
  buildQuickCommercePayload,
  validateQuickCommerceState,
} from "../../../../shared/utils/quickCommerceProduct";
import {
  parseVariantAxis,
  buildVariantCombinations,
  syncVariantPricesWithAxes,
  buildVariantPayload,
  normalizeVariantStateForForm,
} from "../../utils/variantHelpers";

const ProductForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { vendor } = useVendorAuthStore();
  const { fetchProductById, editProduct, addProduct, getById, isSaving } = useVendorProductStore();
  const isEdit = id && id !== "new";

  const vendorId = vendor?.id;
  const { workspace } = useVendorWorkspace();
  const vendorType = workspace ?? vendor?.activeWorkspaces?.[0] ?? "retail";

  // ── Capabilities — all section gates come from here ───────────────────────
  const caps = useMemo(() => getVendorCapabilities(vendorType), [vendorType]);
  const sections = caps.allowedFormSections;

  const { categories, initialize: initCategories } = useCategoryStore();
  const { brands, initialize: initBrands } = useBrandStore();

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
  const [variantAxisInput, setVariantAxisInput] = useState({ sizes: "", colors: "" });

  const variantCombinations = useMemo(
    () =>
      buildVariantCombinations(
        formData.variants?.sizes || [],
        formData.variants?.colors || [],
        formData.variants?.attributes || []
      ),
    [formData.variants?.sizes, formData.variants?.colors, formData.variants?.attributes]
  );

  const normalizeId = (value) => {
    if (!value) return null;
    if (typeof value === "object") return value._id ?? value.id ?? null;
    return value;
  };

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
    if (isEdit) return;
    if (workspace === 'wholesale') {
      setWholesaleState((state) => ({ ...state, retailEnabled: false, wholesaleEnabled: true }));
    }
    if (workspace === 'quick_commerce') {
      setQuickCommerceState((state) => ({ ...state, quickCommerceEnabled: true }));
    }
  }, [isEdit, workspace]);

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

  // Load QC categories only when this vendor type allows the QC section
  useEffect(() => {
    if (!sections.quickCommerce) return;
    let cancelled = false;
    const load = async () => {
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
    load();
    return () => { cancelled = true; };
  }, [sections.quickCommerce]);

  useEffect(() => {
    const fetchTaxRules = async () => {
      try {
        const response = await getVendorTaxPricingRules();
        if (response?.data?.taxRules) setTaxRules(response.data.taxRules);
      } catch (error) {
        console.error("Failed to fetch tax rules", error);
      }
    };
    fetchTaxRules();
  }, []);

  useEffect(() => {
    if (!vendorId) {
      toast.error("Please log in to edit products");
      navigate("/vendor/login");
      return;
    }

    if (isEdit) {
      const cached = getById(id);
      if (cached) {
        populateForm(cached, categories);
      } else {
        fetchProductById(id).then((product) => {
          if (!product) {
            toast.error("Product not found");
            navigate("/vendor/products/manage-products");
            return;
          }
          populateForm(product, categories);
        });
      }
    }
  }, [isEdit, id, vendorId, navigate, categories, getById, fetchProductById]);

  const populateForm = (product, cats) => {
    const normalizedCategoryId = normalizeId(product.categoryId);
    const normalizedBrandId = normalizeId(product.brandId);
    const normalizedSubcategoryId = normalizeId(product.subcategoryId);
    const category = cats.find(
      (cat) => String(cat._id ?? cat.id) === String(normalizedCategoryId)
    );
    const normalizedParentCategoryId = normalizeId(category?.parentId);
    const isSubcategory = Boolean(normalizedParentCategoryId);
    const normalizedVariants = normalizeVariantStateForForm(product.variants || {}, product.price);

    setFormData({
      name: product.name || "",
      unit: product.unit || "",
      price: product.price || "",
      originalPrice: product.originalPrice || product.price || "",
      image: product.image || "",
      images: product.images || [],
      categoryId: isSubcategory ? normalizedParentCategoryId : normalizedCategoryId || null,
      subcategoryId: isSubcategory ? normalizedCategoryId : normalizedSubcategoryId || null,
      brandId: normalizedBrandId || null,
      stock: product.stock || "in_stock",
      stockQuantity: product.stockQuantity || "",
      totalAllowedQuantity: product.totalAllowedQuantity || "",
      minimumOrderQuantity: product.minimumOrderQuantity || "",
      warrantyPeriod: product.warrantyPeriod || "",
      guaranteePeriod: product.guaranteePeriod || "",
      hsnCode: product.hsnCode || "",
      shipping: {
        weight:        product.shipping?.weight ?? "",
        weightUnit:    product.shipping?.weightUnit || "kg",
        length:        product.shipping?.length ?? "",
        width:         product.shipping?.width ?? "",
        height:        product.shipping?.height ?? "",
        dimensionUnit: product.shipping?.dimensionUnit || "cm",
      },
      flashSale: product.flashSale || false,
      isNewArrival: product.isNewArrival || false,
      isFeatured: product.isFeatured || false,
      isVisible: product.isVisible !== undefined ? product.isVisible : true,
      codAllowed: product.codAllowed !== undefined ? product.codAllowed : true,
      returnable: product.returnable !== undefined ? product.returnable : true,
      cancelable: product.cancelable !== undefined ? product.cancelable : true,
      taxRate: product.taxRate !== undefined ? product.taxRate : 18,
      taxIncluded: product.taxIncluded || false,
      description: product.description || "",
      tags: product.tags || [],
      variants: normalizedVariants,
      seoTitle: product.seoTitle || "",
      seoDescription: product.seoDescription || "",
      relatedProducts: product.relatedProducts || [],
      faqs: Array.isArray(product.faqs) ? product.faqs : [],
    });
    setWholesaleState(wholesaleStateFromProduct(product));
    setQuickCommerceState(quickCommerceStateFromProduct(product));
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  /**
   * `shipping` is a nested object, so the flat `handleChange` (which writes
   * `formData[name]`) cannot address it without inventing dotted-name parsing
   * for one section.
   */
  const handleShipping = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      shipping: { ...(prev.shipping || {}), [field]: value },
    }));
  };

  // ── Image Handlers ─────────────────────────────────────────────────────────
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image size should be less than 5MB"); return; }
    setIsUploadingMedia(true);
    try {
      const res = await uploadVendorImage(file, "vendors/products");
      const uploaded = res?.data ?? res;
      setFormData((prev) => ({ ...prev, image: uploaded?.url || "" }));
      toast.success("Main image uploaded");
    } catch { /* errors handled by api.js */ } finally { setIsUploadingMedia(false); }
  };

  const handleGalleryUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const validFiles = files.filter((file) => {
      if (!file.type.startsWith("image/")) { toast.error(`${file.name} is not an image file`); return false; }
      if (file.size > 5 * 1024 * 1024) { toast.error(`${file.name} size should be less than 5MB`); return false; }
      return true;
    });
    if (!validFiles.length) return;
    setIsUploadingMedia(true);
    try {
      const res = await uploadVendorImages(validFiles, "vendors/products");
      const uploaded = res?.data ?? res;
      const uploadedUrls = Array.isArray(uploaded) ? uploaded.map((u) => u?.url).filter(Boolean) : [];
      setFormData((prev) => ({ ...prev, images: [...prev.images, ...uploadedUrls] }));
      toast.success(`${uploadedUrls.length} image(s) added to gallery`);
    } catch { /* errors handled by api.js */ } finally { setIsUploadingMedia(false); }
  };

  const removeGalleryImage = (index) =>
    setFormData((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));

  // ── FAQ Handlers ───────────────────────────────────────────────────────────
  const handleFaqChange = (index, field, value) =>
    setFormData((prev) => {
      const nextFaqs = [...(prev.faqs || [])];
      nextFaqs[index] = { ...(nextFaqs[index] || { question: "", answer: "" }), [field]: value };
      return { ...prev, faqs: nextFaqs };
    });

  const addFaq = () =>
    setFormData((prev) => ({ ...prev, faqs: [...(prev.faqs || []), { question: "", answer: "" }] }));

  const removeFaq = (index) =>
    setFormData((prev) => ({ ...prev, faqs: (prev.faqs || []).filter((_, i) => i !== index) }));

  // ── Variant Handlers ───────────────────────────────────────────────────────
  const updateVariantAxes = (axis, rawText) => {
    const parsed = parseVariantAxis(rawText);
    const nextSizes = axis === "sizes" ? parsed : (formData.variants?.sizes || []);
    const nextColors = axis === "colors" ? parsed : (formData.variants?.colors || []);
    const synced = syncVariantPricesWithAxes(
      formData.variants?.prices || {},
      formData.variants?.stockMap || {},
      formData.variants?.imageMap || {},
      nextSizes, nextColors, formData.variants?.attributes || [], formData.price
    );
    setFormData((prev) => ({
      ...prev,
      variants: {
        ...prev.variants,
        sizes: nextSizes, colors: nextColors,
        prices: synced.prices, stockMap: synced.stockMap, imageMap: synced.imageMap,
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
      formData.variants?.sizes || [], formData.variants?.colors || [], nextAttributes, formData.price
    );
    setFormData((prev) => ({
      ...prev,
      variants: { ...prev.variants, attributes: nextAttributes, ...synced },
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
    next[index] = { ...(next[index] || {}), values: parseVariantAxis(rawValues) };
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
    updateVariantAxes(axis, current.filter((v) => String(v) !== String(valueToRemove)).join(", "));
  };

  const handleVariantAxisInputKeyDown = (axis, e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addVariantAxisValues(axis, variantAxisInput[axis]);
    }
  };

  const handleVariantImageUpload = async (variantKey, file) => {
    if (!file || !variantKey) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image size should be less than 5MB"); return; }
    setIsUploadingMedia(true);
    try {
      const res = await uploadVendorImage(file, "vendors/products/variants");
      const uploaded = res?.data ?? res;
      const imageUrl = uploaded?.url || "";
      if (!imageUrl) return;
      setFormData((prev) => ({
        ...prev,
        variants: { ...prev.variants, imageMap: { ...(prev.variants?.imageMap || {}), [variantKey]: imageUrl } },
      }));
      toast.success("Variant image uploaded");
    } catch { /* api interceptor handles error toast */ } finally { setIsUploadingMedia(false); }
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!vendorId) { toast.error("Please log in to save products"); return; }
    if (!formData.name || !formData.price || !formData.stockQuantity || !formData.categoryId) {
      toast.error("Please fill in all required fields");
      return;
    }

    const finalCategoryId = formData.subcategoryId ?? formData.categoryId ?? null;
    const parsedPrice = parseFloat(formData.price);
    const parsedOriginalPrice = formData.originalPrice ? parseFloat(formData.originalPrice) : null;
    const parsedStockQuantity = parseInt(formData.stockQuantity, 10);
    const parsedTotalAllowedQuantity = formData.totalAllowedQuantity ? parseInt(formData.totalAllowedQuantity, 10) : null;
    const parsedMinimumOrderQuantity = formData.minimumOrderQuantity ? parseInt(formData.minimumOrderQuantity, 10) : null;

    if (!Number.isFinite(parsedPrice) || !Number.isFinite(parsedStockQuantity)) {
      toast.error("Please enter valid numeric values");
      return;
    }

    const hasInvalidFaq = (formData.faqs || []).some((faq) => {
      const q = String(faq?.question || "").trim();
      const a = String(faq?.answer || "").trim();
      return (q && !a) || (!q && a);
    });
    if (hasInvalidFaq) { toast.error("Each FAQ must have both question and answer"); return; }

    // Only validate QC / wholesale if their sections are active for this type
    if (sections.quickCommerce) {
      const quickCommerceError = validateQuickCommerceState(quickCommerceState);
      if (quickCommerceError) { toast.error(quickCommerceError); return; }
    }

    if (sections.wholesalePricing) {
      const wholesaleError = validateWholesaleState(
        wholesaleState, parsedPrice, parsedStockQuantity,
        quickCommerceState?.quickCommerceEnabled === true
      );
      if (wholesaleError) { toast.error(wholesaleError); return; }
    }

    const wholesalePayload = sections.wholesalePricing ? buildWholesalePayload(wholesaleState) : {};
    // Publishing in Wholesale cannot mutate Retail ownership fields.
    if (workspace === 'wholesale') delete wholesalePayload.retailEnabled;
    if (sections.shipping) {
      const raw = formData.shipping || {};
      const weight = Number(raw.weight);
      const length = Number(raw.length);
      const width = Number(raw.width);
      const height = Number(raw.height);

      if (!Number.isFinite(weight) || weight <= 0) {
        toast.error("Please enter a valid shipping weight (greater than 0)");
        return;
      }
      if (!Number.isFinite(length) || length <= 0) {
        toast.error("Please enter parcel length (greater than 0)");
        return;
      }
      if (!Number.isFinite(width) || width <= 0) {
        toast.error("Please enter parcel width (greater than 0)");
        return;
      }
      if (!Number.isFinite(height) || height <= 0) {
        toast.error("Please enter parcel height (greater than 0)");
        return;
      }
    }

    const buildShippingPayload = () => {
      if (!sections.shipping) return null;
      const raw = formData.shipping || {};
      return {
        weight: Number(raw.weight),
        length: Number(raw.length),
        width: Number(raw.width),
        height: Number(raw.height),
        weightUnit: raw.weightUnit || 'kg',
        dimensionUnit: raw.dimensionUnit || 'cm',
      };
    };

    const shippingData = buildShippingPayload();

    const payload = {
      ...formData,
      ...(shippingData ? { shipping: shippingData } : {}),
      ...(isEdit && getById(id)?.__v !== undefined
        ? { expectedVersion: getById(id).__v }
        : {}),
      price: parsedPrice,
      originalPrice: Number.isFinite(parsedOriginalPrice) ? parsedOriginalPrice : null,
      stockQuantity: parsedStockQuantity,
      totalAllowedQuantity: parsedTotalAllowedQuantity,
      minimumOrderQuantity: parsedMinimumOrderQuantity,
      categoryId: finalCategoryId,
      subcategoryId: formData.subcategoryId ? formData.subcategoryId : null,
      brandId: formData.brandId ? formData.brandId : null,
      faqs: (formData.faqs || [])
        .map((faq) => ({
          question: String(faq?.question || "").trim(),
          answer: String(faq?.answer || "").trim(),
        }))
        .filter((faq) => faq.question && faq.answer),
      variants: buildVariantPayload(formData.variants || {}),
      // Only include wholesale/QC payloads if the section is active for this type
      ...wholesalePayload,
      ...(sections.quickCommerce
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

    if (!shippingData) {
      delete payload.shipping;
    }

    const result = isEdit ? await editProduct(id, payload) : await addProduct(payload);
    if (result) navigate("/vendor/products/manage-products");
  };

  if (!vendorId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please log in to manage products</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl p-3 sm:p-4 shadow-sm border border-gray-200 space-y-4"
      >
        {/* ── Section: General ────────────────────────────────────────────── */}
        {sections.general && (
          <GeneralSection
            formData={formData}
            handleChange={handleChange}
            brands={brands}
          />
        )}

        {/* ── Section: Pricing ─────────────────────────────────────────────── */}
        {sections.pricing && (
          <PricingSection
            formData={formData}
            handleChange={handleChange}
            setFormData={setFormData}
            taxRules={taxRules}
          />
        )}

        {/* ── Section: Media ────────────────────────────────────────────────── */}
        {sections.media && (
          <MediaSection
            formData={formData}
            setFormData={setFormData}
            handleImageUpload={handleImageUpload}
            handleGalleryUpload={handleGalleryUpload}
            removeGalleryImage={removeGalleryImage}
            isUploadingMedia={isUploadingMedia}
          />
        )}

        {/* ── Section: Inventory ───────────────────────────────────────────── */}
        {sections.inventory && (
          <InventorySection formData={formData} handleChange={handleChange} />
        )}

        {/* ── Section: Shipping (Retail & Wholesale) ───────────────────────── */}
        {/* Parcel data for the courier. Absent for Quick Commerce, which is
            delivered by internal riders and never billed on volumetric weight. */}
        {sections.shipping && (
          <ShippingSection formData={formData} handleShipping={handleShipping} />
        )}

        {/* ── Section: Wholesale Pricing (Wholesale only) ───────────────────── */}
        {sections.wholesalePricing && (
          <WholesalePricingSection
            value={wholesaleState}
            onChange={setWholesaleState}
            retailPrice={formData.price}
            stockQuantity={formData.stockQuantity}
            vendorWholesaleEnabled={true}
            quickCommerceProductEnabled={false}
            vendorQuickCommerceEnabled={false}
            onQuickCommerceToggle={() => {}}
            disabled={isSaving}
          />
        )}

        {/* ── Section: Quick Commerce (QC only) ────────────────────────────── */}
        {sections.quickCommerce && (
          <QuickCommerceProductSection
            value={quickCommerceState}
            onChange={setQuickCommerceState}
            categories={quickCommerceCategories}
            isWorkspaceQuickCommerce={workspace === 'quick_commerce'}
            syncedCategoryName={selectedCategoryName}
            vendorQuickCommerceEnabled={true}
            disabled={isSaving}
          />
        )}

        {/* ── Section: Variants (Retail + Wholesale) ────────────────────────── */}
        {sections.variants && (
          <VariantsSection
            formData={formData}
            setFormData={setFormData}
            variantAxisInput={variantAxisInput}
            setVariantAxisInput={setVariantAxisInput}
            variantCombinations={variantCombinations}
            handleVariantAxisInputKeyDown={handleVariantAxisInputKeyDown}
            addVariantAxisValues={addVariantAxisValues}
            removeVariantAxisValue={removeVariantAxisValue}
            addAttributeRow={addAttributeRow}
            removeAttributeRow={removeAttributeRow}
            updateAttributeName={updateAttributeName}
            updateAttributeValues={updateAttributeValues}
            handleVariantImageUpload={handleVariantImageUpload}
            isUploadingMedia={isUploadingMedia}
          />
        )}

        {/* ── Section: Visibility ───────────────────────────────────────────── */}
        {sections.visibility && (
          <VisibilitySection formData={formData} handleChange={handleChange} />
        )}

        {/* ── Section: Tags + FAQs ─────────────────────────────────────────── */}
        {(sections.tags || sections.faqs) && (
          <TagsAndFAQsSection
            formData={formData}
            setFormData={setFormData}
            handleFaqChange={handleFaqChange}
            addFaq={addFaq}
            removeFaq={removeFaq}
          />
        )}

        {/* ── Actions ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-gray-200">
          <button
            type="button"
            onClick={() => navigate("/vendor/products/manage-products")}
            className="w-full sm:w-auto px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || isUploadingMedia}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 gradient-green text-white rounded-lg hover:shadow-glow-green transition-all font-semibold text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <FiSave />
            {isUploadingMedia
              ? "Uploading Media..."
              : isSaving
              ? "Saving..."
              : isEdit
              ? "Update Product"
              : "Create Product"}
          </button>
        </div>
      </form>
    </motion.div>
  );
};

export default ProductForm;
