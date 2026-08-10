import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Custom hook for pull-to-refresh functionality with zero scroll-jank & 60fps smooth native scrolling
 * @param {Function} onRefresh - Callback function to execute on refresh
 * @param {Object} options - Configuration options
 * @param {Number} options.threshold - Distance in pixels to trigger refresh (default: 80)
 * @param {Number} options.resistance - Resistance factor for pull (default: 2.5)
 * @returns {Object} - State and refs for pull-to-refresh
 */
const usePullToRefresh = (onRefresh, options = {}) => {
  const { threshold = 80, resistance = 2.5 } = options;
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const stateRef = useRef({
    isPulling: false,
    isRefreshing: false,
    pullDistance: 0,
    startY: 0,
    startX: 0,
    currentY: 0,
    canPull: false,
  });

  // Sync ref with state
  useEffect(() => {
    stateRef.current.isPulling = isPulling;
    stateRef.current.isRefreshing = isRefreshing;
    stateRef.current.pullDistance = pullDistance;
  }, [isPulling, isRefreshing, pullDistance]);

  const elementRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    if (stateRef.current.isRefreshing) return;

    const touch = e.touches[0];
    stateRef.current.startY = touch.clientY;
    stateRef.current.startX = touch.clientX;
    stateRef.current.currentY = touch.clientY;

    // ONLY allow pull-to-refresh if window is scrolled to the absolute top (0px)
    const windowScrollTop = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    const element = elementRef.current;
    const elementScrollTop = element ? element.scrollTop : 0;

    if (windowScrollTop <= 2 && elementScrollTop <= 2) {
      stateRef.current.canPull = true;
    } else {
      stateRef.current.canPull = false;
    }
  }, []);

  const handleTouchMove = useCallback(
    (e) => {
      const { isRefreshing, startY, startX, canPull } = stateRef.current;
      if (!canPull || isRefreshing) return;

      const touch = e.touches[0];
      const currentY = touch.clientY;
      const currentX = touch.clientX;
      stateRef.current.currentY = currentY;

      const windowScrollTop = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
      if (windowScrollTop > 2) {
        stateRef.current.canPull = false;
        if (stateRef.current.isPulling) {
          setIsPulling(false);
          setPullDistance(0);
        }
        return;
      }

      const deltaY = currentY - startY;
      const deltaX = currentX - startX;

      // Only activate pull if downward pull is greater than horizontal swipe and > 15px
      if (deltaY > 15 && Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
        if (!stateRef.current.isPulling) {
          setIsPulling(true);
        }

        // Prevent native overscroll browser bounce ONLY when actively pulling down at page top
        if (e.cancelable) {
          try {
            e.preventDefault();
          } catch (err) {}
        }

        const distance = Math.min(deltaY / resistance, threshold * 1.5);
        setPullDistance(distance);
      } else if (deltaY <= 0) {
        if (stateRef.current.isPulling) {
          setPullDistance(0);
          setIsPulling(false);
        }
      }
    },
    [resistance, threshold]
  );

  const handleTouchEnd = useCallback(() => {
    const { isPulling, isRefreshing, pullDistance } = stateRef.current;
    stateRef.current.canPull = false;

    if (!isPulling || isRefreshing) {
      setPullDistance(0);
      setIsPulling(false);
      return;
    }

    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      setPullDistance(threshold);

      Promise.resolve(onRefresh()).finally(() => {
        setTimeout(() => {
          setIsRefreshing(false);
          setPullDistance(0);
          setIsPulling(false);
        }, 300);
      });
    } else {
      setPullDistance(0);
      setIsPulling(false);
    }

    stateRef.current.startY = 0;
    stateRef.current.startX = 0;
    stateRef.current.currentY = 0;
  }, [threshold, onRefresh]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // Use passive listener for smooth scrolling when not pulling
    const options = { passive: false };
    element.addEventListener('touchstart', handleTouchStart, options);
    element.addEventListener('touchmove', handleTouchMove, options);
    element.addEventListener('touchend', handleTouchEnd, options);

    return () => {
      element.removeEventListener('touchstart', handleTouchStart, options);
      element.removeEventListener('touchmove', handleTouchMove, options);
      element.removeEventListener('touchend', handleTouchEnd, options);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  useEffect(() => {
    setPullDistance(0);
    setIsPulling(false);
  }, []);

  return {
    pullDistance,
    isPulling,
    isRefreshing,
    elementRef,
  };
};

export default usePullToRefresh;
