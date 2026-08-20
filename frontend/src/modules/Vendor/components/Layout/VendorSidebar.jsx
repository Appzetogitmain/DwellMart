import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiHome,
  FiPackage,
  FiShoppingBag,
  FiBarChart2,
  FiSettings,
  FiUser,
  FiChevronDown,
  FiX,
  FiTrendingDown,
  FiCreditCard,
  FiMapPin,
  FiMessageCircle,
  FiRefreshCw,
  FiStar,
  FiFileText,
  FiTag,
  FiBell,
  FiTruck,
  FiUsers,
  FiMessageSquare,
  FiTrendingUp,
  FiFile,
  FiZap,
} from "react-icons/fi";
import { MdCurrencyRupee } from "react-icons/md";
import { useVendorAuthStore } from "../../store/vendorAuthStore";
import { getVendorCapabilities, VENDOR_TYPE_LABELS } from "../../../../shared/config/vendorCapabilities";
import { useVendorWorkspace, withWorkspace, WORKSPACE_LABELS } from '../../hooks/useVendorWorkspace';
import { VENDOR_MULTI_CHANNEL_ENABLED } from '../../../../shared/config/vendorChannels';

// Icon mapping for menu items
const iconMap = {
  Dashboard: FiHome,
  Products: FiPackage,
  Orders: FiShoppingBag,
  "Return Requests": FiRefreshCw,
  "Product Reviews": FiStar,
  "Stock Management": FiTrendingDown,
  "Wallet History": FiCreditCard,
  Subscriptions: FiCreditCard,
  "Pickup Locations": FiMapPin,
  Chat: FiMessageCircle,
  Promotions: FiTag,
  Notifications: FiBell,
  "Shipping Management": FiTruck,
  Customers: FiUsers,
  "Support Tickets": FiMessageSquare,
  "Inventory Reports": FiBarChart2,
  "Performance Metrics": FiTrendingUp,
  Documents: FiFile,
  "Quick Commerce": FiZap,
  Analytics: FiBarChart2,
  Earnings: MdCurrencyRupee,
  Channels: FiZap,
  Settings: FiSettings,
  Profile: FiUser,
};

// Helper function to convert child name to route path
const getChildRoute = (parentRoute, childName) => {
  const routeMap = {
    "/vendor/products": {
      "Manage Products": "/vendor/products/manage-products",
      "Add Product": "/vendor/products/add-product",
    },
    "/vendor/orders": {
      "All Orders": "/vendor/orders/all-orders",
      "Order Tracking": "/vendor/orders/order-tracking",
    },
    "/vendor/earnings": {
      "Earnings Overview": "/vendor/earnings/overview",
      "Commission History": "/vendor/earnings/commission-history",
      "Settlement History": "/vendor/earnings/settlement-history",
    },
    "/vendor/settings": {
      "Store Settings": "/vendor/settings/store",
      "Payment Settings": "/vendor/settings/payment",
      "Shipping Settings": "/vendor/settings/shipping",
    },
  };

  return routeMap[parentRoute]?.[childName] || parentRoute;
};

const VendorSidebar = ({ isOpen, isOpenMobile, isOpenDesktop, onClose }) => {
  const showMobile = isOpenMobile !== undefined ? isOpenMobile : isOpen;
  const showDesktop = isOpenDesktop !== undefined ? isOpenDesktop : (isOpen ?? true);
  const location = useLocation();
  const navigate = useNavigate();
  const { vendor } = useVendorAuthStore();
  const [expandedItems, setExpandedItems] = useState({});
  const [isMobile, setIsMobile] = useState(false);
  const { workspace } = useVendorWorkspace();

  // Derive capability-driven menu from vendorType
  const vendorType = VENDOR_MULTI_CHANNEL_ENABLED
    ? (workspace ?? vendor?.activeWorkspaces?.[0] ?? 'retail')
    : (vendor?.vendorType ?? 'retail');
  const caps = getVendorCapabilities(vendorType);
  const activeMenu = (caps?.menu ?? []).filter((item) => {
    if (item.title === 'Product Reviews') return caps.features?.reviews === true;
    if (item.title === 'Return Requests') return caps.features?.returns === true;
    if (item.title === 'Customers') return caps.features?.customers === true;
    if (item.title === 'Shipping Management') return vendorType === 'retail';
    if (item.title === 'Pickup Locations') return vendorType === 'retail' || vendorType === 'wholesale';
    return true;
  });
  if (vendorType === 'quick_commerce') {
    activeMenu.splice(1, 0, { title: 'Quick Commerce', route: '/vendor/quick-commerce', icon: 'Quick Commerce' });
  }
  const vendorTypeLabel = VENDOR_TYPE_LABELS[vendorType] ?? 'Retail';

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Auto-close sidebar on mobile when route changes
  useEffect(() => {
    if (window.innerWidth < 1024) {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Auto-expand menu items when their route is active
  useEffect(() => {
    const activeItem = activeMenu.find((item) => {
      if (item.route === "/vendor/dashboard") {
        return location.pathname === "/vendor/dashboard";
      }
      return (
        location.pathname.startsWith(item.route) &&
        location.pathname !== item.route
      );
    });
    if (activeItem && activeItem.children && activeItem.children.length > 0) {
      setExpandedItems((prev) => {
        if (prev[activeItem.title]) return prev;
        return { [activeItem.title]: true };
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, vendorType]);

  // Check if a menu item is active
  const isActive = (route) => {
    if (route === "/vendor/dashboard") {
      return location.pathname === "/vendor/dashboard";
    }
    return location.pathname.startsWith(route);
  };

  // Toggle expanded state for menu items with children
  const toggleExpand = (title, closeOthers = true) => {
    setExpandedItems((prev) => {
      if (closeOthers) {
        return {
          [title]: !prev[title],
        };
      } else {
        return {
          ...prev,
          [title]: !prev[title],
        };
      }
    });
  };

  // Handle menu item click
  const handleMenuItemClick = (route, parentTitle = null) => {
    if (parentTitle) {
      setExpandedItems((prev) => {
        return {
          [parentTitle]: true,
        };
      });
    }
    navigate(withWorkspace(route, workspace));
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  // Render menu item
  const renderMenuItem = (item) => {
    const Icon = iconMap[item.title] || FiPackage;
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems[item.title];
    const active = isActive(item.route);

    return (
      <div key={item.route} className="mb-1">
        {/* Main Menu Item */}
        <div
          className={`
            flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer
            ${
              active
                ? "bg-primary-600 text-white shadow-sm"
                : "text-gray-300 hover:bg-slate-700"
            }
          `}
          onClick={() => {
            if (hasChildren) {
              toggleExpand(item.title, true);
            } else {
              handleMenuItemClick(item.route);
            }
          }}>
          <Icon
            className={`text-xl flex-shrink-0 ${
              active ? "text-white" : "text-gray-400"
            }`}
          />
          <span className="font-medium flex-1 text-sm">{item.title}</span>
          {hasChildren && (
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}>
              <FiChevronDown className="text-gray-400 text-sm" />
            </motion.div>
          )}
        </div>

        {/* Children Items */}
        <AnimatePresence>
          {hasChildren && isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden">
              <div className="ml-4 mt-1 pl-4 border-l-2 border-slate-600 space-y-1">
                {item.children.map((child, index) => {
                  const childRoute = getChildRoute(item.route, child);
                  const isChildActive =
                    location.pathname === childRoute ||
                    (childRoute !== item.route &&
                      location.pathname.startsWith(childRoute));

                  return (
                    <div
                      key={index}
                      onClick={() =>
                        handleMenuItemClick(childRoute, item.title)
                      }
                      className={`
                        px-3 py-2 text-xs rounded-lg transition-colors cursor-pointer
                        ${
                          isChildActive
                            ? "bg-primary-500/20 text-white font-medium"
                            : "text-gray-400 hover:bg-slate-700"
                        }
                      `}>
                      {child}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // Sidebar content
  const sidebarContent = (
    <div className="h-full flex flex-col bg-slate-900 shadow-xl">
      {/* Header Section */}
      <div className="p-4 border-b border-slate-800 bg-slate-900 shrink-0">
        {/* Header with Close Button and Vendor Info */}
        <div className="flex items-center justify-between gap-3">
          {/* Vendor User Info */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
              <FiShoppingBag className="text-white text-xl" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-white text-sm truncate">
                {vendor?.storeName || vendor?.name || "Vendor Store"}
              </h2>
              <p className="text-xs text-slate-400 truncate">
                {vendor?.email || "vendor@example.com"}
              </p>
              {/* Current operational workspace; legacy vendorType is not authorization. */}
              <span
                style={{ fontSize: '10px' }}
                className="inline-block mt-1 px-2 py-0.5 rounded-full bg-primary-600/30 text-primary-300 font-medium tracking-wide uppercase">
                {workspace ? WORKSPACE_LABELS[workspace] : vendorTypeLabel}
              </span>
            </div>
          </div>

          {/* Close/Hide Button */}
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
            aria-label="Hide sidebar"
            title="Hide sidebar">
            <FiX className="text-xl text-gray-300 hover:text-white" />
          </button>
        </div>
      </div>

      {/* Navigation Menu (with right border below top header) */}
      <nav className="flex-1 overflow-y-auto p-3 scrollbar-admin lg:pb-3 border-r border-slate-800 bg-slate-900">
        {activeMenu.map((item) => renderMenuItem(item))}
      </nav>
    </div>
  );

  return (
    <>
      {/* Mobile: Overlay Backdrop */}
      <AnimatePresence>
        {showMobile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-[9998] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar - Mobile Drawer */}
      <AnimatePresence>
        {showMobile && (
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 bottom-0 w-64 z-[10000] lg:hidden">
            {sidebarContent}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar - Desktop */}
      <div 
        className={`hidden lg:flex shrink-0 h-full overflow-hidden transition-all duration-300 ease-in-out ${
          showDesktop 
            ? "w-64 opacity-100 visible pointer-events-auto" 
            : "w-0 opacity-0 invisible pointer-events-none"
        }`}
      >
        <div className="w-64 h-full">
          {sidebarContent}
        </div>
      </div>
    </>
  );
};

export default VendorSidebar;
