import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import ToastItem from './Toast';

/**
 * Toast Container Portal Component
 */
const ToastContainer = ({ toasts = [], position = 'top-right', onClose }) => {
  if (typeof document === 'undefined') return null;

  const positionClasses = {
    'top-right': 'top-4 right-4 items-end',
    'top-left': 'top-4 left-4 items-start',
    'top-center': 'top-4 left-1/2 -translate-x-1/2 items-center',
    'bottom-right': 'bottom-4 right-4 items-end',
    'bottom-left': 'bottom-4 left-4 items-start',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2 items-center',
  };

  const containerContent = (
    <div
      className={`fixed z-toast flex flex-col gap-2.5 pointer-events-none ${
        positionClasses[position] || positionClasses['top-right']
      }`}
      aria-label="Notifications"
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} {...toast} onClose={onClose} />
        ))}
      </AnimatePresence>
    </div>
  );

  return createPortal(containerContent, document.body);
};

export default ToastContainer;
