import { useState, useMemo, useEffect, useRef } from "react";
import { FiArrowLeft, FiFilter, FiGrid, FiList, FiX, FiSearch } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import MobileLayout from "../components/Layout/MobileLayout";
import ProductCard from "../../../shared/components/ProductCard";
import ProductListItem from "../components/Mobile/ProductListItem";
import { categories as fallbackCategories } from "../../../data/categories";
import PageTransition from "../../../shared/components/PageTransition";
import useInfiniteScroll from "../../../shared/hooks/useInfiniteScroll";
import api from "../../../shared/utils/api";
import { useCategoryStore } from "../../../shared/store/categoryStore";
import { usePageTranslation } from "../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../hooks/useDynamicTranslation";
import ProductGridSkeleton from "../../../shared/components/Skeletons/ProductGridSkeleton";

const normalizeProduct = (raw) => {
  const categoryObj =
    raw?.categoryId && typeof raw.categoryId === "object" ? raw.categoryId : null;

  return {
    ...raw,
    id: raw?._id || raw?.id,
    categoryId: String(categoryObj?._id || raw?.categoryId || ""),
    image: raw?.image || raw?.images?.[0] || "",
    images: Array.isArray(raw?.images) ? raw.images : [],
    price: Number(raw?.price) || 0,
    originalPrice:
      raw?.originalPrice !== undefined ? Number(raw.originalPrice) : undefined,
    rating: Number(raw?.rating) || 0,
  };
};

const MobileDailyDeals = () => {
  const { getTranslatedText: t } = usePageTranslation([
    'Daily Deals', 'Search in deals...', 'Filters', 'Category',
    'All Categories', 'Price Range', 'Min Price', 'Max Price',
    'Clear All', 'Apply Filters', 'No deals found',
    'Check back later for new deals.', 'Loading...', 'Load More'
  ]);
  const { translateArray, translateText } = useDynamicTranslation();

  const navigate = useNavigate();
  const { categories: storeCategories, initialize: initializeCategories } = useCategoryStore();
  const [allDeals, setAllDeals] = useState([]);
  const [translatedCategories, setTranslatedCategories] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("grid");
  const [filters, setFilters] = useState({
    category: "",
    minPrice: "",
    maxPrice: "",
    minRating: "",
  });
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);

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
    if (categories.length === 0) return;
    translateArray(categories, ['name']).then(setTranslatedCategories);
  }, [categories, translateArray]);

  useEffect(() => {
    let cancelled = false;

    const loadDeals = async () => {
      setIsLoadingInitial(true);
      try {
        const campaignList = await api.get("/campaigns", {
          params: { type: "daily_deal", limit: 20 },
        });
        const campaignsPayload = campaignList?.data ?? campaignList;
        const slugs = Array.isArray(campaignsPayload)
          ? campaignsPayload
            .map((c) => String(c?.slug || "").trim())
            .filter(Boolean)
          : [];

        if (!slugs.length) {
          if (!cancelled) {
            setAllDeals([]);
            setIsLoadingInitial(false);
          }
          return;
        }

        const details = await Promise.allSettled(
          [...new Set(slugs)].map((slug) => api.get(`/campaigns/${slug}`))
        );

        const map = new Map();
        details
          .filter((result) => result.status === "fulfilled")
          .forEach((result) => {
            const payload = result.value?.data ?? result.value;
            const products = Array.isArray(payload?.products) ? payload.products : [];
            products.forEach((product) => {
              const normalized = normalizeProduct(product);
              if (!normalized.id) return;
              if (!map.has(normalized.id)) map.set(normalized.id, normalized);
            });
          });

        if (!cancelled) setAllDeals(Array.from(map.values()));
      } catch {
        if (!cancelled) setAllDeals([]);
      } finally {
        if (!cancelled) setIsLoadingInitial(false);
      }
    };

    loadDeals();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredProducts = useMemo(() => {
    let result = allDeals;

    if (filters.category) {
      result = result.filter(
        (product) => String(product.categoryId || "") === String(filters.category)
      );
    }
    if (searchQuery) {
      result = result.filter((product) =>
        String(product.name || "").toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    if (filters.minPrice) {
      result = result.filter((product) => product.price >= parseFloat(filters.minPrice));
    }
    if (filters.maxPrice) {
      result = result.filter((product) => product.price <= parseFloat(filters.maxPrice));
    }
    if (filters.minRating) {
      result = result.filter(
        (product) => product.rating >= parseFloat(filters.minRating)
      );
    }

    return result;
  }, [allDeals, filters, searchQuery]);

  const { displayedItems, hasMore, isLoading, loadMore, loadMoreRef } = useInfiniteScroll(
    filteredProducts,
    10,
    10
  );

  const filterButtonRef = useRef(null);

  const handleFilterChange = (name, value) => {
    setFilters({ ...filters, [name]: value });
  };

  const clearFilters = () => {
    setFilters({ category: "", minPrice: "", maxPrice: "", minRating: "" });
    setSearchQuery("");
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

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={true}>
        <div className="w-full pb-24 min-h-screen bg-surface-muted">
          <div className="px-4 py-4 bg-surface border-b border-border sticky top-0 z-30">
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-surface-muted rounded-full transition-colors"
              >
                <FiArrowLeft className="text-xl text-content-secondary" />
              </button>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-content">{t('Daily Deals')}</h1>
                <div className="relative mt-1">
                  <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted text-xs" />
                  <input
                    type="text"
                    placeholder={t('Search in deals...')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-10 py-1.5 bg-surface-muted border border-border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-brand-primary text-content"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted p-1 hover:bg-border rounded-full transition-colors"
                    >
                      <FiX className="text-xs" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center bg-surface-muted rounded-lg p-1 border border-border">
                  <button
                    onClick={() => setViewMode("list")}
                    className={`p-1 rounded transition-colors ${viewMode === "list" ? "bg-surface text-brand-primary shadow-sm" : "text-content-secondary"
                      }`}
                  >
                    <FiList className="text-sm" />
                  </button>
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-1 rounded transition-colors ${viewMode === "grid" ? "bg-surface text-brand-primary shadow-sm" : "text-content-secondary"
                      }`}
                  >
                    <FiGrid className="text-sm" />
                  </button>
                </div>
                <div ref={filterButtonRef} className="relative">
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`p-1.5 glass-card rounded-lg hover:bg-surface/80 transition-colors ${showFilters ? "bg-surface/80" : ""}`}
                  >
                    <FiFilter className={`text-sm transition-colors ${hasActiveFilters ? "text-brand-primary" : "text-content-secondary"}`} />
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
                          transition={{ type: "spring", stiffness: 300, damping: 30 }}
                          className="filter-dropdown absolute right-0 top-full w-56 bg-surface rounded-xl shadow-2xl border border-border z-[10001] overflow-hidden"
                          style={{ marginTop: "-50px" }}
                        >
                          <div className="flex items-center justify-between px-2 py-1.5 border-b border-border bg-surface-muted">
                            <h3 className="text-sm font-bold text-content">{t('Filters')}</h3>
                            <button onClick={() => setShowFilters(false)} className="p-0.5 hover:bg-border rounded-full">
                              <FiX className="text-sm text-content-secondary" />
                            </button>
                          </div>
                          <div className="max-h-[50vh] overflow-y-auto scrollbar-hide p-2 space-y-2">
                            <div>
                              <h4 className="font-semibold text-content-secondary mb-1 text-xs">{t('Category')}</h4>
                              <select
                                value={filters.category}
                                onChange={(e) => handleFilterChange("category", e.target.value)}
                                className="w-full px-2 py-1.5 rounded-md border border-border bg-surface text-content focus:outline-none focus:ring-1 focus:ring-brand-primary text-xs"
                              >
                                <option value="">{t('All Categories')}</option>
                                {translatedCategories.map((cat) => (
                                  <option key={cat.id} value={String(cat.id)}>
                                    {cat.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <h4 className="font-semibold text-content-secondary mb-1 text-xs">{t('Price Range')}</h4>
                              <div className="space-y-1.5">
                                <input type="number" placeholder={t('Min Price')} value={filters.minPrice} onChange={(e) => handleFilterChange("minPrice", e.target.value)} className="w-full px-2 py-1.5 rounded-md border border-border bg-surface text-content focus:outline-none focus:ring-1 focus:ring-brand-primary text-xs" />
                                <input type="number" placeholder={t('Max Price')} value={filters.maxPrice} onChange={(e) => handleFilterChange("maxPrice", e.target.value)} className="w-full px-2 py-1.5 rounded-md border border-border bg-surface text-content focus:outline-none focus:ring-1 focus:ring-brand-primary text-xs" />
                              </div>
                            </div>
                          </div>
                          <div className="border-t border-border p-2 bg-surface-muted space-y-1.5">
                            <button onClick={clearFilters} className="w-full py-1.5 bg-border text-content-secondary rounded-md font-semibold text-xs hover:bg-border-strong">{t('Clear All')}</button>
                            <button onClick={() => setShowFilters(false)} className="w-full py-1.5 bg-brand-primary text-black rounded-md font-semibold text-xs hover:bg-brand-primaryHover">{t('Apply Filters')}</button>
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 py-4">
            {isLoadingInitial ? (
              <ProductGridSkeleton count={6} columns={viewMode === 'grid' ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1'} />
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl text-content-muted mx-auto mb-4">[ ]</div>
                <h3 className="text-xl font-bold text-content mb-2">{t('No deals found')}</h3>
                <p className="text-content-secondary">{t('Check back later for new deals.')}</p>
              </div>
            ) : viewMode === "grid" ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                  {displayedItems.map((product, index) => (
                    <motion.div key={product.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
                      <ProductCard product={product} isFlashSale={true} />
                    </motion.div>
                  ))}
                </div>
                {hasMore && (
                  <div ref={loadMoreRef} className="mt-6 flex flex-col items-center gap-4">
                    <button onClick={loadMore} disabled={isLoading} className="px-6 py-3 bg-brand-primary text-black rounded-xl font-semibold hover:bg-brand-primaryHover disabled:opacity-50">
                      {isLoading ? t("Loading...") : t("Load More")}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="space-y-3">
                  {displayedItems.map((product, index) => (
                    <ProductListItem key={product.id} product={product} index={index} isFlashSale={true} />
                  ))}
                </div>
                {hasMore && (
                  <div ref={loadMoreRef} className="mt-6 flex flex-col items-center gap-4">
                    <button onClick={loadMore} disabled={isLoading} className="px-6 py-3 bg-brand-primary text-black rounded-xl font-semibold hover:bg-brand-primaryHover disabled:opacity-50">
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

export default MobileDailyDeals;
