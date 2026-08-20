import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

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

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, user, token, logout } = useAuthStore();
  const location = useLocation();
  const accessToken = token || localStorage.getItem('token');
  const tokenPayload = decodeJwtPayload(accessToken);
  const resolvedRole = String(user?.role || tokenPayload?.role || '').toLowerCase();
  const tokenExpiryMs =
    typeof tokenPayload?.exp === 'number' ? tokenPayload.exp * 1000 : null;
  const isExpired = tokenExpiryMs ? Date.now() >= tokenExpiryMs : false;
  const hasValidRole = !resolvedRole || resolvedRole === 'customer';

  const isSessionInvalid =
    !accessToken || isExpired || !hasValidRole;

  useEffect(() => {
    if ((isAuthenticated || accessToken) && isSessionInvalid) {
      if (typeof logout === 'function') {
        logout();
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('refresh-token');
        localStorage.removeItem('auth-storage');
      }
    }
  }, [isAuthenticated, accessToken, isSessionInvalid, logout]);

  if (!isAuthenticated || isSessionInvalid) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;
