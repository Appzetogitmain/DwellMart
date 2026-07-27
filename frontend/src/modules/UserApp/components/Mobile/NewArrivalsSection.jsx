import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { FiTag, FiArrowRight } from "react-icons/fi";
import LazyImage from "../../../../shared/components/LazyImage";
import { getNewArrivals } from "../../data/catalogData";
import { usePageTranslation } from "../../../../hooks/usePageTranslation";
import { formatPrice } from "../../../../shared/utils/helpers";

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
      className="relative mx-2 sm:mx-4 my-4 sm:my-6 rounded-2xl overflow-hidden shadow-2xl border-2 border-[#ffc101]/50 bg-gradient-to-br from-zinc-950 via-slate-900 to-black">
      {/* Animated Gradient Overlay */}
      <motion.div
        className="absolute inset-0 opacity-20 pointer-events-none"
        animate={{
          background: [
            "linear-gradient(45deg, rgba(255,193,1,0.15) 0%, transparent 50%)",
            "linear-gradient(135deg, rgba(255,193,1,0.15) 0%, transparent 50%)",
            "linear-gradient(225deg, rgba(255,193,1,0.15) 0%, transparent 50%)",
            "linear-gradient(315deg, rgba(255,193,1,0.15) 0%, transparent 50%)",
            "linear-gradient(45deg, rgba(255,193,1,0.15) 0%, transparent 50%)",
          ],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "linear",
        }}
      />

      {/* Decorative Background Pattern */}
      <div className="absolute inset-0 opacity-10 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-0 left-0 w-48 h-48 bg-[#ffc101] rounded-full blur-3xl"
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
        <motion.div
          className="absolute bottom-0 right-0 w-40 h-40 bg-[#ffc101] rounded-full blur-3xl"
          animate={{
            x: [0, -25, 0],
            y: [0, -15, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.5,
          }}
        />
      </div>

      {/* Content */}
      <div className="relative p-4 sm:p-6 md:p-8">
        {/* Header Section */}
        <div className="flex items-center justify-between mb-4 sm:mb-6 pb-2 border-b border-[#ffc101]/20">
          <div className="flex items-center gap-3">
            <motion.div
              className="bg-[#ffc101]/15 border border-[#ffc101]/40 rounded-full p-2.5 sm:p-3 backdrop-blur-sm shadow-md"
              animate={{
                scale: [1, 1.1, 1],
                rotate: [0, 5, -5, 0],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}>
              <FiTag className="text-[#ffc101] text-lg sm:text-2xl" />
            </motion.div>
            <div>
              <motion.h2
                className="text-xl sm:text-2xl md:text-3xl font-black bg-gradient-to-r from-[#ffc101] via-amber-200 to-[#ffc101] bg-clip-text text-transparent drop-shadow-md tracking-tight">
                {t("New Arrivals")}
              </motion.h2>
              <p className="text-xs sm:text-sm text-gray-300 font-medium">
                {t("Fresh products just added")}
              </p>
            </div>
          </div>

          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Link
              to="/new-arrivals"
              className="flex items-center gap-1.5 bg-[#ffc101] text-black text-xs sm:text-sm font-extrabold px-4 py-2 rounded-xl hover:bg-[#e6ac00] transition-all shadow-lg">
              <span>{t("See All")}</span>
              <FiArrowRight className="text-sm font-bold" />
            </Link>
          </motion.div>
        </div>

        {/* Products Showcase Grid - Desktop Optimized */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 md:gap-5">
          {newArrivals.map((product, index) => {
            const productLink = `/product/${product.id ?? product._id}`;
            return (
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
                className="relative group">
                <Link to={productLink} className="block h-full">
                  <div className="bg-zinc-900/90 rounded-2xl overflow-hidden border border-[#ffc101]/30 hover:border-[#ffc101] transition-all duration-300 shadow-lg group-hover:shadow-amber-500/20 flex flex-col h-full">
                    {/* Image Container */}
                    <div className="w-full h-36 sm:h-44 md:h-48 lg:h-52 relative overflow-hidden bg-black/40">
                      <LazyImage
                        src={product.image || product.images?.[0]}
                        alt={product.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-108"
                        onError={(e) => {
                          e.target.src =
                            "https://via.placeholder.com/300x300?text=Product+Image";
                        }}
                      />
                      {/* Gradient Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />
                      
                      {/* New Badge */}
                      <span className="absolute top-2 left-2 bg-[#ffc101] text-black text-[10px] sm:text-xs font-black px-2 py-0.5 rounded-md shadow-md uppercase tracking-wider">
                        NEW
                      </span>
                    </div>

                    {/* Product Details */}
                    <div className="p-3 flex-1 flex flex-col justify-between bg-zinc-900/95 border-t border-[#ffc101]/15">
                      <h4 className="text-xs sm:text-sm font-bold text-white line-clamp-1 group-hover:text-[#ffc101] transition-colors mb-1">
                        {product.name}
                      </h4>
                      <div className="flex items-center justify-between mt-auto">
                        <span className="text-xs sm:text-sm font-black text-[#ffc101]">
                          {product.price !== undefined ? formatPrice(product.price) : "₹499"}
                        </span>
                        {product.originalPrice && product.originalPrice > product.price && (
                          <span className="text-[10px] sm:text-xs text-gray-400 line-through">
                            {formatPrice(product.originalPrice)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};

export default NewArrivalsSection;
