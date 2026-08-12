import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import DeliverySidebar from "./DeliverySidebar";
import DeliveryHeader from "./DeliveryHeader";
import DeliveryBottomNav from "./DeliveryBottomNav";
import { useDeliveryNotificationStore } from "../../store/deliveryNotificationStore";
import { useDeliveryAuthStore } from "../../store/deliveryStore";
import useDeliverySocket from "../../hooks/useDeliverySocket";
import useRiderLocationTracking from "../../hooks/useRiderLocationTracking";
import OrderOfferModal from "../OrderOfferModal";

const DeliveryLayout = () => {
  const [isDesktopOpen, setIsDesktopOpen] = useState(() => {
    const saved = localStorage.getItem("delivery_sidebar_open");
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const { fetchNotifications } = useDeliveryNotificationStore();
  const isAuthenticated = useDeliveryAuthStore((s) => s.isAuthenticated);
  const deliveryBoy = useDeliveryAuthStore((s) => s.deliveryBoy);

  // ── Real-time socket connection (always active while authenticated) ──────────
  useDeliverySocket({ enabled: isAuthenticated });

  // ── Stream rider location pings while online/available/busy ──────────────
  const isTrackingEnabled =
    isAuthenticated &&
    (deliveryBoy?.status === 'available' || deliveryBoy?.status === 'busy');
  useRiderLocationTracking(isTrackingEnabled, 25000);

  useEffect(() => {
    fetchNotifications(1);
    const interval = setInterval(() => fetchNotifications(1), 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const toggleSidebar = () => {
    if (window.innerWidth >= 1024) {
      setIsDesktopOpen((prev) => {
        const next = !prev;
        localStorage.setItem("delivery_sidebar_open", JSON.stringify(next));
        return next;
      });
    } else {
      setIsMobileOpen((prev) => !prev);
    }
  };

  const closeSidebar = () => {
    if (window.innerWidth >= 1024) {
      setIsDesktopOpen(false);
      localStorage.setItem("delivery_sidebar_open", JSON.stringify(false));
    } else {
      setIsMobileOpen(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-900 text-slate-100 flex flex-col overflow-x-hidden selection:bg-amber-500 selection:text-slate-950">
      {/* Top Header */}
      <DeliveryHeader onMenuClick={toggleSidebar} />

      {/* Sidebar Navigation */}
      <DeliverySidebar
        isOpenMobile={isMobileOpen}
        isOpenDesktop={isDesktopOpen}
        onClose={closeSidebar}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 max-w-full pt-16 transition-all duration-300 ${
          isDesktopOpen ? "lg:ml-64" : "lg:ml-0"
        }`}
      >
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-12 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <DeliveryBottomNav />

      {/* ── Quick Commerce Order Offer Modal (global, overlays all screens) ── */}
      <OrderOfferModal />
    </div>
  );
};

export default DeliveryLayout;

