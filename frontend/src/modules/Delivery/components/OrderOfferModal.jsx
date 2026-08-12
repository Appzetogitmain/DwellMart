/**
 * OrderOfferModal.jsx
 *
 * Full-screen animated overlay that appears when a Quick Commerce order offer
 * arrives for the rider.
 *
 * Key behaviours:
 *  • Countdown bar: 45-second live timer, turns red below 10 s.
 *  • ACCEPT button: calls acceptCurrentOffer() → rider becomes BUSY.
 *  • REJECT button: calls rejectCurrentOffer() → rider stays AVAILABLE.
 *  • Auto-dismiss: when the client-side timer reaches zero, clearPendingOffer()
 *    is called.  The server-side expiry fires independently; if the server fires
 *    first the modal is dismissed via the delivery:offer_expired socket event.
 *  • Haptic feedback: navigator.vibrate on mount (Android WebView).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiZap,
  FiMapPin,
  FiClock,
  FiCheckCircle,
  FiXCircle,
  FiPackage,
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import { useDeliveryOfferStore } from '../store/deliveryOfferStore';

const OFFER_TIMEOUT_SECS = 45;

const OrderOfferModal = () => {
  const { pendingOffer, isActing, acceptCurrentOffer, rejectCurrentOffer } =
    useDeliveryOfferStore();

  const [secondsLeft, setSecondsLeft] = useState(OFFER_TIMEOUT_SECS);
  const timerRef = useRef(null);

  // ── Countdown ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pendingOffer) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Compute remaining seconds from the server-provided expiresAt if present.
    const serverExpiry = pendingOffer.expiresAt ? new Date(pendingOffer.expiresAt).getTime() : null;
    const computeRemaining = () =>
      serverExpiry
        ? Math.max(0, Math.round((serverExpiry - Date.now()) / 1000))
        : OFFER_TIMEOUT_SECS;

    setSecondsLeft(computeRemaining());

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const remaining = computeRemaining();
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        // Server-side expiry will fire the delivery:offer_expired socket event;
        // clear locally as well in case the socket message arrives late.
        useDeliveryOfferStore.getState().clearPendingOffer();
      }
    }, 500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [pendingOffer?.orderId]); // Re-run only when a NEW offer arrives

  const handleAccept = useCallback(async () => {
    if (isActing) return;
    const result = await acceptCurrentOffer();
    if (result.ok) {
      toast.success('Order accepted! Head to pickup.', { duration: 5000 });
    } else {
      toast.error(result.reason || 'Could not accept. Please try again.');
    }
  }, [isActing, acceptCurrentOffer]);

  const handleReject = useCallback(async () => {
    if (isActing) return;
    const result = await rejectCurrentOffer('RIDER_REJECTED');
    if (!result.ok) {
      toast.error(result.reason || 'Could not reject. Please try again.');
    }
  }, [isActing, rejectCurrentOffer]);

  const progress = Math.max(0, (secondsLeft / OFFER_TIMEOUT_SECS) * 100);
  const isLow = secondsLeft <= 10;

  return (
    <AnimatePresence>
      {pendingOffer && (
        /* Backdrop */
        <motion.div
          key="offer-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}
        >
          {/* Card */}
          <motion.div
            key="offer-card"
            initial={{ y: 120, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 120, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            className="relative w-full max-w-sm mx-4 mb-6 sm:mb-0 rounded-3xl overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.8)] border border-amber-500/30"
            style={{ background: 'linear-gradient(145deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)' }}
          >
            {/* Animated top accent */}
            <div className="h-1 w-full bg-gradient-to-r from-amber-600 via-yellow-400 to-amber-600" />

            {/* Countdown progress bar */}
            <div className="h-1.5 w-full bg-slate-800/80">
              <motion.div
                className={`h-full transition-colors duration-300 ${isLow ? 'bg-red-500' : 'bg-amber-400'}`}
                style={{ width: `${progress}%` }}
                transition={{ ease: 'linear' }}
              />
            </div>

            <div className="p-6 space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center">
                    <FiZap className="text-amber-400 text-lg" />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-widest text-amber-400">
                      New QC Order
                    </p>
                    <p className="text-[11px] text-slate-400">Quick Commerce delivery</p>
                  </div>
                </div>

                {/* Countdown pill */}
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-extrabold text-sm tabular-nums transition-colors duration-300 ${
                    isLow
                      ? 'bg-red-500/20 border-red-500/50 text-red-400'
                      : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                  }`}
                >
                  <FiClock className={`text-xs ${isLow ? 'animate-ping' : ''}`} />
                  <span>{secondsLeft}s</span>
                </div>
              </div>

              {/* Order ID */}
              <div className="bg-slate-950/60 rounded-2xl border border-slate-700/60 p-4 space-y-3">
                <div className="flex items-center gap-2.5">
                  <FiPackage className="text-amber-400 flex-shrink-0" />
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Order</p>
                    <p className="text-white font-extrabold text-sm tracking-wide">
                      #{pendingOffer.orderId}
                    </p>
                  </div>
                </div>

                {pendingOffer.pickupDistanceKm != null && (
                  <div className="flex items-center gap-2.5">
                    <FiMapPin className="text-emerald-400 flex-shrink-0" />
                    <div>
                      <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
                        Pickup Distance
                      </p>
                      <p className="text-white font-extrabold text-sm">
                        {Number(pendingOffer.pickupDistanceKm).toFixed(1)} km away
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-3">
                {/* REJECT */}
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={isActing}
                  className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-extrabold text-sm border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FiXCircle className="text-base" />
                  {isActing ? '...' : 'Reject'}
                </button>

                {/* ACCEPT */}
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={isActing}
                  className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-extrabold text-sm bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-[0_6px_20px_rgba(16,185,129,0.35)] hover:from-emerald-400 hover:to-green-500 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FiCheckCircle className="text-base" />
                  {isActing ? 'Accepting...' : 'Accept'}
                </button>
              </div>

              <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                If you do not respond within{' '}
                <strong className="text-slate-400">{OFFER_TIMEOUT_SECS}s</strong>, the order will be
                offered to the next available rider.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OrderOfferModal;
