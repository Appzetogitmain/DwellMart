import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiZap,
  FiMapPin,
  FiClock,
  FiTruck,
  FiNavigation,
  FiArrowRight,
  FiX,
  FiShoppingBag,
  FiCheckCircle,
  FiAlertCircle,
} from 'react-icons/fi';
import { useVendorAuthStore } from '../store/vendorAuthStore';

const QuickCommerceSetupReminderModal = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { vendor, isAuthenticated } = useVendorAuthStore();

  const vendorId = vendor?._id || vendor?.id || 'current';
  const sessionKey = `qc_setup_reminder_dismissed_${vendorId}`;

  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(sessionKey) === 'true';
    } catch {
      return false;
    }
  });

  // Sync dismissal state when vendor identity changes
  useEffect(() => {
    try {
      setIsDismissed(sessionStorage.getItem(sessionKey) === 'true');
    } catch {
      setIsDismissed(false);
    }
  }, [sessionKey]);

  const isApproved = vendor?.status === 'approved';
  const isQcRequested = vendor?.channels?.quickCommerce?.status === 'requested';
  const isQcReady = vendor?.quickCommerceReadiness?.ready === true;

  // Do not show modal if already on selling channels page with setup modal active
  const isAlreadyOnSetup =
    location.pathname === '/vendor/channels' &&
    new URLSearchParams(location.search).get('setup') === 'quick_commerce';

  const shouldShow =
    isAuthenticated &&
    isApproved &&
    isQcRequested &&
    !isQcReady &&
    !isDismissed &&
    !isAlreadyOnSetup;

  const setupItems = [
    {
      id: 'location',
      title: 'Store Address & Location',
      subtitle: 'Fulfillment address on Google Maps',
      icon: FiMapPin,
    },
    {
      id: 'coordinates',
      title: 'GPS Coordinates',
      subtitle: 'Authoritative pin for delivery dispatch & ETA',
      icon: FiNavigation,
    },
    {
      id: 'storeType',
      title: 'Store Type',
      subtitle: 'Dark store, retail outlet, pharmacy, restaurant',
      icon: FiShoppingBag,
    },
    {
      id: 'radius',
      title: 'Delivery Radius',
      subtitle: 'Maximum service radius in kilometers (e.g. 5 km)',
      icon: FiTruck,
    },
    {
      id: 'prepTime',
      title: 'Preparation Time',
      subtitle: 'Average order packaging & dispatch time in minutes',
      icon: FiClock,
    },
    {
      id: 'pincodes',
      title: 'Serviced Pincodes',
      subtitle: 'Fallback postal codes for location-restricted shoppers',
      icon: FiNavigation,
    },
  ];

  const handleCompleteSetup = () => {
    try {
      sessionStorage.setItem(sessionKey, 'true');
    } catch {}
    setIsDismissed(true);
    navigate('/vendor/channels?setup=quick_commerce');
  };

  const handleRemindLater = () => {
    try {
      sessionStorage.setItem(sessionKey, 'true');
    } catch {}
    setIsDismissed(true);
  };

  if (!shouldShow) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6 select-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleRemindLater}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity"
        />

        {/* Modal Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="relative w-full max-w-lg rounded-3xl bg-slate-900 border border-amber-500/30 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden z-10 p-6 sm:p-8"
        >
          {/* Top Gold Accent Bar */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-500" />

          {/* Ambient Glow */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-32 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

          {/* Close Button */}
          <button
            onClick={handleRemindLater}
            className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <FiX className="text-lg" />
          </button>

          {/* Header */}
          <div className="flex items-start gap-3.5 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
              <FiZap className="text-2xl text-amber-400 animate-pulse" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[11px] font-bold uppercase tracking-wider mb-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                Action Required • Under Review
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight leading-snug">
                Complete Your Quick Commerce Setup
              </h2>
            </div>
          </div>

          {/* Subtitle Message */}
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-5">
            Your Quick Commerce setup is incomplete. A few operational store details are required before your store can be reviewed and activated for 10–15 minute orders.
          </p>

          {/* Checklist of Required Details */}
          <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-3.5 sm:p-4 mb-5 space-y-2.5 max-h-56 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1 flex items-center justify-between">
              <span>Required Store Information</span>
              <span className="text-[10px] text-amber-400/90 font-semibold uppercase tracking-wider">
                Setup Pending
              </span>
            </div>

            {setupItems.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2.5 rounded-xl border bg-amber-500/5 border-amber-500/20 text-slate-200"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      <Icon className="text-sm" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{item.title}</p>
                      <p className="text-[11px] text-slate-400 truncate">{item.subtitle}</p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      <FiAlertCircle className="text-[10px]" />
                      Required
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Prompt Note */}
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 mb-6 flex items-start gap-2">
            <FiZap className="text-amber-400 mt-0.5 shrink-0" />
            <span>
              <strong>Complete these details</strong> to enable Quick Commerce readiness. Your channel will remain in review until all details are submitted.
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row items-center gap-3">
            <button
              type="button"
              onClick={handleRemindLater}
              className="w-full sm:w-1/2 py-3 px-4 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white font-semibold text-xs sm:text-sm transition-all duration-200 cursor-pointer"
            >
              Remind Me Later
            </button>

            <motion.button
              type="button"
              onClick={handleCompleteSetup}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full sm:w-1/2 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:via-yellow-400 hover:to-amber-500 text-slate-950 font-bold text-xs sm:text-sm shadow-[0_4px_20px_rgba(245,158,11,0.35)] hover:shadow-[0_6px_25px_rgba(245,158,11,0.5)] transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer group"
            >
              <span>Complete Setup</span>
              <FiArrowRight className="text-base group-hover:translate-x-1 transition-transform" />
            </motion.button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};

export default QuickCommerceSetupReminderModal;
