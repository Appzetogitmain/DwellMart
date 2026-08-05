import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiZap, FiChevronRight } from "react-icons/fi";
import { Button, Badge, Card } from "../../../../shared/components/ui";
import api from "../../../../shared/utils/api";

const DEFAULT_SLIDES = [
  {
    id: "default-1",
    title: "Stock up on daily essentials",
    subtitle: "Get farm-fresh goodness & a range of exotic fruits, vegetables, eggs & more",
    buttonText: "Shop Now",
    gradient: "from-emerald-700 via-teal-800 to-slate-950",
    badge: "10-15 Mins Delivery",
    categorySlug: "fresh-fruits-vegetables",
  },
  {
    id: "default-2",
    title: "Super Savers Grocery Sale",
    subtitle: "Up to 45% OFF on Atta, Rice, Oils, Ghees & Daily Kitchen Staples",
    buttonText: "Claim Deals",
    gradient: "from-amber-600 via-orange-700 to-slate-950",
    badge: "Lowest Prices Guaranteed",
    categorySlug: "atta-rice-staples",
  },
  {
    id: "default-3",
    title: "Instant Refreshment & Snacks",
    subtitle: "Cold beverages, chips, chocolates & munchies delivered ice-cold",
    buttonText: "Explore Snacks",
    gradient: "from-indigo-700 via-purple-800 to-slate-950",
    badge: "Express 10 Min Delivery",
    categorySlug: "beverages-drinks",
  },
];

const SERVICE_TILES = [
  {
    id: "pharmacy",
    title: "Pharmacy at doorstep",
    subtitle: "Cough syrups, pain relief & wellness",
    icon: "💊",
    badge: "Health First",
  },
  {
    id: "pet-care",
    title: "Pet care supplies",
    subtitle: "Food, treats, toys & grooming",
    icon: "🐾",
    badge: "Pet Care",
  },
  {
    id: "baby-care",
    title: "Baby essentials",
    subtitle: "Diapers, wipes, baby food & skin care",
    icon: "👶",
    badge: "Gentle Care",
  },
  {
    id: "frozen",
    title: "Frozen & Ready to Eat",
    subtitle: "Ice creams, frozen snacks & meals",
    icon: "🍦",
    badge: "Chilled Express",
  },
];

const QuickCommerceHeroBanner = ({ categories = [], onSelectCategory }) => {
  const [slides, setSlides] = useState(DEFAULT_SLIDES);
  const [currentSlide, setCurrentSlide] = useState(0);
  const timeoutRef = useRef(null);

  // Fetch dynamic banners from backend API (Admin Managed Banners)
  useEffect(() => {
    let cancelled = false;
    api.get("/banners")
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data ?? res;
        const rawBanners = Array.isArray(payload) ? payload : payload?.banners;
        if (Array.isArray(rawBanners) && rawBanners.length > 0) {
          const activeBanners = rawBanners.filter((b) => b.isActive !== false);
          // Prioritize dedicated Quick Commerce Banners, otherwise fallback to home_slider/hero
          const qcBanners = activeBanners.filter((b) => b.type === "quick_commerce");
          const targetBanners = qcBanners.length > 0 ? qcBanners : activeBanners;

          const formattedBanners = targetBanners.map((b, idx) => ({
            id: b._id || b.id || `banner-${idx}`,
            title: b.title || b.name || "Special Offer",
            subtitle: b.subtitle || b.description || "Limited time deal",
            buttonText: b.buttonText || b.ctaText || "Shop Now",
            image: b.image || b.imageUrl || b.url || "",
            gradient: b.gradient || DEFAULT_SLIDES[idx % DEFAULT_SLIDES.length].gradient,
            badge: b.badge || b.tag || "Express Deal",
            categorySlug: b.categorySlug || b.link || b.url || "fresh-fruits-vegetables",
          }));
          if (formattedBanners.length > 0) {
            setSlides(formattedBanners);
          }
        }
      })
      .catch(() => {
        // Graceful fallback to DEFAULT_SLIDES on API error
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Derive dynamic service tiles from backend categories or fallback to defaults
  const dynamicServiceTiles = useMemo(() => {
    if (Array.isArray(categories) && categories.length > 0) {
      return categories.slice(0, 4).map((cat) => ({
        id: cat._id || cat.id || cat.slug,
        title: cat.name,
        subtitle: cat.description || `Explore ${cat.name} selection`,
        image: cat.image || cat.icon,
        icon: null,
        badge: cat.badge || "Featured",
      }));
    }
    return SERVICE_TILES;
  }, [categories]);

  // Auto-advance banner slides
  useEffect(() => {
    if (slides.length <= 1) return;
    timeoutRef.current = setTimeout(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 4500);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [currentSlide, slides.length]);

  const slide = slides[currentSlide] || DEFAULT_SLIDES[0];

  return (
    <div className="w-full space-y-4 px-4 sm:px-6 py-2">
      {/* Main Promo Carousel Banner */}
      <div className="relative overflow-hidden rounded-card border border-borderToken-default shadow-card">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.35 }}
            className={`w-full min-h-[160px] sm:min-h-[190px] p-5 sm:p-7 bg-gradient-to-r ${slide.gradient || "from-amber-600 via-orange-700 to-slate-950"} text-white flex flex-col justify-between relative overflow-hidden`}
          >
            {/* Dynamic Banner Image Background Overlay if available */}
            {slide.image && (
              <img
                src={slide.image}
                alt={slide.title}
                className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none"
              />
            )}

            {/* Background Light Ambient Glow */}
            <div className="absolute right-0 top-0 bottom-0 w-1/2 bg-white/10 blur-2xl pointer-events-none" />

            {/* Slide Header Tag */}
            <div className="flex items-center gap-2 mb-2 z-10">
              <Badge variant="gold" size="sm" className="!normal-case font-black gap-1.5 shadow-sm">
                <FiZap className="text-amber-500 fill-amber-500" />
                <span>{slide.badge}</span>
              </Badge>
            </div>

            {/* Slide Body */}
            <div className="max-w-xl z-10 my-1">
              <h2 className="text-lg sm:text-2xl font-black tracking-tight leading-tight text-white mb-1 drop-shadow-sm">
                {slide.title}
              </h2>
              <p className="text-xs sm:text-sm font-medium text-white/90 line-clamp-2 drop-shadow-xs">
                {slide.subtitle}
              </p>
            </div>

            {/* Slide Action Button & Dots */}
            <div className="flex items-center justify-between pt-2 z-10">
              <Button
                size="sm"
                variant="primary"
                onClick={() => onSelectCategory?.(slide.categorySlug)}
                rightIcon={<FiChevronRight className="text-xs" />}
                className="!py-2 !px-4 text-xs font-extrabold shadow-md"
              >
                {slide.buttonText}
              </Button>

              {/* Indicator Dots */}
              {slides.length > 1 && (
                <div className="flex items-center gap-1.5">
                  {slides.map((s, idx) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setCurrentSlide(idx)}
                      className={`h-2 rounded-full transition-all duration-300 ${
                        currentSlide === idx ? "w-6 bg-brand-primary" : "w-2 bg-white/40"
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* DwellMart Service Offer Cards (Dynamic from Categories or Fallback) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {dynamicServiceTiles.map((tile) => (
          <motion.div
            key={tile.id}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectCategory?.(tile.id)}
            className="cursor-pointer"
          >
            <Card variant="default" padding="sm" className="h-full flex flex-col justify-between gap-2 hover:border-brand-primary/50 transition-all">
              <div className="flex items-center justify-between">
                {tile.image ? (
                  <img
                    src={tile.image}
                    alt={tile.title}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <span className="text-2xl">{tile.icon || "🛒"}</span>
                )}
                <Badge variant="gold" size="sm" className="!text-[9px] !px-1.5 !py-0.5">
                  {tile.badge}
                </Badge>
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-textColor-primary leading-tight line-clamp-1">
                  {tile.title}
                </h4>
                <p className="text-[10px] text-textColor-muted line-clamp-1 mt-0.5">
                  {tile.subtitle}
                </p>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default QuickCommerceHeroBanner;
