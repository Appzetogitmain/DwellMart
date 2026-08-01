import { FiClock, FiPhone, FiMapPin, FiTruck } from "react-icons/fi";
import { useOrderTracking } from "../../../shared/hooks/useOrderTracking";
import { usePageTranslation } from "../../../hooks/usePageTranslation";

/**
 * Live Quick Commerce tracking: current stage, the ETA promised at checkout,
 * the assigned rider, and their last reported position.
 *
 * Renders nothing for Marketplace orders, so it is safe to mount
 * unconditionally on the shared tracking page.
 */

const STAGES = [
  { key: "placed", label: "Order placed" },
  { key: "accepted", label: "Accepted by store" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready for pickup" },
  { key: "picked_up", label: "Picked up" },
  { key: "arriving", label: "Arriving" },
  { key: "delivered", label: "Delivered" },
];

/** Minutes left against the promise made at checkout, or null if unknowable. */
const minutesRemaining = (promisedAt, promisedEtaMinutes) => {
  if (!promisedAt || !Number.isFinite(Number(promisedEtaMinutes))) return null;
  const dueAt = new Date(promisedAt).getTime() + Number(promisedEtaMinutes) * 60 * 1000;
  return Math.round((dueAt - Date.now()) / 60000);
};

const QuickCommerceTrackingPanel = ({ orderId }) => {
  const { tracking, riderPosition, isLoading } = useOrderTracking(orderId);
  const { getTranslatedText: t } = usePageTranslation([
    "Live Tracking",
    "Arriving in",
    "min",
    "Running late",
    "Delivered",
    "Finding a delivery partner",
    "We are still assigning a delivery partner. Your order is confirmed.",
    "Delivery partner",
    "Last seen",
    "Order placed",
    "Accepted by store",
    "Preparing",
    "Ready for pickup",
    "Picked up",
    "Arriving",
  ]);

  if (isLoading || !tracking?.isQuickCommerce) return null;

  const currentStatus = tracking.quickCommerceStatus || "placed";
  const currentIndex = STAGES.findIndex((stage) => stage.key === currentStatus);
  const isDelivered = currentStatus === "delivered";
  const remaining = minutesRemaining(tracking.promisedAt, tracking.promisedEtaMinutes);
  const isEscalated = tracking.assignmentStatus === "escalated" && !tracking.rider;

  return (
    <div className="glass-card rounded-2xl p-4 bg-surface border border-border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-content flex items-center gap-2">
          <FiTruck className="text-brand-primary" />
          {t("Live Tracking")}
        </h2>
        {isDelivered ? (
          <span className="text-sm font-bold text-status-success">{t("Delivered")}</span>
        ) : remaining !== null ? (
          <span
            className={`text-sm font-bold ${remaining < 0 ? "text-status-error" : "text-brand-primary"}`}
          >
            {remaining < 0
              ? t("Running late")
              : `${t("Arriving in")} ${Math.max(remaining, 1)} ${t("min")}`}
          </span>
        ) : null}
      </div>

      {isEscalated && (
        <div className="mb-4 rounded-xl border border-border bg-surface-muted p-3">
          <p className="text-sm font-semibold text-content">{t("Finding a delivery partner")}</p>
          <p className="text-xs text-content-secondary mt-1">
            {t("We are still assigning a delivery partner. Your order is confirmed.")}
          </p>
        </div>
      )}

      <ol className="space-y-3 mb-4">
        {STAGES.slice(0, -1).map((stage, index) => {
          const reached = currentIndex >= index;
          return (
            <li key={stage.key} className="flex items-center gap-3">
              <span
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  reached ? "bg-brand-primary" : "bg-border"
                }`}
              />
              <span
                className={`text-sm ${
                  reached ? "text-content font-medium" : "text-content-muted"
                }`}
              >
                {t(stage.label)}
              </span>
            </li>
          );
        })}
      </ol>

      {tracking.rider && (
        <div className="rounded-xl border border-border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-content-secondary">{t("Delivery partner")}</p>
              <p className="text-sm font-semibold text-content">{tracking.rider.name}</p>
              {tracking.rider.vehicleNumber && (
                <p className="text-xs text-content-muted">{tracking.rider.vehicleNumber}</p>
              )}
            </div>
            {tracking.rider.phone && (
              <a
                href={`tel:${tracking.rider.phone}`}
                className="p-2.5 rounded-full bg-brand-primary text-black"
                aria-label={t("Delivery partner")}
              >
                <FiPhone />
              </a>
            )}
          </div>

          {riderPosition?.latitude != null && riderPosition?.longitude != null && (
            <p className="text-xs text-content-muted flex items-center gap-1.5">
              <FiMapPin className="flex-shrink-0" />
              {Number(riderPosition.latitude).toFixed(4)}, {Number(riderPosition.longitude).toFixed(4)}
              {riderPosition.at && (
                <span className="flex items-center gap-1 ml-1">
                  <FiClock />
                  {t("Last seen")} {new Date(riderPosition.at).toLocaleTimeString()}
                </span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default QuickCommerceTrackingPanel;
