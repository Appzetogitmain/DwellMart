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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const navigate = useNavigate();
  const headerHeight = useAdminHeaderHeight();

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
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <VendorSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:ml-64 min-w-0 max-w-full overflow-x-hidden">
        {/* Header */}
        <VendorHeader onMenuClick={() => setSidebarOpen(true)} />

        {/* Subscription Expired Warning Banner */}
        {isExpired && (
          <div className="fixed top-16 left-0 lg:left-64 right-0 z-[990] bg-amber-500 text-slate-950 px-4 py-2.5 flex items-center justify-between shadow-md text-xs sm:text-sm font-medium border-b border-amber-600">
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
            paddingTop: `${Math.max(topPadding, 80)}px`,
            paddingBottom: `calc(${Math.max(bottomPadding, 80)}px + env(safe-area-inset-bottom, 0px))`,
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

