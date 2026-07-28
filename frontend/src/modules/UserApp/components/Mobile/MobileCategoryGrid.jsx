import { Link } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { categories as fallbackCategories } from "../../../../data/categories";
import LazyImage from "../../../../shared/components/LazyImage";
import { useCategoryStore } from "../../../../shared/store/categoryStore";
import { getPlaceholderImage } from "../../../../shared/utils/helpers";
import { usePageTranslation } from "../../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../../hooks/useDynamicTranslation";
import { useState } from "react";

const normalizeId = (value) => String(value ?? "").trim();

const MobileCategoryGrid = () => {
  const { categories, initialize, getRootCategories } = useCategoryStore();
  const { translateObject } = useDynamicTranslation();
  const { getTranslatedText: t } = usePageTranslation(["Browse Categories"]);
  const [translatedCategories, setTranslatedCategories] = useState([]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const displayCategories = useMemo(() => {
    const roots = getRootCategories().filter((cat) => cat.isActive !== false);
    let mapped = [];

    if (!roots.length) {
      mapped = [...fallbackCategories];
    } else {
      mapped = roots.map((cat) => {
        const fallbackCat = fallbackCategories.find(
          (fc) =>
            normalizeId(fc.id) === normalizeId(cat.id) ||
            fc.name?.toLowerCase() === cat.name?.toLowerCase()
        );
        return {
          ...(fallbackCat || {}),
          ...cat,
          image: cat.image || fallbackCat?.image || "",
        };
      });
    }

    return mapped;
  }, [categories, getRootCategories]);

  useEffect(() => {
    const translate = async () => {
      if (displayCategories.length > 0) {
        const translated = await Promise.all(
          displayCategories.map(cat => translateObject(cat, ['name']))
        );
        setTranslatedCategories(translated);
      }
    };
    translate();
  }, [displayCategories, translateObject]);

  const itemsToDisplay = (translatedCategories.length > 0 ? translatedCategories : displayCategories).slice(0, 10);

  return (
    <div className="px-4 py-4 w-full">
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100/80 w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800 tracking-tight">
            {t("Browse Categories")}
          </h2>
          <Link
            to="/categories"
            className="text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors"
          >
            See All &rarr;
          </Link>
        </div>

        {/* Desktop / Tablet Full Width Justified Grid */}
        <div className="hidden md:grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-4 w-full items-start justify-between">
          {itemsToDisplay.map((category, index) => (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.03 }}
              className="flex flex-col items-center w-full group"
            >
              <Link
                to={category.path || `/category/${category.id}`}
                className="flex flex-col items-center gap-2 w-full"
              >
                <div className="w-full aspect-square rounded-2xl overflow-hidden bg-gray-50 ring-2 ring-gray-100 group-hover:ring-amber-400 group-hover:shadow-md transition-all">
                  <LazyImage
                    src={category.image}
                    alt={category.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      e.target.src = getPlaceholderImage(64, 64, category.name?.charAt(0) || 'C');
                    }}
                  />
                </div>
                <span className="text-xs font-semibold text-gray-700 text-center line-clamp-2 group-hover:text-primary-600">
                  {category.name}
                </span>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Mobile Horizontal Scroll */}
        <div className="md:hidden flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-1 px-1">
          {itemsToDisplay.map((category, index) => (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              className="flex-shrink-0"
            >
              <Link
                to={category.path || `/category/${category.id}`}
                className="flex flex-col items-center gap-2 w-20"
              >
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 ring-2 ring-gray-200">
                  <LazyImage
                    src={category.image}
                    alt={category.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.src = getPlaceholderImage(64, 64, category.name?.charAt(0) || 'C');
                    }}
                  />
                </div>
                <span className="text-xs font-semibold text-gray-700 text-center line-clamp-2">
                  {category.name}
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MobileCategoryGrid;
