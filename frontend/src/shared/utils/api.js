import axios from 'axios';
import { toastService } from './toastService';
import { API_BASE_URL } from './constants';

const AUTH_SCOPES = {
  admin: {
    prefix: '/admin',
    accessKey: 'adminToken',
    refreshKey: 'adminRefreshToken',
    persistKey: 'admin-auth-storage',
    loginPath: '/admin/login',
    areaPrefix: '/admin',
  },
  vendor: {
    prefix: '/vendor',
    accessKey: 'vendor-token',
    refreshKey: 'vendor-refresh-token',
    persistKey: 'vendor-auth-storage',
    loginPath: '/vendor/login',
    areaPrefix: '/vendor',
  },
  delivery: {
    prefix: '/delivery',
    accessKey: 'delivery-token',
    refreshKey: 'delivery-refresh-token',
    persistKey: 'delivery-auth-storage',
    loginPath: '/delivery/login',
    areaPrefix: '/delivery',
  },
  user: {
    prefix: '/user',
    accessKey: 'token',
    refreshKey: 'refresh-token',
    persistKey: 'auth-storage',
    loginPath: '/login',
    areaPrefix: '/',
  },
};

const EXCLUDED_AUTH_SUFFIXES = [
  '/auth/login',
  '/auth/register',
  '/auth/verify-otp',
  '/auth/resend-otp',
  '/auth/forgot-password',
  '/auth/verify-reset-otp',
  '/auth/reset-password',
  '/auth/refresh',
  '/auth/logout',
  '/settings/general',
  '/settings/features',
  '/settings/reviews',
];

const refreshInFlight = {
  admin: null,
  vendor: null,
  delivery: null,
  user: null,
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

const AUTH_REDIRECT_LOCK_KEY = 'auth-redirect-lock';
const AUTH_REDIRECT_LOCK_MS = 1500;

const redirectTo = (path) => {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  const currentPath = window.location.pathname;
  const lockUntil = Number(sessionStorage.getItem(AUTH_REDIRECT_LOCK_KEY) || 0);

  if (currentPath === path) return;
  if (now < lockUntil) return;

  sessionStorage.setItem(AUTH_REDIRECT_LOCK_KEY, String(now + AUTH_REDIRECT_LOCK_MS));
  window.location.href = path;
};

const getScopeFromUrl = (url = '') => {
  if (url.startsWith('/admin')) return 'admin';
  if (url.startsWith('/vendor')) return 'vendor';
  if (url.startsWith('/delivery')) return 'delivery';

  if (typeof window !== 'undefined') {
    const path = window.location.pathname;
    if (path.startsWith('/admin')) return 'admin';
    if (path.startsWith('/vendor')) return 'vendor';
    if (path.startsWith('/delivery')) return 'delivery';
  }

  return 'user';
};

const getScopeFromPath = (path = window.location.pathname) => {
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/vendor')) return 'vendor';
  if (path.startsWith('/delivery')) return 'delivery';
  return 'user';
};

const isExcludedAuthRequest = (scope, url = '') => {
  const { prefix } = AUTH_SCOPES[scope];
  return EXCLUDED_AUTH_SUFFIXES.some((suffix) => url.startsWith(`${prefix}${suffix}`));
};

const clearScopeAuth = (scope) => {
  const config = AUTH_SCOPES[scope];
  localStorage.removeItem(config.accessKey);
  localStorage.removeItem(config.refreshKey);
  localStorage.removeItem(config.persistKey);
};

const shouldAttemptRefresh = (error, scope) => {
  if (error?.response?.status !== 401) return false;
  if (!scope || !AUTH_SCOPES[scope]) return false;

  const refreshToken = localStorage.getItem(AUTH_SCOPES[scope].refreshKey);
  if (!refreshToken) return false;

  const originalRequest = error.config || {};
  if (originalRequest._retry) return false;

  const url = originalRequest.url || '';
  if (isExcludedAuthRequest(scope, url)) return false;

  return true;
};

const runRefresh = async (scope) => {
  if (refreshInFlight[scope]) {
    return refreshInFlight[scope];
  }

  const config = AUTH_SCOPES[scope];
  const currentRefreshToken = localStorage.getItem(config.refreshKey);
  if (!currentRefreshToken) {
    throw new Error('No refresh token available.');
  }

  refreshInFlight[scope] = axios
    .post(`${API_BASE_URL}${config.prefix}/auth/refresh`, {
      refreshToken: currentRefreshToken,
    })
    .then((response) => {
      const payload = response?.data?.data || response?.data || {};
      const nextAccessToken = payload?.accessToken;
      const nextRefreshToken = payload?.refreshToken;
      if (!nextAccessToken || !nextRefreshToken) {
        throw new Error('Invalid refresh response from server.');
      }

      localStorage.setItem(config.accessKey, nextAccessToken);
      localStorage.setItem(config.refreshKey, nextRefreshToken);

      return nextAccessToken;
    })
    .finally(() => {
      refreshInFlight[scope] = null;
    });

  return refreshInFlight[scope];
};

api.interceptors.request.use(
  (config) => {
    const scope = getScopeFromUrl(config.url || '');
    const token = localStorage.getItem(AUTH_SCOPES[scope].accessKey);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config || {};
    const scope = getScopeFromUrl(originalRequest.url || '');
    const currentPath = window.location.pathname;
    const pathScope = getScopeFromPath(currentPath);

    if (shouldAttemptRefresh(error, scope)) {
      try {
        const nextAccessToken = await runRefresh(scope);
        originalRequest._retry = true;
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`;
        return api(originalRequest);
      } catch {
        // fallback to existing session-expired handling below
      }
    }

    const message =
      error.response?.data?.message ||
      error.message ||
      'Something went wrong';

    const errorCode = error.response?.data?.errorCode || error.response?.data?.code || error.errorCode;
    if (errorCode === 'SUBSCRIPTION_INACTIVE' || errorCode === 'SUBSCRIPTION_EXPIRED') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vendor-subscription-expired', {
          detail: { message }
        }));
      }
    }

    // Auth components & silent background requests handle their own error UI
    const isSilentUrl = originalRequest.silent || originalRequest.url?.includes('/admin/notifications');
    if (!isExcludedAuthRequest(scope, originalRequest.url) && !isSilentUrl && !error._toastShown) {
      toastService.error(error);
      error._toastShown = true;
    }

    if (error.response?.status === 401) {
      const activeScope = pathScope;
      clearScopeAuth(scope);
      if (scope !== activeScope) {
        return Promise.reject(error);
      }

      const routeConfig = AUTH_SCOPES[scope];
      if (scope === 'user') {
        const isAuthPage =
          currentPath === '/login' ||
          currentPath === '/register' ||
          currentPath === '/verification' ||
          currentPath === '/forgot-password' ||
          currentPath === '/reset-password';
        if (!isAuthPage) {
          redirectTo(routeConfig.loginPath);
        }
      } else if (currentPath.startsWith(routeConfig.areaPrefix) && currentPath !== routeConfig.loginPath) {
        if (!error._toastShown) {
          toastService.error('Session expired. Please login again.');
          error._toastShown = true;
        }
        redirectTo(routeConfig.loginPath);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
