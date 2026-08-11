import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "./googleMaps";

const textFor = (components, types) => {
  const item = components?.find((component) => types.some((type) => component.types?.includes(type)));
  return item?.longText || item?.long_name || "";
};

const pointFor = (location) => {
  if (!location) return null;
  const latitude = typeof location.lat === "function" ? location.lat() : location.lat;
  const longitude = typeof location.lng === "function" ? location.lng() : location.lng;
  return Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
    ? { latitude: Number(latitude), longitude: Number(longitude) }
    : null;
};

const addressFor = (place) => {
  const components = place.addressComponents || [];
  const street = [
    textFor(components, ["street_number"]),
    textFor(components, ["route"]),
  ].filter(Boolean).join(" ");
  return {
    address: street || place.formattedAddress || "",
    city: textFor(components, ["locality", "postal_town", "administrative_area_level_3", "administrative_area_level_2"]),
    state: textFor(components, ["administrative_area_level_1"]),
    zipCode: textFor(components, ["postal_code"]),
    country: textFor(components, ["country"]),
    formattedAddress: place.formattedAddress || "",
    location: pointFor(place.location),
  };
};

/**
 * Google's accessible Places (New) widget. It owns prediction UI/attribution,
 * while the surrounding checkout form remains a normal manual-address form.
 */
const PlaceAutocompleteInput = ({ onSelect, placeholder = "Search your address", className = "" }) => {
  const hostRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const [status, setStatus] = useState("loading");
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    let autocomplete;
    const selectHandler = async (event) => {
      try {
        const place = event.placePrediction?.toPlace?.();
        if (!place) return;
        await place.fetchFields({
          fields: ["formattedAddress", "addressComponents", "location"],
        });
        const address = addressFor(place);
        if (!address.location) throw new Error("The selected place has no location.");
        onSelectRef.current?.(address);
      } catch {
        // The checkout's manual fields remain available if a place detail fails.
      }
    };

    (async () => {
      try {
        const maps = await loadGoogleMaps();
        const { PlaceAutocompleteElement } = await maps.importLibrary("places");
        if (cancelled || !hostRef.current) return;
        autocomplete = new PlaceAutocompleteElement();
        autocomplete.placeholder = placeholder;
        autocomplete.includedRegionCodes = ["in"];
        autocomplete.style.display = "block";
        autocomplete.style.width = "100%";
        // Google's component lives in a Shadow DOM and otherwise follows the
        // browser's dark-mode preference rather than Dwell Mart's light UI.
        autocomplete.style.colorScheme = "light";
        autocomplete.addEventListener("gmp-select", selectHandler);
        hostRef.current.appendChild(autocomplete);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    })();

    return () => {
      cancelled = true;
      autocomplete?.removeEventListener?.("gmp-select", selectHandler);
      autocomplete?.remove?.();
    };
  }, [placeholder]);

  if (status === "unavailable") return null;
  return (
    <div className={className}>
      <div ref={hostRef} className="min-h-11 rounded-xl border-2 border-border bg-surface px-1 text-content" style={{ colorScheme: "light" }} />
      {status === "loading" && <p className="mt-1 text-xs text-content-muted">Loading address search…</p>}
    </div>
  );
};

export default PlaceAutocompleteInput;
