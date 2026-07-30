import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX } from 'react-icons/fi';

/**
 * Enterprise Drawer Component
 * React Portal slide-out panel with position controls, semantic width presets, and body scroll lock.
 */
const Drawer = ({
  isOpen = false,
  onClose,
  title,
  subtitle,
  position = 'right',
  size = 'md',
  closeOnBackdrop = true,
  closeOnEscape = true,
  isLoading = false,
  className = '',
  children,
  ...props
}) => {
  const drawerRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Focus Restoration & Body Scroll Lock
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
      document.body.style.overflow = 'hidden';

      setTimeout(() => {
        if (drawerRef.current) {
          const focusable = drawerRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
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

  // ESC and Focus Trap listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      if (e.key === 'Escape' && closeOnEscape && !isLoading) {
        onClose?.();
        return;
      }

      if (e.key === 'Tab' && drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll(
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

  // Semantic Presets & Sizes mapping
  const sizeMap = {
    cart: 'max-w-[420px] w-full',
    filter: 'max-w-[380px] w-full',
    navigation: 'max-w-[320px] w-full',
    settings: 'max-w-[480px] w-full',
    sm: 'max-w-[320px] w-full',
    md: 'max-w-[420px] w-full',
    lg: 'max-w-[600px] w-full',
    full: 'w-screen h-screen max-w-none',
  };

  // Slide Variants for Framer Motion
  const slideVariants = {
    right: {
      hidden: { x: '100%', y: 0 },
      visible: { x: 0, y: 0 },
    },
    left: {
      hidden: { x: '-100%', y: 0 },
      visible: { x: 0, y: 0 },
    },
    bottom: {
      hidden: { x: 0, y: '100%' },
      visible: { x: 0, y: 0 },
    },
    top: {
      hidden: { x: 0, y: '-100%' },
      visible: { x: 0, y: 0 },
    },
  };

  const positionClasses = {
    right: 'top-0 right-0 h-full',
    left: 'top-0 left-0 h-full',
    bottom: 'bottom-0 left-0 w-full max-h-[85vh] rounded-t-card',
    top: 'top-0 left-0 w-full max-h-[85vh] rounded-b-card',
  };

  const drawerContent = (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-drawer overflow-hidden">
          
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

          {/* Drawer Slide Panel */}
          <motion.div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'drawer-title' : undefined}
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={slideVariants[position] || slideVariants.right}
            transition={{ type: 'spring', damping: 25, stiffness: 280 }}
            className={`fixed bg-surface-card border-borderToken-default shadow-drawer text-textColor-primary flex flex-col z-10 ${
              positionClasses[position] || positionClasses.right
            } ${sizeMap[size] || sizeMap.md} ${className}`}
            data-component="Drawer"
            data-position={position}
            data-size={size}
            {...props}
          >
            {/* Built-in Close Button */}
            {onClose && !isLoading && (
              <button
                type="button"
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 text-textColor-muted hover:text-textColor-primary rounded-button transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary/40 z-20"
                aria-label="Close panel"
              >
                <FiX className="text-lg" />
              </button>
            )}

            {/* Optional Title Header */}
            {title && <DrawerHeader title={title} subtitle={subtitle} />}

            {/* Drawer Body / Children */}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(drawerContent, document.body);
};

// Compound Drawer Subcomponents
const DrawerHeader = ({ title, subtitle, children, className = '' }) => (
  <div
    className={`p-5 sm:p-6 border-b border-borderToken-light flex flex-col justify-center ${className}`}
    data-component="DrawerHeader"
  >
    <div className="space-y-1 pr-6">
      {title && (
        <h2 id="drawer-title" className="text-lg sm:text-xl font-bold tracking-tight text-textColor-primary">
          {title}
        </h2>
      )}
      {subtitle && <p className="text-xs text-textColor-muted font-normal">{subtitle}</p>}
      {children}
    </div>
  </div>
);

const DrawerBody = ({ children, className = '' }) => (
  <div className={`p-5 sm:p-6 space-y-4 flex-1 overflow-y-auto ${className}`} data-component="DrawerBody">
    {children}
  </div>
);

const DrawerFooter = ({ children, className = '' }) => (
  <div
    className={`p-4 sm:p-5 border-t border-borderToken-light bg-surface-background/50 flex items-center justify-between gap-3 ${className}`}
    data-component="DrawerFooter"
  >
    {children}
  </div>
);

DrawerHeader.displayName = 'Drawer.Header';
DrawerBody.displayName = 'Drawer.Body';
DrawerFooter.displayName = 'Drawer.Footer';

Drawer.Header = DrawerHeader;
Drawer.Body = DrawerBody;
Drawer.Footer = DrawerFooter;

export default Drawer;
