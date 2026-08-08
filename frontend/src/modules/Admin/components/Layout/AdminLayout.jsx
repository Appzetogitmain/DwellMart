import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import AdminHeader from './AdminHeader';
import AdminBottomNav from './AdminBottomNav';
import useAdminHeaderHeight from '../../hooks/useAdminHeaderHeight';
import { initNotificationListeners } from '../../../../shared/services/notificationSocketService';

const AdminLayout = () => {
  const [isDesktopOpen, setIsDesktopOpen] = useState(() => {
    const saved = localStorage.getItem('admin_sidebar_open');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const headerHeight = useAdminHeaderHeight();

  // Initialize Socket.IO notification listeners for the entire admin session
  useEffect(() => {
    initNotificationListeners();
  }, []);


  const toggleSidebar = () => {
    if (window.innerWidth >= 1024) {
      setIsDesktopOpen((prev) => {
        const next = !prev;
        localStorage.setItem('admin_sidebar_open', JSON.stringify(next));
        return next;
      });
    } else {
      setIsMobileOpen((prev) => !prev);
    }
  };

  const closeSidebar = () => {
    if (window.innerWidth >= 1024) {
      setIsDesktopOpen(false);
      localStorage.setItem('admin_sidebar_open', JSON.stringify(false));
    } else {
      setIsMobileOpen(false);
    }
  };
  
  // Bottom nav height is 64px (h-16)
  const bottomNavHeight = 64;
  
  // Add small buffer to prevent content overlap (8px)
  const topPadding = headerHeight + 8;
  const bottomPadding = bottomNavHeight + 8;

  return (
    <div className="h-screen w-full bg-gray-50 flex overflow-hidden">
      {/* Sidebar */}
      <AdminSidebar
        isOpenMobile={isMobileOpen}
        isOpenDesktop={isDesktopOpen}
        onClose={closeSidebar}
      />

      {/* Main Content */}
      <div
        className={`flex-1 flex flex-col h-screen min-w-0 max-w-full overflow-hidden transition-all duration-300 ${
          isDesktopOpen ? 'lg:ml-64' : 'lg:ml-0'
        }`}
      >
        {/* Header */}
        <AdminHeader
          onMenuClick={toggleSidebar}
          isDesktopSidebarOpen={isDesktopOpen}
        />

        {/* Page Content */}
        <main 
          className="flex-1 bg-gray-50 px-4 sm:px-6 lg:px-10 xl:px-12 py-6 sm:py-8 overflow-y-auto overflow-x-hidden scrollbar-admin w-full min-w-0"
          style={{
            paddingBottom: `calc(${Math.max(bottomPadding, 64)}px + env(safe-area-inset-bottom, 0px))`,
          }}
        >
          <div className="w-full max-w-full overflow-x-hidden min-w-0">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Bottom Navigation - Mobile Only */}
      <AdminBottomNav />
    </div>
  );
};

export default AdminLayout;

