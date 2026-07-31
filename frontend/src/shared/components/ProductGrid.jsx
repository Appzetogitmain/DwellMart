import React from 'react';
import ProductCard from './ProductCard';
import { SkeletonLoader, EmptyState } from './ui';

export const ProductGrid = ({
  products = [],
  loading = false,
  variant = 'default',
  skeletonCount = 6,
  emptyTitle = 'No Products Found',
  emptyDescription = 'Try adjusting your search filters.',
  className = '',
}) => {
  if (loading) {
    return (
      <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 md:gap-5 ${className}`}>
        {Array.from({ length: skeletonCount }).map((_, idx) => (
          <SkeletonLoader.Card key={idx} />
        ))}
      </div>
    );
  }

  if (!products || products.length === 0) {
    return (
      <EmptyState
        variant="no-results"
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 md:gap-5 ${className}`}>
      {products.map((product, index) => (
        <ProductCard
          key={product.id ?? product._id ?? index}
          product={product}
          variant={variant}
        />
      ))}
    </div>
  );
};

export default ProductGrid;
