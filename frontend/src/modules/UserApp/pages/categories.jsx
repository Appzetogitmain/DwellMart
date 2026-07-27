import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft, FiFilter, FiX, FiSearch } from "react-icons/fi";
import MobileLayout from "../components/Layout/MobileLayout";
import { categories as fallbackCategories } from "../../../data/categories";
import { getCatalogProducts } from "../data/catalogData";
import { useCategoryStore } from "../../../shared/store/categoryStore";
import PageTransition from "../../../shared/components/PageTransition";
import LazyImage from "../../../shared/components/LazyImage";
import ProductCard from "../../../shared/components/ProductCard";
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

const MobileCategories = () => {
  const { getTranslatedText: t } = usePageTranslation([
    "No Categories Available",
    "There are no categories to display at the moment.",
    "product",
    "products",
    "available",
    "Filters",
    "Price Range",
    "Min Price",
    "Max Price",
    "Minimum Rating",
    "Stars",
    "Clear All",
    "Apply Filters",
    "Search in category...",
    "No products found",
    "There are no products available in this category at the moment."
  ]);

  const { translateArray } = useDynamicTranslation();
  const navigate = useNavigate();
  const { categories, initialize, getCategoriesByParent, getRootCategories } =
    useCategoryStore();

  // Initialize store on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Get root categories (categories without parent) and merge with fallback.
  // Backend category image should take priority when present.
  const [translatedRootCategories, setTranslatedRootCategories] = useState([]);
  const [translatedSubcategories, setTranslatedSubcategories] = useState([]);
  const [isTranslatingRoots, setIsTranslatingRoots] = useState(false);
  const [isTranslatingSubs, setIsTranslatingSubs] = useState(false);

  // Translate Root Categories
  useEffect(() => {
    const translateRoots = async () => {
      setIsTranslatingRoots(true);
      try {
        const roots = getRootCategories().filter((cat) => cat.isActive !== false);
        let list = roots;
        if (roots.length === 0) {
          list = fallbackCategories;
        } else {
          list = roots.map((cat) => {
            const fallbackCat = fallbackCategories.find(
              (fc) =>
                normalizeId(fc.id) === normalizeId(cat.id) ||
                fc.name?.toLowerCase() === cat.name?.toLowerCase()
            );
            if (fallbackCat) {
              return {
                ...fallbackCat,
                ...cat,
                image: cat.image || fallbackCat.image,
              };
            }
            return cat;
          });
        }
        const translated = await translateArray(list, ['name', 'description']);
        setTranslatedRootCategories(translated);
      } finally {
        setIsTranslatingRoots(false);
      }
    };
    translateRoots();
  }, [categories, getRootCategories, translateArray]);

  const [selectedCategoryId, setSelectedCategoryId] = useState(null);

  useEffect(() => {
    if (translatedRootCategories.length > 0 && !selectedCategoryId) {
      setSelectedCategoryId(translatedRootCategories[0].id);
    }
  }, [translatedRootCategories, selectedCategoryId]);

  // Translate Subcategories
  useEffect(() => {
    const translateSubs = async () => {
      if (!selectedCategoryId) {
        setTranslatedSubcategories([]);
        return;
      }
      setIsTranslatingSubs(true);
      try {
        const subcats = getCategoriesByParent(selectedCategoryId).filter((cat) => cat.isActive !== false);
        const translated = await translateArray(subcats, ['name', 'description']);
        setTranslatedSubcategories(translated);
      } finally {
        setIsTranslatingSubs(false);
      }
    };
    translateSubs();
  }, [selectedCategoryId, categories, getCategoriesByParent, translateArray]);
  const categoryListRef = useRef(null);
  const activeCategoryRef = useRef(null);
  const filterButtonRef = useRef(null);
  const [isInitialMount, setIsInitialMount] = useState(true);
  const [selectedSubcategory, setSelectedSubcategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    minPrice: "",
    maxPrice: "",
    minRating: "",
  });
  const [categoryProductsFeed, setCategoryProductsFeed] = useState([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);

  // Get subcategories for selected category
  const subcategories = useMemo(() => {
    if (!selectedCategoryId) return [];
    const subcats = getCategoriesByParent(selectedCategoryId);
    return subcats.filter((cat) => cat.isActive !== false);
  }, [selectedCategoryId, categories, getCategoriesByParent]);

   useEffect(() => {
    if (!translatedRootCategories.length) return;
    if (!selectedCategoryId) {
      setSelectedCategoryId(translatedRootCategories[0].id);
      return;
    }
    const exists = translatedRootCategories.some(
      (cat) => normalizeId(cat.id) === normalizeId(selectedCategoryId)
    );
    if (!exists) {
      setSelectedCategoryId(translatedRootCategories[0].id);
    }
  }, [translatedRootCategories, selectedCategoryId]);

   // Reset selected subcategory when category changes
  useEffect(() => {
    if (translatedSubcategories.length > 0) {
      setSelectedSubcategory(translatedSubcategories[0].id);
    } else {
      setSelectedSubcategory(null);
    }
  }, [selectedCategoryId, translatedSubcategories]);

  useEffect(() => {
    let cancelled = false;

    const fetchCategoryProducts = async () => {
      const targetCategoryId = normalizeId(selectedSubcategory || selectedCategoryId);
      if (!targetCategoryId) {
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
            category: targetCategoryId,
            page: 1,
            limit: 200,
            sort: "newest",
          },
        });
        const payload = response?.data ?? response;
        const products = Array.isArray(payload?.products) ? payload.products : [];
        if (cancelled) return;

         const translated = await translateArray(products.map(normalizeProduct).filter((product) => product.id), ['name', 'description', 'unit', 'categoryName', 'brandName', 'vendorName']);
        if (cancelled) return;

        setCategoryProductsFeed(translated);
      } catch {
        if (cancelled) return;
        const selectedId = normalizeId(selectedCategoryId);
        const selectedSubId = normalizeId(selectedSubcategory);
        const fallback = getCatalogProducts().filter((product) => {
          const productCategoryId = normalizeId(product.categoryId);
          const productCategory = categories.find(
            (cat) => normalizeId(cat.id) === productCategoryId
          );
          const productParentId = getParentId(productCategory);

          if (selectedSubId) return productCategoryId === selectedSubId;
          return productCategoryId === selectedId || productParentId === selectedId;
        });
         const translated = await translateArray(fallback, ['name', 'description', 'unit', 'categoryName', 'brandName', 'vendorName']);
        if (cancelled) return;
        setCategoryProductsFeed(translated);
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
  }, [selectedCategoryId, selectedSubcategory, categories]);

  // Filter products based on selected category, subcategory, search query, and filters
  const filteredProducts = useMemo(() => {
    if (!selectedCategoryId) return [];
    let filtered = [...categoryProductsFeed];

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter((product) =>
        product.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by price range
    if (filters.minPrice) {
      filtered = filtered.filter(
        (product) => product.price >= parseFloat(filters.minPrice)
      );
    }
    if (filters.maxPrice) {
      filtered = filtered.filter(
        (product) => product.price <= parseFloat(filters.maxPrice)
      );
    }

    // Filter by minimum rating
    if (filters.minRating) {
      filtered = filtered.filter(
        (product) => product.rating >= parseFloat(filters.minRating)
      );
    }

    return filtered;
  }, [
    selectedCategoryId,
    categoryProductsFeed,
    searchQuery,
    filters,
  ]);

  // Mark initial mount as complete after first render
  useEffect(() => {
    if (isInitialMount) {
      // Use requestAnimationFrame to ensure smooth initial render
      requestAnimationFrame(() => {
        setIsInitialMount(false);
      });
    }
  }, [isInitialMount]);

  // Scroll active category into view (optimized with requestAnimationFrame) - Vertical scroll
  useEffect(() => {
    if (activeCategoryRef.current && categoryListRef.current) {
      const categoryElement = activeCategoryRef.current;
      const listContainer = categoryListRef.current;

      const elementTop = categoryElement.offsetTop;
      const elementHeight = categoryElement.offsetHeight;
      const containerHeight = listContainer.clientHeight;
      const scrollTop = listContainer.scrollTop;

      // Check if element is not fully visible
      if (
        elementTop < scrollTop ||
        elementTop + elementHeight > scrollTop + containerHeight
      ) {
        // Use requestAnimationFrame for smoother scrolling
        requestAnimationFrame(() => {
          listContainer.scrollTo({
            top: elementTop - listContainer.offsetTop - 10,
            behavior: "smooth",
          });
        });
      }
    }
  }, [selectedCategoryId]);

  const handleCategorySelect = (categoryId) => {
    setSelectedCategoryId(categoryId);
  };

  const handleFilterChange = (name, value) => {
    setFilters({ ...filters, [name]: value });
  };

  const clearFilters = () => {
    setFilters({
      minPrice: "",
      maxPrice: "",
      minRating: "",
    });
  };

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

   const selectedCategory = translatedRootCategories.find(
    (cat) => normalizeId(cat.id) === normalizeId(selectedCategoryId)
  );

  // Check if any filter is active
  const hasActiveFilters =
    filters.minPrice || filters.maxPrice || filters.minRating;

  const { isLoading: isStoreLoading } = useCategoryStore();

   // Handle empty categories
  if (translatedRootCategories.length === 0) {
    if (isStoreLoading || isTranslatingRoots) {
      return (
        <PageTransition>
          <MobileLayout showBottomNav={true} showCartBar={true}>
            <PageSkeleton />
          </MobileLayout>
        </PageTransition>
      );
    }
    return (
      <PageTransition>
        <MobileLayout showBottomNav={true} showCartBar={true}>
          <div className="w-full flex items-center justify-center min-h-[60vh] px-4">
            <div className="text-center">
              <div className="text-6xl text-gray-300 mx-auto mb-4">📦</div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">
                {t('No Categories Available')}
              </h2>
              <p className="text-gray-600">
                {t('There are no categories to display at the moment.')}
              </p>
            </div>
          </div>
        </MobileLayout>
      </PageTransition>
    );
  }

  // Calculate available height for content (accounting for bottom nav and cart bar)
  const contentHeight = `calc(100vh - 80px)`;

  // Calculate header height for layout calculations
  const headerSectionHeight = 80;

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={true}>
        <div
          className="w-full flex flex-col"
          style={{ minHeight: contentHeight }}>
          {/* Category Header - Fixed at top */}
          {selectedCategory && (
            <div className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 py-3">
              <div
                key={`header-${selectedCategoryId}`}
                className="flex items-center gap-2 md:gap-3">
                <button
                  onClick={() => navigate(-1)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0">
                  <FiArrowLeft className="text-xl text-gray-700" />
                </button>
                {selectedCategory.image && (
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 border border-gray-200 shadow-xs">
                    <img
                      src={selectedCategory.image}
                      alt={selectedCategory.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-gray-800 tracking-tight">
                    {selectedCategory.name}
                  </h2>
                   <p className="text-xs text-gray-500 font-medium">
                    {filteredProducts.length} {filteredProducts.length !== 1 ? t("products") : t("product")} {t('available')}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 relative">
                  <div ref={filterButtonRef} className="relative">
                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      className={`p-2 hover:bg-gray-100 rounded-full transition-colors ${showFilters ? "bg-gray-100" : ""
                        }`}>
                      <FiFilter
                        className={`text-xl transition-colors ${hasActiveFilters ? "text-blue-600" : "text-gray-700"
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
                            className="fixed inset-0 bg-black/20 z-40"
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
                            className="filter-dropdown absolute right-0 top-full w-56 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden"
                            style={{ marginTop: "10px" }}>
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

              {/* New Search Bar Row */}
              <div className="mt-3 relative">
                <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                <input
                  type="text"
                  placeholder={t("Search in category...")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 shadow-inner placeholder:text-gray-400"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  >
                    <FiX className="text-sm" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Main Content Area - Sidebar and Products */}
          <div
            className="flex flex-1"
            style={{
              minHeight: `calc(${contentHeight} - ${headerSectionHeight}px)`,
            }}>
            {/* Left Panel - Vertical Category Sidebar */}
            <div
              ref={categoryListRef}
              className="w-20 sm:w-24 md:w-28 lg:w-32 bg-gray-50/90 border-r border-gray-200 overflow-y-auto scrollbar-hide flex-shrink-0"
              style={{
                maxHeight: `calc(${contentHeight} - ${headerSectionHeight}px)`,
              }}>
              <div className="pb-[190px] py-1 space-y-1">
                 {translatedRootCategories.map((category) => {
                  const isActive =
                    normalizeId(category.id) === normalizeId(selectedCategoryId);
                  return (
                    <div
                      key={category.id}
                      ref={isActive ? activeCategoryRef : null}
                      style={{
                        willChange: isActive ? "transform" : "auto",
                        transform: "translateZ(0)",
                      }}>
                      <motion.button
                        onClick={() => handleCategorySelect(category.id)}
                        initial={isInitialMount ? { opacity: 0 } : false}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        whileTap={{ scale: 0.95 }}
                        className={`w-full py-2.5 px-1.5 text-left transition-all duration-200 relative flex flex-col items-center gap-1.5 ${isActive ? "bg-white shadow-sm" : "hover:bg-gray-100/80"
                          }`}
                        style={{ willChange: "transform" }}>
                        {isActive && (
                          <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-emerald-600 shadow-sm" />
                        )}
                        <div
                          className={`w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-2xl overflow-hidden bg-gray-100 flex-shrink-0 transition-all duration-200 shadow-xs border ${isActive
                            ? "ring-2 ring-emerald-500 ring-offset-2 scale-105 border-emerald-400 shadow-md"
                            : "border-gray-200/80 hover:border-emerald-300"
                            }`}
                          style={{
                            willChange: isActive ? "transform" : "auto",
                          }}>
                          <LazyImage
                            src={category.image}
                            alt={category.name}
                            className="w-full h-full object-cover"
                            placeholderWidth={64}
                            placeholderHeight={64}
                            placeholderText={category.name}
                          />
                        </div>
                        <span
                          className={`text-xs sm:text-xs md:text-sm font-semibold text-center leading-snug transition-colors line-clamp-2 px-1 ${isActive ? "text-emerald-700 font-bold" : "text-gray-700"
                            }`}>
                          {category.name}
                        </span>
                      </motion.button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Panel - Products Grid */}
            <div
              className="flex-1 overflow-y-auto bg-white flex-shrink-0"
              style={{
                maxHeight: `calc(${contentHeight} - ${headerSectionHeight}px)`,
              }}>
              <div className="p-2 md:p-4">
                {/* Subcategory Selector - Above product cards */}
                {subcategories.length > 0 && (
                  <div className="mb-4 pb-3 border-b border-gray-100">
                    <div
                      className="overflow-x-auto scrollbar-hide px-1 pt-1 md:pt-0"
                      style={{
                        scrollBehavior: "smooth",
                        WebkitOverflowScrolling: "touch",
                      }}>
                    <div className="flex gap-2 py-1">
                        {translatedSubcategories.map((subcategory) => {
                          const isActive =
                            normalizeId(selectedSubcategory) ===
                            normalizeId(subcategory.id);
                          return (
                            <motion.button
                              key={subcategory.id}
                              onClick={() =>
                                setSelectedSubcategory(subcategory.id)
                              }
                              whileTap={{ scale: 0.97 }}
                              className={`flex-shrink-0 px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap border flex items-center gap-2.5 shadow-xs ${isActive
                                ? "bg-emerald-600 text-white border-emerald-600 shadow-md scale-102"
                                : "bg-gray-50 text-gray-700 border-gray-200/90 hover:bg-gray-100 hover:border-gray-300 active:bg-gray-200"
                                }`}
                              style={{ willChange: "transform" }}>
                              {subcategory.image && (
                                <img
                                  src={subcategory.image}
                                  alt={subcategory.name}
                                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg object-cover flex-shrink-0 border border-white/40 shadow-xs"
                                  onError={(e) => {
                                    e.target.style.display = "none";
                                  }}
                                />
                              )}
                              <span>{subcategory.name}</span>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {isLoadingInitial ? (
                  <div className="p-2">
                    <ProductGridSkeleton count={6} columns="grid-cols-2" />
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div key="empty" className="text-center py-12">
                    <div className="text-6xl text-gray-300 mx-auto mb-4">
                      📦
                    </div>
                     <h3 className="text-lg font-bold text-gray-800 mb-2">
                      {searchQuery ? t('No matching products') : t('No products found')}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {searchQuery 
                        ? t('Try adjusting your search query.') 
                        : t('There are no products available in this category at the moment.')}
                    </p>
                  </div>
                ) : (
                  <motion.div
                    key={`products-${selectedCategoryId}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5 md:gap-4 p-1 md:p-0"
                    style={{
                      willChange: "opacity",
                      transform: "translateZ(0)",
                    }}>
                    {filteredProducts.map((product) => (
                      <div key={product.id}>
                        <ProductCard product={product} />
                      </div>
                    ))}
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </div>
      </MobileLayout>
    </PageTransition >
  );
};

export default MobileCategories;
