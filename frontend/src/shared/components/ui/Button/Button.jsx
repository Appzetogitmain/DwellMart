import { forwardRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { FiLoader } from 'react-icons/fi';

/**
 * Enterprise Button Primitive Component
 * Supports polymorphic 'as' prop, forwardRef, loading states, icons, and theme tokens.
 *
 * Variants:   primary | secondary | outline | danger | ghost | icon | success
 * Tones:      neutral (default) | primary | danger | success | warning
 *
 * Usage examples:
 *   <Button variant="ghost" tone="primary" />   → was "ghostBlue" in legacy Admin Button
 *   <Button variant="ghost" tone="danger" />    → was "ghostRed"
 *   <Button variant="icon" tone="primary" />    → was "iconBlue"
 *   <Button variant="icon" tone="danger" />     → was "iconRed"
 *   <Button variant="success" />               → green solid action button
 */
const Button = forwardRef(({
  as: Component = 'button',
  children,
  variant = 'primary',
  tone = 'neutral',   // semantic color modifier for ghost + icon variants
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

  // Size styles — icon variant uses compact square sizing
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs gap-1.5 min-h-[32px] rounded-button',
    md: 'px-5 py-2.5 text-sm gap-2 min-h-[44px] rounded-button',
    lg: 'px-6 py-3.5 text-base gap-2.5 min-h-[50px] rounded-button',
  };

  const iconSizeStyles = {
    sm: 'p-1.5 min-h-[32px] min-w-[32px] rounded-button',
    md: 'p-2.5 min-h-[44px] min-w-[44px] rounded-button',
    lg: 'p-3 min-h-[50px] min-w-[50px] rounded-button',
  };

  // Tone-specific classes for ghost + icon variants
  // neutral → subtle gray hover (existing ghost behavior)
  // primary → blue tinted (was ghostBlue / iconBlue in legacy Admin Button)
  // danger  → red tinted  (was ghostRed  / iconRed)
  // success → green tinted
  // warning → amber tinted
  const toneMap = {
    neutral: {
      ghost: 'bg-transparent hover:bg-textColor-muted/10 text-textColor-secondary border border-transparent',
      icon:  'bg-transparent hover:bg-textColor-muted/10 text-textColor-secondary border border-transparent',
    },
    primary: {
      ghost: 'bg-transparent hover:bg-blue-50 text-blue-600 border border-transparent focus-visible:ring-blue-500',
      icon:  'bg-transparent hover:bg-blue-50 text-blue-600 border border-transparent focus-visible:ring-blue-500',
    },
    danger: {
      ghost: 'bg-transparent hover:bg-red-50 text-red-600 border border-transparent focus-visible:ring-red-500',
      icon:  'bg-transparent hover:bg-red-50 text-red-600 border border-transparent focus-visible:ring-red-500',
    },
    success: {
      ghost: 'bg-transparent hover:bg-emerald-50 text-emerald-600 border border-transparent focus-visible:ring-emerald-500',
      icon:  'bg-transparent hover:bg-emerald-50 text-emerald-600 border border-transparent focus-visible:ring-emerald-500',
    },
    warning: {
      ghost: 'bg-transparent hover:bg-amber-50 text-amber-600 border border-transparent focus-visible:ring-amber-500',
      icon:  'bg-transparent hover:bg-amber-50 text-amber-600 border border-transparent focus-visible:ring-amber-500',
    },
  };

  // Variant styles driven by CSS variables & Tailwind semantic tokens
  const variantStyles = {
    primary:   'bg-brand-primary hover:bg-brand-primaryHover active:bg-brand-primaryActive text-black shadow-button border border-transparent',
    secondary: 'bg-surface-card hover:bg-borderToken-light active:bg-borderToken-default text-textColor-primary border border-borderToken-default shadow-sm',
    outline:   'bg-transparent hover:bg-brand-primary/10 text-brand-primary border border-brand-primary',
    danger:    'bg-statusToken-error hover:bg-red-600 text-white shadow-sm border border-transparent',
    success:   'bg-statusToken-success hover:bg-emerald-600 text-white shadow-sm border border-transparent',
    ghost:     toneMap[tone]?.ghost ?? toneMap.neutral.ghost,
    icon:      toneMap[tone]?.icon  ?? toneMap.neutral.icon,
  };

  const isIconVariant = variant === 'icon';
  const activeSizeStyle = isIconVariant
    ? (iconSizeStyles[size] || iconSizeStyles.md)
    : (sizeStyles[size] || sizeStyles.md);

  const combinedClasses = `
    ${baseStyles}
    ${activeSizeStyle}
    ${variantStyles[variant] || variantStyles.primary}
    ${fullWidth ? 'w-full' : ''}
    ${className}
  `.replace(/\s+/g, ' ').trim();

  const MotionComponent = useMemo(() => {
    if (typeof Component === 'string' && motion[Component]) {
      return motion[Component];
    }
    return motion(Component);
  }, [Component]);

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
      data-tone={tone}
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
