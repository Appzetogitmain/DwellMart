import { FiHeart, FiShoppingBag, FiStar, FiTrash2 } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useCartStore, useUIStore } from "../../../../shared/store/useStore";
import { useWishlistStore } from "../../../../shared/store/wishlistStore";
import {
  formatPrice,
  getPlaceholderImage,
} from "../../../../shared/utils/helpers";
import toast from "react-hot-toast";
import LazyImage from "../../../../shared/components/LazyImage";
import Price from "../../../../shared/components/Price";
import { useState, useRef } from "react";
import useLongPress from "../../hooks/useLongPress";
import LongPressMenu from "./LongPressMenu";
import FlyingItem from "./FlyingItem";
import VendorBadge from "../../../Vendor/components/VendorBadge";
import { getVendorById } from "../../data/catalogData";
import { getVariantSignature } from "../../../../shared/utils/variant";
import { ProductWholesaleBadge } from "../../../../shared/components/WholesaleBadge";

const MobileProductCard = ({ product }) => {
  const navigate = useNavigate();
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
  const [showLongPressMenu, setShowLongPressMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [showFlyingItem, setShowFlyingItem] = useState(false);
  const [flyingItemPos, setFlyingItemPos] = useState({
    start: { x: 0, y: 0 },
    end: { x: 0, y: 0 },
  });
  const buttonRef = useRef(null);

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
      toast.error("Please select variant on product page");
      navigate(`/product/${product.id}`);
      return;
    }

    const isLargeScreen = window.innerWidth >= 1024;

    if (!isLargeScreen) {
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
      quickCommerceEnabled: product.quickCommerceEnabled,
      wholesaleEnabled: product.wholesaleEnabled,
      retailEnabled: product.retailEnabled,
      fulfillmentType: product.fulfillmentType || (product.quickCommerceEnabled ? 'quick_commerce' : undefined),
      experience: product.experience || (product.quickCommerceEnabled ? 'quick_commerce' : undefined),
      wholesale: product.wholesale,
    });
    if (!addedToCart) return;
    triggerCartAnimation();
  };

  const handleRemoveFromCart = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    removeItem(product.id, {});
    toast.success("Removed from cart!");
  };

  const handleFavorite = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isFavorite) {
      removeFromWishlist(product.id);
      toast.success("Removed from wishlist");
    } else {
      const addedToWishlist = addToWishlist({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
      });
      if (addedToWishlist) {
        toast.success("Added to wishlist");
      }
    }
  };

  const handleLongPress = (e) => {
    if (e && e.preventDefault) {
      // e.preventDefault(); // Might interfere with scrolling?
    }
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
        url: window.location.origin + `/product/${product.id}`,
      });
    } else {
      navigator.clipboard.writeText(
        window.location.origin + `/product/${product.id}`
      );
      toast.success("Link copied to clipboard");
    }
  };

  const longPressHandlers = useLongPress(handleLongPress, 500);

  return (
    <>
      <motion.div
        whileTap={{ scale: 0.98 }}
        className="glass-card rounded-2xl overflow-hidden mb-4"
        {...longPressHandlers}>
        <div className="flex gap-3 p-3">
          {/* Product Image */}
          <Link to={`/product/${product.id}`} className="w-28 h-28 flex-shrink-0 rounded-xl overflow-hidden bg-gray-100 block p-1">
            <LazyImage
              src={product.image}
              alt={product.name}
              className="w-full h-full object-contain"
              onError={(e) => {
                e.target.src = getPlaceholderImage(200, 200, "Product");
              }}
            />
          </Link>

          {/* Product Info */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-0">
              <Link to={`/product/${product.id}`} className="flex-1">
                <h3 className="font-bold text-gray-800 text-sm line-clamp-2 leading-none">
                  {product.name}
                </h3>
              </Link>
              <button
                type="button"
                onClick={handleFavorite}
                className="flex-shrink-0 p-1.5 hover:bg-gray-100 rounded-full transition-colors">
                <FiHeart
                  className={`text-lg ${isFavorite ? "text-red-500 fill-red-500" : "text-gray-400"
                    }`}
                />
              </button>
            </div>

            <p className="text-[10px] text-gray-500 mb-0 leading-none">{product.unit}</p>
            {product.wholesaleEnabled === true && (
              <div className="mt-1">
                <ProductWholesaleBadge product={product} />
              </div>
            )}

            {/* Vendor Badge */}
            {product.vendorId && (
              <div className="mb-0.5">
                <VendorBadge
                  vendor={getVendorById(product.vendorId)}
                  showVerified={true}
                  size="sm"
                  disableLink={true}
                />
              </div>
            )}

            {/* Rating */}
            {product.rating && (
              <div className="flex items-center gap-1 mb-0.5">
                <div className="flex items-center">
                  {[...Array(5)].map((_, i) => (
                    <FiStar
                      key={i}
                      className={`text-xs ${i < Math.floor(product.rating)
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-gray-300"
                        }`}
                    />
                  ))}
                </div>
                <span className="text-xs text-gray-600 font-medium">
                  {product.rating} ({product.reviewCount || 0})
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 mb-0.5 leading-none">
              <Price amount={product.price} className="text-lg font-bold text-gray-800 leading-none" />
              {product.originalPrice && (
                <Price amount={product.originalPrice} className="text-xs text-gray-400 line-through font-medium leading-none" />
              )}
            </div>

            {/* Add/Remove Button */}
            {isInCart ? (
              <motion.button
                type="button"
                onClick={handleRemoveFromCart}
                whileTap={{ scale: 0.95 }}
                className="w-full py-3 rounded-xl font-semibold text-sm bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 transition-all duration-300 flex items-center justify-center gap-2">
                <FiTrash2 className="text-base" />
                <span>Remove</span>
              </motion.button>
            ) : (
              <motion.button
                ref={buttonRef}
                type="button"
                onClick={handleAddToCart}
                disabled={product.stock === "out_of_stock"}
                whileTap={{ scale: 0.95 }}
                className={`w-full py-3 rounded-xl font-semibold text-sm transition-all duration-300 flex items-center justify-center gap-2 ${product.stock === "out_of_stock"
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "gradient-green text-white hover:shadow-glow-green"
                  }`}>
                <FiShoppingBag className="text-base" />
                <span>
                  {product.stock === "out_of_stock"
                    ? "Out of Stock"
                    : "Add to Cart"}
                </span>
              </motion.button>
            )}
          </div>
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

export default MobileProductCard;
