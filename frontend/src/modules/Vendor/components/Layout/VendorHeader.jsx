import { useEffect, useState } from "react";
import { FiMenu, FiBell, FiLogOut, FiShoppingBag, FiClock, FiAlertTriangle } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router-dom";
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import { useVendorNotificationStore } from "../../store/vendorNotificationStore";
import toast from "react-hot-toast";
import Button from "../../../Admin/components/Button";
import VendorNotificationWindow from "./VendorNotificationWindow";
import NotificationBell from "../../../../shared/components/Notifications/NotificationBell";

const VendorHeader = ({ onMenuClick, isDesktopSidebarOpen = true, subscriptionInfo = {} }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { vendor, logout } = useVendorAuthStore();
  const { unreadCount, fetchNotifications } = useVendorNotificationStore();
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => fetchNotifications(), 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleLogout = () => {
    logout();
    toast.success("Logged out successfully");
    navigate("/vendor/login");
  };

  const toggleNotifications = () => {
    setShowNotifications(!showNotifications);
  };

  // Get page name from pathname
  const getPageName = (pathname) => {
    const path = pathname.split("/").pop() || "dashboard";
    const pageNames = {
      dashboard: "Dashboard",
      products: "Products",
      orders: "Orders",
      analytics: "Analytics",
      earnings: "Earnings",
      settings: "Settings",
      profile: "Profile",
    };
    return pageNames[path] || path.charAt(0).toUpperCase() + path.slice(1);
  };

  const pageName = getPageName(location.pathname);
  const storeName = vendor?.storeName || vendor?.name || "Vendor Store";

  return (
    <header
      className="shrink-0 sticky top-0 z-30 w-full bg-slate-900 border-b border-slate-800 text-white shadow-sm transition-all duration-200"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}>
      <div className="flex items-center justify-between px-4 sm:px-6 lg:px-10 xl:px-12 py-4">
        {/* Left: Menu Button & Page Heading */}
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={onMenuClick}
            className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center border border-slate-700 transition-colors shadow-xs shrink-0 cursor-pointer"
            aria-label="Toggle Sidebar"
            title="Toggle Sidebar">
            <FiMenu className="text-xl text-white" />
          </button>

          {/* Page Heading */}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-white tracking-tight">
                {pageName}
              </h1>

              {/* Header Subscription Badges */}
              {subscriptionInfo?.isExpiringSoon && (
                <button
                  onClick={() => navigate('/vendor/renew-subscription')}
                  className="px-2.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-400/40 rounded-lg text-[11px] font-bold flex items-center gap-1 hover:bg-amber-500/30 transition-colors cursor-pointer"
                  title="Subscription Expiring Soon - Click to Renew">
                  <FiClock className="text-amber-400 animate-pulse" />
                  <span>Expiring Soon ({subscriptionInfo.daysRemaining}d left) • Renew</span>
                </button>
              )}

              {subscriptionInfo?.isExpired && (
                <button
                  onClick={() => navigate('/vendor/renew-subscription')}
                  className="px-2.5 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-400/40 rounded-lg text-[11px] font-bold flex items-center gap-1 hover:bg-rose-500/30 transition-colors cursor-pointer"
                  title="Subscription Expired - Click to Resubscribe">
                  <FiAlertTriangle className="text-rose-400" />
                  <span>Subscription Expired • Renew</span>
                </button>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-400 font-medium items-center gap-1.5 hidden sm:flex mt-0.5">
              <FiShoppingBag className="text-emerald-400" />
              <span>{storeName}</span>
            </p>
          </div>
        </div>

        {/* Right: Notifications & Logout */}
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          {/* Notifications */}
          <div className="relative">
            <NotificationBell className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center p-0" iconClassName="text-lg text-white" />
          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="px-3 sm:px-3.5 py-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-600 hover:text-white border border-red-500/30 transition-all font-semibold text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 shadow-xs shrink-0">
            <FiLogOut className="text-base" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default VendorHeader;
