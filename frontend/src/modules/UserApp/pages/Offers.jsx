import { useState, useMemo, useEffect, useRef } from "react";
import { FiArrowLeft, FiFilter, FiGrid, FiList, FiX, FiTag } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import MobileLayout from "../components/Layout/MobileLayout";
import ProductCard from "../../../shared/components/ProductCard";
import ProductListItem from "../components/Mobile/ProductListItem";
import { categories as fallbackCategories } from "../../../data/categories";
import PageTransition from "../../../shared/components/PageTransition";
import useInfiniteScroll from "../../../shared/hooks/useInfiniteScroll";
import api from "../../../shared/utils/api";
import { formatPrice } from "../../../shared/utils/helpers";
import toast from "react-hot-toast";
import { useCategoryStore } from "../../../shared/store/categoryStore";
import { usePageTranslation } from "../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../hooks/useDynamicTranslation";

const normalizeProduct = (raw) => {
  const vendorObj =
    raw?.vendorId && typeof raw.vendorId === "object" ? raw.vendorId : null;
  const brandObj =
    raw?.brandId && typeof raw.brandId === "object" ? raw.brandId : null;
  const categoryObj =
    raw?.categoryId && typeof raw.categoryId === "object" ? raw.categoryId : null;

  return {
    ...raw,
    id: raw?._id || raw?.id,
    vendorId: vendorObj?._id || raw?.vendorId,
    brandId: brandObj?._id || raw?.brandId,
    categoryId: String(categoryObj?._id || raw?.categoryId || ""),
    vendorName: raw?.vendorName || vendorObj?.storeName || "",
    brandName: raw?.brandName || brandObj?.name || "",
    categoryName: raw?.categoryName || categoryObj?.name || "",
    image: raw?.image || raw?.images?.[0] || "",
    images: Array.isArray(raw?.images) ? raw.images : [],
    price: Number(raw?.price) || 0,
    originalPrice:
      raw?.originalPrice !== undefined ? Number(raw.originalPrice) : undefined,
    rating: Number(raw?.rating) || 0,
    reviewCount: Number(raw?.reviewCount) || 0,
  };
};

const getDiscountPercent = (product) => {
  const original = Number(product?.originalPrice);
  const current = Number(product?.price);
  if (!Number.isFinite(original) || !Number.isFinite(current) || original <= current || original <= 0) return 0;
  return Math.round(((original - current) / original) * 100);
};

const MobileOffers = () => {
  const { getTranslatedText: t } = usePageTranslation([
    "Special Offers",
    "offer",
    "offers",
    "live now • Extra savings",
    "Filters",
    "Category",
    "All Categories",
    "Price Range",
    "Min Price",
    "Max Price",
    "Minimum Rating",
    "Stars",
    "Clear All",
    "Apply Filters",
    "Available Coupons",
    "OFF",
    "Free Shipping",
    "Min order:",
    "No offers found",
    "Try adjusting your filters",
    "Loading more products...",
    "Loading...",
    "Load More"
  ]);

  const { translateArray } = useDynamicTranslation();
  const navigate = useNavigate();
  const { categories: storeCategories, initialize: initializeCategories } = useCategoryStore();
  const [liveOffers, setLiveOffers] = useState([]);
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState("grid");
  const [filters, setFilters] = useState({
    category: "",
    minPrice: "",
    maxPrice: "",
    minRating: "",
  });

  useEffect(() => {
    initializeCategories();
  }, [initializeCategories]);

  const categories = useMemo(() => {
    const activeStoreCategories = storeCategories.filter((cat) => cat.isActive !== false);
    if (activeStoreCategories.length) {
      return activeStoreCategories;
    }
    return fallbackCategories;
  }, [storeCategories]);

  useEffect(() => {
    let cancelled = false;

    const loadLiveOffers = async () => {
      try {
        const campaignListResponse = await api.get("/campaigns", {
          params: { type: "flash_sale,daily_deal,special_offer,festival", limit: 20 },
        });
        const campaignsPayload = campaignListResponse?.data ?? campaignListResponse;
        const campaignSlugs = (Array.isArray(campaignsPayload) ? campaignsPayload : [])
          .map((campaign) => String(campaign?.slug || "").trim())
          .filter(Boolean);

        const uniqueSlugs = [...new Set(campaignSlugs)].slice(0, 20);
        if (!uniqueSlugs.length) {
          if (!cancelled) setLiveOffers([]);
          return;
        }

        const campaignDetails = await Promise.allSettled(
          uniqueSlugs.map((slug) => api.get(`/campaigns/${slug}`))
        );

        const productsById = new Map();
        campaignDetails
          .filter((item) => item.status === "fulfilled")
          .forEach((item) => {
            const payload = item.value?.data ?? item.value;
            const products = Array.isArray(payload?.products) ? payload.products : [];
            products.forEach((product) => {
              const normalized = normalizeProduct(product);
              if (!normalized.id) return;
              if (!productsById.has(normalized.id)) {
                productsById.set(normalized.id, normalized);
              }
            });
          });

        if (!cancelled) {
          const productList = Array.from(productsById.values());
          const translatedProducts = await translateArray(productList, ['name', 'description', 'unit', 'categoryName', 'brandName', 'vendorName']);
          setLiveOffers(translatedProducts);
        }
      } catch {
        if (!cancelled) setLiveOffers([]);
      }
    };

    const loadAvailableCoupons = async () => {
      try {
        const response = await api.get("/coupons/available");
        const payload = response?.data ?? response;
        if (!cancelled) {
          const couponList = Array.isArray(payload) ? payload : [];
          setAvailableCoupons(couponList);
        }
      } catch {
        if (!cancelled) setAvailableCoupons([]);
      }
    };

    loadLiveOffers();
    loadAvailableCoupons();

    return () => {
      cancelled = true;
    };
  }, [translateArray]);

  const offersWithDiscount = useMemo(() => {
    return liveOffers
      .map((product) => ({ ...product, discount: getDiscountPercent(product) }))
      .sort((a, b) => b.discount - a.discount);
  }, [liveOffers]);

  const filteredProducts = useMemo(() => {
    let result = offersWithDiscount;

    if (filters.category) {
      result = result.filter(
        (product) => String(product.categoryId || "") === String(filters.category)
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
    return result;
  }, [offersWithDiscount, filters]);

  const { displayedItems, hasMore, isLoading, loadMore, loadMoreRef } =
    useInfiniteScroll(filteredProducts, 10, 10);

  const filterButtonRef = useRef(null);

  const handleFilterChange = (name, value) => {
    setFilters({ ...filters, [name]: value });
  };

  const clearFilters = () => {
    setFilters({
      category: "",
      minPrice: "",
      maxPrice: "",
      minRating: "",
    });
  };

  const hasActiveFilters =
    filters.minPrice || filters.maxPrice || filters.minRating || filters.category;

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

  const copyCoupon = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`Coupon ${code} copied`);
    } catch {
      toast.success(`Coupon: ${code}`);
    }
  };

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={true}>
        <div className="w-full pb-24">
          <div className="mx-2 mt-2 px-4 py-6 bg-gradient-to-r from-red-50 to-orange-50 border border-gray-100 rounded-2xl sticky top-2 z-30 shadow-md">
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-red-100/50 rounded-full transition-colors">
                <FiArrowLeft className="text-xl text-gray-700" />
              </button>
              <div className="flex-1">
                <h1 className="text-2xl font-black text-gray-800 tracking-tight uppercase">
                  {t('Special Offers')}
                </h1>
                <p className="text-sm font-medium text-red-600">
                  {filteredProducts.length} {filteredProducts.length === 1 ? t("offer") : t("offers")} {t('live now • Extra savings')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode("list")}
                    className={`p-1.5 rounded transition-colors ${viewMode === "list"
                      ? "bg-white text-red-600 shadow-sm"
                      : "text-gray-600"
                      }`}
                  >
                    <FiList className="text-lg" />
                  </button>
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-1.5 rounded transition-colors ${viewMode === "grid"
                      ? "bg-white text-red-600 shadow-sm"
                      : "text-gray-600"
                      }`}
                  >
                    <FiGrid className="text-lg" />
                  </button>
                </div>
                <div ref={filterButtonRef} className="relative">
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`p-2 glass-card rounded-xl hover:bg-white/80 transition-colors ${showFilters ? "bg-white/80" : ""
                      }`}>
                    <FiFilter
                      className={`text-lg transition-colors ${hasActiveFilters ? "text-blue-600" : "text-gray-600"
                        }`}
                    />
                  </button>

                  <AnimatePresence>
                    {showFilters && (
                      <>
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

                          <div className="max-h-[50vh] overflow-y-auto scrollbar-hide">
                            <div className="p-2 space-y-2">
                              <div>
                                <h4 className="font-semibold text-gray-700 mb-1 text-xs">
                                  {t('Category')}
                                </h4>
                                <select
                                  value={filters.category}
                                  onChange={(e) =>
                                    handleFilterChange("category", e.target.value)
                                  }
                                  className="w-full px-2 py-1.5 rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-red-500 text-xs"
                                >
                                  <option value="">{t('All Categories')}</option>
                                  {categories.map((cat) => (
                                    <option key={cat.id} value={String(cat.id)}>
                                      {cat.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

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
                                      handleFilterChange("minPrice", e.target.value)
                                    }
                                    className="w-full px-2 py-1.5 rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-red-500 text-xs"
                                  />
                                  <input
                                    type="number"
                                    placeholder={t("Max Price")}
                                    value={filters.maxPrice}
                                    onChange={(e) =>
                                      handleFilterChange("maxPrice", e.target.value)
                                    }
                                    className="w-full px-2 py-1.5 rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-red-500 text-xs"
                                  />
                                </div>
                              </div>

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
                                        checked={filters.minRating === rating.toString()}
                                        onChange={(e) =>
                                          handleFilterChange("minRating", e.target.value)
                                        }
                                        className="w-3 h-3 appearance-none rounded-full border-2 border-gray-300 bg-white checked:bg-white checked:border-red-500 relative cursor-pointer"
                                        style={{
                                          backgroundImage:
                                            filters.minRating === rating.toString()
                                              ? "radial-gradient(circle, #EF4444 40%, transparent 40%)"
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

                          <div className="border-t border-gray-200 p-2 bg-gray-50 space-y-1.5">
                            <button
                              onClick={clearFilters}
                              className="w-full py-1.5 bg-gray-200 text-gray-700 rounded-md font-semibold text-xs hover:bg-gray-300 transition-colors">
                              {t('Clear All')}
                            </button>
                            <button
                              onClick={() => setShowFilters(false)}
                              className="w-full py-1.5 gradient-red text-white rounded-md font-semibold text-xs hover:shadow-glow-red transition-all">
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

          {availableCoupons.length > 0 && (
            <div className="px-4 pt-4">
              <div className="bg-white border border-gray-200 rounded-xl p-3">
                <h3 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">
                  <FiTag className="text-red-600" />
                  {t('Available Coupons')}
                </h3>
                <div className="space-y-2">
                  {availableCoupons.slice(0, 4).map((coupon) => (
                    <button
                      key={coupon._id || coupon.code}
                      onClick={() => copyCoupon(coupon.code)}
                      className="w-full text-left p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-800">{coupon.code}</p>
                        <p className="text-xs text-red-600 font-semibold">
                          {coupon.type === "percentage"
                            ? `${coupon.value}% ${t('OFF')}`
                            : coupon.type === "fixed"
                               ? `${formatPrice(coupon.value)} ${t('OFF')}`
                               : t("Free Shipping")}
                        </p>
                      </div>
                      <p className="text-xs text-gray-600">
                        {t('Min order:')} {formatPrice(coupon.minOrderValue || 0)}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="px-4 py-4">
            {filteredProducts.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl text-gray-300 mx-auto mb-4">[ ]</div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">
                  {t('No offers found')}
                </h3>
                <p className="text-gray-600">{t('Try adjusting your filters')}</p>
              </div>
            ) : viewMode === "grid" ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                  {displayedItems.map((product, index) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}>
                      <ProductCard product={product} isFlashSale={true} />
                    </motion.div>
                  ))}
                </div>

                {hasMore && (
                  <div
                    ref={loadMoreRef}
                    className="mt-6 flex flex-col items-center gap-4">
                    {isLoading && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{
                            duration: 1,
                            repeat: Infinity,
                            ease: "linear",
                          }}
                          className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full"
                        />
                        <span className="text-sm">
                          {t('Loading more products...')}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={loadMore}
                      disabled={isLoading}
                      className="px-6 py-3 gradient-red text-white rounded-xl font-semibold hover:shadow-glow-red transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
                      {isLoading ? t("Loading...") : t("Load More")}
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
                      isFlashSale={true}
                    />
                  ))}
                </div>

                {hasMore && (
                  <div
                    ref={loadMoreRef}
                    className="mt-6 flex flex-col items-center gap-4">
                    {isLoading && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{
                            duration: 1,
                            repeat: Infinity,
                            ease: "linear",
                          }}
                          className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full"
                        />
                        <span className="text-sm">
                          {t('Loading more products...')}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={loadMore}
                      disabled={isLoading}
                      className="px-6 py-3 gradient-red text-white rounded-xl font-semibold hover:shadow-glow-red transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
                      {isLoading ? t("Loading...") : t("Load More")}
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

export default MobileOffers;

