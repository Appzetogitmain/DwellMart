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

const RequireCapability = ({ feature, permission, children }) => {
  const { vendor } = useVendorAuthStore();
  const location = useLocation();

  const vendorType = vendor?.vendorType ?? "retail";
  const caps = getVendorCapabilities(vendorType);

  // Check feature flag
  if (feature && !caps.features?.[feature]) {
    return (
      <Navigate
        to="/vendor/dashboard"
        state={{ from: location, accessDenied: true, reason: `Feature "${feature}" not available for your plan.` }}
        replace
      />
    );
  }

  // Check permission flag
  if (permission && !caps.permissions?.[permission]) {
    return (
      <Navigate
        to="/vendor/dashboard"
        state={{ from: location, accessDenied: true, reason: `Permission "${permission}" not available for your plan.` }}
        replace
      />
    );
  }

  return children;
};

export default RequireCapability;
