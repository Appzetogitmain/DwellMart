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
  const [isReturnConfirmOpen, setIsReturnConfirmOpen] = useState(false);

  const handleReturnToStore = async () => {
    try {
      setIsSubmitting(true);
      const api = (await import('../../../shared/utils/api')).default;
      await api.post(`/delivery/orders/${order.id}/return-to-store`);
      toast.success("Order returned to store.");
      setIsReturnConfirmOpen(false);
      if (onUpdated) onUpdated();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update status");
    } finally {
      setIsSubmitting(false);
    }
  };

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

      {/* Customer Unreachable Action for Rider */}
      {(currentStatus === "arriving" || currentStatus === "picked_up") && (
        <button
          type="button"
          onClick={async () => {
            const calls = window.prompt("Enter number of call attempts (min 1):", "2");
            if (!calls || Number(calls) < 1) {
              toast.error("At least 1 call attempt required");
              return;
            }
            const notes = window.prompt("Enter failure notes (e.g. Customer phone unreachable at doorstep):");
            if (!notes || notes.trim().length < 5) {
              toast.error("Please enter detailed failure notes (at least 5 chars)");
              return;
            }
            try {
              setIsSubmitting(true);
              const api = (await import('../../../shared/utils/api')).default;
              await api.post(`/delivery/orders/${order.id}/customer-unreachable`, {
                callAttempts: Number(calls),
                notes: notes.trim(),
                reason: "CUSTOMER_UNREACHABLE"
              });
              toast.success("Customer marked unreachable. Retry window scheduled.");
              if (onUpdated) onUpdated();
            } catch (err) {
              toast.error(err?.response?.data?.message || "Failed to update status");
            } finally {
              setIsSubmitting(false);
            }
          }}
          disabled={isSubmitting}
          className="w-full py-2.5 bg-amber-500/10 text-amber-500 border border-amber-500/30 rounded-xl font-semibold text-xs hover:bg-amber-500/20"
        >
          Customer Unreachable
        </button>
      )}

      {/* Return to Store Action */}
      {(currentStatus === "customer_unreachable" || currentStatus === "retry_scheduled") && (
        <>
          <button
            type="button"
            onClick={() => setIsReturnConfirmOpen(true)}
            disabled={isSubmitting}
            className="w-full py-2.5 bg-rose-500/10 text-rose-500 border border-rose-500/30 rounded-xl font-semibold text-xs hover:bg-rose-500/20 transition-colors"
          >
            Return Order to Store
          </button>

          <ConfirmationModal
            isOpen={isReturnConfirmOpen}
            onClose={() => setIsReturnConfirmOpen(false)}
            onConfirm={handleReturnToStore}
            title="Return Order to Store"
            subtitle="Are you sure you want to return this order to store and mark delivery as failed?"
            warningText="Inventory will be restocked to the dark store and partial refund calculations will trigger automatically."
            severity="danger"
            confirmText="Return Order"
            isLoading={isSubmitting}
          />
        </>
      )}

      {currentStatus === "delivered" && (
        <p className="text-sm font-semibold text-status-success text-center">Delivered</p>
      )}
    </div>
  );
};

export default QuickCommerceActions;
