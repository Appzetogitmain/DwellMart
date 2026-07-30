import { Link } from 'react-router-dom';
import { FiStar, FiShoppingBag, FiCheckCircle, FiArrowRight } from 'react-icons/fi';
import { motion } from 'framer-motion';
import LazyImage from '../../../../shared/components/LazyImage';

const VendorShowcaseCard = ({ vendor, index = 0 }) => {
  if (!vendor) return null;
  const vendorLink = `/seller/${vendor.id}`;

  return (
    <Link to={vendorLink}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1 }}
        whileTap={{ scale: 0.98 }}
        className="glass-card rounded-xl p-4 flex flex-col items-center text-center w-[160px] min-w-[160px] h-full"
      >
        {/* Vendor Logo/Avatar */}
        <div className="relative mb-3">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center overflow-hidden shadow-lg">
            {vendor.storeLogo ? (
              <LazyImage
                src={vendor.storeLogo}
                alt={vendor.storeName || vendor.name}
                className="w-full h-full object-cover"
                fallbackImage={`https://ui-avatars.com/api/?name=${encodeURIComponent(vendor.storeName || vendor.name)}&background=7C3AED&color=fff&size=128`}
              />
            ) : (
              <span className="text-2xl font-bold text-white">
                {(vendor.storeName || vendor.name).charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          {vendor.isVerified && (
            <div className="absolute -bottom-1 -right-1 bg-accent-500 rounded-full p-1 border-2 border-white">
              <FiCheckCircle className="text-white text-xs" />
            </div>
          )}
        </div>

        {/* Vendor Name */}
        <h3 className="font-bold text-gray-800 text-sm mb-1 line-clamp-2 min-h-[2.5rem]">
          {vendor.storeName || vendor.name}
        </h3>

        {/* Rating */}
        {vendor.rating > 0 && (
          <div className="flex items-center gap-1 mb-2">
            <div className="flex items-center">
              {[...Array(5)].map((_, i) => (
                <FiStar
                  key={i}
                  className={`text-[10px] ${i < Math.floor(vendor.rating)
                    ? 'text-yellow-400 fill-yellow-400'
                    : 'text-gray-300'
                    }`}
                />
              ))}
            </div>
            <span className="text-xs text-gray-600 font-medium">
              {(vendor.rating || 0).toFixed(1)}
            </span>
          </div>
        )}

        {/* Product Count */}
        <div className="flex items-center gap-1 text-xs text-gray-600 mb-3">
          <FiShoppingBag className="text-primary-500" />
          <span>{vendor.totalProducts || 0} products</span>
        </div>

        {/* Visit Store Button */}
        <div className="mt-auto w-full">
          <div className="flex items-center justify-center gap-1 text-primary-600 text-xs font-semibold">
            <span>Visit Store</span>
            <FiArrowRight className="text-xs" />
          </div>
        </div>
      </motion.div>
    </Link>
  );
};

export default VendorShowcaseCard;

