/**
 * Legacy component name retained to avoid breaking imports. Route access is
 * based on server-approved channel workspaces, never on vendorType.
 */
import { Navigate, useLocation } from 'react-router-dom';
import { useVendorAuthStore } from '../../store/vendorAuthStore';
import { useVendorWorkspace, withWorkspace } from '../hooks/useVendorWorkspace';

const RequireVendorType = ({ children, allow }) => {
  const { vendor, isAuthenticated } = useVendorAuthStore();
  const location = useLocation();
  const { workspace, readableWorkspaces } = useVendorWorkspace();

  // VendorProtectedRoute owns unauthenticated handling.
  if (!isAuthenticated || !vendor) return null;

  // `allow` is now an approved workspace allow-list. This frontend guard is a
  // UX boundary only; every protected API independently enforces the channel.
  if (allow?.length > 0
      && (!workspace || !readableWorkspaces.includes(workspace) || !allow.includes(workspace))) {
    return (
      <Navigate
        to={readableWorkspaces.length === 1
          ? withWorkspace('/vendor/dashboard', readableWorkspaces[0])
          : '/vendor/workspaces'}
        state={{ accessDenied: true, from: location.pathname }}
        replace
      />
    );
  }

  return children;
};

export default RequireVendorType;
