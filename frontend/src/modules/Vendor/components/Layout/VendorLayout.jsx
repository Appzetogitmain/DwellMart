import { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { FiAlertTriangle, FiClock } from 'react-icons/fi';
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
  const [subscription, setSubscription] = useState(null);
  const [isExpired, setIsExpired] = useState(false);
  const [isExpiringSoon, setIsExpiringSoon] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState(0);

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
        const sub = data?.subscription || null;
        setSubscription(sub);

        const isActive = Boolean(data?.hasSubscription && data?.isActive);
        
        if (!isActive) {
          setIsExpired(true);
          setIsExpiringSoon(false);
        } else {
          setIsExpired(false);
          const periodEnd = sub?.current_period_end;
          let daysLeft = 14; // Default 14 days for test active vendors
          if (periodEnd) {
            const diff = new Date(periodEnd).getTime() - Date.now();
            daysLeft = Math.max(Math.ceil(diff / (24 * 60 * 60 * 1000)), 0);
          }
          setDaysRemaining(daysLeft);

          // Expiring soon warning if 14 days or less remaining
          if (daysLeft <= 14) {
            setIsExpiringSoon(true);
          } else {
            setIsExpiringSoon(false);
          }
        }
      })
      .catch(() => {
        setIsExpired(true);
      });
  }, []);

  // Bottom nav height is 64px (h-16)
  const bottomNavHeight = 64;

  const topPadding = headerHeight + (isExpired || isExpiringSoon ? 50 : 8);
  const bottomPadding = bottomNavHeight + 8;

  return (
    <div className="h-screen w-full bg-slate-900 flex overflow-hidden">
      {/* Sidebar */}
      <VendorSidebar
        isOpenMobile={isMobileOpen}
        isOpenDesktop={isDesktopOpen}
        onClose={closeSidebar}
      />

      {/* Main Content */}
      <div
        className={`flex-1 flex flex-col h-screen min-w-0 max-w-full overflow-hidden transition-all duration-300 bg-slate-900 ${
          isDesktopOpen ? 'lg:ml-64' : 'lg:ml-0'
        }`}
      >
        {/* Header with embedded Subscription Warning Banner */}
        <VendorHeader
          onMenuClick={toggleSidebar}
          isDesktopSidebarOpen={isDesktopOpen}
          subscriptionInfo={{ subscription, isExpired, isExpiringSoon, daysRemaining }}
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
      <VendorBottomNav />

      {/* Dynamic Overlay when user attempts active actions */}
      <SubscriptionExpiredOverlay isOpen={false} />
    </div>
  );
};

export default VendorLayout;

