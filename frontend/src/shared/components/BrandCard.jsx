import { useState } from 'react';
import { motion } from 'framer-motion';
import { getImageUrl } from '../utils/helpers';

const getBrandInitials = (name = "") => {
  const clean = String(name || "").trim();
  if (!clean) return "B";
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return (words[0][0] + (words[1] ? words[1][0] : "")).toUpperCase();
};

const getBrandColor = (name = "") => {
  const colors = [
    "from-amber-500/15 to-orange-500/10 text-amber-700 border-amber-200",
    "from-blue-500/15 to-indigo-500/10 text-blue-700 border-blue-200",
    "from-emerald-500/15 to-teal-500/10 text-emerald-700 border-emerald-200",
    "from-purple-500/15 to-pink-500/10 text-purple-700 border-purple-200",
    "from-rose-500/15 to-red-500/10 text-rose-700 border-rose-200",
    "from-cyan-500/15 to-sky-500/10 text-cyan-700 border-cyan-200",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const BrandCard = ({ brand, onClick }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const rawLogo = brand?.logo || brand?.image || brand?.brandLogo;
  const hasValidLogo = Boolean(
    rawLogo &&
    typeof rawLogo === 'string' &&
    rawLogo.trim() !== '' &&
    rawLogo.trim() !== 'undefined' &&
    rawLogo.trim() !== 'null' &&
    !rawLogo.includes('placeholder')
  );

  const productCount = Number(brand?.productCount || 0);
  const brandName = brand?.name || 'Brand';
  const colorClass = getBrandColor(brandName);

  return (
    <motion.div
      whileHover={{ scale: 1.03, y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-white rounded-2xl p-4 flex flex-col items-center justify-between cursor-pointer shadow-xs hover:shadow-lg border border-gray-100 hover:border-brand-primary/50 transition-all duration-300 group h-full min-h-[170px]"
    >
      {/* Brand Visual (Logo or Monogram) */}
      <div className="w-full h-20 flex items-center justify-center mb-2 px-2">
        {hasValidLogo && !imgFailed ? (
          <img
            src={getImageUrl(rawLogo, "")}
            alt={brandName}
            className="max-w-full max-h-full object-contain transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgFailed(true)}
            loading="lazy"
          />
        ) : (
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${colorClass} border flex items-center justify-center font-black text-sm sm:text-base tracking-wider shadow-xs transition-transform duration-300 group-hover:scale-110`}>
            {getBrandInitials(brandName)}
          </div>
        )}
      </div>

      {/* Brand Info */}
      <div className="w-full text-center flex flex-col items-center">
        <p className="text-xs sm:text-sm font-bold text-gray-800 text-center line-clamp-1 w-full group-hover:text-brand-primary transition-colors" title={brandName}>
          {brandName}
        </p>

        {productCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/60 rounded-full px-2 py-0.5 mt-1.5">
            <span>●</span> {productCount} {productCount === 1 ? 'product' : 'products'}
          </span>
        ) : (
          <span className="text-[10px] text-gray-400 font-medium mt-1.5">
            0 products
          </span>
        )}
      </div>
    </motion.div>
  );
};

export default BrandCard;

