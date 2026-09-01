let loaderPromise;

/**
 * Loads Google Maps only on pages that need a map. The browser key is expected
 * to be referrer-restricted; without it callers render their normal fallback.
 */
export const loadGoogleMaps = () => {
  const key = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY;
  if (!key || typeof window === "undefined") return Promise.reject(new Error("Google Maps is not configured."));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve, reject) => {
    const callbackName = "__dwellMartGoogleMapsReady";
    const cleanUp = () => {
      delete window[callbackName];
    };
    const ready = () => {
      cleanUp();
      if (window.google?.maps) resolve(window.google.maps);
      else reject(new Error("Google Maps did not initialise."));
    };
    const existing = document.querySelector('script[data-dwellmart-google-maps="true"]');
    if (existing) {
      window[callbackName] = ready;
      existing.addEventListener("load", ready, { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps could not be loaded.")));
      return;
    }

    window[callbackName] = ready;
    const script = document.createElement("script");
    script.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(key)
      + "&v=weekly&loading=async&callback=" + callbackName;
    script.async = true;
    script.defer = true;
    script.dataset.dwellmartGoogleMaps = "true";
    script.onerror = () => {
      cleanUp();
      reject(new Error("Google Maps could not be loaded."));
    };
    document.head.appendChild(script);
  });

  return loaderPromise;
};

export const hasGoogleMapsKey = () => Boolean(import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY);

const componentText = (components, types) => {
  const match = components?.find((component) => types.some((type) => component.types?.includes(type)));
  return match?.long_name || "";
};

/**
 * Converts a user-selected coordinate to editable address fields. It is kept
 * client-side so the browser key remains referrer-restricted and no server
 * secret is exposed.
 */
export const reverseGeocode = async ({ latitude, longitude }) => {
  const maps = await loadGoogleMaps();
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("Invalid coordinates.");

  const { Geocoder } = await maps.importLibrary("geocoding");
  const response = await new Geocoder().geocode({ location: { lat, lng } });
  const result = response?.results?.[0];
  if (!result) throw new Error("No address was found for this location.");

  const components = result.address_components || [];
  const premise = componentText(components, ["premise", "subpremise"]);
  const streetParts = [
    componentText(components, ["street_number"]),
    componentText(components, ["route"]),
  ].filter(Boolean).join(" ");
  const sublocality = componentText(components, ["sublocality_level_2", "sublocality_level_1", "sublocality", "neighborhood"]);

  const street = [premise, streetParts, sublocality].filter(Boolean).join(", ") || streetParts || result.formatted_address || "";

  return {
    address: street,
    city: componentText(components, ["locality", "postal_town", "administrative_area_level_3", "administrative_area_level_2"]),
    state: componentText(components, ["administrative_area_level_1"]),
    zipCode: componentText(components, ["postal_code"]),
    country: componentText(components, ["country"]),
    formattedAddress: result.formatted_address || "",
  };
};
