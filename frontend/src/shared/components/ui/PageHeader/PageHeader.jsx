import { useNavigate } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import Breadcrumb from '../Breadcrumb/Breadcrumb';
import Button from '../Button/Button';

/**
 * Enterprise PageHeader Component
 * Standardized page header with breadcrumb navigation, title, description, and action CTA slots.
 */
const PageHeader = ({
  title,
  subtitle,
  breadcrumbs = [],
  actions,
  extra,
  showBackButton = false,
  onBack,
  className = '',
  children,
  ...props
}) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  return (
    <div
      className={`space-y-4 mb-6 sm:mb-8 border-b border-borderToken-light pb-4 sm:pb-6 ${className}`}
      data-component="PageHeader"
      {...props}
    >
      {/* Top Row: Breadcrumbs & Optional Extra Filter Slot */}
      {breadcrumbs.length > 0 && (
        <div className="flex items-center justify-between gap-4">
          <Breadcrumb items={breadcrumbs} />
          {extra && <div className="shrink-0">{extra}</div>}
        </div>
      )}

      {/* Main Row: Back Button, Title, Subtitle, & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          {showBackButton && (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<FiArrowLeft className="text-base" />}
              onClick={handleBack}
              aria-label="Go back"
              className="mt-1 sm:mt-0 flex-shrink-0"
            />
          )}

          <div className="min-w-0 space-y-1">
            {title && (
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-textColor-primary truncate">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="text-xs sm:text-sm text-textColor-muted font-medium leading-relaxed">
                {subtitle}
              </p>
            )}
            {children}
          </div>
        </div>

        {/* Action Button Slot */}
        {actions && (
          <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};

// Compound Slot Definitions
const PageHeaderTitle = ({ children, className = '' }) => (
  <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight text-textColor-primary ${className}`}>
    {children}
  </h1>
);

const PageHeaderSubtitle = ({ children, className = '' }) => (
  <p className={`text-xs sm:text-sm text-textColor-muted font-medium ${className}`}>
    {children}
  </p>
);

const PageHeaderActions = ({ children, className = '' }) => (
  <div className={`flex items-center gap-2.5 ${className}`}>
    {children}
  </div>
);

const PageHeaderExtra = ({ children, className = '' }) => (
  <div className={`shrink-0 ${className}`}>
    {children}
  </div>
);

PageHeaderTitle.displayName = 'PageHeader.Title';
PageHeaderSubtitle.displayName = 'PageHeader.Subtitle';
PageHeaderActions.displayName = 'PageHeader.Actions';
PageHeaderExtra.displayName = 'PageHeader.Extra';

PageHeader.Title = PageHeaderTitle;
PageHeader.Subtitle = PageHeaderSubtitle;
PageHeader.Actions = PageHeaderActions;
PageHeader.Extra = PageHeaderExtra;

export default PageHeader;
