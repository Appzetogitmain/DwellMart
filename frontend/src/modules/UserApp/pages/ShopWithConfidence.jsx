import React from 'react';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiGlobe, FiCreditCard, FiTag, FiPackage, FiAward } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

const ShopWithConfidence = () => {
  const navigate = useNavigate();

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
      isWide: true
    }
  ];

  const brandColor = "#2d5a5a"; // Professional teal from the image

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white px-2 py-4 flex items-center">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <FiArrowLeft className="text-xl text-gray-800" />
        </button>
        <h1 className="text-lg font-bold text-gray-800 ml-2">Shop With Confidence</h1>
      </div>

      <div className="max-w-md mx-auto px-6 py-6">
        {/* Features Grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-12">
          {features.map((feature, index) => (
            <motion.div 
              key={feature.title}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              className={`flex flex-col items-center text-center ${feature.isWide ? 'col-span-2 mt-4' : ''}`}
            >
              <div className="mb-4">
                <feature.icon 
                  size={42} 
                  style={{ color: brandColor, strokeWidth: 1.2 }} 
                />
              </div>
              <h3 className="text-sm font-bold text-gray-900 mb-1 leading-tight px-2">
                {feature.title}
              </h3>
              <p className="text-[11px] text-gray-500 font-medium leading-normal px-1">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Minimal Footer Spacer */}
        <div className="mt-20 border-t border-gray-50 pt-8 text-center">
           <p className="text-[10px] text-gray-300 font-bold uppercase tracking-[0.2em]">Dwell Mart Verified</p>
        </div>
      </div>
    </div>
  );
};

export default ShopWithConfidence;
