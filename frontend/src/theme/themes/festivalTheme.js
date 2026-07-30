import { createTheme } from '../utils/createTheme';
import { buttonSemantic } from '../semantic/buttonSemantic';
import { cardSemantic } from '../semantic/cardSemantic';
import { inputSemantic } from '../semantic/inputSemantic';
import { modalSemantic } from '../semantic/modalSemantic';
import { navigationSemantic } from '../semantic/navigationSemantic';
import { badgeSemantic } from '../semantic/badgeSemantic';

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
