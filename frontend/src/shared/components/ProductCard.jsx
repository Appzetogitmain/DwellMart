import { FiHeart, FiShoppingBag, FiStar, FiTrash2 } from "react-icons/fi";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { useCartStore, useUIStore } from "../store/useStore";
import { useWishlistStore } from "../store/wishlistStore";
import { formatPrice, getPlaceholderImage } from "../utils/helpers";
import Price from "./Price";
import toast from "react-hot-toast";
import LazyImage from "./LazyImage";
import { useState, useRef } from "react";
import useLongPress from "../../modules/UserApp/hooks/useLongPress";
import LongPressMenu from "../../modules/UserApp/components/Mobile/LongPressMenu";
import FlyingItem from "../../modules/UserApp/components/Mobile/FlyingItem";
import { getVariantSignature } from "../utils/variant";
import { usePageTranslation } from "../../hooks/usePageTranslation";


const ProductCard = ({ product, hideRating = false, isFlashSale = false }) => {
  const navigate = useNavigate();
  const { getTranslatedText: t } = usePageTranslation([
    "Please select variant on product page",
    "Added to cart!",
    "Removed from cart!",
    "Link copied to clipboard",
    "Removed from wishlist",
    "Added to wishlist",
    "OFF",
    "Hot Deal",
    "Ending Soon",
    "Available",
    "Sold",
    "Remove",
    "Out of Stock",
    "Adding...",
    "Add",
    "Add to Cart"
  ]);

  const productLink = `/product/${product.id}`;
  const { items, addItem, removeItem } = useCartStore();
  const triggerCartAnimation = useUIStore(
    (state) => state.triggerCartAnimation
  );
  const {
    addItem: addToWishlist,
    removeItem: removeFromWishlist,
    isInWishlist,
  } = useWishlistStore();
  const hasNoVariant = (cartItem) => !getVariantSignature(cartItem?.variant || {});
  const isFavorite = isInWishlist(product.id);
  const isInCart = items.some(
    (item) => item.id === product.id && hasNoVariant(item)
  );
  const [isAdding, setIsAdding] = useState(false);
  const [showLongPressMenu, setShowLongPressMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [showFlyingItem, setShowFlyingItem] = useState(false);
  const [flyingItemPos, setFlyingItemPos] = useState({
    start: { x: 0, y: 0 },
    end: { x: 0, y: 0 },
  });
  const buttonRef = useRef(null);
  const cartIconRef = useRef(null);

  const handleAddToCart = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const hasDynamicAxes =
      Array.isArray(product?.variants?.attributes) &&
      product.variants.attributes.some((attr) => Array.isArray(attr?.values) && attr.values.length > 0);
    const hasSizeVariants = Array.isArray(product?.variants?.sizes) && product.variants.sizes.length > 0;
    const hasColorVariants = Array.isArray(product?.variants?.colors) && product.variants.colors.length > 0;
    if (hasDynamicAxes || hasSizeVariants || hasColorVariants) {
      toast.error(t("Please select variant on product page"));
      navigate(productLink);
      return;
    }

    const isLargeScreen = window.innerWidth >= 1024;

    if (!isLargeScreen) {
      setIsAdding(true);

      // Get button position
      const buttonRect = buttonRef.current?.getBoundingClientRect();
      const startX = buttonRect ? buttonRect.left + buttonRect.width / 2 : 0;
      const startY = buttonRect ? buttonRect.top + buttonRect.height / 2 : 0;

      // Get cart bar position (prefer cart bar over header icon)
      setTimeout(() => {
        const cartBar = document.querySelector("[data-cart-bar]");
        let endX = window.innerWidth / 2;
        let endY = window.innerHeight - 100;

        if (cartBar) {
          const cartRect = cartBar.getBoundingClientRect();
          endX = cartRect.left + cartRect.width / 2;
          endY = cartRect.top + cartRect.height / 2;
        } else {
          // Fallback to cart icon in header
          const cartIcon = document.querySelector("[data-cart-icon]");
          if (cartIcon) {
            const cartRect = cartIcon.getBoundingClientRect();
            endX = cartRect.left + cartRect.width / 2;
            endY = cartRect.top + cartRect.height / 2;
          }
        }

        setFlyingItemPos({
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
        });
        setShowFlyingItem(true);
      }, 50);

      setTimeout(() => setIsAdding(false), 600);
    }

    const addedToCart = addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      quantity: 1,
      stockQuantity: product.stockQuantity,
      vendorId: product.vendorId,
      vendorName: product.vendorName,
    });
    if (!addedToCart) return;
    triggerCartAnimation();
    toast.success(t("Added to cart!"));
  };

  const handleRemoveFromCart = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    removeItem(product.id, {});
    toast.success(t("Removed from cart!"));
  };

  const handleLongPress = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
    setShowLongPressMenu(true);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: product.name,
        text: `Check out ${product.name}`,
        url: window.location.origin + productLink,
      });
    } else {
      navigator.clipboard.writeText(window.location.origin + productLink);
      toast.success(t("Link copied to clipboard"));
    }
  };

  const longPressHandlers = useLongPress(handleLongPress, 500);

  const handleFavorite = (e) => {
    e.stopPropagation();
    if (isFavorite) {
      removeFromWishlist(product.id);
      toast.success(t("Removed from wishlist"));
    } else {
      const addedToWishlist = addToWishlist({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
      });
      if (addedToWishlist) {
        toast.success(t("Added to wishlist"));
      }
    }
  };

  // Calculate sold percentage for flash sale (mock logic)
  const soldPercentage = product.stockQuantity ? Math.min(95, Math.floor(100 - (product.stockQuantity / 2))) : 75;

  return (
    <>
      <motion.div
        whileTap={{ scale: 0.98 }}
        whileHover={{ y: -4 }}
        style={{ willChange: "transform", transform: "translateZ(0)" }}
        className={`glass-card rounded-xl overflow-hidden group cursor-pointer h-full flex flex-col hover:shadow-lg transition-all duration-300 ${isFlashSale ? "border border-[#ffc101]/40 bg-amber-50/10" : ""
          }`}
        {...longPressHandlers}>
        <div className="relative">
          {/* Favorite Icon */}
          <div className="absolute top-2 right-2 z-10">
            <button
              onClick={handleFavorite}
              className="p-1.5 glass rounded-full shadow-lg transition-all duration-300 group hover:bg-white">
              <FiHeart
                className={`text-xs md:text-sm transition-all duration-300 ${isFavorite
                  ? "text-red-500 fill-red-500 scale-110"
                  : "text-gray-400 group-hover:text-gray-600"
                  }`}
              />
            </button>
          </div>

          {/* Product Image */}
          <Link to={productLink} className="block">
            <div className="w-full aspect-[4/3] bg-gray-100 flex items-center justify-center overflow-hidden relative group-hover:bg-gray-200/50 transition-colors">
              {product.originalPrice && (
                <div className={`absolute top-0 left-0 text-white text-[10px] md:text-xs font-bold px-2 py-1 rounded-br-lg z-10 shadow-sm ${isFlashSale ? "bg-[#ffc101] text-black font-extrabold" : "bg-red-500"}`}>
                  {Math.round(
                    ((product.originalPrice - product.price) /
                      product.originalPrice) *
                    100
                  )}% {t("OFF")}
                </div>
              )}
              {isFlashSale && (
                <div className="absolute top-0 right-0 p-1">
                  <div className="bg-black text-[#ffc101] border border-[#ffc101]/30 text-[8px] font-black px-1.5 py-0.5 rounded-full animate-pulse uppercase tracking-tighter">
                    {t("Hot Deal")}
                  </div>
                </div>
              )}
              <LazyImage
                src={product.image}
                alt={product.name}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                fallbackImage={getPlaceholderImage(400, 400, "Product Image")}
              />
            </div>
          </Link>
        </div>

        {/* Product Info */}
        <div className="p-1 md:p-3 lg:p-2 flex-1 flex flex-col bg-white">
          <Link to={productLink} className="block lg:h-5">
            <h3 className="font-bold text-gray-800 mb-0 line-clamp-2 md:line-clamp-1 text-[11px] md:text-sm transition-colors group-hover:text-primary-600 leading-none">
              {product.name}
            </h3>
          </Link>
          <p className="text-[8px] md:text-xs text-gray-400 mb-0 font-medium lg:h-3 leading-none truncate">
            {product.unit}
          </p>



          {/* Rating */}
          <div className="flex items-center justify-between mb-0.5">
            {!!product.rating && !hideRating && (
              <div className="flex items-center gap-1">
                <div className="flex items-center bg-yellow-50 px-1.5 py-0.5 rounded-md border border-yellow-100">
                  <span className="text-[9px] md:text-xs font-bold text-yellow-700 mr-0.5">{product.rating}</span>
                  <FiStar className="text-[8px] md:text-[10px] text-yellow-500 fill-yellow-500" />
                </div>
                <span className="text-[9px] md:text-xs text-gray-400 font-medium hidden md:inline">
                  ({product.reviewCount || 0})
                </span>
              </div>
            )}
            {isFlashSale && (
              <span className="text-[9px] font-bold text-amber-700 uppercase tracking-tighter hidden md:inline">
                {t("Ending Soon")}
              </span>
            )}
          </div>

          {/* Flash Sale Progress Bar */}
          {isFlashSale && (
            <div className="mb-1 space-y-0.5">
              <div className="flex justify-between text-[8px] md:text-[10px] font-bold">
                <span className="text-gray-500 uppercase">{t("Available")}</span>
                <span className="text-amber-800">{soldPercentage}% {t("Sold")}</span>
              </div>
              <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${soldPercentage}%` }}
                  transition={{ duration: 1, delay: 0.2 }}
                  className="h-full bg-gradient-to-r from-[#ffc101] to-amber-500"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col items-start gap-0 md:flex-row md:items-end md:gap-2 mb-0.5 mt-auto leading-none">
            <Price amount={product.price} className={`text-xs md:text-xl font-black leading-none ${isFlashSale ? "text-[#b38600]" : "text-gray-900"}`} />
            {product.originalPrice && (
              <Price amount={product.originalPrice} className="text-[9px] md:text-xs text-gray-400 line-through font-medium leading-none mb-0.5" />
            )}
          </div>

          {/* Add/Remove Button */}
          {isInCart ? (
            <motion.button
              type="button"
              onClick={handleRemoveFromCart}
              whileTap={{ scale: 0.95 }}
              className="w-full py-1.5 md:py-2.5 lg:py-2 rounded-xl font-bold text-xs md:text-sm bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 transition-all duration-300 flex items-center justify-center gap-1.5">
              <FiTrash2 className="text-xs md:text-base" />
              <span>{t("Remove")}</span>
            </motion.button>
          ) : (
            <motion.button
              ref={buttonRef}
              type="button"
              onClick={handleAddToCart}
              disabled={product.stock === "out_of_stock" || isAdding}
              whileTap={{ scale: 0.95 }}
              animate={
                isAdding
                  ? {
                    scale: [1, 1.1, 1],
                  }
                  : {}
              }
              style={{ willChange: "transform", transform: "translateZ(0)" }}
              className={`w-full py-1 md:py-2.5 lg:py-2 rounded-xl font-extrabold text-[10px] md:text-sm transition-all duration-300 flex items-center justify-center gap-1.5 ${product.stock === "out_of_stock"
                ? "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                : isFlashSale
                  ? "bg-gradient-to-r from-[#ffc101] via-[#f5b800] to-[#e6ac00] text-black shadow-md hover:shadow-amber-200 hover:-translate-y-0.5"
                  : "gradient-green text-white shadow-md hover:shadow-lg hover:-translate-y-0.5"
                }`}>
              <motion.div
                animate={
                  isAdding
                    ? {
                      rotate: [0, -10, 10, -10, 0],
                    }
                    : {}
                }
                transition={{ duration: 0.5 }}>
                <FiShoppingBag className="text-xs md:text-base transition-transform" />
              </motion.div>
              <span>
                {product.stock === "out_of_stock"
                  ? t("Out of Stock")
                  : isAdding
                    ? t("Adding...")
                    : <><span className="md:hidden">{t("Add")}</span><span className="hidden md:inline">{t("Add to Cart")}</span></>}
              </span>
            </motion.button>
          )}
        </div>
      </motion.div>

      <LongPressMenu
        isOpen={showLongPressMenu}
        onClose={() => setShowLongPressMenu(false)}
        position={menuPosition}
        onAddToCart={handleAddToCart}
        onAddToWishlist={handleFavorite}
        onShare={handleShare}
        isInWishlist={isFavorite}
      />

      {showFlyingItem && (
        <FlyingItem
          image={product.image}
          startPosition={flyingItemPos.start}
          endPosition={flyingItemPos.end}
          onComplete={() => setShowFlyingItem(false)}
        />
      )}
    </>
  );
};

export default ProductCard;
