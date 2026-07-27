import { usePermission } from '../hooks/usePermission';
import { FiShield, FiAlertTriangle, FiArrowLeft } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

/**
 * Route protection wrapper for Admin panel pages
 * Usage: <AdminRouteGuard permission="orders.view"><OrdersPage /></AdminRouteGuard>
 */
const AdminRouteGuard = ({ permission, requiredRole, children }) => {
  const { hasPermission, isSuperAdmin } = usePermission();
  const navigate = useNavigate();

  let isAllowed = true;

  if (requiredRole === 'superadmin') {
    isAllowed = isSuperAdmin;
  } else if (permission) {
    isAllowed = hasPermission(permission);
  }

  const getFirstPermittedRoute = () => {
    if (isSuperAdmin || hasPermission('dashboard.view')) return '/admin/dashboard';
    if (hasPermission('orders.view')) return '/admin/orders';
    if (hasPermission('products.view')) return '/admin/products';
    if (hasPermission('categories.view')) return '/admin/categories';
    if (hasPermission('vendors.view')) return '/admin/vendors';
    if (hasPermission('users.view')) return '/admin/customers';
    if (hasPermission('delivery.view')) return '/admin/delivery';
    if (hasPermission('support.view')) return '/admin/support';
    if (hasPermission('wallet.view')) return '/admin/finance/revenue-overview';
    if (hasPermission('reports.view')) return '/admin/reports/sales-report';
    if (hasPermission('offers.view')) return '/admin/offers';
    if (hasPermission('settings.view')) return '/admin/settings/general';
    return '/admin/login';
  };

  if (!isAllowed) {
    return (
      <div className="min-h-[500px] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-3xl p-8 shadow-sm text-center">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FiShield className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">403 Access Denied</h2>
          <p className="text-sm text-gray-500 mb-6">
            You do not have permission to view or manage this administrative module. Please contact your Super Administrator if you require access.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => navigate(getFirstPermittedRoute())}
              className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm rounded-xl shadow-sm transition-all flex items-center gap-2"
            >
              <FiArrowLeft className="w-4 h-4" /> Go to Authorized Module
            </button>
          </div>
        </div>
      </div>
    );
  }

  return children;
};

export default AdminRouteGuard;
