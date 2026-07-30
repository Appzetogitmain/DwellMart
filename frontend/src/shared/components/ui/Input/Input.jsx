import { forwardRef, useState, useId } from 'react';
import { FiEye, FiEyeOff, FiX, FiAlertCircle } from 'react-icons/fi';

/**
 * Enterprise Primitive Input Component
 * Supports forwardRef, password eye toggle, search clear, left/right icons, and accessible focus rings.
 */
const Input = forwardRef(({
  type = 'text',
  label,
  placeholder,
  value,
  defaultValue,
  error,
  helperText,
  leftIcon,
  rightIcon,
  disabled = false,
  readOnly = false,
  required = false,
  fullWidth = true,
  className = '',
  onChange,
  onClear,
  id: customId,
  ...props
}, ref) => {
  const generatedId = useId();
  const inputId = customId || generatedId;
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;

  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const isSearch = type === 'search';

  const currentType = isPassword ? (showPassword ? 'text' : 'password') : type;

  const baseInputStyles = 'w-full bg-surface-input text-textColor-primary placeholder:text-textColor-muted font-medium text-sm rounded-input border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-100 min-h-[44px] px-3.5';

  const borderStyles = error
    ? 'border-statusToken-error text-statusToken-error focus:ring-red-500/20 focus:border-statusToken-error'
    : 'border-borderToken-default hover:border-borderToken-dark';

  const paddingLeft = leftIcon ? 'pl-10' : 'pl-3.5';
  const paddingRight = (rightIcon || isPassword || (isSearch && value)) ? 'pr-10' : 'pr-3.5';

  const combinedInputClasses = `
    ${baseInputStyles}
    ${borderStyles}
    ${paddingLeft}
    ${paddingRight}
    ${className}
  `.replace(/\s+/g, ' ').trim();

  return (
    <div
      className={`${fullWidth ? 'w-full' : 'inline-block'} space-y-1.5`}
      data-component="Input"
      data-type={type}
    >
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-bold uppercase tracking-wider text-textColor-primary"
        >
          {label}
          {required && <span className="text-statusToken-error ml-1">*</span>}
        </label>
      )}

      <div className="relative flex items-center">
        {leftIcon && (
          <div className="absolute left-3.5 text-textColor-muted pointer-events-none flex items-center justify-center text-base">
            {leftIcon}
          </div>
        )}

        <input
          ref={ref}
          id={inputId}
          type={currentType}
          value={value}
          defaultValue={defaultValue}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          onChange={onChange}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          className={combinedInputClasses}
          {...props}
        />

        {/* Right Icon / Password Toggle / Search Clear */}
        <div className="absolute right-3.5 flex items-center gap-1.5">
          {isPassword && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword(!showPassword)}
              className="text-textColor-muted hover:text-textColor-primary transition-colors focus:outline-none p-1 rounded-md"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <FiEyeOff className="text-base" /> : <FiEye className="text-base" />}
            </button>
          )}

          {isSearch && value && onClear && (
            <button
              type="button"
              onClick={onClear}
              className="text-textColor-muted hover:text-textColor-primary transition-colors focus:outline-none p-1 rounded-md"
              aria-label="Clear search"
            >
              <FiX className="text-base" />
            </button>
          )}

          {!isPassword && !isSearch && rightIcon && (
            <div className="text-textColor-muted flex items-center justify-center text-base">
              {rightIcon}
            </div>
          )}
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

Input.displayName = 'Input';

export default Input;
