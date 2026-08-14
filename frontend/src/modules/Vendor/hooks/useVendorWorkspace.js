import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useVendorAuthStore } from '../store/vendorAuthStore';

export const WORKSPACES = ['retail', 'wholesale', 'quick_commerce'];
export const WORKSPACE_LABELS = {
  retail: 'Retail Marketplace',
  wholesale: 'Wholesale Marketplace',
  quick_commerce: 'Quick Commerce',
};

export const withWorkspace = (path, workspace) => {
  if (!workspace) return path;
  const [pathname, query = ''] = String(path).split('?');
  const params = new URLSearchParams(query);
  params.set('workspace', workspace);
  return `${pathname}?${params.toString()}`;
};

export const useVendorWorkspace = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const vendor = useVendorAuthStore((state) => state.vendor);
  const workspace = useMemo(() => {
    const value = new URLSearchParams(location.search).get('workspace');
    return WORKSPACES.includes(value) ? value : null;
  }, [location.search]);
  const activeWorkspaces = vendor?.activeWorkspaces || [];
  const readableWorkspaces = vendor?.readableWorkspaces || activeWorkspaces;
  const switchWorkspace = (next, path = location.pathname) => {
    if (!readableWorkspaces.includes(next)) return;
    sessionStorage.setItem('vendor-last-workspace', next);
    navigate(withWorkspace(path, next));
  };
  return { workspace, activeWorkspaces, readableWorkspaces, switchWorkspace };
};

