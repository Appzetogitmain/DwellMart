import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FiMapPin, FiClock, FiChevronRight, FiZap } from "react-icons/fi";
import { motion } from "framer-motion";
import MobileLayout from "../components/Layout/MobileLayout";
import PageTransition from "../../../shared/components/PageTransition";
import LocationPrompt from "../components/QuickCommerce/LocationPrompt";
import LazyImage from "../../../shared/components/LazyImage";
import { useExperienceStore } from "../../../shared/store/experienceStore";
import { useAddressStore } from "../../../shared/store/addressStore";
import { useAuthStore } from "../../../shared/store/authStore";
import { getLocationQueryParams } from "../../../shared/utils/experience";
import {
  getQuickCommerceCategoryFeed,
  getNearbyQuickCommerceVendors,
} from "../../../shared/services/quickCommerceService";
import { getPublicCategories } from "../../Admin/services/adminService";
import CategoryImage from "../../../shared/components/CategoryImage";
import { getPlaceholderImage } from "../../../shared/utils/helpers";

/**
 * Quick Commerce home — category-first.
 *
 * Quick Commerce intent is item-first ("I need milk"), not merchant-first, so
 * categories lead and stores are a secondary section.
 */
const QuickCommerceHome = () => {
  const navigate = useNavigate();
  const { location, serviceability, checkServiceability } = useExperienceStore();
  const { isAuthenticated } = useAuthStore();
  const { fetchAddresses } = useAddressStore();

  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);

  const locationParams = getLocationQueryParams(location);
  const hasLocation = Object.keys(locationParams).length > 0;

  useEffect(() => {
    if (isAuthenticated) fetchAddresses?.();
  }, [isAuthenticated, fetchAddresses]);

  useEffect(() => {
    checkServiceability(location);
  }, [hasLocation, location]);

  const loadFeed = useCallback(async () => {
    setIsLoading(true);
    try {
      const [feedRes, vendorRes] = await Promise.allSettled([
        getQuickCommerceCategoryFeed(hasLocation ? locationParams : {}),
        hasLocation ? getNearbyQuickCommerceVendors({ ...locationParams, limit: 10 }) : Promise.resolve({ data: { vendors: [] } }),
      ]);

      let loadedCats = [];
      if (feedRes.status === "fulfilled") {
        const data = feedRes.value?.data ?? feedRes.value;
        loadedCats = Array.isArray(data?.categories) ? data.categories : [];
      }

      if (loadedCats.length === 0) {
        try {
          const publicCatsRes = await getPublicCategories("quick_commerce");
          loadedCats = publicCatsRes.data || [];
        } catch (e) {
          // ignore error
        }
      }

      setCategories(loadedCats);

      if (vendorRes.status === "fulfilled") {
        const data = vendorRes.value?.data ?? vendorRes.value;
        setVendors(Array.isArray(data?.vendors) ? data.vendors : []);
      } else {
        setVendors([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [hasLocation, JSON.stringify(locationParams)]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const isServiceable = serviceability?.serviceable === true;

  return (
    <PageTransition>
      <MobileLayout showBottomNav showCartBar>
        <div className="w-full pb-24 lg:pb-12 max-w-7xl mx-auto min-h-screen bg-surface-muted">
          {/* Location bar */}
          <div className="p-4 bg-surface border-b border-border sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setShowLocationPrompt(true)}
              className="w-full flex items-center justify-between gap-3 text-left"
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <FiMapPin className="text-brand-primary shrink-0 text-lg" />
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-content-muted">
                    Delivering to
                  </p>
                  <p className="text-sm font-semibold text-content truncate">
                    {location?.label || "Set your location"}
                  </p>
                </div>
              </div>
              <FiChevronRight className="text-content-muted shrink-0" />
            </button>
          </div>

          {showLocationPrompt && (
            <div className="p-4">
              <LocationPrompt
                onClose={() => setShowLocationPrompt(false)}
                showClose={hasLocation}
              />
            </div>
          )}

          {/* Not serviceable banner */}
          {hasLocation && serviceability && !isServiceable && (
            <div className="p-4 pb-0">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <FiZap className="text-2xl text-amber-500 shrink-0" />
                  <div>
                    <h3 className="text-sm font-bold text-content">
                      ⚡ DwellMart Express isn&apos;t here yet
                    </h3>
                    <p className="text-xs text-content-secondary">
                      No stores currently deliver to {location?.label || "this location"}. You can browse Express categories below or shop Marketplace.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/home")}
                  className="px-4 py-2 rounded-xl bg-brand-primary text-content-inverse font-bold text-xs shrink-0 self-end sm:self-center"
                >
                  Go to Marketplace
                </button>
              </div>
            </div>
          )}

          {/* Category-first grid */}
          <div className="p-4">
            <h2 className="text-base font-bold text-content mb-3">⚡ DwellMart Express Categories</h2>
            {isLoading && categories.length === 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                {Array.from({ length: 12 }).map((_, index) => (
                  <div key={index} className="h-28 rounded-2xl bg-surface animate-pulse" />
                ))}
              </div>
            ) : categories.length === 0 ? (
              <p className="text-sm text-content-secondary">
                No DwellMart Express categories available.
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                {categories.map((category) => (
                  <motion.button
                    key={category._id || category.id}
                    whileHover={{ scale: 1.03, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    type="button"
                    onClick={() => navigate(`/category/${category._id || category.id}`)}
                    className="bg-surface rounded-2xl border border-border p-3 flex flex-col items-center gap-2 text-center hover:border-brand-primary/40 hover:shadow-sm transition-all cursor-pointer"
                  >
                    <CategoryImage
                      src={category.image || category.icon}
                      alt={category.name}
                      name={category.name}
                      containerClassName="w-14 h-14 rounded-2xl overflow-hidden bg-surface-muted flex items-center justify-center shrink-0 border border-border/60"
                    />
                    <span className="text-[11px] font-bold text-content line-clamp-2 leading-tight">
                      {category.name}
                    </span>
                    {category.productCount > 0 && (
                      <span className="text-[10px] font-medium text-content-muted">
                        {category.productCount} items
                      </span>
                    )}
                  </motion.button>
                ))}
              </div>
            )}
          </div>

          {/* Stores near you */}
          {vendors.length > 0 && (
            <div className="p-4 pt-0">
              <h2 className="text-base font-bold text-content mb-3">Stores near you</h2>
              <div className="space-y-2">
                {vendors.map((vendor) => (
                  <button
                    key={vendor.id || vendor._id}
                    type="button"
                    onClick={() => navigate(`/seller/${vendor.id || vendor._id}`)}
                    className="w-full bg-surface rounded-2xl border border-border p-3 flex items-center gap-3 text-left hover:border-brand-primary/30 transition-all cursor-pointer"
                  >
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-surface-muted flex-shrink-0">
                      <LazyImage
                        src={vendor.storeLogo || getPlaceholderImage(48, 48, vendor.storeName?.charAt(0) || "S")}
                        alt={vendor.storeName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-content truncate">
                        {vendor.storeName}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-content-secondary">
                        {Number.isFinite(vendor.distanceKm) && (
                          <span>{vendor.distanceKm} km away</span>
                        )}
                        {Number.isFinite(vendor.preparationTimeMins) && (
                          <span className="flex items-center gap-1">
                            <FiClock className="text-[10px]" />
                            {vendor.preparationTimeMins} min prep
                          </span>
                        )}
                      </div>
                    </div>
                    {!vendor.availability?.isOrderable && (
                      <span className="text-[10px] font-semibold text-status-error bg-status-errorBg px-2 py-1 rounded-full flex-shrink-0">
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
