import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { FiLoader } from 'react-icons/fi';

/**
 * Enterprise Button Primitive Component
 * Supports polymorphic 'as' prop, forwardRef, loading states, icons, and theme tokens.
 */
const Button = forwardRef(({
  as: Component = 'button',
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  isLoading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  type = 'button',
  className = '',
  onClick,
  ...props
}, ref) => {
  const isButton = Component === 'button';
  const isDisabled = disabled || isLoading;

  // Base semantic styles
  const baseStyles = 'inline-flex items-center justify-center font-bold tracking-wide transition-all duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none select-none';

  // Size styles
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs gap-1.5 min-h-[32px] rounded-button',
    md: 'px-5 py-2.5 text-sm gap-2 min-h-[44px] rounded-button',
    lg: 'px-6 py-3.5 text-base gap-2.5 min-h-[50px] rounded-button',
  };

  // Variant styles driven by CSS variables & Tailwind semantic tokens
  const variantStyles = {
    primary: 'bg-brand-primary hover:bg-brand-primaryHover active:bg-brand-primaryActive text-black shadow-button hover:shadow-buttonHover border border-transparent',
    secondary: 'bg-surface-card hover:bg-borderToken-light active:bg-borderToken-default text-textColor-primary border border-borderToken-default shadow-sm',
    outline: 'bg-transparent hover:bg-brand-primary/10 text-brand-primary border border-brand-primary',
    danger: 'bg-statusToken-error hover:bg-red-600 text-white shadow-sm border border-transparent',
    ghost: 'bg-transparent hover:bg-textColor-muted/10 text-textColor-secondary border border-transparent',
  };

  const combinedClasses = `
    ${baseStyles}
    ${sizeStyles[size] || sizeStyles.md}
    ${variantStyles[variant] || variantStyles.primary}
    ${fullWidth ? 'w-full' : ''}
    ${className}
  `.replace(/\s+/g, ' ').trim();

  // If using framer motion wrapper
  const MotionComponent = motion(Component);

  return (
    <MotionComponent
      ref={ref}
      {...(isButton ? { type, disabled: isDisabled } : {})}
      onClick={isDisabled ? undefined : onClick}
      className={combinedClasses}
      whileHover={!isDisabled ? { scale: 1.01 } : {}}
      whileTap={!isDisabled ? { scale: 0.98 } : {}}
      transition={{ duration: 0.15 }}
      data-component="Button"
      data-variant={variant}
      data-size={size}
      aria-disabled={isDisabled}
      aria-busy={isLoading}
      {...props}
    >
      {isLoading && (
        <FiLoader className="animate-spin flex-shrink-0 text-current" aria-hidden="true" />
      )}
      {!isLoading && leftIcon && (
        <span className="flex-shrink-0 flex items-center justify-center" aria-hidden="true">
          {leftIcon}
        </span>
      )}
      {children && <span>{children}</span>}
      {!isLoading && rightIcon && (
        <span className="flex-shrink-0 flex items-center justify-center" aria-hidden="true">
          {rightIcon}
        </span>
      )}
    </MotionComponent>
  );
});

Button.displayName = 'Button';

export default Button;
