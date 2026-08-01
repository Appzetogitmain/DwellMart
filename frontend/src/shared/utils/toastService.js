import toast from 'react-hot-toast';
import { getUserFriendlyError, ERROR_SEVERITY } from './errorHandler';

const recentToasts = new Set();
const DEDUPE_MS = 2500;
const MAX_VISIBLE_TOASTS = 3;
let activeToastCount = 0;

const triggerToast = (type, message, title = '', options = {}) => {
  if (!message) return null;
  const key = `${type}:${title}:${message}`;

  if (recentToasts.has(key)) {
    return null;
  }

  if (activeToastCount >= MAX_VISIBLE_TOASTS) {
    toast.dismiss(); // Cap visible toasts to avoid clutter
    activeToastCount = 0;
  }

  recentToasts.add(key);
  setTimeout(() => recentToasts.delete(key), DEDUPE_MS);

  activeToastCount++;
  const displayMessage = title ? `${title}\n${message}` : message;
  const onDismiss = () => {
    activeToastCount = Math.max(0, activeToastCount - 1);
  };

  const toastOpts = { duration: 4000, ...options, unmount: onDismiss };

  switch (type) {
    case 'success':
      return toast.success(displayMessage, { duration: 3500, ...toastOpts });
    case 'error':
      return toast.error(displayMessage, { duration: 5000, ...toastOpts });
    case 'warning':
      return toast.error(displayMessage, { duration: 4000, icon: '⚠️', ...toastOpts });
    case 'info':
      return toast(displayMessage, { duration: 3500, icon: 'ℹ️', ...toastOpts });
    case 'loading':
      return toast.loading(displayMessage, toastOpts);
    default:
      return toast(displayMessage, toastOpts);
  }
};

/**
 * Enterprise Toast Service — Unified notification abstraction layer.
 * Enforces design system consistency, deduplication, queue management, and error sanitization.
 */
export const toastService = {
  success: (message, title = '', options = {}) => {
    return triggerToast('success', message, title, options);
  },

  error: (error, fallbackMessage = 'Something went wrong. Please try again.', options = {}) => {
    const errorObj = getUserFriendlyError(error, fallbackMessage);

    // Single point developer console error logging with debug context in development
    if (import.meta.env?.DEV) {
      console.error('[Toast Service Error]:', {
        error,
        parsed: errorObj,
        debug: errorObj.debug,
      });
    }

    const title = errorObj.title !== 'Notice' ? errorObj.title : '';
    const message = errorObj.requestId
      ? `${errorObj.message} (Ref: ${errorObj.requestId})`
      : errorObj.message;

    const toastType = errorObj.severity === ERROR_SEVERITY.INFO
      ? 'info'
      : errorObj.severity === ERROR_SEVERITY.WARNING
      ? 'warning'
      : 'error';

    return triggerToast(toastType, message, title, options);
  },

  warning: (message, title = '', options = {}) => {
    return triggerToast('warning', message, title, options);
  },

  info: (message, title = '', options = {}) => {
    return triggerToast('info', message, title, options);
  },

  loading: (message = 'Loading...', options = {}) => {
    return triggerToast('loading', message, '', options);
  },

  dismiss: (toastId) => {
    return toast.dismiss(toastId);
  },

  promise: (promise, msgs, options = {}) => {
    return toast.promise(promise, msgs, options);
  },

  custom: (jsx, options = {}) => {
    return toast.custom(jsx, options);
  },
};

export default toastService;
