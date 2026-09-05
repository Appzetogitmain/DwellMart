import { motion } from 'framer-motion';
import { getPlaceholderImage, getImageUrl } from '../utils/helpers';

const BrandCard = ({ brand, onClick }) => {
  const logo = getImageUrl(brand?.logo || brand?.image || brand?.brandLogo);

  return (
    <motion.div
      whileHover={{ scale: 1.04, y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-white rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-between cursor-pointer shadow-sm hover:shadow-md border border-gray-100/80 hover:border-brand-primary/40 transition-all duration-300 group h-full"
    >
      <div className="w-full aspect-[4/3] flex items-center justify-center mb-3 p-3 bg-gray-50/80 rounded-xl border border-gray-100 group-hover:bg-white group-hover:border-amber-200 transition-colors">
        <img
          src={logo}
          alt={brand?.name || 'Brand'}
          className="max-w-full max-h-full object-contain transition-transform duration-300 group-hover:scale-105"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = getPlaceholderImage(150, 80, brand?.name || 'Brand');
          }}
          loading="lazy"
        />
      </div>
      <p className="text-xs sm:text-sm font-bold text-gray-800 text-center truncate w-full group-hover:text-brand-primary transition-colors">
        {brand?.name}
      </p>
    </motion.div>
  );
};

export default BrandCard;

