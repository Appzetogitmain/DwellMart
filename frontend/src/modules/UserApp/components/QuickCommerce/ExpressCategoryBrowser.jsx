import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { FiZap } from "react-icons/fi";
import CategoryImage from "../../../../shared/components/CategoryImage";
import ExpressProductCard from "./ExpressProductCard";
import { Badge, EmptyState } from "../../../../shared/components/ui";
import api from "../../../../shared/utils/api";

const normalizeId = (val) => String(val ?? "").trim();

/**
 * ExpressCategoryBrowser — Split Category & Product Experience
 * Refactored to fully adopt DwellMart Design System.
 */
const ExpressCategoryBrowser = ({ categories = [], isLoadingCategories = false, initialCategoryId = null }) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialCategoryId);
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState(null);
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
      } catch {
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

  return (
    <div className="w-full max-w-7xl mx-auto px-1.5 sm:px-6 py-1">
      {/* Main Split Layout — Sticky Sidebar + Products Grid */}
      <div className="flex gap-2 sm:gap-4 items-start">
        {/* Left Vertical Sticky Sidebar */}
        <aside className="w-20 sm:w-24 md:w-28 lg:w-32 shrink-0 bg-surface-background border-r border-borderToken-default rounded-card p-1 sticky top-20 max-h-[calc(100vh-100px)] overflow-y-auto scrollbar-hide shadow-xs">
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
                  className={`w-full py-2 px-1 text-left transition-all duration-200 relative flex flex-col items-center gap-1 rounded-xl ${
                    isActive ? "bg-surface-card shadow-sm" : "hover:bg-surface-card/60"
                  }`}
                >
                  {/* Left Active Accent Bar */}
                  {isActive && (
                    <div className="absolute left-0 top-2 bottom-2 w-1 bg-brand-primary rounded-r-full shadow-sm" />
                  )}

                  {/* Category Image Avatar */}
                  <CategoryImage
                    src={category.image || category.icon}
                    alt={category.name}
                    name={category.name}
                    containerClassName={`w-11 h-11 sm:w-14 sm:h-14 rounded-2xl overflow-hidden bg-surface-background shrink-0 transition-all duration-200 shadow-xs border ${
                      isActive
                        ? "ring-2 ring-brand-primary ring-offset-2 scale-105 border-brand-primary shadow-md"
                        : "border-borderToken-default hover:border-brand-primary/50"
                    }`}
                  />

                  {/* Title & Count */}
                  <span
                    className={`text-[10px] sm:text-xs font-semibold text-center leading-tight transition-colors line-clamp-2 px-0.5 ${
                      isActive ? "text-textColor-brand font-black" : "text-textColor-secondary"
                    }`}
                  >
                    {category.name}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </aside>

        {/* Right Content Area — Subcategories + Products Grid */}
        <main className="flex-1 min-w-0 bg-surface-card rounded-card border border-borderToken-default p-2 sm:p-4 shadow-xs">
          {/* Header Bar */}
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-borderToken-default mb-3">
            <div className="flex items-center gap-2.5">
              <CategoryImage
                src={activeCategory?.image || activeCategory?.icon}
                alt={activeCategory?.name}
                name={activeCategory?.name}
                containerClassName="w-10 h-10 sm:w-11 sm:h-11 rounded-xl overflow-hidden bg-surface-background shrink-0 border border-borderToken-default shadow-xs"
              />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black text-textColor-primary tracking-tight">
                    {activeCategory?.name || "Categories"}
                  </h2>
                  <Badge variant="gold" size="sm" className="!normal-case gap-1">
                    <FiZap className="text-[11px] fill-amber-500 text-amber-500" />
                    <span>10-15 min delivery</span>
                  </Badge>
                </div>
                <p className="text-xs text-textColor-muted font-semibold mt-0.5">
                  {products.length} items available in this category
                </p>
              </div>
            </div>
          </div>

          {/* Subcategory Chips Selector */}
          {subcategories.length > 0 && (
            <div className="mb-4 pb-3 border-b border-borderToken-default overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-2 py-1">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={() => setSelectedSubcategoryId(null)}
                  className={`flex-shrink-0 px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm transition-all duration-200 whitespace-nowrap border flex items-center gap-2 shadow-xs cursor-pointer ${
                    !selectedSubcategoryId
                      ? "bg-brand-primary text-slate-950 border-brand-primary shadow-md scale-102 font-black"
                      : "bg-surface-background text-textColor-secondary border-borderToken-default hover:bg-borderToken-light font-semibold"
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
                      className={`flex-shrink-0 px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm transition-all duration-200 whitespace-nowrap border flex items-center gap-2.5 shadow-xs cursor-pointer ${
                        isSubActive
                          ? "bg-brand-primary text-slate-950 border-brand-primary shadow-md scale-102 font-black"
                          : "bg-surface-background text-textColor-secondary border-borderToken-default hover:bg-borderToken-light font-semibold"
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
                  className="h-64 rounded-card bg-surface-background animate-pulse border border-borderToken-default"
                />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="py-12">
              <EmptyState
                variant="no-results"
                title="No Express Items Found"
                description="Items for this category are currently being updated. Please check back shortly."
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {products.map((product) => (
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
