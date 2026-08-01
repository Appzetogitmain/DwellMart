import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiStar, FiShoppingBag, FiCheckCircle, FiArrowRight, FiMapPin, FiUsers } from 'react-icons/fi';
import { motion } from 'framer-motion';
import LazyImage from '../../../../shared/components/LazyImage';
import { VendorWholesaleBadge } from "../../../../shared/components/WholesaleBadge";

const formatCount = (num) => {
  const n = Number(num) || 0;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
};

const getInitials = (name = '') => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'ST';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const VendorShowcaseCard = ({ vendor, index = 0 }) => {
  const [imageFailed, setImageFailed] = useState(false);
  if (!vendor) return null;

  const vendorIdentifier = vendor.slug || vendor.id || vendor._id;
  const vendorLink = `/seller/${vendorIdentifier}`;
  const storeName = vendor.storeName || vendor.name || 'Store';
  
  // Logo Priority Cascade: storeLogo -> profileImage -> Internal Initials Avatar
  const rawImage = vendor.storeLogo || vendor.profileImage || vendor.logo || vendor.image || '';
  const hasValidImage = !!rawImage && !imageFailed;
  const initials = getInitials(storeName);

  const rating = Number(vendor.rating) || 0;
  const reviewCount = Number(vendor.reviewCount) || 0;
  const productCount = Number(vendor.productCount ?? vendor.totalProducts) || 0;
  const followersCount = Number(vendor.followersCount ?? vendor.followers) || 0;

  const location = vendor.location || (vendor.address?.city && vendor.address?.state ? `${vendor.address.city}, ${vendor.address.state}` : vendor.address?.city || vendor.address?.state || '');

  return (
    <Link to={vendorLink} className="block group h-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        whileTap={{ scale: 0.98 }}
        className="bg-surface border border-border hover:border-brand-primary/50 rounded-card p-4 flex flex-col items-center text-center w-[170px] min-w-[170px] h-[250px] min-h-[250px] shadow-sm hover:shadow-md transition-all justify-between"
      >
        {/* Vendor Logo / Internal Initials Avatar */}
        <div className="relative mb-2 flex-shrink-0">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-500 to-yellow-600 border-2 border-brand-primary/30 flex items-center justify-center overflow-hidden shadow-sm group-hover:scale-105 transition-transform text-white font-black text-lg select-none">
            {hasValidImage ? (
              <img
                src={rawImage}
                alt={storeName}
                className="w-full h-full object-cover"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          {vendor.isVerified && (
            <div className="absolute -bottom-1 -right-1 bg-brand-primary rounded-full p-1 border-2 border-white text-black shadow-sm" title="Verified Store">
              <FiCheckCircle className="text-xs stroke-[3]" />
            </div>
          )}
        </div>

        {/* Store Name */}
        <h3 className="font-bold text-content text-sm mb-1 line-clamp-2 min-h-[2.5rem] flex items-center justify-center group-hover:text-brand-primary transition-colors leading-tight">
          {storeName}
        </h3>
        {vendor.sellingChannels?.wholesale?.enabled === true && (
          <div className="mb-1 flex justify-center">
            <VendorWholesaleBadge vendor={vendor} />
          </div>
        )}

        {/* Middle Metadata (Rating, Location, Products, Followers) */}
        <div className="flex-1 flex flex-col items-center justify-center w-full gap-0.5 my-1 overflow-hidden min-h-[3rem]">
          {/* Rating & Review Count */}
          {rating > 0 && (
            <div className="flex items-center gap-1">
              <div className="flex items-center text-amber-400">
                <FiStar className="text-xs fill-amber-400" />
              </div>
              <span className="text-xs text-content font-bold">{rating.toFixed(1)}</span>
              {reviewCount > 0 && (
                <span className="text-[11px] text-content-secondary">({formatCount(reviewCount)})</span>
              )}
            </div>
          )}

          {/* Location Badge */}
          {location && (
            <div className="flex items-center justify-center gap-1 text-[11px] text-content-secondary truncate max-w-full">
              <FiMapPin className="text-brand-primary text-xs flex-shrink-0" />
              <span className="truncate">{location}</span>
            </div>
          )}

          {/* Product & Followers Metrics */}
          {productCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-content font-medium">
              <FiShoppingBag className="text-brand-primary text-xs" />
              <span>{formatCount(productCount)} {productCount === 1 ? 'Product' : 'Products'}</span>
            </div>
          )}
          {followersCount > 0 && (
            <div className="flex items-center gap-1 text-[11px] text-content-secondary">
              <FiUsers className="text-content-secondary text-xs" />
              <span>{formatCount(followersCount)} Followers</span>
            </div>
          )}
        </div>

        {/* Open Store Button */}
        <div className="mt-auto w-full pt-2 border-t border-border/50 flex-shrink-0">
          <div className="flex items-center justify-center gap-1 text-brand-primary text-xs font-bold group-hover:translate-x-0.5 transition-transform">
            <span>Open Store</span>
            <FiArrowRight className="text-xs" />
          </div>
        </div>
      </motion.div>
    </Link>
  );
};

export default VendorShowcaseCard;

