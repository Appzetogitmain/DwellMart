import js from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

/**
 * DwellMart Frontend ESLint Configuration
 *
 * Phase A+ Design System Guardrails:
 * Prevents legacy patterns from re-entering the codebase after migration.
 *
 * Rules enforce the Token Migration Rule:
 *   bg-white          → bg-surface
 *   text-gray-*       → text-content-secondary / text-content-muted
 *   bg-gray-*         → bg-surface-muted / bg-surface-elevated
 *   border-gray-*     → border-border
 *   bg-green-*        → bg-status-success / bg-status-successBg
 *   bg-red-*          → bg-status-error / bg-status-errorBg
 *   bg-blue-*         → bg-status-info / bg-status-infoBg
 */

// ─── Forbidden className patterns ─────────────────────────────────────────
// Matches usage like: className="... bg-white ..." or className={`...bg-gray-500...`}
// NOTE: These are warnings during migration phase. Escalate to 'error' after Phase G.

const FORBIDDEN_TAILWIND_PATTERNS = [
  {
    pattern: /bg-white/,
    message: '[DS] Forbidden: bg-white. Use bg-surface (theme-aware). Token Migration: bg-white → bg-surface',
  },
  {
    pattern: /\bbg-gray-/,
    message: '[DS] Forbidden: bg-gray-*. Use bg-surface-muted or bg-surface-elevated (theme-aware).',
  },
  {
    pattern: /\btext-gray-/,
    message: '[DS] Forbidden: text-gray-*. Use text-content-secondary or text-content-muted (theme-aware).',
  },
  {
    pattern: /\bborder-gray-/,
    message: '[DS] Forbidden: border-gray-*. Use border-border or border-border-light (theme-aware).',
  },
  {
    pattern: /\bdivide-gray-/,
    message: '[DS] Forbidden: divide-gray-*. Use divide-border (theme-aware).',
  },
  {
    pattern: /\bbg-green-/,
    message: '[DS] Forbidden: bg-green-*. Use bg-status-success or bg-status-successBg (theme-aware).',
  },
  {
    pattern: /\bbg-red-/,
    message: '[DS] Forbidden: bg-red-*. Use bg-status-error or bg-status-errorBg (theme-aware).',
  },
  {
    pattern: /\bbg-blue-/,
    message: '[DS] Forbidden: bg-blue-*. Use bg-status-info or bg-status-infoBg (theme-aware).',
  },
  {
    pattern: /\bbg-yellow-/,
    message: '[DS] Forbidden: bg-yellow-*. Use bg-status-warning or bg-status-warningBg (theme-aware).',
  },
  {
    pattern: /\btext-green-/,
    message: '[DS] Forbidden: text-green-*. Use text-status-success (theme-aware).',
  },
  {
    pattern: /\btext-red-/,
    message: '[DS] Forbidden: text-red-*. Use text-status-error (theme-aware).',
  },
];

// Custom rule: detect forbidden Tailwind color classes in JSX className attributes
const noLegacyTailwindColors = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prevent legacy Tailwind color utilities that bypass the theme engine',
      category: 'Design System',
      recommended: true,
    },
    schema: [],
    messages: Object.fromEntries(
      FORBIDDEN_TAILWIND_PATTERNS.map((p, i) => [`forbidden_${i}`, p.message])
    ),
  },
  create(context) {
    const checkStringValue = (node, value) => {
      FORBIDDEN_TAILWIND_PATTERNS.forEach((p, i) => {
        if (p.pattern.test(value)) {
          context.report({
            node,
            messageId: `forbidden_${i}`,
          });
        }
      });
    };

    return {
      // className="..."
      JSXAttribute(node) {
        if (
          node.name &&
          node.name.name === 'className' &&
          node.value
        ) {
          if (node.value.type === 'Literal' && typeof node.value.value === 'string') {
            checkStringValue(node, node.value.value);
          }
          // className={`...`} template literals
          if (
            node.value.type === 'JSXExpressionContainer' &&
            node.value.expression.type === 'TemplateLiteral'
          ) {
            node.value.expression.quasis.forEach((quasi) => {
              checkStringValue(node, quasi.value.raw);
            });
          }
        }
      },
    };
  },
};

// Custom rule: prevent import from deprecated Admin Button
const noAdminButtonImport = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prevent importing from the deprecated Admin Button. Use shared Button instead.',
    },
    schema: [],
    messages: {
      forbidden:
        '[DS] Forbidden import: Admin/components/Button is deprecated. Use: import { Button } from shared/components/ui',
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const src = node.source.value;
        if (
          src.includes('Admin/components/Button') ||
          src.endsWith('/components/Button') &&
          context.getFilename().includes('/Admin/')
        ) {
          context.report({ node, messageId: 'forbidden' });
        }
      },
    };
  },
};

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '.vite/**',
      'public/**',
      '*.config.js',
      '*.config.ts',
      'vite.config.*',
      'postcss.config.*',
      'tailwind.config.*',
    ],
  },
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'design-system': {
        rules: {
          'no-legacy-tailwind-colors': noLegacyTailwindColors,
          'no-admin-button-import': noAdminButtonImport,
        },
      },
    },
    rules: {
      // ─── Standard React Rules ────────────────────────────────────────────
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/prop-types': 'off',
      'react/display-name': 'off',
      'react/react-in-jsx-scope': 'off',

      // ─── Design System Guardrails (warnings during migration, errors after Phase G) ──
      'design-system/no-legacy-tailwind-colors': 'warn',
      'design-system/no-admin-button-import': 'warn',

      // ─── General Code Quality ────────────────────────────────────────────
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        Promise: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        URL: 'readonly',
        FormData: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
      },
    },
  },
];
