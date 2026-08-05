import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiZap, FiSearch, FiShoppingCart, FiHeart, FiX, FiChevronRight, FiClock } from "react-icons/fi";
import { motion } from "framer-motion";
import MobileLayout from "../components/Layout/MobileLayout";
import PageTransition from "../../../shared/components/PageTransition";
import LocationPrompt from "../components/QuickCommerce/LocationPrompt";
import LazyImage from "../../../shared/components/LazyImage";
import { useExperienceStore } from "../../../shared/store/experienceStore";
import { useAddressStore } from "../../../shared/store/addressStore";
import { useAuthStore } from "../../../shared/store/authStore";
import { useCartStore } from "../../../shared/store/useStore";
import { getLocationQueryParams } from "../../../shared/utils/experience";
import { getNearbyQuickCommerceVendors } from "../../../shared/services/quickCommerceService";
import { getPublicCategories } from "../../Admin/services/adminService";
import { getPlaceholderImage } from "../../../shared/utils/helpers";
import CategoryImage from "../../../shared/components/CategoryImage";
import QuickCommerceHeroBanner from "../components/QuickCommerce/QuickCommerceHeroBanner";
import ExpressProductCard from "../components/QuickCommerce/ExpressProductCard";
import { Button, Badge, Card, Input } from "../../../shared/components/ui";
import api from "../../../shared/utils/api";

const SEARCH_PLACEHOLDERS = [
  'Search "Milk"',
  'Search "Rice"',
  'Search "Bread"',
  'Search "Paneer"',
  'Search "Chocolate"',
  'Search "Atta"',
  'Search "Butter"',
];

/** Fetches 8 QC products with a given sort key */
const fetchExpressProducts = async (sort, extra = {}) => {
  try {
    const response = await api.get("/products", {
      params: {
        experience: "quick_commerce",
        page: 1,
        limit: 5,
        sort,
        ...extra,
      },
    });
    const payload = response?.data ?? response;
    return Array.isArray(payload?.products) ? payload.products : [];
  } catch {
    return [];
  }
};

/** Horizontal product shelf with title and See All link using Design Tokens */
const ProductShelf = ({ title, products, isLoading, onSeeAll }) => {
  if (!isLoading && products.length === 0) return null;

  return (
    <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 mb-2">
      {/* Shelf Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm sm:text-base font-black text-textColor-primary tracking-tight">{title}</h2>
        {onSeeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            className="text-xs font-bold text-textColor-brand hover:underline flex items-center gap-1 cursor-pointer"
          >
            See All <FiChevronRight className="text-xs" />
          </button>
        )}
      </div>

      {/* Shelf Product Row */}
      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-44 h-60 rounded-card bg-surface-card animate-pulse border border-borderToken-default shrink-0" />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {products.slice(0, 5).map((product) => (
            <div
              key={product._id || product.id}
              className="w-52 sm:w-auto shrink-0 sm:shrink"
            >
              <ExpressProductCard product={product} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

/**
 * QuickCommerceHome — Refactored to Design System Specifications
 */
const QuickCommerceHome = () => {
  const navigate = useNavigate();
  const { location, serviceability, checkServiceability } = useExperienceStore();
  const { isAuthenticated } = useAuthStore();
  const { fetchAddresses } = useAddressStore();
  const itemCount = useCartStore((state) => state.getItemCount());

  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [searchIndex, setSearchIndex] = useState(0);
  const [globalSearchText, setGlobalSearchText] = useState("");
  const [isLoadingCats, setIsLoadingCats] = useState(true);

  // Product shelf states
  const [featured, setFeatured] = useState([]);
  const [bestSellers, setBestSellers] = useState([]);
  const [trending, setTrending] = useState([]);
  const [recentlyAdded, setRecentlyAdded] = useState([]);
  const [isLoadingFeatured, setIsLoadingFeatured] = useState(true);
  const [isLoadingBest, setIsLoadingBest] = useState(true);
  const [isLoadingTrending, setIsLoadingTrending] = useState(true);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);

  const locationParams = getLocationQueryParams(location);
  const hasLocation = Object.keys(locationParams).length > 0;
  const isServiceable = serviceability?.serviceable === true;

  // Rotating search placeholder — pauses while user types
  useEffect(() => {
    if (globalSearchText.trim()) return;
    const t = setInterval(() => setSearchIndex((p) => (p + 1) % SEARCH_PLACEHOLDERS.length), 2800);
    return () => clearInterval(t);
  }, [globalSearchText]);

  useEffect(() => { if (isAuthenticated) fetchAddresses?.(); }, [isAuthenticated, fetchAddresses]);
  useEffect(() => { checkServiceability(location); }, [hasLocation, location]);

  // Load categories
  useEffect(() => {
    let cancelled = false;
    setIsLoadingCats(true);
    getPublicCategories("quick_commerce")
      .then((res) => { if (!cancelled) setCategories(res.data || []); })
      .catch(() => { if (!cancelled) setCategories([]); })
      .finally(() => { if (!cancelled) setIsLoadingCats(false); });
    return () => { cancelled = true; };
  }, []);

  // Load nearby vendors (non-blocking)
  useEffect(() => {
    if (!hasLocation) return;
    getNearbyQuickCommerceVendors({ ...locationParams, limit: 6 })
      .then((res) => {
        const data = res?.data ?? res;
        setVendors(Array.isArray(data?.vendors) ? data.vendors : []);
      })
      .catch(() => setVendors([]));
  }, [hasLocation]);

  // Fetch all product shelves in parallel
  useEffect(() => {
    setIsLoadingFeatured(true);
    setIsLoadingBest(true);
    setIsLoadingTrending(true);
    setIsLoadingRecent(true);

    fetchExpressProducts("newest", { isFeatured: "true" })
      .then((p) => setFeatured(p)).finally(() => setIsLoadingFeatured(false));

    fetchExpressProducts("popular")
      .then((p) => setBestSellers(p)).finally(() => setIsLoadingBest(false));

    fetchExpressProducts("rating")
      .then((p) => setTrending(p)).finally(() => setIsLoadingTrending(false));

    fetchExpressProducts("newest")
      .then((p) => setRecentlyAdded(p)).finally(() => setIsLoadingRecent(false));
  }, []);

  const handleGlobalSearchSubmit = (e) => {
    e.preventDefault();
    if (globalSearchText.trim()) {
      navigate(`/search?q=${encodeURIComponent(globalSearchText.trim())}&experience=quick_commerce`);
    }
  };

  const handleCategoryClick = (category) => {
    const catId = category._id || category.id;
    navigate(`/quick/categories?category=${catId}`);
  };

  return (
    <PageTransition>
      <MobileLayout showBottomNav showCartBar>
        <div className="w-full pb-24 lg:pb-12 min-h-screen bg-surface-background text-textColor-primary">

          {/* ── Sticky Header ── */}
          <header className="p-3 sm:p-4 bg-surface-card border-b border-borderToken-default sticky top-0 z-30 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-2.5 max-w-7xl mx-auto">
              {/* Location / Delivery Badge */}
              <button
                type="button"
                onClick={() => setShowLocationPrompt(true)}
                className="flex items-center gap-2 text-left hover:opacity-90 transition-opacity min-w-0 flex-1 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-brand-primary/15 border border-brand-primary/40 flex items-center justify-center shrink-0">
                  <FiZap className="text-amber-500 text-lg fill-amber-500" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black tracking-tight text-textColor-primary">Delivery in 10–15 mins</span>
                    <FiChevronRight className="text-textColor-muted text-xs shrink-0" />
                  </div>
                  <p className="text-[11px] font-semibold text-textColor-secondary truncate max-w-[200px] sm:max-w-md">
                    {location?.label || "Set your delivery location..."}
                  </p>
                </div>
              </button>

              {/* Wishlist + Cart */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => navigate("/wishlist")}
                  className="p-2.5 rounded-xl bg-surface-background hover:bg-borderToken-light transition-colors border border-borderToken-default text-textColor-secondary cursor-pointer"
                  aria-label="Wishlist"
                >
                  <FiHeart className="text-base" />
                </button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => navigate("/cart")}
                  leftIcon={<FiShoppingCart className="text-sm" />}
                  className="!py-2 !px-3 font-extrabold text-xs"
                >
                  <span className="hidden sm:inline">My Cart</span>
                  {itemCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-black text-brand-primary text-[10px] font-black">
                      {itemCount}
                    </span>
                  )}
                </Button>
              </div>
            </div>

            {/* Rotating Search Bar using Shared Input */}
            <form onSubmit={handleGlobalSearchSubmit} className="relative max-w-7xl mx-auto">
              <Input
                leftIcon={<FiSearch className="text-textColor-muted text-sm" />}
                value={globalSearchText}
                onChange={(e) => setGlobalSearchText(e.target.value)}
                placeholder={SEARCH_PLACEHOLDERS[searchIndex]}
                rightIcon={
                  globalSearchText ? (
                    <button
                      type="button"
                      onClick={() => setGlobalSearchText("")}
                      className="text-textColor-muted hover:text-textColor-primary p-1 cursor-pointer"
                    >
                      <FiX className="text-xs" />
                    </button>
                  ) : null
                }
              />
            </form>
          </header>

          {/* ── Location Prompt ── */}
          {showLocationPrompt && (
            <div className="p-4">
              <LocationPrompt
                onClose={() => setShowLocationPrompt(false)}
                showClose={hasLocation}
              />
            </div>
          )}

          {/* ── Non-Serviceable Alert ── */}
          {hasLocation && serviceability && !isServiceable && (
            <div className="p-4 pb-0 max-w-7xl mx-auto">
              <Card variant="default" className="!bg-amber-500/10 !border-amber-500/30 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <FiZap className="text-2xl text-amber-500 shrink-0 fill-amber-500" />
                  <div>
                    <h3 className="text-sm font-extrabold text-textColor-primary">⚡ Dwell Mart Express isn&apos;t here yet</h3>
                    <p className="text-xs text-textColor-secondary">
                      No stores currently deliver to {location?.label || "this location"}.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => navigate("/home")}
                  className="shrink-0 self-end sm:self-center"
                >
                  Go to Marketplace
                </Button>
              </Card>
            </div>
          )}

          {/* ── Hero Banner ── */}
          <QuickCommerceHeroBanner
            categories={categories}
            onSelectCategory={(slug) => navigate(`/quick/categories?category=${slug}`)}
          />

          {/* ── Browse Categories Strip ── */}
          <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black text-textColor-primary tracking-tight flex items-center gap-1.5">
                <FiZap className="text-amber-500 fill-amber-500 text-sm" />
                Browse Categories
              </h2>
              <button
                type="button"
                onClick={() => navigate("/quick/categories")}
                className="text-xs font-bold text-textColor-brand hover:underline flex items-center gap-1 cursor-pointer"
              >
                See All <FiChevronRight className="text-xs" />
              </button>
            </div>

            {/* Horizontal Category Chip Row */}
            {isLoadingCats ? (
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="w-20 h-24 rounded-card bg-surface-card animate-pulse border border-borderToken-default shrink-0" />
                ))}
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 sm:grid sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10">
                {categories.slice(0, 10).map((category) => {
                  const catId = category._id || category.id;
                  return (
                    <motion.button
                      key={catId}
                      whileHover={{ scale: 1.04, y: -2 }}
                      whileTap={{ scale: 0.96 }}
                      type="button"
                      onClick={() => handleCategoryClick(category)}
                      className="flex flex-col items-center gap-2 p-2.5 rounded-card bg-surface-card border border-borderToken-default hover:border-brand-primary/50 hover:shadow-card transition-all cursor-pointer shrink-0 w-20 sm:w-auto group"
                    >
                      <CategoryImage
                        src={category.image || category.icon}
                        alt={category.name}
                        name={category.name}
                        containerClassName="w-12 h-12 rounded-xl overflow-hidden bg-surface-background border border-borderToken-default group-hover:scale-105 transition-transform"
                      />
                      <span className="text-[10px] font-bold text-textColor-primary text-center leading-tight line-clamp-2 group-hover:text-textColor-brand transition-colors">
                        {category.name}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Divider ── */}
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 mb-2">
            <div className="h-px bg-borderToken-default" />
          </div>

          {/* ── Curated Product Shelves ── */}
          <div className="space-y-6 py-2">
            <ProductShelf
              title="⭐ Featured Products"
              products={featured}
              isLoading={isLoadingFeatured}
              onSeeAll={() => navigate("/quick/categories")}
            />
            <ProductShelf
              title="🔥 Best Sellers"
              products={bestSellers}
              isLoading={isLoadingBest}
              onSeeAll={() => navigate("/quick/categories")}
            />
            <ProductShelf
              title="📈 Trending Now"
              products={trending}
              isLoading={isLoadingTrending}
              onSeeAll={() => navigate("/quick/categories")}
            />
            <ProductShelf
              title="🆕 Recently Added"
              products={recentlyAdded}
              isLoading={isLoadingRecent}
              onSeeAll={() => navigate("/quick/categories")}
            />
          </div>

          {/* ── View All Categories CTA ── */}
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 mt-6 mb-4 text-center">
            <Button
              size="lg"
              variant="primary"
              onClick={() => navigate("/quick/categories")}
              rightIcon={<FiChevronRight />}
              className="w-full sm:w-auto mx-auto font-black text-sm"
            >
              View All Express Categories
            </Button>
          </div>

          {/* ── Nearby Stores ── */}
          {vendors.length > 0 && (
            <div className="p-4 sm:p-6 pt-2 max-w-7xl mx-auto">
              <h3 className="text-xs font-black text-textColor-muted mb-3 uppercase tracking-wider">
                Stores near you
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {vendors.map((vendor) => (
                  <button
                    key={vendor.id || vendor._id}
                    type="button"
                    onClick={() => navigate(`/seller/${vendor.id || vendor._id}`)}
                    className="w-full bg-surface-card rounded-card border border-borderToken-default p-3 flex items-center gap-3 text-left hover:border-brand-primary/50 hover:shadow-card transition-all cursor-pointer"
                  >
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-surface-background flex-shrink-0">
                      <LazyImage
                        src={vendor.storeLogo || getPlaceholderImage(48, 48, vendor.storeName?.charAt(0) || "S")}
                        alt={vendor.storeName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-textColor-primary truncate">{vendor.storeName}</p>
                      <div className="flex items-center gap-2 text-[11px] text-textColor-secondary">
                        {Number.isFinite(vendor.distanceKm) && <span>{vendor.distanceKm} km away</span>}
                        {Number.isFinite(vendor.preparationTimeMins) && (
                          <span className="flex items-center gap-1">
                            <FiClock className="text-[10px]" />
                            {vendor.preparationTimeMins} min prep
                          </span>
                        )}
                      </div>
                    </div>
                    {!vendor.availability?.isOrderable && (
                      <Badge variant="error" size="sm">
                        Closed
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default QuickCommerceHome;
