import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  FiArrowLeft,
  FiFilter,
  FiX,
  FiSearch,
  FiCheck,
  FiStar,
  FiSliders,
  FiDollarSign,
  FiZap,
  FiPackage,
  FiTrendingUp,
  FiTag,
  FiCheckCircle,
} from "react-icons/fi";
import MobileLayout from "../components/Layout/MobileLayout";
import { categories as fallbackCategories } from "../../../data/categories";
import { getCatalogProducts } from "../data/catalogData";
import { useCategoryStore } from "../../../shared/store/categoryStore";
import PageTransition from "../../../shared/components/PageTransition";
import ProductGrid from "../../../shared/components/ProductGrid";
import api from "../../../shared/utils/api";
import { usePageTranslation } from "../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../hooks/useDynamicTranslation";
import CategoryImage from "../../../shared/components/CategoryImage";
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
    originalPrice: Number(raw?.originalPrice || raw?.price) || 0,
    rating: Number(raw?.rating) || 0,
    stock: raw?.stock || "in_stock",
    stockQuantity: raw?.stockQuantity !== undefined ? Number(raw.stockQuantity) : 10,
    variants: raw?.variants || {},
    wholesaleEnabled: Boolean(raw?.wholesaleEnabled),
    quickCommerceEnabled: Boolean(raw?.quickCommerceEnabled),
    flashSale: Boolean(raw?.flashSale),
    isNewArrival: Boolean(raw?.isNewArrival),
    createdAt: raw?.createdAt || new Date(),
  };
};

const initialFilters = {
  sortBy: "recommended",
  minPrice: "",
  maxPrice: "",
  selectedBrands: [],
  minRating: "",
  discountTier: "",
  inStockOnly: false,
  channel: "",
  selectedSizes: [],
};

const MobileCategories = () => {
  const { getTranslatedText: t } = usePageTranslation([
    "No Categories Available",
    "There are no categories to display at the moment.",
    "product",
    "products",
    "available",
    "Filters",
    "Sort By",
    "Recommended",
    "Price: Low to High",
    "Price: High to Low",
    "Customer Rating",
    "Newest Arrivals",
    "Highest Discount",
    "Price Range",
    "Min Price",
    "Max Price",
    "Under",
    "Above",
    "Brand",
    "Brands",
    "Search brands...",
    "Discount & Offers",
    "10% Off or more",
    "20% Off or more",
    "30% Off or more",
    "50% Off or more",
    "Flash Deals Only",
    "Minimum Rating",
    "Stars & Up",
    "Availability",
    "In Stock Only",
    "Selling Channel",
    "Retail Only",
    "Wholesale Available",
    "10-Min Express",
    "Sizes",
    "Clear All",
    "Apply Filters",
    "Show Products",
    "Search in category...",
    "No products found",
    "No matching products",
    "Try adjusting your filters or search query.",
    "There are no products available in this category at the moment."
  ]);

  const { translateArray } = useDynamicTranslation();
  const navigate = useNavigate();
  const {
    categories,
    initialize,
    getCategoriesByParent,
    getRootCategories,
    hasSubDepartments,
  } = useCategoryStore();

  // Initialize store on mount
  useEffect(() => {
    initialize("marketplace");
  }, [initialize]);

  // Root Categories
  const [translatedRootCategories, setTranslatedRootCategories] = useState([]);
  const [translatedSubcategories, setTranslatedSubcategories] = useState([]);
  const [isTranslatingRoots, setIsTranslatingRoots] = useState(false);
  const [isTranslatingSubs, setIsTranslatingSubs] = useState(false);

  useEffect(() => {
    const translateRoots = async () => {
      setIsTranslatingRoots(true);
      try {
        const rootCats = getRootCategories();
        let list = rootCats;
        if (list.length === 0 && fallbackCategories?.length) {
          list = fallbackCategories.map((fc) => ({
            ...fc,
            id: fc.id || fc._id,
            isActive: true,
          }));
        } else {
          list = rootCats.map((cat) => {
            const fallbackCat = fallbackCategories?.find(
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
        const translated = await translateArray(list, ["name", "description"]);
        setTranslatedRootCategories(translated);
      } finally {
        setIsTranslatingRoots(false);
      }
    };
    translateRoots();
  }, [categories, getRootCategories, translateArray]);

  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState(null);

  // Check if active Level 1 root category has 3 levels
  const is3TierCategory = useMemo(() => {
    if (!selectedCategoryId) return false;
    return hasSubDepartments(selectedCategoryId);
  }, [selectedCategoryId, categories, hasSubDepartments]);

  // Level 2 Department list (when 3-tier category)
  const departments = useMemo(() => {
    if (!selectedCategoryId || !is3TierCategory) return [];
    return getCategoriesByParent(selectedCategoryId).filter((cat) => cat.isActive !== false);
  }, [selectedCategoryId, is3TierCategory, categories, getCategoriesByParent]);

  // Automatically select first department when root category changes
  useEffect(() => {
    if (is3TierCategory && departments.length > 0) {
      setSelectedDepartmentId(departments[0].id || departments[0]._id);
    } else {
      setSelectedDepartmentId(null);
    }
  }, [selectedCategoryId, is3TierCategory, departments]);

  // Leaf subcategories
  const rawSubcategories = useMemo(() => {
    if (!selectedCategoryId) return [];
    if (is3TierCategory) {
      if (!selectedDepartmentId) return [];
      return getCategoriesByParent(selectedDepartmentId).filter((cat) => cat.isActive !== false);
    }
    return getCategoriesByParent(selectedCategoryId).filter((cat) => cat.isActive !== false);
  }, [selectedCategoryId, selectedDepartmentId, is3TierCategory, categories, getCategoriesByParent]);

  // Translate Subcategories
  useEffect(() => {
    const translateSubs = async () => {
      if (!rawSubcategories.length) {
        setTranslatedSubcategories([]);
        return;
      }
      setIsTranslatingSubs(true);
      try {
        const translated = await translateArray(rawSubcategories, ["name", "description"]);
        setTranslatedSubcategories(translated);
      } finally {
        setIsTranslatingSubs(false);
      }
    };
    translateSubs();
  }, [rawSubcategories, translateArray]);

  const categoryListRef = useRef(null);
  const activeCategoryRef = useRef(null);
  const filterButtonRef = useRef(null);
  const [isInitialMount, setIsInitialMount] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const [brandSearch, setBrandSearch] = useState("");
  const [categoryProductsFeed, setCategoryProductsFeed] = useState([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);

  // Lock body scroll when filter drawer is open
  useEffect(() => {
    if (showFilters) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [showFilters]);

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

  // Reset selected subcategory when department or category changes
  useEffect(() => {
    if (translatedSubcategories.length > 0) {
      setSelectedSubcategory(translatedSubcategories[0].id);
    } else {
      setSelectedSubcategory(null);
    }
  }, [selectedCategoryId, selectedDepartmentId, translatedSubcategories]);

  useEffect(() => {
    let cancelled = false;

    const fetchCategoryProducts = async () => {
      const targetCategoryId = normalizeId(selectedSubcategory || selectedDepartmentId || selectedCategoryId);
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

        const translated = await translateArray(
          products.map(normalizeProduct).filter((product) => product.id),
          ["name", "description", "unit", "categoryName", "brandName", "vendorName"]
        );
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
        const translated = await translateArray(
          fallback.map(normalizeProduct),
          ["name", "description", "unit", "categoryName", "brandName", "vendorName"]
        );
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
  }, [selectedCategoryId, selectedDepartmentId, selectedSubcategory, categories, translateArray]);

  // Extract available brands dynamically from products
  const availableBrands = useMemo(() => {
    const brandCounts = {};
    categoryProductsFeed.forEach((product) => {
      const bName = String(product.brandName || "").trim();
      if (bName) {
        brandCounts[bName] = (brandCounts[bName] || 0) + 1;
      }
    });
    return Object.entries(brandCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [categoryProductsFeed]);

  // Extract available sizes dynamically from products
  const availableSizes = useMemo(() => {
    const sizeCounts = {};
    categoryProductsFeed.forEach((product) => {
      const sizes = Array.isArray(product.variants?.sizes) ? product.variants.sizes : [];
      sizes.forEach((s) => {
        const sName = String(s || "").trim();
        if (sName) {
          sizeCounts[sName] = (sizeCounts[sName] || 0) + 1;
        }
      });
    });
    return Object.entries(sizeCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [categoryProductsFeed]);

  // Filtered & Sorted Products
  const filteredProducts = useMemo(() => {
    if (!selectedCategoryId) return [];
    let list = [...categoryProductsFeed];

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.brandName && p.brandName.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q))
      );
    }

    // Brand filter (multiple)
    if (filters.selectedBrands.length > 0) {
      list = list.filter(
        (p) => p.brandName && filters.selectedBrands.includes(p.brandName)
      );
    }

    // Size filter (multiple)
    if (filters.selectedSizes.length > 0) {
      list = list.filter((p) => {
        const sizes = Array.isArray(p.variants?.sizes) ? p.variants.sizes : [];
        return sizes.some((s) => filters.selectedSizes.includes(s));
      });
    }

    // Price range
    if (filters.minPrice !== "" && !Number.isNaN(Number(filters.minPrice))) {
      list = list.filter((p) => p.price >= Number(filters.minPrice));
    }
    if (filters.maxPrice !== "" && !Number.isNaN(Number(filters.maxPrice))) {
      list = list.filter((p) => p.price <= Number(filters.maxPrice));
    }

    // Rating
    if (filters.minRating) {
      list = list.filter((p) => (p.rating || 0) >= Number(filters.minRating));
    }

    // In Stock Only
    if (filters.inStockOnly) {
      list = list.filter(
        (p) =>
          p.stock !== "out_of_stock" &&
          (p.stockQuantity === undefined || p.stockQuantity > 0)
      );
    }

    // Selling Channels
    if (filters.channel === "wholesale") {
      list = list.filter((p) => p.wholesaleEnabled === true);
    } else if (filters.channel === "quickCommerce") {
      list = list.filter((p) => p.quickCommerceEnabled === true);
    }

    // Discount Tiers
    if (filters.discountTier === "deals") {
      list = list.filter(
        (p) => p.flashSale === true || (p.originalPrice && p.originalPrice > p.price)
      );
    } else if (filters.discountTier) {
      const minDisc = Number(filters.discountTier);
      list = list.filter((p) => {
        if (!p.originalPrice || p.originalPrice <= p.price) return false;
        const discountPct = Math.round(
          ((p.originalPrice - p.price) / p.originalPrice) * 100
        );
        return discountPct >= minDisc;
      });
    }

    // Sort By
    switch (filters.sortBy) {
      case "price_asc":
        list.sort((a, b) => a.price - b.price);
        break;
      case "price_desc":
        list.sort((a, b) => b.price - a.price);
        break;
      case "rating_desc":
        list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case "newest":
        list.sort(
          (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
        );
        break;
      case "discount_desc":
        list.sort((a, b) => {
          const discA =
            a.originalPrice && a.originalPrice > a.price
              ? (a.originalPrice - a.price) / a.originalPrice
              : 0;
          const discB =
            b.originalPrice && b.originalPrice > b.price
              ? (b.originalPrice - b.price) / b.originalPrice
              : 0;
          return discB - discA;
        });
        break;
      case "recommended":
      default:
        break;
    }

    return list;
  }, [selectedCategoryId, categoryProductsFeed, searchQuery, filters]);

  // Active filters detection
  const hasActiveFilters = useMemo(() => {
    return (
      filters.sortBy !== "recommended" ||
      filters.minPrice !== "" ||
      filters.maxPrice !== "" ||
      filters.selectedBrands.length > 0 ||
      filters.selectedSizes.length > 0 ||
      filters.minRating !== "" ||
      filters.discountTier !== "" ||
      filters.inStockOnly ||
      filters.channel !== ""
    );
  }, [filters]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.sortBy !== "recommended") count++;
    if (filters.minPrice !== "" || filters.maxPrice !== "") count++;
    if (filters.selectedBrands.length > 0) count += filters.selectedBrands.length;
    if (filters.selectedSizes.length > 0) count += filters.selectedSizes.length;
    if (filters.minRating !== "") count++;
    if (filters.discountTier !== "") count++;
    if (filters.inStockOnly) count++;
    if (filters.channel !== "") count++;
    return count;
  }, [filters]);

  // Mark initial mount complete
  useEffect(() => {
    if (isInitialMount) {
      requestAnimationFrame(() => {
        setIsInitialMount(false);
      });
    }
  }, [isInitialMount]);

  // Vertical Category Scroll Into View
  useEffect(() => {
    if (activeCategoryRef.current && categoryListRef.current) {
      const categoryElement = activeCategoryRef.current;
      const listContainer = categoryListRef.current;
      const elementTop = categoryElement.offsetTop;
      const elementHeight = categoryElement.offsetHeight;
      const containerHeight = listContainer.clientHeight;
      const scrollTop = listContainer.scrollTop;

      if (
        elementTop < scrollTop ||
        elementTop + elementHeight > scrollTop + containerHeight
      ) {
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
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const toggleBrand = (brandName) => {
    setFilters((prev) => {
      const exists = prev.selectedBrands.includes(brandName);
      return {
        ...prev,
        selectedBrands: exists
          ? prev.selectedBrands.filter((b) => b !== brandName)
          : [...prev.selectedBrands, brandName],
      };
    });
  };

  const toggleSize = (sizeName) => {
    setFilters((prev) => {
      const exists = prev.selectedSizes.includes(sizeName);
      return {
        ...prev,
        selectedSizes: exists
          ? prev.selectedSizes.filter((s) => s !== sizeName)
          : [...prev.selectedSizes, sizeName],
      };
    });
  };

  const setPriceBracket = (min, max) => {
    setFilters((prev) => ({
      ...prev,
      minPrice: min ? String(min) : "",
      maxPrice: max ? String(max) : "",
    }));
  };

  const clearFilters = () => {
    setFilters(initialFilters);
  };

  const selectedCategory = translatedRootCategories.find(
    (cat) => normalizeId(cat.id) === normalizeId(selectedCategoryId)
  );

  const { isLoading: isStoreLoading } = useCategoryStore();

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
              <div className="text-6xl text-content-muted mx-auto mb-4">📦</div>
              <h2 className="text-xl font-bold text-content mb-2">
                {t("No Categories Available")}
              </h2>
              <p className="text-content-secondary">
                {t("There are no categories to display at the moment.")}
              </p>
            </div>
          </div>
        </MobileLayout>
      </PageTransition>
    );
  }

  const contentHeight = `calc(100vh - 80px)`;
  const headerSectionHeight = 80;

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={true}>
        <div
          className="w-full max-w-full flex flex-col overflow-x-hidden"
          style={{ minHeight: contentHeight }}>
          
          {/* Category Header */}
          {selectedCategory && (
            <div className="sticky top-0 z-40 bg-surface border-b border-border px-4 py-3 shadow-xs">
              <div
                key={`header-${selectedCategoryId}`}
                className="flex items-center gap-2 md:gap-3">
                <button
                  onClick={() => navigate(-1)}
                  className="p-2 hover:bg-surface-muted rounded-full transition-colors flex-shrink-0 cursor-pointer"
                  aria-label="Back">
                  <FiArrowLeft className="text-xl text-content-secondary" />
                </button>
                {selectedCategory.image && (
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl overflow-hidden bg-surface-muted flex-shrink-0 border border-border shadow-xs">
                    <img
                      src={selectedCategory.image}
                      alt={selectedCategory.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-content tracking-tight truncate">
                    {selectedCategory.name}
                  </h2>
                  <p className="text-xs text-content-muted font-medium">
                    {filteredProducts.length}{" "}
                    {filteredProducts.length !== 1 ? t("products") : t("product")}{" "}
                    {t("available")}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div ref={filterButtonRef} className="relative">
                    <button
                      onClick={() => setShowFilters(true)}
                      className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer font-bold text-xs border shadow-xs ${
                        hasActiveFilters
                          ? "bg-brand-primary text-black border-brand-primary font-extrabold"
                          : "bg-surface-muted hover:bg-border text-content-secondary border-border"
                      }`}
                      title={t("Filters")}>
                      <FiFilter className="text-base" />
                      <span>{t("Filters")}</span>
                      {activeFiltersCount > 0 && (
                        <span className="w-5 h-5 rounded-full bg-black text-white text-[10px] flex items-center justify-center font-extrabold ml-0.5">
                          {activeFiltersCount}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Search Bar Row */}
              <div className="mt-3 relative">
                <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-content-muted text-sm" />
                <input
                  type="text"
                  placeholder={t("Search in category...")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-surface-muted rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary shadow-inner placeholder:text-content-muted border border-border/50 text-content"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-content-muted hover:text-content p-1 cursor-pointer"
                  >
                    <FiX className="text-sm" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Main Content Area - Sidebar and Products */}
          <div
            className="flex flex-1 w-full max-w-full min-w-0 overflow-hidden"
            style={{
              minHeight: `calc(${contentHeight} - ${headerSectionHeight}px)`,
            }}>
            {/* Left Panel - Vertical Category Sidebar */}
            <div
              ref={categoryListRef}
              className="w-20 sm:w-24 md:w-28 lg:w-32 bg-surface-muted border-r border-border overflow-y-auto scrollbar-hide shrink-0 select-none touch-pan-y overscroll-contain"
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
                        className={`w-full py-2.5 px-1.5 text-left transition-all duration-200 relative flex flex-col items-center gap-1.5 cursor-pointer ${
                          isActive
                            ? "bg-surface shadow-xs font-bold"
                            : "hover:bg-surface-muted/80"
                        }`}
                        style={{ willChange: "transform" }}>
                        {isActive && (
                          <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-brand-primary shadow-xs" />
                        )}
                        <CategoryImage
                          src={category.image}
                          alt={category.name}
                          name={category.name}
                          containerClassName={`w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-2xl overflow-hidden bg-surface-muted flex-shrink-0 transition-all duration-200 shadow-xs border ${
                            isActive
                              ? "ring-2 ring-brand-primary ring-offset-2 scale-105 border-brand-primary shadow-md"
                              : "border-border hover:border-brand-primary/50"
                          }`}
                        />
                        <span
                          className={`text-xs sm:text-xs md:text-sm font-semibold text-center leading-snug transition-colors line-clamp-2 px-1 ${
                            isActive
                              ? "text-brand-primary font-bold"
                              : "text-content-secondary"
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
              className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-surface overscroll-contain"
              style={{
                maxHeight: `calc(${contentHeight} - ${headerSectionHeight}px)`,
              }}>
              <div className="p-2 md:p-4 w-full max-w-full overflow-hidden">
                {/* Level 2 Department Tabs (When 3-tier category like Fashion & Lifestyle) */}
                {is3TierCategory && departments.length > 0 && (
                  <div className="mb-3 pb-2 border-b border-border w-full max-w-full overflow-hidden">
                    <div
                      className="overflow-x-auto scrollbar-hide px-1 w-full max-w-full touch-pan-x"
                      style={{ WebkitOverflowScrolling: "touch" }}>
                      <div className="flex items-center gap-2 py-1">
                        {departments.map((dept) => {
                          const deptId = dept.id || dept._id;
                          const isDeptActive =
                            normalizeId(deptId) ===
                            normalizeId(selectedDepartmentId);
                          return (
                            <motion.button
                              key={deptId}
                              whileTap={{ scale: 0.97 }}
                              onClick={() => setSelectedDepartmentId(deptId)}
                              className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all duration-200 whitespace-nowrap border flex items-center gap-2 shadow-xs cursor-pointer ${
                                isDeptActive
                                  ? "bg-amber-400 text-black border-amber-400 shadow-md scale-102 font-bold"
                                  : "bg-surface-muted text-content-secondary border-border hover:bg-border"
                              }`}
                            >
                              {dept.image && (
                                <img
                                  src={dept.image}
                                  alt={dept.name}
                                  className="w-6 h-6 rounded-md object-cover shrink-0 border border-white/40 shadow-xs"
                                  onError={(e) => {
                                    e.target.style.display = "none";
                                  }}
                                />
                              )}
                              <span>{dept.name}</span>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Level 3 or Level 2 Subcategory Pills Selector */}
                {translatedSubcategories.length > 0 && (
                  <div className="mb-3 pb-2.5 border-b border-border w-full max-w-full overflow-hidden">
                    <div
                      className="overflow-x-auto scrollbar-hide px-1 pt-1 md:pt-0 w-full max-w-full touch-pan-x"
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
                              className={`flex-shrink-0 px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap border flex items-center gap-2.5 shadow-xs cursor-pointer ${
                                isActive
                                  ? "bg-amber-400 text-black border-amber-400 shadow-md scale-102 font-bold"
                                  : "bg-surface-muted text-content-secondary border-border hover:bg-border hover:border-border-strong active:bg-border"
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

                {/* Active Filter Chips Bar */}
                {hasActiveFilters && (
                  <div className="mb-3 flex items-center gap-1.5 flex-wrap bg-surface-muted/60 p-2.5 rounded-xl border border-border/80 text-xs">
                    <span className="font-bold text-content-secondary mr-1 flex items-center gap-1 text-[11px]">
                      <FiSliders className="text-xs" /> {t("Filters")}:
                    </span>

                    {filters.sortBy !== "recommended" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface border border-border rounded-lg text-content font-medium shadow-xs">
                        <span>
                          {filters.sortBy === "price_asc"
                            ? t("Price: Low to High")
                            : filters.sortBy === "price_desc"
                            ? t("Price: High to Low")
                            : filters.sortBy === "rating_desc"
                            ? t("Customer Rating")
                            : filters.sortBy === "newest"
                            ? t("Newest Arrivals")
                            : t("Highest Discount")}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleFilterChange("sortBy", "recommended")}
                          className="hover:text-status-error cursor-pointer ml-0.5">
                          <FiX />
                        </button>
                      </span>
                    )}

                    {(filters.minPrice || filters.maxPrice) && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface border border-border rounded-lg text-content font-medium shadow-xs">
                        <span>
                          ₹{filters.minPrice || "0"} - ₹{filters.maxPrice || "Max"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPriceBracket("", "")}
                          className="hover:text-status-error cursor-pointer ml-0.5">
                          <FiX />
                        </button>
                      </span>
                    )}

                    {filters.selectedBrands.map((brand) => (
                      <span
                        key={brand}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-primary/10 border border-brand-primary/30 rounded-lg text-brand-primary font-bold shadow-xs">
                        <span>{brand}</span>
                        <button
                          type="button"
                          onClick={() => toggleBrand(brand)}
                          className="hover:text-status-error cursor-pointer ml-0.5">
                          <FiX />
                        </button>
                      </span>
                    ))}

                    {filters.selectedSizes.map((size) => (
                      <span
                        key={size}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface border border-border rounded-lg text-content font-bold shadow-xs">
                        <span>Size: {size}</span>
                        <button
                          type="button"
                          onClick={() => toggleSize(size)}
                          className="hover:text-status-error cursor-pointer ml-0.5">
                          <FiX />
                        </button>
                      </span>
                    ))}

                    {filters.minRating && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-600 font-bold shadow-xs">
                        <span>★ {filters.minRating}+</span>
                        <button
                          type="button"
                          onClick={() => handleFilterChange("minRating", "")}
                          className="hover:text-status-error cursor-pointer ml-0.5">
                          <FiX />
                        </button>
                      </span>
                    )}

                    {filters.discountTier && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-600 font-bold shadow-xs">
                        <span>
                          {filters.discountTier === "deals"
                            ? t("Flash Deals Only")
                            : `${filters.discountTier}%+ Off`}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleFilterChange("discountTier", "")}
                          className="hover:text-status-error cursor-pointer ml-0.5">
                          <FiX />
                        </button>
                      </span>
                    )}

                    {filters.inStockOnly && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-600 font-bold shadow-xs">
                        <span>{t("In Stock Only")}</span>
                        <button
                          type="button"
                          onClick={() => handleFilterChange("inStockOnly", false)}
                          className="hover:text-status-error cursor-pointer ml-0.5">
                          <FiX />
                        </button>
                      </span>
                    )}

                    {filters.channel && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-500/10 border border-purple-500/30 rounded-lg text-purple-600 font-bold shadow-xs">
                        <span>
                          {filters.channel === "wholesale"
                            ? t("Wholesale Available")
                            : t("10-Min Express")}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleFilterChange("channel", "")}
                          className="hover:text-status-error cursor-pointer ml-0.5">
                          <FiX />
                        </button>
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={clearFilters}
                      className="text-xs font-bold text-status-error hover:underline ml-auto cursor-pointer">
                      {t("Clear All")}
                    </button>
                  </div>
                )}

                <ProductGrid
                  products={filteredProducts}
                  loading={isLoadingInitial}
                  emptyTitle={
                    searchQuery || hasActiveFilters
                      ? t("No matching products")
                      : t("No products found")
                  }
                  emptyDescription={
                    searchQuery || hasActiveFilters
                      ? t("Try adjusting your filters or search query.")
                      : t("There are no products available in this category at the moment.")
                  }
                />
              </div>
            </div>
          </div>
        </div>

        {/* Portal-Rendered Slide-Over Filter Drawer (Desktop Right Drawer & Mobile Bottom Sheet) */}
        {typeof document !== "undefined" &&
          createPortal(
            <AnimatePresence>
              {showFilters && (
                <div className="fixed inset-0 z-[99999] flex justify-end items-end sm:items-stretch">
                  {/* Backdrop */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => setShowFilters(false)}
                    className="fixed inset-0 bg-black/60 backdrop-blur-xs"
                  />

                  {/* Drawer Container: Responsive Right-Side on Desktop, Bottom-Sheet on Mobile */}
                  <motion.div
                    initial={{ x: "100%", y: 0 }}
                    animate={{ x: 0, y: 0 }}
                    exit={{ x: "100%", y: 0 }}
                    transition={{ type: "spring", damping: 28, stiffness: 280 }}
                    onClick={(e) => e.stopPropagation()}
                    className="relative bg-surface w-full sm:w-[440px] sm:max-w-full h-[90vh] sm:h-full rounded-t-3xl sm:rounded-none sm:rounded-l-2xl flex flex-col border-t sm:border-t-0 sm:border-l border-border shadow-2xl overflow-hidden z-10">
                    
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-surface shrink-0">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary font-bold">
                          <FiSliders className="text-lg" />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-content flex items-center gap-2">
                            {t("Filters")}
                            {activeFiltersCount > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-brand-primary text-black text-xs font-extrabold">
                                {activeFiltersCount}
                              </span>
                            )}
                          </h3>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {hasActiveFilters && (
                          <button
                            type="button"
                            onClick={clearFilters}
                            className="text-xs font-bold text-status-error hover:underline cursor-pointer px-2 py-1">
                            {t("Clear All")}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowFilters(false)}
                          className="p-2 hover:bg-surface-muted rounded-full text-content-secondary hover:text-content transition-colors cursor-pointer"
                          aria-label="Close">
                          <FiX className="text-xl" />
                        </button>
                      </div>
                    </div>

                    {/* Filter Body - Scrollable Sections */}
                    <div className="p-5 overflow-y-auto flex-1 space-y-6 scrollbar-admin">
                      
                      {/* 1. Sort Options */}
                      <div>
                        <h4 className="font-bold text-content text-sm mb-2.5 flex items-center gap-1.5">
                          <FiTrendingUp className="text-brand-primary" /> {t("Sort By")}
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { id: "recommended", label: t("Recommended") },
                            { id: "price_asc", label: t("Price: Low to High") },
                            { id: "price_desc", label: t("Price: High to Low") },
                            { id: "rating_desc", label: t("Customer Rating") },
                            { id: "newest", label: t("Newest Arrivals") },
                            { id: "discount_desc", label: t("Highest Discount") },
                          ].map((item) => {
                            const isSelected = filters.sortBy === item.id;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => handleFilterChange("sortBy", item.id)}
                                className={`p-2.5 rounded-xl text-xs font-semibold border text-left transition-all cursor-pointer flex items-center justify-between gap-1.5 ${
                                  isSelected
                                    ? "bg-brand-primary text-black border-brand-primary font-bold shadow-xs"
                                    : "bg-surface-muted hover:bg-border text-content-secondary border-border"
                                }`}>
                                <span className="truncate">{item.label}</span>
                                {isSelected && <FiCheck className="text-sm shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 2. Price Range */}
                      <div>
                        <h4 className="font-bold text-content text-sm mb-2.5 flex items-center gap-1.5">
                          <FiDollarSign className="text-brand-primary" /> {t("Price Range")}
                        </h4>
                        
                        {/* Quick Bracket Chips */}
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {[
                            { label: `${t("Under")} ₹500`, min: "", max: "500" },
                            { label: "₹500 - ₹1,000", min: "500", max: "1000" },
                            { label: "₹1,000 - ₹2,500", min: "1000", max: "2500" },
                            { label: "₹2,500 - ₹5,000", min: "2500", max: "5000" },
                            { label: `${t("Above")} ₹5,000`, min: "5000", max: "" },
                          ].map((bracket) => {
                            const isMatch =
                              filters.minPrice === bracket.min &&
                              filters.maxPrice === bracket.max;
                            return (
                              <button
                                key={bracket.label}
                                type="button"
                                onClick={() =>
                                  isMatch
                                    ? setPriceBracket("", "")
                                    : setPriceBracket(bracket.min, bracket.max)
                                }
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                                  isMatch
                                    ? "bg-amber-400 text-black border-amber-400 font-bold shadow-xs"
                                    : "bg-surface-muted hover:bg-border text-content-secondary border-border"
                                }`}>
                                {bracket.label}
                              </button>
                            );
                          })}
                        </div>

                        {/* Custom Min / Max Inputs */}
                        <div className="grid grid-cols-2 gap-3 items-center">
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-content-muted">₹</span>
                            <input
                              type="number"
                              placeholder={t("Min Price")}
                              value={filters.minPrice}
                              onChange={(e) => handleFilterChange("minPrice", e.target.value)}
                              className="w-full pl-7 pr-3 py-2 bg-surface rounded-xl border border-border text-xs focus:ring-1 focus:ring-brand-primary outline-none text-content"
                            />
                          </div>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-content-muted">₹</span>
                            <input
                              type="number"
                              placeholder={t("Max Price")}
                              value={filters.maxPrice}
                              onChange={(e) => handleFilterChange("maxPrice", e.target.value)}
                              className="w-full pl-7 pr-3 py-2 bg-surface rounded-xl border border-border text-xs focus:ring-1 focus:ring-brand-primary outline-none text-content"
                            />
                          </div>
                        </div>
                      </div>

                      {/* 3. Brands (Dynamic) */}
                      {availableBrands.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-2.5">
                            <h4 className="font-bold text-content text-sm flex items-center gap-1.5">
                              <FiTag className="text-brand-primary" /> {t("Brands")}
                            </h4>
                            {filters.selectedBrands.length > 0 && (
                              <button
                                type="button"
                                onClick={() => handleFilterChange("selectedBrands", [])}
                                className="text-xs text-brand-primary font-bold hover:underline cursor-pointer">
                                Clear ({filters.selectedBrands.length})
                              </button>
                            )}
                          </div>

                          {/* Brand search filter if more than 5 brands */}
                          {availableBrands.length > 5 && (
                            <div className="mb-2 relative">
                              <input
                                type="text"
                                placeholder={t("Search brands...")}
                                value={brandSearch}
                                onChange={(e) => setBrandSearch(e.target.value)}
                                className="w-full px-3 py-1.5 bg-surface rounded-lg border border-border text-xs focus:outline-none focus:ring-1 focus:ring-brand-primary text-content placeholder:text-content-muted"
                              />
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1">
                            {availableBrands
                              .filter((b) =>
                                b.name.toLowerCase().includes(brandSearch.toLowerCase().trim())
                              )
                              .map((b) => {
                                const isChecked = filters.selectedBrands.includes(b.name);
                                return (
                                  <button
                                    key={b.name}
                                    type="button"
                                    onClick={() => toggleBrand(b.name)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer ${
                                      isChecked
                                        ? "bg-brand-primary text-black border-brand-primary font-bold shadow-xs"
                                        : "bg-surface-muted hover:bg-border text-content-secondary border-border"
                                    }`}>
                                    {isChecked && <FiCheck className="text-xs shrink-0" />}
                                    <span>{b.name}</span>
                                    <span className="opacity-60 text-[10px]">({b.count})</span>
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* 4. Customer Rating */}
                      <div>
                        <h4 className="font-bold text-content text-sm mb-2.5 flex items-center gap-1.5">
                          <FiStar className="text-amber-500 fill-amber-500" /> {t("Minimum Rating")}
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[4, 3, 2, 1].map((stars) => {
                            const isSelected = filters.minRating === String(stars);
                            return (
                              <button
                                key={stars}
                                type="button"
                                onClick={() =>
                                  handleFilterChange(
                                    "minRating",
                                    isSelected ? "" : String(stars)
                                  )
                                }
                                className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                  isSelected
                                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500 font-bold shadow-xs"
                                    : "bg-surface-muted hover:bg-border text-content-secondary border-border"
                                }`}>
                                <FiStar
                                  className={`text-sm ${
                                    isSelected
                                      ? "fill-amber-500 text-amber-500"
                                      : "fill-amber-400/50 text-amber-500"
                                  }`}
                                />
                                <span>{stars}★ & Up</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 5. Discount & Deals */}
                      <div>
                        <h4 className="font-bold text-content text-sm mb-2.5 flex items-center gap-1.5">
                          <FiTag className="text-emerald-500" /> {t("Discount & Offers")}
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { id: "10", label: "10%+ Off" },
                            { id: "20", label: "20%+ Off" },
                            { id: "30", label: "30%+ Off" },
                            { id: "50", label: "50%+ Off" },
                            { id: "deals", label: t("Flash Deals Only") },
                          ].map((item) => {
                            const isSelected = filters.discountTier === item.id;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() =>
                                  handleFilterChange(
                                    "discountTier",
                                    isSelected ? "" : item.id
                                  )
                                }
                                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                                  isSelected
                                    ? "bg-emerald-500 text-white border-emerald-500 font-bold shadow-xs"
                                    : "bg-surface-muted hover:bg-border text-content-secondary border-border"
                                }`}>
                                {item.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 6. Availability & Selling Channel */}
                      <div>
                        <h4 className="font-bold text-content text-sm mb-2.5 flex items-center gap-1.5">
                          <FiPackage className="text-brand-primary" /> {t("Availability & Channels")}
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              handleFilterChange("inStockOnly", !filters.inStockOnly)
                            }
                            className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                              filters.inStockOnly
                                ? "bg-blue-500/15 text-blue-600 border-blue-500 font-bold"
                                : "bg-surface-muted hover:bg-border text-content-secondary border-border"
                            }`}>
                            <FiCheckCircle className="text-sm" />
                            <span>{t("In Stock Only")}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleFilterChange(
                                "channel",
                                filters.channel === "quickCommerce" ? "" : "quickCommerce"
                              )
                            }
                            className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                              filters.channel === "quickCommerce"
                                ? "bg-amber-400 text-black border-amber-400 font-bold"
                                : "bg-surface-muted hover:bg-border text-content-secondary border-border"
                            }`}>
                            <FiZap className="text-sm" />
                            <span>{t("10-Min Express")}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleFilterChange(
                                "channel",
                                filters.channel === "wholesale" ? "" : "wholesale"
                              )
                            }
                            className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                              filters.channel === "wholesale"
                                ? "bg-purple-500/15 text-purple-600 border-purple-500 font-bold"
                                : "bg-surface-muted hover:bg-border text-content-secondary border-border"
                            }`}>
                            <FiPackage className="text-sm" />
                            <span>{t("Wholesale Available")}</span>
                          </button>
                        </div>
                      </div>

                      {/* 7. Sizes (When available) */}
                      {availableSizes.length > 0 && (
                        <div>
                          <h4 className="font-bold text-content text-sm mb-2.5">
                            {t("Sizes")}
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {availableSizes.map((sz) => {
                              const isSelected = filters.selectedSizes.includes(sz.name);
                              return (
                                <button
                                  key={sz.name}
                                  type="button"
                                  onClick={() => toggleSize(sz.name)}
                                  className={`w-10 h-10 rounded-xl text-xs font-bold border flex items-center justify-center transition-all cursor-pointer ${
                                    isSelected
                                      ? "bg-brand-primary text-black border-brand-primary shadow-xs scale-105"
                                      : "bg-surface-muted hover:bg-border text-content-secondary border-border"
                                  }`}>
                                  {sz.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                    </div>

                    {/* Drawer Sticky Footer */}
                    <div className="p-4 border-t border-border bg-surface flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={clearFilters}
                        disabled={!hasActiveFilters}
                        className="px-5 py-3 rounded-xl border border-border bg-surface-muted text-content-secondary font-semibold text-xs hover:bg-border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                        {t("Clear All")}
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowFilters(false)}
                        className="flex-1 py-3 px-4 rounded-xl bg-brand-primary text-black font-extrabold text-sm hover:bg-brand-primaryHover transition-all cursor-pointer shadow-md text-center">
                        {t("Show Products")} ({filteredProducts.length})
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>,
            document.body
          )}
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileCategories;
