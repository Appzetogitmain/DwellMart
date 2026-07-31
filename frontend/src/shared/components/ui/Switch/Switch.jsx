import React from 'react';
import { motion } from 'framer-motion';
import { FormControl } from '../FormControl/FormControl';

export const Switch = ({
  checked = false,
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
      <div className="relative inline-flex items-center">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          className="sr-only peer"
          {...props}
        />
        <div
          onClick={() => !disabled && onChange && onChange({ target: { checked: !checked } })}
          className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 cursor-pointer flex items-center ${
            disabled
              ? 'bg-borderToken-light cursor-not-allowed'
              : checked
              ? 'bg-brand-primary'
              : 'bg-borderToken-default hover:bg-borderToken-muted'
          }`}
        >
          <motion.div
            animate={{ x: checked ? 16 : 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="w-4 h-4 rounded-full bg-surface-card shadow-md"
          />
        </div>
      </div>
    </FormControl>
  );
};

export default Switch;
