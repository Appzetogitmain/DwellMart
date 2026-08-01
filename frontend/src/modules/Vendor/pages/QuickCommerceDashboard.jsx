import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiZap,
  FiClock,
  FiPackage,
  FiTruck,
  FiAlertTriangle,
  FiCheckCircle,
  FiRefreshCw,
} from "react-icons/fi";
import api from "../../../shared/utils/api";
import { formatPrice } from "../../../shared/utils/helpers";

/**
 * Quick Commerce store dashboard — operational, not retrospective.
 *
 * The question a Quick Commerce store asks is "what do I need to do in the next
 * two minutes", so live stage counts lead and historical performance follows.
 * Orders awaiting acceptance are given their own treatment because that is the
 * one number where delay directly breaks the customer's promise.
 */

// DEBT-3: browserTimezone is resolved lazily inside load() so it is never
// captured at module scope — safe for SSR / hydration scenarios.

const StatTile = ({ label, value, hint, tone = "default", icon: Icon }) => {
  const toneClasses = {
    default: "border-border bg-surface",
    urgent: "border-status-error bg-status-error/5",
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

const QuickCommerceDashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      // DEBT-3: lazy eval — resolved at call time, not module load time.
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const response = await api.get("/vendor/quick-commerce/dashboard", {
        params: { timezone: tz },
      });
      setData(response?.data ?? response);
      setError(null);
    } catch (err) {
      setError(err?.message || "Unable to load the Quick Commerce dashboard.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // PERF-3: Skip the tick when the tab is hidden — on a 15-minute promise
    // there is no point hitting the API when the vendor isn't looking at it.
    // The visibilitychange listener catches the tab coming back into focus and
    // refreshes immediately so the data is never stale when the vendor returns.
    const tick = () => { if (!document.hidden) load(); };
    const timer = setInterval(tick, 30000);
    const onVisibility = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="h-32 rounded-xl bg-surface-muted animate-pulse" />
      </div>
    );
  }

  if (error) {
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

  // A store without the channel gets an explanation, not a wall of zeros that
  // reads like a bad day of trading.
  if (data && data.channelEnabled === false) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-border bg-surface p-8 text-center max-w-md mx-auto">
          <FiZap className="text-brand-primary text-3xl mx-auto mb-3" />
          <h2 className="text-lg font-bold text-content mb-1">Quick Commerce is not enabled</h2>
          <p className="text-sm text-content-secondary mb-4">
            Turn on the Quick Commerce channel in your store settings to start
            taking rapid-delivery orders.
          </p>
          <button
            type="button"
            onClick={() => navigate("/vendor/settings/store")}
            className="px-4 py-2.5 rounded-xl bg-brand-primary text-black font-semibold text-sm"
          >
            Open store settings
          </button>
        </div>
      </div>
    );
  }

  const live = data?.live || {};
  const eta = data?.eta || {};
  const today = data?.today || {};
  const responsiveness = data?.responsiveness || {};
  const isLate = Number(eta.avgVarianceMinutes) > 0;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-content flex items-center gap-2">
            <FiZap className="text-brand-primary" />
            Quick Commerce
          </h1>
          <p className="text-sm text-content-secondary">Live store operations</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-semibold text-content-secondary"
        >
          <FiRefreshCw />
          Refresh
        </button>
      </div>

      {/* Needs action now */}
      {live.actionRequired > 0 && (
        <button
          type="button"
          onClick={() => navigate("/vendor/orders")}
          className="w-full text-left rounded-xl border-2 border-status-error bg-status-error/5 p-4 flex items-center gap-3"
        >
          <FiAlertTriangle className="text-status-error text-2xl flex-shrink-0" />
          <div className="flex-1">
            <p className="font-bold text-content">
              {live.actionRequired} order{live.actionRequired === 1 ? "" : "s"} waiting to be accepted
            </p>
            <p className="text-sm text-content-secondary">
              Every minute here comes out of the customer&apos;s delivery promise.
            </p>
          </div>
        </button>
      )}

      {/* Live pipeline */}
      <section>
        <h2 className="text-sm font-bold text-content-secondary uppercase tracking-wide mb-3">
          Right now
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            label="To accept"
            value={live.actionRequired ?? 0}
            tone={live.actionRequired > 0 ? "urgent" : "default"}
            icon={FiAlertTriangle}
          />
          <StatTile label="Preparing" value={live.inKitchen ?? 0} icon={FiPackage} />
          <StatTile label="Awaiting pickup" value={live.awaitingPickup ?? 0} icon={FiClock} />
          <StatTile label="Out for delivery" value={live.onTheWay ?? 0} icon={FiTruck} />
        </div>
      </section>

      {/* Today */}
      <section>
        <h2 className="text-sm font-bold text-content-secondary uppercase tracking-wide mb-3">
          Today
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Orders" value={today.completedOrders ?? 0} icon={FiCheckCircle} />
          <StatTile label="Revenue" value={formatPrice(today.gmv ?? 0)} />
          <StatTile label="Average order" value={formatPrice(today.averageOrderValue ?? 0)} />
          <StatTile
            label="Cancelled"
            value={today.cancelledOrders ?? 0}
            hint={`${today.cancellationRate ?? 0}% of orders`}
          />
        </div>
      </section>

      {/* Delivery promise — the metric that decides whether QC is working */}
      <section>
        <h2 className="text-sm font-bold text-content-secondary uppercase tracking-wide mb-3">
          Delivery promise
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            label="Promised"
            value={`${eta.avgPromisedMinutes ?? 0} min`}
            hint="Average at checkout"
          />
          <StatTile
            label="Actual"
            value={`${eta.avgActualMinutes ?? 0} min`}
            hint={
              eta.deliveredCount
                ? `${isLate ? "+" : ""}${eta.avgVarianceMinutes} min vs promise`
                : "No deliveries yet"
            }
            tone={eta.deliveredCount ? (isLate ? "urgent" : "good") : "default"}
          />
          <StatTile
            label="On time"
            value={`${eta.onTimeRate ?? 0}%`}
            tone={Number(eta.onTimeRate) >= 90 ? "good" : "default"}
            hint={`${eta.slaBreaches ?? 0} late`}
          />
          <StatTile
            label="Accept time"
            value={`${responsiveness.avgAcknowledgeSeconds ?? 0}s`}
            hint={`${responsiveness.acceptanceRate ?? 0}% accepted`}
            tone={responsiveness.escalated > 0 ? "urgent" : "default"}
          />
        </div>
      </section>

      {/* Peak hours */}
      {Array.isArray(data?.peakHours) && data.peakHours.some((h) => h.orders > 0) && (
        <section>
          <h2 className="text-sm font-bold text-content-secondary uppercase tracking-wide mb-3">
            Busiest hours
          </h2>
          <div className="rounded-xl border border-border bg-surface p-4 overflow-x-auto">
            <div className="flex items-end gap-1 min-w-[600px] h-32">
              {data.peakHours.map((bucket) => {
                const max = Math.max(...data.peakHours.map((h) => h.orders), 1);
                const height = Math.round((bucket.orders / max) * 100);
                return (
                  <div key={bucket.hour} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-brand-primary rounded-t"
                      style={{ height: `${Math.max(height, 2)}%` }}
                      title={`${bucket.orders} orders`}
                    />
                    <span className="text-[10px] text-content-muted">{bucket.hour}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Top SKUs */}
      {Array.isArray(data?.topProducts) && data.topProducts.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-content-secondary uppercase tracking-wide mb-3">
            Top products
          </h2>
          <div className="rounded-xl border border-border bg-surface divide-y divide-border">
            {data.topProducts.map((product) => (
              <div key={product._id} className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-content truncate">{product.name}</p>
                  <p className="text-xs text-content-muted">{product.unitsSold} units</p>
                </div>
                <p className="text-sm font-bold text-content">{formatPrice(product.revenue)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default QuickCommerceDashboard;
