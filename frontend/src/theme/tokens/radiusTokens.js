/**
 * Raw Radius Design Tokens
 * Standardized border radius design scale in pixels.
 */

export const radiusTokens = {
  none: 0,
  xs: 4,          // 4px
  sm: 6,          // 6px
  md: 8,          // 8px
  lg: 12,         // 12px (Buttons & Inputs)
  xl: 16,         // 16px (Product & Vendor Cards)
  '2xl': 20,      // 20px (Hero Banners & Modals)
  '3xl': 24,      // 24px (Drawers)
  full: 9999,     // Pills & Avatars

  // Component specific alias definitions
  button: 12,     // 12px
  input: 12,      // 12px
  badge: 9999,    // Full Pill
  card: 16,       // 16px
  modal: 16,      // 16px
  avatar: 9999,   // Full Pill
};
