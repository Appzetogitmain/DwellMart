import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiBox, FiChevronRight, FiCheckCircle, FiTruck, FiPercent, FiFileText } from "react-icons/fi";
import { Button, Badge, Card } from "../../../../shared/components/ui";
import api from "../../../../shared/utils/api";

const DEFAULT_SLIDES = [
  {
    id: "ws-default-1",
    title: "Direct Factory Wholesale Sourcing",
    subtitle: "Connect directly with verified manufacturers & distributors. Enjoy automatic volume pricing tiers.",
    buttonText: "Explore Bulk Deals",
    gradient: "from-blue-900 via-indigo-950 to-slate-950",
    badge: "Factory Direct",
    categorySlug: "",
  },
  {
    id: "ws-default-2",
    title: "Bulk Lots & Quantity Tier Discounts",
    subtitle: "Deeper discounts unlock automatically as quantities grow. 100% GST input tax credit (ITC) compliant.",
    buttonText: "Source Bulk Lots",
    gradient: "from-emerald-900 via-teal-950 to-slate-950",
    badge: "Volume Tiers",
    categorySlug: "",
  },
  {
    id: "ws-default-3",
    title: "Apparel, Textiles & Footwear Lots",
    subtitle: "Ready inventory from certified mills, master distributors and verified factory outlets.",
    buttonText: "View Wholesale Catalog",
    gradient: "from-slate-900 via-zinc-900 to-black",
    badge: "Verified Suppliers",
    categorySlug: "",
  },
];

const WHOLESALE_SERVICE_TILES = [
  {
    id: "factory-direct",
    title: "Direct Factory Rates",
    subtitle: "Source direct, no middlemen",
    icon: "🏭",
    badge: "B2B Price",
  },
  {
    id: "volume-tiers",
    title: "Tiered Bulk Slabs",
    subtitle: "Deeper savings with scale",
    icon: "📊",
    badge: "Volume Tiers",
  },
  {
    id: "gst-itc",
    title: "GST Invoices & ITC",
    subtitle: "100% tax compliant billing",
    icon: "📑",
    badge: "Input Credit",
  },
  {
    id: "cargo-freight",
    title: "Doorstep Bulk Freight",
    subtitle: "Carton & pallet logistics",
    icon: "🚚",
    badge: "Pan-India",
  },
];

const WholesaleHeroBanner = ({ categories = [], onSelectCategory }) => {
  const [slides, setSlides] = useState(DEFAULT_SLIDES);
  const [currentSlide, setCurrentSlide] = useState(0);
  const timeoutRef = useRef(null);

  // Fetch dynamic banners from backend API (Admin Managed Banners)
  useEffect(() => {
    let cancelled = false;
    api
      .get("/banners")
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data ?? res;
        const rawBanners = Array.isArray(payload) ? payload : payload?.banners;
        if (Array.isArray(rawBanners) && rawBanners.length > 0) {
          const activeBanners = rawBanners.filter((b) => b.isActive !== false);
          const wsBanners = activeBanners.filter((b) => b.type === "wholesale" || b.experience === "wholesale");
          const targetBanners = wsBanners.length > 0 ? wsBanners : null;

          if (targetBanners && targetBanners.length > 0) {
            const formattedBanners = targetBanners.map((b, idx) => ({
              id: b._id || b.id || `ws-banner-${idx}`,
              title: b.title || b.name || "Wholesale Volume Deals",
              subtitle: b.subtitle || b.description || "Direct factory pricing",
              buttonText: b.buttonText || b.ctaText || "Explore Deals",
              image: b.image || b.imageUrl || b.url || "",
              gradient: b.gradient || DEFAULT_SLIDES[idx % DEFAULT_SLIDES.length].gradient,
              badge: b.badge || b.tag || "Factory Direct",
              categorySlug: b.categorySlug || b.link || b.url || "",
            }));
            setSlides(formattedBanners);
          }
        }
      })
      .catch(() => {
        // Graceful fallback to DEFAULT_SLIDES
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
        subtitle: `Wholesale ${cat.name} lots`,
        image: cat.image || cat.icon,
        icon: null,
        badge: "Wholesale",
      }));
    }
    return WHOLESALE_SERVICE_TILES;
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
    <div className="w-full space-y-4 px-3 sm:px-6 py-2">
      {/* Main Promo Carousel Banner */}
      <div className="relative overflow-hidden rounded-card border border-borderToken-default shadow-card">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.35 }}
            className={`w-full min-h-[160px] sm:min-h-[190px] p-5 sm:p-7 bg-gradient-to-r ${
              slide.gradient || "from-blue-900 via-indigo-950 to-slate-950"
            } text-white flex flex-col justify-between relative overflow-hidden`}
          >
            {/* Dynamic Banner Image Background Overlay if available */}
            {slide.image && (
              <img
                src={slide.image}
                alt={slide.title}
                className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none"
              />
            )}

            {/* Background Ambient Glow */}
            <div className="absolute right-0 top-0 bottom-0 w-1/2 bg-amber-500/10 blur-2xl pointer-events-none" />

            {/* Slide Header Tag */}
            <div className="flex items-center gap-2 mb-2 z-10">
              <Badge variant="gold" size="sm" className="!normal-case font-black gap-1.5 shadow-sm">
                <FiBox className="text-amber-500 fill-amber-500 text-xs" />
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

      {/* Wholesale Feature Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {dynamicServiceTiles.map((tile) => (
          <motion.div
            key={tile.id}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectCategory?.(tile.id)}
            className="cursor-pointer"
          >
            <Card
              variant="default"
              padding="sm"
              className="h-full flex flex-col justify-between gap-2 hover:border-brand-primary/50 transition-all"
            >
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
                  <span className="text-2xl">{tile.icon || "📦"}</span>
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

export default WholesaleHeroBanner;
