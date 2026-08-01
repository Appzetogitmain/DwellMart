import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FiClock, FiZap, FiSearch, FiShoppingCart, FiHeart, FiX, FiChevronRight } from "react-icons/fi";
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

/** Horizontal product shelf with title and See All link */
const ProductShelf = ({ title, products, isLoading, onSeeAll, accentColor = "emerald" }) => {
  if (!isLoading && products.length === 0) return null;

  return (
    <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 mb-2">
      {/* Shelf Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm sm:text-base font-black text-content tracking-tight">{title}</h2>
        {onSeeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            className={`text-xs font-extrabold text-${accentColor}-600 dark:text-${accentColor}-400 hover:underline flex items-center gap-1`}
          >
            See All <FiChevronRight className="text-xs" />
          </button>
        )}
      </div>

      {/* Shelf Product Row */}
      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-40 h-60 rounded-2xl bg-surface animate-pulse border border-border/40 shrink-0" />
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
 * QuickCommerceHome — Simplified Discovery Layout
 * Header → Hero → Service Cards → Browse Categories Strip → Curated Product Shelves
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
        <div className="w-full pb-24 lg:pb-12 min-h-screen bg-surface-muted">

          {/* ── Sticky Header ── */}
          <header className="p-3 sm:p-4 bg-surface border-b border-border sticky top-0 z-30 shadow-xs">
            <div className="flex items-center justify-between gap-3 mb-2.5 max-w-7xl mx-auto">
              {/* Location / Delivery Badge */}
              <button
                type="button"
                onClick={() => setShowLocationPrompt(true)}
                className="flex items-center gap-2 text-left hover:opacity-90 transition-opacity min-w-0 flex-1"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <FiZap className="text-amber-500 text-lg fill-amber-500" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black tracking-tight text-content">Delivery in 10–15 mins</span>
                    <FiChevronRight className="text-content-muted text-xs shrink-0" />
                  </div>
                  <p className="text-[11px] font-semibold text-content-secondary truncate max-w-[200px] sm:max-w-md">
                    {location?.label || "Set your delivery location..."}
                  </p>
                </div>
              </button>

              {/* Wishlist + Cart */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => navigate("/wishlist")}
                  className="p-2.5 rounded-xl bg-surface-muted hover:bg-border transition-colors border border-border/60 text-content-secondary"
                  aria-label="Wishlist"
                >
                  <FiHeart className="text-base" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/cart")}
                  className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-xs shadow-xs flex items-center gap-2 transition-all"
                >
                  <FiShoppingCart className="text-sm" />
                  <span className="hidden sm:inline">My Cart</span>
                  {itemCount > 0 && (
                    <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[10px] font-black">
                      {itemCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Rotating Search Bar */}
            <form onSubmit={handleGlobalSearchSubmit} className="relative max-w-7xl mx-auto">
              <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-content-muted text-sm" />
              <input
                type="text"
                value={globalSearchText}
                onChange={(e) => setGlobalSearchText(e.target.value)}
                placeholder={SEARCH_PLACEHOLDERS[searchIndex]}
                className="w-full pl-10 pr-10 py-2.5 bg-surface-input border border-border/80 rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-inner text-content placeholder:text-content-muted transition-all"
              />
              {globalSearchText && (
                <button
                  type="button"
                  onClick={() => setGlobalSearchText("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-content p-1"
                >
                  <FiX className="text-xs" />
                </button>
              )}
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
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <FiZap className="text-2xl text-amber-500 shrink-0 fill-amber-500" />
                  <div>
                    <h3 className="text-sm font-extrabold text-content">⚡ DwellMart Express isn&apos;t here yet</h3>
                    <p className="text-xs text-content-secondary">
                      No stores currently deliver to {location?.label || "this location"}.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/home")}
                  className="px-4 py-2 rounded-xl bg-brand-primary text-content-inverse font-extrabold text-xs shrink-0 self-end sm:self-center shadow-xs"
                >
                  Go to Marketplace
                </button>
              </div>
            </div>
          )}

          {/* ── Hero Banner ── */}
          <QuickCommerceHeroBanner
            onSelectCategory={(slug) => navigate(`/quick/categories?category=${slug}`)}
          />

          {/* ── Browse Categories Strip ── */}
          <section className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black text-content tracking-tight flex items-center gap-1.5">
                <FiZap className="text-amber-500 fill-amber-500 text-sm" />
                Browse Categories
              </h2>
              <button
                type="button"
                onClick={() => navigate("/quick/categories")}
                className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
              >
                See All <FiChevronRight className="text-xs" />
              </button>
            </div>

            {/* Horizontal Category Chip Row */}
            {isLoadingCats ? (
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="w-20 h-24 rounded-2xl bg-surface animate-pulse border border-border/40 shrink-0" />
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
                      className="flex flex-col items-center gap-2 p-2.5 rounded-2xl bg-surface border border-border/80 hover:border-emerald-500/50 hover:shadow-sm transition-all cursor-pointer shrink-0 w-20 sm:w-auto group"
                    >
                      <CategoryImage
                        src={category.image || category.icon}
                        alt={category.name}
                        name={category.name}
                        containerClassName="w-12 h-12 rounded-xl overflow-hidden bg-surface-muted border border-border/60 group-hover:scale-105 transition-transform"
                      />
                      <span className="text-[10px] font-bold text-content text-center leading-tight line-clamp-2 group-hover:text-emerald-600 transition-colors">
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
            <div className="h-px bg-border/60" />
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
              accentColor="orange"
            />
            <ProductShelf
              title="📈 Trending Now"
              products={trending}
              isLoading={isLoadingTrending}
              onSeeAll={() => navigate("/quick/categories")}
              accentColor="violet"
            />
            <ProductShelf
              title="🆕 Recently Added"
              products={recentlyAdded}
              isLoading={isLoadingRecent}
              onSeeAll={() => navigate("/quick/categories")}
              accentColor="sky"
            />
          </div>

          {/* ── View All Categories CTA ── */}
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 mt-6 mb-4 text-center">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => navigate("/quick/categories")}
              className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black text-sm shadow-md flex items-center justify-center gap-2 mx-auto transition-all"
            >
              View All Express Categories →
            </motion.button>
          </div>

          {/* ── Nearby Stores ── */}
          {vendors.length > 0 && (
            <div className="p-4 sm:p-6 pt-2 max-w-7xl mx-auto">
              <h3 className="text-sm font-extrabold text-content mb-3 uppercase tracking-wider text-content-muted">
                Stores near you
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {vendors.map((vendor) => (
                  <button
                    key={vendor.id || vendor._id}
                    type="button"
                    onClick={() => navigate(`/seller/${vendor.id || vendor._id}`)}
                    className="w-full bg-surface rounded-2xl border border-border p-3 flex items-center gap-3 text-left hover:border-emerald-500/40 hover:shadow-xs transition-all cursor-pointer"
                  >
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-surface-muted flex-shrink-0">
                      <LazyImage
                        src={vendor.storeLogo || getPlaceholderImage(48, 48, vendor.storeName?.charAt(0) || "S")}
                        alt={vendor.storeName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-content truncate">{vendor.storeName}</p>
                      <div className="flex items-center gap-2 text-[11px] text-content-secondary">
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
                      <span className="text-[10px] font-bold text-status-error bg-status-errorBg px-2 py-1 rounded-full flex-shrink-0">
                        Closed
                      </span>
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
