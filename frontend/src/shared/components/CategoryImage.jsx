import React, { useState } from 'react';
import LazyImage from './LazyImage';

/**
 * CategoryImage Component
 *
 * Renders category image with fallback to a styled letter avatar badge
 * (e.g. "F" for Fresh Fruits) if image is empty or fails to load.
 */
const CategoryImage = ({
  src,
  alt = 'Category',
  name = '',
  className = 'w-full h-full object-cover',
  containerClassName = 'w-12 h-12 rounded-2xl overflow-hidden bg-gradient-to-br from-amber-500/10 via-brand-primary/10 to-purple-500/10 flex items-center justify-center shrink-0 border border-border shadow-xs',
  textClassName = 'text-base font-extrabold text-brand-primary uppercase tracking-tight',
}) => {
  const [hasError, setHasError] = useState(false);

  const getInitial = () => {
    const cleanName = (name || alt || 'C').trim();
    return cleanName.charAt(0).toUpperCase();
  };

  const showFallback = !src || hasError;

  return (
    <div className={containerClassName}>
      {!showFallback ? (
        <LazyImage
          src={src}
          alt={alt || name}
          className={className}
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-surface-muted border border-border/50 select-none">
          <span className={textClassName}>{getInitial()}</span>
        </div>
      )}
    </div>
  );
};

export default React.memo(CategoryImage);
