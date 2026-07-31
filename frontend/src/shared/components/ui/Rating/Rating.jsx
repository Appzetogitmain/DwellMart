import React, { useState } from 'react';
import { FiStar } from 'react-icons/fi';

export const Rating = ({
  value = 0,
  maxStars = 5,
  readOnly = false,
  onChange,
  size = 'md',
  showValue = false,
  className = '',
}) => {
  const [hoverValue, setHoverValue] = useState(null);
  const displayValue = hoverValue !== null ? hoverValue : value;

  const sizeClasses = {
    sm: 'text-xs gap-0.5',
    md: 'text-sm gap-1',
    lg: 'text-lg gap-1.5',
  };

  const handleStarClick = (index) => {
    if (readOnly) return;
    const newValue = index + 1;
    if (onChange) onChange(newValue);
  };

  return (
    <div className={`inline-flex items-center ${sizeClasses[size] || sizeClasses.md} ${className}`}>
      {Array.from({ length: maxStars }).map((_, index) => {
        const starNumber = index + 1;
        const isFull = displayValue >= starNumber;
        const isHalf = displayValue >= starNumber - 0.5 && displayValue < starNumber;

        return (
          <button
            key={index}
            type="button"
            disabled={readOnly}
            onClick={() => handleStarClick(index)}
            onMouseEnter={() => !readOnly && setHoverValue(starNumber)}
            onMouseLeave={() => !readOnly && setHoverValue(null)}
            className={`transition-all duration-150 ${
              readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'
            }`}
            aria-label={`Rate ${starNumber} out of ${maxStars}`}
          >
            {isFull ? (
              <FiStar className="text-amber-400 fill-amber-400" />
            ) : isHalf ? (
              <div className="relative inline-block text-amber-400">
                <FiStar className="text-borderToken-muted" />
                <div className="absolute top-0 left-0 w-1/2 overflow-hidden">
                  <FiStar className="text-amber-400 fill-amber-400" />
                </div>
              </div>
            ) : (
              <FiStar className="text-borderToken-muted" />
            )}
          </button>
        );
      })}

      {showValue && (
        <span className="ml-1.5 text-xs font-bold text-textColor-muted">
          ({displayValue.toFixed(1)})
        </span>
      )}
    </div>
  );
};

export default Rating;
