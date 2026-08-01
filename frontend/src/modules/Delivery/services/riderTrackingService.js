import api from "../../../shared/utils/api";

/**
 * Rider-side Quick Commerce delivery API.
 *
 * Location reporting is deliberately fire-and-forget at the call site: a
 * dropped ping is not an error a rider should be shown mid-ride, it just means
 * the next ping carries the position instead.
 */

/** Report the rider's current position. Server dual-writes both location shapes. */
export const updateRiderLocation = ({ latitude, longitude }) =>
  api.patch("/delivery/location", { latitude, longitude });

/** The order this rider is currently carrying, or null. */
export const getActiveOrder = () => api.get("/delivery/active-order");

/** Quick Commerce transitions: picked_up → arriving → delivered (OTP on delivered). */
export const updateQuickCommerceStatus = (orderId, { status, otp } = {}) =>
  api.patch(`/delivery/orders/${orderId}/quick-status`, {
    status,
    ...(otp ? { otp } : {}),
  });
