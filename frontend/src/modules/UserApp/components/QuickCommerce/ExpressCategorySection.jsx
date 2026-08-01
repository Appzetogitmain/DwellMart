import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiChevronRight, FiZap } from "react-icons/fi";
import { motion } from "framer-motion";
import ExpressProductCard from "./ExpressProductCard";
import CategoryImage from "../../../../shared/components/CategoryImage";
import api from "../../../../shared/utils/api";

/**
 * ExpressCategorySection — Homepage Category Preview Row
 * Displays category header, 6-8 product cards, and "See All →" button linking to /quick/categories?category=ID
 */
const ExpressCategorySection = ({ category }) => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const categoryId = category?._id || category?.id;

  useEffect(() => {
    let isCancelled = false;
    const fetchPreviewProducts = async () => {
      if (!categoryId) return;
      setIsLoading(true);
      try {
        const response = await api.get("/products", {
          params: {
            category: categoryId,
            experience: "quick_commerce",
            page: 1,
            limit: 8,
          },
        });
        if (isCancelled) return;
        const payload = response?.data ?? response;
        const raw = Array.isArray(payload?.products)
          ? payload.products
          : Array.isArray(payload)
          ? payload
          : [];
        setProducts(raw);
      } catch (err) {
        if (isCancelled) return;
        setProducts([]);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    fetchPreviewProducts();
    return () => {
      isCancelled = true;
    };
  }, [categoryId]);

  if (!isLoading && products.length === 0) {
    return null; // Gracefully hide empty category sections on homepage
  }

  const handleSeeAll = () => {
    navigate(`/quick/categories?category=${categoryId}`);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 my-4">
      {/* Category Section Header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <CategoryImage
            src={category?.image || category?.icon}
            alt={category?.name}
            name={category?.name}
            containerClassName="w-8 h-8 rounded-xl overflow-hidden shrink-0 border border-border shadow-xs"
          />
          <div>
            <h3 className="text-sm sm:text-base font-black text-content tracking-tight">
              {category?.name}
            </h3>
            {products.length > 0 && (
              <p className="text-[10px] text-content-muted font-semibold">
                10-15 Min Delivery
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSeeAll}
          className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs transition-all flex items-center gap-1 shrink-0"
        >
          <span>See All</span>
          <FiChevronRight className="text-xs" />
        </button>
      </div>

      {/* Product Preview Cards (Horizontal scroll on mobile/tablet, grid on desktop) */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-60 rounded-2xl bg-surface animate-pulse border border-border/40"
            />
          ))}
        </div>
      ) : (
        <div className="flex sm:grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 overflow-x-auto scrollbar-hide pb-1">
          {products.map((product) => (
            <div
              key={product._id || product.id}
              className="w-40 sm:w-auto shrink-0 sm:shrink flex-1"
            >
              <ExpressProductCard product={product} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ExpressCategorySection;
