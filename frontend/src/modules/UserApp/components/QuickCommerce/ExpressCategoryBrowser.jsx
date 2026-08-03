import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiSearch, FiFilter, FiX, FiZap, FiGrid, FiArrowUpRight } from "react-icons/fi";
import CategoryImage from "../../../../shared/components/CategoryImage";
import ExpressProductCard from "./ExpressProductCard";
import api from "../../../../shared/utils/api";

const normalizeId = (val) => String(val ?? "").trim();

/**
 * ExpressCategoryBrowser — Blinkit-Inspired Split Category & Product Experience
 * Left Sidebar (Sticky) + Right Product Grid + Mobile Horizontal Chips Transformation
 */
const ExpressCategoryBrowser = ({ categories = [], isLoadingCategories = false, initialCategoryId = null }) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialCategoryId);
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  // Filter categories to only include root/main categories (parentId is null/undefined) for sidebar
  const rootCategories = useMemo(() => {
    const roots = categories.filter((cat) => !cat.parentId);
    return roots.length > 0 ? roots : categories;
  }, [categories]);

  // Set selected category on mount, from initialCategoryId prop or default to first root category
  useEffect(() => {
    if (initialCategoryId) {
      setSelectedCategoryId(initialCategoryId);
    } else if (rootCategories.length > 0 && !selectedCategoryId) {
      setSelectedCategoryId(rootCategories[0]._id || rootCategories[0].id);
    }
  }, [rootCategories, initialCategoryId]);

  // Extract selected category object
  const activeCategory = useMemo(() => {
    return categories.find(
      (cat) => normalizeId(cat._id || cat.id) === normalizeId(selectedCategoryId)
    );
  }, [categories, selectedCategoryId]);

  // Extract subcategories for active main category
  const subcategories = useMemo(() => {
    if (!activeCategory) return [];
    if (Array.isArray(activeCategory.children) && activeCategory.children.length > 0) {
      return activeCategory.children;
    }
    if (Array.isArray(activeCategory.subcategories) && activeCategory.subcategories.length > 0) {
      return activeCategory.subcategories;
    }
    const actId = normalizeId(activeCategory._id || activeCategory.id);
    return categories.filter(
      (cat) => cat.parentId && normalizeId(typeof cat.parentId === 'object' ? cat.parentId._id : cat.parentId) === actId
    );
  }, [activeCategory, categories]);

  // Reset selected subcategory when main category changes
  useEffect(() => {
    setSelectedSubcategoryId(null);
  }, [selectedCategoryId]);

  // Fetch products for selected category or subcategory
  useEffect(() => {
    let isCancelled = false;
    const fetchExpressProducts = async () => {
      const targetId = normalizeId(selectedSubcategoryId || selectedCategoryId);
      if (!targetId) return;

      setIsLoadingProducts(true);
      try {
        const response = await api.get("/products", {
          params: {
            category: targetId,
            experience: "quick_commerce",
            page: 1,
            limit: 100,
          },
        });
        if (isCancelled) return;
        const payload = response?.data ?? response;
        const rawProducts = Array.isArray(payload?.products)
          ? payload.products
          : Array.isArray(payload)
          ? payload
          : [];
        setProducts(rawProducts);
      } catch (err) {
        if (isCancelled) return;
        setProducts([]);
      } finally {
        if (!isCancelled) setIsLoadingProducts(false);
      }
    };

    fetchExpressProducts();
    return () => {
      isCancelled = true;
    };
  }, [selectedCategoryId, selectedSubcategoryId]);

  // Filter products by search query
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    return products.filter((p) =>
      p?.name?.toLowerCase().includes(searchQuery.toLowerCase().trim())
    );
  }, [products, searchQuery]);

  return (
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-6 py-2">
      {/* Mobile-Only Horizontal Category Chips Row */}
      <div className="lg:hidden mb-3 overflow-x-auto scrollbar-hide px-1">
        <div className="flex items-center gap-2 py-1">
          {rootCategories.map((cat) => {
            const catId = cat._id || cat.id;
            const isActive = normalizeId(catId) === normalizeId(selectedCategoryId);
            return (
              <button
                key={catId}
                type="button"
                onClick={() => setSelectedCategoryId(catId)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all border flex items-center gap-2 ${
                  isActive
                    ? "bg-emerald-600 text-white border-emerald-500 shadow-sm scale-102"
                    : "bg-surface text-content-secondary border-border hover:bg-surface-muted"
                }`}
              >
                <CategoryImage
                  src={cat.image || cat.icon}
                  alt={cat.name}
                  name={cat.name}
                  containerClassName="w-5 h-5 rounded-full overflow-hidden shrink-0 border border-white/40"
                />
                <span>{cat.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Split Layout — Sticky Sidebar (Desktop/Tablet) + Products Grid */}
      <div className="flex gap-2 sm:gap-4 items-start min-h-[600px]">
        {/* Left Vertical Sticky Sidebar (Matching Marketplace B2C/B2B UI) */}
        <aside className="w-20 sm:w-24 md:w-28 lg:w-32 shrink-0 bg-surface-muted border-r border-border rounded-2xl p-1 sticky top-24 max-h-[calc(100vh-120px)] overflow-y-auto scrollbar-hide shadow-xs">
          <div className="space-y-1 py-1">
            {rootCategories.map((category) => {
              const catId = category._id || category.id;
              const isActive = normalizeId(catId) === normalizeId(selectedCategoryId);

              return (
                <motion.button
                  key={catId}
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={() => setSelectedCategoryId(catId)}
                  className={`w-full py-2.5 px-1.5 text-left transition-all duration-200 relative flex flex-col items-center gap-1.5 rounded-xl ${
                    isActive ? "bg-surface shadow-sm" : "hover:bg-surface-muted/80"
                  }`}
                >
                  {/* Left Active Accent Bar */}
                  {isActive && (
                    <div className="absolute left-0 top-2 bottom-2 w-1 bg-amber-400 rounded-r-full shadow-sm" />
                  )}

                  {/* Category Image Avatar */}
                  <CategoryImage
                    src={category.image || category.icon}
                    alt={category.name}
                    name={category.name}
                    containerClassName={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl overflow-hidden bg-surface-muted shrink-0 transition-all duration-200 shadow-xs border ${
                      isActive
                        ? "ring-2 ring-amber-400 ring-offset-2 scale-105 border-amber-400 shadow-md"
                        : "border-border hover:border-amber-400/50"
                    }`}
                  />

                  {/* Title & Count */}
                  <span
                    className={`text-[11px] sm:text-xs font-semibold text-center leading-snug transition-colors line-clamp-2 px-0.5 ${
                      isActive ? "text-amber-500 font-bold" : "text-content-secondary"
                    }`}
                  >
                    {category.name}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </aside>

        {/* Right Content Area — Subcategories + Search + Products Grid */}
        <main className="flex-1 min-w-0 bg-surface rounded-2xl border border-border p-2 sm:p-4 shadow-xs min-h-[500px]">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-border mb-3">
            <div className="flex items-center gap-2.5">
              <CategoryImage
                src={activeCategory?.image || activeCategory?.icon}
                alt={activeCategory?.name}
                name={activeCategory?.name}
                containerClassName="w-10 h-10 sm:w-11 sm:h-11 rounded-xl overflow-hidden bg-surface-muted shrink-0 border border-border shadow-xs"
              />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-content tracking-tight">
                    {activeCategory?.name || "Categories"}
                  </h2>
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <FiZap className="text-[11px] fill-amber-500" />
                    10-15 min delivery
                  </span>
                </div>
                <p className="text-xs text-content-muted font-medium mt-0.5">
                  {filteredProducts.length} items available in this category
                </p>
              </div>
            </div>

            {/* In-Category Search Box */}
            <div className="relative w-full sm:w-64">
              <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-content-muted text-xs" />
              <input
                type="text"
                placeholder={`Search in ${activeCategory?.name || 'category'}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs bg-surface-muted border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-400 text-content placeholder:text-content-muted"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-content-muted hover:text-content p-1"
                >
                  <FiX className="text-xs" />
                </button>
              )}
            </div>
          </div>

          {/* Subcategory Chips Selector (Matching B2C/B2B Marketplace UI 1-to-1) */}
          {subcategories.length > 0 && (
            <div className="mb-4 pb-3 border-b border-border overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-2 py-1">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={() => setSelectedSubcategoryId(null)}
                  className={`flex-shrink-0 px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap border flex items-center gap-2 shadow-xs ${
                    !selectedSubcategoryId
                      ? "bg-amber-400 text-black border-amber-400 shadow-md scale-102 font-bold"
                      : "bg-surface-muted text-content-secondary border-border hover:bg-border"
                  }`}
                >
                  <span>All {activeCategory?.name}</span>
                </motion.button>
                {subcategories.map((sub) => {
                  const subId = sub._id || sub.id;
                  const isSubActive = normalizeId(subId) === normalizeId(selectedSubcategoryId);
                  return (
                    <motion.button
                      key={subId}
                      whileTap={{ scale: 0.97 }}
                      type="button"
                      onClick={() => setSelectedSubcategoryId(subId)}
                      className={`flex-shrink-0 px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap border flex items-center gap-2.5 shadow-xs ${
                        isSubActive
                          ? "bg-amber-400 text-black border-amber-400 shadow-md scale-102 font-bold"
                          : "bg-surface-muted text-content-secondary border-border hover:bg-border"
                      }`}
                    >
                      <CategoryImage
                        src={sub.image || sub.icon}
                        alt={sub.name}
                        name={sub.name}
                        containerClassName="w-7 h-7 sm:w-8 sm:h-8 rounded-lg overflow-hidden shrink-0 border border-white/40 shadow-xs"
                      />
                      <span>{sub.name}</span>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Products Grid */}
          {isLoadingProducts ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {Array.from({ length: 10 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-64 rounded-2xl bg-surface-muted animate-pulse border border-border/40"
                />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-16 h-16 rounded-3xl bg-surface-muted border border-border flex items-center justify-center text-3xl mx-auto mb-3">
                📦
              </div>
              <h3 className="text-base font-extrabold text-content mb-1">
                No express items found
              </h3>
              <p className="text-xs text-content-muted max-w-sm mx-auto">
                {searchQuery
                  ? `No items match "${searchQuery}". Try a different term or clear your search.`
                  : "Items for this category are being updated. Check back shortly or browse other categories."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredProducts.map((product) => (
                <ExpressProductCard
                  key={product._id || product.id}
                  product={product}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default ExpressCategoryBrowser;
