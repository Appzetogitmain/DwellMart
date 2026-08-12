import { useState, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiHome,
  FiPackage,
  FiDollarSign,
  FiBell,
  FiHelpCircle,
  FiUser,
  FiLogOut,
  FiTruck,
  FiX,
  FiChevronRight,
  FiTrendingUp,
} from "react-icons/fi";
import { useDeliveryAuthStore } from "../../store/deliveryStore";
import { useDeliveryNotificationStore } from "../../store/deliveryNotificationStore";
import toast from "react-hot-toast";
import { loginLogo } from "../../../../shared/utils/imagePaths";

const menuItems = [
  { icon: FiHome, label: "Dashboard", path: "/delivery/dashboard" },
  { icon: FiPackage, label: "Orders", path: "/delivery/orders" },
  { icon: FiDollarSign, label: "Cash & Settlement", path: "/delivery/cash-settlements" },
  { icon: FiTrendingUp, label: "Earnings & Wallet", path: "/delivery/wallet" },
  { icon: FiBell, label: "Notifications", path: "/delivery/notifications" },
  { icon: FiHelpCircle, label: "Support", path: "/delivery/support" },
  { icon: FiUser, label: "Profile", path: "/delivery/profile" },
];

const DeliverySidebar = ({ isOpenMobile, isOpenDesktop, onClose }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { deliveryBoy, logout } = useDeliveryAuthStore();
  const { unreadCount } = useDeliveryNotificationStore();

  const handleLogout = () => {
    logout();
    toast.success("Logged out successfully");
    navigate("/delivery/login");
  };

  const getStatusDot = (status) => {
    switch (status) {
      case "available":
        return "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]";
      case "busy":
        return "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]";
      case "offline":
      default:
        return "bg-slate-500";
    }
  };

  const isActive = (path) => {
    if (path === "/delivery/dashboard") {
      return location.pathname === "/delivery/dashboard";
    }
    return location.pathname.startsWith(path);
  };

  const sidebarContent = (
    <div className="h-full flex flex-col bg-slate-900 text-slate-100 shadow-2xl border-r border-slate-800">
      {/* Header Section with Brand Logo & Delivery Badge */}
      <div className="p-4 border-b border-slate-800/80 bg-slate-950/80 flex items-center justify-between shrink-0">
        <Link to="/delivery/dashboard" onClick={onClose} className="flex items-center gap-3">
          <div className="bg-slate-950 px-3 py-1.5 rounded-xl border border-amber-500/30 shadow-[0_0_15px_rgba(212,175,55,0.15)] flex items-center justify-center">
            <img
              src={loginLogo}
              alt="DwellMart Logo"
              className="h-8 w-auto object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]"
            />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-extrabold text-amber-400 tracking-wider uppercase flex items-center gap-1">
              <FiTruck className="text-xs" /> Delivery
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Partner Portal</span>
          </div>
        </Link>

        {/* Mobile Close Button */}
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg lg:hidden transition-colors"
          aria-label="Close sidebar"
        >
          <FiX className="text-xl" />
        </button>
      </div>

      {/* Agent Info Card */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 via-yellow-500 to-amber-600 text-slate-950 font-bold flex items-center justify-center text-lg shadow-[0_4px_12px_rgba(212,175,55,0.25)] shrink-0">
            {deliveryBoy?.name?.charAt(0)?.toUpperCase() || "D"}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm text-white truncate">
              {deliveryBoy?.name || "Delivery Agent"}
            </h3>
            <p className="text-xs text-slate-400 truncate">{deliveryBoy?.email || "agent@dwellmart.com"}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`w-2 h-2 rounded-full ${getStatusDot(deliveryBoy?.status)}`} />
              <span className="text-[11px] text-slate-300 font-semibold capitalize">
                {deliveryBoy?.status || "offline"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-admin">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);

          return (
            <button
              key={item.path}
              onClick={() => {
                navigate(item.path);
                if (window.innerWidth < 1024) onClose();
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all duration-200 group text-sm font-semibold relative ${
                active
                  ? "bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-slate-950 shadow-[0_4px_15px_rgba(212,175,55,0.3)]"
                  : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
              }`}
            >
              <Icon className={`text-lg shrink-0 ${active ? "text-slate-950" : "text-amber-500/80 group-hover:text-amber-400"}`} />
              <span className="flex-1 text-left">{item.label}</span>

              {item.path === "/delivery/notifications" && unreadCount > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    active ? "bg-slate-950 text-amber-400" : "bg-amber-500 text-slate-950"
                  }`}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}

              {active && <FiChevronRight className="text-slate-950 text-sm" />}
            </button>
          );
        })}
      </nav>

      {/* Logout Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/60 shrink-0">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all text-sm font-semibold"
        >
          <FiLogOut className="text-lg shrink-0 text-red-400" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isOpenMobile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9998] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isOpenMobile && (
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="fixed left-0 top-0 bottom-0 w-64 z-[10000] lg:hidden"
          >
            {sidebarContent}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Fixed Sidebar */}
      <div
        className={`hidden lg:flex fixed left-0 top-0 bottom-0 w-64 z-30 transition-all duration-300 ease-in-out ${
          isOpenDesktop
            ? "translate-x-0 opacity-100 visible pointer-events-auto"
            : "-translate-x-full opacity-0 invisible pointer-events-none"
        }`}
      >
        {sidebarContent}
      </div>
    </>
  );
};

export default DeliverySidebar;
