import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FiZap, FiX } from "react-icons/fi";
import { connectSocket } from "../../../shared/services/socketService";
import api from "../../../shared/utils/api";
import { useVendorAuthStore } from '../store/vendorAuthStore';
import { withWorkspace } from '../hooks/useVendorWorkspace';

/**
 * Persistent, audible alert for a new Quick Commerce order.
 *
 * A Marketplace notification can wait for the vendor to open a list. This one
 * cannot: the store has roughly two minutes before the order escalates and the
 * customer's promise is at risk. So it takes over the screen, it makes a sound,
 * and it does not dismiss itself.
 *
 * "Acknowledge" is an explicit act — it stops the escalation clock, which is
 * why it is a button press and not merely rendering the alert. Marking it read
 * on display would silently defeat the escalation the backend depends on.
 */

/**
 * Short attention tone, synthesised rather than shipped as an asset — it keeps
 * the alert self-contained and avoids a network fetch at the exact moment the
 * vendor's attention matters most.
 */
const playAlertTone = (audioContextRef) => {
  try {
    const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextImpl) return;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextImpl();
    }
    const ctx = audioContextRef.current;
    // Browsers suspend audio contexts created before a user gesture.
    if (ctx.state === "suspended") ctx.resume().catch(() => null);

    const now = ctx.currentTime;
    [0, 0.28].forEach((offset) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, now + offset);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.24);
    });
  } catch {
    // Sound is an enhancement; the visual alert is the actual mechanism.
  }
};

const QuickCommerceOrderAlert = () => {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const vendor = useVendorAuthStore((state) => state.vendor);
  const audioContextRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    if (!vendor?.readableWorkspaces?.includes('quick_commerce')) return undefined;
    const fetchUnacknowledged = async () => {
      try {
        const res = await api.get('/vendor/quick-commerce/unacknowledged-alerts', { headers: { 'X-Vendor-Workspace': 'quick_commerce' } });
        if (!isMounted) return;
        const unack = res?.data || [];
        if (Array.isArray(unack) && unack.length > 0) {
          const mapped = unack.map((ord) => ({
            orderRefId: String(ord._id || ord.orderId),
            orderId: String(ord.orderId || ord._id),
            items: Array.isArray(ord.items) ? ord.items.length : 1,
            promisedEtaMinutes: ord.quickCommerce?.promisedEtaMinutes || 15,
          }));
          setAlerts((prev) => {
            const existingIds = new Set(prev.map((a) => a.orderRefId));
            const newAlerts = mapped.filter((a) => !existingIds.has(a.orderRefId));
            if (newAlerts.length > 0) {
              playAlertTone(audioContextRef);
            }
            return [...prev, ...newAlerts];
          });
        }
      } catch {
        // Silent catch
      }
    };

    fetchUnacknowledged();

    const socket = connectSocket();
    if (!socket) return () => { isMounted = false; };

    const handleAlert = (payload) => {
      if (!payload?.orderRefId) return;
      setAlerts((prev) =>
        prev.some((alert) => alert.orderRefId === payload.orderRefId)
          ? prev
          : [...prev, payload]
      );
      playAlertTone(audioContextRef);
    };

    socket.on("quick_commerce_order_alert", handleAlert);
    return () => {
      isMounted = false;
      socket.off("quick_commerce_order_alert", handleAlert);
    };
  }, [vendor?.readableWorkspaces]);

  const dismiss = useCallback((orderRefId) => {
    setAlerts((prev) => prev.filter((alert) => alert.orderRefId !== orderRefId));
  }, []);

  const acknowledge = useCallback(
    async (alert, { open = false } = {}) => {
      try {
        await api.post(`/vendor/quick-commerce/orders/${alert.orderRefId}/acknowledge`, {}, { headers: { 'X-Vendor-Workspace': 'quick_commerce' } });
      } catch {
        // The alert still clears — the order is visible in the orders list
        // either way, and a failed acknowledge only means the escalation
        // clock keeps running, which is the safe direction.
      }
      dismiss(alert.orderRefId);
      if (open) navigate(withWorkspace(`/vendor/orders/${alert.orderRefId}`, 'quick_commerce'));
    },
    [dismiss, navigate]
  );

  if (alerts.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] p-4 space-y-3 pointer-events-none">
      {alerts.map((alert) => (
        <div
          key={alert.orderRefId}
          role="alert"
          className="pointer-events-auto mx-auto max-w-md rounded-2xl border-2 border-brand-primary bg-surface shadow-2xl p-4 animate-pulse-once"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-primary flex items-center justify-center flex-shrink-0">
              <FiZap className="text-black text-lg" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-content">New Quick Commerce order</p>
              <p className="text-sm text-content-secondary">
                {alert.orderId} — {alert.items} item{alert.items === 1 ? "" : "s"}
                {alert.promisedEtaMinutes
                  ? `, promised in ${alert.promisedEtaMinutes} min`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => acknowledge(alert)}
              className="p-1.5 text-content-muted hover:text-content flex-shrink-0"
              aria-label="Acknowledge"
            >
              <FiX />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => acknowledge(alert)}
              className="py-2.5 rounded-xl border border-border font-semibold text-sm text-content-secondary"
            >
              Got it
            </button>
            <button
              type="button"
              onClick={() => acknowledge(alert, { open: true })}
              className="py-2.5 rounded-xl bg-brand-primary text-black font-bold text-sm"
            >
              View order
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default QuickCommerceOrderAlert;
