import { forwardRef } from 'react';
import { motion } from 'framer-motion';

/**
 * Enterprise Primitive Card Component
 * Surface card with polymorphic 'as' prop, hover lift transitions, and compound sub-components.
 */
const Card = forwardRef(({
  as: Component = 'div',
  children,
  variant = 'default',
  padding = 'md',
  hoverable = false,
  className = '',
  onClick,
  ...props
}, ref) => {
  const paddingStyles = {
    none: 'p-0',
    sm: 'p-3 sm:p-4',
    md: 'p-4 sm:p-5',
    lg: 'p-6 sm:p-8',
  };

  const variantStyles = {
    default: 'bg-surface-card border border-borderToken-default shadow-card text-textColor-primary',
    elevated: 'bg-surface-cardElevated border border-borderToken-light shadow-card-hover text-textColor-primary',
    bordered: 'bg-surface-card border-2 border-borderToken-default shadow-none text-textColor-primary',
    glass: 'bg-surface-card/80 backdrop-blur-md border border-borderToken-goldAccent shadow-card text-textColor-primary',
  };

  const baseStyles = 'rounded-card overflow-hidden transition-all duration-300 ease-in-out';
  const hoverStyles = hoverable ? 'hover:-translate-y-1 hover:shadow-card-hover cursor-pointer' : '';

  const combinedClasses = `
    ${baseStyles}
    ${variantStyles[variant] || variantStyles.default}
    ${paddingStyles[padding] || paddingStyles.md}
    ${hoverStyles}
    ${className}
  `.replace(/\s+/g, ' ').trim();

  const MotionComponent = motion(Component);

  return (
    <MotionComponent
      ref={ref}
      onClick={onClick}
      className={combinedClasses}
      data-component="Card"
      data-variant={variant}
      {...props}
    >
      {children}
    </MotionComponent>
  );
});

Card.displayName = 'Card';

// Compound Component Definitions
const CardHeader = ({ children, className = '', ...props }) => (
  <div
    className={`pb-3 mb-3 border-b border-borderToken-light flex items-center justify-between ${className}`}
    data-component="CardHeader"
    {...props}
  >
    {children}
  </div>
);

const CardBody = ({ children, className = '', ...props }) => (
  <div className={`space-y-3 ${className}`} data-component="CardBody" {...props}>
    {children}
  </div>
);

const CardFooter = ({ children, className = '', ...props }) => (
  <div
    className={`pt-3 mt-3 border-t border-borderToken-light flex items-center justify-between ${className}`}
    data-component="CardFooter"
    {...props}
  >
    {children}
  </div>
);

const CardActions = ({ children, className = '', ...props }) => (
  <div
    className={`flex items-center justify-end gap-2.5 pt-2 ${className}`}
    data-component="CardActions"
    {...props}
  >
    {children}
  </div>
);

CardHeader.displayName = 'Card.Header';
CardBody.displayName = 'Card.Body';
CardFooter.displayName = 'Card.Footer';
CardActions.displayName = 'Card.Actions';

Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;
Card.Actions = CardActions;

export default Card;
