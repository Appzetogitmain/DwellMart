import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiMenu,
  FiBell,
  FiTruck,
  FiUser,
  FiLogOut,
  FiChevronDown,
  FiCheckCircle,
  FiClock,
  FiPower,
} from "react-icons/fi";
import { useDeliveryAuthStore } from "../../store/deliveryStore";
import { useDeliveryNotificationStore } from "../../store/deliveryNotificationStore";
import toast from "react-hot-toast";
import { loginLogo } from "../../../../shared/utils/imagePaths";

const DeliveryHeader = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const { deliveryBoy, updateStatus, isUpdatingStatus, logout } = useDeliveryAuthStore();
  const { unreadCount } = useDeliveryNotificationStore();

  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const statusRef = useRef(null);
  const profileRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (statusRef.current && !statusRef.current.contains(e.target)) {
        setStatusMenuOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleStatusChange = async (newStatus) => {
    if (isUpdatingStatus) return;
    try {
      await updateStatus(newStatus);
      toast.success(`Status set to ${newStatus}`);
      setStatusMenuOpen(false);
    } catch {
      // Handled by API interceptor
    }
  };

  const handleLogout = () => {
    logout();
    toast.success("Logged out successfully");
    navigate("/delivery/login");
  };

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case "available":
        return "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
      case "busy":
        return "bg-amber-500/10 border-amber-500/30 text-amber-400";
      case "offline":
      default:
        return "bg-slate-700/40 border-slate-600/40 text-slate-400";
    }
  };

  const getStatusDotColor = (status) => {
    switch (status) {
      case "available":
        return "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]";
      case "busy":
        return "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.7)]";
      case "offline":
      default:
        return "bg-slate-400";
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-slate-900/90 backdrop-blur-xl border-b border-amber-500/20 shadow-lg select-none">
      <div className="flex items-center justify-between px-4 sm:px-6 h-full max-w-full">
        {/* Left Section: Menu Toggle & Brand */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700/60 transition-colors"
            aria-label="Toggle Navigation Menu"
            title="Toggle Menu"
          >
            <FiMenu className="text-xl" />
          </button>

          <Link to="/delivery/dashboard" className="flex items-center gap-2.5">
            <div className="hidden sm:flex bg-slate-950 px-3 py-1 rounded-xl border border-amber-500/30 shadow-[0_0_12px_rgba(212,175,55,0.15)] items-center justify-center">
              <img
                src={loginLogo}
                alt="DwellMart"
                className="h-7 w-auto object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
              />
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider">
              <FiTruck className="text-xs" />
              <span>Delivery</span>
            </div>
          </Link>
        </div>

        {/* Right Section: Status Selector, Alerts & Profile */}
        <div className="flex items-center gap-3">
          {/* Status Toggle Dropdown */}
          <div className="relative" ref={statusRef}>
            <button
              onClick={() => setStatusMenuOpen(!statusMenuOpen)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wider transition-all shadow-sm ${getStatusBadgeStyle(
                deliveryBoy?.status
              )}`}
            >
              <span className={`w-2 h-2 rounded-full ${getStatusDotColor(deliveryBoy?.status)}`} />
              <span className="capitalize">{deliveryBoy?.status || "offline"}</span>
              <FiChevronDown className="text-xs opacity-70" />
            </button>

            <AnimatePresence>
              {statusMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-2 w-44 rounded-2xl bg-slate-900 border border-amber-500/20 shadow-[0_15px_35px_rgba(0,0,0,0.6)] overflow-hidden z-50 p-1.5 space-y-1"
                >
                  <button
                    onClick={() => handleStatusChange("available")}
                    disabled={isUpdatingStatus}
                    className="w-full text-left px-3 py-2 text-xs font-semibold rounded-xl text-emerald-400 hover:bg-emerald-500/10 transition-colors flex items-center gap-2"
                  >
                    <FiCheckCircle className="text-emerald-400 text-sm" />
                    <span>Available</span>
                  </button>
                  <button
                    onClick={() => handleStatusChange("busy")}
                    disabled={isUpdatingStatus}
                    className="w-full text-left px-3 py-2 text-xs font-semibold rounded-xl text-amber-400 hover:bg-amber-500/10 transition-colors flex items-center gap-2"
                  >
                    <FiClock className="text-amber-400 text-sm" />
                    <span>Busy</span>
                  </button>
                  <button
                    onClick={() => handleStatusChange("offline")}
                    disabled={isUpdatingStatus}
                    className="w-full text-left px-3 py-2 text-xs font-semibold rounded-xl text-slate-400 hover:bg-slate-800 transition-colors flex items-center gap-2"
                  >
                    <FiPower className="text-slate-400 text-sm" />
                    <span>Offline</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Notification Icon */}
          <Link
            to="/delivery/notifications"
            className="relative p-2 text-slate-300 hover:text-amber-400 hover:bg-slate-800 rounded-xl border border-slate-700/60 transition-colors"
            title="Notifications"
          >
            <FiBell className="text-lg" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-4 px-1 rounded-full bg-amber-500 text-slate-950 text-[10px] font-extrabold flex items-center justify-center shadow-md">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>

          {/* Profile Dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              className="flex items-center gap-2 p-1 pr-2.5 rounded-xl border border-slate-700/60 bg-slate-950/60 hover:border-amber-500/40 transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-yellow-500 text-slate-950 font-bold flex items-center justify-center text-xs shadow-sm">
                {deliveryBoy?.name?.charAt(0)?.toUpperCase() || "D"}
              </div>
              <span className="hidden md:inline-block text-xs font-bold text-white max-w-[100px] truncate">
                {deliveryBoy?.name || "Agent"}
              </span>
              <FiChevronDown className="text-xs text-slate-400" />
            </button>

            <AnimatePresence>
              {profileMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-2 w-48 rounded-2xl bg-slate-900 border border-amber-500/20 shadow-[0_15px_35px_rgba(0,0,0,0.6)] overflow-hidden z-50 p-1.5 space-y-1"
                >
                  <div className="px-3 py-2 border-b border-slate-800 mb-1">
                    <p className="text-xs font-bold text-white truncate">{deliveryBoy?.name || "Delivery Agent"}</p>
                    <p className="text-[10px] text-slate-400 truncate">{deliveryBoy?.email || ""}</p>
                  </div>
                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      navigate("/delivery/profile");
                    }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-2"
                  >
                    <FiUser className="text-amber-400 text-sm" />
                    <span>My Profile</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 text-xs font-semibold rounded-xl text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                  >
                    <FiLogOut className="text-red-400 text-sm" />
                    <span>Logout</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
};

export default DeliveryHeader;
