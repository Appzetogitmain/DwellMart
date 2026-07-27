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
} from "react-icons/fi";
import { useAdminAuthStore } from "../../store/adminStore";
import adminMenu from "../../config/adminMenu.json";

// Icon mapping for menu items
const iconMap = {
  Dashboard: FiHome,
  Orders: FiShoppingBag,
  "Return Requests": FiRotateCcw,
  Products: FiPackage,
  Categories: FiGrid,
  Brands: FiTag,
  Customers: FiUsers,
  "Delivery Management": FiTruck,
  "Offers & Sliders": FiImage,
  Banners: FiImage,
  Testimonials: FiStar,
  "Promo Codes": FiPercent,
  Notifications: FiBell,
  "Support Desk": FiMessageCircle,
  Reports: FiFileText,
  "Analytics & Finance": FiBarChart2,
  Settings: FiSettings,
  Policies: FiShield,
  "Sell on DwellMart": FiShoppingBag,
};

// Helper function to convert child name to route path
const getChildRoute = (parentRoute, childName) => {
  const routeMap = {
    "/admin/orders": {
      "All Orders": "/admin/orders/all-orders",
      "Order Tracking": "/admin/orders/order-tracking",
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
    "/admin/settings": {
      General: "/admin/settings/general",
      "Payment & Shipping": "/admin/settings/payment-shipping",
      "Content & Features": "/admin/settings/content-features",
    },
    "/admin/policies": {
      "Privacy Policy": "/admin/policies/privacy-policy",
      "Returns & Exchanges": "/admin/policies/refund-policy",
      "Terms & Conditions": "/admin/policies/terms-conditions",
      "About Us": "/admin/policies/about-us",
      "Contact Us": "/admin/policies/contact-us",
      "Shipping Policy": "/admin/policies/shipping-policy",
      "FAQs": "/admin/policies/faqs",
      "Become a Partner": "/admin/policies/become-partner",
    },
    "/admin/sell-on-dwellmart": {
      "Subscription Plans": "/admin/subscription-plans",
      "Vendor Terms": "/admin/vendor-terms",
    },
  };

  return routeMap[parentRoute]?.[childName] || parentRoute;
};

const AdminSidebar = ({ isOpen, isOpenMobile, isOpenDesktop, onClose }) => {
  const showMobile = isOpenMobile !== undefined ? isOpenMobile : isOpen;
  const showDesktop = isOpenDesktop !== undefined ? isOpenDesktop : (isOpen ?? true);
  const location = useLocation();
  const navigate = useNavigate();
  const { admin } = useAdminAuthStore();
  const [expandedItems, setExpandedItems] = useState({});
  const [isMobile, setIsMobile] = useState(false);

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
    // Only close when route actually changes, not when sidebar opens
    if (window.innerWidth < 1024) {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]); // Only trigger on route changes

  // Auto-expand menu items when their route is active (only if viewing a child route)
  useEffect(() => {
    const activeItem = adminMenu.find((item) => {
      if (item.route === "/admin/dashboard") {
        return location.pathname === "/admin/dashboard";
      }
      // Check if current path is a child of this item (not just the parent route itself)
      const isChildRoute =
        location.pathname.startsWith(item.route) &&
        location.pathname !== item.route;
      return isChildRoute;
    });
    if (activeItem && activeItem.children && activeItem.children.length > 0) {
      // Only expand if we're actually on a child route, keep the parent open
      setExpandedItems((prev) => {
        // If the parent is already expanded, keep it expanded (don't close others)
        // This allows navigation between child items without closing the dropdown
        if (prev[activeItem.title]) {
          return prev;
        }
        // Otherwise, close all others and expand this one
        return {
          [activeItem.title]: true,
        };
      });
    } else {
      // If not on a child route, check if we should close expanded items
      // Only close if we're navigating to a completely different parent route
      const currentParent = adminMenu.find((item) => {
        if (item.route === "/admin/dashboard") {
          return location.pathname === "/admin/dashboard";
        }
        return location.pathname.startsWith(item.route);
      });
      // If we're on a parent route without children, close all expanded items
      if (
        currentParent &&
        (!currentParent.children || currentParent.children.length === 0)
      ) {
        setExpandedItems({});
      }
      // If we're on a parent route with children, keep it expanded if it was already expanded
    }
  }, [location.pathname]);

  // Check if a menu item is active
  const isActive = (route) => {
    if (route === "/admin/dashboard") {
      return location.pathname === "/admin/dashboard";
    }
    return location.pathname.startsWith(route);
  };

  // Toggle expanded state for menu items with children
  const toggleExpand = (title, closeOthers = true) => {
    setExpandedItems((prev) => {
      if (closeOthers) {
        // Close all other expanded items and toggle the clicked one
        return {
          [title]: !prev[title],
        };
      } else {
        // Just toggle the clicked item
        return {
          ...prev,
          [title]: !prev[title],
        };
      }
    });
  };

  // Close all expanded items
  const closeAllExpanded = () => {
    setExpandedItems({});
  };

  // Handle menu item click
  const handleMenuItemClick = (route, parentTitle = null) => {
    // If navigating to a child route, keep the parent expanded
    if (parentTitle) {
      setExpandedItems((prev) => {
        // Close all other expanded items, but keep the current parent open
        return {
          [parentTitle]: true,
        };
      });
    } else {
      // If navigating to a parent route without children, close all expanded items
      closeAllExpanded();
    }
    navigate(route);
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
            ${active
              ? "bg-primary-600 text-white shadow-sm"
              : "text-gray-300 hover:bg-slate-700"
            }
          `}
          onClick={() => {
            if (hasChildren) {
              // Close all other expanded items when clicking on a parent with children
              toggleExpand(item.title, true);
            } else {
              // Close all expanded items when clicking on a parent without children
              handleMenuItemClick(item.route);
            }
          }}>
          <Icon
            className={`text-xl flex-shrink-0 ${active ? "text-white" : "text-gray-400"
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
                        ${isChildActive
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
        className={`hidden lg:flex fixed left-0 top-0 bottom-0 w-64 z-40 transition-transform duration-300 ease-in-out ${
          showDesktop ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </div>
    </>
  );
};

export default AdminSidebar;
