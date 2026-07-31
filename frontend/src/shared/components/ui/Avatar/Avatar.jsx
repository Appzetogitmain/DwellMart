import React from 'react';
import { FiCheck, FiUser } from 'react-icons/fi';

export const Avatar = ({
  src,
  name = '',
  size = 'md',
  shape = 'circle',
  status = null,
  isVerified = false,
  className = '',
}) => {
  const getInitials = (str) => {
    if (!str) return '';
    const parts = str.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return str.slice(0, 2).toUpperCase();
  };

  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-xl',
  };

  const statusColorClasses = {
    online: 'bg-status-success',
    offline: 'bg-textColor-muted',
    away: 'bg-status-warning',
    busy: 'bg-status-error',
  };

  const statusSizeClasses = {
    xs: 'w-1.5 h-1.5 ring-1',
    sm: 'w-2 h-2 ring-1',
    md: 'w-2.5 h-2.5 ring-2',
    lg: 'w-3 h-3 ring-2',
    xl: 'w-4 h-4 ring-2',
  };

  const roundedClass = shape === 'circle' ? 'rounded-full' : 'rounded-card';

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      <div
        className={`${sizeClasses[size] || sizeClasses.md} ${roundedClass} overflow-hidden bg-brand-primary/15 text-brand-primary font-bold border border-brand-primary/30 flex items-center justify-center select-none shadow-sm`}
      >
        {src ? (
          <img
            src={src}
            alt={name || 'Avatar'}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        ) : name ? (
          <span>{getInitials(name)}</span>
        ) : (
          <FiUser />
        )}
      </div>

      {/* Online/Offline Status Indicator */}
      {status && (
        <span
          className={`absolute bottom-0 right-0 ${statusSizeClasses[size] || statusSizeClasses.md} ${
            statusColorClasses[status] || statusColorClasses.online
          } rounded-full ring-surface-card`}
        />
      )}

      {/* Verified Badge Overlay */}
      {isVerified && !status && (
        <span className="absolute -bottom-0.5 -right-0.5 bg-brand-primary text-textColor-brand rounded-full p-0.5 text-[8px] ring-2 ring-surface-card">
          <FiCheck className="stroke-[3]" />
        </span>
      )}
    </div>
  );
};

// Compound Avatar.Group Component
Avatar.Group = ({ children, max = 3, size = 'md', className = '' }) => {
  const childArray = React.Children.toArray(children);
  const visibleAvatars = childArray.slice(0, max);
  const remainingCount = childArray.length - max;

  return (
    <div className={`flex items-center -space-x-2 overflow-hidden ${className}`}>
      {visibleAvatars.map((child, idx) =>
        React.cloneElement(child, { key: idx, size, className: `${child.props.className || ''} ring-2 ring-surface-card` })
      )}
      {remainingCount > 0 && (
        <div
          className={`w-10 h-10 rounded-full bg-surface-card border border-borderToken-default text-textColor-muted text-xs font-black flex items-center justify-center ring-2 ring-surface-card select-none`}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
};

export default Avatar;
