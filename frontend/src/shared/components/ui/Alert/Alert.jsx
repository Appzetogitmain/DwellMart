import { useState } from 'react';
import { FiCheckCircle, FiAlertTriangle, FiInfo, FiXCircle, FiX } from 'react-icons/fi';

/**
 * Enterprise Alert Banner Component
 * Persistent banner for validation errors, offline warnings, system notices, and status feedback.
 */
const Alert = ({
  variant = 'info',
  title,
  message,
  dismissible = false,
  onDismiss,
  action,
  className = '',
  children,
  ...props
}) => {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    if (onDismiss) onDismiss();
  };

  const variantConfigs = {
    success: {
      icon: <FiCheckCircle className="text-emerald-500 text-lg flex-shrink-0 mt-0.5" />,
      container: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200',
      titleColor: 'text-emerald-800 dark:text-emerald-300',
    },
    error: {
      icon: <FiXCircle className="text-statusToken-error text-lg flex-shrink-0 mt-0.5" />,
      container: 'bg-red-500/10 border-red-500/30 text-red-950 dark:text-red-200',
      titleColor: 'text-red-800 dark:text-red-300',
    },
    warning: {
      icon: <FiAlertTriangle className="text-amber-500 text-lg flex-shrink-0 mt-0.5" />,
      container: 'bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-200',
      titleColor: 'text-amber-800 dark:text-amber-300',
    },
    info: {
      icon: <FiInfo className="text-blue-500 text-lg flex-shrink-0 mt-0.5" />,
      container: 'bg-blue-500/10 border-blue-500/30 text-blue-950 dark:text-blue-200',
      titleColor: 'text-blue-800 dark:text-blue-300',
    },
  };

  const config = variantConfigs[variant] || variantConfigs.info;
  const isHighSeverity = variant === 'error' || variant === 'warning';

  return (
    <div
      role={isHighSeverity ? 'alert' : 'status'}
      className={`p-4 rounded-card border flex items-start justify-between gap-3 text-xs sm:text-sm font-medium transition-all ${config.container} ${className}`}
      data-component="Alert"
      data-variant={variant}
      {...props}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {config.icon}
        <div className="space-y-0.5 min-w-0 flex-1">
          {title && (
            <h4 className={`font-bold text-xs uppercase tracking-wider ${config.titleColor}`}>
              {title}
            </h4>
          )}
          {message && <p className="leading-relaxed">{message}</p>}
          {children}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {action}
        {dismissible && (
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 opacity-70 hover:opacity-100 transition-opacity focus:outline-none rounded-md"
            aria-label="Dismiss alert"
          >
            <FiX className="text-base" />
          </button>
        )}
      </div>
    </div>
  );
};

export default Alert;
