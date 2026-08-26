import { useState, useEffect } from 'react';
import { FiMenu, FiBell, FiLogOut } from 'react-icons/fi';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuthStore } from '../../store/adminStore';
import { useNotificationStore } from '../../store/notificationStore';
import { usePermission } from '../../hooks/usePermission';
import toast from 'react-hot-toast';
import Button from '../Button';
import NotificationWindow from './NotificationWindow';
import NotificationBell from '../../../../shared/components/Notifications/NotificationBell';

const AdminHeader = ({ onMenuClick, isDesktopSidebarOpen = true }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAdminAuthStore();
  const { isSuperAdmin, hasPermission } = usePermission();
  const { notifications, unreadCount, fetchNotifications } = useNotificationStore();
  const [showNotifications, setShowNotifications] = useState(false);

  const canViewNotifications = isSuperAdmin || hasPermission('dashboard.view');

  useEffect(() => {
    if (!canViewNotifications) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000); // Poll every minute
    return () => clearInterval(interval);
  }, [fetchNotifications, canViewNotifications]);

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/admin/login');
  };

  const toggleNotifications = () => {
    setShowNotifications(!showNotifications);
  };

  // Get page name from pathname
  const getPageInfo = (pathname) => {
    // Check specific patterns first
    if (/^\/admin\/vendors\/[a-fA-F0-9]{24}/.test(pathname)) {
      return { title: 'Vendor Details', subtitle: 'View and manage vendor configuration, channels, and orders' };
    }
    if (/^\/admin\/orders\/[a-fA-F0-9]{24}/.test(pathname)) {
      return { title: 'Order Details', subtitle: 'View order items, customer information, and delivery status' };
    }
    if (/^\/admin\/(customers|users)\/[a-fA-F0-9]{24}/.test(pathname)) {
      return { title: 'Customer Details', subtitle: 'View customer profile, activity, and order history' };
    }
    if (/^\/admin\/delivery\/[a-fA-F0-9]{24}/.test(pathname)) {
      return { title: 'Delivery Partner Details', subtitle: 'View rider profile, documents, and cash settlement' };
    }
    if (/^\/admin\/products\/[a-fA-F0-9]{24}/.test(pathname)) {
      return { title: 'Product Details', subtitle: 'View product inventory, pricing, and variant details' };
    }

    const segments = pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] || 'dashboard';

    // If last segment looks like an ID, fall back to previous segment + Details
    if (/^[a-fA-F0-9]{24}$/.test(last) && segments.length >= 2) {
      const parent = segments[segments.length - 2];
      const singular = parent.endsWith('s') ? parent.slice(0, -1) : parent;
      const formatted = singular.charAt(0).toUpperCase() + singular.slice(1);
      return { title: `${formatted} Details`, subtitle: "Here's the detailed overview and management controls." };
    }

    const pageMap = {
      dashboard: { title: 'Dashboard', subtitle: "Welcome back! Here's your business overview." },
      'manage-vendors': { title: 'Manage Vendors', subtitle: 'View and manage all registered vendors and store settings' },
      'pending-approvals': { title: 'Pending Approvals', subtitle: 'Review and approve pending vendor and delivery applications' },
      vendors: { title: 'Vendors', subtitle: 'Manage marketplace sellers and store channels' },
      products: { title: 'Products', subtitle: 'Catalog products, pricing rules, and inventory levels' },
      categories: { title: 'Categories', subtitle: 'Marketplace taxonomy, categories, and brand registry' },
      brands: { title: 'Brands', subtitle: 'Manage brand profiles and official brand stores' },
      orders: { title: 'Orders', subtitle: 'Track and manage all customer orders and fulfillments' },
      customers: { title: 'Customers', subtitle: 'Customer profiles, delivery addresses, and activity' },
      users: { title: 'Users', subtitle: 'User accounts and customer management' },
      delivery: { title: 'Delivery Partners', subtitle: 'Manage delivery riders, payouts, and cash collection' },
      inventory: { title: 'Inventory', subtitle: 'Monitor stock levels and reservation thresholds' },
      settlements: { title: 'Settlements', subtitle: 'Manage vendor and partner financial payouts' },
      wallet: { title: 'Wallet & Finance', subtitle: 'Revenue, settlements, refunds, and financial summaries' },
      refunds: { title: 'Refunds', subtitle: 'Process customer refund requests and returns' },
      reports: { title: 'Reports & Analytics', subtitle: 'Sales, performance, and operational analytics' },
      analytics: { title: 'Analytics', subtitle: 'Comprehensive platform performance metrics' },
      banners: { title: 'Banners', subtitle: 'Promotional banners and homepage displays' },
      sliders: { title: 'Sliders', subtitle: 'Hero image sliders and festival campaigns' },
      offers: { title: 'Offers & Campaigns', subtitle: 'Discounts, seasonal sales, and promotional offers' },
      promocodes: { title: 'Promo Codes', subtitle: 'Create and manage coupon discount codes' },
      support: { title: 'Support Desk', subtitle: 'Customer, vendor, and delivery partner support conversations' },
      settings: { title: 'Settings', subtitle: 'Platform configurations, policies, and system preferences' },
    };

    if (pageMap[last]) return pageMap[last];

    const formattedTitle = last.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return { title: formattedTitle, subtitle: "Manage platform operations and settings." };
  };

  const { title: pageName, subtitle: pageSubtitle } = getPageInfo(location.pathname);

  return (
    <header
      className="shrink-0 sticky top-0 z-30 w-full bg-slate-900 border-b border-slate-800 text-white shadow-sm transition-all duration-200"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div className="flex items-center justify-between px-4 sm:px-6 lg:px-10 xl:px-12 py-4">
        {/* Left: Menu Button & Page Heading */}
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={onMenuClick}
            className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center border border-slate-700 transition-colors shadow-xs shrink-0"
            aria-label="Toggle Sidebar"
            title="Toggle Sidebar"
          >
            <FiMenu className="text-xl text-white" />
          </button>

          {/* Page Heading */}
          <div>
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-white tracking-tight">{pageName}</h1>
            <p className="text-xs sm:text-sm text-slate-400 font-medium hidden sm:block">{pageSubtitle}</p>
          </div>
        </div>

        {/* Right: Notifications & Logout */}
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          {/* Notifications */}
          <div className="relative">
            <NotificationBell className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center p-0 cursor-pointer" iconClassName="text-lg text-white" />
          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="px-3 sm:px-3.5 py-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-600 hover:text-white border border-red-500/30 transition-all font-semibold text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 shadow-xs shrink-0"
          >
            <FiLogOut className="text-base" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default AdminHeader;

