import { useEffect } from "react";
import api from "../utils/api";
import useCurrencyStore from "../store/currencyStore";
import { useVendorAuthStore } from "../../modules/Vendor/store/vendorAuthStore";

const PRODUCTS_CACHE_KEY = "user-catalog-products-cache";
const VENDORS_CACHE_KEY = "user-catalog-vendors-cache";
const BRANDS_CACHE_KEY = "user-catalog-brands-cache";

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

import { useNotificationStore } from "../store/useNotificationStore";
import NotificationDrawer from "./Notifications/NotificationDrawer";

const AppBootstrap = () => {
  const { fetchCurrencies } = useCurrencyStore();

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

    const syncCatalog = async () => {
      try {
        const [productsRes, vendorsRes, brandsRes] = await Promise.allSettled([
          api.get("/products", { params: { page: 1, limit: 500 } }),
          api.get("/vendors/all", { params: { status: "approved", page: 1, limit: 200 } }),
          api.get("/brands/all"),
        ]);

        let updated = false;

        if (productsRes.status === "fulfilled" && !cancelled) {
          const payload = productsRes.value?.data;
          const list = Array.isArray(payload?.products)
            ? payload.products.map(normalizeProduct)
            : [];
          if (list.length) {
            localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(list));
            updated = true;
          }
        }

        if (vendorsRes.status === "fulfilled" && !cancelled) {
          const payload = vendorsRes.value?.data;
          const list = Array.isArray(payload?.vendors)
            ? payload.vendors.map(normalizeVendor)
            : [];
          if (list.length) {
            localStorage.setItem(VENDORS_CACHE_KEY, JSON.stringify(list));
            updated = true;
          }
        }

        if (brandsRes.status === "fulfilled" && !cancelled) {
          const payload = brandsRes.value?.data;
          const list = Array.isArray(payload) ? payload.map(normalizeBrand) : [];
          if (list.length) {
            localStorage.setItem(BRANDS_CACHE_KEY, JSON.stringify(list));
            updated = true;
          }
        }

        if (updated && !cancelled) {
          window.dispatchEvent(new Event("catalog-cache-updated"));
        }
      } catch {
        // Keep static fallback silently.
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
