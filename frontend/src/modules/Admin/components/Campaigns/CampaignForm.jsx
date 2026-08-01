import { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import {
  FiX,
  FiSave,
  FiCalendar,
  FiLink,
  FiEye,
  FiSearch,
  FiFilter,
  FiCheckSquare,
  FiSquare,
  FiXCircle,
  FiUpload,
  FiImage,
} from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { useCampaignStore } from "../../../../shared/store/campaignStore";
import { useCategoryStore } from "../../../../shared/store/categoryStore";
import { useBrandStore } from "../../../../shared/store/brandStore";
import { generateSlug } from "../../../../shared/store/campaignStore";
import AnimatedSelect from "../AnimatedSelect";
import { formatPrice, getPlaceholderImage } from "../../../../shared/utils/helpers";
import toast from "react-hot-toast";
import Button from "../Button";
import { uploadAdminImage } from "../../services/adminService";
import { getAllProducts } from "../../services/adminService";

const CampaignForm = ({ campaign, onClose, onSave }) => {
  const CAMPAIGN_PRODUCT_PLACEHOLDER = getPlaceholderImage(48, 48, "Product");
  const location = useLocation();
  const isAppRoute = location.pathname.startsWith("/app");
  const { campaigns, createCampaign, updateCampaign } = useCampaignStore();
  const isEdit = !!campaign?._id;

  const [formData, setFormData] = useState({
    name: "",
    type: "flash_sale",
    description: "",
    discountType: "percentage",
    discountValue: "",
    startDate: "",
    endDate: "",
    productIds: [],
    isActive: true,
    slug: "",
    autoCreateBanner: true,
    pageConfig: {
      showCountdown: true,
      countdownType: "campaign_end",
      viewModes: ["grid", "list"],
      defaultViewMode: "grid",
      enableFilters: true,
      enableSorting: true,
      productsPerPage: 12,
      showStats: true,
    },
    bannerConfig: {
      title: "",
      subtitle: "",
      image: "",
      customImage: false,
    },
  });

  const [products, setProducts] = useState([]);

  // Product selection filters
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [selectedProductCategory, setSelectedProductCategory] = useState("all");
  const [selectedProductBrand, setSelectedProductBrand] = useState("all");
  const [selectedProductStock, setSelectedProductStock] = useState("all");
  const [productPage, setProductPage] = useState(1);
  const productsPerPage = 20;
  const [isUploadingBannerImage, setIsUploadingBannerImage] = useState(false);

  // Get stores
  const {
    categories,
    getRootCategories,
    getCategoriesByParent,
    initialize: initCategories,
  } = useCategoryStore();
  const { brands, initialize: initBrands } = useBrandStore();

  // Initialize stores
  useEffect(() => {
    initCategories();
    initBrands();
  }, [initCategories, initBrands]);

  useEffect(() => {
    let cancelled = false;
    const fetchProducts = async () => {
      try {
        const response = await getAllProducts({ page: 1, limit: 500 });
        const payload = response?.data ?? response;
        const list = Array.isArray(payload?.products) ? payload.products : [];
        if (cancelled) return;
        const normalized = list.map((product) => {
          const category =
            product?.categoryId && typeof product.categoryId === "object"
              ? product.categoryId
              : null;
          const brand =
            product?.brandId && typeof product.brandId === "object"
              ? product.brandId
              : null;
          return {
            ...product,
            id: String(product?._id || product?.id || ""),
            categoryId: String(category?._id || product?.categoryId || ""),
            brandId: String(brand?._id || product?.brandId || ""),
            image: product?.image || product?.images?.[0] || "",
            price: Number(product?.price) || 0,
            originalPrice:
              product?.originalPrice !== undefined
                ? Number(product.originalPrice)
                : undefined,
          };
        });
        setProducts(normalized.filter((product) => product.id));
      } catch {
        if (!cancelled) {
          setProducts([]);
        }
      }
    };
    fetchProducts();
    return () => {
      cancelled = true;
    };
  }, []);

  // Generate slug from name
  const generatedSlug = useMemo(() => {
    if (formData.name) {
      const campaignsArr = campaigns || [];
      const existingCampaigns = isEdit
        ? campaignsArr.filter((c) => c._id !== campaign._id)
        : campaignsArr;
      return generateSlug(formData.name, existingCampaigns);
    }
    return "";
  }, [formData.name, isEdit, campaign, campaigns]);

  // Update slug when name changes (if slug is empty or matches old generated slug)
  useEffect(() => {
    if (
      formData.name &&
      (!formData.slug ||
        formData.slug === generateSlug(campaign?.name || "", []))
    ) {
      setFormData((prev) => ({
        ...prev,
        slug: generatedSlug,
      }));
    }
  }, [formData.name, generatedSlug, campaign]);

  useEffect(() => {
    if (campaign) {
      setFormData({
        name: campaign.name || "",
        type: campaign.type || "flash_sale",
        description: campaign.description || "",
        discountType: campaign.discountType || "percentage",
        discountValue: campaign.discountValue || "",
        startDate: campaign.startDate ? campaign.startDate.split("T")[0] : "",
        endDate: campaign.endDate ? campaign.endDate.split("T")[0] : "",
        productIds: Array.isArray(campaign.productIds)
          ? campaign.productIds.map((id) => String(id))
          : [],
        isActive: campaign.isActive !== undefined ? campaign.isActive : true,
        slug: campaign.slug || "",
        autoCreateBanner:
          campaign.autoCreateBanner !== undefined
            ? campaign.autoCreateBanner
            : true,
        pageConfig: campaign.pageConfig || {
          showCountdown: true,
          countdownType: "campaign_end",
          viewModes: ["grid", "list"],
          defaultViewMode: "grid",
          enableFilters: true,
          enableSorting: true,
          productsPerPage: 12,
          showStats: true,
        },
        bannerConfig: campaign.bannerConfig
          ? {
            ...campaign.bannerConfig,
            // Detect if image is base64 (custom uploaded image)
            customImage:
              campaign.bannerConfig.image &&
                campaign.bannerConfig.image.startsWith("data:image/")
                ? true
                : campaign.bannerConfig.customImage || false,
          }
          : {
            title: "",
            subtitle: "",
            image: "",
            customImage: false,
          },
      });
    } else {
      // Set default dates
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      setFormData((prev) => ({
        ...prev,
        startDate: today.toISOString().split("T")[0],
        endDate: tomorrow.toISOString().split("T")[0],
      }));
    }
  }, [campaign]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    // Handle nested pageConfig updates
    if (name.startsWith("pageConfig.")) {
      const configKey = name.split(".")[1];
      setFormData({
        ...formData,
        pageConfig: {
          ...formData.pageConfig,
          [configKey]:
            type === "checkbox"
              ? checked
              : type === "number"
                ? parseInt(value)
                : value,
        },
      });
    }
    // Handle nested bannerConfig updates
    else if (name.startsWith("bannerConfig.")) {
      const configKey = name.split(".")[1];
      setFormData({
        ...formData,
        bannerConfig: {
          ...formData.bannerConfig,
          [configKey]: value,
        },
      });
    }
    // Handle viewModes array
    else if (name === "viewMode") {
      const viewModes = formData.pageConfig.viewModes || [];
      const newViewModes = checked
        ? [...viewModes, value]
        : viewModes.filter((m) => m !== value);
      setFormData({
        ...formData,
        pageConfig: {
          ...formData.pageConfig,
          viewModes: newViewModes,
        },
      });
    } else {
      setFormData({
        ...formData,
        [name]:
          type === "checkbox"
            ? checked
            : type === "number"
              ? parseFloat(value)
              : value,
      });
    }
  };

  // Filter products based on search, category, brand, and stock
  const filteredProducts = useMemo(() => {
    let filtered = products;

    // Search filter
    if (productSearchQuery) {
      filtered = filtered.filter((product) =>
        product.name.toLowerCase().includes(productSearchQuery.toLowerCase())
      );
    }

    // Category filter - include products from parent category and all its subcategories
    if (selectedProductCategory !== "all") {
      const parentCategoryId = String(selectedProductCategory);
      // Get all subcategories for this parent category
      const subcategories = getCategoriesByParent(parentCategoryId);
      const allCategoryIds = [
        parentCategoryId,
        ...subcategories.map((cat) => String(cat.id)),
      ];

      filtered = filtered.filter((product) =>
        allCategoryIds.includes(String(product.categoryId))
      );
    }

    // Brand filter
    if (selectedProductBrand !== "all") {
      filtered = filtered.filter(
        (product) => String(product.brandId) === String(selectedProductBrand)
      );
    }

    // Stock filter
    if (selectedProductStock !== "all") {
      filtered = filtered.filter(
        (product) => product.stock === selectedProductStock
      );
    }

    return filtered;
  }, [
    products,
    productSearchQuery,
    selectedProductCategory,
    selectedProductBrand,
    selectedProductStock,
  ]);

  // Paginated products
  const paginatedProducts = useMemo(() => {
    const startIndex = (productPage - 1) * productsPerPage;
    const endIndex = startIndex + productsPerPage;
    return filteredProducts.slice(startIndex, endIndex);
  }, [filteredProducts, productPage, productsPerPage]);

  const totalProductPages = Math.ceil(
    filteredProducts.length / productsPerPage
  );

  // Reset page when filters change
  useEffect(() => {
    setProductPage(1);
  }, [
    productSearchQuery,
    selectedProductCategory,
    selectedProductBrand,
    selectedProductStock,
  ]);

  const handleProductToggle = (productId) => {
    const normalizedId = String(productId);
    setFormData({
      ...formData,
      productIds: formData.productIds.includes(normalizedId)
        ? formData.productIds.filter((id) => String(id) !== normalizedId)
        : [...formData.productIds, normalizedId],
    });
  };

  // Select all filtered products
  const handleSelectAllFiltered = () => {
    const filteredIds = filteredProducts.map((p) => String(p.id));
    const allSelected = filteredIds.every((id) =>
      formData.productIds.map(String).includes(id)
    );

    if (allSelected) {
      // Deselect all filtered
      setFormData({
        ...formData,
        productIds: formData.productIds.filter(
          (id) => !filteredIds.includes(String(id))
        ),
      });
    } else {
      // Select all filtered
      const newIds = [...new Set([...formData.productIds.map(String), ...filteredIds])];
      setFormData({
        ...formData,
        productIds: newIds,
      });
    }
  };

  // Clear all filters
  const handleClearFilters = () => {
    setProductSearchQuery("");
    setSelectedProductCategory("all");
    setSelectedProductBrand("all");
    setSelectedProductStock("all");
    setProductPage(1);
  };

  // Check if all filtered products are selected
  const allFilteredSelected = useMemo(() => {
    if (filteredProducts.length === 0) return false;
    const selectedIds = formData.productIds.map(String);
    return filteredProducts.every((p) => selectedIds.includes(String(p.id)));
  }, [filteredProducts, formData.productIds]);

  // Handle custom banner image upload
  const handleBannerImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB");
      return;
    }

    setIsUploadingBannerImage(true);
    try {
      const response = await uploadAdminImage(file, "campaigns");
      const imageUrl = response?.data?.url;
      if (!imageUrl) {
        toast.error("Banner image upload failed");
        return;
      }
      setFormData((prev) => ({
        ...prev,
        bannerConfig: {
          ...prev.bannerConfig,
          image: imageUrl,
          customImage: true,
        },
      }));
      toast.success("Banner image uploaded successfully");
    } catch (error) {
      // Error toast handled by api interceptor
    } finally {
      setIsUploadingBannerImage(false);
      e.target.value = "";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    if (!formData.startDate || !formData.endDate) {
      toast.error("Start and end dates are required");
      return;
    }
    if (new Date(formData.startDate) >= new Date(formData.endDate)) {
      toast.error("End date must be after start date");
      return;
    }
    if (formData.productIds.length === 0) {
      toast.error("Please select at least one product");
      return;
    }

    try {
      const startDate = new Date(formData.startDate);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(formData.endDate);
      endDate.setHours(23, 59, 59, 999);

      const campaignData = {
        ...formData,
        slug: formData.slug || generatedSlug,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        status: formData.isActive !== false ? 'active' : 'draft',
        discountValue: parseFloat(formData.discountValue),
        productIds: formData.productIds.map((id) => String(id)),
      };

      if (isEdit) {
        await updateCampaign(campaign._id, campaignData);
      } else {
        await createCampaign(campaignData);
      }
      onSave?.();
      onClose();
    } catch (error) {
      // Error handled in store
    }
  };

  return (
    <AnimatePresence>
      <>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 z-[10001]"
          style={{ zIndex: 10001 }}
        />

        {/* Modal Content - Mobile: Slide up from bottom, Desktop: Center with scale */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 z-[10001] flex ${isAppRoute ? "items-start pt-[10px]" : "items-end"
            } sm:items-center justify-center p-4 pointer-events-none`}
          style={{ zIndex: 10001 }}>
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
            className={`bg-white ${isAppRoute ? "rounded-b-3xl" : "rounded-t-3xl"
              } sm:rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto scrollbar-admin pointer-events-auto pb-20 sm:pb-6 -mb-[30px] sm:mb-0`}
            style={{ willChange: "transform", zIndex: 10001 }}>
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between z-10">
              <h2 className="text-2xl font-bold text-gray-800">
                {isEdit ? "Edit Campaign" : "Create Campaign"}
              </h2>
              <Button
                onClick={onClose}
                variant="icon"
                icon={FiX}
                className="text-gray-600"
              />
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Basic Information */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Basic Information
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Campaign Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="e.g., Summer Sale 2024"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Campaign Type <span className="text-red-500">*</span>
                    </label>
                    <AnimatedSelect
                      name="type"
                      value={formData.type}
                      onChange={handleChange}
                      required
                      options={[
                        { value: "flash_sale", label: "Flash Sale" },
                        { value: "daily_deal", label: "Daily Deal" },
                        { value: "special_offer", label: "Special Offer" },
                        { value: "festival", label: "Festival Offer" },
                      ]}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Description
                    </label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Campaign description..."
                    />
                  </div>

                  {/* Slug and Route Preview */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        URL Slug
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          name="slug"
                          value={formData.slug}
                          onChange={handleChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="Auto-generated from name"
                        />
                        <FiLink className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        URL-friendly version of campaign name
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Page URL
                      </label>
                      <div className="relative">
                        <div className="w-full px-4 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-600 flex items-center gap-2">
                          <FiEye className="text-gray-400" />
                          <span>
                            /sale/
                            {formData.slug || generatedSlug || "campaign-slug"}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Preview of the campaign page URL
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Discount Settings */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Discount Settings
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Discount Type <span className="text-red-500">*</span>
                    </label>
                    <AnimatedSelect
                      name="discountType"
                      value={formData.discountType}
                      onChange={handleChange}
                      required
                      options={[
                        { value: "percentage", label: "Percentage" },
                        { value: "fixed", label: "Fixed Amount" },
                      ]}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Discount Value <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      name="discountValue"
                      value={formData.discountValue}
                      onChange={handleChange}
                      required
                      min="0"
                      step={
                        formData.discountType === "percentage" ? "1" : "0.01"
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder={
                        formData.discountType === "percentage"
                          ? "e.g., 20"
                          : "e.g., 10.00"
                      }
                    />
                    {formData.discountType === "percentage" && (
                      <p className="text-xs text-gray-500 mt-1">
                        Enter percentage (e.g., 20 for 20%)
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Schedule */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Schedule
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Start Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      name="startDate"
                      value={formData.startDate}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      End Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      name="endDate"
                      value={formData.endDate}
                      onChange={handleChange}
                      required
                      min={formData.startDate}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
              </div>

              {/* Products */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-800">
                    Select Products
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">
                      {formData.productIds.length} selected
                    </span>
                    {filteredProducts.length > 0 && (
                      <button
                        type="button"
                        onClick={handleSelectAllFiltered}
                        className="flex items-center gap-1 px-3 py-1 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
                        {allFilteredSelected ? (
                          <>
                            <FiCheckSquare className="text-base" />
                            <span>Deselect All</span>
                          </>
                        ) : (
                          <>
                            <FiSquare className="text-base" />
                            <span>Select All ({filteredProducts.length})</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Search and Filters */}
                <div className="space-y-3 mb-4">
                  {/* Search Bar */}
                  <div className="relative">
                    <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={productSearchQuery}
                      onChange={(e) => setProductSearchQuery(e.target.value)}
                      placeholder="Search products by name..."
                      className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    {productSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setProductSearchQuery("")}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        <FiXCircle />
                      </button>
                    )}
                  </div>

                  {/* Filter Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {/* Category Filter - Only Parent Categories */}
                    <AnimatedSelect
                      value={selectedProductCategory}
                      onChange={(e) =>
                        setSelectedProductCategory(e.target.value)
                      }
                      options={[
                        { value: "all", label: "All Categories" },
                        ...getRootCategories()
                          .filter((cat) => cat.isActive !== false)
                          .map((cat) => ({
                            value: String(cat.id),
                            label: cat.name,
                          })),
                      ]}
                    />

                    {/* Brand Filter */}
                    <AnimatedSelect
                      value={selectedProductBrand}
                      onChange={(e) => setSelectedProductBrand(e.target.value)}
                      options={[
                        { value: "all", label: "All Brands" },
                        ...(brands || [])
                          .filter((brand) => brand.isActive !== false)
                          .map((brand) => ({
                            value: String(brand.id),
                            label: brand.name,
                          })),
                      ]}
                    />

                    {/* Stock Filter */}
                    <AnimatedSelect
                      value={selectedProductStock}
                      onChange={(e) => setSelectedProductStock(e.target.value)}
                      options={[
                        { value: "all", label: "All Stock" },
                        { value: "in_stock", label: "In Stock" },
                        { value: "low_stock", label: "Low Stock" },
                        { value: "out_of_stock", label: "Out of Stock" },
                      ]}
                    />
                  </div>

                  {/* Clear Filters Button */}
                  {(productSearchQuery ||
                    selectedProductCategory !== "all" ||
                    selectedProductBrand !== "all" ||
                    selectedProductStock !== "all") && (
                      <button
                        type="button"
                        onClick={handleClearFilters}
                        className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800">
                        <FiXCircle className="text-xs" />
                        <span>Clear all filters</span>
                      </button>
                    )}

                  {/* Results Count */}
                  <div className="text-sm text-gray-600">
                    Showing {paginatedProducts.length} of{" "}
                    {filteredProducts.length} products
                    {filteredProducts.length !== products.length &&
                      ` (${products.length} total)`}
                  </div>
                </div>

                {/* Products List */}
                <div className="border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto scrollbar-admin">
                  {filteredProducts.length === 0 ? (
                    <div className="text-center py-8">
                      <FiSearch className="text-4xl text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-500">No products found</p>
                      {(productSearchQuery ||
                        selectedProductCategory !== "all" ||
                        selectedProductBrand !== "all" ||
                        selectedProductStock !== "all") && (
                          <button
                            type="button"
                            onClick={handleClearFilters}
                            className="mt-2 text-sm text-primary-600 hover:text-primary-700">
                            Clear filters to see all products
                          </button>
                        )}
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {paginatedProducts.map((product) => (
                          <label
                            key={product.id}
                            className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer border border-transparent hover:border-gray-200 transition-colors">
                            <input
                              type="checkbox"
                              checked={formData.productIds.includes(product.id)}
                              onChange={() => handleProductToggle(product.id)}
                              className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 flex-shrink-0"
                            />
                            <img
                              src={product.image}
                              alt={product.name}
                              className="w-12 h-12 object-cover rounded-lg flex-shrink-0"
                              onError={(e) => {
                                e.currentTarget.onerror = null;
                                e.currentTarget.src = CAMPAIGN_PRODUCT_PLACEHOLDER;
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-800 truncate">
                                {product.name}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <p className="text-sm font-medium text-gray-700">
                                  {formatPrice(product.price)}
                                </p>
                                {product.originalPrice &&
                                  product.originalPrice > product.price && (
                                    <p className="text-xs text-gray-400 line-through">
                                      {formatPrice(product.originalPrice)}
                                    </p>
                                  )}
                                {product.stock && (
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded ${product.stock === "in_stock"
                                      ? "bg-green-100 text-green-700"
                                      : product.stock === "low_stock"
                                        ? "bg-yellow-100 text-yellow-700"
                                        : "bg-red-100 text-red-700"
                                      }`}>
                                    {product.stock.replace("_", " ")}
                                  </span>
                                )}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>

                      {/* Pagination */}
                      {totalProductPages > 1 && (
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                          <button
                            type="button"
                            onClick={() =>
                              setProductPage((p) => Math.max(1, p - 1))
                            }
                            disabled={productPage === 1}
                            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed">
                            Previous
                          </button>
                          <span className="text-sm text-gray-600">
                            Page {productPage} of {totalProductPages}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setProductPage((p) =>
                                Math.min(totalProductPages, p + 1)
                              )
                            }
                            disabled={productPage === totalProductPages}
                            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed">
                            Next
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Selected Products Summary */}
                {formData.productIds.length > 0 && (
                  <div className="mt-3 p-3 bg-primary-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-primary-800">
                        {formData.productIds.length} product(s) selected
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({ ...formData, productIds: [] })
                        }
                        className="text-xs text-primary-600 hover:text-primary-700">
                        Clear selection
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Page Options */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Page Options
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="flex items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          name="pageConfig.showCountdown"
                          checked={formData.pageConfig.showCountdown}
                          onChange={handleChange}
                          className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm font-semibold text-gray-700">
                          Show Countdown Timer
                        </span>
                      </label>
                      {formData.pageConfig.showCountdown && (
                        <div className="mt-2">
                          <label className="block text-xs text-gray-600 mb-1">
                            Countdown Type
                          </label>
                          <AnimatedSelect
                            name="pageConfig.countdownType"
                            value={formData.pageConfig.countdownType}
                            onChange={handleChange}
                            options={[
                              { value: "campaign_end", label: "Campaign End" },
                              { value: "daily_reset", label: "Daily Reset" },
                            ]}
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="flex items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          name="pageConfig.showStats"
                          checked={formData.pageConfig.showStats}
                          onChange={handleChange}
                          className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm font-semibold text-gray-700">
                          Show Stats Banner
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        View Modes
                      </label>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            name="viewMode"
                            value="grid"
                            checked={formData.pageConfig.viewModes.includes(
                              "grid"
                            )}
                            onChange={handleChange}
                            className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-700">
                            Grid View
                          </span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            name="viewMode"
                            value="list"
                            checked={formData.pageConfig.viewModes.includes(
                              "list"
                            )}
                            onChange={handleChange}
                            className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-700">
                            List View
                          </span>
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Default View Mode
                      </label>
                      <AnimatedSelect
                        name="pageConfig.defaultViewMode"
                        value={formData.pageConfig.defaultViewMode}
                        onChange={handleChange}
                        options={formData.pageConfig.viewModes.map((mode) => ({
                          value: mode,
                          label: mode.charAt(0).toUpperCase() + mode.slice(1),
                        }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="flex items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          name="pageConfig.enableFilters"
                          checked={formData.pageConfig.enableFilters}
                          onChange={handleChange}
                          className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm font-semibold text-gray-700">
                          Enable Filters
                        </span>
                      </label>
                    </div>
                    <div>
                      <label className="flex items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          name="pageConfig.enableSorting"
                          checked={formData.pageConfig.enableSorting}
                          onChange={handleChange}
                          className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm font-semibold text-gray-700">
                          Enable Sorting
                        </span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Products Per Page
                    </label>
                    <input
                      type="number"
                      name="pageConfig.productsPerPage"
                      value={formData.pageConfig.productsPerPage}
                      onChange={handleChange}
                      min="6"
                      max="48"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
              </div>

              {/* Banner Settings */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Banner Settings
                </h3>
                <div className="space-y-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="autoCreateBanner"
                      checked={formData.autoCreateBanner}
                      onChange={handleChange}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                    />
                    <span className="text-sm font-semibold text-gray-700">
                      Auto-create Banner
                    </span>
                  </label>

                  {formData.autoCreateBanner && (
                    <div className="space-y-4 pl-6 border-l-2 border-gray-200">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Banner Title (Optional - defaults to campaign name)
                        </label>
                        <input
                          type="text"
                          name="bannerConfig.title"
                          value={formData.bannerConfig.title}
                          onChange={handleChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="Leave empty to use campaign name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Banner Subtitle (Optional - defaults to discount info)
                        </label>
                        <input
                          type="text"
                          name="bannerConfig.subtitle"
                          value={formData.bannerConfig.subtitle}
                          onChange={handleChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                          placeholder="Leave empty for auto-generated subtitle"
                        />
                      </div>

                      {/* Banner Image Options */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Banner Image
                        </label>
                        <div className="space-y-3">
                          {/* Option 1: Upload Custom Image */}
                          <div>
                            <label className="block text-xs text-gray-600 mb-2">
                              Option 1: Upload Custom Image
                            </label>
                            <div className="relative">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleBannerImageUpload}
                                className="hidden"
                                id="banner-image-upload"
                                disabled={isUploadingBannerImage}
                              />
                              <label
                                htmlFor="banner-image-upload"
                                className={`flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg transition-colors bg-white ${isUploadingBannerImage ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-primary-500 hover:bg-primary-50"}`}>
                                <FiUpload className="text-lg text-primary-600" />
                                <span className="text-sm font-medium text-gray-700">
                                  {isUploadingBannerImage
                                    ? "Uploading Banner Image..."
                                    : formData.bannerConfig.image &&
                                    formData.bannerConfig.customImage
                                    ? "Change Custom Banner Image"
                                    : "Upload Custom Banner Image"}
                                </span>
                              </label>
                            </div>
                            {/* Preview for custom uploaded image */}
                            {formData.bannerConfig.image &&
                              formData.bannerConfig.customImage && (
                                <div className="mt-3">
                                  <div className="relative inline-block">
                                    <img
                                      src={formData.bannerConfig.image}
                                      alt="Banner preview"
                                      className="w-full max-w-xs h-32 object-cover rounded-lg border border-gray-200"
                                      onError={(e) => {
                                        e.target.style.display = "none";
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFormData({
                                          ...formData,
                                          bannerConfig: {
                                            ...formData.bannerConfig,
                                            image: "",
                                            customImage: false,
                                          },
                                        });
                                      }}
                                      className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                      title="Remove image">
                                      <FiX className="text-sm" />
                                    </button>
                                  </div>
                                  <p className="text-xs text-gray-500 mt-1">
                                    Custom uploaded image
                                  </p>
                                </div>
                              )}

                            {/* Preview for URL image */}
                            {formData.bannerConfig.image &&
                              !formData.bannerConfig.customImage &&
                              !formData.bannerConfig.image.startsWith(
                                "data:"
                              ) && (
                                <div className="mt-3">
                                  <div className="relative inline-block">
                                    <img
                                      src={formData.bannerConfig.image}
                                      alt="Banner preview"
                                      className="w-full max-w-xs h-32 object-cover rounded-lg border border-gray-200"
                                      onError={(e) => {
                                        e.target.parentElement.style.display =
                                          "none";
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setFormData({
                                          ...formData,
                                          bannerConfig: {
                                            ...formData.bannerConfig,
                                            image: "",
                                          },
                                        });
                                      }}
                                      className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                      title="Remove image">
                                      <FiX className="text-sm" />
                                    </button>
                                  </div>
                                  <p className="text-xs text-gray-500 mt-1">
                                    Image from URL
                                  </p>
                                </div>
                              )}
                          </div>

                          {/* Option 2: Image URL */}
                          <div>
                            <label className="block text-xs text-gray-600 mb-2">
                              Option 2: Use Image URL (Optional - defaults to
                              promotional image)
                            </label>
                            <div className="relative">
                              <FiImage className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                              <input
                                type="text"
                                name="bannerConfig.image"
                                value={
                                  formData.bannerConfig.customImage
                                    ? ""
                                    : formData.bannerConfig.image
                                }
                                onChange={(e) => {
                                  setFormData({
                                    ...formData,
                                    bannerConfig: {
                                      ...formData.bannerConfig,
                                      image: e.target.value,
                                      customImage: false,
                                    },
                                  });
                                }}
                                disabled={formData.bannerConfig.customImage}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                placeholder="data/promotional/beauty.jpg"
                              />
                            </div>
                            {formData.bannerConfig.image &&
                              !formData.bannerConfig.customImage && (
                                <p className="text-xs text-gray-500 mt-1">
                                  Leave empty to use default promotional image
                                </p>
                              )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Settings */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-4">
                  Settings
                </h3>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleChange}
                    className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm font-semibold text-gray-700">
                    Active
                  </span>
                </label>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-4 pt-4 border-t border-gray-200">
                <Button type="button" onClick={onClose} variant="secondary">
                  Cancel
                </Button>
                <Button type="submit" variant="primary" icon={FiSave}>
                  {isEdit ? "Update Campaign" : "Create Campaign"}
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      </>
    </AnimatePresence>
  );
};

export default CampaignForm;
