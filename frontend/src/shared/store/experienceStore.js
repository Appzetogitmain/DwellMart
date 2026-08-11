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
import { useCartStore } from "./useStore";

/**
 * Shopping experience + Quick Commerce location state.
 *
 * Wraps the framework-free `utils/experience` helpers so React can react to
 * changes, while `api.js` keeps reading the same localStorage values directly.
 * Switching experience never clears the other experience's cart.
 */
// ── Dev Testing: Force Indore test location ──────────────────────────────────
export const useExperienceStore = create((set, get) => ({
  experience: getExperience(),
  location: getCustomerLocation(),
  serviceability: null,
  isCheckingServiceability: false,

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

  isQuickCommerce: () => get().experience === EXPERIENCES.QUICK_COMMERCE,
  hasLocation: () => Object.keys(getLocationQueryParams(get().location)).length > 0,
}));
