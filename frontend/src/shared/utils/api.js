import axios from 'axios';
import { toastService } from './toastService';
import { API_BASE_URL } from './constants';
import { getExperience } from './experience';
import { VENDOR_MULTI_CHANNEL_ENABLED } from '../config/vendorChannels';

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

// Endpoints that are called as background/optional features — 401 is expected
// when the user is a guest. Never show a toast or redirect for these.
const SILENT_BACKGROUND_ENDPOINTS = [
  '/notifications/unread-count',
  '/notifications',
  '/device-tokens/register',
  '/device-tokens/unregister',
  '/support/unread-count',
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
  if (scope === 'vendor' && typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('vendor-last-workspace');
  }
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
    // Tell the API which shopping experience the customer is in. The server
    // defaults to marketplace, so sending this is additive and safe. An explicit
    // ?experience= param on the request always wins.
    if (!config.params?.experience) {
      config.headers['X-Experience'] = getExperience();
    }
    // Workspace is URL-authoritative and therefore tab-safe. The header is
    // only a selector; the backend independently verifies channel authority.
    if (VENDOR_MULTI_CHANNEL_ENABLED && scope === 'vendor' && typeof window !== 'undefined') {
      const workspace = new URLSearchParams(window.location.search).get('workspace');
      if (!config.headers['X-Vendor-Workspace'] && ['retail', 'wholesale', 'quick_commerce'].includes(workspace)) {
        config.headers['X-Vendor-Workspace'] = workspace;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    // ── Silently ignore intentionally cancelled/aborted requests ────────────
    // These happen when the user navigates away or a new search supersedes
    // the previous one (AbortController). Never show a toast for these.
    if (
      error?.code === 'ERR_CANCELED' ||
      error?.name === 'CanceledError' ||
      error?.name === 'AbortError' ||
      axios.isCancel?.(error)
    ) {
      return Promise.reject(error);
    }

    const originalRequest = error.config || {};
    const requestUrl = originalRequest.url || '';
    const scope = getScopeFromUrl(requestUrl);
    const currentPath = window.location.pathname;
    const pathScope = getScopeFromPath(currentPath);

    // ── Silent background endpoints — 401 is expected for guests ────────────
    // Notification and device-token endpoints are called optimistically for
    // logged-in users. When the user is a guest these return 401, which is
    // intentional and should never pop up a toast or trigger a redirect.
    const isSilentBackground = SILENT_BACKGROUND_ENDPOINTS.some((ep) => requestUrl.includes(ep));
    if (isSilentBackground) {
      return Promise.reject(error);
    }

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

    // Auth components & silent background requests handle their own error UI.
    // Suppress 404 resource-not-found toasts on GET requests (page views handle their own empty/not-found UI).
    const isGet404 = (originalRequest.method || 'get').toLowerCase() === 'get' && error.response?.status === 404;
    const isSilentUrl = originalRequest.silent || isGet404 || originalRequest.url?.includes('/admin/notifications');
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
        // Only redirect to login when the user is on a PROTECTED page.
        // Public pages (/search, /product/*, /, /category/*, etc.) should
        // never redirect guest users to login on a background 401.
        const PROTECTED_USER_PATHS = ['/profile', '/orders', '/checkout', '/wishlist', '/addresses'];
        const isProtectedPage = PROTECTED_USER_PATHS.some((p) => currentPath.startsWith(p));
        const isAuthPage =
          currentPath === '/login' ||
          currentPath === '/register' ||
          currentPath === '/verification' ||
          currentPath === '/forgot-password' ||
          currentPath === '/reset-password';
        if (isProtectedPage && !isAuthPage) {
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
