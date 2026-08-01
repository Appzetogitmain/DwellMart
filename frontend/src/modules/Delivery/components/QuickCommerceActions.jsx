import { useState } from "react";
import { FiNavigation, FiPackage, FiCheckCircle } from "react-icons/fi";
import toast from "react-hot-toast";
import { updateQuickCommerceStatus } from "../services/riderTrackingService";
import { useRiderLocationTracking } from "../hooks/useRiderLocationTracking";

/**
 * Rider controls for a Quick Commerce delivery: picked_up → arriving →
 * delivered, plus the live location ping that runs for as long as the order is
 * in the rider's hands.
 *
 * The OTP is required on `delivered` — the same customer proof the Marketplace
 * flow uses, just gated on the Quick Commerce lifecycle instead.
 *
 * Renders nothing for Marketplace orders.
 */

const NEXT_ACTION = {
  ready: { status: "picked_up", label: "Mark Picked Up", icon: FiPackage },
  picked_up: { status: "arriving", label: "Mark Arriving", icon: FiNavigation },
  arriving: { status: "delivered", label: "Complete Delivery", icon: FiCheckCircle },
};

const QuickCommerceActions = ({ order, onUpdated }) => {
  const [otp, setOtp] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentStatus = order?.quickCommerce?.status || "placed";
  const isActive = !["delivered", "cancelled"].includes(currentStatus);

  // Broadcast position for as long as this delivery is live.
  const { lastSentAt, error: locationError } = useRiderLocationTracking(
    Boolean(order?.experience === "quick_commerce" && isActive)
  );

  if (order?.experience !== "quick_commerce") return null;

  const action = NEXT_ACTION[currentStatus];
  const requiresOtp = action?.status === "delivered";

  const handleAdvance = async () => {
    if (!action || isSubmitting) return;

    if (requiresOtp && !/^\d{6}$/.test(otp.trim())) {
      toast.error("Enter the 6-digit delivery OTP");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await updateQuickCommerceStatus(order.id, {
        status: action.status,
        otp: requiresOtp ? otp.trim() : undefined,
      });
      const updated = response?.data ?? response;
      setOtp("");
      toast.success(
        action.status === "delivered" ? "Delivery completed" : `Order marked ${action.status.replace("_", " ")}`
      );
      if (onUpdated) onUpdated(updated);
    } catch {
      // The API interceptor surfaces the error.
    } finally {
      setIsSubmitting(false);
    }
  };

  const ActionIcon = action?.icon;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-content">Quick Commerce Delivery</h3>
        <span className="text-xs font-semibold text-brand-primary capitalize">
          {String(currentStatus).replace("_", " ")}
        </span>
      </div>

      {order?.quickCommerce?.promisedEtaMinutes ? (
        <p className="text-xs text-content-secondary">
          Promised ETA: {order.quickCommerce.promisedEtaMinutes} min
        </p>
      ) : null}

      {isActive && (
        <p className="text-xs text-content-muted">
          {locationError
            ? locationError
            : lastSentAt
              ? `Location shared at ${lastSentAt.toLocaleTimeString()}`
              : "Sharing your location with the customer..."}
        </p>
      )}

      {currentStatus === "placed" || currentStatus === "accepted" || currentStatus === "preparing" ? (
        <p className="text-xs text-content-secondary">
          Waiting for the store to mark this order ready for pickup.
        </p>
      ) : null}

      {requiresOtp && (
        <input
          type="text"
          inputMode="numeric"
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="6-digit delivery OTP"
          className="w-full px-4 py-3 rounded-xl border-2 border-border bg-surface text-content tracking-widest text-center"
        />
      )}

      {action && (
        <button
          type="button"
          onClick={handleAdvance}
          disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-brand-primary text-black py-3 rounded-xl font-bold disabled:opacity-60"
        >
          {ActionIcon ? <ActionIcon /> : null}
          {isSubmitting ? "Updating..." : action.label}
        </button>
      )}

      {currentStatus === "delivered" && (
        <p className="text-sm font-semibold text-status-success text-center">Delivered</p>
      )}
    </div>
  );
};

export default QuickCommerceActions;
