import { useEffect, useState, useCallback } from "react";
import api from "../utils/api";
import {
  connectSocket,
  joinOrderTrackingRoom,
  leaveOrderTrackingRoom,
} from "../services/socketService";

/**
 * Live order tracking for the customer.
 *
 * Fetches the authoritative snapshot once, then keeps it current from the
 * order's socket room (`rider_location`, `quick_commerce_status`,
 * `rider_assigned`). The snapshot is what makes this correct on load and after
 * a reconnect; the socket is what makes it live.
 *
 * Marketplace orders work too — they simply have no Quick Commerce status and
 * usually no live rider position.
 *
 * @param {string} orderId Human order id or ObjectId; the API accepts either.
 */
export const useOrderTracking = (orderId) => {
  const [tracking, setTracking] = useState(null);
  const [riderPosition, setRiderPosition] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(orderId));
  const [error, setError] = useState(null);

  const fetchTracking = useCallback(async () => {
    if (!orderId) return null;
    try {
      const response = await api.get(`/user/orders/${orderId}/tracking`);
      const payload = response?.data ?? response;
      setTracking(payload || null);
      if (Number.isFinite(payload?.rider?.latitude) && Number.isFinite(payload?.rider?.longitude)) {
        setRiderPosition({
          latitude: payload.rider.latitude,
          longitude: payload.rider.longitude,
          at: payload.rider.lastLocationAt || null,
        });
      }
      setError(null);
      return payload;
    } catch (err) {
      setError(err?.message || "Unable to load tracking.");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return undefined;

    let cancelled = false;
    let joinedRoom = null;

    const start = async () => {
      const snapshot = await fetchTracking();
      if (cancelled || !snapshot?.orderRefId) return;

      const socket = connectSocket();
      if (!socket) return;

      const granted = await joinOrderTrackingRoom(snapshot.orderRefId);
      if (cancelled || !granted) return;
      joinedRoom = snapshot.orderRefId;

      socket.on("rider_location", handleRiderLocation);
      socket.on("quick_commerce_status", handleStatus);
      socket.on("rider_assigned", handleRiderAssigned);
    };

    const handleRiderLocation = (payload) => {
      if (cancelled) return;
      setRiderPosition({
        latitude: payload?.latitude,
        longitude: payload?.longitude,
        at: payload?.at || null,
      });
    };

    const handleStatus = (payload) => {
      if (cancelled) return;
      setTracking((prev) =>
        prev
          ? {
            ...prev,
            quickCommerceStatus: payload?.status ?? prev.quickCommerceStatus,
            status: payload?.orderStatus ?? prev.status,
          }
          : prev
      );
    };

    // A rider appearing mid-session changes more than one field, so re-read the
    // snapshot rather than patching it piecemeal.
    const handleRiderAssigned = () => {
      if (!cancelled) fetchTracking();
    };

    start();

    return () => {
      cancelled = true;
      const socket = connectSocket();
      if (socket) {
        socket.off("rider_location", handleRiderLocation);
        socket.off("quick_commerce_status", handleStatus);
        socket.off("rider_assigned", handleRiderAssigned);
      }
      if (joinedRoom) leaveOrderTrackingRoom(joinedRoom);
    };
  }, [orderId, fetchTracking]);

  return { tracking, riderPosition, isLoading, error, refresh: fetchTracking };
};

export default useOrderTracking;
