import { ERROR_CODES } from '../constants/errorCodes';

export const ERROR_TYPES = {
  AUTH_ERROR: 'AUTH_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BUSINESS_ERROR: 'BUSINESS_ERROR',
  PERMISSION_ERROR: 'PERMISSION_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

export const ERROR_SEVERITY = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL',
};

const isDev = Boolean(import.meta.env?.DEV);

/**
 * Utility to parse, categorize, and translate raw or API errors into user-friendly error objects.
 * Enforces error severities, rich retry metadata, and debug payload for developer diagnostics.
 */
export const getUserFriendlyError = (error, defaultFallback = 'Something went wrong. Please try again.') => {
  if (!error) {
    return {
      type: ERROR_TYPES.UNKNOWN_ERROR,
      severity: ERROR_SEVERITY.INFO,
      title: 'Notice',
      message: defaultFallback,
      retry: { retryable: false, action: null },
    };
  }

  const backendCode = error.response?.data?.code || error.code;
  const backendMessage = error.response?.data?.message;
  const requestId = error.response?.data?.requestId || error.requestId;
  const timestamp = error.response?.data?.timestamp || new Date().toISOString();
  const status = error.response?.status;
  const debug = isDev ? (error.response?.data?.debug || { rawMessage: error.message, stack: error.stack }) : undefined;

  // 1. Code-First Resolution (Preferred System Path)
  if (backendCode) {
    switch (backendCode) {
      case ERROR_CODES.AUTH_REQUIRED:
      case ERROR_CODES.INVALID_TOKEN:
        return {
          type: ERROR_TYPES.AUTH_ERROR,
          severity: ERROR_SEVERITY.WARNING,
          title: 'Session Expired',
          message: 'Please login again to continue.',
          requestId,
          timestamp,
          retry: { retryable: true, action: 'Login' },
          debug,
        };
      case ERROR_CODES.PERMISSION_DENIED:
        return {
          type: ERROR_TYPES.PERMISSION_ERROR,
          severity: ERROR_SEVERITY.ERROR,
          title: 'Access Denied',
          message: "You don't have permission to perform this action.",
          requestId,
          timestamp,
          retry: { retryable: false, action: null },
          debug,
        };
      case ERROR_CODES.RESOURCE_NOT_FOUND:
        return {
          type: ERROR_TYPES.BUSINESS_ERROR,
          severity: ERROR_SEVERITY.INFO,
          title: 'Not Found',
          message: backendMessage || 'The requested resource was not found.',
          requestId,
          timestamp,
          retry: { retryable: false, action: null },
          debug,
        };
      case ERROR_CODES.DUPLICATE_RESOURCE:
        return {
          type: ERROR_TYPES.BUSINESS_ERROR,
          severity: ERROR_SEVERITY.WARNING,
          title: 'Already Exists',
          message: backendMessage || 'This record already exists.',
          requestId,
          timestamp,
          retry: { retryable: false, action: null },
          debug,
        };
      case ERROR_CODES.OUT_OF_STOCK:
        return {
          type: ERROR_TYPES.BUSINESS_ERROR,
          severity: ERROR_SEVERITY.WARNING,
          title: 'Stock Limit',
          message: backendMessage || 'Item is currently out of stock.',
          requestId,
          timestamp,
          retry: { retryable: false, action: null },
          debug,
        };
      case ERROR_CODES.COUPON_EXPIRED:
        return {
          type: ERROR_TYPES.BUSINESS_ERROR,
          severity: ERROR_SEVERITY.INFO,
          title: 'Coupon Expired',
          message: backendMessage || 'This coupon code has expired.',
          requestId,
          timestamp,
          retry: { retryable: false, action: null },
          debug,
        };
      case ERROR_CODES.INSUFFICIENT_FUNDS:
        return {
          type: ERROR_TYPES.BUSINESS_ERROR,
          severity: ERROR_SEVERITY.WARNING,
          title: 'Insufficient Balance',
          message: backendMessage || 'Insufficient wallet balance for this transaction.',
          requestId,
          timestamp,
          retry: { retryable: false, action: null },
          debug,
        };
      case ERROR_CODES.VALIDATION_ERROR:
        return {
          type: ERROR_TYPES.VALIDATION_ERROR,
          severity: ERROR_SEVERITY.WARNING,
          title: 'Validation Error',
          message: backendMessage || 'Please review the highlighted fields and try again.',
          requestId,
          timestamp,
          retry: { retryable: false, action: null },
          debug,
        };
      case ERROR_CODES.RATE_LIMITED:
        return {
          type: ERROR_TYPES.BUSINESS_ERROR,
          severity: ERROR_SEVERITY.WARNING,
          title: 'Too Many Requests',
          message: 'Too many requests. Please wait a moment and try again.',
          requestId,
          timestamp,
          retry: { retryable: true, retryAfter: 5, action: 'Retry' },
          debug,
        };
      case ERROR_CODES.SERVER_ERROR:
        return {
          type: ERROR_TYPES.SERVER_ERROR,
          severity: ERROR_SEVERITY.CRITICAL,
          title: 'Server Error',
          message: 'Something went wrong on our end. Please try again later.',
          requestId,
          timestamp,
          retry: { retryable: true, action: 'Retry' },
          debug,
        };
      default:
        break;
    }
  }

  // 2. HTTP Status Code Resolution
  if (status === 401) {
    return {
      type: ERROR_TYPES.AUTH_ERROR,
      severity: ERROR_SEVERITY.WARNING,
      title: 'Session Expired',
      message: 'Please login again to continue.',
      requestId,
      timestamp,
      retry: { retryable: true, action: 'Login' },
      debug,
    };
  }
  if (status === 403) {
    return {
      type: ERROR_TYPES.PERMISSION_DENIED,
      severity: ERROR_SEVERITY.ERROR,
      title: 'Access Denied',
      message: "You don't have permission to perform this action.",
      requestId,
      timestamp,
      retry: { retryable: false, action: null },
      debug,
    };
  }
  if (status === 404) {
    return {
      type: ERROR_TYPES.BUSINESS_ERROR,
      severity: ERROR_SEVERITY.INFO,
      title: 'Not Found',
      message: backendMessage || 'The requested resource was not found.',
      requestId,
      timestamp,
      retry: { retryable: false, action: null },
      debug,
    };
  }
  if (status === 409) {
    return {
      type: ERROR_TYPES.BUSINESS_ERROR,
      severity: ERROR_SEVERITY.WARNING,
      title: 'Notice',
      message: backendMessage || 'There is a conflict with this request. Please refresh and try again.',
      requestId,
      timestamp,
      retry: { retryable: false, action: null },
      debug,
    };
  }
  if (status >= 500) {
    return {
      type: ERROR_TYPES.SERVER_ERROR,
      severity: ERROR_SEVERITY.CRITICAL,
      title: 'Server Error',
      message: 'Something went wrong on our end. Please try again later.',
      requestId,
      timestamp,
      retry: { retryable: true, action: 'Retry' },
      debug,
    };
  }

  // 3. Network & Connection Error Detection
  const rawMessage = backendMessage || error?.message || (typeof error === 'string' ? error : '');

  if (error?.message === 'Network Error' || (typeof window !== 'undefined' && !window.navigator.onLine)) {
    return {
      type: ERROR_TYPES.NETWORK_ERROR,
      severity: ERROR_SEVERITY.ERROR,
      title: 'Connection Problem',
      message: 'Unable to connect. Please check your internet connection.',
      timestamp,
      retry: { retryable: true, action: 'Retry' },
      debug,
    };
  }

  if (error?.code === 'ECONNABORTED' || rawMessage.includes('timeout')) {
    return {
      type: ERROR_TYPES.NETWORK_ERROR,
      severity: ERROR_SEVERITY.ERROR,
      title: 'Request Timeout',
      message: 'Request timed out. Please try again.',
      timestamp,
      retry: { retryable: true, action: 'Retry' },
      debug,
    };
  }

  // 4. Fallback Regex Sanitization for Raw Framework / Database Exception Leaks
  const rawTechPatterns = [
    /mongoose/i,
    /ValidationError/i,
    /CastError/i,
    /MongoServerError/i,
    /E11000/i,
    /Cannot read propert/i,
    /is not defined/i,
    /is not a function/i,
    /JWT/i,
    /ECONNREFUSED/i,
    /ENOENT/i,
    /TypeError/i,
    /ReferenceError/i,
    /AxiosError/i,
    /status code 500/i,
    /Internal Server Error/i,
  ];

  if (rawTechPatterns.some((pattern) => pattern.test(rawMessage))) {
    return {
      type: ERROR_TYPES.SERVER_ERROR,
      severity: ERROR_SEVERITY.CRITICAL,
      title: 'Unexpected Error',
      message: 'Something unexpected happened. Please try again later.',
      requestId,
      timestamp,
      retry: { retryable: true, action: 'Retry' },
      debug,
    };
  }

  // 5. Safe User/Business Message
  return {
    type: ERROR_TYPES.UNKNOWN_ERROR,
    severity: ERROR_SEVERITY.INFO,
    title: 'Notice',
    message: rawMessage || defaultFallback,
    requestId,
    timestamp,
    retry: { retryable: false, action: null },
    debug,
  };
};

export default getUserFriendlyError;
