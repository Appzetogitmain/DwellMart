import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiHome,
  FiPackage,
  FiShoppingBag,
} from "react-icons/fi";
import { MdCurrencyRupee } from "react-icons/md";
import useKeyboardVisible from "../../../UserApp/hooks/useKeyboardVisible";
import { useSupportChatStore } from "../../../../shared/store/supportChatStore";

const VendorBottomNav = () => {
  const location = useLocation();
  const isKeyboardVisible = useKeyboardVisible();
  const { activeConversation } = useSupportChatStore();

  if (isKeyboardVisible) {
    return null;
  }

  const navItems = [
    { path: "/vendor/dashboard", icon: FiHome, label: "Home" },
    { path: "/vendor/products", icon: FiPackage, label: "Products" },
    { path: "/vendor/orders", icon: FiShoppingBag, label: "Orders" },
    { path: "/vendor/earnings", icon: MdCurrencyRupee, label: "Earnings" },
  ];

  const isActive = (path) => {
    if (path === "/vendor/dashboard") {
      return location.pathname === "/vendor/dashboard";
    }
    return location.pathname.startsWith(path);
  };

  const isVendorSupportChatOpen =
    (location.pathname.startsWith('/vendor/support') ||
     location.pathname.startsWith('/vendor/chat') ||
     location.pathname.startsWith('/vendor/support-tickets')) &&
    Boolean(activeConversation);

  if (isVendorSupportChatOpen) {
    return null;
  }

  const navContent = (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-[9999] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] lg:hidden"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="flex items-center justify-around h-16 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              className="flex flex-col items-center justify-center flex-1 h-full py-1 text-center"
            >
              <motion.div
                className={`relative flex items-center justify-center w-9 h-8 rounded-xl transition-all ${
                  active ? "bg-amber-500/10 text-amber-600" : "text-gray-400"
                }`}
                whileTap={{ scale: 0.92 }}
              >
                <Icon
                  className="text-xl"
                  style={{
                    strokeWidth: active ? 2.2 : 1.8,
                  }}
                />
              </motion.div>
              <span
                className={`text-[11px] font-semibold tracking-tight mt-0.5 ${
                  active ? "text-amber-600 font-bold" : "text-gray-500"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );

  // Use portal to render outside of transformed containers
  return createPortal(navContent, document.body);
};

export default VendorBottomNav;

