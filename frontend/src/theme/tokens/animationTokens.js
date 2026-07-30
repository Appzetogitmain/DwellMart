/**
 * Raw Animation Design Tokens
 * Motion scale for transitions, micro-interactions, and keyframes.
 */

export const animationTokens = {
  duration: {
    fast: '150ms',
    normal: '250ms',
    slow: '350ms',
    verySlow: '500ms',
  },
  easing: {
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  preset: {
    hoverLift: 'transform 250ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1)',
    fade: 'opacity 250ms cubic-bezier(0.4, 0, 0.2, 1)',
    scale: 'transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
    shimmer: 'shimmer 1.5s infinite linear',
  },
};
