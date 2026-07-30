import { useContext } from 'react';
import { ToastContext } from './ToastProvider';

/**
 * Enterprise useToast Hook
 * @returns {{ toast: { success: Function, error: Function, warning: Function, info: Function, remove: Function } }}
 */
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a <ToastProvider>');
  }
  return { toast: context };
};

export default useToast;
