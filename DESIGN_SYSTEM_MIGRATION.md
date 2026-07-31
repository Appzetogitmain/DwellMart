# DwellMart Design System — Token Migration Cheat Sheet

> **Rule:** Replace **design token utilities** (colors, borders). Keep **layout utilities** (flex, grid, gap, padding, w-full).

---

## 1. Surface Colors (Backgrounds)

| Old Tailwind Class | New Semantic Alias | CSS Variable |
|---|---|---|
| `bg-white` | `bg-surface` | `--color-surface-background` |
| `bg-gray-50` | `bg-surface-muted` | `--color-surface-card` |
| `bg-gray-100` | `bg-surface-muted` | `--color-surface-card` |
| `bg-gray-200` | `bg-surface-elevated` | `--color-surface-card-elevated` |
| `bg-gray-900` | `bg-surface-header` | `--color-surface-header` |
| `bg-gray-800` (footers) | `bg-surface-header` | `--color-surface-header` |
| `bg-white` (inputs) | `bg-surface-input` | `--color-surface-input` |

---

## 2. Text / Content Colors

| Old Tailwind Class | New Semantic Alias | Meaning |
|---|---|---|
| `text-gray-900` | `text-content` | Primary text |
| `text-gray-800` | `text-content` | Primary text |
| `text-gray-700` | `text-content-secondary` | Secondary text |
| `text-gray-600` | `text-content-secondary` | Secondary text |
| `text-gray-500` | `text-content-muted` | Muted / placeholder text |
| `text-gray-400` | `text-content-muted` | Muted / placeholder text |
| `text-gray-300` | `text-content-muted` | Very muted |
| `text-white` (on dark bg) | `text-content-inverse` | Inverted text |
| `text-[#brand]` / `text-primary` | `text-content-brand` | Brand-colored text |

---

## 3. Border Colors

| Old Tailwind Class | New Semantic Alias | Meaning |
|---|---|---|
| `border-gray-200` | `border-border` | Default border |
| `border-gray-100` | `border-border-light` | Subtle border |
| `border-gray-300` | `border-border` | Default border |
| `border-gray-700` | `border-border-strong` | Dark/strong border |
| `border-gray-800` | `border-border-strong` | Dark/strong border |
| `divide-gray-200` | `divide-border` | Table/list dividers |
| `divide-gray-100` | `divide-border-light` | Subtle dividers |
| `focus:border-[#brand]` | `focus:border-border-focus` | Focus ring border |

---

## 4. Status / Semantic Colors

| Old Tailwind Class | New Semantic Alias | Theme-Aware? |
|---|---|---|
| `bg-green-600` / `bg-green-500` | `bg-status-success` | ✅ Yes |
| `bg-green-50` / `bg-green-100` | `bg-status-successBg` | ✅ Yes |
| `text-green-600` / `text-green-700` | `text-status-success` | ✅ Yes |
| `bg-red-600` / `bg-red-500` | `bg-status-error` | ✅ Yes |
| `bg-red-50` / `bg-red-100` | `bg-status-errorBg` | ✅ Yes |
| `text-red-600` / `text-red-700` | `text-status-error` | ✅ Yes |
| `bg-yellow-500` / `bg-amber-500` | `bg-status-warning` | ✅ Yes |
| `bg-yellow-50` / `bg-amber-50` | `bg-status-warningBg` | ✅ Yes |
| `text-yellow-600` / `text-amber-600` | `text-status-warning` | ✅ Yes |
| `bg-blue-600` / `bg-blue-500` | `bg-status-info` | ✅ Yes |
| `bg-blue-50` / `bg-blue-100` | `bg-status-infoBg` | ✅ Yes |
| `text-blue-600` / `text-blue-700` | `text-status-info` | ✅ Yes |

> [!IMPORTANT]
> `bg-emerald-600` (active states, CTAs) → **`bg-brand-primary`** (changes with theme)
> This is the most impactful single change. The active category/button color should always be `brand-primary`, not a hardcoded hue.

---

## 5. Brand / Primary Colors

| Old Pattern | New Pattern | Notes |
|---|---|---|
| `bg-emerald-600` (active state) | `bg-brand-primary` | ✅ Theme-aware |
| `text-emerald-700` (active label) | `text-brand-primary` | ✅ Theme-aware |
| `ring-emerald-500` | `ring-brand-primary` | ✅ Theme-aware |
| `border-emerald-400` | `border-brand-primary` | ✅ Theme-aware |
| `focus:ring-[#ffc101]` | `focus:ring-brand-primary` | ✅ Theme-aware |
| `text-[#ffc101]` | `text-content-brand` | ✅ Theme-aware |
| Hardcoded hex colors | CSS variable alias | Always |

---

## 6. Component Replacements

| Old Pattern | New DS Component | Import |
|---|---|---|
| Raw `<button>` | `<Button>` | `import { Button } from 'shared/components/ui'` |
| Raw `<input>` | `<Input>` | `import { Input } from 'shared/components/ui'` |
| `<div class="bg-white rounded shadow">` | `<Card>` | `import { Card } from 'shared/components/ui'` |
| Raw `<select>` | `<Select>` | `import { Select } from 'shared/components/ui'` |
| `<textarea>` | `<TextArea>` | `import { TextArea } from 'shared/components/ui'` |
| Custom modal `<div>` | `<Modal>` | `import { Modal } from 'shared/components/ui'` |
| Custom empty state `<div>` | `<EmptyState>` | `import { EmptyState } from 'shared/components/ui'` |
| Manual loading shimmer | `<SkeletonLoader>` | `import { SkeletonLoader } from 'shared/components/ui'` |
| Manual spinner | `<Spinner>` | `import { Spinner } from 'shared/components/ui'` |
| Custom badge `<span>` | `<Badge>` | `import { Badge } from 'shared/components/ui'` |
| Manual toast | `<Toast>` | `import { useToast } from 'shared/components/ui'` |

---

## 7. Button Variant Migration (Admin → DS API)

| Old Admin Variant | New DS Syntax | Notes |
|---|---|---|
| `variant="primary"` | `variant="primary"` | Unchanged |
| `variant="secondary"` | `variant="secondary"` | Unchanged |
| `variant="danger"` | `variant="danger"` | Unchanged |
| `variant="ghost"` | `variant="ghost"` | Unchanged |
| `variant="success"` | `variant="success"` | ✅ Now in DS |
| `variant="ghostBlue"` | `variant="ghost" tone="primary"` | Semantic |
| `variant="ghostRed"` | `variant="ghost" tone="danger"` | Semantic |
| `variant="icon"` | `variant="icon"` | ✅ Now in DS |
| `variant="iconBlue"` | `variant="icon" tone="primary"` | Semantic |
| `variant="iconRed"` | `variant="icon" tone="danger"` | Semantic |

---

## 8. Badge Variant Migration (Legacy → DS)

| Old Legacy Variant | DS Badge Variant | Meaning |
|---|---|---|
| `pending` | `warning` | Order pending review |
| `processing` | `info` | Being processed |
| `shipped` | `info` | In transit |
| `delivered` | `success` | Successfully delivered |
| `cancelled` | `error` | Cancelled |
| `returned` | `warning` | Return initiated |
| `approved` | `success` | Approved |
| `rejected` | `error` | Rejected |
| `completed` | `success` | Fully resolved |
| `return-pending` | `warning` | Return pending review |
| `return-approved` | `success` | Return approved |
| `return-rejected` | `error` | Return rejected |
| `flash` | `info` | Flash sale |
| `discount` | `error` | Discount badge |

---

## 9. What NOT to Replace

> [!WARNING]
> Do **not** replace layout and spacing utilities — these are not design tokens.

```
KEEP (layout):          flex, grid, gap-*, p-*, m-*, w-*, h-*, min-h-*
KEEP (typography):      text-xs, text-sm, text-base, font-bold, font-semibold
KEEP (positioning):     absolute, relative, fixed, top-*, left-*, z-*
KEEP (display):         block, inline-flex, hidden, overflow-hidden
KEEP (responsive):      sm:, md:, lg:, xl: prefixes

REPLACE (colors):       bg-white, text-gray-*, border-gray-*, bg-green-*, bg-red-*
REPLACE (hardcoded):    text-[#ffc101], bg-[#D4AF37], border-[#E2E8F0]
```

---

## 10. Naming Convention (Single Standard)

The DwellMart Design System uses this pattern throughout:

```
bg-{surface}           → background layers
text-{content}         → text colors
border-{border}        → border colors
bg-status-{severity}   → semantic status backgrounds
text-status-{severity} → semantic status text
```

**Never use:** `bg-surface-default`, `text-primary`, `border-default` (inconsistent with the above).

---

## 11. ESLint Guardrail

The following classes now trigger lint warnings in `eslint.config.js`:

```
bg-white, bg-gray-*, text-gray-*, border-gray-*, divide-gray-*
bg-green-*, bg-red-*, bg-blue-*, bg-yellow-*
text-green-*, text-red-*
```

Fix the warning using the tables above. Set to `error` after Phase G.
