import { useState, useEffect } from "react";
import { FiSave, FiMapPin, FiCrosshair } from "react-icons/fi";
import toast from "react-hot-toast";
import { updateVendorQuickCommerceSettings } from "../services/vendorService";

const STORE_TYPES = [
  { value: "dark_store", label: "Dark Store" },
  { value: "retail_outlet", label: "Retail Outlet" },
  { value: "restaurant", label: "Restaurant" },
  { value: "pharmacy", label: "Pharmacy" },
];

const AVAILABILITY_STATES = [
  { value: "open", label: "Open", hint: "Accepting orders normally" },
  { value: "busy", label: "Busy", hint: "Accepting orders with a longer ETA" },
  { value: "temporarily_closed", label: "Temporarily Closed", hint: "Visible but not accepting orders" },
  { value: "offline", label: "Offline", hint: "Hidden from customers" },
];

const DAYS = [
  { day: 0, label: "Sunday" },
  { day: 1, label: "Monday" },
  { day: 2, label: "Tuesday" },
  { day: 3, label: "Wednesday" },
  { day: 4, label: "Thursday" },
  { day: 5, label: "Friday" },
  { day: 6, label: "Saturday" },
];

const emptyHours = () =>
  DAYS.map(({ day }) => ({ day, open: "09:00", close: "21:00", isClosed: false }));

/**
 * Quick Commerce operating profile editor.
 *
 * Location is captured as latitude/longitude with a "use my current location"
 * helper rather than an embedded map — the app has no mapping dependency, and
 * adding one is out of scope for this phase.
 */
const QuickCommerceSettingsForm = ({ vendor, onSaved }) => {
  const [form, setForm] = useState({
    storeType: "dark_store",
    latitude: "",
    longitude: "",
    serviceRadiusKm: 5,
    preparationTimeMins: 10,
    availabilityStatus: "open",
    busyExtraMins: 10,
    minOrderValue: 0,
    packagingFee: 0,
    baseFee: "",
    perKmFee: "",
    freeAboveSubtotal: "",
    servicedPincodes: "",
  });
  const [businessHours, setBusinessHours] = useState(emptyHours());
  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    const profile = vendor?.quickCommerceProfile;
    if (!profile) return;

    const coordinates = profile.location?.coordinates;
    setForm({
      storeType: profile.storeType || "dark_store",
      latitude: Array.isArray(coordinates) ? coordinates[1] ?? "" : "",
      longitude: Array.isArray(coordinates) ? coordinates[0] ?? "" : "",
      serviceRadiusKm: profile.serviceRadiusKm ?? 5,
      preparationTimeMins: profile.preparationTimeMins ?? 10,
      availabilityStatus: profile.availabilityStatus || "open",
      busyExtraMins: profile.busyExtraMins ?? 10,
      minOrderValue: profile.minOrderValue ?? 0,
      packagingFee: profile.packagingFee ?? 0,
      baseFee: profile.baseFee ?? "",
      perKmFee: profile.perKmFee ?? "",
      freeAboveSubtotal: profile.freeAboveSubtotal ?? "",
      servicedPincodes: Array.isArray(profile.servicedPincodes)
        ? profile.servicedPincodes.join(", ")
        : "",
    });

    if (Array.isArray(profile.businessHours) && profile.businessHours.length > 0) {
      const byDay = new Map(profile.businessHours.map((entry) => [Number(entry.day), entry]));
      setBusinessHours(
        DAYS.map(({ day }) => ({
          day,
          open: byDay.get(day)?.open || "09:00",
          close: byDay.get(day)?.close || "21:00",
          isClosed: byDay.get(day)?.isClosed === true,
        }))
      );
    }
  }, [vendor]);

  const setField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

  const setDayField = (day, field, value) =>
    setBusinessHours((prev) =>
      prev.map((entry) => (entry.day === day ? { ...entry, [field]: value } : entry))
    );

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Your browser does not support location access.");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setField("latitude", Number(position.coords.latitude.toFixed(6)));
        setField("longitude", Number(position.coords.longitude.toFixed(6)));
        setIsLocating(false);
        toast.success("Location captured. Confirm it matches your store address.");
      },
      () => {
        setIsLocating(false);
        toast.error("Could not read your location. Enter coordinates manually.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const hasLat = form.latitude !== "" && form.latitude !== null;
    const hasLng = form.longitude !== "" && form.longitude !== null;
    if (hasLat !== hasLng) {
      toast.error("Latitude and longitude must be provided together.");
      return;
    }
    if (hasLat) {
      const lat = Number(form.latitude);
      const lng = Number(form.longitude);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        toast.error("Latitude must be between -90 and 90.");
        return;
      }
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        toast.error("Longitude must be between -180 and 180.");
        return;
      }
    }

    const payload = {
      storeType: form.storeType,
      serviceRadiusKm: Number(form.serviceRadiusKm),
      preparationTimeMins: parseInt(form.preparationTimeMins, 10),
      availabilityStatus: form.availabilityStatus,
      busyExtraMins: parseInt(form.busyExtraMins, 10),
      minOrderValue: Number(form.minOrderValue) || 0,
      packagingFee: Number(form.packagingFee) || 0,
      ...(form.baseFee !== "" && form.baseFee !== null ? { baseFee: Number(form.baseFee) } : {}),
      ...(form.perKmFee !== "" && form.perKmFee !== null ? { perKmFee: Number(form.perKmFee) } : {}),
      ...(form.freeAboveSubtotal !== "" && form.freeAboveSubtotal !== null ? { freeAboveSubtotal: Number(form.freeAboveSubtotal) } : {}),
      businessHours: businessHours.map((entry) => ({
        day: entry.day,
        open: entry.open,
        close: entry.close,
        isClosed: entry.isClosed,
      })),
      servicedPincodes: String(form.servicedPincodes || "")
        .split(",")
        .map((code) => code.trim())
        .filter(Boolean),
      ...(hasLat ? { latitude: Number(form.latitude), longitude: Number(form.longitude) } : {}),
    };

    setIsSaving(true);
    try {
      const response = await updateVendorQuickCommerceSettings(payload);
      toast.success("Quick Commerce settings updated");
      onSaved?.(response?.data ?? response);
    } catch {
      // api.js surfaces the error toast
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass =
    "w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Availability */}
      <div>
        <h4 className="text-sm font-bold text-gray-800 mb-2">Store Availability</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {AVAILABILITY_STATES.map((state) => (
            <button
              key={state.value}
              type="button"
              onClick={() => setField("availabilityStatus", state.value)}
              className={`text-left p-3 rounded-lg border transition-colors ${
                form.availabilityStatus === state.value
                  ? "border-amber-500 bg-amber-50"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <p className="text-sm font-semibold text-gray-800">{state.label}</p>
              <p className="text-xs text-gray-600">{state.hint}</p>
            </button>
          ))}
        </div>
        {form.availabilityStatus === "busy" && (
          <div className="mt-3">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Extra minutes added to ETA while busy
            </label>
            <input
              type="number"
              min="0"
              max="240"
              value={form.busyExtraMins}
              onChange={(e) => setField("busyExtraMins", e.target.value)}
              className={inputClass}
            />
          </div>
        )}
      </div>

      {/* Store & location */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-200 pt-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Store Type</label>
          <select
            value={form.storeType}
            onChange={(e) => setField("storeType", e.target.value)}
            className={inputClass}
          >
            {STORE_TYPES.map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Delivery Radius (km)
          </label>
          <input
            type="number"
            min="0.5"
            max="25"
            step="0.5"
            value={form.serviceRadiusKm}
            onChange={(e) => setField("serviceRadiusKm", e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="md:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-semibold text-gray-700">
              Store Location <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={isLocating}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100 disabled:opacity-50"
            >
              <FiCrosshair />
              {isLocating ? "Locating..." : "Use my current location"}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <FiMapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="number"
                step="any"
                placeholder="Latitude (e.g. 12.9716)"
                value={form.latitude}
                onChange={(e) => setField("latitude", e.target.value)}
                className={`${inputClass} pl-10`}
              />
            </div>
            <div className="relative">
              <FiMapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="number"
                step="any"
                placeholder="Longitude (e.g. 77.5946)"
                value={form.longitude}
                onChange={(e) => setField("longitude", e.target.value)}
                className={`${inputClass} pl-10`}
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Customers within your delivery radius of this point can order from you.
            Without a location your store cannot be found.
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Preparation Time (minutes)
          </label>
          <input
            type="number"
            min="0"
            max="240"
            value={form.preparationTimeMins}
            onChange={(e) => setField("preparationTimeMins", e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Serviced Pincodes
          </label>
          <input
            type="text"
            placeholder="560001, 560002"
            value={form.servicedPincodes}
            onChange={(e) => setField("servicedPincodes", e.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-gray-500 mt-1">
            Comma separated. Used when a customer denies location access.
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Minimum Order Value
          </label>
          <input
            type="number"
            min="0"
            value={form.minOrderValue}
            onChange={(e) => setField("minOrderValue", e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Packaging Fee</label>
          <input
            type="number"
            min="0"
            value={form.packagingFee}
            onChange={(e) => setField("packagingFee", e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* Business hours */}
      <div className="border-t border-gray-200 pt-6">
        <h4 className="text-sm font-bold text-gray-800 mb-3">Business Hours</h4>
        <div className="space-y-2">
          {businessHours.map((entry) => (
            <div
              key={entry.day}
              className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-2 border border-gray-200 rounded-lg"
            >
              <span className="w-full sm:w-28 text-sm font-medium text-gray-700">
                {DAYS.find((d) => d.day === entry.day)?.label}
              </span>
              <label className="flex items-center gap-2 text-xs text-gray-600 sm:w-24">
                <input
                  type="checkbox"
                  checked={entry.isClosed}
                  onChange={(e) => setDayField(entry.day, "isClosed", e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                />
                Closed
              </label>
              <input
                type="time"
                value={entry.open}
                disabled={entry.isClosed}
                onChange={(e) => setDayField(entry.day, "open", e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-400"
              />
              <span className="text-xs text-gray-500">to</span>
              <input
                type="time"
                value={entry.close}
                disabled={entry.isClosed}
                onChange={(e) => setDayField(entry.day, "close", e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:text-gray-400"
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Closing time may be earlier than opening time for overnight stores (e.g. 22:00 to 02:00).
        </p>
      </div>

      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          type="submit"
          disabled={isSaving}
          className="flex items-center gap-2 px-4 sm:px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-all font-semibold text-sm w-full sm:w-auto justify-center disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FiSave />
          {isSaving ? "Saving..." : "Save Quick Commerce Settings"}
        </button>
      </div>
    </form>
  );
};

export default QuickCommerceSettingsForm;
