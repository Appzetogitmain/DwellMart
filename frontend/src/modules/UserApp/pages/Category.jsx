import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FiFilter, FiArrowLeft, FiGrid, FiList, FiX, FiSearch } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import MobileLayout from "../components/Layout/MobileLayout";
import ProductCard from "../../../shared/components/ProductCard";
import ProductListItem from "../components/Mobile/ProductListItem";
import { getCatalogProducts } from "../data/catalogData";
import { categories as fallbackCategories } from "../../../data/categories";
import { useCategoryStore } from "../../../shared/store/categoryStore";
import { useSettingsStore } from "../../../shared/store/settingsStore";
import PageTransition from "../../../shared/components/PageTransition";
import useInfiniteScroll from "../../../shared/hooks/useInfiniteScroll";
import LazyImage from "../../../shared/components/LazyImage";
import { getPlaceholderImage } from "../../../shared/utils/helpers";
import api from "../../../shared/utils/api";
import { usePageTranslation } from "../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../hooks/useDynamicTranslation";
import ProductGridSkeleton from "../../../shared/components/Skeletons/ProductGridSkeleton";
import PageSkeleton from "../../../shared/components/Skeletons/PageSkeleton";

const normalizeId = (value) => String(value ?? "").trim();

const getParentId = (category) => {
  const parent = category?.parentId;
  if (!parent) return null;
  if (typeof parent === "object") {
    return normalizeId(parent?._id ?? parent?.id ?? "");
  }
  return normalizeId(parent);
};

const normalizeProduct = (raw) => {
  const vendorObj =
    raw?.vendor && typeof raw.vendor === "object"
      ? raw.vendor
      : raw?.vendorId && typeof raw.vendorId === "object"
        ? raw.vendorId
        : null;
  const brandObj =
    raw?.brand && typeof raw.brand === "object"
      ? raw.brand
      : raw?.brandId && typeof raw.brandId === "object"
        ? raw.brandId
        : null;
  const categoryObj =
    raw?.category && typeof raw.category === "object"
      ? raw.category
      : raw?.categoryId && typeof raw.categoryId === "object"
        ? raw.categoryId
        : null;

  const id = normalizeId(raw?.id || raw?._id);

  return {
    ...raw,
    id,
    _id: id,
    vendorId: normalizeId(vendorObj?._id || vendorObj?.id || raw?.vendorId),
    vendorName: raw?.vendorName || vendorObj?.storeName || vendorObj?.name || "",
    brandId: normalizeId(brandObj?._id || brandObj?.id || raw?.brandId),
    brandName: raw?.brandName || brandObj?.name || "",
    categoryId: normalizeId(categoryObj?._id || categoryObj?.id || raw?.categoryId),
    categoryName: raw?.categoryName || categoryObj?.name || "",
    image: raw?.image || raw?.images?.[0] || "",
    images: Array.isArray(raw?.images)
      ? raw.images
      : raw?.image
        ? [raw.image]
        : [],
    price: Number(raw?.price) || 0,
    rating: Number(raw?.rating) || 0,
  };
};

const MobileCategory = () => {
  const { getTranslatedText: t } = usePageTranslation([
    "Category Not Found",
    "Go Back Home",
    "Search in category...",
    "available",
    "Filters",
    "Switch Category",
    "Price Range",
    "Min Price",
    "Max Price",
    "Minimum Rating",
    "Stars",
    "Clear All",
    "Apply Filters",
    "No products found",
    "There are no products available in this category at the moment.",
    "Loading more products...",
    "Loading...",
    "Load More",
    "product",
    "products"
  ]);

  const { translateObject, translateArray } = useDynamicTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const categoryId = normalizeId(id);
  const { categories, initialize, getCategoryById } = useCategoryStore();
  const { settings, initialize: initializeSettings } = useSettingsStore();
  const wholesaleMarketplaceEnabled =
    settings?.features?.wholesaleMarketplaceEnabled === true;

  // Initialize store on mount
  useEffect(() => {
    initialize();
    initializeSettings();
  }, [initialize, initializeSettings]);

  // Get category from store or fallback
  const rawCategory = useMemo(() => {
    const cat = getCategoryById(categoryId);
    return (
      cat ||
      fallbackCategories.find((fallbackCat) => {
        const fallbackId = normalizeId(fallbackCat.id);
        return (
          fallbackId === categoryId ||
          fallbackCat.name?.toLowerCase() === categoryId.toLowerCase()
        );
      })
    );
  }, [categoryId, categories, getCategoryById]);

  const [category, setCategory] = useState(null);
  useEffect(() => {
    const translateCat = async () => {
      if (rawCategory) {
        setIsTranslatingCategory(true);
        const translated = await translateObject(rawCategory, ['name', 'description']);
        setCategory(translated);
        setIsTranslatingCategory(false);
      }
    };
    translateCat();
  }, [rawCategory, translateObject]);

  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("grid"); // 'grid' or 'list'
  const [categoryProductsFeed, setCategoryProductsFeed] = useState([]);
  const [filters, setFilters] = useState({
    minPrice: "",
    maxPrice: "",
    minRating: "",
    sellingChannel: "",
    bulkDiscount: false,
    hasMoq: false,
  });
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isTranslatingCategory, setIsTranslatingCategory] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchCategoryProducts = async () => {
      if (!categoryId) {
        if (!cancelled) {
          setCategoryProductsFeed([]);
          setIsLoadingInitial(false);
        }
        return;
      }

      setIsLoadingInitial(true);
      try {
        const response = await api.get("/products", {
          params: {
            category: categoryId,
            page: 1,
            limit: 200,
            sort: "newest",
          },
        });
        const payload = response?.data ?? response;
        const products = Array.isArray(payload?.products) ? payload.products : [];
        if (cancelled) return;

        const normalized = products.map(normalizeProduct).filter((product) => product.id);
        const translated = await translateArray(normalized, ['name', 'description', 'unit', 'categoryName', 'brandName', 'vendorName']);
        setCategoryProductsFeed(translated);
      } catch {
        if (cancelled) return;
        const fallback = getCatalogProducts().filter((product) => {
          const productCategoryId = normalizeId(product.categoryId);
          const productCategory = categories.find(
            (cat) => normalizeId(cat.id) === productCategoryId
          );
          const productParentId = getParentId(productCategory);
          return productCategoryId === categoryId || productParentId === categoryId;
        });
        setCategoryProductsFeed(fallback);
      } finally {
        if (!cancelled) {
          setIsLoadingInitial(false);
        }
      }
    };

    fetchCategoryProducts();
    return () => {
      cancelled = true;
    };
  }, [categoryId, categories, translateArray]);

  const [translatedRootCategories, setTranslatedRootCategories] = useState([]);
  useEffect(() => {
    const translateRoots = async () => {
      const roots = categories.filter(
        (cat) => !getParentId(cat) && cat.isActive !== false
      );
      const target = roots.length ? roots : fallbackCategories;
      const translated = await translateArray(target, ['name', 'description']);
      setTranslatedRootCategories(translated);
    };
    translateRoots();
  }, [categories, translateArray]);

  const categoryProducts = useMemo(() => {
    if (!category) return [];
    let result = [...categoryProductsFeed];

    if (searchQuery) {
      result = result.filter((product) =>
        product.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (filters.minPrice) {
      result = result.filter(
        (product) => product.price >= parseFloat(filters.minPrice)
      );
    }
    if (filters.maxPrice) {
      result = result.filter(
        (product) => product.price <= parseFloat(filters.maxPrice)
      );
    }
    if (filters.minRating) {
      result = result.filter(
        (product) => product.rating >= parseFloat(filters.minRating)
      );
    }
    // Wholesale facets, filtered client-side to match this page's existing
    // in-memory filtering architecture.
    if (filters.sellingChannel === "wholesale") {
      result = result.filter((product) => product.wholesaleEnabled === true);
    } else if (filters.sellingChannel === "retail") {
      result = result.filter((product) => product.retailEnabled !== false);
    }
    if (filters.bulkDiscount) {
      result = result.filter(
        (product) =>
          product.wholesaleEnabled === true &&
          Array.isArray(product.wholesale?.priceTiers) &&
          product.wholesale.priceTiers.length > 0
      );
    }
    if (filters.hasMoq) {
      result = result.filter(
        (product) =>
          product.wholesaleEnabled === true && product.wholesale?.moqEnabled === true
      );
    }

    return result;
  }, [category, categoryProductsFeed, filters, searchQuery]);

  const { displayedItems, hasMore, isLoading, loadMore, loadMoreRef } =
    useInfiniteScroll(categoryProducts, 10, 10);

  const filterButtonRef = useRef(null);

  const handleFilterChange = (name, value) => {
    setFilters({ ...filters, [name]: value });
  };

  const clearFilters = () => {
    setFilters({
      minPrice: "",
      maxPrice: "",
      minRating: "",
      sellingChannel: "",
      bulkDiscount: false,
      hasMoq: false,
    });
    setSearchQuery("");
  };

  const toggleWholesaleFilter = (name) =>
    setFilters((prev) => ({ ...prev, [name]: !prev[name] }));
  const setChannelFilter = (channel) =>
    setFilters((prev) => ({
      ...prev,
      sellingChannel: prev.sellingChannel === channel ? "" : channel,
    }));

  // Check if any filter is active
  const hasActiveFilters =
    filters.minPrice ||
    filters.maxPrice ||
    filters.minRating ||
    filters.sellingChannel ||
    filters.bulkDiscount ||
    filters.hasMoq;

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        showFilters &&
        filterButtonRef.current &&
        !filterButtonRef.current.contains(event.target) &&
        !event.target.closest(".filter-dropdown")
      ) {
        setShowFilters(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [showFilters]);

  const { isLoading: isStoreLoading } = useCategoryStore();

  if (!category) {
    if (isStoreLoading || isTranslatingCategory) {
      return (
        <PageTransition>
          <MobileLayout showBottomNav={false} showCartBar={false}>
            <PageSkeleton />
          </MobileLayout>
        </PageTransition>
      );
    }

    return (
      <PageTransition>
        <MobileLayout showBottomNav={false} showCartBar={false}>
          <div className="flex items-center justify-center min-h-[60vh] px-4">
            <div className="text-center">
              <h2 className="text-xl font-bold text-gray-800 mb-4">
                {t('Category Not Found')}
              </h2>
              <button
                onClick={() => navigate("/")}
                className="gradient-green text-white px-6 py-3 rounded-xl font-semibold">
                {t('Go Back Home')}
              </button>
            </div>
          </div>
        </MobileLayout>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={true}>
        <div className="w-full pb-24">
          {/* Header */}
          <div className="px-4 py-4 bg-white border-b border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <FiArrowLeft className="text-xl text-gray-700" />
              </button>
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                <LazyImage
                  src={category.image}
                  alt={category.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.src = getPlaceholderImage(48, 48, "Category");
                  }}
                />
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-gray-800">
                  {category.name}
                </h1>
                <div className="relative mt-1">
                  <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                  <input
                    type="text"
                    placeholder={t("Search in category...")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-10 py-1.5 bg-gray-100 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 p-1 hover:bg-gray-200 rounded-full transition-colors"
                    >
                      <FiX className="text-xs" />
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-gray-500 mt-1">
                  {categoryProducts.length} {categoryProducts.length !== 1 ? t("products") : t("product")} {t('available')}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                {/* View Toggle Buttons */}
                <div className="flex items-center bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode("list")}
                    className={`p-1.5 rounded transition-colors ${viewMode === "list"
                      ? "bg-white text-primary-600 shadow-sm"
                      : "text-gray-600"
                      }`}>
                    <FiList className="text-lg" />
                  </button>
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-1.5 rounded transition-colors ${viewMode === "grid"
                      ? "bg-white text-primary-600 shadow-sm"
                      : "text-gray-600"
                      }`}>
                    <FiGrid className="text-lg" />
                  </button>
                </div>
                <div ref={filterButtonRef} className="relative">
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`p-2.5 glass-card rounded-xl hover:bg-white/80 transition-colors ${showFilters ? "bg-white/80" : ""
                      }`}>
                    <FiFilter
                      className={`text-lg transition-colors ${hasActiveFilters ? "text-blue-600" : "text-gray-600"
                        }`}
                    />
                  </button>

                  {/* Filter Dropdown */}
                  <AnimatePresence>
                    {showFilters && (
                      <>
                        {/* Backdrop */}
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          onClick={() => setShowFilters(false)}
                          className="fixed inset-0 bg-black/20 z-[10000]"
                        />
                        <motion.div
                          initial={{ opacity: 0, y: -10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -10, scale: 0.95 }}
                          transition={{
                            type: "spring",
                            stiffness: 300,
                            damping: 30,
                          }}
                          className="filter-dropdown absolute right-0 top-full w-56 bg-white rounded-xl shadow-2xl border border-gray-200 z-[10001] overflow-hidden"
                          style={{ marginTop: "-50px" }}>
                          {/* Header */}
                          <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-200 bg-gray-50">
                            <div className="flex items-center gap-1.5">
                              <FiFilter className="text-sm text-gray-700" />
                              <h3 className="text-sm font-bold text-gray-800">
                                {t('Filters')}
                              </h3>
                            </div>
                            <button
                              onClick={() => setShowFilters(false)}
                              className="p-0.5 hover:bg-gray-200 rounded-full transition-colors">
                              <FiX className="text-sm text-gray-600" />
                            </button>
                          </div>

                          {/* Filter Content */}
                          <div className="max-h-[50vh] overflow-y-auto scrollbar-hide">
                            <div className="p-2 space-y-2">
                              {/* Category Switcher */}
                              <div>
                                <h4 className="font-semibold text-gray-700 mb-1 text-xs">
                                  {t('Switch Category')}
                                </h4>
                                <select
                                  value={categoryId}
                                  onChange={(e) => {
                                    const newId = e.target.value;
                                    if (newId) navigate(`/category/${newId}`);
                                    setShowFilters(false);
                                  }}
                                  className="w-full px-2 py-1.5 rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 text-xs"
                                >
                                  {translatedRootCategories.map((cat) => (
                                    <option key={cat.id} value={normalizeId(cat.id)}>
                                      {cat.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Wholesale facets */}
                              {wholesaleMarketplaceEnabled && (
                                <div>
                                  <h4 className="font-semibold text-gray-700 mb-1 text-xs">
                                    {t('Selling Channel')}
                                  </h4>
                                  <div className="flex flex-wrap gap-1.5">
                                    {[
                                      { key: 'channel-retail', label: t('Retail Only'), active: filters.sellingChannel === 'retail', onClick: () => setChannelFilter('retail') },
                                      { key: 'channel-wholesale', label: t('Wholesale Available'), active: filters.sellingChannel === 'wholesale', onClick: () => setChannelFilter('wholesale') },
                                      { key: 'bulk', label: t('Bulk Discount'), active: filters.bulkDiscount, onClick: () => toggleWholesaleFilter('bulkDiscount') },
                                      { key: 'moq', label: t('MOQ Products'), active: filters.hasMoq, onClick: () => toggleWholesaleFilter('hasMoq') },
                                    ].map((chip) => (
                                      <button
                                        key={chip.key}
                                        type="button"
                                        onClick={chip.onClick}
                                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                                          chip.active
                                            ? "bg-primary-600 text-white border-primary-600"
                                            : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                                        }`}
                                      >
                                        {chip.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Price Range */}
                              <div>
                                <h4 className="font-semibold text-gray-700 mb-1 text-xs">
                                  {t('Price Range')}
                                </h4>
                                <div className="space-y-1.5">
                                  <input
                                    type="number"
                                    placeholder={t("Min Price")}
                                    value={filters.minPrice}
                                    onChange={(e) =>
                                      handleFilterChange(
                                        "minPrice",
                                        e.target.value
                                      )
                                    }
                                    className="w-full px-2 py-1.5 rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 text-xs"
                                  />
                                  <input
                                    type="number"
                                    placeholder={t("Max Price")}
                                    value={filters.maxPrice}
                                    onChange={(e) =>
                                      handleFilterChange(
                                        "maxPrice",
                                        e.target.value
                                      )
                                    }
                                    className="w-full px-2 py-1.5 rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 text-xs"
                                  />
                                </div>
                              </div>

                              {/* Rating Filter */}
                              <div>
                                <h4 className="font-semibold text-gray-700 mb-1 text-xs">
                                  {t('Minimum Rating')}
                                </h4>
                                <div className="space-y-0.5">
                                  {[4, 3, 2, 1].map((rating) => (
                                    <label
                                      key={rating}
                                      className="flex items-center gap-1.5 cursor-pointer p-1 rounded-md hover:bg-gray-50 transition-colors">
                                      <input
                                        type="radio"
                                        name="minRating"
                                        value={rating}
                                        checked={
                                          filters.minRating ===
                                          rating.toString()
                                        }
                                        onChange={(e) =>
                                          handleFilterChange(
                                            "minRating",
                                            e.target.value
                                          )
                                        }
                                        className="w-3 h-3 appearance-none rounded-full border-2 border-gray-300 bg-white checked:bg-white checked:border-primary-500 relative cursor-pointer"
                                        style={{
                                          backgroundImage:
                                            filters.minRating ===
                                              rating.toString()
                                              ? "radial-gradient(circle, #10b981 40%, transparent 40%)"
                                              : "none",
                                        }}
                                      />
                                      <span className="text-xs text-gray-700">
                                        {rating}+ {t('Stars')}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Footer */}
                          <div className="border-t border-gray-200 p-2 bg-gray-50 space-y-1.5">
                            <button
                              onClick={clearFilters}
                              className="w-full py-1.5 bg-gray-200 text-gray-700 rounded-md font-semibold text-xs hover:bg-gray-300 transition-colors">
                              {t('Clear All')}
                            </button>
                            <button
                              onClick={() => setShowFilters(false)}
                              className="w-full py-1.5 gradient-green text-white rounded-md font-semibold text-xs hover:shadow-glow-green transition-all">
                              {t('Apply Filters')}
                            </button>
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>

          {/* Products List */}
          <div className="px-4 py-4">
            {isLoadingInitial ? (
              <ProductGridSkeleton count={8} columns={viewMode === 'grid' ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1'} />
            ) : categoryProducts.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl text-gray-300 mx-auto mb-4">📦</div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">
                  {t('No products found')}
                </h3>
                <p className="text-gray-600">
                  {t('There are no products available in this category at the moment.')}
                </p>
              </div>
            ) : viewMode === "grid" ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-6">
                  {displayedItems.map((product, index) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}>
                      <ProductCard product={product} />
                    </motion.div>
                  ))}
                </div>

                {hasMore && (
                  <div
                    ref={loadMoreRef}
                    className="mt-6 flex flex-col items-center gap-4">
                    {isLoading && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <span className="text-sm">
                          Loading more products...
                        </span>
                      </div>
                    )}
                    <button
                      onClick={loadMore}
                      disabled={isLoading}
                      className="px-6 py-3 gradient-green text-white rounded-xl font-semibold hover:shadow-glow-green transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
                      {isLoading ? "Loading..." : "Load More"}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="space-y-3">
                  {displayedItems.map((product, index) => (
                    <ProductListItem
                      key={product.id}
                      product={product}
                      index={index}
                    />
                  ))}
                </div>

                {hasMore && (
                  <div
                    ref={loadMoreRef}
                    className="mt-6 flex flex-col items-center gap-4">
                    {isLoading && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <span className="text-sm">
                          Loading more products...
                        </span>
                      </div>
                    )}
                    <button
                      onClick={loadMore}
                      disabled={isLoading}
                      className="px-6 py-3 gradient-green text-white rounded-xl font-semibold hover:shadow-glow-green transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
                      {isLoading ? "Loading..." : "Load More"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileCategory;
