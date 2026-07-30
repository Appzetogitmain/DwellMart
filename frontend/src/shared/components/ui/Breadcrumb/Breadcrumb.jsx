import { Link } from 'react-router-dom';
import { FiChevronRight, FiHome } from 'react-icons/fi';

/**
 * Enterprise Breadcrumb Component
 * Accessible trail navigation with path truncation and theme token styling.
 */
const Breadcrumb = ({
  items = [],
  separator = <FiChevronRight className="text-xs text-textColor-muted" />,
  showHomeIcon = true,
  maxItems = 4,
  className = '',
  ...props
}) => {
  if (!items || items.length === 0) return null;

  // Process items for truncation if items length exceeds maxItems
  let displayItems = items;
  if (maxItems && items.length > maxItems && items.length > 2) {
    const firstItem = items[0];
    const lastItems = items.slice(items.length - (maxItems - 1));
    displayItems = [
      firstItem,
      { label: '...', isEllipsis: true },
      ...lastItems,
    ];
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center text-xs font-medium ${className}`}
      data-component="Breadcrumb"
      {...props}
    >
      <ol className="flex items-center flex-wrap gap-1.5 list-none p-0 m-0">
        {showHomeIcon && (
          <li className="flex items-center">
            <Link
              to="/home"
              className="text-textColor-muted hover:text-brand-primary transition-colors flex items-center gap-1"
              aria-label="Home"
            >
              <FiHome className="text-sm" />
            </Link>
            <span className="ml-1.5 flex items-center" aria-hidden="true">
              {separator}
            </span>
          </li>
        )}

        {displayItems.map((item, index) => {
          const isLast = index === displayItems.length - 1;
          const isCurrent = item.active || isLast;

          if (item.isEllipsis) {
            return (
              <li key={`ellipsis-${index}`} className="flex items-center">
                <span className="text-textColor-muted px-1 select-none">...</span>
                <span className="ml-1.5 flex items-center" aria-hidden="true">
                  {separator}
                </span>
              </li>
            );
          }

          return (
            <li key={index} className="flex items-center">
              {isCurrent || !item.path ? (
                <span
                  className="font-bold text-textColor-primary"
                  aria-current={isCurrent ? 'page' : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.path}
                  className="text-textColor-muted hover:text-brand-primary transition-colors"
                >
                  {item.label}
                </Link>
              )}

              {!isLast && (
                <span className="ml-1.5 flex items-center" aria-hidden="true">
                  {separator}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumb;
