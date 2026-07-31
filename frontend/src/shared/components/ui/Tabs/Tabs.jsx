import React, { createContext, useContext } from 'react';
import { motion } from 'framer-motion';

const TabsContext = createContext(null);

export const Tabs = ({
  activeTab,
  onChange,
  variant = 'default',
  fullWidth = false,
  children,
  className = '',
}) => {
  return (
    <TabsContext.Provider value={{ activeTab, onChange, variant, fullWidth }}>
      <div className={`space-y-4 ${className}`}>{children}</div>
    </TabsContext.Provider>
  );
};

// Compound List Component
Tabs.List = ({ children, className = '' }) => {
  const { variant, fullWidth } = useContext(TabsContext) || {};

  const listVariantClasses = {
    default: 'border-b border-borderToken-default bg-transparent p-0 gap-6',
    line: 'border-b-2 border-borderToken-default bg-transparent p-0 gap-8',
    pills: 'bg-surface-card p-1.5 rounded-card border border-borderToken-default gap-1.5 shadow-sm',
  };

  return (
    <div
      role="tablist"
      className={`flex items-center ${fullWidth ? 'w-full justify-between' : ''} ${
        listVariantClasses[variant] || listVariantClasses.default
      } ${className}`}
    >
      {children}
    </div>
  );
};

// Compound Tab Component
Tabs.Tab = ({ id, children, icon = null, badge = null, disabled = false, className = '' }) => {
  const { activeTab, onChange, variant, fullWidth } = useContext(TabsContext) || {};
  const isActive = activeTab === id;

  const handleClick = () => {
    if (disabled) return;
    if (onChange) onChange(id);
  };

  const activeStyles = {
    default: isActive
      ? 'border-b-2 border-brand-primary text-brand-primary font-extrabold'
      : 'text-textColor-secondary hover:text-textColor-primary border-b-2 border-transparent',
    line: isActive
      ? 'border-b-2 border-brand-primary text-brand-primary font-black scale-105'
      : 'text-textColor-muted hover:text-textColor-primary border-b-2 border-transparent',
    pills: isActive
      ? 'bg-brand-primary text-textColor-brand shadow-md font-black'
      : 'text-textColor-secondary hover:bg-borderToken-light/60 hover:text-textColor-primary',
  };

  return (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={isActive}
      aria-controls={`panel-${id}`}
      disabled={disabled}
      onClick={handleClick}
      className={`relative flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-bold transition-all duration-200 ${
        fullWidth ? 'flex-1' : ''
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${
        activeStyles[variant] || activeStyles.default
      } ${className}`}
    >
      {icon && <span className="text-sm">{icon}</span>}
      <span>{children}</span>
      {badge !== null && badge !== undefined && (
        <span
          className={`ml-1.5 px-2 py-0.5 text-[10px] font-black rounded-full ${
            isActive && variant === 'pills'
              ? 'bg-textColor-brand text-brand-primary'
              : 'bg-brand-primary/15 text-brand-primary border border-brand-primary/30'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
};

// Compound Panel Component
Tabs.Panel = ({ id, children, className = '' }) => {
  const { activeTab } = useContext(TabsContext) || {};
  const isActive = activeTab === id;

  if (!isActive) return null;

  return (
    <motion.div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`focus:outline-none ${className}`}
    >
      {children}
    </motion.div>
  );
};

export default Tabs;
