import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FiZap, FiPlus, FiMinus } from "react-icons/fi";
import LazyImage from "../../../../shared/components/LazyImage";
import { useCartStore } from "../../../../shared/store/useStore";
import { calculateDiscount } from "../../../../shared/utils/helpers";
import { Badge, Button } from "../../../../shared/components/ui";

/**
 * ExpressProductCard — Refactored to fully adopt DwellMart Design System
 * Uses shared Badge, Button, design tokens, and Inter typography.
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
      className="group relative bg-surface-card rounded-card border border-borderToken-default p-2.5 sm:p-3 flex flex-col justify-between hover:border-brand-primary/60 hover:shadow-card transition-all duration-200 cursor-pointer overflow-hidden"
    >
      {/* Top badges bar using Shared Badge Primitives */}
      <div className="flex items-center justify-between gap-1 mb-2 z-10">
        {/* Speed tag */}
        <Badge variant="gold" size="sm" className="!normal-case tracking-tight gap-1">
          <FiZap className="text-[11px] fill-amber-500 text-amber-500" />
          <span>10-15m</span>
        </Badge>

        {/* Discount tag */}
        {discountPercent > 0 && (
          <Badge variant="success" size="sm" className="!normal-case font-black">
            {discountPercent}% OFF
          </Badge>
        )}
      </div>

      {/* Product Image */}
      <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-surface-background mb-2 flex items-center justify-center p-2 group-hover:scale-105 transition-transform duration-300">
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
          <p className="text-[11px] font-semibold text-textColor-muted mb-0.5 line-clamp-1">
            {unitText}
          </p>

          {/* Product Title */}
          <h4 className="text-xs sm:text-sm font-bold text-textColor-primary leading-tight line-clamp-2 mb-2 group-hover:text-textColor-brand transition-colors">
            {product?.name}
          </h4>
        </div>

        {/* Bottom Bar: Price + Add Button */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-borderToken-light mt-1">
          {/* Price Container */}
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-xs sm:text-sm font-extrabold text-textColor-primary tracking-tight">
                ₹{price.toLocaleString('en-IN')}
              </span>
              {hasDiscount && (
                <span className="text-[10px] font-medium text-textColor-muted line-through">
                  ₹{originalPrice.toLocaleString('en-IN')}
                </span>
              )}
            </div>
          </div>

          {/* Add / Stepper Button */}
          <div onClick={(e) => e.stopPropagation()}>
            {quantity === 0 ? (
              <Button
                size="sm"
                variant="primary"
                onClick={handleAdd}
                rightIcon={<FiPlus className="text-xs" />}
                className="!py-1.5 !px-3 !min-h-[32px] text-xs font-black"
              >
                ADD
              </Button>
            ) : (
              <div className="flex items-center bg-brand-primary text-slate-950 rounded-button shadow-sm overflow-hidden font-extrabold text-xs border border-brand-primaryHover">
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  type="button"
                  onClick={handleDecrement}
                  className="px-2 py-1.5 hover:bg-brand-primaryHover transition-colors"
                >
                  <FiMinus className="text-xs font-bold" />
                </motion.button>
                <span className="px-2 py-1.5 text-xs font-black text-center min-w-[20px]">
                  {quantity}
                </span>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  type="button"
                  onClick={handleIncrement}
                  className="px-2 py-1.5 hover:bg-brand-primaryHover transition-colors"
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
