/**
 * Enterprise Primitive Badge Component
 * Pill tag component for order status, verification, discounts, and product tags.
 */
const Badge = ({
  children,
  variant = 'gold',
  size = 'md',
  className = '',
  ...props
}) => {
  const sizeStyles = {
    sm: 'px-2 py-0.5 text-[10px] gap-1',
    md: 'px-3 py-1 text-xs gap-1.5',
  };

  const variantStyles = {
    verified: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-400',
    new: 'bg-blue-500/10 text-blue-600 border border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-400',
    hot: 'bg-red-500/10 text-red-600 border border-red-500/30 dark:bg-red-500/20 dark:text-red-400',
    trending: 'bg-amber-500/10 text-amber-600 border border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-400',
    gold: 'bg-brand-primary/15 text-textColor-brand border border-brand-primary/40 font-black',
    success: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30',
    warning: 'bg-amber-500/10 text-amber-600 border border-amber-500/30',
    error: 'bg-red-500/10 text-red-600 border border-red-500/30',
    info: 'bg-blue-500/10 text-blue-600 border border-blue-500/30',
  };

  const baseStyles = 'inline-flex items-center justify-center font-extrabold rounded-badge uppercase tracking-wide leading-none select-none';

  const combinedClasses = `
    ${baseStyles}
    ${sizeStyles[size] || sizeStyles.md}
    ${variantStyles[variant] || variantStyles.gold}
    ${className}
  `.replace(/\s+/g, ' ').trim();

  return (
    <span
      className={combinedClasses}
      data-component="Badge"
      data-variant={variant}
      data-size={size}
      {...props}
    >
      {children}
    </span>
  );
};

export default Badge;
