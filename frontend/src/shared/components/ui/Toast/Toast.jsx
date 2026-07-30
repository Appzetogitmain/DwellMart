import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { FiCheckCircle, FiAlertTriangle, FiInfo, FiXCircle, FiX } from 'react-icons/fi';

/**
 * Single Toast Notification Item
 */
const ToastItem = ({
  id,
  type = 'info',
  title,
  message,
  duration = 4000,
  onClose,
}) => {
  const [paused, setPaused] = useState(false);
  const remainingTimeRef = useRef(duration);
  const startTimeRef = useRef(Date.now());
  const timerRef = useRef(null);

  useEffect(() => {
    if (paused) return;

    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      onClose(id);
    }, remainingTimeRef.current);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        const elapsed = Date.now() - startTimeRef.current;
        remainingTimeRef.current = Math.max(0, remainingTimeRef.current - elapsed);
      }
    };
  }, [id, duration, paused, onClose]);

  const typeConfigs = {
    success: {
      icon: <FiCheckCircle className="text-emerald-500 text-lg flex-shrink-0" />,
      border: 'border-emerald-500/40',
      bg: 'bg-surface-card',
    },
    error: {
      icon: <FiXCircle className="text-statusToken-error text-lg flex-shrink-0" />,
      border: 'border-red-500/40',
      bg: 'bg-surface-card',
    },
    warning: {
      icon: <FiAlertTriangle className="text-amber-500 text-lg flex-shrink-0" />,
      border: 'border-amber-500/40',
      bg: 'bg-surface-card',
    },
    info: {
      icon: <FiInfo className="text-blue-500 text-lg flex-shrink-0" />,
      border: 'border-blue-500/40',
      bg: 'bg-surface-card',
    },
  };

  const config = typeConfigs[type] || typeConfigs.info;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ type: 'spring', damping: 25, stiffness: 350 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="status"
      aria-live="polite"
      className={`min-w-[300px] max-w-md p-4 rounded-card border shadow-modal flex items-start justify-between gap-3 text-textColor-primary backdrop-blur-md relative overflow-hidden pointer-events-auto ${config.bg} ${config.border}`}
      data-component="ToastItem"
      data-type={type}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {config.icon}
        <div className="space-y-0.5 min-w-0 flex-1">
          {title && <h5 className="font-bold text-xs uppercase tracking-wider">{title}</h5>}
          {message && <p className="text-xs text-textColor-secondary leading-normal">{message}</p>}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onClose(id)}
        className="p-1 text-textColor-muted hover:text-textColor-primary transition-colors focus:outline-none rounded-md"
        aria-label="Close notification"
      >
        <FiX className="text-sm" />
      </button>
    </motion.div>
  );
};

export default ToastItem;
