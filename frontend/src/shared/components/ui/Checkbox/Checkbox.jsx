import React, { useRef, useEffect } from 'react';
import { FormControl } from '../FormControl/FormControl';
import { FiCheck, FiMinus } from 'react-icons/fi';

export const Checkbox = ({
  checked = false,
  indeterminate = false,
  onChange,
  label,
  description,
  error,
  helperText,
  required = false,
  disabled = false,
  className = '',
  ...props
}) => {
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <FormControl
      label={label}
      description={description}
      error={error}
      helperText={helperText}
      required={required}
      disabled={disabled}
      className={className}
    >
      <div className="relative inline-flex items-center justify-center">
        <input
          ref={inputRef}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          className="sr-only peer"
          {...props}
        />
        <div
          onClick={() => !disabled && onChange && onChange({ target: { checked: !checked } })}
          className={`w-4 h-4 rounded-sm border transition-all duration-150 flex items-center justify-center cursor-pointer ${
            disabled
              ? 'bg-borderToken-light border-borderToken-default cursor-not-allowed'
              : checked || indeterminate
              ? 'bg-brand-primary border-brand-primary text-textColor-brand shadow-sm'
              : 'bg-surface-card border-borderToken-default hover:border-brand-primary'
          } ${error ? 'border-status-error' : ''}`}
        >
          {indeterminate ? (
            <FiMinus className="text-xs stroke-[3]" />
          ) : checked ? (
            <FiCheck className="text-xs stroke-[3]" />
          ) : null}
        </div>
      </div>
    </FormControl>
  );
};

export default Checkbox;
