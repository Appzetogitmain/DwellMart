import { forwardRef, useId } from 'react';
import { FiChevronDown, FiAlertCircle } from 'react-icons/fi';

/**
 * Enterprise Primitive Select Component
 * Custom styled dropdown control with forwardRef, options array, and accessible label binding.
 */
const Select = forwardRef(({
  label,
  options = [],
  value,
  defaultValue,
  placeholder = 'Select an option',
  error,
  helperText,
  disabled = false,
  required = false,
  fullWidth = true,
  className = '',
  onChange,
  id: customId,
  ...props
}, ref) => {
  const generatedId = useId();
  const selectId = customId || generatedId;
  const errorId = `${selectId}-error`;
  const helperId = `${selectId}-helper`;

  const baseSelectStyles = 'w-full bg-surface-input text-textColor-primary font-medium text-sm rounded-input border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-100 min-h-[44px] pl-3.5 pr-10 appearance-none cursor-pointer';

  const borderStyles = error
    ? 'border-statusToken-error text-statusToken-error focus:ring-red-500/20 focus:border-statusToken-error'
    : 'border-borderToken-default hover:border-borderToken-dark';

  const combinedSelectClasses = `
    ${baseSelectStyles}
    ${borderStyles}
    ${className}
  `.replace(/\s+/g, ' ').trim();

  return (
    <div
      className={`${fullWidth ? 'w-full' : 'inline-block'} space-y-1.5`}
      data-component="Select"
    >
      {label && (
        <label
          htmlFor={selectId}
          className="block text-xs font-bold uppercase tracking-wider text-textColor-primary"
        >
          {label}
          {required && <span className="text-statusToken-error ml-1">*</span>}
        </label>
      )}

      <div className="relative flex items-center">
        <select
          ref={ref}
          id={selectId}
          value={value}
          defaultValue={defaultValue}
          disabled={disabled}
          required={required}
          onChange={onChange}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          className={combinedSelectClasses}
          {...props}
        >
          {placeholder && (
            <option value="" disabled hidden>
              {placeholder}
            </option>
          )}
          {options.map((option, index) => {
            const isObj = typeof option === 'object' && option !== null;
            const optValue = isObj ? option.value : option;
            const optLabel = isObj ? option.label : option;
            const optDisabled = isObj ? !!option.disabled : false;

            return (
              <option key={index} value={optValue} disabled={optDisabled}>
                {optLabel}
              </option>
            );
          })}
        </select>

        <div className="absolute right-3.5 pointer-events-none text-textColor-muted flex items-center justify-center">
          <FiChevronDown className="text-base" />
        </div>
      </div>

      {/* Error Message or Helper Text */}
      {error ? (
        <p id={errorId} className="flex items-center gap-1 text-xs text-statusToken-error font-medium mt-1">
          <FiAlertCircle className="flex-shrink-0" />
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p id={helperId} className="text-xs text-textColor-muted font-normal mt-1">
          {helperText}
        </p>
      ) : null}
    </div>
  );
});

Select.displayName = 'Select';

export default Select;
