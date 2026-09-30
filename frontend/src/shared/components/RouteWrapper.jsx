import { useLocation } from 'react-router-dom';
import { useEffect } from 'react';

/**
 * Wrapper component that ensures consistent route container styling
 * and path-based component lifecycle.
 */
const RouteWrapper = ({ children }) => {
  const location = useLocation();

  // Track SPA pageviews and custom route events with Meta Pixel
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      window.fbq('track', 'PageView');

      const cleanPath = (location.pathname || '').replace(/\/+$/, '') || '/';
      if (cleanPath === '/vendor/register' || cleanPath === '/sell-on-dwellmart') {
        if (!window.__vendorRegisterPixelTracked) {
          window.fbq('trackCustom', 'VendorRegisterPageVisit');
          window.__vendorRegisterPixelTracked = true;
        }
      } else {
        window.__vendorRegisterPixelTracked = false;
      }
    }
  }, [location.pathname]);

  // Return children with location pathname key to force remount only on distinct path change
  // Without location.search so filter/query updates update in-place rather than unmounting
  return <div key={location.pathname} style={{ width: '100%', height: '100%' }}>{children}</div>;
};

export default RouteWrapper;

