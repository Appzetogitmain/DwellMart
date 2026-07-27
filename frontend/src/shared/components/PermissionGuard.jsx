import { usePermission } from '../../modules/Admin/hooks/usePermission';

/**
 * PermissionGuard wrapper component
 * Usage:
 * <PermissionGuard permission="orders.update">
 *    <button>Update Order</button>
 * </PermissionGuard>
 */
const PermissionGuard = ({ permission, anyPermissions = [], children, fallback = null }) => {
  const { hasPermission, hasAnyPermission } = usePermission();

  let isAllowed = false;

  if (permission) {
    isAllowed = hasPermission(permission);
  } else if (anyPermissions.length > 0) {
    isAllowed = hasAnyPermission(...anyPermissions);
  } else {
    isAllowed = true;
  }

  if (!isAllowed) {
    return fallback;
  }

  return children;
};

export default PermissionGuard;
