import { useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';

/**
 * Wrapper component that forces remounting when location changes
 * This ensures React Router properly updates components on navigation
 */
const RouteWrapper = ({ children }) => {
  const location = useLocation();
  const [catalogTick, setCatalogTick] = useState(0);

  useEffect(() => {
    const onCatalogUpdate = () => setCatalogTick((prev) => prev + 1);
    window.addEventListener('catalog-cache-updated', onCatalogUpdate);
    return () => {
      window.removeEventListener('catalog-cache-updated', onCatalogUpdate);
    };
  }, []);
  
  // Return children with location pathname key to force remount on path change
  // Without location.search so filter/query updates update in-place rather than unmounting
  return <div key={`${location.pathname}:${catalogTick}`} style={{ width: '100%', height: '100%' }}>{children}</div>;
};

export default RouteWrapper;

