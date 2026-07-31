import { motion } from 'framer-motion';
import { getPlaceholderImage } from '../utils/helpers';

const BrandCard = ({ brand }) => {
  return (
    <motion.div
      whileHover={{ scale: 1.08, y: -5 }}
      className="glass-card rounded-2xl p-4 flex flex-col items-center justify-center cursor-pointer hover-lift group h-full"
    >
      <div className="w-full h-20 flex items-center justify-center mb-2">
        <img
          src={brand.logo}
          alt={brand.name}
          className="max-w-full max-h-full object-contain scale-60 group-hover:scale-75 transition-transform duration-300 filter group-hover:brightness-110"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = getPlaceholderImage(150, 80, brand.name || 'Brand');
          }}
        />
      </div>
      <p className="text-xs font-bold text-content text-center group-hover:text-brand-primary transition-colors">{brand.name}</p>
    </motion.div>
  );
};

export default BrandCard;

