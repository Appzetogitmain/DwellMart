import React from 'react';
import { FiX } from 'react-icons/fi';

export const Chip = ({
  children,
  variant = 'default',
  size = 'md',
  icon = null,
  onRemove = null,
  onClick = null,
  disabled = false,
  className = '',
}) => {
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3.5 py-1.5 text-sm',
  };

  const variantClasses = {
    default: 'bg-surface-card text-textColor-primary border border-borderToken-default',
    primary: 'bg-brand-primary/15 text-brand-primary border border-brand-primary/30 font-bold',
    gold: 'bg-gradient-to-r from-amber-500/20 to-amber-600/20 text-amber-500 border border-amber-500/40 font-extrabold',
    outline: 'bg-transparent text-textColor-primary border border-borderToken-default',
    filter: 'bg-brand-primary text-textColor-brand font-black shadow-sm',
    success: 'bg-status-success/15 text-status-success border border-status-success/30 font-semibold',
    warning: 'bg-status-warning/15 text-status-warning border border-status-warning/30 font-semibold',
    error: 'bg-status-error/15 text-status-error border border-status-error/30 font-semibold',
    info: 'bg-status-info/15 text-status-info border border-status-info/30 font-semibold',
  };

  return (
    <span
      onClick={!disabled && onClick ? onClick : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full select-none transition-all duration-150 ${
        sizeClasses[size] || sizeClasses.md
      } ${variantClasses[variant] || variantClasses.default} ${
        onClick && !disabled ? 'cursor-pointer hover:opacity-80' : ''
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {icon && <span className="text-current">{icon}</span>}
      <span>{children}</span>
      {onRemove && !disabled && (
        <button
          type="button"
          aria-label="Remove chip"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(e);
          }}
          className="ml-0.5 p-0.5 rounded-full hover:bg-black/10 transition-colors cursor-pointer"
        >
          <FiX className="text-xs" />
        </button>
      )}
    </span>
  );
};

export default Chip;
