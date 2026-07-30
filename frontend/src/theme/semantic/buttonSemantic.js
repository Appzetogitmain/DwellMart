/**
 * Semantic Button Tokens
 * Maps component UI purpose to design tokens.
 */

export const buttonSemantic = {
  primary: {
    background: 'var(--color-brand-primary)',
    backgroundHover: 'var(--color-brand-primary-hover)',
    text: '#000000',
    border: 'transparent',
    radius: 'var(--radius-button)',
    shadow: 'var(--shadow-button)',
    height: '44px',
  },
  secondary: {
    background: 'var(--color-surface-card)',
    backgroundHover: 'var(--color-border-light)',
    text: 'var(--color-text-primary)',
    border: 'var(--color-border-default)',
    radius: 'var(--radius-button)',
    shadow: 'none',
    height: '44px',
  },
  outline: {
    background: 'transparent',
    backgroundHover: 'rgba(212, 175, 55, 0.08)',
    text: 'var(--color-brand-primary)',
    border: 'var(--color-brand-primary)',
    radius: 'var(--radius-button)',
    shadow: 'none',
    height: '44px',
  },
  danger: {
    background: 'var(--color-status-error)',
    backgroundHover: '#DC2626',
    text: '#FFFFFF',
    border: 'transparent',
    radius: 'var(--radius-button)',
    shadow: 'none',
    height: '44px',
  },
  ghost: {
    background: 'transparent',
    backgroundHover: 'rgba(148, 163, 184, 0.1)',
    text: 'var(--color-text-secondary)',
    border: 'transparent',
    radius: 'var(--radius-button)',
    shadow: 'none',
    height: '44px',
  },
};
