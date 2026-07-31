import { motion } from 'framer-motion';
import { useMemo } from 'react';

const PasswordStrengthMeter = ({ password }) => {
  const strength = useMemo(() => {
    if (!password) return 0;
    
    let score = 0;
    if (password.length >= 6) score += 1;
    if (password.length >= 8) score += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^a-zA-Z\d]/.test(password)) score += 1;
    
    return Math.min(score, 4);
  }, [password]);

  const STRENGTH_CONFIG = {
    very_weak: { label: 'Very Weak', barColor: 'bg-status-error', textColor: 'text-status-error' },
    weak: { label: 'Weak', barColor: 'bg-status-error', textColor: 'text-status-error' },
    fair: { label: 'Fair', barColor: 'bg-status-warning', textColor: 'text-status-warning' },
    good: { label: 'Good', barColor: 'bg-status-info', textColor: 'text-status-info' },
    strong: { label: 'Strong', barColor: 'bg-status-success', textColor: 'text-status-success' },
  };

  const strengthKey = useMemo(() => {
    const keys = ['very_weak', 'weak', 'fair', 'good', 'strong'];
    return keys[strength] || 'very_weak';
  }, [strength]);

  if (!password) return null;

  const currentConfig = STRENGTH_CONFIG[strengthKey];

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 mb-1">
        <div className="flex-1 h-2 bg-surface-muted rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(strength / 4) * 100}%` }}
            transition={{ duration: 0.3 }}
            className={`h-full ${currentConfig.barColor} rounded-full`}
          />
        </div>
        <span className={`text-xs font-semibold ${currentConfig.textColor}`}>
          {currentConfig.label}
        </span>
      </div>
    </div>
  );
};

export default PasswordStrengthMeter;

