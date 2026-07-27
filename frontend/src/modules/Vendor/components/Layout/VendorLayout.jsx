import { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { FiAlertTriangle } from 'react-icons/fi';
import VendorSidebar from './VendorSidebar';
import VendorHeader from './VendorHeader';
import VendorBottomNav from './VendorBottomNav';
import SubscriptionExpiredOverlay from '../SubscriptionExpiredOverlay';
import useAdminHeaderHeight from '../../../Admin/hooks/useAdminHeaderHeight';
import api from '../../../../shared/utils/api';

const VendorLayout = () => {
  const [isDesktopOpen, setIsDesktopOpen] = useState(() => {
    const saved = localStorage.getItem('vendor_sidebar_open');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const navigate = useNavigate();
  const headerHeight = useAdminHeaderHeight();

  const toggleSidebar = () => {
    if (window.innerWidth >= 1024) {
      setIsDesktopOpen((prev) => {
        const next = !prev;
        localStorage.setItem('vendor_sidebar_open', JSON.stringify(next));
        return next;
      });
    } else {
      setIsMobileOpen((prev) => !prev);
    }
  };

  const closeSidebar = () => {
    if (window.innerWidth >= 1024) {
      setIsDesktopOpen(false);
      localStorage.setItem('vendor_sidebar_open', JSON.stringify(false));
    } else {
      setIsMobileOpen(false);
    }
  };

  useEffect(() => {
    api.get('/vendor/subscription')
      .then((res) => {
        const data = res?.data;
        if (!data?.hasSubscription || !data?.isActive) {
          setIsExpired(true);
        } else {
          setIsExpired(false);
        }
      })
      .catch(() => {
        // If error code is SUBSCRIPTION_INACTIVE or 403, mark as expired
        setIsExpired(true);
      });
  }, []);

  // Bottom nav height is 64px (h-16)
  const bottomNavHeight = 64;

  // Add small buffer to prevent content overlap (8px)
  const topPadding = headerHeight + (isExpired ? 50 : 8);
  const bottomPadding = bottomNavHeight + 8;

  return (
    <div className="h-screen w-full bg-gray-50 flex overflow-hidden">
      {/* Sidebar */}
      <VendorSidebar
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
        <VendorHeader
          onMenuClick={toggleSidebar}
          isDesktopSidebarOpen={isDesktopOpen}
        />

        {/* Subscription Expired Warning Banner */}
        {isExpired && (
          <div className="shrink-0 sticky top-0 z-20 w-full bg-amber-500 text-slate-950 px-4 py-2.5 flex items-center justify-between shadow-md text-xs sm:text-sm font-medium border-b border-amber-600">
            <div className="flex items-center gap-2">
              <FiAlertTriangle className="text-lg shrink-0 text-slate-950" />
              <span>
                <strong>Subscription Expired:</strong> You are browsing in <strong>View-Only</strong> mode. Resubscribe to edit products, update orders, or modify settings.
              </span>
            </div>
            <button
              onClick={() => navigate('/vendor/renew-subscription')}
              className="px-3 py-1 bg-slate-900 text-[#ffc101] font-extrabold rounded-lg hover:bg-black transition-colors shrink-0 text-xs ml-2 shadow-sm"
            >
              Resubscribe Now
            </button>
          </div>
        )}

        {/* Page Content */}
        <main
          className="flex-1 p-3 sm:p-4 lg:p-6 overflow-y-auto overflow-x-hidden lg:pb-6 scrollbar-admin w-full min-w-0"
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
      <VendorBottomNav />

      {/* Dynamic Overlay when user attempts active actions */}
      <SubscriptionExpiredOverlay isOpen={false} />
    </div>
  );
};

export default VendorLayout;

