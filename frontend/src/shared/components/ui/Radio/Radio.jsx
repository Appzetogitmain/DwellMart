import React from 'react';
import { FormControl } from '../FormControl/FormControl';

export const Radio = ({
  checked = false,
  value,
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
          type="radio"
          checked={checked}
          value={value}
          disabled={disabled}
          onChange={onChange}
          className="sr-only peer"
          {...props}
        />
        <div
          onClick={() => !disabled && onChange && onChange({ target: { value, checked: true } })}
          className={`w-4 h-4 rounded-full border transition-all duration-150 flex items-center justify-center cursor-pointer ${
            disabled
              ? 'bg-borderToken-light border-borderToken-default cursor-not-allowed'
              : checked
              ? 'bg-brand-primary border-brand-primary'
              : 'bg-surface-card border-borderToken-default hover:border-brand-primary'
          } ${error ? 'border-status-error' : ''}`}
        >
          {checked && <div className="w-1.5 h-1.5 rounded-full bg-textColor-brand" />}
        </div>
      </div>
    </FormControl>
  );
};

export default Radio;
