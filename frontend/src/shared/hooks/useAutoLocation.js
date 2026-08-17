import { useEffect, useRef } from "react";
import { useExperienceStore } from "../store/experienceStore";
import { useAddressStore } from "../store/addressStore";

/**
 * Custom hook to automatically detect and synchronize live customer location.
 *
 * @param {object} options
 * @param {boolean} [options.silentOnly=false] - If true, only fetches when permission is already 'granted'
 * @param {boolean} [options.autoPromptIfUnknown=false] - If true and location is missing, requests browser location
 * @param {boolean} [options.fallbackToSavedAddress=true] - If GPS is denied, falls back to default saved address
 */
export const useAutoLocation = (options = {}) => {
  const {
    silentOnly = false,
    autoPromptIfUnknown = false,
    fallbackToSavedAddress = true,
  } = options;

  const { location, isLocating, detectLiveLocation, setLocation } = useExperienceStore();
  const { addresses, getDefaultAddress } = useAddressStore();
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) return;
    if (attemptedRef.current || isLocating) return;

    let isMounted = true;

    const performAutoDetection = async () => {
      attemptedRef.current = true;

      // If we already have a location and silentOnly is requested, do a quiet refresh if permission is granted
      const result = await detectLiveLocation({
        silentOnly: silentOnly && !autoPromptIfUnknown,
        timeout: 10000,
      });

      if (!isMounted) return;

      // If detection failed or was denied, and we have no location set, check for saved address fallback
      if ((!result.success || result.isDenied) && !location && fallbackToSavedAddress) {
        const defaultAddr = getDefaultAddress() || (addresses && addresses[0]);
        if (defaultAddr) {
          const lat = Number(defaultAddr.latitude);
          const lng = Number(defaultAddr.longitude);
          const pincode = defaultAddr.zipCode || defaultAddr.pincode;

          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            await setLocation({
              latitude: lat,
              longitude: lng,
              pincode: pincode || undefined,
              city: defaultAddr.city || undefined,
              label: defaultAddr.address || defaultAddr.fullName || "Default Address",
              source: "address",
            });
          } else if (pincode) {
            await setLocation({
              pincode: String(pincode).trim(),
              city: defaultAddr.city || undefined,
              label: `Pincode ${pincode}`,
              source: "pincode",
            });
          }
        }
      }
    };

    // Watch for permission changes in real time
    let permissionStatusObj = null;
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((status) => {
          if (!isMounted) return;
          permissionStatusObj = status;
          status.onchange = () => {
            if (status.state === "granted") {
              detectLiveLocation({ silentOnly: false });
            }
          };

          if (status.state === "granted") {
            performAutoDetection();
          } else if (autoPromptIfUnknown && !location) {
            performAutoDetection();
          } else if (silentOnly && status.state === "prompt") {
            // Do not disturb user on generic entry if permission is not granted
          }
        })
        .catch(() => {
          if (autoPromptIfUnknown && !location) {
            performAutoDetection();
          }
        });
    } else {
      // Fallback for browsers without permissions.query
      if (autoPromptIfUnknown && !location) {
        performAutoDetection();
      }
    }

    return () => {
      isMounted = false;
      if (permissionStatusObj) {
        permissionStatusObj.onchange = null;
      }
    };
  }, [
    silentOnly,
    autoPromptIfUnknown,
    fallbackToSavedAddress,
    location,
    isLocating,
    detectLiveLocation,
    setLocation,
    getDefaultAddress,
    addresses,
  ]);
};

export default useAutoLocation;
