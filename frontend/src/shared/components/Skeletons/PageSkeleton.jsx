/**
 * @deprecated PageSkeleton is replaced by DS SkeletonLoader.
 * This shim keeps existing import sites working.
 * Migrate callers to: import { SkeletonLoader } from 'shared/components/ui'
 */
import SkeletonLoader from '../ui/SkeletonLoader/SkeletonLoader';

const PageSkeleton = () => (
  <div className="min-h-screen bg-surface w-full overflow-x-hidden">
    {/* Header Skeleton */}
    <div className="bg-surface-header border-b border-border animate-pulse">
      <div className="container mx-auto px-2 sm:px-4 py-4">
        <SkeletonLoader height={48} rounded="md" className="w-full" />
      </div>
    </div>

    {/* Navbar Skeleton */}
    <div className="bg-surface-header border-b border-border animate-pulse">
      <div className="container mx-auto px-2 sm:px-4 py-3">
        <SkeletonLoader height={40} rounded="md" className="w-full" />
      </div>
    </div>

    {/* Main Content Skeleton */}
    <main className="container mx-auto px-2 sm:px-4 py-8">
      <div className="mb-8">
        <SkeletonLoader height={40} width={256} rounded="md" className="mb-4" />
        <SkeletonLoader height={16} width={384} rounded="sm" />
      </div>
      <SkeletonLoader.Card count={6} />
    </main>

    {/* Footer Skeleton */}
    <div className="mt-20 bg-surface-header animate-pulse">
      <div className="container mx-auto px-2 sm:px-4 py-16">
        <SkeletonLoader height={24} width={192} rounded="md" className="mb-4" />
        <SkeletonLoader height={16} width={256} rounded="sm" />
      </div>
    </div>
  </div>
);

export default PageSkeleton;
