import { createTheme } from '../utils/createTheme';
import { buttonSemantic } from '../semantic/buttonSemantic';
import { cardSemantic } from '../semantic/cardSemantic';
import { inputSemantic } from '../semantic/inputSemantic';
import { modalSemantic } from '../semantic/modalSemantic';
import { navigationSemantic } from '../semantic/navigationSemantic';
import { badgeSemantic } from '../semantic/badgeSemantic';

export const defaultTheme = createTheme({
  id: 'default',
  name: 'Default Marketplace',
  version: '1.0.0',
  mode: 'light',
  description: 'Professional marketplace theme with clean white backdrop, obsidian framing, and warm gold brand color',
  author: 'DwellMart Architecture Team',
  colors: {
    brand: {
      primary: '#D4AF37',
      primaryHover: '#C49F27',
      primaryActive: '#A4821A',
      secondary: '#0B0F17',
      secondaryHover: '#161D2B',
      accent: '#F59E0B',
    },
    surface: {
      background: '#F8FAFC',
      card: '#FFFFFF',
      cardElevated: '#FFFFFF',
      header: '#0B0F17',
      footer: '#090D16',
      drawer: '#FFFFFF',
      modal: '#FFFFFF',
      input: '#FFFFFF',
    },
    text: {
      primary: '#0F172A',
      secondary: '#475569',
      muted: '#94A3B8',
      inverse: '#FFFFFF',
      brand: '#B48A1D',
    },
    border: {
      default: '#E2E8F0',
      light: '#F1F5F9',
      dark: '#334155',
      focus: '#D4AF37',
      goldAccent: 'rgba(212, 175, 55, 0.3)',
    },
    status: {
      success:   '#10B981',
      successBg: '#ECFDF5',
      warning:   '#F59E0B',
      warningBg: '#FFFBEB',
      error:     '#EF4444',
      errorBg:   '#FEF2F2',
      info:      '#3B82F6',
      infoBg:    '#EFF6FF',
    },
  },
  semantic: {
    button: buttonSemantic,
    card: cardSemantic,
    input: inputSemantic,
    modal: modalSemantic,
    navigation: navigationSemantic,
    badge: badgeSemantic,
  },
});
