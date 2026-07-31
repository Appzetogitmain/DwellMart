import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export const Tooltip = ({
  children,
  content,
  placement = 'top',
  trigger = 'hover',
  delay = 200,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const timeoutRef = useRef(null);

  const updateCoords = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollX = window.scrollX || document.documentElement.scrollLeft;

    let top = 0;
    let left = 0;

    switch (placement) {
      case 'top':
        top = rect.top + scrollY - 8;
        left = rect.left + scrollX + rect.width / 2;
        break;
      case 'bottom':
        top = rect.bottom + scrollY + 8;
        left = rect.left + scrollX + rect.width / 2;
        break;
      case 'left':
        top = rect.top + scrollY + rect.height / 2;
        left = rect.left + scrollX - 8;
        break;
      case 'right':
        top = rect.top + scrollY + rect.height / 2;
        left = rect.right + scrollX + 8;
        break;
      default:
        break;
    }
    setCoords({ top, left });
  };

  const showTooltip = () => {
    timeoutRef.current = setTimeout(() => {
      updateCoords();
      setIsVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const placementTransforms = {
    top: '-translate-x-1/2 -translate-y-full',
    bottom: '-translate-x-1/2',
    left: '-translate-x-full -translate-y-1/2',
    right: '-translate-y-1/2',
  };

  const eventHandlers = {};
  if (trigger === 'hover') {
    eventHandlers.onMouseEnter = showTooltip;
    eventHandlers.onMouseLeave = hideTooltip;
  } else if (trigger === 'click') {
    eventHandlers.onClick = () => setIsVisible((prev) => !prev);
  } else if (trigger === 'focus') {
    eventHandlers.onFocus = showTooltip;
    eventHandlers.onBlur = hideTooltip;
  }

  return (
    <>
      <div ref={triggerRef} className="inline-block" {...eventHandlers}>
        {children}
      </div>

      {isVisible &&
        content &&
        createPortal(
          <div
            style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
            className={`fixed z-tooltip pointer-events-none px-2.5 py-1 text-[11px] font-semibold text-textColor-brand bg-zinc-900 rounded-btn shadow-lg transition-opacity duration-150 animate-in fade-in ${
              placementTransforms[placement] || placementTransforms.top
            } ${className}`}
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
};

export default Tooltip;
