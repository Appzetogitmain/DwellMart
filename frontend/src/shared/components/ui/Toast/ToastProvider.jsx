import { createContext, useState, useCallback, useMemo } from 'react';
import ToastContainer from './ToastContainer';

export const ToastContext = createContext(null);

/**
 * Toast Provider State Manager
 */
export const ToastProvider = ({
  children,
  position = 'top-right',
  maxToasts = 5,
  defaultDuration = 4000,
}) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (options) => {
      const id = Date.now().toString() + Math.random().toString(36).substring(2, 6);
      const newToast = {
        id,
        duration: defaultDuration,
        ...options,
      };

      setToasts((prev) => {
        const updated = [newToast, ...prev];
        return updated.slice(0, maxToasts);
      });

      return id;
    },
    [defaultDuration, maxToasts]
  );

  const toastHelpers = useMemo(
    () => ({
      success: (message, title = 'Success', options = {}) =>
        addToast({ type: 'success', message, title, ...options }),
      error: (message, title = 'Error', options = {}) =>
        addToast({ type: 'error', message, title, ...options }),
      warning: (message, title = 'Warning', options = {}) =>
        addToast({ type: 'warning', message, title, ...options }),
      info: (message, title = 'Notice', options = {}) =>
        addToast({ type: 'info', message, title, ...options }),
      remove: removeToast,
    }),
    [addToast, removeToast]
  );

  return (
    <ToastContext.Provider value={toastHelpers}>
      {children}
      <ToastContainer toasts={toasts} position={position} onClose={removeToast} />
    </ToastContext.Provider>
  );
};
