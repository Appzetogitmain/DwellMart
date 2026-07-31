import React from 'react';
import { PageHeader } from '../ui';

export const DashboardPage = ({
  title,
  subtitle = null,
  actions = null,
  children,
  className = '',
}) => {
  return (
    <div className={`p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto text-textColor-primary min-h-screen bg-surface-background ${className}`}>
      {/* Dashboard Page Header */}
      <PageHeader>
        <div className="flex items-center justify-between w-full flex-wrap gap-4">
          <div>
            <PageHeader.Title>{title}</PageHeader.Title>
            {subtitle && <PageHeader.Subtitle>{subtitle}</PageHeader.Subtitle>}
          </div>
          {actions && <PageHeader.Actions>{actions}</PageHeader.Actions>}
        </div>
      </PageHeader>

      {/* Dashboard Body Content */}
      <div className="space-y-6">{children}</div>
    </div>
  );
};

export default DashboardPage;
