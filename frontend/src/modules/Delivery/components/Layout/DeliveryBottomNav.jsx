import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { FiHome, FiPackage, FiUser, FiBell, FiHelpCircle } from "react-icons/fi";
import { useDeliveryNotificationStore } from "../../store/deliveryNotificationStore";
import { useSupportChatStore } from "../../../../shared/store/supportChatStore";

const DeliveryBottomNav = () => {
  const location = useLocation();
  const { unreadCount } = useDeliveryNotificationStore();
  const { activeConversation } = useSupportChatStore();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const handleFocusIn = (e) => {
      const target = e.target;
      if (
        target &&
        (target.tagName === 'INPUT' ||
         target.tagName === 'TEXTAREA' ||
         target.isContentEditable)
      ) {
        setIsKeyboardOpen(true);
      }
    };

    const handleFocusOut = () => {
      setTimeout(() => {
        const activeEl = document.activeElement;
        const isInputFocused =
          activeEl &&
          (activeEl.tagName === 'INPUT' ||
           activeEl.tagName === 'TEXTAREA' ||
           activeEl.isContentEditable);

        if (!isInputFocused) {
          setIsKeyboardOpen(false);
        }
      }, 150);
    };

    const handleViewportResize = () => {
      if (window.visualViewport) {
        const diff = window.innerHeight - window.visualViewport.height;
        setIsKeyboardOpen(diff > 120);
      }
    };

    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', handleFocusOut);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
    }

    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportResize);
      }
    };
  }, []);

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

  const isSupportChatOpen = location.pathname.startsWith('/delivery/support') && Boolean(activeConversation);

  if (isKeyboardOpen || isSupportChatOpen) {
    return null;
  }

  const navContent = (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-950/95 backdrop-blur-xl border-t border-amber-500/20 z-[9999] safe-area-bottom lg:hidden shadow-[0_-10px_30px_rgba(0,0,0,0.8)] select-none">
      <div className="flex items-center justify-around h-16 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              className="flex flex-col items-center justify-center flex-1 h-full gap-1"
            >
              <motion.div
                className="relative flex items-center justify-center"
                initial={{ scale: 1 }}
                animate={{ scale: active ? 1.15 : 1 }}
                transition={{ duration: 0.2 }}
              >
                <Icon
                  className={`text-xl ${
                    active ? "text-amber-400 drop-shadow-[0_0_8px_rgba(212,175,55,0.6)]" : "text-slate-400"
                  }`}
                />
                {item.path === "/delivery/notifications" && unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-slate-950 text-[10px] font-extrabold flex items-center justify-center">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </motion.div>
              <span
                className={`text-[11px] font-bold ${
                  active ? "text-amber-400" : "text-slate-400"
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

  return createPortal(navContent, document.body);
};

export default DeliveryBottomNav;
