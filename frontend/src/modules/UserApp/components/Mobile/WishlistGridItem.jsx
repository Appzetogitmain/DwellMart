import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiShoppingBag, FiTrash2, FiStar, FiHeart } from 'react-icons/fi';
import { formatPrice, getPlaceholderImage } from '../../../../shared/utils/helpers';
import LazyImage from '../../../../shared/components/LazyImage';
import { useCartStore } from '../../../../shared/store/useStore';
import toast from 'react-hot-toast';
import { usePageTranslation } from '../../../../hooks/usePageTranslation';

const WishlistGridItem = ({ item, index, onMoveToCart, onRemove }) => {
  const { getTranslatedText: t } = usePageTranslation(["Remove", "Add", "Removed from cart!"]);
  const { items: cartItems, removeItem } = useCartStore();
  const isInCart = cartItems.some((i) => i.id === item.id);

  const handleRemoveFromCart = (e) => {
    if (e) {
      e.stopPropagation();
    }
    removeItem(item.id);
    toast.success(t("Removed from cart!"));
  };
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        delay: index * 0.05,
        type: 'spring',
        stiffness: 200,
        damping: 20,
      }}
      whileTap={{ scale: 0.98 }}
      style={{ willChange: 'transform', transform: 'translateZ(0)' }}
      className="glass-card rounded-lg overflow-hidden group cursor-pointer h-full flex flex-col"
    >
      <div className="relative">
        {/* Favorite Icon - Always filled since it's in wishlist */}
        <div className="absolute top-1.5 right-1.5 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(item.id);
            }}
            className="p-1 glass rounded-full shadow-lg transition-all duration-300 group"
          >
            <FiHeart className="text-xs transition-all duration-300 text-red-500 fill-red-500 scale-110" />
          </button>
        </div>

        {/* Product Image */}
        <Link to={`/product/${item.id}`}>
          <div className="w-full h-32 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center overflow-hidden relative">
            <LazyImage
              src={item.image}
              alt={item.name}
              className="w-full h-full object-contain p-2"
              style={{ willChange: 'transform', transform: 'translateZ(0)' }}
              onError={(e) => {
                e.target.src = getPlaceholderImage(300, 300, item.name?.charAt(0) || 'P');
              }}
            />
          </div>
        </Link>
      </div>

      {/* Product Info */}
      <div className="p-2 flex-1 flex flex-col">
        <Link to={`/product/${item.id}`}>
          <h3 className="font-bold text-gray-800 mb-0.5 line-clamp-2 text-xs transition-colors leading-tight">{item.name}</h3>
        </Link>
        {item.unit && (
          <p className="text-[10px] text-gray-500 mb-0.5 font-medium">{item.unit}</p>
        )}

        {/* Rating */}
        {item.rating && (
          <div className="flex items-center gap-0.5 mb-0.5">
            <div className="flex items-center">
              {[...Array(5)].map((_, i) => (
                <FiStar
                  key={i}
                  className={`text-[8px] ${i < Math.floor(item.rating)
                      ? 'text-yellow-400 fill-yellow-400'
                      : 'text-gray-300'
                    }`}
                />
              ))}
            </div>
            <span className="text-[9px] text-gray-600 font-medium">
              {item.rating}
            </span>
          </div>
        )}

        {/* Price */}
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs font-bold text-gray-800">
            {formatPrice(item.price)}
          </span>
          {item.originalPrice && (
            <span className="text-[9px] text-gray-400 line-through font-medium">
              {formatPrice(item.originalPrice)}
            </span>
          )}
        </div>

        {/* Add/Remove Button */}
        {isInCart ? (
          <motion.button
            onClick={handleRemoveFromCart}
            whileTap={{ scale: 0.95 }}
            style={{ willChange: "transform", transform: "translateZ(0)" }}
            className="w-full py-1 rounded-md font-semibold text-[10px] transition-all duration-300 flex items-center justify-center gap-1 mt-auto bg-red-50 text-red-600 border border-red-100">
            <FiTrash2 className="text-xs" />
            <span>{t('Remove')}</span>
          </motion.button>
        ) : (
          <motion.button
            onClick={(e) => {
              e.stopPropagation();
              onMoveToCart(item);
            }}
            whileTap={{ scale: 0.95 }}
            style={{ willChange: "transform", transform: "translateZ(0)" }}
            className="w-full py-1 rounded-md font-semibold text-[10px] transition-all duration-300 flex items-center justify-center gap-1 mt-auto gradient-green text-white group/btn">
            <FiShoppingBag className="text-xs transition-transform" />
            <span>{t('Add')}</span>
          </motion.button>
        )}
      </div>
    </motion.div>
  );
};

export default WishlistGridItem;

