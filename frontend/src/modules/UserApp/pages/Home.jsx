import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, matchPath, useNavigate } from "react-router-dom";
import { FiHeart, FiTruck, FiRotateCcw, FiShield, FiCheckCircle, FiUsers, FiBox, FiGrid, FiLock } from "react-icons/fi";
import MobileLayout from "../components/Layout/MobileLayout";
import ProductCard from "../../../shared/components/ProductCard";
import AnimatedBanner from "../components/Mobile/AnimatedBanner";
import NewArrivalsSection from "../components/Mobile/NewArrivalsSection";
import DailyDealsSection from "../components/Mobile/DailyDealsSection";
import RecommendedSection from "../components/Mobile/RecommendedSection";
import FeaturedVendorsSection from "../components/Mobile/FeaturedVendorsSection";
import BrandLogosScroll from "../components/Mobile/BrandLogosScroll";
import MobileCategoryGrid from "../components/Mobile/MobileCategoryGrid";
import ConfidenceSection from "../components/Mobile/ConfidenceSection";
import TestimonialsSection from "../components/Mobile/TestimonialsSection";
import LazyImage from "../../../shared/components/LazyImage";
import {
  getMostPopular,
  getTrending,
  getFlashSale,
  getDailyDeals,
  getAllNewArrivals,
  getRecommendedProducts,
  getApprovedVendors,
  getCatalogBrands,
} from "../data/catalogData";
import PageTransition from "../../../shared/components/PageTransition";
import usePullToRefresh from "../hooks/usePullToRefresh";
import toast from "react-hot-toast";
import api from "../../../shared/utils/api";
import { usePageTranslation } from "../../../hooks/usePageTranslation";
import { useDynamicTranslation } from "../../../hooks/useDynamicTranslation";
import heroSlide1 from "../../../../data/hero/slide1.png";
import heroSlide2 from "../../../../data/hero/slide2.png";
import heroSlide3 from "../../../../data/hero/slide3.png";
import heroSlide4 from "../../../../data/hero/slide4.png";
import stylishWatchImg from "../../../../data/products/stylish watch.png";
import { getImageUrl, calculateDiscount } from "../../../shared/utils/helpers";
import ExperienceSwitcher from "../components/QuickCommerce/ExperienceSwitcher";

const normalizeId = (value) => String(value ?? "").trim();
const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeProduct = (raw) => {
  if (!raw) return null;
  const vendorObj =
    raw?.vendor && typeof raw.vendor === "object"
      ? raw.vendor
      : raw?.vendorId && typeof raw.vendorId === "object"
        ? raw.vendorId
        : null;
  const brandObj =
    raw?.brand && typeof raw.brand === "object"
      ? raw.brand
      : raw?.brandId && typeof raw.brandId === "object"
        ? raw.brandId
        : null;
  const categoryObj =
    raw?.category && typeof raw.category === "object"
      ? raw.category
      : raw?.categoryId && typeof raw.categoryId === "object"
        ? raw.categoryId
        : null;

  const id = normalizeId(raw?.id || raw?._id);
  const vendorId = normalizeId(vendorObj?._id || vendorObj?.id || raw?.vendorId);
  const brandId = normalizeId(brandObj?._id || brandObj?.id || raw?.brandId);
  const categoryId = normalizeId(
    categoryObj?._id || categoryObj?.id || raw?.categoryId
  );
  const rawImage = raw?.image || raw?.mainImage || raw?.thumbnail || raw?.images?.[0] || "";
  const image = getImageUrl(rawImage);
  const images = (Array.isArray(raw?.images) ? raw.images : [rawImage])
    .filter(Boolean)
    .map(img => getImageUrl(img));

  const price = toNumber(raw?.price, 0);
  const originalPrice = raw?.originalPrice !== undefined ? toNumber(raw.originalPrice, undefined) : undefined;
  const validOriginalPrice = originalPrice && originalPrice > price ? originalPrice : undefined;

  return {
    ...raw,
    id,
    _id: id,
    vendorId,
    vendor: vendorObj ? normalizeVendor(vendorObj) : null,
    vendorName: raw?.vendorName || vendorObj?.storeName || vendorObj?.name || "",
    brandId,
    brand: brandObj ? normalizeBrand(brandObj) : null,
    brandName: raw?.brandName || brandObj?.name || "",
    categoryId,
    categoryName: raw?.categoryName || categoryObj?.name || "",
    image,
    images,
    price,
    originalPrice: validOriginalPrice,
    rating: toNumber(raw?.rating, 0),
    reviewCount: toNumber(raw?.reviewCount, 0),
    isActive: raw?.isActive !== false,
    flashSale: !!raw?.flashSale,
    isNew: !!raw?.isNewArrival,
  };
};

const normalizeVendor = (raw) => {
  const id = normalizeId(raw?.id || raw?._id);
  return {
    ...raw,
    id,
    _id: id,
    storeLogo: getImageUrl(raw?.storeLogo || raw?.logo || raw?.image),
    isVerified: !!raw?.isVerified,
    rating: toNumber(raw?.rating, 0),
    reviewCount: toNumber(raw?.reviewCount, 0),
    status: raw?.status || "approved",
  };
};

const normalizeBrand = (raw) => {
  const id = normalizeId(raw?.id || raw?._id);
  return {
    ...raw,
    id,
    _id: id,
    name: raw?.name || "",
    logo: getImageUrl(raw?.logo || raw?.image || raw?.brandLogo),
  };
};

const normalizeTestimonial = (raw) => ({
  ...raw,
  id: normalizeId(raw?.id || raw?._id),
  _id: normalizeId(raw?.id || raw?._id),
  name: raw?.name || "",
  designation: raw?.designation || "",
  company: raw?.company || "",
  message: raw?.message || "",
  image: raw?.image || "",
  rating: toNumber(raw?.rating, 5),
  order: toNumber(raw?.order, 0),
  isActive: raw?.isActive !== false,
});

const deriveDailyDeals = (products = []) => {
  const flash = products.filter((p) => p.flashSale);
  const discounted = products.filter(
    (p) =>
      p.originalPrice !== undefined &&
      toNumber(p.originalPrice, 0) > toNumber(p.price, 0) &&
      !p.flashSale
  );
  const merged = [...flash, ...discounted];
  return merged.filter(
    (p, index, arr) =>
      index === arr.findIndex((x) => normalizeId(x.id) === normalizeId(p.id))
  );
};

const DEFAULT_HERO_SLIDES = [
  { image: heroSlide1 },
  { image: heroSlide2 },
  { image: heroSlide3 },
  { image: heroSlide4 },
];

const extractResponseData = (response) => {
  if (response && typeof response === "object") {
    if (Object.prototype.hasOwnProperty.call(response, "data")) {
      return response.data;
    }
    return response;
  }
  return null;
};

const asList = (value) => (Array.isArray(value) ? value : []);
const KNOWN_USER_ROUTE_PATTERNS = [
  "/",
  "/home",
  "/search",
  "/offers",
  "/daily-deals",
  "/flash-sale",
  "/new-arrivals",
  "/categories",
  "/category/:id",
  "/brand/:id",
  "/seller/:id",
  "/sellers",
  "/vendors",
  "/product/:id",
  "/sale/:slug",
  "/track-order/:orderId",
];

const getPathnameFromTarget = (target) =>
  String(target || "").trim().split("?")[0].split("#")[0];

const isKnownInternalRoute = (target) => {
  const pathname = getPathnameFromTarget(target);
  if (!pathname) return false;
  return KNOWN_USER_ROUTE_PATTERNS.some((pattern) =>
    !!matchPath({ path: pattern, end: true }, pathname)
  );
};

const resolveBannerLink = (banner) => {
  const candidate = String(
    banner?.linkUrl || banner?.link || banner?.url || ""
  ).trim();
  if (!candidate) return "";
  if (isExternalLink(candidate)) return candidate;
  if (isSafeInternalPath(candidate) && isKnownInternalRoute(candidate))
    return candidate;
  return "";
};

const isExternalLink = (target) => /^https?:\/\//i.test(String(target || "").trim());
const isSafeInternalPath = (target) => String(target || "").startsWith("/");

const MobileHome = () => {
  const navigate = useNavigate();
  const { translateObject } = useDynamicTranslation();
  const { getTranslatedText: t } = usePageTranslation([
    "PREMIUM",
    "Exclusive Collection",
    "Shop Now",
    "Most Popular",
    "See All",
    "Flash Sale",
    "Limited time offers",
    "Trending Now",
    "MARKETPLACE TRUST & ASSURANCE",
    "Why Shop With DwellMart?",
    "We partner with top-rated sellers to guarantee authentic products, transparent pricing, and instant support.",
    "Free Express Shipping",
    "On all orders over ₹499 nationwide",
    "7-Day Easy Returns",
    "Hassle-free 100% money back guarantee",
    "100% Secure Payments",
    "Encrypted checkout via UPI, Cards & NetBanking",
    "Verified Marketplace Sellers",
    "Quality-vetted vendors across India",
    "VERIFIED STORES",
    "CURATED PRODUCTS",
    "CATEGORIES",
    "SECURE PAYMENTS",
    "Refresh failed. Showing available data.",
    "Refreshed",
    "Special Offer",
    "Limited Time"
  ]);

  const [currentSlide, setCurrentSlide] = useState(0);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [autoSlidePaused, setAutoSlidePaused] = useState(false);
  const [isDraggingSlide, setIsDraggingSlide] = useState(false);
  const [slides, setSlides] = useState(DEFAULT_HERO_SLIDES);
  const [promoBanners, setPromoBanners] = useState([]);
  const [sideBanner, setSideBanner] = useState(null);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [homeVendors, setHomeVendors] = useState([]);
  const [homeBrands, setHomeBrands] = useState([]);
  const [homeTestimonials, setHomeTestimonials] = useState([]);

  const fallbackMostPopular = getMostPopular();
  const fallbackTrending = getTrending();
  const fallbackFlashSale = getFlashSale();
  const fallbackNewArrivals = getAllNewArrivals().slice(0, 6);
  const fallbackDailyDeals = getDailyDeals().slice(0, 5);
  const fallbackRecommended = getRecommendedProducts(6);
  const fallbackVendors = getApprovedVendors();
  const fallbackBrands = getCatalogBrands().slice(0, 10);

  const computedNewArrivals = useMemo(() => {
    if (catalogProducts.length === 0) return fallbackNewArrivals;
    return catalogProducts.filter((p) => p.isNew).slice(0, 6);
  }, [catalogProducts, fallbackNewArrivals]);

  const computedDailyDeals = useMemo(() => {
    if (catalogProducts.length === 0) return fallbackDailyDeals;
    return deriveDailyDeals(catalogProducts).slice(0, 5);
  }, [catalogProducts, fallbackDailyDeals]);

  const computedRecommended = useMemo(() => {
    if (catalogProducts.length === 0) return fallbackRecommended;
    return [...catalogProducts]
      .sort((a, b) => toNumber(b.rating, 0) - toNumber(a.rating, 0))
      .slice(0, 6);
  }, [catalogProducts, fallbackRecommended]);

  const computedMostPopular = useMemo(() => {
    if (catalogProducts.length === 0) return fallbackMostPopular.slice(0, 6);
    return [...catalogProducts]
      .sort((a, b) => {
        const reviewsDiff = toNumber(b.reviewCount, 0) - toNumber(a.reviewCount, 0);
        if (reviewsDiff !== 0) return reviewsDiff;
        return toNumber(b.rating, 0) - toNumber(a.rating, 0);
      })
      .slice(0, 6);
  }, [catalogProducts, fallbackMostPopular]);

  const computedTrending = useMemo(() => {
    if (catalogProducts.length === 0) return fallbackTrending.slice(0, 6);
    return [...catalogProducts]
      .sort((a, b) => {
        const ratingDiff = toNumber(b.rating, 0) - toNumber(a.rating, 0);
        if (ratingDiff !== 0) return ratingDiff;
        return toNumber(b.reviewCount, 0) - toNumber(a.reviewCount, 0);
      })
      .slice(0, 6);
  }, [catalogProducts, fallbackTrending]);

  const computedFlashSale = useMemo(() => {
    if (catalogProducts.length === 0) return fallbackFlashSale.slice(0, 6);
    return catalogProducts.filter((product) => product.flashSale).slice(0, 6);
  }, [catalogProducts, fallbackFlashSale]);

  const computedVendors = useMemo(() => {
    if (homeVendors.length === 0) return fallbackVendors;
    return [...homeVendors]
      .filter((vendor) => vendor.status === "approved")
      .sort((a, b) => toNumber(b.rating, 0) - toNumber(a.rating, 0))
      .slice(0, 10);
  }, [homeVendors, fallbackVendors]);

  const computedBrands = useMemo(() => {
    if (homeBrands.length === 0) return fallbackBrands;
    return homeBrands.slice(0, 10);
  }, [homeBrands, fallbackBrands]);

  const fetchHomeData = useCallback(async () => {
    try {
      const [productsRes, vendorsRes, brandsRes, bannersRes, testimonialsRes] =
        await Promise.allSettled([
          api.get("/products", { params: { page: 1, limit: 120 } }),
          api.get("/vendors/best-sellers", {
            params: { limit: 8 },
          }),
          api.get("/brands/all"),
          api.get("/banners"),
          api.get("/testimonials"),
        ]);

      if (productsRes.status === "fulfilled") {
        const payload = extractResponseData(productsRes.value);
        const productsSource = asList(payload?.products);
        const normalizedProducts = productsSource
          .map(normalizeProduct)
          .filter((product) => product.id && product.isActive !== false);
        
        // Dynamic Translation for Products
        const translatedProducts = await Promise.all(
          normalizedProducts.map(p => translateObject(p, ['name', 'description']))
        );
        setCatalogProducts(translatedProducts);
      }

      if (vendorsRes.status === "fulfilled") {
        const payload = extractResponseData(vendorsRes.value);
        const vendorsSource = asList(payload?.vendors);
        const normalizedVendors = vendorsSource
          .map(normalizeVendor)
          .filter((vendor) => vendor.id);
        
        // Dynamic Translation for Vendors
        const translatedVendors = await Promise.all(
          normalizedVendors.map(v => translateObject(v, ['storeName', 'description']))
        );
        setHomeVendors(translatedVendors);
      }

      if (brandsRes.status === "fulfilled") {
        const payload = extractResponseData(brandsRes.value);
        const brandsSource = asList(payload);
        const normalizedBrands = brandsSource
          .map(normalizeBrand)
          .filter((brand) => brand.id);
        
        // Dynamic Translation for Brands
        const translatedBrands = await Promise.all(
          normalizedBrands.map(b => translateObject(b, ['name']))
        );
        setHomeBrands(translatedBrands);
      }

      if (bannersRes.status === "fulfilled") {
        const payload = extractResponseData(bannersRes.value);
        const allBanners = asList(payload).filter(
          (banner) => banner?.image && banner?.isActive !== false
        );

        // Dynamic Translation for Banners
        const translatedBanners = await Promise.all(
          allBanners.map(b => translateObject(b, ['title', 'subtitle', 'description']))
        );

        const bannerSlides = translatedBanners
          .filter((banner) =>
            ["home_slider", "hero"].includes(String(banner?.type || ""))
          )
          .sort((a, b) => toNumber(a.order, 0) - toNumber(b.order, 0))
          .map((banner, index) => ({
            id: normalizeId(banner._id || banner.id || `home-slide-${index}`),
            image: banner.image,
            link: resolveBannerLink(banner),
            title: banner.title || "",
          }));
        setSlides(bannerSlides.length > 0 ? bannerSlides : DEFAULT_HERO_SLIDES);

        const banners = translatedBanners
          .filter((banner) => String(banner?.type || "") === "promotional")
          .sort((a, b) => toNumber(a.order, 0) - toNumber(b.order, 0))
          .map((banner, index) => ({
            id: normalizeId(banner._id || banner.id || `promo-banner-${index}`),
            title: banner.title || "Special Offer",
            subtitle: banner.subtitle || "Limited Time",
            description: banner.description || "",
            discount: banner.description || "Shop Now",
            link: resolveBannerLink(banner),
            image: banner.image,
            type: banner.type || "promotional",
          }));
        setPromoBanners(banners);

        const mapped = translatedBanners
          .filter((banner) => String(banner?.type || "") === "side_banner")
          .sort((a, b) => toNumber(a.order, 0) - toNumber(b.order, 0))
          .map((banner, index) => ({
            id: normalizeId(banner._id || banner.id || `side-banner-${index}`),
            image: banner.image,
            title: banner.title || "PREMIUM",
            subtitle: banner.subtitle || "Exclusive Collection",
            link: resolveBannerLink(banner),
          }));
        setSideBanner(mapped[0] || null);
      } else {
        setSlides(DEFAULT_HERO_SLIDES);
        setPromoBanners([]);
        setSideBanner(null);
      }

      if (testimonialsRes.status === "fulfilled") {
        const payload = extractResponseData(testimonialsRes.value);
        const testimonialsSource = asList(payload);
        const normalizedTestimonials = testimonialsSource
          .map(normalizeTestimonial)
          .filter((testimonial) => testimonial.id && testimonial.isActive)
          .sort((a, b) => toNumber(a.order, 0) - toNumber(b.order, 0));
        
        // Dynamic Translation for Testimonials
        const translatedTestimonials = await Promise.all(
          normalizedTestimonials.map(t => translateObject(t, ['name', 'designation', 'company', 'message']))
        );
        setHomeTestimonials(translatedTestimonials);
      } else {
        setHomeTestimonials([]);
      }
      return true;
    } catch {
      return false;
    }
  }, [translateObject]);

  useEffect(() => {
    fetchHomeData();
  }, [fetchHomeData]);

  // Auto-slide functionality (pauses when user is dragging)
  useEffect(() => {
    if (autoSlidePaused) return;

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [slides.length, autoSlidePaused]);

  // Minimum swipe distance (in pixels) to trigger slide change
  const minSwipeDistance = 50;

  const onTouchStart = (e) => {
    e.stopPropagation(); // Prevent pull-to-refresh from interfering
    setTouchEnd(null);
    setIsDraggingSlide(false);
    const touch = e.targetTouches[0];
    setTouchStart(touch.clientX);
    setDragOffset(0);
    setAutoSlidePaused(true);
  };

  const onTouchMove = (e) => {
    if (touchStart === null) return;
    e.stopPropagation(); // Prevent pull-to-refresh from interfering
    const touch = e.targetTouches[0];
    const currentX = touch.clientX;
    // Calculate difference: positive when swiping left, negative when swiping right
    const diff = touchStart - currentX;
    if (Math.abs(diff) > 8) {
      setIsDraggingSlide(true);
    }
    // Constrain the drag offset to prevent over-dragging
    // Use container width for better responsiveness
    const containerWidth = e.currentTarget?.offsetWidth || 400;
    const maxDrag = containerWidth * 0.5; // Maximum drag distance (50% of container)
    // dragOffset: positive = swiping left (show next), negative = swiping right (show previous)
    setDragOffset(Math.max(-maxDrag, Math.min(maxDrag, diff)));
    setTouchEnd(currentX);
  };

  const onTouchEnd = (e) => {
    if (e) e.stopPropagation(); // Prevent pull-to-refresh from interfering

    if (touchStart === null) {
      setAutoSlidePaused(false);
      return;
    }

    // Calculate swipe distance: positive = left swipe, negative = right swipe
    const distance = touchStart - (touchEnd || touchStart);
    const isLeftSwipe = distance > minSwipeDistance; // Finger moved left = show next slide
    const isRightSwipe = distance < -minSwipeDistance; // Finger moved right = show previous slide

    if (isLeftSwipe) {
      // Swipe left (finger moved left) - go to next slide (slide moves left)
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    } else if (isRightSwipe) {
      // Swipe right (finger moved right) - go to previous slide (slide moves right)
      setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
    }

    // Reset touch state
    setTouchStart(null);
    setTouchEnd(null);
    setDragOffset(0);

    // Resume auto-slide after a short delay
    setTimeout(() => {
      setAutoSlidePaused(false);
    }, 2000);
    setTimeout(() => {
      setIsDraggingSlide(false);
    }, 150);
  };

  const handleSlideClick = (slide) => {
    if (isDraggingSlide) return;
    const target = String(slide?.link || "").trim();
    if (!target) return;

    if (isExternalLink(target)) {
      window.open(target, "_blank", "noopener,noreferrer");
      return;
    }
    if (isSafeInternalPath(target)) {
      navigate(target);
    }
  };

  const handleBannerNavigation = (target) => {
    const normalizedTarget = String(target || "").trim();
    if (!normalizedTarget) return;
    if (isExternalLink(normalizedTarget)) {
      window.open(normalizedTarget, "_blank", "noopener,noreferrer");
      return;
    }
    if (isSafeInternalPath(normalizedTarget) && isKnownInternalRoute(normalizedTarget)) {
      navigate(normalizedTarget);
    }
  };

  // Pull to refresh handler
  const handleRefresh = async () => {
    const ok = await fetchHomeData();
    if (!ok) {
      toast.error(t("Refresh failed. Showing available data."));
      return;
    }
    toast.success(t("Refreshed"));
  };

  const {
    pullDistance,
    isPulling,
    elementRef,
  } = usePullToRefresh(handleRefresh);

  return (
    <PageTransition>
      <MobileLayout>
        <div
          ref={elementRef}
          className="w-full"
          style={{
            transform: `translateY(${Math.min(pullDistance, 80)}px)`,
            transition: isPulling ? "none" : "transform 0.3s ease-out",
          }}>
          {/* Hero Banner */}
          <div className="px-4 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div
                className="relative w-full h-48 md:h-80 lg:h-[400px] xl:h-[450px] rounded-xl md:rounded-2xl overflow-hidden lg:col-span-2"
                data-carousel
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                style={{ touchAction: "pan-y", userSelect: "none" }}>
                {/* Slider Container - All slides in a row */}
                <motion.div
                  className="flex h-full"
                  style={{
                    width: `${slides.length * 100}%`,
                    height: "100%",
                  }}
                  animate={{
                    x:
                      dragOffset !== 0
                        ? `calc(-${currentSlide * (100 / slides.length)
                        }% - ${dragOffset}px)`
                        : `-${currentSlide * (100 / slides.length)}%`,
                  }}
                  transition={{
                    duration: dragOffset !== 0 ? 0 : 0.6,
                    ease: [0.25, 0.46, 0.45, 0.94], // Smooth easing
                    type: "tween",
                  }}>
                  {slides.map((slide, index) => (
                    <div
                      key={index}
                      className="flex-shrink-0"
                      onClick={() => handleSlideClick(slide)}
                      style={{
                        width: `${100 / slides.length}%`,
                        height: "100%",
                        cursor: slide?.link ? "pointer" : "default",
                      }}>
                      <LazyImage
                        src={slide.image}
                        alt={`Slide ${index + 1}`}
                        className="w-full h-full object-cover pointer-events-none select-none"
                        draggable={false}
                        onError={(e) => {
                          e.target.src = `https://via.placeholder.com/400x200?text=Slide+${index + 1
                            }`;
                        }}
                      />
                    </div>
                  ))}
                </motion.div>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-10 pointer-events-none">
                  {slides.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setCurrentSlide(index);
                        setAutoSlidePaused(true);
                        setTimeout(() => setAutoSlidePaused(false), 2000);
                      }}
                      className={`h-1.5 rounded-full transition-all pointer-events-auto ${index === currentSlide
                        ? "bg-white w-6"
                        : "bg-white/50 w-1.5"
                        }`}
                    />
                  ))}
                </div>
              </div>

              {/* Side Banner for Large Screens */}
              <div className="hidden lg:block lg:col-span-1 h-[400px] xl:h-[450px] rounded-2xl overflow-hidden relative bg-gray-900 group">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/90 z-10" />
                <LazyImage
                  src={sideBanner?.image || stylishWatchImg}
                  alt={sideBanner?.title || "Premium Watch"}
                  className="w-full h-full object-contain p-8 group-hover:scale-110 transition-transform duration-700"
                  onError={(e) => {
                    e.target.src = "https://via.placeholder.com/400x400?text=Premium+Watch";
                  }}
                />
                <div className="absolute inset-x-0 bottom-0 p-8 z-20 flex flex-col items-center text-center">
                  <span className="text-yellow-400 font-bold text-3xl mb-2 tracking-wider drop-shadow-lg">
                    {t(sideBanner?.title || "PREMIUM")}
                  </span>
                  <p className="text-gray-300 text-sm mb-6 font-medium">
                    {t(sideBanner?.subtitle || "Exclusive Collection")}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleBannerNavigation(sideBanner?.link || "/offers")}
                    className="bg-white text-gray-900 font-bold py-3.5 px-10 rounded-xl w-full hover:bg-gray-100 transition-all transform hover:-translate-y-1 shadow-lg hover:shadow-xl uppercase tracking-widest text-sm"
                  >
                    {t("Shop Now")}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Experience Selection Section — Quick Commerce & Marketplace Experience Selector */}
          <ExperienceSwitcher />

          {/* Brand Logos Scroll */}
          <BrandLogosScroll brands={computedBrands} />

          {/* Featured Vendors Section (Best Sellers) */}
          <FeaturedVendorsSection vendors={computedVendors} />

          {/* Shop With Confidence Section */}
          <ConfidenceSection />

          {/* Animated Banner */}
          <AnimatedBanner banners={promoBanners} />

          {/* New Arrivals */}
          <NewArrivalsSection products={computedNewArrivals} />



          {/* Most Popular */}
          <div className="px-4 py-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-content">{t("Most Popular")}</h2>
              <Link
                to="/search"
                className="text-sm text-brand-primary font-semibold hover:underline">
                {t("See All")}
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
              {computedMostPopular.map((product, index) => (
                <motion.div
                  key={product.id}
                  className={index === 5 ? "xl:hidden" : ""}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}>
                  <ProductCard product={product} />
                </motion.div>
              ))}
            </div>
          </div>

          {/* Daily Deals */}
          <DailyDealsSection products={computedDailyDeals} />



          {/* Flash Sale */}
          {computedFlashSale.length > 0 && (
            <div className="px-4 py-4 bg-surface-muted border-y border-border">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-content">
                    {t("Flash Sale")}
                  </h2>
                  <p className="text-xs text-content-secondary">{t("Limited time offers")}</p>
                </div>
                <Link
                  to="/flash-sale"
                  className="text-sm text-brand-primary font-semibold hover:underline">
                  {t("See All")}
                </Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                {computedFlashSale.map((product, index) => (
                  <motion.div
                    key={product.id}
                    className={index === 5 ? "xl:hidden" : ""}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}>
                    <ProductCard product={product} isFlashSale={true} />
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Trending Items */}
          <div className="px-4 py-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-content">{t("Trending Now")}</h2>
              <Link
                to="/search"
                className="text-sm text-brand-primary font-semibold hover:underline">
                {t("See All")}
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
              {computedTrending.map((product, index) => (
                <motion.div
                  key={product.id}
                  className={index === 5 ? "hidden xl:block 2xl:hidden" : ""}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}>
                  <ProductCard product={product} />
                </motion.div>
              ))}
            </div>
          </div>

          {/* Recommended for You */}
          <RecommendedSection products={computedRecommended} />

          {/* Marketplace Trust & Assurance Section */}
          <section className="py-8 sm:py-12 px-4 sm:px-6">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="max-w-6xl mx-auto bg-surface rounded-3xl sm:rounded-[36px] border border-border p-6 sm:p-10 md:p-12 shadow-xl text-center"
            >
              {/* Top Pill Badge */}
              <div className="inline-block px-4 py-1.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/30 text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase mb-4">
                {t("MARKETPLACE TRUST & ASSURANCE")}
              </div>

              {/* Title */}
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-content tracking-tight mb-3">
                {t("Why Shop With DwellMart?")}
              </h2>

              {/* Subtitle */}
              <p className="text-content-secondary text-sm sm:text-base font-medium max-w-2xl mx-auto leading-relaxed mb-8 sm:mb-10">
                {t("We partner with top-rated sellers to guarantee authentic products, transparent pricing, and instant support.")}
              </p>

              {/* Feature Cards Grid (4 Columns) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 sm:mb-8 text-left">
                {/* Feature 1 */}
                <div className="bg-surface-muted border border-border rounded-2xl p-5 flex items-start gap-4 hover:shadow-md transition-all duration-300">
                  <div className="h-12 w-12 rounded-2xl bg-status-info/10 text-status-info flex items-center justify-center shrink-0">
                    <FiTruck className="text-2xl" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-content leading-tight mb-1">
                      {t("Free Express Shipping")}
                    </h3>
                    <p className="text-xs text-content-secondary font-medium leading-relaxed">
                      {t("On all orders over ₹499 nationwide")}
                    </p>
                  </div>
                </div>

                {/* Feature 2 */}
                <div className="bg-surface-muted border border-border rounded-2xl p-5 flex items-start gap-4 hover:shadow-md transition-all duration-300">
                  <div className="h-12 w-12 rounded-2xl bg-status-success/10 text-status-success flex items-center justify-center shrink-0">
                    <FiRotateCcw className="text-2xl" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-content leading-tight mb-1">
                      {t("7-Day Easy Returns")}
                    </h3>
                    <p className="text-xs text-content-secondary font-medium leading-relaxed">
                      {t("Hassle-free 100% money back guarantee")}
                    </p>
                  </div>
                </div>

                {/* Feature 3 */}
                <div className="bg-surface-muted border border-border rounded-2xl p-5 flex items-start gap-4 hover:shadow-md transition-all duration-300">
                  <div className="h-12 w-12 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
                    <FiShield className="text-2xl" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-content leading-tight mb-1">
                      {t("100% Secure Payments")}
                    </h3>
                    <p className="text-xs text-content-secondary font-medium leading-relaxed">
                      {t("Encrypted checkout via UPI, Cards & NetBanking")}
                    </p>
                  </div>
                </div>

                {/* Feature 4 */}
                <div className="bg-surface-muted border border-border rounded-2xl p-5 flex items-start gap-4 hover:shadow-md transition-all duration-300">
                  <div className="h-12 w-12 rounded-2xl bg-status-warning/10 text-status-warning flex items-center justify-center shrink-0">
                    <FiCheckCircle className="text-2xl" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-content leading-tight mb-1">
                      {t("Verified Marketplace Sellers")}
                    </h3>
                    <p className="text-xs text-content-secondary font-medium leading-relaxed">
                      {t("Quality-vetted vendors across India")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Dark Stat Cards Grid (4 Columns) */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Stat 1 */}
                <div className="bg-surface-header rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center shadow-lg transition-transform hover:-translate-y-1 border border-border">
                  <FiUsers className="text-brand-primary text-2xl sm:text-3xl mb-3" />
                  <span className="text-3xl sm:text-4xl font-black text-brand-primary tracking-tight mb-1">
                    {computedVendors.length ? `${computedVendors.length}+` : "10+"}
                  </span>
                  <span className="text-[11px] sm:text-xs font-bold text-content-secondary tracking-wider uppercase">
                    {t("VERIFIED STORES")}
                  </span>
                </div>

                {/* Stat 2 */}
                <div className="bg-surface-header rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center shadow-lg transition-transform hover:-translate-y-1 border border-border">
                  <FiBox className="text-brand-primary text-2xl sm:text-3xl mb-3" />
                  <span className="text-3xl sm:text-4xl font-black text-brand-primary tracking-tight mb-1">
                    {catalogProducts.length ? `${catalogProducts.length}+` : "97+"}
                  </span>
                  <span className="text-[11px] sm:text-xs font-bold text-content-secondary tracking-wider uppercase">
                    {t("CURATED PRODUCTS")}
                  </span>
                </div>

                {/* Stat 3 */}
                <div className="bg-surface-header rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center shadow-lg transition-transform hover:-translate-y-1 border border-border">
                  <FiGrid className="text-brand-primary text-2xl sm:text-3xl mb-3" />
                  <span className="text-3xl sm:text-4xl font-black text-brand-primary tracking-tight mb-1">
                    10+
                  </span>
                  <span className="text-[11px] sm:text-xs font-bold text-content-secondary tracking-wider uppercase">
                    {t("CATEGORIES")}
                  </span>
                </div>

                {/* Stat 4 */}
                <div className="bg-surface-header rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center shadow-lg transition-transform hover:-translate-y-1 border border-border">
                  <FiLock className="text-brand-primary text-2xl sm:text-3xl mb-3" />
                  <span className="text-3xl sm:text-4xl font-black text-brand-primary tracking-tight mb-1">
                    100%
                  </span>
                  <span className="text-[11px] sm:text-xs font-bold text-content-secondary tracking-wider uppercase">
                    {t("SECURE PAYMENTS")}
                  </span>
                </div>
              </div>
            </motion.div>
          </section>

          <TestimonialsSection testimonials={homeTestimonials} />

          {/* Bottom Spacing */}
          <div className="h-4" />
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileHome;
