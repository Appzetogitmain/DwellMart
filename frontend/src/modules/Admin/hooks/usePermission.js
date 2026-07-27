import { useAdminAuthStore } from '../store/adminStore';

/**
 * Custom React hook for RBAC permission checks
 */
export const usePermission = () => {
  const { admin, can, canAny } = useAdminAuthStore();

  const isSuperAdmin = admin?.role === 'superadmin';

  const hasPermission = (permission) => {
    if (!admin) return false;
    if (isSuperAdmin) return true;
    return can(permission);
  };

  const hasAnyPermission = (...permissions) => {
    if (!admin) return false;
    if (isSuperAdmin) return true;
    return canAny(...permissions);
  };

  return {
    isSuperAdmin,
    role: admin?.role || 'subadmin',
    permissions: admin?.permissions || [],
    hasPermission,
    hasAnyPermission,
    can: hasPermission,
  };
};
