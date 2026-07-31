# 📜 DwellMart Design System Changelog

All notable changes, component releases, and architectural refactors to the DwellMart UI Library will be documented in this file.

---

## [2.5.0] - 2026-07-30
### Added (Phase 2E Utility Components)
- **`<FormControl>`**: Shared layout wrapper handling label, description, helper text, error messages, required indicators, and disabled states.
- **`<Checkbox>`**: Accessible checkbox form control supporting `indeterminate` state ("Select All"), checked states, and `FormControl` integration.
- **`<Radio>`**: Accessible radio button control with `FormControl` integration.
- **`<Switch>`**: Motion toggle switch with smooth Framer Motion spring sliding.
- **`<Avatar>` & `<Avatar.Group>`**: Avatar component supporting initials fallback, image, sizes (`xs`-`xl`), status badges (`online`|`offline`|`away`|`busy`), verified badge, and `<Avatar.Group max={3}>` stacked avatars with `+N` count.
- **`<Chip>`**: Interactive and static tag primitive supporting semantic status variants (`gold`, `primary`, `success`, `warning`, `error`, `info`, `filter`) and dismiss callbacks (`onRemove`).
- **`<Rating>`**: Interactive and read-only star rating component supporting fractional half star fills and hover previews.
- **`<Tooltip>`**: Accessible overlay tooltip rendered via React Portal (`createPortal`) to prevent container overflow clipping. Supports placements (`top`, `bottom`, `left`, `right`) and triggers (`hover`|`click`|`focus`).
- **`<QuantitySelector>`**: E-commerce quantity control supporting increment/decrement, step sizes, min/max bounds, manual numeric input, loading states, and out-of-stock states.

---

## [2.4.0] - 2026-07-30
### Added (Phase 2D Navigation Components)
- **`<Dropdown>`**: Menu popover with click-outside listener, keyboard arrow navigation, position placement, and compound subcomponents (`Dropdown.Header`, `Dropdown.Item`, `Dropdown.Divider`).
- **`<Accordion>`**: Collapsible panel system with `single` and `multiple` expansion types, Framer Motion spring height animations, and compound items (`Accordion.Item`, `Accordion.Header`, `Accordion.Body`).
- **`<Tabs>`**: Tabbed navigation with `default`, `line`, and `pills` variants, badge count indicators, keyboard arrow navigation, and compound panels (`Tabs.List`, `Tabs.Tab`, `Tabs.Panel`).
- **`<Pagination>`**: Accessible data table page selector with smart page number generation (`1 ... 4 5 6 ... 10`), previous/next navigation, and optional page size dropdown.

---

## [2.3.0] - 2026-07-30
### Added (Phase 2C Feedback Components & Domain Migration)
- **`<Spinner>`**: Accessible loading indicator with `role="status"` and size/variant options.
- **`<SkeletonLoader>`**: Continuous shimmer placeholders with `Card`, `Text`, `Table`, and `Avatar` presets.
- **`<EmptyState>`**: Graphic placeholder cards with 7 semantic presets (`no-data`, `no-results`, `cart`, `orders`, etc.).
- **`<Alert>`**: Persistent warning and notification banners with `role="alert"`.
- **`<ToastProvider>` & `useToast()`**: Stacking toast notification provider with auto-dismiss and hover pause.
- **`ProductCard` Refactor**: Migrated `ProductCard.jsx` to consume `<Card>`, `<Button>`, and `<Badge>` primitives with `PRODUCT_CARD_VARIANTS` configuration map (`default`, `premium`, `minimal`, `compact`).

---

## [2.2.0] - 2026-07-30
### Added (Phase 2B Layout & Dialog Systems)
- **`<Breadcrumb>`**: Accessible breadcrumbs with `maxItems` path truncation.
- **`<PageHeader>`**: Compound page headers with title, subtitle, actions, and extra slots.
- **`<Modal>`**: React Portal dialogs with focus lock, focus restoration, body scroll lock, and ESC listener.
- **`<Drawer>`**: Slide-out panels with React Portal and semantic size presets (`cart`: 420px, `filter`: 380px).

---

## [2.1.0] - 2026-07-30
### Added (Phase 2A Foundation Primitives)
- **`<Button>`**: Polymorphic button primitive with sizes (`xs`-`xl`), variants (`primary`, `secondary`, `outline`, `ghost`, `danger`), loading states, and icon slots.
- **`<Input>`**: Accessible form control with `leftIcon`, `rightIcon`, and password toggle.
- **`<Select>`**: Accessible custom select control with placeholder support.
- **`<TextArea>`**: Auto-growing text area control.
- **`<Badge>`**: Status badge primitive with `gold`, `verified`, `hot`, `new`, `outline` variants.
- **`<Card>`**: Compound card container primitive (`Card.Header`, `Card.Body`, `Card.Footer`, `Card.Actions`).
