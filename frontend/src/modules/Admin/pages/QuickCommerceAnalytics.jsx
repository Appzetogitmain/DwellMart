import { useEffect, useState, useCallback } from "react";
import {
  FiZap,
  FiClock,
  FiTruck,
  FiAlertTriangle,
  FiMapPin,
  FiRefreshCw,
} from "react-icons/fi";
import api from "../../../shared/utils/api";
import { formatPrice } from "../../../shared/utils/helpers";

/**
 * Platform view of Quick Commerce health.
 *
 * Ordered by what actually decides whether the experience is working: ETA
 * performance first, then dispatch reliability, then commercial figures. A
 * healthy GMV number over stores that consistently miss their promise is not a
 * healthy business, and putting revenue at the top would imply otherwise.
 */

const RANGE_OPTIONS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

// Day/hour buckets follow the viewer's clock, not the server's.
const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const StatTile = ({ label, value, hint, tone = "default", icon: Icon }) => {
  const toneClasses = {
    default: "border-border bg-surface",
    warn: "border-status-error bg-status-error/5",
    good: "border-status-success bg-status-success/5",
  }[tone];

  return (
    <div className={`rounded-xl border p-4 ${toneClasses}`}>
      <div className="flex items-center gap-2 mb-1.5">
        {Icon ? <Icon className="text-content-secondary flex-shrink-0" /> : null}
        <p className="text-xs font-medium text-content-secondary">{label}</p>
      </div>
      <p className="text-2xl font-bold text-content">{value}</p>
      {hint ? <p className="text-xs text-content-muted mt-1">{hint}</p> : null}
    </div>
  );
};

const QuickCommerceAnalytics = () => {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get("/admin/analytics/quick-commerce", {
        params: { days, timezone: browserTimezone },
      });
      setData(response?.data ?? response);
      setError(null);
    } catch (err) {
      setError(err?.message || "Unable to load Quick Commerce analytics.");
    } finally {
      setIsLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  if (isLoading && !data) {
    return (
      <div className="p-6">
        <div className="h-40 rounded-xl bg-surface-muted animate-pulse" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-content-secondary">{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-3 px-4 py-2 rounded-lg bg-brand-primary text-black font-semibold text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const eta = data?.eta || {};
  const volume = data?.volume || {};
  const live = data?.live || {};
  const assignment = data?.assignment || {};
  const riders = data?.riders || {};
  const coverage = data?.coverage || {};
  const responsiveness = data?.responsiveness || {};
  const isLate = Number(eta.avgVarianceMinutes) > 0;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-content flex items-center gap-2">
            <FiZap className="text-brand-primary" />
            Quick Commerce Analytics
          </h1>
          <p className="text-sm text-content-secondary">Platform delivery performance</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.days}
                type="button"
                onClick={() => setDays(option.days)}
                className={`px-3 py-2 text-sm font-semibold ${
                  days === option.days
                    ? "bg-brand-primary text-black"
                    : "text-content-secondary"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={load}
            className="p-2 rounded-lg border border-border text-content-secondary"
            aria-label="Refresh"
          >
            <FiRefreshCw />
          </button>
        </div>
      </div>

      {/* Promised vs actual — the leading indicator */}
      <section>
        <h2 className="text-sm font-bold text-content-secondary uppercase tracking-wide mb-3">
          Delivery promise
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            label="Promised ETA"
            value={`${eta.avgPromisedMinutes ?? 0} min`}
            hint="Average at checkout"
            icon={FiClock}
          />
          <StatTile
            label="Actual ETA"
            value={`${eta.avgActualMinutes ?? 0} min`}
            hint={
              eta.deliveredCount
                ? `${isLate ? "+" : ""}${eta.avgVarianceMinutes} min vs promise`
                : "No deliveries yet"
            }
            tone={eta.deliveredCount ? (isLate ? "warn" : "good") : "default"}
          />
          <StatTile
            label="On-time rate"
            value={`${eta.onTimeRate ?? 0}%`}
            tone={Number(eta.onTimeRate) >= 90 ? "good" : "warn"}
            hint={`${eta.deliveredCount ?? 0} delivered`}
          />
          <StatTile
            label="SLA breaches"
            value={eta.slaBreaches ?? 0}
            hint={`${eta.slaBreachRate ?? 0}% of deliveries`}
            tone={Number(eta.slaBreaches) > 0 ? "warn" : "good"}
          />
        </div>
      </section>

      {/* Dispatch reliability */}
      <section>
        <h2 className="text-sm font-bold text-content-secondary uppercase tracking-wide mb-3">
          Dispatch &amp; fleet
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            label="Auto-assigned"
            value={`${assignment.autoAssignmentRate ?? 0}%`}
            hint={`${assignment.escalated ?? 0} needed a human`}
            tone={Number(assignment.escalated) > 0 ? "warn" : "good"}
            icon={FiTruck}
          />
          <StatTile
            label="Rider utilisation"
            value={`${riders.utilisationRate ?? 0}%`}
            hint={`${riders.busy ?? 0} of ${riders.total ?? 0} on a delivery`}
          />
          <StatTile
            label="Riders available"
            value={riders.available ?? 0}
            tone={Number(riders.available) === 0 ? "warn" : "default"}
          />
          <StatTile
            label="Store acceptance"
            value={`${responsiveness.acceptanceRate ?? 0}%`}
            hint={`${responsiveness.escalated ?? 0} unresponsive`}
            tone={Number(responsiveness.escalated) > 0 ? "warn" : "default"}
            icon={FiAlertTriangle}
          />
        </div>
      </section>

      {/* Live pipeline */}
      <section>
        <h2 className="text-sm font-bold text-content-secondary uppercase tracking-wide mb-3">
          Live orders
        </h2>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {["placed", "accepted", "preparing", "ready", "picked_up", "arriving"].map((stage) => (
            <StatTile
              key={stage}
              label={stage.replace("_", " ")}
              value={live[stage] ?? 0}
              tone={stage === "placed" && live.placed > 0 ? "warn" : "default"}
            />
          ))}
        </div>
      </section>

      {/* Commercials */}
      <section>
        <h2 className="text-sm font-bold text-content-secondary uppercase tracking-wide mb-3">
          Commercial
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="GMV" value={formatPrice(volume.gmv ?? 0)} />
          <StatTile label="Orders" value={volume.completedOrders ?? 0} />
          <StatTile label="Average order" value={formatPrice(volume.averageOrderValue ?? 0)} />
          <StatTile
            label="Cancelled"
            value={volume.cancelledOrders ?? 0}
            hint={`${volume.cancellationRate ?? 0}% of orders`}
          />
        </div>
      </section>

      {/* Coverage */}
      <section>
        <h2 className="text-sm font-bold text-content-secondary uppercase tracking-wide mb-3">
          Serviceability coverage
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <StatTile
            label="QC stores"
            value={coverage.quickCommerceVendors ?? 0}
            icon={FiMapPin}
          />
          <StatTile
            label="Currently orderable"
            value={coverage.orderableVendors ?? 0}
            tone={Number(coverage.orderableVendors) === 0 ? "warn" : "default"}
          />
          <StatTile label="QC products" value={coverage.quickCommerceProducts ?? 0} />
        </div>
      </section>

      {/* Store leaderboard */}
      {Array.isArray(data?.topStores) && data.topStores.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-content-secondary uppercase tracking-wide mb-3">
            Top stores
          </h2>
          <div className="rounded-xl border border-border bg-surface overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="bg-surface-muted">
                <tr className="text-left text-content-secondary">
                  <th className="p-3 font-semibold">Store</th>
                  <th className="p-3 font-semibold text-right">Orders</th>
                  <th className="p-3 font-semibold text-right">Revenue</th>
                  <th className="p-3 font-semibold text-right">Late</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.topStores.map((store) => (
                  <tr key={store.vendorId}>
                    <td className="p-3 font-medium text-content">{store.storeName}</td>
                    <td className="p-3 text-right text-content-secondary">{store.orders}</td>
                    <td className="p-3 text-right text-content">{formatPrice(store.revenue)}</td>
                    <td
                      className={`p-3 text-right font-semibold ${
                        store.slaBreachRate > 10 ? "text-status-error" : "text-content-secondary"
                      }`}
                    >
                      {store.slaBreachRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

export default QuickCommerceAnalytics;
