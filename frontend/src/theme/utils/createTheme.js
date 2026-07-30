import { colorTokens } from '../tokens/colorTokens';
import { typographyTokens } from '../tokens/typographyTokens';
import { spacingTokens } from '../tokens/spacingTokens';
import { radiusTokens } from '../tokens/radiusTokens';
import { shadowTokens } from '../tokens/shadowTokens';
import { animationTokens } from '../tokens/animationTokens';
import { breakpointTokens } from '../tokens/breakpointTokens';
import { zIndexTokens } from '../tokens/zIndexTokens';
import { opacityTokens } from '../tokens/opacityTokens';
import { layoutTokens } from '../tokens/layoutTokens';

/**
 * Creates a structured theme object with standard metadata and token fallbacks.
 */
export const createTheme = (config = {}) => {
  const {
    id = 'custom-theme',
    name = 'Custom Theme',
    version = '1.0.0',
    mode = 'light',
    description = '',
    author = 'DwellMart Theme Engine',
    colors = {},
    typography = {},
    spacing = {},
    radius = {},
    shadows = {},
    animations = {},
    breakpoints = {},
    zIndex = {},
    opacity = {},
    layout = {},
    semantic = {},
  } = config;

  return {
    id,
    name,
    version,
    mode,
    description,
    author,
    createdAt: new Date().toISOString().split('T')[0],
    colors: { ...colorTokens, ...colors },
    typography: { ...typographyTokens, ...typography },
    spacing: { ...spacingTokens, ...spacing },
    radius: { ...radiusTokens, ...radius },
    shadows: { ...shadowTokens, ...shadows },
    animations: { ...animationTokens, ...animations },
    breakpoints: { ...breakpointTokens, ...breakpoints },
    zIndex: { ...zIndexTokens, ...zIndex },
    opacity: { ...opacityTokens, ...opacity },
    layout: { ...layoutTokens, ...layout },
    semantic,
  };
};

/**
 * Deep merge utility for runtime themes.
 */
export const mergeTheme = (baseTheme, overrides = {}) => {
  return createTheme({
    ...baseTheme,
    ...overrides,
    colors: { ...baseTheme.colors, ...overrides.colors },
    spacing: { ...baseTheme.spacing, ...overrides.spacing },
    shadows: { ...baseTheme.shadows, ...overrides.shadows },
    radius: { ...baseTheme.radius, ...overrides.radius },
  });
};

/**
 * Theme Structural Validator
 * Verifies required tokens, color formats, and complete metadata.
 */
export const validateTheme = (theme) => {
  const requiredFields = ['id', 'name', 'version', 'mode', 'colors', 'spacing', 'radius', 'shadows'];
  const errors = [];

  if (!theme || typeof theme !== 'object') {
    return { isValid: false, errors: ['Theme must be an object'] };
  }

  requiredFields.forEach((field) => {
    if (!theme[field]) {
      errors.push(`Missing required theme property: "${field}"`);
    }
  });

  if (theme.colors) {
    const requiredColors = ['brand', 'surface', 'text', 'border', 'status'];
    requiredColors.forEach((group) => {
      if (!theme.colors[group]) {
        errors.push(`Missing required color token group: "${group}"`);
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};
