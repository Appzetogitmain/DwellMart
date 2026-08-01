import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FiZap, FiPlus, FiMinus, FiClock } from "react-icons/fi";
import LazyImage from "../../../../shared/components/LazyImage";
import { useCartStore } from "../../../../shared/store/useStore";
import { calculateDiscount } from "../../../../shared/utils/helpers";

/**
 * ExpressProductCard — Modern Blinkit-Inspired Express Product Card
 * Designed for high conversion, compact density, and immediate 1-click cart interaction.
 */
const ExpressProductCard = ({ product }) => {
  const navigate = useNavigate();
  const { items, addItem, updateQuantity, removeItem } = useCartStore();

  const productId = String(product?.id || product?._id || "").trim();

  // Find quantity in cart
  const cartItem = useMemo(() => {
    return items.find((item) => String(item.id || item._id).trim() === productId);
  }, [items, productId]);

  const quantity = cartItem?.quantity || 0;

  const handleAdd = (e) => {
    e.stopPropagation();
    if (!product) return;
    addItem(product);
  };

  const handleIncrement = (e) => {
    e.stopPropagation();
    if (!cartItem) {
      addItem(product);
    } else {
      updateQuantity(productId, quantity + 1);
    }
  };

  const handleDecrement = (e) => {
    e.stopPropagation();
    if (quantity <= 1) {
      removeItem(productId);
    } else {
      updateQuantity(productId, quantity - 1);
    }
  };

  const handleCardClick = () => {
    if (productId) {
      navigate(`/product/${productId}`);
    }
  };

  const price = Number(product?.price) || 0;
  const originalPrice = Number(product?.originalPrice);
  const hasDiscount = originalPrice && originalPrice > price;
  const discountPercent = hasDiscount
    ? Math.round(calculateDiscount(originalPrice, price))
    : 0;

  const unitText = product?.unit || product?.weight || product?.packSize || "1 unit";

  return (
    <motion.div
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      onClick={handleCardClick}
      className="group relative bg-surface rounded-2xl border border-border/80 p-2.5 sm:p-3 flex flex-col justify-between hover:border-brand-primary/40 hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden"
    >
      {/* Top badges bar */}
      <div className="flex items-center justify-between gap-1 mb-2 z-10">
        {/* Speed tag */}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 font-extrabold text-[10px] uppercase tracking-wider border border-amber-500/20">
          <FiZap className="text-[11px] fill-amber-500" />
          10-15m
        </span>

        {/* Discount tag */}
        {discountPercent > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-status-successBg text-status-success font-extrabold text-[10px]">
            {discountPercent}% OFF
          </span>
        )}
      </div>

      {/* Product Image */}
      <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-surface-muted mb-2 flex items-center justify-center p-2 group-hover:scale-105 transition-transform duration-300">
        <LazyImage
          src={product?.image || product?.images?.[0]}
          alt={product?.name}
          className="w-full h-full object-contain"
          placeholderWidth={100}
          placeholderHeight={100}
          placeholderText={product?.name?.charAt(0) || "P"}
        />
      </div>

      {/* Product Information */}
      <div className="flex-1 flex flex-col justify-between">
        <div>
          {/* Unit / Pack weight */}
          <p className="text-[11px] font-semibold text-content-muted mb-0.5 line-clamp-1">
            {unitText}
          </p>

          {/* Product Title */}
          <h4 className="text-xs sm:text-sm font-bold text-content leading-tight line-clamp-2 mb-2 group-hover:text-brand-primary transition-colors">
            {product?.name}
          </h4>
        </div>

        {/* Bottom Bar: Price + Add Button */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40 mt-1">
          {/* Price Container */}
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-xs sm:text-sm font-extrabold text-content tracking-tight">
                ₹{price.toLocaleString('en-IN')}
              </span>
              {hasDiscount && (
                <span className="text-[10px] font-medium text-content-muted line-through">
                  ₹{originalPrice.toLocaleString('en-IN')}
                </span>
              )}
            </div>
          </div>

          {/* Add / Stepper Button */}
          <div onClick={(e) => e.stopPropagation()}>
            {quantity === 0 ? (
              <motion.button
                whileTap={{ scale: 0.92 }}
                type="button"
                onClick={handleAdd}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-xs shadow-xs border border-emerald-500/40 flex items-center gap-1 transition-all"
              >
                <span>ADD</span>
                <FiPlus className="text-xs" />
              </motion.button>
            ) : (
              <div className="flex items-center bg-emerald-600 text-white rounded-xl shadow-xs overflow-hidden border border-emerald-500">
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  type="button"
                  onClick={handleDecrement}
                  className="px-2 py-1.5 hover:bg-emerald-700 active:bg-emerald-800 transition-colors"
                >
                  <FiMinus className="text-xs font-bold" />
                </motion.button>
                <span className="px-2 py-1.5 text-xs font-extrabold text-center min-w-[20px]">
                  {quantity}
                </span>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  type="button"
                  onClick={handleIncrement}
                  className="px-2 py-1.5 hover:bg-emerald-700 active:bg-emerald-800 transition-colors"
                >
                  <FiPlus className="text-xs font-bold" />
                </motion.button>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ExpressProductCard;
