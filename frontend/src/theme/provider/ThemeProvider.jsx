import { createContext, useState, useEffect, useMemo, useCallback } from 'react';
import { defaultTheme } from '../themes/defaultTheme';
import { luxuryTheme } from '../themes/luxuryTheme';
import { darkTheme } from '../themes/darkTheme';
import { festivalTheme } from '../themes/festivalTheme';
import { applyThemeCssVars } from '../utils/cssVarGenerator';
import { validateTheme } from '../utils/validateTheme';

export const ThemeContext = createContext(null);

const THEME_REGISTRY = {
  default: defaultTheme,
  luxury: luxuryTheme,
  dark: darkTheme,
  festival: festivalTheme,
};

export const ThemeProvider = ({ children, defaultThemeId = 'default' }) => {
  const [activeThemeId, setActiveThemeId] = useState(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem('dwellmart_theme') || defaultThemeId;
    }
    return defaultThemeId;
  });

  const activeTheme = useMemo(() => {
    return THEME_REGISTRY[activeThemeId] || THEME_REGISTRY.default;
  }, [activeThemeId]);

  const validation = useMemo(() => {
    return validateTheme(activeTheme);
  }, [activeTheme]);

  useEffect(() => {
    applyThemeCssVars(activeTheme);

    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('dwellmart_theme', activeThemeId);
    }
  }, [activeTheme, activeThemeId]);

  const setTheme = useCallback((themeId) => {
    if (THEME_REGISTRY[themeId]) {
      setActiveThemeId(themeId);
    } else {
      console.warn(`[ThemeProvider] Theme "${themeId}" not recognized. Falling back to default.`);
    }
  }, []);

  const toggleMode = useCallback(() => {
    setActiveThemeId((prev) => (prev === 'dark' ? 'default' : 'dark'));
  }, []);

  // Developer runtime helper
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__setTheme = setTheme;
      window.__getTheme = () => activeTheme;
    }
  }, [setTheme, activeTheme]);

  const contextValue = useMemo(() => ({
    theme: activeTheme,
    activeThemeId,
    setTheme,
    toggleMode,
    tokens: activeTheme,
    currentMode: activeTheme.mode,
    isValid: validation.isValid,
    validationErrors: validation.errors,
    availableThemes: Object.keys(THEME_REGISTRY),
  }), [activeTheme, activeThemeId, setTheme, toggleMode, validation]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};
