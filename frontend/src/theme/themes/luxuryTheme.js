import { createTheme } from '../utils/createTheme';
import { buttonSemantic } from '../semantic/buttonSemantic';
import { cardSemantic } from '../semantic/cardSemantic';
import { inputSemantic } from '../semantic/inputSemantic';
import { modalSemantic } from '../semantic/modalSemantic';
import { navigationSemantic } from '../semantic/navigationSemantic';
import { badgeSemantic } from '../semantic/badgeSemantic';

/**
 * Luxury Theme
 */
export const luxuryTheme = createTheme({
  id: 'luxury',
  name: 'Luxury Gold',
  version: '1.0.0',
  mode: 'dark',
  description: 'Ultra premium gold and obsidian black theme edition',
  author: 'DwellMart Architecture Team',
  colors: {
    brand: {
      primary: '#D4AF37',
      primaryHover: '#E5C158',
      primaryActive: '#B39129',
      secondary: '#000000',
      secondaryHover: '#121212',
      accent: '#FFD700',
    },
    surface: {
      background: '#0B0F17',
      card: '#121723',
      cardElevated: '#1A2131',
      header: '#05070D',
      footer: '#030408',
      drawer: '#0F1420',
      modal: '#121723',
      input: '#1A2131',
    },
    text: {
      primary: '#F8FAFC',
      secondary: '#CBD5E1',
      muted: '#64748B',
      inverse: '#0F172A',
      brand: '#FACC15',
    },
    border: {
      default: 'rgba(212, 175, 55, 0.2)',
      light: 'rgba(255, 255, 255, 0.08)',
      dark: '#1E293B',
      focus: '#FFD700',
      goldAccent: 'rgba(212, 175, 55, 0.4)',
    },
    status: {
      success:   '#10B981',
      successBg: '#064E3B',
      warning:   '#F59E0B',
      warningBg: '#451A03',
      error:     '#EF4444',
      errorBg:   '#450A0A',
      info:      '#60A5FA',
      infoBg:    '#1E3A5F',
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

/**
 * Dark Theme
 */
export const darkTheme = createTheme({
  id: 'dark',
  name: 'Obsidian Dark',
  version: '1.0.0',
  mode: 'dark',
  description: 'Full dark mode theme',
  author: 'DwellMart Architecture Team',
  colors: {
    brand: {
      primary: '#EAB308',
      primaryHover: '#CA8A04',
      secondary: '#090D16',
      accent: '#F59E0B',
    },
    surface: {
      background: '#090D16',
      card: '#111827',
      cardElevated: '#1F2937',
      header: '#030712',
      footer: '#030712',
      drawer: '#111827',
      modal: '#111827',
      input: '#1F2937',
    },
    text: {
      primary: '#F9FAFB',
      secondary: '#D1D5DB',
      muted: '#9CA3AF',
      inverse: '#111827',
      brand: '#FBBF24',
    },
    border: {
      default: '#1F2937',
      light: '#374151',
      dark: '#4B5563',
      focus: '#EAB308',
      goldAccent: 'rgba(234, 179, 8, 0.3)',
    },
    status: {
      success:   '#34D399',
      successBg: '#064E3B',
      warning:   '#FBBF24',
      warningBg: '#451A03',
      error:     '#F87171',
      errorBg:   '#450A0A',
      info:      '#93C5FD',
      infoBg:    '#1E3A5F',
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

/**
 * Festival Theme
 */
export const festivalTheme = createTheme({
  id: 'festival',
  name: 'Festival Special',
  version: '1.0.0',
  mode: 'light',
  description: 'Festive campaign promotional theme',
  author: 'DwellMart Architecture Team',
  colors: {
    brand: {
      primary: '#E11D48',
      primaryHover: '#BE123C',
      secondary: '#881337',
      accent: '#F59E0B',
    },
    surface: {
      background: '#FFF1F2',
      card: '#FFFFFF',
      cardElevated: '#FFFFFF',
      header: '#4C0519',
      footer: '#2E020D',
      drawer: '#FFFFFF',
      modal: '#FFFFFF',
      input: '#FFFFFF',
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
});
