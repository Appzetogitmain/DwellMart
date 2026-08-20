import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useDeliveryAuthStore } from '../store/deliveryStore';

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

const DeliveryProtectedRoute = ({ children }) => {
  const { isAuthenticated, token, logout } = useDeliveryAuthStore();
  const location = useLocation();
  const accessToken = token || localStorage.getItem('delivery-token');
  const payload = decodeJwtPayload(accessToken);
  const role = String(payload?.role || '').toLowerCase();
  const tokenExpiryMs =
    typeof payload?.exp === 'number' ? payload.exp * 1000 : null;
  const isExpired = tokenExpiryMs ? Date.now() >= tokenExpiryMs : false;
  const hasValidRole = role === 'delivery';
  const hasRoleClaim = Boolean(role);

  const isSessionInvalid =
    !accessToken || isExpired || (hasRoleClaim && !hasValidRole);

  useEffect(() => {
    if ((isAuthenticated || accessToken) && isSessionInvalid) {
      logout();
    }
  }, [isAuthenticated, accessToken, isSessionInvalid, logout]);

  if (!isAuthenticated || isSessionInvalid) {
    return <Navigate to="/delivery/login" state={{ from: location }} replace />;
  }

  return children;
};

export default DeliveryProtectedRoute;
