import { createRequire } from 'module';

const require = createRequire(import.meta.url);


/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        'xs': '375px',
      },
      colors: {
        brand: {
          primary: 'var(--color-brand-primary)',
          primaryHover: 'var(--color-brand-primary-hover)',
          primaryActive: 'var(--color-brand-primary-active)',
          secondary: 'var(--color-brand-secondary)',
          secondaryHover: 'var(--color-brand-secondary-hover)',
          accent: 'var(--color-brand-accent)',
        },
        surface: {
          background: 'var(--color-surface-background)',
          card: 'var(--color-surface-card)',
          cardElevated: 'var(--color-surface-card-elevated)',
          header: 'var(--color-surface-header)',
          footer: 'var(--color-surface-footer)',
          drawer: 'var(--color-surface-drawer)',
          modal: 'var(--color-surface-modal)',
          input: 'var(--color-surface-input)',
        },
        textColor: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
          inverse: 'var(--color-text-inverse)',
          brand: 'var(--color-text-brand)',
        },
        borderToken: {
          default: 'var(--color-border-default)',
          light: 'var(--color-border-light)',
          dark: 'var(--color-border-dark)',
          focus: 'var(--color-border-focus)',
          goldAccent: 'var(--color-border-gold-accent)',
        },
        statusToken: {
          success: 'var(--color-status-success)',
          warning: 'var(--color-status-warning)',
          error: 'var(--color-status-error)',
          info: 'var(--color-status-info)',
        },
        primary: {
          DEFAULT: '#D4AF37',
          50: '#FDFBF7',
          100: '#FAF4E8',
          200: '#F4E7CE',
          300: '#EBD5A9',
          400: '#E1C280',
          500: '#D4AF37',
          600: '#C49F27',
          700: '#A4821A',
          800: '#836511',
          900: '#634A0A',
        },
        secondary: {
          DEFAULT: '#F97316',
          50: '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#F97316',
          600: '#EA580C',
          700: '#C2410C',
          800: '#9A3412',
          900: '#7C2D12',
        },
        accent: {
          DEFAULT: '#10B981',
          50: '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
          900: '#064E3B',
        },
        background: {
          DEFAULT: '#F8FAFC',
        },
        card: {
          DEFAULT: '#FFFFFF',
        },
        text: {
          dark: '#212121',
          muted: '#878787',
        },
        success: {
          DEFAULT: '#059669',
          50: '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
          900: '#064E3B',
        },
        discount: {
          DEFAULT: '#FF6161',
          50: '#FFE8E8',
          100: '#FFD1D1',
          200: '#FFA3A3',
          300: '#FF7575',
          400: '#FF4747',
          500: '#FF6161',
          600: '#CC4E4E',
          700: '#993B3B',
          800: '#662828',
          900: '#331515',
        },

        // ─── SEMANTIC ALIASES ───────────────────────────────────────────────
        'surface':          'var(--color-surface-background)',
        'surface-muted':    'var(--color-surface-card)',
        'surface-elevated': 'var(--color-surface-card-elevated)',
        'surface-header':   'var(--color-surface-header)',
        'surface-input':    'var(--color-surface-input)',

        'content': {
          DEFAULT:   'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted:     'var(--color-text-muted)',
          inverse:   'var(--color-text-inverse)',
          brand:     'var(--color-text-brand)',
        },

        'border': {
          DEFAULT: 'var(--color-border-default)',
          light:   'var(--color-border-light)',
          strong:  'var(--color-border-dark)',
          focus:   'var(--color-border-focus)',
        },

        'status': {
          success:   'var(--color-status-success)',
          successBg: 'var(--color-status-successBg)',
          warning:   'var(--color-status-warning)',
          warningBg: 'var(--color-status-warningBg)',
          error:     'var(--color-status-error)',
          errorBg:   'var(--color-status-errorBg)',
          info:      'var(--color-status-info)',
          infoBg:    'var(--color-status-infoBg)',
        },
      },
      boxShadow: {
        'card': 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        'dropdown': 'var(--shadow-dropdown)',
        'modal': 'var(--shadow-modal)',
        'button': 'var(--shadow-button)',
        'focus': 'var(--shadow-focus)',
        'input': 'var(--radius-input)',
        'badge': 'var(--radius-badge)',
      },
    },
  },
  plugins: [],
};
