/**
 * Raw Color Design Tokens
 * Independent design values representing the master color palette.
 */

export const colorTokens = {
  brand: {
    primary: '#D4AF37',          // Warm Metallic Gold
    primaryHover: '#B8922E',     // Darker Gold for hover
    primaryActive: '#A4821A',    // Pressed Gold state
    secondary: '#0B0F17',        // Obsidian Dark Accent
    secondaryHover: '#161D2B',   // Dark Accent hover
    accent: '#F59E0B',           // Amber Accent
  },
  surface: {
    background: '#F8FAFC',       // Clean Light Canvas
    card: '#FFFFFF',             // Flat Card Surface
    cardElevated: '#FFFFFF',     // Floating/Elevated Card
    header: '#0B0F17',           // Header Obsidian Black
    footer: '#090D16',           // Footer Obsidian Dark
    drawer: '#FFFFFF',           // Slide-out Drawer
    modal: '#FFFFFF',            // Dialog Modal Surface
    input: '#FFFFFF',            // Input Field Background
  },
  text: {
    primary: '#0F172A',         // High contrast title text
    secondary: '#475569',       // Main body text
    muted: '#94A3B8',           // Subtitles & helper text
    inverse: '#FFFFFF',         // Light text on dark surface
    brand: '#B48A1D',           // Gold accent text
  },
  border: {
    default: '#E2E8F0',         // Standard card border
    light: '#F1F5F9',           // Inner divider line
    dark: '#334155',            // Dark mode border
    focus: '#D4AF37',           // Form focus border
    goldAccent: 'rgba(212, 175, 55, 0.3)',
  },
  status: {
    success: '#16A34A',         // Verified / In Stock
    successBg: '#F0FDF4',
    warning: '#F59E0B',         // Limited Stock / Warning
    warningBg: '#FFFBEB',
    error: '#DC2626',           // Out of Stock / Discount
    errorBg: '#FEF2F2',
    info: '#3B82F6',            // Information / Shipping
    infoBg: '#EFF6FF',
  },
  overlay: {
    backdrop: 'rgba(15, 23, 42, 0.6)',
    lightBackdrop: 'rgba(255, 255, 255, 0.4)',
    darkBackdrop: 'rgba(0, 0, 0, 0.75)',
  },
  divider: '#E2E8F0',
};
