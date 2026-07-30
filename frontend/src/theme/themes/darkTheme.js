import { createTheme } from '../utils/createTheme';
import { buttonSemantic } from '../semantic/buttonSemantic';
import { cardSemantic } from '../semantic/cardSemantic';
import { inputSemantic } from '../semantic/inputSemantic';
import { modalSemantic } from '../semantic/modalSemantic';
import { navigationSemantic } from '../semantic/navigationSemantic';
import { badgeSemantic } from '../semantic/badgeSemantic';

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
