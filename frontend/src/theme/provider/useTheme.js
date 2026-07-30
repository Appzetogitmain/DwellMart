import { useContext } from 'react';
import { ThemeContext } from './ThemeProvider';

/**
 * useTheme Hook
 * Provides theme context values: { theme, activeThemeId, setTheme, toggleMode, tokens, isValid }
 */
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }
  return context;
};
