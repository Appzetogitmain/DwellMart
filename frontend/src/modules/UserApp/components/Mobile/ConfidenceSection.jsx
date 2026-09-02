import React from 'react';
import { motion } from 'framer-motion';
import { FiGlobe, FiCreditCard, FiTag, FiPackage, FiAward } from 'react-icons/fi';
import { usePageTranslation } from '../../../../hooks/usePageTranslation';

const features = [
  {
    title: "Fast Delivery Service",
    description: "Quick, secure, and hassle-free shipping",
    icon: FiGlobe,
  },
  {
    title: "Secure Payment",
    description: "Pay with popular and secure payment methods",
    icon: FiCreditCard,
  },
  {
    title: "Daily Deals",
    description: "Items you love at prices that fit your budget",
    icon: FiTag,
  },
  {
    title: "7-day Return Policy",
    description: "Merchandise must be returned within 7 days.",
    icon: FiPackage,
  },
  {
    title: "International Brands",
    description: "Big savings on your favourite brands.",
    icon: FiAward,
  }
];

const ConfidenceSection = () => {
  const brandColor = "#2d5a5a"; // Matching the luxury teal from design
  const { getTranslatedText: t } = usePageTranslation([
    "Shop With Confidence",
    "Fast Delivery Service",
    "Quick, secure, and hassle-free shipping",
    "Secure Payment",
    "Pay with popular and secure payment methods",
    "Daily Deals",
    "Items you love at prices that fit your budget",
    "7-day Return Policy",
    "Merchandise must be returned within 7 days.",
    "International Brands",
    "Big savings on your favourite brands."
  ]);
 
  return (
    <div className="px-5 py-10 bg-white">
      <h2 className="text-xl font-bold text-gray-900 mb-8 px-1">
        {t("Shop With Confidence")}
      </h2>
      
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 -mx-5 px-5 lg:grid lg:grid-cols-5 lg:gap-8 lg:mx-0 lg:px-0">
        {features.map((feature, index) => (
          <motion.div 
            key={feature.title}
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1, duration: 0.5 }}
            className="flex-shrink-0 w-[160px] lg:w-auto flex flex-col items-center text-center"
          >
            <div className="mb-5">
              <feature.icon 
                size={38} 
                style={{ color: brandColor, strokeWidth: 1.2 }} 
              />
            </div>
            <h3 className="text-[13px] font-bold text-gray-900 mb-1.5 leading-tight tracking-tight">
              {t(feature.title)}
            </h3>
            <p className="text-[10px] text-gray-500 font-medium leading-[1.5] max-w-[130px]">
              {t(feature.description)}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default ConfidenceSection;
