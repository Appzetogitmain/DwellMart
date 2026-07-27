import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { FiClock, FiZap } from "react-icons/fi";
import ProductCard from "../../../../shared/components/ProductCard";
import { getDailyDeals } from "../../data/catalogData";
import { usePageTranslation } from "../../../../hooks/usePageTranslation";
 
const DailyDealsSection = ({ products = null }) => {
  const { getTranslatedText: t } = usePageTranslation([
    "Daily Deals",
    "Limited time offers - Up to 70% OFF",
    "See All",
    "Deal ends in",
    "Hrs",
    "Min",
    "Sec"
  ]);
  const fallback = getDailyDeals().slice(0, 5);
  const dailyDeals = Array.isArray(products) && products.length > 0
    ? products.slice(0, 5)
    : fallback;
  const [timeLeft, setTimeLeft] = useState({
    hours: 23,
    minutes: 59,
    seconds: 59,
  });

  // Countdown timer - resets daily
  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const difference = endOfDay - now;

      if (difference > 0) {
        const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((difference / (1000 * 60)) % 60);
        const seconds = Math.floor((difference / 1000) % 60);

        setTimeLeft({ hours, minutes, seconds });
      } else {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0 });
      }
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (value) => {
    return value.toString().padStart(2, "0");
  };

  if (dailyDeals.length === 0) {
    return null;
  }

  return (
    <div className="relative my-4 rounded-2xl overflow-hidden shadow-xl border-2 border-[#ffc101]/40 bg-gradient-to-br from-[#ffc101] via-[#e6ac00] to-[#b38600]">
      {/* Decorative Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white rounded-full blur-2xl"></div>
      </div>

      {/* Content */}
      <div className="relative px-3 py-5">
        {/* Header with Badge */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="bg-black/90 backdrop-blur-sm rounded-full p-2 md:p-3 shadow-md">
                <FiZap className="text-[#ffc101] text-lg md:text-2xl" />
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-black uppercase tracking-tight">
                  {t("Daily Deals")}
                </h2>
                <p className="text-xs md:text-sm text-black/90 font-bold">
                  {t("Limited time offers - Up to 70% OFF")}
                </p>
              </div>
            </div>
            <Link
              to="/daily-deals"
              className="bg-black text-[#ffc101] text-sm font-extrabold px-3 py-1.5 rounded-lg hover:bg-gray-900 transition-all shadow-md">
              {t("See All")}
            </Link>
          </div>

          {/* Prominent Countdown Timer */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl p-4 shadow-2xl border-2 border-white/50">
            <div className="mb-2">
              <p className="text-xs font-bold text-gray-800 mb-2 ml-11">
                {t("Deal ends in")}
              </p>
              <div className="flex items-center gap-3">
                <div className="bg-black text-[#ffc101] rounded-md p-1.5 shadow-md transform translate-y-[2px]">
                  <FiClock className="text-[#ffc101] text-base" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="bg-black text-[#ffc101] rounded-lg px-2.5 py-1.5 min-w-[2.8rem] text-center shadow-lg border border-[#ffc101]/30">
                    <div className="text-base font-extrabold leading-tight">
                      {formatTime(timeLeft.hours)}
                    </div>
                    <div className="text-[8px] text-[#ffc101]/80 font-bold uppercase">{t("Hrs")}</div>
                  </div>
                  <span className="text-black font-black text-lg">:</span>
                  <div className="bg-black text-[#ffc101] rounded-lg px-2.5 py-1.5 min-w-[2.8rem] text-center shadow-lg border border-[#ffc101]/30">
                    <div className="text-base font-extrabold leading-tight">
                      {formatTime(timeLeft.minutes)}
                    </div>
                    <div className="text-[8px] text-[#ffc101]/80 font-bold uppercase">{t("Min")}</div>
                  </div>
                  <span className="text-black font-black text-lg">:</span>
                  <div className="bg-black text-[#ffc101] rounded-lg px-2.5 py-1.5 min-w-[2.8rem] text-center shadow-lg border border-[#ffc101]/30 animate-pulse">
                    <div className="text-base font-extrabold leading-tight">
                      {formatTime(timeLeft.seconds)}
                    </div>
                    <div className="text-[8px] text-[#ffc101]/80 font-bold uppercase">{t("Sec")}</div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
          {dailyDeals.map((product, index) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="h-full">
              <ProductCard product={product} isFlashSale={true} />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DailyDealsSection;
