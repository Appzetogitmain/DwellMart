/**
 * Enterprise SkeletonLoader Component
 * Continuous shimmer loading placeholders for cards, text rows, tables, and custom containers.
 */
const SkeletonLoader = ({
  variant = 'custom',
  width,
  height,
  rows = 3,
  count = 1,
  rounded = 'md',
  className = '',
  style,
  ...props
}) => {
  const roundedStyles = {
    none: 'rounded-none',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full',
    card: 'rounded-card',
  };

  const baseStyles = 'animate-pulse bg-borderToken-light/70 dark:bg-slate-700/50 select-none';

  // Custom size inline styles if provided
  const customStyles = {
    ...(width ? { width: typeof width === 'number' ? `${width}px` : width } : {}),
    ...(height ? { height: typeof height === 'number' ? `${height}px` : height } : {}),
    ...style,
  };

  // Render Preset Variants
  if (variant === 'card') {
    return <SkeletonCard count={count} className={className} />;
  }

  if (variant === 'text') {
    return <SkeletonText rows={rows} className={className} />;
  }

  if (variant === 'avatar') {
    return (
      <div
        className={`${baseStyles} rounded-full flex-shrink-0 ${className}`}
        style={{ width: width || 40, height: height || 40, ...style }}
        data-component="SkeletonLoader"
        data-variant="avatar"
        {...props}
      />
    );
  }

  if (variant === 'table') {
    return <SkeletonTable rows={rows} className={className} />;
  }

  // Fallback to custom rectangle
  const items = Array.from({ length: count });

  return (
    <>
      {items.map((_, index) => (
        <div
          key={index}
          className={`${baseStyles} ${roundedStyles[rounded] || roundedStyles.md} ${className}`}
          style={customStyles}
          data-component="SkeletonLoader"
          data-variant="custom"
          {...props}
        />
      ))}
    </>
  );
};

// Compound Preset Components
const SkeletonCard = ({ count = 1, className = '' }) => {
  const cards = Array.from({ length: count });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full">
      {cards.map((_, i) => (
        <div
          key={i}
          className={`bg-surface-card border border-borderToken-light rounded-card p-4 space-y-3 animate-pulse ${className}`}
          data-component="SkeletonCard"
        >
          <div className="h-44 w-full bg-borderToken-light/70 rounded-md" />
          <div className="h-4 w-3/4 bg-borderToken-light/70 rounded-sm" />
          <div className="h-3 w-1/2 bg-borderToken-light/50 rounded-sm" />
          <div className="flex items-center justify-between pt-2">
            <div className="h-5 w-1/3 bg-borderToken-light/70 rounded-sm" />
            <div className="h-8 w-20 bg-borderToken-light/70 rounded-button" />
          </div>
        </div>
      ))}
    </div>
  );
};

const SkeletonText = ({ rows = 3, className = '' }) => {
  const textRows = Array.from({ length: rows });
  return (
    <div className={`space-y-2.5 w-full animate-pulse ${className}`} data-component="SkeletonText">
      {textRows.map((_, i) => (
        <div
          key={i}
          className="h-3.5 bg-borderToken-light/70 rounded-sm"
          style={{ width: i === textRows.length - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  );
};

const SkeletonTable = ({ rows = 4, className = '' }) => {
  const tableRows = Array.from({ length: rows });
  return (
    <div className={`w-full bg-surface-card border border-borderToken-light rounded-card p-4 space-y-3 animate-pulse ${className}`} data-component="SkeletonTable">
      <div className="h-8 w-full bg-borderToken-light/80 rounded-sm mb-4" />
      {tableRows.map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-2 border-b border-borderToken-light/50">
          <div className="h-4 w-1/4 bg-borderToken-light/70 rounded-sm" />
          <div className="h-4 w-1/3 bg-borderToken-light/50 rounded-sm" />
          <div className="h-4 w-1/6 bg-borderToken-light/70 rounded-sm" />
        </div>
      ))}
    </div>
  );
};

SkeletonCard.displayName = 'SkeletonLoader.Card';
SkeletonText.displayName = 'SkeletonLoader.Text';
SkeletonTable.displayName = 'SkeletonLoader.Table';

SkeletonLoader.Card = SkeletonCard;
SkeletonLoader.Text = SkeletonText;
SkeletonLoader.Table = SkeletonTable;

export default SkeletonLoader;
