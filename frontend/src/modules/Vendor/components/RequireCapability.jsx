/**
 * RequireCapability
 *
 * Feature-based route guard. Gate routes by capability rather than by raw
 * vendorType, so future vendor types (Restaurant, Pharmacy, etc.) can
 * unlock features without changing route definitions.
 *
 * Usage:
 *   <RequireCapability feature="analytics" />
 *   <RequireCapability feature="customers" />
 *   <RequireCapability permission="createCoupons" />
 *   <RequireCapability feature="analytics" permission="bulkPricing" />
 *
 * Vendors lacking the capability are redirected to /vendor/dashboard.
 */

import { Navigate, useLocation } from "react-router-dom";
import { useVendorAuthStore } from "../store/vendorAuthStore";
import { getVendorCapabilities } from "../../../shared/config/vendorCapabilities";
import { useVendorWorkspace, withWorkspace } from '../hooks/useVendorWorkspace';

const RequireCapability = ({ feature, permission, children }) => {
  const { vendor } = useVendorAuthStore();
  const location = useLocation();
  const { workspace } = useVendorWorkspace();

  const vendorType = workspace ?? vendor?.activeWorkspaces?.[0] ?? "retail";
  const caps = getVendorCapabilities(vendorType);

  // Check feature flag
  if (feature && !caps.features?.[feature]) {
    return (
      <Navigate
        to={withWorkspace("/vendor/dashboard", workspace)}
        state={{ from: location, accessDenied: true, reason: `Feature "${feature}" not available for your plan.` }}
        replace
      />
    );
  }

  // Check permission flag
  if (permission && !caps.permissions?.[permission]) {
    return (
      <Navigate
        to={withWorkspace("/vendor/dashboard", workspace)}
        state={{ from: location, accessDenied: true, reason: `Permission "${permission}" not available for your plan.` }}
        replace
      />
    );
  }

  return children;
};

export default RequireCapability;
