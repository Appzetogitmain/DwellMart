import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiAlertTriangle, FiCheckCircle, FiInfo } from 'react-icons/fi';

/**
 * Enterprise Modal Component
 * React Portal dialog with focus trapping, focus restoration, body scroll lock, and semantic variants.
 */
const Modal = ({
  isOpen = false,
  onClose,
  title,
  subtitle,
  variant = 'default',
  size = 'md',
  closeOnBackdrop = true,
  closeOnEscape = true,
  isLoading = false,
  className = '',
  children,
  ...props
}) => {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Focus Restoration & Body Scroll Lock
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      document.body.style.overflow = 'hidden';

      // Move focus inside modal
      setTimeout(() => {
        if (modalRef.current) {
          const autoFocusElement = modalRef.current.querySelector('[autofocus], input:not([disabled]), textarea:not([disabled])');
          if (autoFocusElement) {
            autoFocusElement.focus();
            return;
          }
          const focusable = modalRef.current.querySelectorAll(
            'button:not([aria-label="Close modal"]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (focusable.length > 0) {
            focusable[0].focus();
          }
        }
      }, 50);
    } else {
      document.body.style.overflow = '';
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Keyboard listeners: ESC and Focus Trap (Tab)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      // ESC key handler
      if (e.key === 'Escape' && closeOnEscape && !isLoading) {
        onClose?.();
        return;
      }

      // Tab focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, isLoading, onClose]);

  if (typeof document === 'undefined') return null;

  const sizeStyles = {
    sm: 'max-w-sm w-full',
    md: 'max-w-lg w-full',
    lg: 'max-w-2xl w-full',
    xl: 'max-w-4xl w-full',
    full: 'w-screen h-screen rounded-none max-w-none m-0',
  };

  const variantIcons = {
    confirmation: <FiAlertTriangle className="text-amber-500 text-2xl flex-shrink-0" />,
    danger: <FiAlertTriangle className="text-red-500 text-2xl flex-shrink-0" />,
    success: <FiCheckCircle className="text-emerald-600 text-2xl flex-shrink-0" />,
    default: null,
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto">
          
          {/* Backdrop Layer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeOnBackdrop && !isLoading ? onClose : undefined}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Centering wrapper */}
          <div className="flex min-h-full items-center justify-center p-4 sm:p-6 text-center">
            {/* Modal Container */}
            <motion.div
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? 'modal-title' : undefined}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className={`relative w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl overflow-hidden text-left text-gray-900 dark:text-gray-100 z-10 my-8 ${
                sizeStyles[size] || sizeStyles.md
              } ${className}`}
              data-component="Modal"
              data-variant={variant}
              data-size={size}
              {...props}
            >
              {/* Built-in Close Button */}
              {onClose && !isLoading && (
                <button
                  type="button"
                  onClick={onClose}
                  className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-200 rounded-lg transition-colors outline-none focus:outline-none z-20"
                  aria-label="Close modal"
                >
                  <FiX className="text-lg" />
                </button>
              )}

              {/* Optional Top Title Header */}
              {(title || variantIcons[variant]) && (
                <ModalHeader title={title} subtitle={subtitle} icon={variantIcons[variant]} />
              )}

              {/* Modal Body / Children */}
              {children}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
};

// Compound Modal Subcomponents
const ModalHeader = ({ title, subtitle, icon, children, className = '' }) => (
  <div
    className={`p-5 sm:p-6 border-b border-gray-100 dark:border-gray-800 flex items-start gap-3 bg-white dark:bg-gray-900 ${className}`}
    data-component="ModalHeader"
  >
    {icon && <div className="mt-0.5 flex-shrink-0">{icon}</div>}
    <div className="space-y-1 min-w-0 flex-1 pr-6">
      {title && (
        <h2 id="modal-title" className="text-lg sm:text-xl font-bold tracking-tight text-gray-900 dark:text-white">
          {title}
        </h2>
      )}
      {subtitle && <p className="text-xs text-gray-500 font-normal">{subtitle}</p>}
      {children}
    </div>
  </div>
);

const ModalBody = ({ children, className = '' }) => (
  <div className={`p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 ${className}`} data-component="ModalBody">
    {children}
  </div>
);

const ModalFooter = ({ children, className = '' }) => (
  <div
    className={`p-4 sm:p-5 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 flex items-center justify-end gap-3 ${className}`}
    data-component="ModalFooter"
  >
    {children}
  </div>
);

const ModalActions = ({ children, className = '' }) => (
  <div className={`flex items-center justify-end gap-2.5 w-full sm:w-auto ${className}`} data-component="ModalActions">
    {children}
  </div>
);

ModalHeader.displayName = 'Modal.Header';
ModalBody.displayName = 'Modal.Body';
ModalFooter.displayName = 'Modal.Footer';
ModalActions.displayName = 'Modal.Actions';

Modal.Header = ModalHeader;
Modal.Body = ModalBody;
Modal.Footer = ModalFooter;
Modal.Actions = ModalActions;

export default Modal;
