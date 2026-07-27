import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { FiHome, FiPackage, FiUser, FiBell, FiHelpCircle } from "react-icons/fi";
import { useDeliveryNotificationStore } from "../../store/deliveryNotificationStore";

const DeliveryBottomNav = () => {
  const location = useLocation();
  const { unreadCount } = useDeliveryNotificationStore();

  const navItems = [
    { path: "/delivery/dashboard", icon: FiHome, label: "Dashboard" },
    { path: "/delivery/orders", icon: FiPackage, label: "Orders" },
    { path: "/delivery/support", icon: FiHelpCircle, label: "Support" },
    { path: "/delivery/notifications", icon: FiBell, label: "Alerts" },
    { path: "/delivery/profile", icon: FiUser, label: "Profile" },
  ];

  const isActive = (path) => {
    if (path === "/delivery/dashboard") {
      return location.pathname === "/delivery/dashboard";
    }
    return location.pathname.startsWith(path);
  };

  // Animation variants for icon
  const iconVariants = {
    inactive: {
      scale: 1,
      color: "#878787",
    },
    active: {
      scale: 1.1,
      color: "#2874F0", // Primary color
      transition: {
        duration: 0.3,
        ease: "easeOut",
      },
    },
  };

  const navContent = (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-l border-r border-accent-200/30 z-[9999] safe-area-bottom shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-around h-16 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              className="flex flex-col items-center justify-center flex-1 h-full gap-1">
              <motion.div
                className="relative flex items-center justify-center"
                variants={iconVariants}
                initial="inactive"
                animate={active ? "active" : "inactive"}>
                <Icon
                  className="text-2xl"
                  style={{
                    fill: "none",
                    stroke: "currentColor",
                    strokeWidth: 2,
                  }}
                />
                {item.path === "/delivery/notifications" && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold text-center leading-4">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </motion.div>
              <span
                className={`text-xs font-medium ${
                  active ? "text-primary-600" : "text-gray-500"
                }`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );

  // Use portal to render outside of transformed containers (like PageTransition)
  return createPortal(navContent, document.body);
};

export default DeliveryBottomNav;
