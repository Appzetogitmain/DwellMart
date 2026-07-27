import { useState } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { FiLogOut, FiTruck, FiPackage, FiHome, FiUser, FiMenu, FiBell, FiHelpCircle } from "react-icons/fi";
import { useDeliveryAuthStore } from "../../store/deliveryStore";
import { useDeliveryNotificationStore } from "../../store/deliveryNotificationStore";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import DeliveryBottomNav from "./DeliveryBottomNav";
import { appLogo } from "../../../../data/logos";
import { useEffect } from "react";

const DeliveryLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { deliveryBoy, logout } = useDeliveryAuthStore();
  const { unreadCount, fetchNotifications } = useDeliveryNotificationStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    fetchNotifications(1);
    const interval = setInterval(() => fetchNotifications(1), 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleLogout = () => {
    logout();
    toast.success("Logged out successfully");
    navigate("/delivery/login");
  };

  const menuItems = [
    { icon: FiHome, label: "Dashboard", path: "/delivery/dashboard" },
    { icon: FiPackage, label: "Orders", path: "/delivery/orders" },
    { icon: FiBell, label: "Notifications", path: "/delivery/notifications" },
    { icon: FiHelpCircle, label: "Support", path: "/delivery/support" },
    { icon: FiUser, label: "Profile", path: "/delivery/profile" },
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case "available":
        return "bg-green-500";
      case "busy":
        return "bg-yellow-500";
      case "offline":
        return "bg-gray-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black shadow-lg overflow-visible h-16">
        <div className="flex items-center justify-between px-4 h-full overflow-visible">
          {/* Logo */}
          <Link
            to="/delivery/dashboard"
            className="flex items-center flex-shrink-0 overflow-visible relative z-10">
            <motion.div 
              className="overflow-visible flex items-center"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ 
                opacity: 1, 
                scale: [1, 1.05, 1],
                filter: [
                  "drop-shadow(0 0 0px rgba(74, 222, 128, 0))",
                  "drop-shadow(0 0 6px rgba(74, 222, 128, 0.3))",
                  "drop-shadow(0 0 0px rgba(74, 222, 128, 0))"
                ]
              }}
              transition={{ 
                opacity: { duration: 0.5 },
                scale: { 
                  duration: 4, 
                  repeat: Infinity, 
                  ease: "easeInOut" 
                },
                filter: {
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut"
                }
              }}
              whileHover={{ scale: 1.1, filter: "drop-shadow(0 0 10px rgba(74, 222, 128, 0.5))" }}
              whileTap={{ scale: 0.95 }}
            >
              {appLogo.src ? (
                <img
                  src={appLogo.src}
                  alt={appLogo.alt}
                  className="h-28 sm:h-32 w-auto max-w-[200px] sm:max-w-[250px] object-contain origin-left drop-shadow-md scale-110 sm:scale-100"
                  onError={(e) => {
                    // Hide image if logo doesn't exist
                    e.target.style.display = "none";
                    // Show text fallback
                    const parent = e.target.parentElement;
                    if (
                      parent &&
                      !parent.querySelector(".logo-text-fallback")
                    ) {
                      const fallback = document.createElement("span");
                      fallback.className =
                        "logo-text-fallback bg-gradient-to-r from-primary-600 via-primary-400 to-primary-600 bg-clip-text text-transparent font-extrabold text-xl sm:text-2xl drop-shadow-sm";
                      fallback.textContent = "Dwell Mart";
                      parent.appendChild(fallback);
                    }
                  }}
                />
              ) : (
                <span className="logo-text-fallback bg-gradient-to-r from-primary-600 via-primary-400 to-primary-600 bg-clip-text text-transparent font-extrabold text-xl sm:text-2xl drop-shadow-sm">
                  Dwell Mart
                </span>
              )}
            </motion.div>
          </Link>

          <div
            className="flex items-center gap-2"
            style={{ marginLeft: "30px" }}>
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-gray-800"
              aria-label="Open menu">
              <FiMenu className="text-gray-200 text-xl" />
            </button>
            <FiTruck className="text-primary-600 text-xl" />
            <h1 className="text-lg font-bold text-white">Delivery</h1>
          </div>
        </div>
      </header>

      {/* Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black bg-opacity-50 z-40"
            />
            <motion.div
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 w-64 bg-white shadow-xl z-50 overflow-y-auto">
              {/* Sidebar Header */}
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 gradient-green rounded-full flex items-center justify-center">
                    <FiTruck className="text-white text-xl" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-gray-800">
                      {deliveryBoy?.name || "Delivery Boy"}
                    </h2>
                    <p className="text-xs text-gray-600">
                      {deliveryBoy?.email}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${getStatusColor(
                      deliveryBoy?.status
                    )}`}></div>
                  <span className="text-xs text-gray-600 capitalize">
                    {deliveryBoy?.status || "offline"}
                  </span>
                </div>
              </div>

              {/* Navigation Menu */}
              <nav className="p-2">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => {
                        navigate(item.path);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-1 transition-colors ${
                        isActive
                          ? "bg-primary-50 text-primary-700"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}>
                      <Icon className="text-xl" />
                      <span className="font-medium">{item.label}</span>
                      {item.path === "/delivery/notifications" && unreadCount > 0 && (
                        <span className="ml-auto min-w-[20px] px-1.5 py-0.5 rounded-full bg-red-500 text-white text-xs font-semibold text-center">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              {/* Logout Button */}
              <div className="p-2 border-t border-gray-200 mt-auto">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 transition-colors">
                  <FiLogOut className="text-xl" />
                  <span className="font-medium">Logout</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="pt-16 pb-20">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <DeliveryBottomNav />
    </div>
  );
};

export default DeliveryLayout;
