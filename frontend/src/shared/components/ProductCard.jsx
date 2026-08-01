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
import { Card, Button, Badge } from "./ui";
import { ProductWholesaleBadge } from "./WholesaleBadge";


export const PRODUCT_CARD_VARIANTS = {
  default: {
    cardStyle: 'default',
    containerClass: 'bg-surface-card border-borderToken-default',
    infoBg: 'bg-surface-card',
    titleColor: 'text-textColor-primary',
    priceColor: 'text-textColor-primary',
    badgeVariant: 'hot',
    buttonVariant: 'primary',
  },
  premium: {
    cardStyle: 'glass',
    containerClass: 'bg-zinc-950/90 border-[#D4AF37]/50 shadow-amber-500/10 text-white',
    infoBg: 'bg-zinc-950/95 border-t border-[#D4AF37]/20',
    titleColor: 'text-white',
    priceColor: 'text-brand-primary',
    badgeVariant: 'gold',
    buttonVariant: 'primary',
  },
  minimal: {
    cardStyle: 'bordered',
    containerClass: 'bg-surface-card border-2 border-borderToken-default',
    infoBg: 'bg-surface-card',
    titleColor: 'text-textColor-primary',
    priceColor: 'text-textColor-primary',
    badgeVariant: 'info',
    buttonVariant: 'secondary',
  },
  compact: {
    cardStyle: 'default',
    containerClass: 'bg-surface-card border-borderToken-default',
    infoBg: 'bg-surface-card',
    titleColor: 'text-textColor-primary',
    priceColor: 'text-textColor-primary',
    badgeVariant: 'gold',
    buttonVariant: 'primary',
  },
};

const ProductCard = ({ product, hideRating = false, isFlashSale = false, variant = 'default' }) => {
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

      const buttonRect = buttonRef.current?.getBoundingClientRect();
      const startX = buttonRect ? buttonRect.left + buttonRect.width / 2 : 0;
      const startY = buttonRect ? buttonRect.top + buttonRect.height / 2 : 0;

      setTimeout(() => {
        const cartBar = document.querySelector("[data-cart-bar]");
        let endX = window.innerWidth / 2;
        let endY = window.innerHeight - 100;

        if (cartBar) {
          const cartRect = cartBar.getBoundingClientRect();
          endX = cartRect.left + cartRect.width / 2;
          endY = cartRect.top + cartRect.height / 2;
        } else {
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
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
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

  const soldPercentage = product.stockQuantity ? Math.min(95, Math.floor(100 - (product.stockQuantity / 2))) : 75;

  const currentVariantConfig = PRODUCT_CARD_VARIANTS[variant] || PRODUCT_CARD_VARIANTS.default;

  return (
    <>
      <Card
        as={motion.div}
        variant={currentVariantConfig.cardStyle}
        hoverable
        padding="none"
        whileTap={{ scale: 0.98 }}
        whileHover={{ y: -4 }}
        className={`group cursor-pointer h-full flex flex-col ${currentVariantConfig.containerClass} ${
          isFlashSale ? 'border-borderToken-goldAccent bg-amber-50/10' : ''
        }`}
        {...longPressHandlers}
      >
        <div className="relative">
          {/* Favorite Icon */}
          <div className="absolute top-2 right-2 z-10">
            <button
              onClick={handleFavorite}
              className="p-1.5 bg-surface-card/80 backdrop-blur-md rounded-full shadow-lg transition-all duration-300 group hover:bg-surface-card"
              aria-label="Add to wishlist"
            >
              <FiHeart
                className={`text-xs md:text-sm transition-all duration-300 ${
                  isFavorite
                    ? 'text-red-500 fill-red-500 scale-110'
                    : 'text-textColor-muted group-hover:text-textColor-primary'
                }`}
              />
            </button>
          </div>

          {/* Product Image */}
          <Link to={productLink} className="block">
            <div className="w-full aspect-[4/3] bg-surface-background flex items-center justify-center overflow-hidden relative group-hover:bg-borderToken-light/50 transition-colors">
              {/* Offer & Discount Badges */}
              {(product.originalPrice || isFlashSale) && (
                <div className="absolute top-2 left-2 z-10 flex flex-wrap items-center gap-1 max-w-[calc(100%-2.5rem)]">
                  {product.originalPrice > product.price && (
                    <span className="px-1.5 py-0.5 bg-red-600 text-white font-black text-[9px] sm:text-[10px] md:text-xs rounded-md shadow-md uppercase tracking-wide leading-none select-none">
                      {Math.round(
                        ((product.originalPrice - product.price) / product.originalPrice) * 100
                      )}% {t('OFF')}
                    </span>
                  )}
                  {isFlashSale && (
                    <span className="px-1.5 py-0.5 bg-amber-500 text-black font-black text-[9px] sm:text-[10px] md:text-xs rounded-md shadow-md uppercase tracking-wide leading-none select-none">
                      {t('Hot Deal')}
                    </span>
                  )}
                </div>
              )}
              <LazyImage
                src={product.image}
                alt={product.name}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                fallbackImage={getPlaceholderImage(400, 400, 'Product Image')}
              />
            </div>
          </Link>
        </div>

        {/* Product Info */}
        <div className={`p-3.5 flex-1 flex flex-col ${currentVariantConfig.infoBg}`}>
          <Link to={productLink} className="block lg:h-5">
            <h3 className={`font-bold mb-0 line-clamp-2 md:line-clamp-1 text-[11px] md:text-sm transition-colors group-hover:text-brand-primary leading-none ${currentVariantConfig.titleColor}`}>
              {product.name}
            </h3>
          </Link>
          <p className="text-[10px] md:text-xs text-textColor-muted mb-1 font-medium lg:h-3 leading-none truncate">
            {product.unit}
          </p>
          {product.wholesaleEnabled === true && (
            <div className="mb-1">
              <ProductWholesaleBadge product={product} />
            </div>
          )}

          {/* Rating */}
          <div className="flex items-center justify-between mb-1">
            {!!product.rating && !hideRating && (
              <div className="flex items-center gap-1">
                <div className="flex items-center bg-amber-500/10 px-1.5 py-0.5 rounded-md border border-amber-500/30">
                  <span className="text-[10px] md:text-xs font-bold text-amber-500 mr-0.5">{product.rating}</span>
                  <FiStar className="text-[9px] md:text-[10px] text-amber-400 fill-amber-400" />
                </div>
                <span className="text-[9px] md:text-xs text-textColor-muted font-medium hidden md:inline">
                  ({product.reviewCount || 0})
                </span>
              </div>
            )}
            {isFlashSale && (
              <span className="text-[9px] font-bold text-amber-500 uppercase tracking-tighter hidden md:inline">
                {t('Ending Soon')}
              </span>
            )}
          </div>

          {/* Flash Sale Progress Bar */}
          {isFlashSale && (
            <div className="mb-2 space-y-0.5">
              <div className="flex justify-between text-[8px] md:text-[10px] font-bold">
                <span className="text-textColor-muted uppercase">{t('Available')}</span>
                <span className="text-brand-primary">{soldPercentage}% {t('Sold')}</span>
              </div>
              <div className="h-1.5 w-full bg-borderToken-light rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${soldPercentage}%` }}
                  transition={{ duration: 1, delay: 0.2 }}
                  className="h-full bg-brand-primary"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col items-start gap-0 md:flex-row md:items-end md:gap-2 mb-2 mt-auto leading-none">
            <Price amount={product.price} className={`text-xs md:text-xl font-black leading-none ${currentVariantConfig.priceColor}`} />
            {product.originalPrice && (
              <Price amount={product.originalPrice} className="text-[9px] md:text-xs text-textColor-muted line-through font-medium leading-none mb-0.5" />
            )}
          </div>

          {/* Add/Remove Button using Primitive Button */}
          {isInCart ? (
            <Button
              variant="danger"
              size="sm"
              fullWidth
              onClick={handleRemoveFromCart}
              leftIcon={<FiTrash2 />}
            >
              {t('Remove')}
            </Button>
          ) : (
            <Button
              ref={buttonRef}
              variant={currentVariantConfig.buttonVariant}
              size="sm"
              fullWidth
              disabled={product.stock === 'out_of_stock'}
              isLoading={isAdding}
              onClick={handleAddToCart}
              leftIcon={<FiShoppingBag />}
            >
              {product.stock === 'out_of_stock'
                ? t('Out of Stock')
                : t('Add to Cart')}
            </Button>
          )}
        </div>
      </Card>

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
