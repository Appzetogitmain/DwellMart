import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import MobileHeader from './MobileHeader';
import DesktopHeader from './DesktopHeader';
import MobileBottomNav from './MobileBottomNav';
import MobileCartBar from './MobileCartBar';
import CartDrawer from '../../../../shared/components/Cart/CartDrawer';
import useMobileHeaderHeight from '../../hooks/useMobileHeaderHeight';
import Footer from './Footer';

const MobileLayout = ({ children, showBottomNav = true, showCartBar = true }) => {
  const location = useLocation();
  const headerHeight = useMobileHeaderHeight();
  // Hide header and bottom nav on login, register, and verification pages
  const isAuthPage = [
    '/login',
    '/register',
    '/verification',
    '/forgot-password',
    '/reset-password',
  ].includes(location.pathname);

  const isCheckoutPage = location.pathname === '/checkout';

  // Respect the showBottomNav prop and hide on auth pages
  const shouldShowBottomNav = showBottomNav && !isAuthPage;
  // Hide header on categories, search, wishlist, profile, orders, addresses, and auth pages
  const shouldShowHeader = !isAuthPage &&
    location.pathname !== '/categories' &&
    location.pathname !== '/search' &&
    location.pathname !== '/wishlist' &&
    location.pathname !== '/profile' &&
    location.pathname !== '/orders' &&
    location.pathname !== '/addresses' &&
    !isCheckoutPage;

  // Ensure body scroll is restored and dark background is set on auth pages
  useEffect(() => {
    document.body.style.overflowY = '';
    if (isAuthPage) {
      document.body.style.backgroundColor = '#0B0F17';
    } else {
      document.body.style.backgroundColor = '';
    }
    return () => {
      document.body.style.overflowY = '';
      document.body.style.backgroundColor = '';
    };
  }, [isAuthPage]);

  return (
    <>
      {!isAuthPage && !isCheckoutPage && <DesktopHeader />}
      {shouldShowHeader && <MobileHeader />}
      <main
        className={`min-h-screen w-full ${
          isAuthPage ? 'max-w-full px-0 bg-[#0B0F17]' : 'max-w-[1920px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 xl:px-10'
        } overflow-x-hidden ${shouldShowBottomNav ? 'pb-20' : ''} ${showCartBar ? 'pb-24' : ''}`}
        style={{ paddingTop: shouldShowHeader ? `${headerHeight}px` : '0px' }}
      >
        {children}
      </main>
      {!isAuthPage && !isCheckoutPage && <Footer />}
      {showCartBar && <MobileCartBar />}
      {shouldShowBottomNav && <MobileBottomNav />}
      <CartDrawer />
    </>
  );
};

export default MobileLayout;


