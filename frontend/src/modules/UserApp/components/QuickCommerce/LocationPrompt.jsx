import { useState } from "react";
import { FiMapPin, FiCrosshair, FiX } from "react-icons/fi";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { useExperienceStore } from "../../../../shared/store/experienceStore";
import { useAddressStore } from "../../../../shared/store/addressStore";

/**
 * Quick Commerce location capture.
 *
 * Quick Commerce is unusable without a customer location, so this offers a
 * cascade rather than a single method — a meaningful share of users deny GPS,
 * and a GPS-only design would make the experience unreachable for them:
 *
 *   1. Browser geolocation (most accurate)
 *   2. A saved delivery address that already has coordinates
 *   3. Manual pincode (the fallback that keeps QC reachable)
 */
const LocationPrompt = ({ onClose, showClose = true }) => {
  const { setLocation, isCheckingServiceability } = useExperienceStore();
  const { addresses } = useAddressStore();
  const [pincode, setPincode] = useState("");
  const [isLocating, setIsLocating] = useState(false);

  const savedWithCoordinates = (addresses || []).filter(
    (address) => Number.isFinite(Number(address?.latitude)) && Number.isFinite(Number(address?.longitude))
  );
  const savedWithPincode = (addresses || []).filter(
    (address) => address?.zipCode || address?.pincode
  );

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      toast.error("Your browser does not support location access. Enter a pincode instead.");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setIsLocating(false);
        await setLocation({
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
          label: "Current location",
          source: "gps",
        });
        onClose?.();
      },
      () => {
        setIsLocating(false);
        toast.error("Could not read your location. Try a saved address or enter a pincode.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleUseSavedAddress = async (address) => {
    const latitude = Number(address?.latitude);
    const longitude = Number(address?.longitude);
    const code = address?.zipCode || address?.pincode;

    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      await setLocation({
        latitude,
        longitude,
        pincode: code || undefined,
        label: address?.label || address?.street || "Saved address",
        source: "address",
      });
    } else if (code) {
      await setLocation({
        pincode: String(code).trim(),
        label: address?.label || address?.street || "Saved address",
        source: "pincode",
      });
    } else {
      toast.error("That address has no location details.");
      return;
    }
    onClose?.();
  };

  const handleUsePincode = async (e) => {
    e.preventDefault();
    const code = pincode.trim();
    if (!code) {
      toast.error("Please enter a pincode.");
      return;
    }
    await setLocation({ pincode: code, label: `Pincode ${code}`, source: "pincode" });
    onClose?.();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface rounded-2xl border border-border p-4 sm:p-6"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-content">Where should we deliver?</h2>
          <p className="text-sm text-content-secondary">
            We use your location to show stores that can reach you in minutes.
          </p>
        </div>
        {showClose && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-full hover:bg-surface-muted text-content-secondary"
          >
            <FiX />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={handleUseGps}
        disabled={isLocating || isCheckingServiceability}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-primary text-content-inverse font-semibold py-3 disabled:opacity-50"
      >
        <FiCrosshair />
        {isLocating ? "Getting your location..." : "Use my current location"}
      </button>

      {savedWithCoordinates.length + savedWithPincode.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-content-secondary mb-2">Saved addresses</p>
          <div className="space-y-2">
            {(savedWithCoordinates.length ? savedWithCoordinates : savedWithPincode)
              .slice(0, 3)
              .map((address) => (
                <button
                  key={address._id || address.id}
                  type="button"
                  onClick={() => handleUseSavedAddress(address)}
                  className="w-full text-left flex items-start gap-2 p-3 rounded-xl border border-border hover:bg-surface-muted"
                >
                  <FiMapPin className="text-content-muted mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-content">
                    {address.label ? `${address.label} — ` : ""}
                    {[address.street, address.city, address.zipCode].filter(Boolean).join(", ")}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}

      <form onSubmit={handleUsePincode} className="mt-4">
        <label className="block text-xs font-semibold text-content-secondary mb-2">
          Or enter your pincode
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={pincode}
            onChange={(e) => setPincode(e.target.value)}
            placeholder="560001"
            className="flex-1 px-4 py-3 rounded-xl border border-border bg-surface-input text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
          />
          <button
            type="submit"
            disabled={isCheckingServiceability}
            className="px-4 py-3 rounded-xl border border-border font-semibold text-content hover:bg-surface-muted disabled:opacity-50"
          >
            Check
          </button>
        </div>
      </form>
    </motion.div>
  );
};

export default LocationPrompt;
