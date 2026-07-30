import { forwardRef, useId } from 'react';
import { FiAlertCircle } from 'react-icons/fi';

/**
 * Enterprise Primitive TextArea Component
 * Multi-line form input with forwardRef, character count indicator, and accessibility features.
 */
const TextArea = forwardRef(({
  label,
  placeholder,
  value,
  defaultValue,
  rows = 4,
  maxLength,
  showCharCount = false,
  error,
  helperText,
  disabled = false,
  readOnly = false,
  required = false,
  fullWidth = true,
  className = '',
  onChange,
  id: customId,
  ...props
}, ref) => {
  const generatedId = useId();
  const textareaId = customId || generatedId;
  const errorId = `${textareaId}-error`;
  const helperId = `${textareaId}-helper`;

  const charCount = typeof value === 'string' ? value.length : (typeof defaultValue === 'string' ? defaultValue.length : 0);

  const baseStyles = 'w-full bg-surface-input text-textColor-primary placeholder:text-textColor-muted font-medium text-sm rounded-input border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-100 p-3.5 resize-y';

  const borderStyles = error
    ? 'border-statusToken-error text-statusToken-error focus:ring-red-500/20 focus:border-statusToken-error'
    : 'border-borderToken-default hover:border-borderToken-dark';

  const combinedClasses = `
    ${baseStyles}
    ${borderStyles}
    ${className}
  `.replace(/\s+/g, ' ').trim();

  return (
    <div
      className={`${fullWidth ? 'w-full' : 'inline-block'} space-y-1.5`}
      data-component="TextArea"
    >
      <div className="flex items-center justify-between">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-xs font-bold uppercase tracking-wider text-textColor-primary"
          >
            {label}
            {required && <span className="text-statusToken-error ml-1">*</span>}
          </label>
        )}
        {showCharCount && maxLength && (
          <span className="text-xs text-textColor-muted font-medium">
            {charCount}/{maxLength}
          </span>
        )}
      </div>

      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        maxLength={maxLength}
        value={value}
        defaultValue={defaultValue}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        onChange={onChange}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : helperText ? helperId : undefined}
        className={combinedClasses}
        {...props}
      />

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

TextArea.displayName = 'TextArea';

export default TextArea;
