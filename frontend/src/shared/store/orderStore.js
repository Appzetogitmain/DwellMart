import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import api from '../utils/api';
import { EXPERIENCES, getExperience, getLocationQueryParams } from '../utils/experience';

const isMongoId = (value) => /^[a-fA-F0-9]{24}$/.test(String(value || ''));

const normalizeOrderItem = (item) => ({
  ...item,
  id: item?.id || item?.productId || item?._id,
});

const normalizeVendorGroup = (group) => ({
  ...group,
  vendorId: String(group?.vendorId || ''),
  items: Array.isArray(group?.items) ? group.items.map(normalizeOrderItem) : [],
});

const normalizeOrder = (order) => {
  const id = order?.id || order?.orderId || order?._id;
  return {
    ...order,
    id,
    date: order?.date || order?.createdAt || new Date().toISOString(),
    userId: order?.userId || null,
    items: Array.isArray(order?.items) ? order.items.map(normalizeOrderItem) : [],
    vendorItems: Array.isArray(order?.vendorItems)
      ? order.vendorItems.map(normalizeVendorGroup)
      : [],
  };
};

const normalizePublicTrackingOrder = (order) =>
  normalizeOrder({
    ...order,
    id: order?.orderId || order?._id,
    date: order?.createdAt || order?.date,
    items: [],
    vendorItems: [],
  });

const buildIdempotencyKey = (payload, userId = null) => {
  const base = JSON.stringify({
    userId: userId || null,
    items: payload?.items || [],
    shippingAddress: payload?.shippingAddress || {},
    paymentMethod: payload?.paymentMethod || "",
    couponCode: payload?.couponCode || "",
    shippingOption: payload?.shippingOption || "standard",
  });

  let hash = 0;
  for (let i = 0; i < base.length; i += 1) {
    hash = (hash << 5) - hash + base.charCodeAt(i);
    hash |= 0;
  }
  const attemptNonce =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  return `ord-${Math.abs(hash)}-${payload?.items?.length || 0}-${attemptNonce}`;
};

export const useOrderStore = create(
  persist(
    (set, get) => ({
      orders: [],
      isLoading: false,
      hasFetched: false,
      lastError: null,
      orderPagination: { total: 0, page: 1, pages: 1, limit: 20 },

      // Create a new order
      createOrder: async (orderData) => {
        const items = Array.isArray(orderData?.items) ? orderData.items : [];
        if (items.length === 0) {
          throw new Error('Your cart is empty.');
        }

        const hasInvalidProductIds = items.some((item) => !isMongoId(item?.id));
        if (hasInvalidProductIds) {
          throw new Error('Some cart items are outdated. Please refresh your cart and try again.');
        }

        set({ isLoading: true, lastError: null });
        try {
          // Only sent for Quick Commerce; the server ignores it otherwise.
          const locationParams = getLocationQueryParams();
          const customerLocation =
            getExperience() === EXPERIENCES.QUICK_COMMERCE
            && Number.isFinite(locationParams.lat)
            && Number.isFinite(locationParams.lng)
              ? { latitude: locationParams.lat, longitude: locationParams.lng }
              : null;

          const payload = {
            items: orderData.items.map((item) => ({
              productId: item.id,
              quantity: Number(item.quantity || 1),
              price: Number(item.price || 0),
              variant: item.variant || undefined,
            })),
            shippingAddress: orderData.shippingAddress,
            paymentMethod: orderData.paymentMethod,
            couponCode: orderData.couponCode || undefined,
            shippingOption: orderData.shippingOption || 'standard',
            // Quick Commerce orders are validated against the delivery point
            // server-side (serviceability, distance, ETA, delivery fee).
            ...(customerLocation ? { customerLocation } : {}),
          };
          const idempotencyKey = buildIdempotencyKey(payload, orderData.userId);

          const response = await api.post('/user/orders', payload, {
            headers: {
              "x-idempotency-key": idempotencyKey,
            },
          });
          const data = response?.data ?? response;
          const createdOrderId = data?.orderId;

          if (!createdOrderId) {
            throw new Error('Invalid order creation response from server.');
          }

          const createdOrder = await get().fetchOrderById(createdOrderId);
          if (!createdOrder) {
            throw new Error('Order created but could not be fetched. Please check your orders.');
          }

          set({ isLoading: false, lastError: null });
          return createdOrder;
        } catch (error) {
          set({ isLoading: false, lastError: error?.message || 'Failed to place order.' });
          throw error;
        }
      },

      // ── Enterprise Marketplace Checkout (v3 path) ──────────────────────────
      //
      // createCheckoutSession → returns { sessionId, summary, coupon, validationResult }
      // confirmCheckout       → triggers OrderSplitterEngine, returns { orders[] }
      //
      // The legacy createOrder is kept for fallback.

      createCheckoutSession: async ({ items, shippingAddress, paymentMethod, couponCode, customerLocation, shippingOption = 'standard' }) => {
        if (!items?.length) throw new Error('Cart is empty.');
        set({ isLoading: true, lastError: null });
        try {
          const payload = {
            items: items.map((item) => ({
              productId:       item.id || item.productId,
              quantity:        Number(item.quantity || 1),
              price:           Number(item.price || 0),
              variant:         item.variant || undefined,
              vendorId:        item.vendorId,
              vendorName:      item.vendorName,
              fulfillmentType: item.fulfillmentType || 'retail',
              name:            item.name,
              image:           item.image,
            })),
            shippingAddress,
            paymentMethod,
            couponCode:   couponCode   || undefined,
            shippingOption,
            customerLocation: customerLocation || undefined,
          };
          const response = await api.post('/user/checkout/session', payload);
          const data = response?.data ?? response;
          set({ isLoading: false, lastError: null });
          return data; // { sessionId, summary, coupon, validationResult }
        } catch (error) {
          set({ isLoading: false, lastError: error?.message || 'Failed to create checkout session.' });
          throw error;
        }
      },

      confirmCheckout: async ({ sessionId, paymentGatewayRef = null }) => {
        if (!sessionId) throw new Error('sessionId is required.');
        set({ isLoading: true, lastError: null });
        try {
          const response = await api.post('/user/checkout/confirm', { sessionId, paymentGatewayRef });
          const data = response?.data ?? response;
          set({ isLoading: false, lastError: null });
          return data; // { sessionId, orderCount, orders[] }
        } catch (error) {
          set({ isLoading: false, lastError: error?.message || 'Checkout confirmation failed.' });
          throw error;
        }
      },

      fetchUserOrders: async (page = 1, limit = 20) => {
        set({ isLoading: true, lastError: null });
        try {
          const response = await api.get('/user/orders', { params: { page, limit } });
          const payload = response?.data ?? response;
          const list = Array.isArray(payload?.orders)
            ? payload.orders.map(normalizeOrder)
            : [];
          const pagination = {
            total: Number(payload?.total || 0),
            page: Number(payload?.page || page),
            pages: Number(payload?.pages || 1),
            limit: Number(limit),
          };

          set((state) => ({
            orders: page === 1 ? list : [...state.orders, ...list],
            hasFetched: true,
            isLoading: false,
            lastError: null,
            orderPagination: pagination,
          }));

          return { orders: list, pagination };
        } catch (error) {
          set({ isLoading: false, lastError: error?.message || 'Failed to fetch orders.' });
          throw error;
        }
      },

      fetchOrderById: async (orderId) => {
        const existing = get().orders.find((order) => String(order.id) === String(orderId));
        if (existing) return existing;

        try {
          const response = await api.get(`/user/orders/${orderId}`);
          const payload = response?.data ?? response;
          const normalized = normalizeOrder(payload);

          set((state) => ({
            orders: [normalized, ...state.orders.filter((o) => String(o.id) !== String(normalized.id))],
            lastError: null,
          }));

          return normalized;
        } catch (error) {
          set({ lastError: error?.message || 'Failed to fetch order.' });
          return null;
        }
      },

      fetchPublicTrackingOrder: async (orderId) => {
        const existing = get().orders.find((order) => String(order.id) === String(orderId));
        if (existing) return existing;

        try {
          const response = await api.get(`/orders/track/${orderId}`);
          const payload = response?.data ?? response;
          const normalized = normalizePublicTrackingOrder(payload);

          set((state) => ({
            orders: [normalized, ...state.orders.filter((o) => String(o.id) !== String(normalized.id))],
            lastError: null,
          }));

          return normalized;
        } catch (error) {
          set({ lastError: error?.message || 'Failed to track order.' });
          return null;
        }
      },

      ensureHydrated: () => {
        const state = get();
        if (!state.hasFetched && !state.isLoading) {
          state.fetchUserOrders(1, 30).catch(() => null);
        }
      },

      // Get a single order by ID
      getOrder: (orderId) => {
        get().ensureHydrated();
        const state = get();
        return state.orders.find((order) => String(order.id) === String(orderId));
      },

      // Get all orders for a user (or guest orders if userId is null)
      getAllOrders: (userId = null) => {
        get().ensureHydrated();
        const state = get();
        if (userId === null) {
          return state.orders.filter((order) => order.userId === null || order.userId === undefined);
        }
        return state.orders.filter((order) => String(order.userId) === String(userId));
      },

      // Get orders for a specific vendor
      getVendorOrders: (vendorId) => {
        const state = get();
        return state.orders.filter((order) => {
          if (!order.vendorItems) return false;
          return order.vendorItems.some(
            (vi) => String(vi.vendorId) === String(vendorId) || Number(vi.vendorId) === Number(vendorId)
          );
        });
      },

      // Get order items for a specific vendor from an order
      getVendorOrderItems: (orderId, vendorId) => {
        const order = get().getOrder(orderId);
        if (!order || !order.vendorItems) return null;

        const vendorItem = order.vendorItems.find(
          (vi) => String(vi.vendorId) === String(vendorId) || Number(vi.vendorId) === Number(vendorId)
        );
        return vendorItem || null;
      },

      // Update order status locally (used by non-user modules)
      updateOrderStatus: (orderId, newStatus) => {
        set((state) => ({
          orders: state.orders.map((order) =>
            String(order.id) === String(orderId) ? { ...order, status: newStatus } : order
          ),
        }));
      },

      // Cancel an order
      cancelOrder: async (orderId, reason = 'Cancelled by customer') => {
        const order = get().getOrder(orderId);
        if (!order) return false;

        try {
          await api.patch(`/user/orders/${orderId}/cancel`, { reason });
        } catch (error) {
          throw error;
        }

        set((state) => ({
          orders: state.orders.map((o) =>
            String(o.id) === String(orderId)
              ? { ...o, status: 'cancelled', cancelledAt: new Date().toISOString() }
              : o
          ),
        }));

        return true;
      },

      requestReturn: async (orderId, payload = {}) => {
        const body = {
          reason: String(payload?.reason || '').trim(),
          ...(payload?.vendorId ? { vendorId: payload.vendorId } : {}),
          ...(Array.isArray(payload?.items) ? { items: payload.items } : {}),
          ...(Array.isArray(payload?.images) ? { images: payload.images } : {}),
        };

        const response = await api.post(`/user/orders/${orderId}/returns`, body);
        const data = response?.data ?? response;
        return data;
      },

      fetchUserReturns: async (page = 1, limit = 20, status = 'all') => {
        const response = await api.get('/user/returns', { params: { page, limit, status } });
        const payload = response?.data ?? response;
        return payload?.returnRequests || [];
      },

      resetOrders: () => {
        set({
          orders: [],
          hasFetched: false,
          lastError: null,
          orderPagination: { total: 0, page: 1, pages: 1, limit: 20 },
        });
      },
    }),
    {
      name: 'order-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

