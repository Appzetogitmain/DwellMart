import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useVendorAuthStore } from '../store/vendorAuthStore';

const decodeJwtPayload = (token) => {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = window.atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
};

/**
 * VendorProtectedRoute — Auth gate ONLY.
 *
 * Only checks whether a valid, non-expired vendor JWT exists.
 * Subscription status is intentionally NOT checked here to avoid
 * a full-page spinner flash on every navigation.
 * VendorLayout owns the subscription check and shows its own
 * non-blocking banners/overlays without remounting the whole tree.
 */
const VendorProtectedRoute = ({ children }) => {
  const { isAuthenticated, token } = useVendorAuthStore();
  const location = useLocation();
  const accessToken = token || localStorage.getItem('vendor-token');

  // Re-hydrate vendor auth state from localStorage on page refresh
  useEffect(() => {
    if (!isAuthenticated && accessToken) {
      useVendorAuthStore.getState().initialize();
    }
  }, [isAuthenticated, accessToken]);

  if (!accessToken) {
    return <Navigate to="/vendor/login" state={{ from: location }} replace />;
  }

  const payload = decodeJwtPayload(accessToken);
  const role = String(payload?.role || '').toLowerCase();
  const tokenExpiryMs =
    typeof payload?.exp === 'number' ? payload.exp * 1000 : null;
  const isExpired = tokenExpiryMs ? Date.now() >= tokenExpiryMs : false;

  if (isExpired) {
    localStorage.removeItem('vendor-token');
    localStorage.removeItem('vendor-refresh-token');
    localStorage.removeItem('vendor-auth-storage');
    return <Navigate to="/vendor/login" state={{ from: location }} replace />;
  }

  if (role && role !== 'vendor') {
    localStorage.removeItem('vendor-token');
    localStorage.removeItem('vendor-refresh-token');
    localStorage.removeItem('vendor-auth-storage');
    return <Navigate to="/vendor/login" state={{ from: location }} replace />;
  }

  return children;
};

export default VendorProtectedRoute;

