import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import api from '../utils/api';
import { useAuthStore } from './authStore';
import { setPostLoginAction, setPostLoginRedirect } from '../utils/postLoginAction';

const isMongoId = (value) => /^[a-fA-F0-9]{24}$/.test(String(value || ''));
const normalizeId = (value) => String(value ?? '').trim();
const getCurrentAuthUserId = () => {
  const authState = useAuthStore.getState();
  return normalizeId(authState?.user?.id || authState?.user?._id);
};

const redirectToLogin = () => {
  if (typeof window === 'undefined') return;
  const currentPath = window.location.pathname || '/home';
  if (currentPath === '/login') return;

  const fromPath = `${window.location.pathname || ''}${window.location.search || ''}${window.location.hash || ''}`;
  setPostLoginRedirect(fromPath || '/home');

  // SPA-friendly redirect without full page reload.
  const nextState = { from: { pathname: fromPath || '/home' } };
  window.history.pushState(nextState, '', '/login');
  window.dispatchEvent(new PopStateEvent('popstate', { state: nextState }));
};

const normalizeWishlistItem = (item) => {
  const product = item?.productId || item;
  const id = normalizeId(product?.id || product?._id || item?.id);
  return {
    id,
    name: product?.name || item?.name || 'Product',
    price: Number(product?.price ?? item?.price ?? 0),
    image: product?.image || item?.image || '',
    stock: product?.stock || item?.stock,
    unit: product?.unit || item?.unit,
    rating: Number(product?.rating ?? item?.rating ?? 0),
    originalPrice:
      product?.originalPrice !== undefined
        ? Number(product.originalPrice)
        : item?.originalPrice !== undefined
          ? Number(item.originalPrice)
          : undefined,
    productId: normalizeId(product?._id || item?.productId || item?.id),
  };
};

export const useWishlistStore = create(
  persist(
    (set, get) => ({
      items: [],
      isLoading: false,
      hasFetched: false,
      ownerUserId: null,

      fetchWishlist: async () => {
        const authState = useAuthStore.getState();
        if (!authState?.isAuthenticated) {
          set({ items: [], hasFetched: false, ownerUserId: null, isLoading: false });
          return get().items;
        }

        const currentUserId = getCurrentAuthUserId();
        if (currentUserId && get().ownerUserId && normalizeId(get().ownerUserId) !== currentUserId) {
          set({ items: [], hasFetched: false });
        }

        set({ isLoading: true });
        try {
          const response = await api.get('/user/wishlist');
          const payload = response?.data ?? response;
          const list = Array.isArray(payload)
            ? payload.map(normalizeWishlistItem).filter((item) => item.id)
            : [];
          set({ items: list, isLoading: false, hasFetched: true, ownerUserId: currentUserId || null });
          return list;
        } catch {
          set({ isLoading: false, hasFetched: true });
          return get().items;
        }
      },

      ensureHydrated: () => {
        const authState = useAuthStore.getState();
        const state = get();
        const currentUserId = getCurrentAuthUserId();

        if (!authState?.isAuthenticated) {
          if (state.items.length || state.hasFetched || state.ownerUserId) {
            set({ items: [], hasFetched: false, ownerUserId: null });
          }
          return;
        }

        if (
          currentUserId &&
          state.ownerUserId &&
          normalizeId(state.ownerUserId) !== currentUserId
        ) {
          set({ items: [], hasFetched: false, ownerUserId: currentUserId });
          return;
        }

        if (!state.hasFetched && !state.isLoading) {
          state.fetchWishlist().catch(() => null);
        }
      },

      // Add item to wishlist
      addItem: (item) => {
        const authState = useAuthStore.getState();
        if (!authState?.isAuthenticated) {
          setPostLoginAction({
            type: 'wishlist:add',
            payload: item,
          });
          redirectToLogin();
          return false;
        }

        const normalizedItem = normalizeWishlistItem(item);
        if (!normalizedItem.id) {
          return false;
        }
        const currentUserId = getCurrentAuthUserId();
        let added = false;
        set((state) => {
          const ownerMismatch =
            currentUserId &&
            state.ownerUserId &&
            normalizeId(state.ownerUserId) !== currentUserId;
          const safeItems = ownerMismatch ? [] : state.items;
          const existingItem = safeItems.find(
            (i) => normalizeId(i.id) === normalizeId(normalizedItem.id)
          );
          if (existingItem) {
            return state; // Item already in wishlist
          }
          added = true;
          return {
            items: [...safeItems, normalizedItem],
            ownerUserId: currentUserId || state.ownerUserId || null,
          };
        });

        if (authState?.isAuthenticated && isMongoId(normalizedItem.id)) {
          api.post('/user/wishlist', { productId: String(normalizedItem.id) }).catch(() => null);
        }

        return added;
      },

      // Remove item from wishlist
      removeItem: (id) => {
        const normalizedId = normalizeId(id);
        const currentUserId = getCurrentAuthUserId();
        set((state) => ({
          items: state.items.filter((item) => normalizeId(item.id) !== normalizedId),
          ownerUserId: currentUserId || state.ownerUserId || null,
        }));

        const authState = useAuthStore.getState();
        if (authState?.isAuthenticated && isMongoId(normalizedId)) {
          api.delete(`/user/wishlist/${normalizedId}`).catch(() => null);
        }
      },

      // Check if item is in wishlist
      isInWishlist: (id) => {
        get().ensureHydrated();
        const state = get();
        const authState = useAuthStore.getState();
        if (!authState?.isAuthenticated || !state.hasFetched) {
          return false;
        }
        const normalizedId = normalizeId(id);
        return state.items.some((item) => normalizeId(item.id) === normalizedId);
      },

      // Clear wishlist
      clearWishlist: () => {
        const items = [...get().items];
        const currentUserId = getCurrentAuthUserId();
        set({ items: [], ownerUserId: currentUserId || null });

        const authState = useAuthStore.getState();
        if (authState?.isAuthenticated) {
          items
            .filter((item) => isMongoId(item.id))
            .forEach((item) => {
              api.delete(`/user/wishlist/${item.id}`).catch(() => null);
            });
        }
      },

      // Get wishlist count
      getItemCount: () => {
        get().ensureHydrated();
        const state = get();
        const authState = useAuthStore.getState();
        if (!authState?.isAuthenticated || !state.hasFetched) {
          return 0;
        }
        return state.items.length;
      },

      // Move item from wishlist to cart (returns item for cart)
      moveToCart: (id) => {
        const normalizedId = normalizeId(id);
        const state = get();
        const currentUserId = getCurrentAuthUserId();
        const item = state.items.find((i) => normalizeId(i.id) === normalizedId);
        if (item) {
          set({
            items: state.items.filter((i) => normalizeId(i.id) !== normalizedId),
            ownerUserId: currentUserId || state.ownerUserId || null,
          });

          const authState = useAuthStore.getState();
          if (authState?.isAuthenticated && isMongoId(normalizedId)) {
            api.delete(`/user/wishlist/${normalizedId}`).catch(() => null);
          }

          return item;
        }
        return null;
      },

      resetWishlist: () => {
        set({ items: [], hasFetched: false, ownerUserId: null, isLoading: false });
      },
    }),
    {
      name: 'wishlist-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        items: state.items,
        ownerUserId: state.ownerUserId,
      }),
    }
  )
);

