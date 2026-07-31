import React from 'react';

export const FormControl = ({
  label,
  description,
  error,
  helperText,
  required = false,
  disabled = false,
  children,
  className = '',
}) => {
  return (
    <div className={`space-y-1.5 ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
      <div className="flex items-start gap-2.5">
        <div className="pt-0.5">{children}</div>
        {label && (
          <div className="flex flex-col">
            <label className={`text-xs font-bold text-textColor-primary leading-snug select-none ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
              {label}
              {required && <span className="text-status-error ml-1">*</span>}
            </label>
            {description && (
              <p className="text-[11px] text-textColor-muted font-normal leading-relaxed mt-0.5">
                {description}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Error & Helper Messages */}
      {error ? (
        <p className="text-[11px] font-semibold text-status-error pl-6">{error}</p>
      ) : helperText ? (
        <p className="text-[11px] font-normal text-textColor-muted pl-6">{helperText}</p>
      ) : null}
    </div>
  );
};

export default FormControl;
