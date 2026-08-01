import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiChevronLeft, FiChevronRight, FiZap, FiShoppingBag, FiHeart, FiPackage } from "react-icons/fi";

const PROMO_SLIDES = [
  {
    id: 1,
    title: "Stock up on daily essentials",
    subtitle: "Get farm-fresh goodness & a range of exotic fruits, vegetables, eggs & more",
    buttonText: "Shop Now",
    gradient: "from-emerald-700 via-teal-800 to-slate-900",
    badge: "10-15 Mins Delivery",
    categorySlug: "fresh-fruits-vegetables",
  },
  {
    id: 2,
    title: "Super Savers Grocery Sale",
    subtitle: "Up to 45% OFF on Atta, Rice, Oils, Ghees & Daily Kitchen Staples",
    buttonText: "Claim Deals",
    gradient: "from-amber-600 via-orange-700 to-slate-900",
    badge: "Lowest Prices Guaranteed",
    categorySlug: "atta-rice-staples",
  },
  {
    id: 3,
    title: "Instant Refreshment & Snacks",
    subtitle: "Cold beverages, chips, chocolates & munchies delivered ice-cold",
    buttonText: "Explore Snacks",
    gradient: "from-indigo-700 via-purple-800 to-slate-900",
    badge: "Express 10 Min Delivery",
    categorySlug: "beverages-drinks",
  },
];

const SERVICE_TILES = [
  {
    id: "pharmacy",
    title: "Pharmacy at doorstep!",
    subtitle: "Cough syrups, pain relief & wellness",
    icon: "💊",
    badge: "Health First",
    bgColor: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "pet-care",
    title: "Pet care supplies",
    subtitle: "Food, treats, toys & grooming",
    icon: "🐾",
    badge: "For Furry Friends",
    bgColor: "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
  },
  {
    id: "baby-care",
    title: "Baby essentials",
    subtitle: "Diapers, wipes, baby food & skin care",
    icon: "👶",
    badge: "Gentle Care",
    bgColor: "bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400",
  },
  {
    id: "frozen",
    title: "Frozen & Ready to Eat",
    subtitle: "Ice creams, frozen snacks & meals",
    icon: "🍦",
    badge: "Chilled Express",
    bgColor: "bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400",
  },
];

const QuickCommerceHeroBanner = ({ onSelectCategory }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const timeoutRef = useRef(null);

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setCurrentSlide((prev) => (prev + 1) % PROMO_SLIDES.length);
    }, 4500);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [currentSlide]);

  const slide = PROMO_SLIDES[currentSlide];

  return (
    <div className="w-full space-y-4 px-4 sm:px-6 py-2">
      {/* Main Promo Carousel Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-border shadow-md">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.35 }}
            className={`w-full min-h-[160px] sm:min-h-[190px] p-5 sm:p-7 bg-gradient-to-r ${slide.gradient} text-white flex flex-col justify-between relative overflow-hidden`}
          >
            {/* Background Decorative Graphic */}
            <div className="absolute right-0 top-0 bottom-0 w-1/2 bg-white/5 skew-x-12 pointer-events-none" />

            {/* Slide Header Tag */}
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-[10px] sm:text-xs font-extrabold uppercase tracking-wider text-white">
                <FiZap className="text-amber-300" />
                {slide.badge}
              </span>
            </div>

            {/* Slide Body */}
            <div className="max-w-xl z-10 my-1">
              <h2 className="text-lg sm:text-2xl font-black tracking-tight leading-tight text-white mb-1">
                {slide.title}
              </h2>
              <p className="text-xs sm:text-sm font-medium text-white/80 line-clamp-2">
                {slide.subtitle}
              </p>
            </div>

            {/* Slide Action Button & Dots */}
            <div className="flex items-center justify-between pt-2 z-10">
              <button
                type="button"
                onClick={() => onSelectCategory?.(slide.categorySlug)}
                className="px-4 py-2 rounded-xl bg-white text-slate-950 font-extrabold text-xs hover:bg-amber-300 transition-all shadow-sm active:scale-95"
              >
                {slide.buttonText} →
              </button>

              {/* Indicator Dots */}
              <div className="flex items-center gap-1.5">
                {PROMO_SLIDES.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setCurrentSlide(idx)}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      currentSlide === idx ? "w-6 bg-white" : "w-2 bg-white/40"
                    }`}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Blinkit-Style Service Offer Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {SERVICE_TILES.map((tile) => (
          <motion.button
            key={tile.id}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={() => onSelectCategory?.(tile.id)}
            className={`rounded-2xl border p-3 text-left flex flex-col justify-between gap-2 transition-all cursor-pointer ${tile.bgColor} bg-surface`}
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">{tile.icon}</span>
              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-surface-muted text-content-muted">
                {tile.badge}
              </span>
            </div>
            <div>
              <h4 className="text-xs font-extrabold text-content leading-tight">
                {tile.title}
              </h4>
              <p className="text-[10px] text-content-muted line-clamp-1 mt-0.5">
                {tile.subtitle}
              </p>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default QuickCommerceHeroBanner;
