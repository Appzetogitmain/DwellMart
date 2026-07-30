/**
 * CSS Variable Generator Utility
 * Automatically injects theme design tokens as CSS custom properties onto document.documentElement (:root).
 */

const camelToKebab = (str) =>
  str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();

/**
 * Converts a nested token object into a flat object of CSS variable name -> value pairs.
 */
export const flattenTokensToCssVars = (obj, prefix = '') => {
  const vars = {};
  if (!obj || typeof obj !== 'object') return vars;

  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    const varName = prefix ? `${prefix}-${camelToKebab(key)}` : `--${camelToKebab(key)}`;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(vars, flattenTokensToCssVars(value, varName));
    } else {
      // Append 'px' to pure numbers if key belongs to spacing, radius, etc. (unless 0 or unitless)
      let formattedValue = value;
      if (typeof value === 'number' && value !== 0 && !varName.includes('opacity') && !varName.includes('z-index') && !varName.includes('font-weight')) {
        formattedValue = `${value}px`;
      }
      vars[varName] = String(formattedValue);
    }
  });

  return vars;
};

/**
 * Applies CSS variables onto document.documentElement (:root).
 */
export const applyThemeCssVars = (theme) => {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  // Flatten colors, typography, spacing, radius, shadows, animations, zIndex, opacity, layout
  const colorVars = flattenTokensToCssVars(theme.colors, '--color');
  const spacingVars = flattenTokensToCssVars(theme.spacing, '--spacing');
  const radiusVars = flattenTokensToCssVars(theme.radius, '--radius');
  const shadowVars = flattenTokensToCssVars(theme.shadows, '--shadow');
  const animationVars = flattenTokensToCssVars(theme.animations, '--animation');
  const zVars = flattenTokensToCssVars(theme.zIndex, '--z');
  const opacityVars = flattenTokensToCssVars(theme.opacity, '--opacity');
  const layoutVars = flattenTokensToCssVars(theme.layout, '--layout');

  const allVars = {
    ...colorVars,
    ...spacingVars,
    ...radiusVars,
    ...shadowVars,
    ...animationVars,
    ...zVars,
    ...opacityVars,
    ...layoutVars,
  };

  Object.keys(allVars).forEach((varName) => {
    root.style.setProperty(varName, allVars[varName]);
  });

  // Set theme data attributes for CSS targeting if needed
  root.setAttribute('data-theme', theme.id || 'default');
  root.setAttribute('data-mode', theme.mode || 'light');
};
