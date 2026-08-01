import React from 'react';
import { FiMinus, FiPlus } from 'react-icons/fi';
import { Spinner } from '../Spinner';

export const QuantitySelector = ({
  value = 1,
  onChange,
  min = 1,
  max = 99,
  step = 1,
  allowManualInput = true,
  disabled = false,
  isLoading = false,
  isOutOfStock = false,
  size = 'md',
  className = '',
}) => {
  const isDisabled = disabled || isOutOfStock || isLoading;

  const handleDecrement = (e) => {
    e.stopPropagation();
    if (isDisabled) return;
    const nextVal = Math.max(min, value - step);
    if (onChange && nextVal !== value) onChange(nextVal);
  };

  const handleIncrement = (e) => {
    e.stopPropagation();
    if (isDisabled) return;
    const nextVal = Math.min(max, value + step);
    if (onChange && nextVal !== value) onChange(nextVal);
  };

  const handleInputChange = (e) => {
    if (isDisabled || !allowManualInput) return;
    const parsed = parseInt(e.target.value, 10);
    if (isNaN(parsed)) {
      if (onChange) onChange(min);
    } else {
      const clamped = Math.max(min, Math.min(max, parsed));
      if (onChange) onChange(clamped);
    }
  };

  const sizeClasses = {
    sm: 'h-7 text-xs px-1',
    md: 'h-9 text-sm px-1.5',
    lg: 'h-11 text-base px-2',
  };

  const buttonSizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-7 h-7 text-sm',
    lg: 'w-9 h-9 text-base',
  };

  return (
    <div
      className={`inline-flex items-center rounded-btn border border-border bg-surface shadow-sm ${
        sizeClasses[size] || sizeClasses.md
      } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {/* Decrement Button */}
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={isDisabled || value <= min}
        onClick={handleDecrement}
        className={`flex items-center justify-center rounded-sm transition-colors ${
          buttonSizeClasses[size] || buttonSizeClasses.md
        } ${
          isDisabled || value <= min
            ? 'opacity-40 cursor-not-allowed text-content-muted'
            : 'hover:bg-border/40 text-content cursor-pointer'
        }`}
      >
        <FiMinus />
      </button>

      {/* Value Display / Manual Input */}
      <div className="flex-1 min-w-[36px] text-center px-1">
        {isLoading ? (
          <Spinner size="sm" inline />
        ) : isOutOfStock ? (
          <span className="text-[10px] font-black text-status-error uppercase">Out</span>
        ) : allowManualInput ? (
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            disabled={isDisabled}
            onChange={handleInputChange}
            className="w-full bg-transparent text-center font-bold text-content focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        ) : (
          <span className="font-bold text-content select-none">{value}</span>
        )}
      </div>

      {/* Increment Button */}
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={isDisabled || value >= max}
        onClick={handleIncrement}
        className={`flex items-center justify-center rounded-sm transition-colors ${
          buttonSizeClasses[size] || buttonSizeClasses.md
        } ${
          isDisabled || value >= max
            ? 'opacity-40 cursor-not-allowed text-content-muted'
            : 'hover:bg-border/40 text-content cursor-pointer'
        }`}
      >
        <FiPlus />
      </button>
    </div>
  );
};

export default QuantitySelector;
