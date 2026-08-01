import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FiShoppingBag, FiHeart, FiTrash2 } from "react-icons/fi";
import { useCartStore, useUIStore } from "../../../../shared/store/useStore";
import { useWishlistStore } from "../../../../shared/store/wishlistStore";
import Price from "../../../../shared/components/Price";
import toast from "react-hot-toast";
import LazyImage from '../../../../shared/components/LazyImage';
import VendorBadge from "../../../Vendor/components/VendorBadge";
import { getVendorById } from "../../data/catalogData";
import { getVariantSignature } from "../../../../shared/utils/variant";
import { getPlaceholderImage } from "../../../../shared/utils/helpers";
import { ProductWholesaleBadge } from "../../../../shared/components/WholesaleBadge";

const ProductListItem = ({ product, index, isFlashSale = false }) => {
  const navigate = useNavigate();
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
      navigate(productLink);
      return;
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

  const soldPercentage = product.stockQuantity ? Math.min(95, Math.floor(100 - (product.stockQuantity / 2))) : 75;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
       transition={{ delay: index * 0.05 }}
      className={`glass-card rounded-2xl p-2 mb-3 border border-white/40 shadow-sm hover:shadow-md transition-all ${isFlashSale ? "bg-red-50/20 border-red-100" : ""}`}>
      <div className="flex gap-3">
        {/* Product Image Section */}
        <Link to={productLink} className="flex-shrink-0 relative group">
          <div className="w-28 h-28 md:w-36 md:h-36 rounded-xl overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 p-1.5">
            <LazyImage
              src={product.image}
              alt={product.name}
              className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500"
              onError={(e) => {
                e.target.src = getPlaceholderImage(200, 200, product.name?.charAt(0) || 'P');
              }}
            />
          </div>
          {product.originalPrice && (
            <div className="absolute top-1 left-1 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-lg shadow-sm">
              {Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% OFF
            </div>
          )}
        </Link>

        {/* Product Info Section */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Top Row: Name + Favorite */}
          <div className="flex items-start justify-between gap-2 mb-0">
            <Link to={productLink} className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-800 text-sm md:text-base mb-0 line-clamp-2 md:line-clamp-1 leading-none group-hover:text-primary-600 transition-colors">
                {product.name}
              </h3>
            </Link>
            <button
              onClick={handleFavorite}
              className={`flex-shrink-0 p-2 rounded-full transition-all ${isFavorite
                ? "bg-red-50 text-red-500 shadow-inner"
                : "bg-gray-50 text-gray-400 hover:bg-gray-100"
                }`}>
              <FiHeart
                className={`text-sm ${isFavorite ? "fill-current scale-110" : ""}`}
              />
            </button>
          </div>

          <div className="flex items-center gap-2 mb-0 leading-none">
            {product.rating && (
              <div className="flex items-center bg-yellow-400/10 px-1.5 py-0.5 rounded-md leading-none">
                <span className="text-[10px] md:text-xs font-bold text-yellow-700 leading-none">⭐ {product.rating}</span>
                <span className="text-[9px] text-gray-400 font-medium ml-1 leading-none">({product.reviewCount || 0})</span>
              </div>
            )}
            <span className="text-[10px] md:text-xs text-gray-500 border-l border-gray-200 pl-2 leading-none">{product.unit}</span>
            {product.wholesaleEnabled === true && (
              <ProductWholesaleBadge product={product} />
            )}
          </div>

          {/* Vendor */}


          {/* Flash Sale Progress */}
          {isFlashSale && (
            <div className="mb-0.5 space-y-0.5 max-w-[200px]">
              <div className="flex justify-between text-[8px] font-bold">
                <span className="text-gray-400 uppercase">Stock Left</span>
                <span className="text-amber-800">{soldPercentage}% Sold</span>
              </div>
              <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#ffc101] to-amber-500 transition-all duration-1000"
                  style={{ width: `${soldPercentage}%` }}
                />
              </div>
            </div>
          )}

          {/* Bottom Row: Price + Add Button */}
          <div className="mt-auto flex items-center justify-between gap-3 pt-0.5 border-t border-gray-50 leading-none">
            <div className="flex flex-col leading-none">
              <Price 
                amount={product.price} 
                className="text-base md:text-xl font-black text-gray-900 leading-none" 
              />
              {product.originalPrice && (
                <Price 
                  amount={product.originalPrice} 
                  className="text-[10px] md:text-xs text-gray-400 line-through font-medium mt-0.5 leading-none" 
                />
              )}
            </div>

            {isInCart ? (
              <button
                type="button"
                onClick={handleRemoveFromCart}
                className="px-4 py-2 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 bg-red-50 text-red-600 border border-red-100 transition-all shadow-sm active:scale-95">
                <FiTrash2 className="text-xs md:text-base" />
                <span>Remove</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleAddToCart}
                className={`px-4 py-2 rounded-xl font-extrabold text-xs md:text-sm flex items-center gap-2 transition-all shadow-sm active:scale-95 whitespace-nowrap ${isFlashSale
                  ? "bg-gradient-to-r from-[#ffc101] via-[#f5b800] to-[#e6ac00] text-black shadow-sm hover:shadow-amber-200"
                  : "gradient-green text-white hover:shadow-glow-green"
                  }`}>
                <FiShoppingBag className="text-xs md:text-base" />
                <span className="hidden sm:inline">Add to Cart</span>
                <span className="sm:hidden">Add</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ProductListItem;
