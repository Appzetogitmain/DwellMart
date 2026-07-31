import React, { useState, useRef, useEffect, createContext, useContext } from 'react';

const DropdownContext = createContext(null);

export const Dropdown = ({
  trigger,
  children,
  position = 'bottom-left',
  isOpen: controlledIsOpen,
  onClose,
  className = '',
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const dropdownRef = useRef(null);

  const toggle = () => {
    if (isControlled) {
      if (isOpen && onClose) onClose();
    } else {
      setInternalIsOpen((prev) => !prev);
    }
  };

  const closeMenu = () => {
    if (!isControlled) setInternalIsOpen(false);
    if (onClose) onClose();
  };

  // Click Outside Listener
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        closeMenu();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Keyboard Handler (ESC & Arrow keys)
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!isOpen) return;
      if (event.key === 'Escape') {
        closeMenu();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const positionClasses = {
    'bottom-left': 'top-full left-0 mt-2 origin-top-left',
    'bottom-right': 'top-full right-0 mt-2 origin-top-right',
    'top-left': 'bottom-full left-0 mb-2 origin-bottom-left',
    'top-right': 'bottom-full right-0 mb-2 origin-bottom-right',
  };

  return (
    <DropdownContext.Provider value={{ closeMenu }}>
      <div ref={dropdownRef} className={`relative inline-block text-left ${className}`}>
        {/* Trigger Node */}
        <div onClick={toggle} className="cursor-pointer inline-flex items-center">
          {trigger}
        </div>

        {/* Menu Popover Container */}
        {isOpen && (
          <div
            role="menu"
            aria-orientation="vertical"
            tabIndex={-1}
            className={`absolute z-dropdown w-56 rounded-card bg-surface-card border border-borderToken-default shadow-card py-1.5 focus:outline-none transition-all duration-150 animate-in fade-in zoom-in-95 ${positionClasses[position]}`}
          >
            {children}
          </div>
        )}
      </div>
    </DropdownContext.Provider>
  );
};

// Compound Item Component
Dropdown.Item = ({ children, onClick, danger = false, disabled = false, icon = null, className = '' }) => {
  const { closeMenu } = useContext(DropdownContext) || {};

  const handleClick = (e) => {
    if (disabled) return;
    if (onClick) onClick(e);
    if (closeMenu) closeMenu();
  };

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={handleClick}
      className={`w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold transition-colors duration-150 ${
        disabled
          ? 'opacity-50 cursor-not-allowed text-textColor-muted'
          : danger
          ? 'text-status-error hover:bg-status-error/10'
          : 'text-textColor-primary hover:bg-borderToken-light/50 hover:text-brand-primary'
      } ${className}`}
    >
      {icon && <span className="text-sm">{icon}</span>}
      <span className="flex-1 text-left">{children}</span>
    </button>
  );
};

// Compound Header Component
Dropdown.Header = ({ children, className = '' }) => (
  <div className={`px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-textColor-muted ${className}`}>
    {children}
  </div>
);

// Compound Divider Component
Dropdown.Divider = ({ className = '' }) => (
  <div className={`my-1 border-t border-borderToken-default ${className}`} />
);

export default Dropdown;
