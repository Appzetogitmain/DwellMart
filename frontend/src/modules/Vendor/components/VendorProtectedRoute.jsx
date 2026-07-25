import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useVendorAuthStore } from '../store/vendorAuthStore';
import SubscriptionExpiredOverlay from './SubscriptionExpiredOverlay';
import api from '../../../shared/utils/api';

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

const VendorProtectedRoute = ({ children }) => {
  const { isAuthenticated, token } = useVendorAuthStore();
  const location = useLocation();
  const accessToken = token || localStorage.getItem('vendor-token');
  const payload = decodeJwtPayload(accessToken);
  const role = String(payload?.role || '').toLowerCase();
  const tokenExpiryMs =
    typeof payload?.exp === 'number' ? payload.exp * 1000 : null;
  const isExpired = tokenExpiryMs ? Date.now() >= tokenExpiryMs : false;

  const [subscriptionStatus, setSubscriptionStatus] = useState('loading');

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    const checkSubscription = async () => {
      try {
        const res = await api.get('/vendor/subscription');
        const data = res?.data;
        if (data?.hasSubscription && data?.isActive) {
          setSubscriptionStatus('active');
        } else {
          setSubscriptionStatus('expired');
        }
      } catch (err) {
        const errorCode = err?.response?.data?.errorCode || err?.errorCode;
        if (errorCode === 'SUBSCRIPTION_EXPIRED' || errorCode === 'SUBSCRIPTION_INACTIVE') {
          setSubscriptionStatus('expired');
        } else {
          // For other errors (network, etc.), allow access to avoid lockout
          setSubscriptionStatus('active');
        }
      }
    };

    checkSubscription();
  }, [isAuthenticated, accessToken]);

  if (!isAuthenticated || !accessToken) {
    return <Navigate to="/vendor/login" state={{ from: location }} replace />;
  }

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

  if (subscriptionStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-500" />
      </div>
    );
  }

  if (subscriptionStatus === 'expired') {
    return (
      <>
        {children}
        <SubscriptionExpiredOverlay isOpen={false} />
      </>
    );
  }

  return children;
};

export default VendorProtectedRoute;

