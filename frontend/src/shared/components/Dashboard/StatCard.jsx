import React from 'react';
import { FiTrendingUp, FiTrendingDown } from 'react-icons/fi';
import { Card, Badge } from '../ui';

export const StatCard = ({
  title,
  value,
  change = null,
  trend = 'up',
  icon = null,
  variant = 'default',
  className = '',
}) => {
  const isUp = trend === 'up';

  return (
    <Card variant="default" padding="md" className={`bg-surface-card border-borderToken-default ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-bold text-textColor-muted uppercase tracking-wider">{title}</p>
          <h3 className="text-2xl lg:text-3xl font-black text-textColor-primary tracking-tight">{value}</h3>
          
          {change !== null && (
            <div className="flex items-center gap-1 pt-1">
              <span className={`inline-flex items-center text-xs font-bold ${
                isUp ? 'text-status-success' : 'text-status-error'
              }`}>
                {isUp ? <FiTrendingUp className="mr-0.5" /> : <FiTrendingDown className="mr-0.5" />}
                {change}
              </span>
              <span className="text-[11px] text-textColor-muted font-medium">vs last month</span>
            </div>
          )}
        </div>

        {icon && (
          <div className="p-3 rounded-card bg-brand-primary/10 text-brand-primary flex-shrink-0 text-xl font-bold">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
};

export default StatCard;
