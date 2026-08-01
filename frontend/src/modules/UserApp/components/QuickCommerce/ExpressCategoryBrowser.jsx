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

  // Set selected category on mount, from initialCategoryId prop or default to first category
  useEffect(() => {
    if (initialCategoryId) {
      setSelectedCategoryId(initialCategoryId);
    } else if (categories.length > 0 && !selectedCategoryId) {
      setSelectedCategoryId(categories[0]._id || categories[0].id);
    }
  }, [categories, initialCategoryId]);

  // Extract selected category object
  const activeCategory = useMemo(() => {
    return categories.find(
      (cat) => normalizeId(cat._id || cat.id) === normalizeId(selectedCategoryId)
    );
  }, [categories, selectedCategoryId]);

  // Extract subcategories if present
  const subcategories = useMemo(() => {
    if (!activeCategory?.children && !activeCategory?.subcategories) return [];
    return activeCategory.children || activeCategory.subcategories || [];
  }, [activeCategory]);

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
          {categories.map((cat) => {
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
      <div className="flex gap-4 sm:gap-6 items-start">
        {/* Left Vertical Sticky Sidebar (Desktop & Tablet) */}
        <aside className="hidden lg:block w-64 shrink-0 bg-surface rounded-3xl border border-border p-3 sticky top-24 max-h-[calc(100vh-120px)] overflow-y-auto scrollbar-hide shadow-xs">
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-border px-2">
            <h3 className="text-xs uppercase font-extrabold tracking-wider text-content-muted">
              Express Categories
            </h3>
            <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              {categories.length}
            </span>
          </div>

          <div className="space-y-1">
            {categories.map((category) => {
              const catId = category._id || category.id;
              const isActive = normalizeId(catId) === normalizeId(selectedCategoryId);

              return (
                <motion.button
                  key={catId}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => setSelectedCategoryId(catId)}
                  className={`w-full p-2.5 rounded-2xl text-left transition-all relative flex items-center gap-3 ${
                    isActive
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold border border-emerald-500/30 shadow-xs"
                      : "hover:bg-surface-muted text-content font-medium border border-transparent"
                  }`}
                >
                  {/* Left Active Accent Bar */}
                  {isActive && (
                    <motion.div
                      layoutId="activeCategoryIndicator"
                      className="absolute left-0 top-2 bottom-2 w-1.5 bg-emerald-600 rounded-r-full"
                    />
                  )}

                  {/* Category Image Avatar */}
                  <CategoryImage
                    src={category.image || category.icon}
                    alt={category.name}
                    name={category.name}
                    containerClassName="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-border shadow-xs"
                  />

                  {/* Title & Count */}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-tight truncate">{category.name}</p>
                    {category.productCount > 0 && (
                      <p className="text-[10px] text-content-muted font-normal mt-0.5">
                        {category.productCount} items
                      </p>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </aside>

        {/* Right Content Area — Subcategories + Search + Products Grid */}
        <main className="flex-1 min-w-0 bg-surface rounded-3xl border border-border p-3 sm:p-5 shadow-xs min-h-[500px]">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-border/80 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-content tracking-tight">
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

            {/* In-Category Search Box */}
            <div className="relative w-full sm:w-64">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted text-xs" />
              <input
                type="text"
                placeholder={`Search in ${activeCategory?.name || 'category'}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs bg-surface-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-content placeholder:text-content-muted"
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

          {/* Subcategory Chips Selector (if available) */}
          {subcategories.length > 0 && (
            <div className="mb-4 pb-3 border-b border-border/60 overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSubcategoryId(null)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    !selectedSubcategoryId
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 shadow-xs"
                      : "bg-surface-muted text-content-secondary border-border hover:bg-border"
                  }`}
                >
                  All {activeCategory?.name}
                </button>
                {subcategories.map((sub) => {
                  const subId = sub._id || sub.id;
                  const isSubActive = normalizeId(subId) === normalizeId(selectedSubcategoryId);
                  return (
                    <button
                      key={subId}
                      type="button"
                      onClick={() => setSelectedSubcategoryId(subId)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
                        isSubActive
                          ? "bg-emerald-600 text-white border-emerald-500 shadow-xs"
                          : "bg-surface-muted text-content-secondary border-border hover:bg-border"
                      }`}
                    >
                      {sub.name}
                    </button>
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
