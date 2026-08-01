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
          DEFAULT: '#7C3AED',
          50: '#F5F3FF',
          100: '#EDE9FE',
          200: '#DDD6FE',
          300: '#C4B5FD',
          400: '#A78BFA',
          500: '#7C3AED',
          600: '#6D28D9',
          700: '#5B21B6',
          800: '#4C1D95',
          900: '#3B1A7A',
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
        // Short, ergonomic names that bind Tailwind utilities to CSS variables.
        // All resolve through ThemeProvider → theme switches automatically.
        //
        // Token Migration Rule:
        //   bg-white          → bg-surface
        //   text-gray-700     → text-content-secondary
        //   text-gray-500     → text-content-muted
        //   border-gray-200   → border-border
        //   bg-gray-50        → bg-surface-muted
        //   bg-green-*        → bg-status-success / bg-status-successBg
        //   bg-red-*          → bg-status-error  / bg-status-errorBg
        //   text-green-*      → text-status-success
        //   text-red-*        → text-status-error

        // Surface: replaces bg-white, bg-gray-50, bg-gray-100
        'surface':          'var(--color-surface-background)',
        'surface-muted':    'var(--color-surface-card)',
        'surface-elevated': 'var(--color-surface-card-elevated)',
        'surface-header':   'var(--color-surface-header)',
        'surface-input':    'var(--color-surface-input)',

        // Content: replaces text-gray-*, text-black, text-white (on dark bg)
        'content': {
          DEFAULT:   'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted:     'var(--color-text-muted)',
          inverse:   'var(--color-text-inverse)',
          brand:     'var(--color-text-brand)',
        },

        // Border: replaces border-gray-*, divide-gray-*
        'border': {
          DEFAULT: 'var(--color-border-default)',
          light:   'var(--color-border-light)',
          strong:  'var(--color-border-dark)',
          focus:   'var(--color-border-focus)',
        },

        // Status: replaces bg-green-*, bg-red-*, bg-yellow-*, bg-blue-*
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
        'modal': 'var(--radius-modal)',
        'badge': 'var(--radius-badge)',
      },
    },
  },
  plugins: [],
};

