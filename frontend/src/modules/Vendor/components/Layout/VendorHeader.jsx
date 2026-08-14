import { useEffect, useState, useRef } from "react";
import {
  FiMenu,
  FiBell,
  FiLogOut,
  FiShoppingBag,
  FiClock,
  FiAlertTriangle,
  FiChevronDown,
  FiCheck,
  FiZap,
  FiLayers,
  FiPackage,
} from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import { useVendorNotificationStore } from "../../store/vendorNotificationStore";
import toast from "react-hot-toast";
import NotificationBell from "../../../../shared/components/Notifications/NotificationBell";
import { useVendorWorkspace, WORKSPACE_LABELS } from "../../hooks/useVendorWorkspace";

const WORKSPACE_META = {
  retail: {
    label: "Retail Marketplace",
    icon: FiShoppingBag,
    color: "text-sky-400",
    bg: "bg-sky-500/15",
    border: "border-sky-500/30",
  },
  wholesale: {
    label: "Wholesale Marketplace",
    icon: FiLayers,
    color: "text-purple-400",
    bg: "bg-purple-500/15",
    border: "border-purple-500/30",
  },
  quick_commerce: {
    label: "Quick Commerce",
    icon: FiZap,
    color: "text-amber-400",
    bg: "bg-amber-500/15",
    border: "border-amber-500/30",
  },
};

const WorkspaceSwitcher = ({ workspace, readableWorkspaces, activeWorkspaces, switchWorkspace }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("pointerdown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
    };
  }, [isOpen]);

  if (!workspace || readableWorkspaces.length <= 1) return null;

  const currentMeta = WORKSPACE_META[workspace] || {
    label: WORKSPACE_LABELS[workspace] || workspace,
    icon: FiShoppingBag,
    color: "text-amber-400",
    bg: "bg-amber-500/15",
    border: "border-amber-500/30",
  };
  const CurrentIcon = currentMeta.icon;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 text-white transition-all shadow-xs cursor-pointer select-none group"
        aria-label="Switch Workspace"
        aria-expanded={isOpen}
      >
        <div className={`w-5 h-5 sm:w-5.5 sm:h-5.5 rounded-lg ${currentMeta.bg} ${currentMeta.border} border flex items-center justify-center shrink-0`}>
          <CurrentIcon className={`text-xs sm:text-sm ${currentMeta.color}`} />
        </div>
        <span className="text-xs sm:text-sm font-semibold tracking-tight max-w-[100px] sm:max-w-[150px] truncate">
          {currentMeta.label}
        </span>
        <FiChevronDown
          className={`text-xs sm:text-sm text-slate-400 group-hover:text-white transition-transform duration-200 shrink-0 ${
            isOpen ? "rotate-180 text-amber-400" : ""
          }`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-full mt-2 w-60 sm:w-64 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 shadow-2xl p-1.5 z-50 overflow-hidden"
          >
            <div className="px-2.5 py-1.5 mb-1 border-b border-slate-800 flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                Selling Channels
              </span>
              <span className="text-[10px] font-semibold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded-md border border-slate-700/60">
                {readableWorkspaces.length} Channels
              </span>
            </div>

            <div className="space-y-1 py-0.5">
              {readableWorkspaces.map((item) => {
                const isSelected = item === workspace;
                const isActive = activeWorkspaces.includes(item);
                const meta = WORKSPACE_META[item] || {
                  label: WORKSPACE_LABELS[item] || item,
                  icon: FiShoppingBag,
                  color: "text-amber-400",
                  bg: "bg-amber-500/15",
                  border: "border-amber-500/30",
                };
                const Icon = meta.icon;

                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      switchWorkspace(item);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-all cursor-pointer ${
                      isSelected
                        ? "bg-slate-800 text-white font-bold border border-slate-700/80 shadow-xs"
                        : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg ${meta.bg} ${meta.border} border flex items-center justify-center shrink-0`}>
                      <Icon className={`text-sm ${meta.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold truncate">
                          {meta.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isActive ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                          }`}
                        />
                        <span className="text-[10px] text-slate-400">
                          {isActive ? "Active Channel" : "Paused"}
                        </span>
                      </div>
                    </div>
                    {isSelected && (
                      <FiCheck className="text-amber-400 text-base shrink-0 ml-1" />
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const VendorHeader = ({ onMenuClick, isDesktopSidebarOpen = true, subscriptionInfo = {} }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { vendor, logout } = useVendorAuthStore();
  const { fetchNotifications } = useVendorNotificationStore();
  const { workspace, activeWorkspaces, readableWorkspaces, switchWorkspace } = useVendorWorkspace();

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(() => fetchNotifications(), 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleLogout = () => {
    logout();
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem("vendor-last-workspace");
    }
    toast.success("Logged out successfully");
    navigate("/vendor/login");
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
      }}
    >
      <div className="flex items-center justify-between px-3 sm:px-6 lg:px-10 xl:px-12 py-2 sm:py-3.5 gap-2">
        {/* Left: Menu Button & Page Heading */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <button
            onClick={onMenuClick}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center border border-slate-700 transition-colors shadow-xs shrink-0 cursor-pointer"
            aria-label="Toggle Sidebar"
            title="Toggle Sidebar"
          >
            <FiMenu className="text-base sm:text-xl text-white" />
          </button>

          {/* Page Heading & Badge */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <h1 className="text-base sm:text-xl lg:text-2xl font-bold text-white tracking-tight truncate">
                {pageName}
              </h1>

              {/* Header Subscription Badges */}
              {subscriptionInfo?.isExpiringSoon && (
                <button
                  onClick={() => navigate("/vendor/renew-subscription")}
                  className="px-2 py-0.5 sm:px-2.5 sm:py-0.5 bg-amber-500/20 text-amber-300 border border-amber-400/40 rounded-md sm:rounded-lg text-[10px] sm:text-[11px] font-bold flex items-center gap-1 hover:bg-amber-500/30 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                  title="Subscription Expiring Soon - Click to Renew"
                >
                  <FiClock className="text-amber-400 text-xs animate-pulse" />
                  <span className="hidden sm:inline">
                    Expiring Soon ({subscriptionInfo.daysRemaining}d left) • Renew
                  </span>
                  <span className="inline sm:hidden">
                    {subscriptionInfo.daysRemaining}d left • Renew
                  </span>
                </button>
              )}

              {subscriptionInfo?.isExpired && (
                <button
                  onClick={() => navigate("/vendor/renew-subscription")}
                  className="px-2 py-0.5 sm:px-2.5 sm:py-0.5 bg-rose-500/20 text-rose-300 border border-rose-400/40 rounded-lg text-[10px] sm:text-[11px] font-bold flex items-center gap-1 hover:bg-rose-500/30 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                  title="Subscription Expired - Click to Resubscribe"
                >
                  <FiAlertTriangle className="text-rose-400 text-xs" />
                  <span className="hidden sm:inline">Subscription Expired • Renew</span>
                  <span className="inline sm:hidden">Expired • Renew</span>
                </button>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-400 font-medium items-center gap-1.5 hidden sm:flex mt-0.5">
              <FiShoppingBag className="text-emerald-400" />
              <span>{storeName}</span>
            </p>
          </div>
        </div>

        {/* Right: Custom Workspace Switcher, Notifications & Logout */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <WorkspaceSwitcher
            workspace={workspace}
            readableWorkspaces={readableWorkspaces}
            activeWorkspaces={activeWorkspaces}
            switchWorkspace={switchWorkspace}
          />

          {/* Notifications */}
          <div className="relative">
            <NotificationBell
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center p-0 cursor-pointer"
              iconClassName="text-sm sm:text-lg text-white"
            />
          </div>

          {/* Logout Button (Desktop) */}
          <button
            onClick={handleLogout}
            className="hidden sm:flex px-3.5 py-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-600 hover:text-white border border-red-500/30 transition-all font-semibold text-sm items-center gap-2 shadow-xs shrink-0 cursor-pointer"
          >
            <FiLogOut className="text-base" />
            <span>Logout</span>
          </button>

          {/* Logout Button (Mobile Icon-Only) */}
          <button
            onClick={handleLogout}
            className="flex sm:hidden w-8 h-8 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-600 hover:text-white border border-red-500/30 transition-all items-center justify-center shadow-xs shrink-0 cursor-pointer"
            aria-label="Logout"
            title="Logout"
          >
            <FiLogOut className="text-sm" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default VendorHeader;
