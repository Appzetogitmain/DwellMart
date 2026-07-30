import { FiLoader } from 'react-icons/fi';

/**
 * Enterprise Spinner Component
 * Accessible loading indicator control with inline & standalone modes.
 */
const Spinner = ({
  size = 'md',
  variant = 'primary',
  label = 'Loading...',
  showLabel = false,
  inline = false,
  className = '',
  ...props
}) => {
  const sizeStyles = {
    sm: 'text-sm h-4 w-4',
    md: 'text-lg h-5 w-5',
    lg: 'text-2xl h-8 w-8',
    xl: 'text-4xl h-12 w-12',
  };

  const variantStyles = {
    primary: 'text-brand-primary',
    secondary: 'text-textColor-secondary',
    gold: 'text-textColor-brand',
    white: 'text-white',
  };

  const spinnerIcon = (
    <FiLoader
      className={`animate-spin flex-shrink-0 ${sizeStyles[size] || sizeStyles.md} ${
        variantStyles[variant] || variantStyles.primary
      }`}
      aria-hidden="true"
    />
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className={`${inline ? 'inline-flex' : 'flex'} items-center justify-center gap-2 ${className}`}
      data-component="Spinner"
      data-size={size}
      data-variant={variant}
      {...props}
    >
      {spinnerIcon}
      {showLabel && label && (
        <span className="text-xs font-semibold text-textColor-muted select-none">
          {label}
        </span>
      )}
      <span className="sr-only">{label}</span>
    </div>
  );
};

export default Spinner;
