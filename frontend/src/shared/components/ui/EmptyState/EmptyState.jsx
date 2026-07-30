import Card from '../Card/Card';
import {
  FiSearch,
  FiShoppingBag,
  FiInbox,
  FiWifiOff,
  FiLock,
  FiAlertTriangle,
  FiFolder,
} from 'react-icons/fi';

/**
 * Enterprise EmptyState Component
 * Graphic placeholder card for empty search results, empty cart, offline state, or missing data.
 */
const EmptyState = ({
  title,
  description,
  icon,
  variant = 'no-data',
  action,
  secondaryAction,
  className = '',
  ...props
}) => {
  const presetConfig = {
    'no-data': {
      icon: <FiFolder className="text-3xl text-textColor-muted" />,
      title: 'No Data Found',
      description: 'There are no items or records available in this view.',
    },
    'no-results': {
      icon: <FiSearch className="text-3xl text-brand-primary" />,
      title: 'No Search Results',
      description: 'We couldn’t find any matching products or items for your query.',
    },
    cart: {
      icon: <FiShoppingBag className="text-3xl text-brand-primary" />,
      title: 'Your Cart is Empty',
      description: 'Explore our catalog and discover amazing deals today.',
    },
    orders: {
      icon: <FiInbox className="text-3xl text-textColor-brand" />,
      title: 'No Active Orders',
      description: 'You haven’t placed any orders yet. Start shopping now!',
    },
    offline: {
      icon: <FiWifiOff className="text-3xl text-statusToken-error" />,
      title: 'You are Offline',
      description: 'Please check your internet connection and try reloading.',
    },
    'permission-denied': {
      icon: <FiLock className="text-3xl text-amber-500" />,
      title: 'Access Restricted',
      description: 'You do not have permission to view or manage this resource.',
    },
    maintenance: {
      icon: <FiAlertTriangle className="text-3xl text-amber-500" />,
      title: 'Under Maintenance',
      description: 'This section is undergoing scheduled maintenance. Please check back soon.',
    },
    error: {
      icon: <FiAlertTriangle className="text-3xl text-statusToken-error" />,
      title: 'Something Went Wrong',
      description: 'An unexpected error occurred while loading this page.',
    },
    generic: {
      icon: <FiFolder className="text-3xl text-textColor-muted" />,
      title: 'Nothing Here Yet',
      description: 'Check back later for updates.',
    },
  };

  const currentConfig = presetConfig[variant] || presetConfig['no-data'];
  const displayIcon = icon || currentConfig.icon;
  const displayTitle = title || currentConfig.title;
  const displayDescription = description || currentConfig.description;

  return (
    <Card
      variant="default"
      padding="lg"
      className={`text-center flex flex-col items-center justify-center p-8 sm:p-12 max-w-lg mx-auto my-6 ${className}`}
      data-component="EmptyState"
      data-variant={variant}
      {...props}
    >
      {/* Icon Graphic Container */}
      <div className="w-16 h-16 rounded-full bg-surface-background border border-borderToken-light flex items-center justify-center mb-4 shadow-sm">
        {displayIcon}
      </div>

      {/* Title & Description */}
      <h3 className="text-lg sm:text-xl font-bold tracking-tight text-textColor-primary mb-1.5">
        {displayTitle}
      </h3>
      {displayDescription && (
        <p className="text-xs sm:text-sm text-textColor-muted font-normal max-w-md mb-6 leading-relaxed">
          {displayDescription}
        </p>
      )}

      {/* Action Buttons */}
      {(action || secondaryAction) && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
          {action}
          {secondaryAction}
        </div>
      )}
    </Card>
  );
};

export default EmptyState;
