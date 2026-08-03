import { useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { FiThumbsUp, FiArrowRight } from "react-icons/fi";
import ProductCard from "../../../../shared/components/ProductCard";
import { getRecommendedProducts } from "../../data/catalogData";
import { usePageTranslation } from "../../../../hooks/usePageTranslation";

const RecommendedSection = ({ products = null }) => {
  const { getTranslatedText: t } = usePageTranslation(["Recommended for You", "Curated just for you", "See All"]);
  const recommended = useMemo(() => {
    if (Array.isArray(products) && products.length > 0) {
      return products.slice(0, 6);
    }
    return getRecommendedProducts(6);
  }, [products]);

  if (recommended.length === 0) {
    return null;
  }

  return (
    <div className="px-4 py-5 bg-gradient-to-br from-amber-50/50 via-white to-yellow-50/30 rounded-2xl mx-2">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-amber-500 to-yellow-500 rounded-xl shadow-md">
            <FiThumbsUp className="text-white text-lg" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 leading-tight">
              {t("Recommended for You")}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{t("Curated just for you")}</p>
          </div>
        </div>
        <Link
          to="/search"
          className="flex items-center gap-1 text-sm text-brand-primary font-semibold hover:underline transition-colors active:scale-95">
          <span>{t("See All")}</span>
          <FiArrowRight className="text-sm" />
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
        {recommended.map((product, index) => (
          <motion.div
            key={product.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={index === 5 ? "xl:hidden" : ""}
            transition={{ delay: index * 0.05 }}
          >
            <ProductCard product={product} />
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default RecommendedSection;
