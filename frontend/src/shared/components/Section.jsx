import React from 'react';
import { Badge } from './ui';

export const Section = ({
  title,
  subtitle = null,
  badge = null,
  action = null,
  children,
  className = '',
  containerClassName = '',
}) => {
  return (
    <section className={`py-6 sm:py-8 lg:py-10 ${className}`}>
      <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4 sm:space-y-6 ${containerClassName}`}>
        {/* Section Header */}
        {(title || action || badge) && (
          <div className="flex items-end justify-between gap-4 border-b border-borderToken-default pb-3 sm:pb-4">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {title && (
                  <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-textColor-primary tracking-tight truncate">
                    {title}
                  </h2>
                )}
                {badge && (
                  typeof badge === 'string' ? (
                    <Badge variant="gold" size="sm">{badge}</Badge>
                  ) : (
                    badge
                  )
                )}
              </div>
              {subtitle && (
                <p className="text-xs sm:text-sm text-textColor-muted font-medium line-clamp-1">
                  {subtitle}
                </p>
              )}
            </div>

            {/* Action Slot */}
            {action && <div className="flex-shrink-0">{action}</div>}
          </div>
        )}

        {/* Section Content Body */}
        <div>{children}</div>
      </div>
    </section>
  );
};

export default Section;
