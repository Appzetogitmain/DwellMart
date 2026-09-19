import { useLocation } from 'react-router-dom';

/**
 * Wrapper component that ensures consistent route container styling
 * and path-based component lifecycle.
 */
const RouteWrapper = ({ children }) => {
  const location = useLocation();

  // Return children with location pathname key to force remount only on distinct path change
  // Without location.search so filter/query updates update in-place rather than unmounting
  return <div key={location.pathname} style={{ width: '100%', height: '100%' }}>{children}</div>;
};

export default RouteWrapper;

