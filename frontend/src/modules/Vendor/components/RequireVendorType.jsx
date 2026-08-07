/**
 * RequireVendorType
 *
 * Route guard that prevents vendors from accessing routes
 * not permitted for their vendorType.
 *
 * Usage:
 *   <RequireVendorType allow={['quick_commerce', 'retail']}>
 *     <SomePage />
 *   </RequireVendorType>
 *
 * If no `allow` prop is given, the route is accessible to all vendor types.
 */
import { Navigate, useLocation } from 'react-router-dom';
import { useVendorAuthStore } from '../../store/vendorAuthStore';
import { VendorTypes, getVendorCapabilities } from '../../../../shared/config/vendorCapabilities';

const RequireVendorType = ({ children, allow }) => {
    const { vendor, isAuthenticated } = useVendorAuthStore();
    const location = useLocation();

    // Not logged in — let VendorProtectedRoute handle that
    if (!isAuthenticated || !vendor) return null;

    const vendorType = vendor.vendorType ?? VendorTypes.RETAIL;
    const caps = getVendorCapabilities(vendorType);

    // Check explicit allow list
    if (allow && allow.length > 0) {
        if (!allow.includes(vendorType)) {
            // Redirect to dashboard with a state flag so Dashboard can show a message
            return (
                <Navigate
                    to="/vendor/dashboard"
                    state={{ accessDenied: true, from: location.pathname }}
                    replace
                />
            );
        }
    }

    // Check against the vendorType's allowed routes
    const allowedRoutes = caps?.routes ?? [];
    const currentPath = location.pathname;
    const isAllowed = allowedRoutes.some((r) =>
        currentPath === r || currentPath.startsWith(r + '/')
    );

    if (allowedRoutes.length > 0 && !isAllowed) {
        return (
            <Navigate
                to="/vendor/dashboard"
                state={{ accessDenied: true, from: location.pathname }}
                replace
            />
        );
    }

    return children;
};

export default RequireVendorType;
