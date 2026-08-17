import { useState } from "react";
import { FiMapPin, FiCrosshair, FiX } from "react-icons/fi";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { useExperienceStore } from "../../../../shared/store/experienceStore";
import { useAddressStore } from "../../../../shared/store/addressStore";
import { Button, Input, Card } from "../../../../shared/components/ui";
import GoogleMapPicker from "../../../../shared/maps/GoogleMapPicker";
import { reverseGeocode } from "../../../../shared/maps/googleMaps";

// Browser geolocation supplies coordinates only. Resolve those coordinates when
// possible, but never prevent a customer from using GPS/map delivery if Maps is
// unavailable or cannot return an address.
const resolveLocationLabel = async (location, fallback) => {
  try {
    const address = await reverseGeocode(location);
    return address.formattedAddress || fallback;
  } catch {
    return fallback;
  }
};

/**
 * Quick Commerce location capture — Refactored to Design System
 */
const LocationPrompt = ({ onClose, showClose = true }) => {
  const { setLocation, isCheckingServiceability, isLocating, detectLiveLocation } = useExperienceStore();
  const { addresses } = useAddressStore();
  const [pincode, setPincode] = useState("");
  const [isUsingMapLocation, setIsUsingMapLocation] = useState(false);
  const [mapPoint, setMapPoint] = useState(null);

  const savedWithCoordinates = (addresses || []).filter(
    (address) => Number.isFinite(Number(address?.latitude)) && Number.isFinite(Number(address?.longitude))
  );
  const savedWithPincode = (addresses || []).filter(
    (address) => address?.zipCode || address?.pincode
  );

  const handleUseGps = async () => {
    const result = await detectLiveLocation({
      silentOnly: false,
      timeout: 10000,
    });

    if (result.success) {
      toast.success("Live location detected!");
      onClose?.();
    } else if (result.isDenied) {
      toast.error("Location permission was denied. Enter a pincode or select a saved address.");
    } else if (!result.skipped) {
      toast.error(result.error || "Could not detect location. Enter a pincode instead.");
    }
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

  const handleUseMapPoint = async () => {
    if (!mapPoint) {
      toast.error("Tap the map to place your delivery pin.");
      return;
    }
    setIsUsingMapLocation(true);
    try {
      await setLocation({
        ...mapPoint,
        label: await resolveLocationLabel(mapPoint, "Map-selected delivery location"),
        source: "map",
      });
      onClose?.();
    } finally {
      setIsUsingMapLocation(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card variant="default" padding="lg" className="border-borderToken-default">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-extrabold text-textColor-primary">Where should we deliver?</h2>
            <p className="text-sm text-textColor-secondary">
              We use your location to show stores that can reach you in minutes.
            </p>
          </div>
          {showClose && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-full hover:bg-borderToken-light text-textColor-secondary transition-colors cursor-pointer"
            >
              <FiX />
            </button>
          )}
        </div>

        <Button
          fullWidth
          variant="primary"
          onClick={handleUseGps}
          isLoading={isLocating || isCheckingServiceability}
          leftIcon={<FiCrosshair />}
          className="font-extrabold"
        >
          {isLocating ? "Getting your location..." : "Use my current location"}
        </Button>

        <div className="mt-4">
          <p className="text-xs font-bold text-textColor-muted uppercase tracking-wider mb-2">Or place an exact pin</p>
          <GoogleMapPicker value={mapPoint} onChange={setMapPoint} height={190} />
          {mapPoint && (
            <Button fullWidth variant="secondary" onClick={handleUseMapPoint} isLoading={isUsingMapLocation || isCheckingServiceability} className="mt-2 font-extrabold">
              Use this map location
            </Button>
          )}
        </div>

        {savedWithCoordinates.length + savedWithPincode.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-bold text-textColor-muted uppercase tracking-wider mb-2">Saved addresses</p>
            <div className="space-y-2">
              {(savedWithCoordinates.length ? savedWithCoordinates : savedWithPincode)
                .slice(0, 3)
                .map((address) => (
                  <button
                    key={address._id || address.id}
                    type="button"
                    onClick={() => handleUseSavedAddress(address)}
                    className="w-full text-left flex items-start gap-2 p-3 rounded-card border border-borderToken-default hover:bg-surface-background transition-all cursor-pointer"
                  >
                    <FiMapPin className="text-textColor-muted mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-textColor-primary font-medium">
                      {address.label ? `${address.label} — ` : ""}
                      {[address.street, address.city, address.zipCode].filter(Boolean).join(", ")}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        )}

        <form onSubmit={handleUsePincode} className="mt-4">
          <label className="block text-xs font-bold text-textColor-muted uppercase tracking-wider mb-2">
            Or enter your pincode
          </label>
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <Input
                inputMode="numeric"
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                placeholder="560001"
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              isLoading={isCheckingServiceability}
              className="font-extrabold px-5"
            >
              Check
            </Button>
          </div>
        </form>
      </Card>
    </motion.div>
  );
};

export default LocationPrompt;
