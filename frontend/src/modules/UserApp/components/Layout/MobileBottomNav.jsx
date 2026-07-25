import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { FiHome, FiGrid, FiSearch, FiHeart, FiUser } from "react-icons/fi";
import { useWishlistStore } from "../../../../shared/store/wishlistStore";
import { useAuthStore } from "../../../../shared/store/authStore";

const MobileBottomNav = () => {
  const location = useLocation();
  const wishlistCount = useWishlistStore((state) => state.getItemCount());
  const { isAuthenticated } = useAuthStore();

  const navItems = [
    { path: "/home", icon: FiHome, label: "Home" },
    { path: "/categories", icon: FiGrid, label: "Categories" },
    { path: "/search", icon: FiSearch, label: "Search" },
    {
      path: "/wishlist",
      icon: FiHeart,
      label: "Wishlist",
      badge: wishlistCount > 0 ? wishlistCount : null,
    },
    {
      path: isAuthenticated ? "/profile" : "/login",
      icon: FiUser,
      label: "Account",
    },
  ];

  const isActive = (path) => {
    if (path === "/home") {
      return location.pathname === "/home";
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
      color: "#ffc101", // Golden accent theme
      transition: {
        duration: 0.3,
        ease: "easeOut",
      },
    },
  };

  const navContent = (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-l border-r border-accent-200/30 z-[9999] safe-area-bottom shadow-[0_-2px_10px_rgba(0,0,0,0.05)] md:hidden">
      <div className="flex items-center justify-around h-16 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              className="flex items-center justify-center flex-1 h-full relative">
              <motion.div
                className="relative flex items-center justify-center w-12 h-12"
                whileTap={{ scale: 0.9 }}>
                {/* Active Indicator Background */}
                {active && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-primary-50 rounded-full"
                    initial={false}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}

                {/* Icon */}
                <motion.div
                  className="relative z-10 flex items-center justify-center"
                  variants={iconVariants}
                  initial="inactive"
                  animate={active ? "active" : "inactive"}
                  transition={{ duration: 0.2 }}>
                  <Icon
                    className="text-2xl"
                    style={{
                      fill: "none",
                      stroke: "currentColor",
                      strokeWidth: 2,
                    }}
                  />
                </motion.div>

                {/* Badge */}
                {item.badge && (
                  <motion.span
                    key={item.badge}
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full border-2 border-white shadow-md z-20 flex items-center justify-center"
                    style={{ backgroundColor: "#ffc101" }}>
                    <span className="text-[8px] font-bold text-white">
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  </motion.span>
                )}
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );

  // Use portal to render outside of transformed containers (like PageTransition)
  return createPortal(navContent, document.body);
};

export default MobileBottomNav;
