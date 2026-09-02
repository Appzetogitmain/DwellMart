import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiHome,
  FiShoppingBag,
  FiRotateCcw,
  FiPackage,
  FiGrid,
  FiTag,
  FiUsers,
  FiTruck,
  FiImage,
  FiPercent,
  FiBell,
  FiMessageCircle,
  FiFileText,
  FiStar,
  FiBarChart2,
  FiSettings,
  FiGlobe,
  FiShield,
  FiDatabase,
  FiChevronDown,
  FiX,
  FiUser,
  FiLock,
  FiLayers,
  FiKey,
} from "react-icons/fi";
import { useAdminAuthStore } from "../../store/adminStore";
import { usePermission } from "../../hooks/usePermission";
import adminMenuRaw from "../../config/adminMenu.json";
import ChangePasswordModal from "../ChangePasswordModal";

// Icon mapping for menu items
const iconMap = {
  Dashboard: FiHome,
  "Admin Management": FiLock,
  Orders: FiShoppingBag,
  "Return Requests": FiRotateCcw,
  Products: FiPackage,
  Categories: FiGrid,
  Brands: FiTag,
  Customers: FiUsers,
  "Delivery Management": FiTruck,
  Vendors: FiUsers,
  CMS: FiLayers,
  "Offers & Sliders": FiImage,
  Banners: FiImage,
  Testimonials: FiStar,
  "Trust & Assurance": FiShield,
  "Promo Codes": FiPercent,
  Notifications: FiBell,
  "Support Desk": FiMessageCircle,
  Reports: FiFileText,
  "Analytics & Finance": FiBarChart2,
  Settings: FiSettings,
  Policies: FiShield,
  "Sell on Dwell Mart": FiShoppingBag,
  "Sell on DwellMart": FiShoppingBag,
};

const MENU_PERMISSION_MAP = {
  Dashboard: "dashboard.view",
  "Admin Management": "subadmin.view",
  Orders: "orders.view",
  "Return Requests": "orders.view",
  Products: "products.view",
  Categories: "categories.view",
  Brands: "categories.view",
  Customers: "users.view",
  "Delivery Management": "delivery.view",
  Vendors: "vendors.view",
  "Offers & Sliders": "offers.view",
  Banners: "banners.view",
  Testimonials: "offers.view",
  "Trust & Assurance": "offers.view",
  "Promo Codes": "promocodes.view",
  Notifications: "dashboard.view",
  "Support Desk": "support.view",
  Reports: "reports.view",
  "Quick Commerce": "quickcommerce.analytics.view",
  "Analytics & Finance": "wallet.view",
  Settings: "settings.view",
  Policies: "settings.view",
  "Sell on Dwell Mart": "vendors.view",
  "Sell on DwellMart": "vendors.view",
};

export const CHILD_PERMISSION_MAP = {
  // Subadmins
  "Admin Users": "subadmin.view",
  "Activity Logs": "subadmin.view",

  // Orders
  "All Orders": "orders.view",
  "Order Tracking": "orders.view",
  "DTDC Shipments": "orders.view",

  // Products
  "Manage Products": "products.view",
  "Add Product": "products.add",
  "Tax & Pricing": "products.edit",
  "Product Ratings": "products.view",

  // Categories & Brands
  "Manage Categories": "categories.view",
  "Category Order": "categories.edit",
  "Manage Brands": "categories.view",

  // Vendors
  "Manage Vendors": "vendors.view",
  "Pending Approvals": "vendors.approve",
  "Commission Rates": "vendors.edit",
  "Vendor Analytics": "vendors.view",
  "Vendor Subscriptions": "vendors.view",
  "Payout Requests": "vendors.approve",

  // Customers
  "View Customers": "users.view",
  "Addresses": "users.view",
  "Transactions": "users.view",

  // Delivery
  "Delivery Boys": "delivery.view",
  "Cash Collection": "delivery.edit",
  "Assign Delivery": "delivery.approve",
  "Rider Payouts": "wallet.view",

  // Offers & Marketing
  "Home Sliders": "offers.view",
  "Festival Offers": "offers.view",
  "Campaigns": "offers.view",
  "Push Notifications": "dashboard.view",
  "Custom Messages": "dashboard.view",

  // Support
  "Live Chat": "support.view",
  "Ticket Types": "support.update_status",
  "Tickets": "support.view",
  "Feedbacks": "support.view",

  // Reports
  "Sales Report": "reports.view",
  "Inventory Report": "reports.view",

  // Finance
  "Revenue Overview": "wallet.view",
  "Profit & Loss": "wallet.view",
  "Order Trends": "wallet.view",
  "Payment Breakdown": "wallet.view",
  "Tax Reports": "wallet.view",
  "Refund Reports": "refunds.view",

  // Settings & Policies
  "General": "settings.view",
  "Payment & Shipping": "settings.edit",
  "Orders & Customers": "settings.edit",
  "Content & Features": "settings.edit",
  "Privacy Policy": "settings.view",
  "Returns & Exchanges": "settings.view",
  "Terms & Conditions": "settings.view",
  "About Us": "settings.view",
  "Contact Us": "settings.view",
  "Shipping Policy": "settings.view",
  "FAQs": "settings.view",
  "Become a Partner": "settings.view",

  // Sell on DwellMart
  "Landing Page Statistics": "vendors.view",
  "Subscription Plans": "vendors.view",
  "Vendor Terms": "vendors.view",
};

// Helper function to convert child name to route path
const getChildRoute = (parentRoute, childName) => {
  const routeMap = {
    "/admin/subadmins": {
      "Admin Users": "/admin/subadmins",
      "Activity Logs": "/admin/subadmins/logs",
    },
    "/admin/orders": {
      "All Orders": "/admin/orders/all-orders",
      "Order Tracking": "/admin/orders/order-tracking",
      "DTDC Shipments": "/admin/orders/shipments",
    },
    "/admin/products": {
      "Manage Products": "/admin/products/manage-products",
      "Add Product": "/admin/products/add-product",
      "Tax & Pricing": "/admin/products/tax-pricing",
      "Product Ratings": "/admin/products/product-ratings",
    },
    "/admin/categories": {
      "Manage Categories": "/admin/categories/manage-categories",
      "Category Order": "/admin/categories/category-order",
    },
    "/admin/brands": {
      "Manage Brands": "/admin/brands/manage-brands",
    },
    "/admin/vendors": {
      "Manage Vendors": "/admin/vendors/manage-vendors",
      "Pending Approvals": "/admin/vendors/pending-approvals",
      "Commission Rates": "/admin/vendors/commission-rates",
      "Vendor Analytics": "/admin/vendors/vendor-analytics",
      "Vendor Subscriptions": "/admin/vendors/vendor-subscriptions",
      "Payout Requests": "/admin/vendors/payout-requests",
    },
    "/admin/customers": {
      "View Customers": "/admin/customers/view-customers",
      Addresses: "/admin/customers/addresses",
      Transactions: "/admin/customers/transactions",
    },
    "/admin/delivery": {
      "Delivery Boys": "/admin/delivery/delivery-boys",
      "Cash Collection": "/admin/delivery/cash-collection",
      "Assign Delivery": "/admin/delivery/assign-delivery",
      "Rider Payouts": "/admin/delivery/rider-payouts",
    },
    "/admin/offers": {
      "Home Sliders": "/admin/offers/home-sliders",
      "Festival Offers": "/admin/offers/festival-offers",
      "Campaigns": "/admin/campaigns",
    },
    "/admin/notifications": {
      "All Notifications": "/admin/notifications",
      "Push Notifications": "/admin/notifications/push-notifications",
      "Custom Messages": "/admin/notifications/custom-messages",
    },
    "/admin/support": {
      "Live Chat": "/admin/support/live-chat",
      "Ticket Types": "/admin/support/ticket-types",
      Tickets: "/admin/support/tickets",
      Feedbacks: "/admin/support/feedbacks",
    },
    "/admin/reports": {
      "Sales Report": "/admin/reports/sales-report",
      "Inventory Report": "/admin/reports/inventory-report",
    },
    "/admin/finance": {
      "Revenue Overview": "/admin/finance/revenue-overview",
      "Profit & Loss": "/admin/finance/profit-loss",
      "Order Trends": "/admin/finance/order-trends",
      "Payment Breakdown": "/admin/finance/payment-breakdown",
      "Tax Reports": "/admin/finance/tax-reports",
      "Refund Reports": "/admin/finance/refund-reports",
    },
    "/admin/quick-commerce": {
      "Operations Console": "/admin/quick-commerce/operations",
      "Quick Commerce Analytics": "/admin/analytics/quick-commerce",
    },
    "/admin/quick-commerce/operations": {
      "Operations Console": "/admin/quick-commerce/operations",
      "Quick Commerce Analytics": "/admin/analytics/quick-commerce",
    },
    "/admin/settings": {
      General: "/admin/settings/general",
      "Payment & Shipping": "/admin/settings/payment-shipping",
      "Content & Features": "/admin/settings/content-features",
      "Quick Commerce Settings": "/admin/settings/quick-commerce",
      "Change Password": "/admin/settings/change-password",
    },
    "/admin/policies": {
      "Privacy Policy": "/admin/policies/privacy-policy",
      "Returns & Exchanges": "/admin/policies/refund-policy",
      "Terms & Conditions": "/admin/policies/terms-conditions",
      "About Us": "/admin/policies/about-us",
      "Shipping Policy": "/admin/policies/shipping-policy",
      "FAQs": "/admin/policies/faqs",
      "Become a Partner": "/admin/policies/become-partner",
    },
    "/admin/sell-on-dwellmart": {
      "Landing Page Statistics": "/admin/sell-on-dwellmart/stats",
      "Subscription Plans": "/admin/subscription-plans",
      "Vendor Terms": "/admin/vendor-terms",
    },
  };

  return routeMap[parentRoute]?.[childName] || parentRoute;
};

// Check permissions recursively for a menu item
const hasMenuPermission = (item, isSuperAdmin, hasPermission) => {
  if (isSuperAdmin) return true;

  if (typeof item === "string") {
    const reqPerm = CHILD_PERMISSION_MAP[item];
    if (!reqPerm) return true;
    return hasPermission(reqPerm);
  }

  if (item.title) {
    const requiredPerm = MENU_PERMISSION_MAP[item.title];
    if (requiredPerm && hasPermission(requiredPerm)) {
      return true;
    }
  }

  if (item.children && item.children.length > 0) {
    return item.children.some((child) =>
      hasMenuPermission(child, isSuperAdmin, hasPermission)
    );
  }

  return true;
};

// Recursively find active item and parent chain to expand
const findActiveAncestors = (items, pathname, parentRoute = null) => {
  if (!items || !Array.isArray(items)) return { isMatch: false, chain: [] };

  for (const item of items) {
    if (typeof item === "string") {
      const childRoute = getChildRoute(parentRoute, item);
      if (
        pathname === childRoute ||
        (childRoute !== parentRoute && pathname.startsWith(childRoute))
      ) {
        return { isMatch: true, chain: [] };
      }
    } else if (typeof item === "object" && item !== null) {
      const currentRoute = item.route;

      let isSelfMatch = false;
      if (currentRoute) {
        if (currentRoute === "/admin/dashboard") {
          isSelfMatch = pathname === "/admin/dashboard";
        } else {
          isSelfMatch =
            pathname === currentRoute || pathname.startsWith(currentRoute);
        }
      }

      let childMatch = null;
      if (item.children && item.children.length > 0) {
        childMatch = findActiveAncestors(
          item.children,
          pathname,
          currentRoute || parentRoute
        );
      }

      if (childMatch && childMatch.isMatch) {
        return {
          isMatch: true,
          chain: [item.title, ...childMatch.chain],
        };
      } else if (isSelfMatch) {
        return {
          isMatch: true,
          chain: item.children && item.children.length > 0 ? [item.title] : [],
        };
      }
    }
  }

  return { isMatch: false, chain: [] };
};

const AdminSidebar = ({ isOpen, isOpenMobile, isOpenDesktop, onClose }) => {
  const showMobile = isOpenMobile !== undefined ? isOpenMobile : isOpen;
  const showDesktop = isOpenDesktop !== undefined ? isOpenDesktop : (isOpen ?? true);
  const location = useLocation();
  const navigate = useNavigate();
  const { admin } = useAdminAuthStore();
  const { hasPermission, isSuperAdmin } = usePermission();
  const prevPathRef = useState(null);
  const [expandedItems, setExpandedItems] = useState({});
  const [, setIsMobile] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  // Construct complete admin menu inserting Admin Management after Dashboard for Super Admin
  const completeMenu = [];
  adminMenuRaw.forEach((item) => {
    completeMenu.push(item);
    if (item.title === "Dashboard" && isSuperAdmin) {
      completeMenu.push({
        title: "Admin Management",
        route: "/admin/subadmins",
        children: ["Admin Users", "Activity Logs"],
      });
    }
  });

  // Dynamically filter menu items based on permissions
  const adminMenu = completeMenu.filter((item) =>
    hasMenuPermission(item, isSuperAdmin, hasPermission)
  );

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

  // Auto-expand menu items when route changes
  useEffect(() => {
    if (prevPathRef[0] !== location.pathname) {
      prevPathRef[1](location.pathname);
      const { isMatch, chain } = findActiveAncestors(adminMenu, location.pathname);
      if (isMatch && chain.length > 0) {
        setExpandedItems((prev) => {
          const updated = { ...prev };
          chain.forEach((title) => {
            updated[title] = true;
          });
          return updated;
        });
      }
    }
  }, [location.pathname, adminMenu, prevPathRef]);

  // Toggle expanded state for menu items with children
  const toggleExpand = (title) => {
    setExpandedItems((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  // Handle navigation click
  const handleMenuItemClick = (route) => {
    navigate(route);
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  // Generic recursive renderer for menu items
  const renderMenuItem = (item, depth = 0, parentRoute = null) => {
    // Case 1: String child item (e.g. "Privacy Policy")
    if (typeof item === "string") {
      const reqPerm = CHILD_PERMISSION_MAP[item];
      if (reqPerm && !isSuperAdmin && !hasPermission(reqPerm)) {
        return null;
      }

      const childRoute = getChildRoute(parentRoute, item);
      const isChildActive =
        location.pathname === childRoute ||
        (childRoute !== parentRoute &&
          location.pathname.startsWith(childRoute));

      return (
        <div
          key={childRoute + "-" + item}
          onClick={() => handleMenuItemClick(childRoute)}
          className={`
            px-3 py-2 text-xs rounded-lg transition-colors cursor-pointer
            ${
              isChildActive
                ? "bg-primary-500/20 text-white font-semibold shadow-sm"
                : "text-gray-400 hover:bg-slate-700/70 hover:text-gray-200"
            }
          `}>
          {item}
        </div>
      );
    }

    // Case 2: Object item (e.g. { title: "CMS", children: [...] })
    if (!hasMenuPermission(item, isSuperAdmin, hasPermission)) {
      return null;
    }

    const Icon = iconMap[item.title] || FiPackage;
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems[item.title];

    const isExactRouteActive =
      item.route &&
      (item.route === "/admin/dashboard"
        ? location.pathname === "/admin/dashboard"
        : location.pathname === item.route);

    const childMatch = hasChildren
      ? findActiveAncestors(item.children, location.pathname, item.route || parentRoute)
      : { isMatch: false };

    const isActiveParentNode = childMatch.isMatch;
    const isNodeActive = isExactRouteActive || isActiveParentNode;

    let bgClasses = "text-gray-300 hover:bg-slate-700";
    if (isExactRouteActive && !hasChildren) {
      bgClasses = "bg-primary-600 text-white shadow-sm";
    } else if (isNodeActive) {
      bgClasses = "bg-slate-700/70 text-white font-medium";
    }

    const itemPadding =
      depth === 0
        ? "px-4 py-3 text-sm rounded-xl"
        : depth === 1
        ? "px-3 py-2.5 text-xs rounded-lg"
        : "px-3 py-2 text-xs rounded-lg";

    return (
      <div key={item.title || item.route} className={depth === 0 ? "mb-1" : "my-0.5"}>
        {/* Main Menu Item */}
        <div
          className={`
            flex items-center gap-3 transition-all duration-200 cursor-pointer ${itemPadding} ${bgClasses}
          `}
          onClick={() => {
            if (hasChildren) {
              toggleExpand(item.title);
            } else if (item.route) {
              handleMenuItemClick(item.route);
            }
          }}>
          {depth === 0 && (
            <Icon
              className={`text-xl flex-shrink-0 ${
                isNodeActive ? "text-white" : "text-gray-400"
              }`}
            />
          )}
          <span className={`flex-1 ${depth === 0 ? "font-medium" : "font-normal"}`}>
            {item.title}
          </span>
          {hasChildren && (
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}>
              <FiChevronDown className="text-gray-400 text-sm" />
            </motion.div>
          )}
        </div>

        {/* Children Submenu */}
        <AnimatePresence>
          {hasChildren && isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden">
              <div
                className={`mt-1 border-l-2 border-slate-600 space-y-1 ${
                  depth === 0 ? "ml-4 pl-3" : "ml-3 pl-2"
                }`}>
                {item.children.map((child) =>
                  renderMenuItem(child, depth + 1, item.route || parentRoute)
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // Sidebar content
  const sidebarContent = (
    <div className="h-full flex flex-col bg-slate-800 shadow-xl">
      {/* Header Section */}
      <div className="p-4 border-b border-slate-700 bg-slate-900">
        {/* Header with Close Button and Admin Info */}
        <div className="flex items-center justify-between gap-3">
          {/* Admin User Info */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center shadow-md flex-shrink-0">
              <FiUser className="text-white text-xl" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-white text-sm truncate">
                {admin?.name || "Admin User"}
              </h2>
              <p className="text-xs text-gray-400 truncate">
                {admin?.email || "admin@admin.com"}
              </p>
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

      {/* Navigation Menu */}
      <nav className="flex-1 overflow-y-auto p-3 scrollbar-admin lg:pb-3">
        {adminMenu.map((item) => renderMenuItem(item))}
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

      {/* Sidebar - Desktop Fixed */}
      <div 
        className={`hidden lg:flex fixed left-0 top-0 bottom-0 w-64 z-40 transition-all duration-300 ease-in-out ${
          showDesktop 
            ? "translate-x-0 opacity-100 visible pointer-events-auto" 
            : "-translate-x-full opacity-0 invisible pointer-events-none"
        }`}
      >
        {sidebarContent}
      </div>
    </>
  );
};

export default AdminSidebar;
