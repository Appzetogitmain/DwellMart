import { create } from "zustand";
import {
  EXPERIENCES,
  getExperience,
  setExperience as persistExperience,
  getCustomerLocation,
  setCustomerLocation as persistLocation,
  getLocationQueryParams,
} from "../utils/experience";
import {
  getQuickCommerceServiceability,
} from "../services/quickCommerceService";
import { reverseGeocode } from "../maps/googleMaps";
import { useCartStore } from "./useStore";

/**
 * Shopping experience + Quick Commerce location state.
 *
 * Wraps the framework-free `utils/experience` helpers so React can react to
 * changes, while `api.js` keeps reading the same localStorage values directly.
 * Switching experience never clears the other experience's cart.
 */
export const useExperienceStore = create((set, get) => ({
  experience: getExperience(),
  location: getCustomerLocation(),
  serviceability: null,
  isCheckingServiceability: false,
  isLocating: false,
  locationPermission: "unknown", // 'unknown' | 'granted' | 'prompt' | 'denied' | 'unsupported'

  setExperience: (experience) => {
    const normalized = persistExperience(experience);
    set({ experience: normalized });
    // Swap the active basket. Each experience keeps its own, so neither is lost.
    useCartStore.getState().switchCartExperience(normalized);
    return normalized;
  },

  /**
   * Persist a customer location and immediately re-check serviceability.
   * @param {object} location { latitude, longitude, pincode, label, source }
   */
  setLocation: async (location) => {
    persistLocation(location);
    set({ location });
    return get().checkServiceability(location);
  },

  clearLocation: () => {
    persistLocation(null);
    set({ location: null, serviceability: null });
  },

  /**
   * Ask the server whether Quick Commerce reaches this location.
   * The server is authoritative — the client never decides serviceability.
   */
  checkServiceability: async (location = get().location) => {
    const params = getLocationQueryParams(location);
    if (Object.keys(params).length === 0) {
      set({ serviceability: null });
      return null;
    }

    set({ isCheckingServiceability: true });
    try {
      const response = await getQuickCommerceServiceability(params);
      const data = response?.data ?? response;
      set({ serviceability: data, isCheckingServiceability: false });
      return data;
    } catch {
      // A failed check must not masquerade as "not serviceable".
      set({ serviceability: null, isCheckingServiceability: false });
      return null;
    }
  },

  /**
   * Automatically detect live location using browser geolocation.
   * Supports silent background resolution (if permission granted) or interactive prompt.
   *
   * @param {object} options
   * @param {boolean} [options.silentOnly=false] - Only run if permission is already 'granted'
   * @param {number} [options.timeout=10000] - Geolocation timeout in ms
   * @param {string} [options.fallbackLabel="Current location"] - Default label if reverse geocode fails
   */
  detectLiveLocation: async (options = {}) => {
    const {
      silentOnly = false,
      timeout = 10000,
      fallbackLabel = "Current location",
    } = options;

    if (typeof window === "undefined" || !navigator.geolocation) {
      set({ locationPermission: "unsupported" });
      return { success: false, error: "Geolocation is not supported by this browser." };
    }

    // Check permission state where available
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const permissionStatus = await navigator.permissions.query({ name: "geolocation" });
        set({ locationPermission: permissionStatus.state });

        if (silentOnly && permissionStatus.state !== "granted") {
          return { success: false, skipped: true, state: permissionStatus.state };
        }
      } catch {
        // Some browsers do not support querying geolocation permissions
        if (silentOnly) {
          return { success: false, skipped: true, state: "unknown" };
        }
      }
    } else if (silentOnly) {
      // If permissions.query is unavailable and silentOnly is requested,
      // we only proceed if we already have a saved location to avoid sudden popups
      const currentLocation = get().location;
      if (!currentLocation) {
        return { success: false, skipped: true, state: "unknown" };
      }
    }

    set({ isLocating: true });

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const latitude = Number(position.coords.latitude.toFixed(6));
          const longitude = Number(position.coords.longitude.toFixed(6));
          const accuracy = position.coords.accuracy;

          let geoData = null;
          let label = fallbackLabel;

          try {
            geoData = await reverseGeocode({ latitude, longitude });
            if (geoData?.formattedAddress) {
              label = geoData.formattedAddress;
            } else if (geoData?.city) {
              label = [geoData.address, geoData.city].filter(Boolean).join(", ");
            }
          } catch {
            // Keep fallback label if reverse geocoding is unavailable
          }

          const locationData = {
            latitude,
            longitude,
            pincode: geoData?.zipCode || undefined,
            city: geoData?.city || undefined,
            state: geoData?.state || undefined,
            label,
            source: "gps",
            accuracy,
            updatedAt: Date.now(),
          };

          await get().setLocation(locationData);
          set({
            isLocating: false,
            locationPermission: "granted",
          });

          resolve({ success: true, location: locationData });
        },
        (error) => {
          set({
            isLocating: false,
            locationPermission: error.code === 1 ? "denied" : get().locationPermission,
          });
          resolve({
            success: false,
            error: error.message,
            code: error.code,
            isDenied: error.code === 1,
          });
        },
        {
          enableHighAccuracy: true,
          timeout,
          maximumAge: 60000,
        }
      );
    });
  },

  isQuickCommerce: () => get().experience === EXPERIENCES.QUICK_COMMERCE,
  hasLocation: () => Object.keys(getLocationQueryParams(get().location)).length > 0,
}));
