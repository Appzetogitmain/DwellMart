import { useState, useEffect } from 'react';

/**
 * Custom hook to detect if virtual keyboard is visible on mobile devices.
 * Uses focusin/focusout input tracking + VisualViewport API for full cross-device accuracy.
 */
const useKeyboardVisible = () => {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isInputField = (element) => {
      if (!element) return false;
      const tagName = element.tagName;
      if (tagName === 'TEXTAREA' || element.isContentEditable) return true;
      if (tagName === 'INPUT') {
        const type = (element.getAttribute('type') || 'text').toLowerCase();
        return !['checkbox', 'radio', 'button', 'submit', 'image', 'color', 'file', 'hidden'].includes(type);
      }
      return false;
    };

    const handleFocusIn = (e) => {
      if (isInputField(e.target)) {
        setIsKeyboardVisible(true);
      }
    };

    const handleFocusOut = () => {
      // Small timeout to check if focus moved to another input
      setTimeout(() => {
        if (!isInputField(document.activeElement)) {
          setIsKeyboardVisible(false);
        }
      }, 50);
    };

    const handleViewportResize = () => {
      if (window.visualViewport) {
        // If visualViewport height shrinks significantly compared to innerHeight (keyboard popped up)
        const isShrunk = window.visualViewport.height < window.innerHeight * 0.82;
        if (isShrunk) {
          setIsKeyboardVisible(true);
        } else if (!isInputField(document.activeElement)) {
          setIsKeyboardVisible(false);
        }
      }
    };

    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', handleFocusOut);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportResize);
    }

    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportResize);
      }
    };
  }, []);

  return isKeyboardVisible;
};

export default useKeyboardVisible;
