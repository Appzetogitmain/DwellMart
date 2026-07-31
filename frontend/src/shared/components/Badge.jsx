/**
 * @deprecated shared/components/Badge.jsx is a backward-compatibility bridge.
 * All 44 existing import sites continue to work without changes.
 *
 * This maps legacy variant names (pending, shipped, cancelled, etc.) to DS Badge semantic variants.
 * Migrate import sites to: import { Badge } from 'shared/components/ui'
 */
import DSBadge from './ui/Badge/Badge';

const VARIANT_MAP = {
  // Product / content badges
  flash:              'info',
  discount:           'error',
  sale:               'success',
  info:               'info',
  warning:            'warning',
  error:              'error',
  success:            'success',
  // Order status badges
  pending:            'warning',
  processing:         'info',
  shipped:            'info',
  delivered:          'success',
  cancelled:          'error',
  returned:           'warning',
  approved:           'success',
  rejected:           'error',
  completed:          'success',
  // Return status badges
  'return-pending':    'warning',
  'return-approved':   'success',
  'return-rejected':   'error',
  'return-processing': 'info',
  'return-completed':  'success',
};

const Badge = ({ children, variant = 'info', className = '' }) => (
  <DSBadge
    variant={VARIANT_MAP[variant] ?? variant}
    className={className}
  >
    {children}
  </DSBadge>
);

export default Badge;
