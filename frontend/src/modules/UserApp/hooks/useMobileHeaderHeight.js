import { useState, useEffect } from 'react';

/**
 * Hook to calculate the height of the mobile header
 * This is useful for adding padding-top to mobile page content
 */
const useMobileHeaderHeight = () => {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
  const [headerHeight, setHeaderHeight] = useState(isDesktop ? 0 : 64);

  useEffect(() => {
    const calculateHeight = () => {
      if (typeof window !== 'undefined' && window.innerWidth >= 768) {
        setHeaderHeight(0);
        return;
      }
      const header = document.querySelector('header[class*="fixed"]');
      if (header && header.offsetHeight > 0) {
        setHeaderHeight(header.offsetHeight);
      } else {
        setHeaderHeight(64);
      }
    };

    // Initial calculation
    calculateHeight();

    // Recalculate on resize
    window.addEventListener('resize', calculateHeight);
    
    // Recalculate after delays to ensure elements are rendered
    const timeoutId = setTimeout(calculateHeight, 100);
    const timeoutId2 = setTimeout(calculateHeight, 500);

    return () => {
      window.removeEventListener('resize', calculateHeight);
      clearTimeout(timeoutId);
      clearTimeout(timeoutId2);
    };
  }, []);

  return headerHeight;
};

export default useMobileHeaderHeight;

