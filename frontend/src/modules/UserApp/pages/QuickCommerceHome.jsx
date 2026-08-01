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
import { getPlaceholderImage } from "../../../shared/utils/helpers";

/**
 * Quick Commerce home — category-first.
 *
 * Quick Commerce intent is item-first ("I need milk"), not merchant-first, so
 * categories lead and stores are a secondary section. A store-first home would
 * force the customer to guess which shop stocks their item.
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
    if (!hasLocation) {
      setShowLocationPrompt(true);
      return;
    }
    checkServiceability(location);
  }, [hasLocation, location]);

  const loadFeed = useCallback(async () => {
    if (!hasLocation) return;
    setIsLoading(true);
    try {
      const [feedRes, vendorRes] = await Promise.allSettled([
        getQuickCommerceCategoryFeed(locationParams),
        getNearbyQuickCommerceVendors({ ...locationParams, limit: 10 }),
      ]);

      if (feedRes.status === "fulfilled") {
        const data = feedRes.value?.data ?? feedRes.value;
        setCategories(Array.isArray(data?.categories) ? data.categories : []);
      } else {
        setCategories([]);
      }

      if (vendorRes.status === "fulfilled") {
        const data = vendorRes.value?.data ?? vendorRes.value;
        setVendors(Array.isArray(data?.vendors) ? data.vendors : []);
      } else {
        setVendors([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [hasLocation, location]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const isServiceable = serviceability?.serviceable === true;

  return (
    <PageTransition>
      <MobileLayout showBottomNav showCartBar>
        <div className="w-full pb-24 lg:pb-12 max-w-7xl mx-auto min-h-screen bg-surface-muted">
          {/* Location bar */}
          <div className="bg-surface border-b border-border px-4 py-3 sticky top-0 z-20">
            <button
              type="button"
              onClick={() => setShowLocationPrompt(true)}
              className="flex items-center gap-2 w-full text-left"
            >
              <FiMapPin className="text-brand-primary flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-content-muted leading-none mb-0.5">
                  Delivering to
                </p>
                <p className="text-sm font-semibold text-content truncate">
                  {location?.label || "Set your location"}
                </p>
              </div>
              <FiChevronRight className="text-content-muted flex-shrink-0" />
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

          {/* Not serviceable */}
          {hasLocation && serviceability && !isServiceable && (
            <div className="p-4">
              <div className="bg-surface rounded-2xl border border-border p-6 text-center">
                <FiZap className="text-3xl text-content-muted mx-auto mb-3" />
                <h2 className="text-lg font-bold text-content mb-1">
                  Quick Commerce isn&apos;t here yet
                </h2>
                <p className="text-sm text-content-secondary mb-4">
                  No stores currently deliver to {location?.label || "this location"}.
                  You can still shop the full Marketplace.
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/home")}
                  className="px-5 py-2.5 rounded-xl bg-brand-primary text-content-inverse font-semibold text-sm"
                >
                  Go to Marketplace
                </button>
              </div>
            </div>
          )}

          {/* Category-first grid */}
          {hasLocation && isServiceable && (
            <>
              <div className="p-4">
                <h2 className="text-base font-bold text-content mb-3">Shop by category</h2>
                {isLoading && categories.length === 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {Array.from({ length: 8 }).map((_, index) => (
                      <div key={index} className="h-24 rounded-2xl bg-surface animate-pulse" />
                    ))}
                  </div>
                ) : categories.length === 0 ? (
                  <p className="text-sm text-content-secondary">
                    No Quick Commerce categories are available yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                    {categories.map((category) => (
                      <motion.button
                        key={category._id}
                        whileTap={{ scale: 0.97 }}
                        type="button"
                        onClick={() => navigate(`/category/${category._id}`)}
                        className="bg-surface rounded-2xl border border-border p-3 flex flex-col items-center gap-2 text-center"
                      >
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-surface-muted flex items-center justify-center">
                          {category.image || category.icon ? (
                            <LazyImage
                              src={category.image || category.icon}
                              alt={category.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <FiZap className="text-brand-primary" />
                          )}
                        </div>
                        <span className="text-[11px] font-semibold text-content line-clamp-2 leading-tight">
                          {category.name}
                        </span>
                        {category.productCount > 0 && (
                          <span className="text-[10px] text-content-muted">
                            {category.productCount} items
                          </span>
                        )}
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>

              {/* Nearby stores — secondary to categories */}
              {vendors.length > 0 && (
                <div className="p-4 pt-0">
                  <h2 className="text-base font-bold text-content mb-3">Stores near you</h2>
                  <div className="space-y-2">
                    {vendors.map((vendor) => (
                      <button
                        key={vendor.id}
                        type="button"
                        onClick={() => navigate(`/seller/${vendor.id}`)}
                        className="w-full bg-surface rounded-2xl border border-border p-3 flex items-center gap-3 text-left"
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
            </>
          )}
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default QuickCommerceHome;
