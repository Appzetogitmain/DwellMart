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
  const getPageName = (pathname) => {
    const path = pathname.split('/').pop() || 'dashboard';
    const pageNames = {
      dashboard: 'Dashboard',
      products: 'Products',
      categories: 'Categories',
      brands: 'Brands',
      orders: 'Orders',
      customers: 'Customers',
      inventory: 'Inventory',
      campaigns: 'Campaigns',
      banners: 'Banners',
      testimonials: 'Testimonials',
      reviews: 'Reviews',
      analytics: 'Analytics',
      content: 'Content',
      settings: 'Settings',
      more: 'More',
    };
    return pageNames[path] || path.charAt(0).toUpperCase() + path.slice(1);
  };

  const pageName = getPageName(location.pathname);

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
            <p className="text-xs sm:text-sm text-slate-400 font-medium hidden sm:block">Welcome back! Here's your business overview.</p>
          </div>
        </div>

        {/* Right: Notifications & Logout */}
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          {/* Notifications */}
          <div className="relative">
            <NotificationBell className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center p-0" iconClassName="text-lg text-white" />
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

