import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { FiTag, FiArrowRight } from "react-icons/fi";
import { getNewArrivals } from "../../data/catalogData";
import { usePageTranslation } from "../../../../hooks/usePageTranslation";
import ProductCard from "../../../../shared/components/ProductCard";
import { Button } from "../../../../shared/components/ui";

const NewArrivalsSection = ({ products = null }) => {
  const { getTranslatedText: t } = usePageTranslation(["New Arrivals", "Fresh products just added", "See All"]);
  const fallback = getNewArrivals(6);
  const newArrivals = Array.isArray(products) && products.length > 0
    ? products.slice(0, 6)
    : fallback;

  if (newArrivals.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      whileHover={{ scale: 1.005 }}
      className="relative mx-2 sm:mx-4 my-4 sm:my-6 rounded-card overflow-hidden shadow-card border-2 border-borderToken-goldAccent bg-gradient-to-br from-zinc-950 via-slate-900 to-black text-white"
    >
      {/* Decorative Background Pattern */}
      <div className="absolute inset-0 opacity-10 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-0 left-0 w-48 h-48 bg-brand-primary rounded-full blur-3xl"
          animate={{
            x: [0, 30, 0],
            y: [0, 20, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative p-4 sm:p-6 md:p-8">
        {/* Header Section */}
        <div className="flex items-center justify-between mb-4 sm:mb-6 pb-2 border-b border-borderToken-goldAccent/30">
          <div className="flex items-center gap-3">
            <motion.div
              className="bg-brand-primary/15 border border-brand-primary/40 rounded-full p-2.5 sm:p-3 backdrop-blur-sm shadow-md"
              animate={{
                scale: [1, 1.1, 1],
                rotate: [0, 5, -5, 0],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <FiTag className="text-brand-primary text-lg sm:text-2xl" />
            </motion.div>
            <div>
              <motion.h2
                className="text-xl sm:text-2xl md:text-3xl font-black bg-gradient-to-r from-brand-primary via-amber-200 to-brand-primary bg-clip-text text-transparent drop-shadow-md tracking-tight"
              >
                {t("New Arrivals")}
              </motion.h2>
              <p className="text-xs sm:text-sm text-textColor-muted font-medium">
                {t("Fresh products just added")}
              </p>
            </div>
          </div>

          <Button
            as={Link}
            to="/new-arrivals"
            variant="primary"
            size="sm"
            rightIcon={<FiArrowRight />}
          >
            {t("See All")}
          </Button>
        </div>

        {/* Products Showcase Grid - Consolidated Premium ProductCards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 md:gap-5">
          {newArrivals.map((product, index) => (
            <motion.div
              key={product.id ?? product._id ?? index}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{
                delay: index * 0.08,
                type: "spring",
                stiffness: 100,
                damping: 12,
              }}
            >
              <ProductCard product={product} variant="premium" />
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default NewArrivalsSection;
