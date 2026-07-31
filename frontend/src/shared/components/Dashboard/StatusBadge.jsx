import React from 'react';
import { Badge } from '../ui';

export const StatusBadge = ({ status = '', size = 'sm', className = '' }) => {
  const normalizedStatus = String(status || '').toLowerCase().trim();

  const statusConfig = {
    pending: { variant: 'warning', label: 'Pending' },
    processing: { variant: 'info', label: 'Processing' },
    shipped: { variant: 'info', label: 'Shipped' },
    delivered: { variant: 'success', label: 'Delivered' },
    completed: { variant: 'success', label: 'Completed' },
    approved: { variant: 'success', label: 'Approved' },
    active: { variant: 'success', label: 'Active' },
    gold: { variant: 'gold', label: 'VIP' },
    verified: { variant: 'verified', label: 'Verified' },
    cancelled: { variant: 'error', label: 'Cancelled' },
    rejected: { variant: 'error', label: 'Rejected' },
    inactive: { variant: 'outline', label: 'Inactive' },
    draft: { variant: 'outline', label: 'Draft' },
    out_of_stock: { variant: 'error', label: 'Out of Stock' },
  };

  const config = statusConfig[normalizedStatus] || {
    variant: 'default',
    label: status || 'Unknown',
  };

  return (
    <Badge variant={config.variant} size={size} className={className}>
      {config.label}
    </Badge>
  );
};

export default StatusBadge;
