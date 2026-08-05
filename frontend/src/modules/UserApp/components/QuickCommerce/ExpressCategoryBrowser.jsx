import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { FiSearch, FiX, FiZap } from "react-icons/fi";
import CategoryImage from "../../../../shared/components/CategoryImage";
import ExpressProductCard from "./ExpressProductCard";
import { Badge, Input, EmptyState } from "../../../../shared/components/ui";
import api from "../../../../shared/utils/api";

const normalizeId = (val) => String(val ?? "").trim();

/**
 * ExpressCategoryBrowser — Split Category & Product Experience
 * Refactored to fully adopt DwellMart Design System.
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
                    ? "bg-brand-primary text-slate-950 border-brand-primaryHover shadow-sm scale-102 font-black"
                    : "bg-surface-card text-textColor-secondary border-borderToken-default hover:bg-surface-background"
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
        {/* Left Vertical Sticky Sidebar */}
        <aside className="w-20 sm:w-24 md:w-28 lg:w-32 shrink-0 bg-surface-background border-r border-borderToken-default rounded-card p-1 sticky top-24 max-h-[calc(100vh-120px)] overflow-y-auto scrollbar-hide shadow-xs">
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
                    containerClassName={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl overflow-hidden bg-surface-background shrink-0 transition-all duration-200 shadow-xs border ${
                      isActive
                        ? "ring-2 ring-brand-primary ring-offset-2 scale-105 border-brand-primary shadow-md"
                        : "border-borderToken-default hover:border-brand-primary/50"
                    }`}
                  />

                  {/* Title & Count */}
                  <span
                    className={`text-[11px] sm:text-xs font-semibold text-center leading-snug transition-colors line-clamp-2 px-0.5 ${
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

        {/* Right Content Area — Subcategories + Search + Products Grid */}
        <main className="flex-1 min-w-0 bg-surface-card rounded-card border border-borderToken-default p-2 sm:p-4 shadow-xs min-h-[500px]">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-borderToken-default mb-3">
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
                  {filteredProducts.length} items available in this category
                </p>
              </div>
            </div>

            {/* In-Category Search Box using Shared Input */}
            <div className="w-full sm:w-64">
              <Input
                leftIcon={<FiSearch className="text-textColor-muted text-xs" />}
                placeholder={`Search in ${activeCategory?.name || 'category'}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                rightIcon={
                  searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="text-textColor-muted hover:text-textColor-primary p-1 cursor-pointer"
                    >
                      <FiX className="text-xs" />
                    </button>
                  ) : null
                }
              />
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
          ) : filteredProducts.length === 0 ? (
            <div className="py-12">
              <EmptyState
                variant="no-results"
                title="No Express Items Found"
                description={
                  searchQuery
                    ? `No items match "${searchQuery}". Try a different search query.`
                    : "Items for this category are currently being updated. Please check back shortly."
                }
              />
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
