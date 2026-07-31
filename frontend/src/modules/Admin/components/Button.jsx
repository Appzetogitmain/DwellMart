/**
 * @deprecated Admin/components/Button.jsx is deprecated.
 * Import from 'shared/components/ui' instead.
 *
 * Variant migration guide:
 *   primary        → variant="primary"
 *   secondary      → variant="secondary"
 *   danger         → variant="danger"
 *   success        → variant="success"
 *   ghost          → variant="ghost"
 *   ghostBlue      → variant="ghost" tone="primary"
 *   ghostRed       → variant="ghost" tone="danger"
 *   icon           → variant="icon"
 *   iconBlue       → variant="icon" tone="primary"
 *   iconRed        → variant="icon" tone="danger"
 *
 * This file is a temporary shim for backward compatibility.
 * It translates legacy Admin variant names to the DS Button API.
 */
import DSButton from '../../../shared/components/ui/Button/Button';

const VARIANT_MAP = {
  primary:    { variant: 'primary' },
  secondary:  { variant: 'secondary' },
  danger:     { variant: 'danger' },
  success:    { variant: 'success' },
  ghost:      { variant: 'ghost', tone: 'neutral' },
  ghostBlue:  { variant: 'ghost', tone: 'primary' },
  ghostRed:   { variant: 'ghost', tone: 'danger' },
  icon:       { variant: 'icon',  tone: 'neutral' },
  iconBlue:   { variant: 'icon',  tone: 'primary' },
  iconRed:    { variant: 'icon',  tone: 'danger' },
};

const Button = ({
  variant = 'primary',
  icon: Icon,
  iconPosition = 'left',
  children,
  ...props
}) => {
  const mapped = VARIANT_MAP[variant] || { variant: 'primary' };
  const leftIcon  = Icon && iconPosition === 'left'  ? <Icon /> : undefined;
  const rightIcon = Icon && iconPosition === 'right' ? <Icon /> : undefined;

  return (
    <DSButton
      {...mapped}
      leftIcon={leftIcon}
      rightIcon={rightIcon}
      {...props}
    >
      {children}
    </DSButton>
  );
};

export default Button;
