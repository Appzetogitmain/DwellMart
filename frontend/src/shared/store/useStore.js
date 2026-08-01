import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import toast from "react-hot-toast";
import { useAuthStore } from "./authStore";
import { setPostLoginAction, setPostLoginRedirect } from "../utils/postLoginAction";
import { getVariantSignature } from "../utils/variant";
import { resolvePriceForQuantity } from "../utils/resolvePriceForQuantity";
import { EXPERIENCES, getExperience, normalizeExperience } from "../utils/experience";

import { useSettingsStore } from "./settingsStore";

const getCartLineKey = (id, variant = {}) =>
  `${String(id)}::${getVariantSignature(variant)}`;

/**
 * Preview pricing for a cart line using the wholesale tier data snapshotted at
 * add-to-cart time. `item.price` remains the variant-resolved retail base price,
 * exactly as before, so legacy cart lines (no wholesale data) resolve to retail.
 *
 * Display only — checkout re-derives every price server-side.
 */
const resolveCartLinePricing = (item) => {
  const settingsState = useSettingsStore?.getState?.();
  const wholesaleMarketplaceEnabled = settingsState?.settings?.features?.wholesaleMarketplaceEnabled === true;

  const basePrice = Number(item?.price) || 0;
  const quantity = Number(item?.quantity) || 0;
  return resolvePriceForQuantity(
    {
      retailEnabled: item?.retailEnabled,
      wholesaleEnabled: item?.wholesaleEnabled,
      wholesale: item?.wholesale,
    },
    basePrice,
    quantity,
    { vendorWholesaleEnabled: wholesaleMarketplaceEnabled && (item?.vendorWholesaleEnabled !== false) }
  );
};

const getCartLineUnitPrice = (item) => {
  const pricing = resolveCartLinePricing(item);
  return pricing.unitPrice;
};
const getCurrentAuthUserId = () => {
  const authState = useAuthStore.getState();
  return String(authState?.user?.id || authState?.user?._id || "").trim();
};

const redirectToLogin = () => {
  if (typeof window === "undefined") return;
  const currentPath = window.location.pathname || "/home";
  if (currentPath === "/login") return;

  const fromPath = `${window.location.pathname || ""}${window.location.search || ""}${window.location.hash || ""}`;
  setPostLoginRedirect(fromPath || "/home");

  // SPA-friendly redirect without full page reload.
  const nextState = { from: { pathname: fromPath || "/home" } };
  window.history.pushState(nextState, "", "/login");
  window.dispatchEvent(new PopStateEvent("popstate", { state: nextState }));
};

// Cart Store
export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],
      // Per-experience baskets. `items` always mirrors the ACTIVE experience so
      // every existing consumer keeps working unchanged; `carts` holds the
      // inactive ones.
      carts: {},
      cartExperience: getExperience(),
      ownerUserId: null,
      addItem: (item) => {
        const authState = useAuthStore.getState();
        if (!authState?.isAuthenticated) {
          setPostLoginAction({
            type: "cart:add",
            payload: {
              ...item,
              quantity: Number(item?.quantity) > 0 ? Number(item.quantity) : 1,
            },
          });
          toast.error("Please login to add products to cart");
          redirectToLogin();
          return false;
        }
        const currentUserId = getCurrentAuthUserId();
        if (!currentUserId) {
          toast.error("Please login to add products to cart");
          redirectToLogin();
          return false;
        }

        const ownerUserId = String(get().ownerUserId || "").trim();
        if (ownerUserId && ownerUserId !== currentUserId) {
          set({ items: [], carts: {}, ownerUserId: currentUserId });
        }

        const availableStock = Number(item?.stockQuantity);
        if (Number.isFinite(availableStock) && availableStock <= 0) {
          toast.error("Product is out of stock");
          return false;
        }

        // Quick Commerce carts are pinned to one store so the order has a single
        // coherent ETA and delivery fee. The UI should call
        // `checkQuickCommerceVendorConflict` first and offer "start a new cart";
        // this is the backstop if it does not.
        if (get().cartExperience === EXPERIENCES.QUICK_COMMERCE) {
          const conflict = get().checkQuickCommerceVendorConflict(item?.vendorId);
          if (conflict) {
            toast.error(
              `Your cart has items from ${conflict.vendorName}. Clear it to order from another store.`
            );
            return false;
          }
        }

        const lineKey = getCartLineKey(item.id, item.variant);
        const existingItem = get().items.find(
          (i) => String(i.cartLineKey || getCartLineKey(i.id, i.variant)) === lineKey
        );
        const quantityToAdd = item.quantity || 1;
        const newQuantity = existingItem
          ? existingItem.quantity + quantityToAdd
          : quantityToAdd;

        // If stock quantity is known on the item payload, keep local guard.
        if (Number.isFinite(availableStock) && newQuantity > availableStock) {
          toast.error(`Only ${availableStock} items available in stock`);
          return false;
        }

        if (newQuantity <= 0) {
          return false;
        }

        // Include vendor information from product
        const itemWithVendor = {
          ...item,
          cartLineKey: lineKey,
          vendorId: item.vendorId || 1,
          vendorName: item.vendorName || "Unknown Vendor",
        };

        set((state) => {
          if (existingItem) {
            return {
              items: state.items.map((i) =>
                String(i.id) === String(item.id)
                && String(i.cartLineKey || getCartLineKey(i.id, i.variant)) === lineKey
                  ? {
                    ...i,
                    ...itemWithVendor,
                    quantity:
                      Number.isFinite(availableStock)
                        ? Math.min(newQuantity, availableStock)
                        : newQuantity,
                  }
                  : i
              ),
              ownerUserId: currentUserId,
            };
          }
          return {
            items: [
              ...state.items,
              {
                ...itemWithVendor,
                quantity:
                  Number.isFinite(availableStock)
                    ? Math.min(quantityToAdd, availableStock)
                    : quantityToAdd,
              },
            ],
            ownerUserId: currentUserId,
          };
        });

        if (Number.isFinite(availableStock) && newQuantity >= availableStock * 0.8) {
          toast.warning(`Only ${availableStock} left in stock!`);
        }

        // Trigger cart animation
        const { triggerCartAnimation } = useUIStore.getState();
        triggerCartAnimation();
        return true;
      },
      removeItem: (id, variant = null) =>
        set((state) => ({
          items: state.items.filter((item) => {
            if (String(item.id) !== String(id)) return true;
            if (!variant) return false; // backwards-compatible: remove all variants for this product
            const candidate = String(item.cartLineKey || getCartLineKey(item.id, item.variant));
            return candidate !== getCartLineKey(id, variant);
          }),
          ownerUserId: state.ownerUserId,
        })),
      updateQuantity: (id, quantity, variant = null) => {
        if (quantity <= 0) {
          get().removeItem(id, variant);
          return;
        }

        const targetItem = get().items.find((item) => {
          if (String(item.id) !== String(id)) return false;
          if (!variant) return true;
          const candidate = String(item.cartLineKey || getCartLineKey(item.id, item.variant));
          return candidate === getCartLineKey(id, variant);
        });
        const availableStock = Number(targetItem?.stockQuantity);
        if (Number.isFinite(availableStock) && quantity > availableStock) {
          toast.error(`Only ${availableStock} items available in stock`);
          quantity = availableStock;
        }

        set((state) => ({
          items: state.items.map((item) =>
            (() => {
              if (String(item.id) !== String(id)) return item;
              if (!variant) return { ...item, quantity };
              const candidate = String(item.cartLineKey || getCartLineKey(item.id, item.variant));
              return candidate === getCartLineKey(id, variant)
                ? { ...item, quantity }
                : item;
            })()
          ),
          ownerUserId: state.ownerUserId,
        }));
      },
      clearCart: () => set((state) => ({ items: [], ownerUserId: state.ownerUserId })),
      getTotal: () => {
        const authState = useAuthStore.getState();
        if (!authState?.isAuthenticated) {
          if (get().items.length > 0 || get().ownerUserId) {
            set({ items: [], carts: {}, ownerUserId: null });
          }
          return 0;
        }
        const currentUserId = getCurrentAuthUserId();
        const ownerUserId = String(get().ownerUserId || "").trim();
        if (ownerUserId && currentUserId && ownerUserId !== currentUserId) {
          set({ items: [], carts: {}, ownerUserId: currentUserId });
          return 0;
        }
        const state = useCartStore.getState();
        return state.items.reduce(
          (total, item) => total + getCartLineUnitPrice(item) * item.quantity,
          0
        );
      },
      // Preview-only pricing for a single cart line, mirroring the backend engine.
      // Checkout re-derives authoritatively; this only drives display.
      getLinePricing: (item) => resolveCartLinePricing(item),
      getTotalSavings: () => {
        const state = useCartStore.getState();
        return state.items.reduce(
          (sum, item) => sum + (resolveCartLinePricing(item)?.savings || 0),
          0
        );
      },
      getItemCount: () => {
        const authState = useAuthStore.getState();
        if (!authState?.isAuthenticated) {
          if (get().items.length > 0 || get().ownerUserId) {
            set({ items: [], carts: {}, ownerUserId: null });
          }
          return 0;
        }
        const currentUserId = getCurrentAuthUserId();
        const ownerUserId = String(get().ownerUserId || "").trim();
        if (ownerUserId && currentUserId && ownerUserId !== currentUserId) {
          set({ items: [], carts: {}, ownerUserId: currentUserId });
          return 0;
        }
        const state = useCartStore.getState();
        return state.items.reduce((count, item) => count + item.quantity, 0);
      },
      // Group items by vendor
      getItemsByVendor: () => {
        const authState = useAuthStore.getState();
        if (!authState?.isAuthenticated) {
          if (get().items.length > 0 || get().ownerUserId) {
            set({ items: [], carts: {}, ownerUserId: null });
          }
          return [];
        }
        const currentUserId = getCurrentAuthUserId();
        const ownerUserId = String(get().ownerUserId || "").trim();
        if (ownerUserId && currentUserId && ownerUserId !== currentUserId) {
          set({ items: [], carts: {}, ownerUserId: currentUserId });
          return [];
        }
        const state = useCartStore.getState();
        const vendorGroups = {};

        state.items.forEach((item) => {
          const vendorId = String(item.vendorId || 1);
          const vendorName = item.vendorName || "Unknown Vendor";

          if (!vendorGroups[vendorId]) {
            vendorGroups[vendorId] = {
              vendorId,
              vendorName,
              items: [],
              subtotal: 0,
            };
          }

          const itemSubtotal = getCartLineUnitPrice(item) * item.quantity;
          vendorGroups[vendorId].items.push(item);
          vendorGroups[vendorId].subtotal += itemSubtotal;
        });

        return Object.values(vendorGroups);
      },

      /**
       * Which store a Quick Commerce cart is pinned to, or null when empty.
       *
       * A Quick Commerce order must be single-vendor for a coherent ETA and
       * delivery fee, so the cart itself enforces it — that removes any need to
       * split orders at checkout.
       */
      getCartVendor: () => {
        const first = get().items[0];
        if (!first) return null;
        return {
          vendorId: String(first.vendorId ?? ""),
          vendorName: first.vendorName || "this store",
        };
      },

      /**
       * Can this product join the current Quick Commerce cart?
       * Returns a conflict descriptor so the UI can offer "start a new cart"
       * rather than silently rejecting the tap.
       */
      checkQuickCommerceVendorConflict: (vendorId) => {
        const pinned = get().getCartVendor();
        if (!pinned || !pinned.vendorId) return null;
        if (String(vendorId ?? "") === pinned.vendorId) return null;
        return pinned;
      },

      /**
       * Switch the active cart between experiences.
       *
       * Each experience keeps its own basket — glancing at Quick Commerce must
       * never destroy a Marketplace cart the customer has been building.
       */
      switchCartExperience: (nextExperience) => {
        const normalized = normalizeExperience(nextExperience);
        const { cartExperience, items, carts } = get();
        if (cartExperience === normalized) return;

        set({
          carts: { ...carts, [cartExperience]: items },
          items: Array.isArray(carts[normalized]) ? carts[normalized] : [],
          cartExperience: normalized,
        });
      },

      /** Item count for an experience other than the active one. */
      getCartCountForExperience: (experience) => {
        const normalized = normalizeExperience(experience);
        const { cartExperience, items, carts } = get();
        const source = normalized === cartExperience ? items : carts[normalized];
        return Array.isArray(source)
          ? source.reduce((total, item) => total + (Number(item.quantity) || 0), 0)
          : 0;
      },
    }),
    {
      name: "cart-storage",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        items: state.items,
        carts: state.carts,
        cartExperience: state.cartExperience,
        ownerUserId: state.ownerUserId,
      }),
      /**
       * v0 carts were a single un-namespaced basket. They belong to the
       * Marketplace, which is the only experience that existed then.
       */
      migrate: (persistedState, version) => {
        if (version === 0 || persistedState?.cartExperience === undefined) {
          return {
            ...persistedState,
            carts: {},
            cartExperience: EXPERIENCES.MARKETPLACE,
          };
        }
        return persistedState;
      },
    }
  )
);

// UI Store (for modals, loading states, etc.)
export const useUIStore = create((set) => ({
  isMenuOpen: false,
  isCartOpen: false,
  isLoading: false,
  cartAnimationTrigger: 0,
  toggleMenu: () => set((state) => ({ isMenuOpen: !state.isMenuOpen })),
  toggleCart: () => set((state) => ({ isCartOpen: !state.isCartOpen })),
  setLoading: (loading) => set({ isLoading: loading }),
  triggerCartAnimation: () =>
    set((state) => ({ cartAnimationTrigger: state.cartAnimationTrigger + 1 })),
}));
