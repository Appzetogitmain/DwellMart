# 🏗️ DwellMart Enterprise Theme Engine & Design Token System

Welcome to the **DwellMart Enterprise Theme Engine**. This system acts as the single source of truth for all visual tokens, design values, semantic component styles, and dynamic themes.

---

## 📐 Architecture Layers

```
Raw Tokens (src/theme/tokens/)
       ↓
Semantic Mappings (src/theme/semantic/)
       ↓
Theme Objects with Metadata (src/theme/themes/)
       ↓
CSS Variables Injection (:root) (src/theme/utils/cssVarGenerator.js)
       ↓
Tailwind Config & Components (var(--color-brand-primary))
```

---

## 📁 Directory Structure

```text
src/theme/
├── tokens/               # Raw design tokens (numeric & unit values)
│   ├── colorTokens.js
│   ├── typographyTokens.js
│   ├── spacingTokens.js
│   ├── radiusTokens.js
│   ├── shadowTokens.js
│   ├── animationTokens.js
│   ├── breakpointTokens.js
│   ├── zIndexTokens.js
│   ├── opacityTokens.js
│   └── layoutTokens.js
│
├── semantic/             # UI purpose mappings (button, card, input, etc.)
│   ├── buttonSemantic.js
│   ├── cardSemantic.js
│   ├── inputSemantic.js
│   ├── modalSemantic.js
│   ├── navigationSemantic.js
│   └── badgeSemantic.js
│
├── themes/               # Configured theme objects with versioning metadata
│   ├── defaultTheme.js   # Classic Light Marketplace + Obsidian framing + Gold brand
│   ├── luxuryTheme.js    # Luxury Gold & Dark Charcoal edition
│   ├── darkTheme.js      # Full Obsidian Dark Mode
│   └── festivalTheme.js  # Seasonal campaign theme wrapper
│
├── provider/             # React Context Provider & Hooks
│   ├── ThemeProvider.jsx
│   └── useTheme.js
│
├── utils/                # Theme engine utilities
│   ├── createTheme.js
│   ├── mergeTheme.js
│   ├── cssVarGenerator.js
│   └── validateTheme.js
│
├── README.md             # System documentation
└── index.js              # Central barrel exporter
```

---

## 📜 Architectural Rules for Developers

1. **Never hardcode hex colors** inside components or inline styles. Always use semantic CSS variables (`var(--color-brand-primary)`) or Tailwind semantic utilities (`bg-brand-primary`, `text-text-primary`).
2. **Never hardcode spacing or padding values**. Use standardized spatial scale tokens (`var(--spacing-section-spacing)`, `gap-5`, `p-4`).
3. **Components are presentation-only**. Components consume CSS custom properties populated automatically by `<ThemeProvider>`.
4. **CSS variables are the Source of Truth**. Switching themes updates `:root` variables in real time without triggering component re-renders or page reloads.

---

## 💡 Developer Usage Examples

### Using Tailwind Utility Classes
```jsx
<div className="bg-surface-card border border-border-default rounded-card shadow-card p-4">
  <h3 className="text-text-primary font-bold">Product Title</h3>
  <button className="bg-brand-primary hover:bg-brand-primaryHover text-black font-bold h-11 px-6 rounded-button shadow-button">
    Buy Now
  </button>
</div>
```

### Accessing Theme in React Components
```jsx
import { useTheme } from '../theme';

const ThemeSwitcher = () => {
  const { setTheme, activeThemeId } = useTheme();

  return (
    <button onClick={() => setTheme(activeThemeId === 'dark' ? 'default' : 'dark')}>
      Toggle Theme
    </button>
  );
};
```

### Developer Console Shortcut
In browser dev tools console:
```javascript
window.__setTheme('luxury'); // Switch to Luxury Gold
window.__setTheme('dark');   // Switch to Obsidian Dark
window.__setTheme('default'); // Switch to Default Marketplace
```
