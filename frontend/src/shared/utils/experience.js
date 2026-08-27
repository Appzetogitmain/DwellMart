/**
 * Shopping experience + Quick Commerce location state.
 *
 * Deliberately framework-free and localStorage-backed so `api.js` can read the
 * active experience when building request headers without importing a store
 * (which would create a circular dependency, since stores import `api.js`).
 */

export const EXPERIENCES = {
  MARKETPLACE: "marketplace",
  QUICK_COMMERCE: "quick_commerce",
  WHOLESALE: "wholesale",
};

export const EXPERIENCE_VALUES = Object.values(EXPERIENCES);

const EXPERIENCE_KEY = "dwellmart-experience";
const LOCATION_KEY = "dwellmart-qc-location";

const safeRead = (key) => {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
};

const safeWrite = (key, value) => {
  try {
    if (typeof window === "undefined") return;
    if (value === null || value === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode, quota) — never block the UI.
  }
};

export const normalizeExperience = (raw) => {
  const value = String(raw ?? "").trim().toLowerCase();
  return EXPERIENCE_VALUES.includes(value) ? value : EXPERIENCES.MARKETPLACE;
};

/** Active experience. Defaults to marketplace, matching the server default. */
export const getExperience = () => normalizeExperience(safeRead(EXPERIENCE_KEY));

export const setExperience = (experience) => {
  const normalized = normalizeExperience(experience);
  safeWrite(EXPERIENCE_KEY, normalized);
  return normalized;
};

export const isQuickCommerce = () => getExperience() === EXPERIENCES.QUICK_COMMERCE;

/**
 * Customer location for Quick Commerce serviceability.
 * Shape: { latitude, longitude, pincode, label, source }
 * `source` is one of: 'gps' | 'address' | 'pincode' | 'manual'
 */
export const getCustomerLocation = () => {
  const raw = safeRead(LOCATION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

export const setCustomerLocation = (location) => {
  if (!location) {
    safeWrite(LOCATION_KEY, null);
    return null;
  }
  safeWrite(LOCATION_KEY, JSON.stringify(location));
  return location;
};

/**
 * Location hint as API query params.
 * Coordinates win; pincode is the fallback when GPS was denied.
 */
export const getLocationQueryParams = (location = getCustomerLocation()) => {
  if (!location) return {};
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return { lat: latitude, lng: longitude };
  }
  if (location.pincode) return { pincode: String(location.pincode).trim() };
  return {};
};

export const hasLocation = () => Object.keys(getLocationQueryParams()).length > 0;
