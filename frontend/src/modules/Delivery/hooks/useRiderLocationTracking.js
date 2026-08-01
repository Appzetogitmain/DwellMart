import { useEffect, useRef, useState } from "react";
import { updateRiderLocation } from "../services/riderTrackingService";

/**
 * Stream the rider's position to the server while they are carrying an order.
 *
 * Pings on an interval rather than on every `watchPosition` fire: GPS can emit
 * several times a second, which would be a request storm for a position that
 * has barely changed. The watcher keeps the latest fix in a ref; the interval
 * decides when to send it.
 *
 * Tracking only runs when `enabled` is true — a rider with no active order has
 * no reason to be broadcasting their location, and continuous background
 * geolocation is exactly the kind of thing that should stop when it stops being
 * needed.
 *
 * @param {boolean} enabled       Usually "this rider has an active order".
 * @param {number}  intervalMs    How often to report. Defaults to 15s.
 */
export const useRiderLocationTracking = (enabled, intervalMs = 15000) => {
  const latestPosition = useRef(null);
  const [lastSentAt, setLastSentAt] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Location is not available on this device.");
      return undefined;
    }

    setError(null);

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        latestPosition.current = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setError(null);
      },
      (geoError) => {
        setError(
          geoError?.code === 1
            ? "Location permission denied. Customers cannot track this delivery."
            : "Unable to read your location."
        );
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );

    let cancelled = false;
    const send = async () => {
      const position = latestPosition.current;
      if (!position) return;
      try {
        await updateRiderLocation(position);
        if (!cancelled) setLastSentAt(new Date());
      } catch {
        // A dropped ping self-corrects on the next interval.
      }
    };

    // Send the first fix as soon as one arrives rather than waiting a full
    // interval, so the customer's map is not blank for 15 seconds.
    const primer = setInterval(() => {
      if (latestPosition.current) {
        clearInterval(primer);
        send();
      }
    }, 1000);

    const timer = setInterval(send, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(primer);
      clearInterval(timer);
      navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled, intervalMs]);

  return { lastSentAt, error };
};

export default useRiderLocationTracking;
