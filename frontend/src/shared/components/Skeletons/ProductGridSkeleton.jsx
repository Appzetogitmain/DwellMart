/**
 * @deprecated ProductGridSkeleton is replaced by DS SkeletonLoader.Card.
 * This shim keeps existing import sites working.
 * Migrate callers to: <SkeletonLoader.Card count={8} />
 */
import SkeletonLoader from '../ui/SkeletonLoader/SkeletonLoader';

const ProductGridSkeleton = ({ count = 8 }) => (
  <SkeletonLoader.Card count={count} />
);

export default ProductGridSkeleton;
