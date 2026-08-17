import { useEffect } from "react";
import api from "../utils/api";
import useCurrencyStore from "../store/currencyStore";
import { useVendorAuthStore } from "../../modules/Vendor/store/vendorAuthStore";
import { useNotificationStore } from "../store/useNotificationStore";
import { useAutoLocation } from "../hooks/useAutoLocation";
import NotificationDrawer from "./Notifications/NotificationDrawer";

const PRODUCTS_CACHE_KEY = "user-catalog-products-cache";
const VENDORS_CACHE_KEY = "user-catalog-vendors-cache";
const BRANDS_CACHE_KEY = "user-catalog-brands-cache";

// Sized to stay well inside the ~5MB localStorage budget. 500 products of full
// documents regularly exceeded it, and the resulting QuotaExceededError took
// the entire sync down with it.
const PRODUCT_CACHE_LIMIT = 100;
const VENDOR_CACHE_LIMIT = 60;

const normalizeProduct = (raw) => {
  const vendorObj =
    raw?.vendorId && typeof raw.vendorId === "object" ? raw.vendorId : null;
  const brandObj =
    raw?.brandId && typeof raw.brandId === "object" ? raw.brandId : null;
  const categoryObj =
    raw?.categoryId && typeof raw.categoryId === "object" ? raw.categoryId : null;

  return {
    ...raw,
    id: raw?._id || raw?.id,
    vendorId: vendorObj?._id || raw?.vendorId,
    brandId: brandObj?._id || raw?.brandId,
    categoryId: categoryObj?._id || raw?.categoryId,
    vendorName: raw?.vendorName || vendorObj?.storeName || "",
    brandName: raw?.brandName || brandObj?.name || "",
    categoryName: raw?.categoryName || categoryObj?.name || "",
    image: raw?.image || raw?.images?.[0] || "",
    images: Array.isArray(raw?.images) ? raw.images : raw?.image ? [raw.image] : [],
  };
};

const normalizeVendor = (raw) => ({
  ...raw,
  id: raw?._id || raw?.id,
});

const normalizeBrand = (raw) => ({
  ...raw,
  id: raw?._id || raw?.id,
});

const AppBootstrap = () => {
  const { fetchCurrencies } = useCurrencyStore();

  // Silently detect and refresh live customer location on app load if permission was previously granted
  useAutoLocation({ silentOnly: true, fallbackToSavedAddress: true });

  useEffect(() => {
    fetchCurrencies();
    try {
      useVendorAuthStore.getState().initialize();
    } catch (e) {
      console.warn('Vendor auth initialization warning:', e);
    }

    try {
      useNotificationStore.getState().fetchUnreadCount();
      useNotificationStore.getState().registerDeviceToken();
    } catch (e) {
      console.warn('Notification bootstrap warning:', e);
    }
  }, [fetchCurrencies]);

  useEffect(() => {
    let cancelled = false;

    /**
     * Write one cache entry without letting a storage failure abort the others.
     *
     * Previously all three writes sat in a single try block, so a
     * QuotaExceededError on the products write skipped the vendor and brand
     * writes too — and the whole storefront then fell through to the bundled
     * demo catalogue.
     */
    const writeCache = (key, list) => {
      if (!Array.isArray(list) || list.length === 0) return false;
      try {
        localStorage.setItem(key, JSON.stringify(list));
        return true;
      } catch (err) {
        // Over quota: drop this entry rather than the whole sync. Surfaces the
        // catalogue as "not loaded", which callers render as an empty state.
        console.warn(`[AppBootstrap] Could not cache ${key}:`, err?.name || err);
        try { localStorage.removeItem(key); } catch { /* nothing further to do */ }
        return false;
      }
    };

    const syncCatalog = async () => {
      try {
        const [productsRes, vendorsRes, brandsRes] = await Promise.allSettled([
          // Trimmed from 500. This payload is downloaded on every app load, and
          // the storefront pages fetch their own paginated data anyway — this
          // cache exists to make the first paint fast, not to hold the catalogue.
          api.get("/products", { params: { page: 1, limit: PRODUCT_CACHE_LIMIT } }),
          api.get("/vendors/all", { params: { status: "approved", page: 1, limit: VENDOR_CACHE_LIMIT } }),
          api.get("/brands/all"),
        ]);

        let updated = false;

        if (productsRes.status === "fulfilled" && !cancelled) {
          const payload = productsRes.value?.data;
          const list = Array.isArray(payload?.products)
            ? payload.products.map(normalizeProduct)
            : [];
          updated = writeCache(PRODUCTS_CACHE_KEY, list) || updated;
        }

        if (vendorsRes.status === "fulfilled" && !cancelled) {
          const payload = vendorsRes.value?.data;
          const list = Array.isArray(payload?.vendors)
            ? payload.vendors.map(normalizeVendor)
            : [];
          updated = writeCache(VENDORS_CACHE_KEY, list) || updated;
        }

        if (brandsRes.status === "fulfilled" && !cancelled) {
          const payload = brandsRes.value?.data;
          const list = Array.isArray(payload) ? payload.map(normalizeBrand) : [];
          updated = writeCache(BRANDS_CACHE_KEY, list) || updated;
        }

        if (updated && !cancelled) {
          window.dispatchEvent(new Event("catalog-cache-updated"));
        }
      } catch {
        // Network failure — callers render an empty/loading state.
      }
    };

    syncCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  return <NotificationDrawer />;
};

export default AppBootstrap;
