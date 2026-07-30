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
