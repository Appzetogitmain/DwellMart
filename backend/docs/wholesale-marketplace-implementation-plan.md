# Wholesale Marketplace & Bulk Pricing System — Implementation Plan

**Status:** Planning document (blueprint) — no code changes included.
**Scope:** Extend the existing DwellMart MERN multi-vendor marketplace with wholesale/B2B selling, per-product bulk pricing tiers, and MOQ enforcement, without breaking the current retail flow.
**Principle:** Extend existing modules (Product, Vendor, Order, Cart, Checkout, Analytics, Bulk Upload, Notifications, Sub Admin). No parallel B2B application, no duplicate models, no duplicate routes namespaces beyond what's needed for wholesale-specific sub-resources.
**Revision note:** This is v2 of the plan, revised after architecture review. Changes from v1: tiers simplified to `{minQty, price}` (no `maxQty`), no mandatory GST/KYC approval gate in V1, no server-side pricing-quote API in V1, wholesale-only products disable "Add to Cart" instead of erroring, a cross-cutting "Wholesale Badge" requirement, and phases consolidated from 7 to 5. See §11 for the full V1/V2 scope split.

---

## 0. Executive Summary

DwellMart today is a single-channel (retail) multi-vendor marketplace: every `Vendor` sells at a flat unit `price` per `Product`, checkout re-derives price server-side from `Product.price`/`variants.prices`, and cart lives entirely client-side (Zustand + localStorage) with no backend cart persistence. There is currently **no tiered pricing, no MOQ enforcement, no vendor "selling channel" concept, and no wholesale-specific vendor fields** anywhere in the codebase.

This plan adds all of that as an **additive, backward-compatible layer**, deliberately kept as lean as possible for V1:

- New optional fields on `Vendor` and `Product` (all defaulted so existing documents behave exactly as before — every existing vendor/product becomes implicitly "Retail Only").
- A **simple, self-service** wholesale onboarding: a vendor flips a toggle and can immediately sell wholesale — no GST verification or admin approval workflow blocking activation in V1 (that's a V2 add-on, §11).
- A single **Pricing Engine algorithm** (`resolvePriceForQuantity`) — deliberately trivial now that tiers are `{minQty, price}` only — implemented once server-side (authoritative at checkout) and mirrored as a tiny pure function client-side (product page/cart preview), rather than standing up a dedicated pricing API in V1.
- Extensions to checkout, order schema, vendor/admin analytics, bulk CSV import/export, notifications, sub-admin permissions, and a new cross-cutting **Wholesale Badge** convention applied everywhere a product/vendor/order is displayed.
- A platform-level feature flag (via the existing `Settings` model) so the entire feature can be disabled instantly without a deploy/rollback.

No existing collection is renamed, no existing field is repurposed in a breaking way, and no existing API contract changes shape (only additive optional fields).

---

## 1. Feature Overview

| Capability | Description |
|---|---|
| Vendor selling channels | Each vendor independently enables Retail, Wholesale, or both. This declares what's **allowed** for that vendor. Configurable at registration and later from vendor profile — a plain toggle, self-service, no approval step in V1. |
| Per-product channel flags | Each product independently enables Retail, Wholesale, or both, within what its vendor allows. This declares what's **actually sold** — exactly the Amazon Seller Central model (account-level capability vs. listing-level choice). |
| Bulk pricing tiers | Unlimited quantity-based price tiers per wholesale-enabled product, `{ minQty, price }` only — e.g. `10+ → ₹950`, `25+ → ₹900`, `50+ → ₹850`, `100+ → ₹800`. No range/`maxQty` bookkeeping. |
| MOQ | Optional minimum order quantity per wholesale product; enforced at cart and checkout. Wholesale-only products **disable "Add to Cart"** below MOQ rather than allowing the click and then erroring. |
| Automatic pricing engine | Sort tiers descending by `minQty`, return the first tier whose `minQty <= quantity`. Below the lowest tier: retail price for hybrid products, not purchasable for wholesale-only products. One algorithm, used everywhere. |
| Cart/Checkout integration | Live tier recalculation computed client-side from the tier array already on the product; checkout re-derives and validates server-side (authoritative, never trusts client price — unchanged from today's principle). |
| Order classification | Orders/order-items tagged `retail` / `wholesale` / `mixed` for vendor and admin reporting. |
| Vendor & Admin analytics | New wholesale-specific metrics, visible only when applicable channels are enabled. |
| Bulk upload/export | CSV/XLSX template extended with wholesale columns; round-trip fidelity preserved; DB always stores structured tier data, never a raw string. |
| Notifications | New notification types for bulk order lifecycle. |
| Sub-admin permissions | New granular permissions for wholesale vendor/product/analytics management. |
| Filters & search | New facets: Retail Only, Wholesale Available, Bulk Discount Available, MOQ Products. |
| **Wholesale Badge (cross-cutting)** | Visual "Wholesale Available" / "Wholesale Seller" / "Wholesale Order" indicators on product cards, vendor storefronts, search filters, order history, and admin lists — treated as a first-class requirement, not an afterthought. |

---

## 2. Business Rules (authoritative)

1. A vendor must have **at least one** selling channel enabled at all times (`retail` and/or `wholesale`).
2. A product must have **at least one** selling channel enabled, and a product can only enable `wholesale` if its owning vendor currently has `wholesale` enabled. **V1 has no additional KYC/verification gate** — enabling the vendor toggle is sufficient. (V2 may add an optional verification workflow on top of this without changing the underlying flag structure — see §11.)
3. Wholesale-only product (`retailEnabled=false, wholesaleEnabled=true`): purchase quantity must be `>= MOQ` (if MOQ set) or `>= lowest tier minQty` (if no explicit MOQ). "Add to Cart" is **disabled** (not clickable) while the selected quantity is below that floor, and the UI shows `Minimum Order: N Units` instead of a price error. No retail single-unit price exists for this product.
4. Hybrid product (`retailEnabled=true, wholesaleEnabled=true`): quantity `1..(lowestTierMinQty-1)` → retail price; quantity `>= lowestTierMinQty` → highest applicable tier price. MOQ, if set, is the floor for wholesale pricing eligibility, not a purchase floor (customer can still buy below MOQ at retail price).
5. Retail-only product: unchanged existing behavior, no tiers, no MOQ.
6. Highest applicable tier always wins: tiers sorted descending by `minQty`, first tier where `quantity >= tier.minQty` is applied. No overlap bookkeeping needed since there is no upper bound per tier.
7. Retail-only vendor: unchanged existing behavior, no vendor-side wholesale UI ever renders.
8. A vendor can change its selling channels at any time from its profile without creating a new account; disabling `wholesale` on the vendor cascades to hide (not delete) wholesale pricing on that vendor's products (see §9.3).

---

## 3. Architecture & Integration Principles

- **No new microservice, no new database.** Everything lives in the existing `backend/src` Express + Mongoose monolith and `frontend/src` React app.
- **No Cart backend today** — cart is Zustand + localStorage (`frontend/src/shared/store/useStore.js`). This plan does not introduce a backend Cart model. Tier pricing for the product page and cart is computed **client-side**, directly from the `wholesale.priceTiers` array the product API already returns — safe to do in V1 because the algorithm is now a 4-line sort-and-match with no server-only state involved. Checkout (`placeOrder`) remains the sole source of truth for what a customer is actually charged, exactly as today ("never trust client-sent item.price").
- **One algorithm, two implementations, by design (V1 trade-off):** `pricingEngine.service.js` (Node, authoritative, used by checkout) and a small mirrored utility `resolvePriceForQuantity.js` (frontend, `frontend/src/shared/utils/`) implement the *same* 5-line rule. Because the rule is now trivial (no `maxQty`, no eligibility edge cases beyond MOQ), the duplication risk is low and avoids paying for a round-trip API in V1. If the rule ever grows more complex (customer-specific pricing, RFQ, etc. — V2), that's the trigger to collapse both into a real `/pricing/quote` endpoint (§11, §14).
- **Everything additive**: every new schema field has a safe default that reproduces current behavior. No destructive migration is required to ship Phase 1; a backfill script is recommended for query/index efficiency but is not a correctness dependency.
- **Feature flag**: add `wholesaleMarketplaceEnabled: Boolean` (default `false`) to the existing `Settings.model.js` (already used for toggling payment methods) so the entire feature can be dark-launched and instantly disabled platform-wide.

---

## 4. Database / Schema Impact

### 4.1 `Vendor.model.js`

```js
sellingChannels: {
  retail:    { enabled: { type: Boolean, default: true } },
  wholesale: { enabled: { type: Boolean, default: false } }
},
wholesaleProfile: {
  gstNumber: String,
  businessName: String,
  businessAddress: { street: String, city: String, state: String, zipCode: String, country: String },
  wholesaleContactName: String,
  wholesaleContactPhone: String,
  bulkOrderSupportEmail: String
}
```

- **V1 simplification**: `wholesaleProfile` fields are collected and stored (per the original spec — GST Number, Business Name, Business Address, Wholesale Contact, Bulk Order Support Email) but are **purely informational** in V1. There is no `verificationStatus` state machine, no admin approval gate, and enabling `sellingChannels.wholesale.enabled=true` takes effect immediately, self-service. This alone removes the estimated 30–40% of V1 effort that a KYC/approval workflow would add (new admin review UI, approve/reject actions, notification wiring, blocked-pending-review UX states). A `verificationStatus` enum and approval workflow is the first thing to add in V2 (§11) — it slots into this same sub-document without a breaking change, since it's purely additive on top of the fields already being collected.
- **Backward compatible**: every existing vendor document, on read, gets `sellingChannels.retail.enabled = true`, `sellingChannels.wholesale.enabled = false` via Mongoose defaults — every current vendor is automatically "Retail Only" with zero migration required for correctness.
- **Recommended (non-blocking) backfill script** (Phase 1): explicitly persist the default fields onto all existing vendor docs so admin analytics `$match` aggregations (§8) can index/query them directly instead of relying on schema defaults at read time.
- The GST field is captured as a plain string in V1 (no file upload / document-verification flow). If V2 adds verification, it will additionally reuse `VendorDocument.model.js` with a new `documentType: 'gstCertificate'` for the actual certificate upload.

### 4.2 `Product.model.js`

```js
retailEnabled:    { type: Boolean, default: true },
wholesaleEnabled: { type: Boolean, default: false },
wholesale: {
  moqEnabled: { type: Boolean, default: false },
  moq: { type: Number, min: 1 },
  priceTiers: [{
    minQty: { type: Number, required: true, min: 1 },
    price:  { type: Number, required: true, min: 0 }
  }]
}
```

- **No `maxQty`.** Tiers are open-ended thresholds (`10+`, `25+`, `50+`, `100+`); the pricing engine sorts descending by `minQty` and returns the first tier the quantity satisfies. This removes the entire "ranges must not overlap" validation category and the corresponding UI complexity (vendors just add rows, no need to reason about upper bounds).
- **Existing-field decision (unchanged from v1 of this plan)**: `minimumOrderQuantity` already exists on `Product` but is currently **unused** anywhere in checkout logic, and is (mis)mapped from the bulk-upload CSV column `"Minimum Stock"` (a reorder-point concept, not a purchase-floor concept). This plan leaves it untouched and introduces a **new, explicitly-named** `wholesale.moq` field instead.
- Indexes to add: `{ vendorId: 1, wholesaleEnabled: 1 }`, `{ isActive: 1, wholesaleEnabled: 1 }` to support new filters/search facets (§7.4) without full collection scans.
- Variants: V1 scope applies `wholesale.priceTiers` uniformly at the product level regardless of variant selection. Per-variant tier overrides are a V2/future item (§14).

### 4.3 `Order.model.js`

```js
// orderItemSchema — add:
pricingType: { type: String, enum: ['retail', 'wholesale'], default: 'retail' },
appliedTier: { minQty: Number, price: Number },   // null for retail items
unitRetailPrice: Number,   // snapshot of what retail price would have been, for "You Save ₹X" display
savings: { type: Number, default: 0 },             // (unitRetailPrice - price) * quantity, 0 for retail items

// vendorItemGroupSchema — add:
orderType: { type: String, enum: ['retail', 'wholesale', 'mixed'], default: 'retail' },

// Order (top level) — add:
orderType: { type: String, enum: ['retail', 'wholesale', 'mixed'], default: 'retail' }
```

- All new fields default to values that reproduce today's behavior for historical orders — no backfill required.
- `orderType` is derived server-side at checkout: `retail` if every item is `pricingType='retail'`, `wholesale` if every item is `pricingType='wholesale'`, else `mixed`. Computed per vendor group and per overall order.

### 4.4 `Commission.model.js`

Add `orderType`/`pricingType` to each commission line so admin/vendor "Bulk Revenue" analytics (§8) can aggregate directly on the `Commission` collection (already the source for existing earnings analytics).

### 4.5 `Notification.model.js`

No schema change needed — `type` is currently `enum: ['order', 'payment', 'system', 'promotion']`. Extend the enum with `'bulk_order'` (additive, non-breaking). Specific event names are carried in the existing `data` `Map<string,string>`. (`'wholesale_approval'` is **not** added in V1, since there's no approval workflow to notify about — reserved for V2, §11.)

### 4.6 Platform feature flag

**Correction (post-Phase-1):** no `Settings.model.js` schema change is needed — `Settings` is already a generic `{key, value: Mixed}` store, and a `'features'` category already exists (`GET/PUT /api/admin/settings/features`, mirrored publicly at `GET /api/settings/features`, consumed via `shared/store/settingsStore.js`) holding boolean feature toggles (`wishlistEnabled`, `flashSaleEnabled`, etc.), edited today in `Admin/pages/settings/ContentFeaturesSettings.jsx`. `wholesaleMarketplaceEnabled` was added as one more boolean in that same object — the platform kill-switch (see §13, Rollback) — with zero new backend routes or schema.

### 4.7 Cart

No backend Cart model is introduced (see §3). The frontend `useCartStore` (Zustand) gains, per cart line, derived fields computed **locally** from the product's `wholesale.priceTiers` (already fetched with the product): `pricingType`, `unitPrice`, `appliedTier`, `nextTier`. `getTotal()` sums `unitPrice * quantity` per line using this local computation — no network round-trip per quantity change in V1.

---

## 5. Pricing Engine

Server: `backend/src/services/pricingEngine.service.js` (authoritative, used by checkout).
Client: `frontend/src/shared/utils/resolvePriceForQuantity.js` (mirrors the same 5-line rule for product-page/cart preview).

```js
// Given a product's { retailEnabled, wholesaleEnabled, wholesale: { moqEnabled, moq, priceTiers } },
// a base retail/variant price, and a quantity, returns:
// { pricingType, unitPrice, appliedTier, unitRetailPrice, savings, eligible, reason?, nextTier? }
resolvePriceForQuantity(product, basePrice, quantity)

// Validates a vendor-authored tier array against the business rules in §9.
validatePriceTiers(retailPrice, priceTiers)
```

**Algorithm**:
1. If `!product.wholesaleEnabled` → always `{ pricingType: 'retail', unitPrice: basePrice }`.
2. Sort `priceTiers` descending by `minQty`. Let `floor = moqEnabled ? moq : (priceTiers.length ? priceTiers[priceTiers.length-1].minQty : null)`.
3. If wholesale-only (`!retailEnabled`) and `quantity < floor` → `{ eligible: false, reason: 'BELOW_MOQ' }` (frontend disables Add-to-Cart on this; §7.2).
4. If hybrid and `quantity < priceTiers[priceTiers.length-1].minQty` (below the lowest tier) → `{ pricingType: 'retail', unitPrice: basePrice }`.
5. Otherwise, return the first tier (in descending order) where `quantity >= tier.minQty`. Attach `unitRetailPrice = basePrice`, `savings = (basePrice - tier.price) * quantity`, and `nextTier` = the tier immediately above the one applied (for the "Buy 3 more to unlock ₹900 pricing" nudge).

This is intentionally the entire algorithm — removing `maxQty` collapsed what would have been a range-matching problem into a single sorted-array linear scan, which is exactly why it's safe to duplicate client-side for V1 instead of building a quote API (§3).

Checkout (`placeOrder`) calls the **server** copy and persists its output; it never trusts a `pricingType`/`unitPrice` sent from the client, exactly like today's existing rule for `item.price`.

---

## 6. Backend API Impact

### 6.1 Vendor APIs (`backend/src/modules/vendor`)

| Endpoint | Change |
|---|---|
| `POST /api/vendor/auth/register` | Extend `registerSchema` (Joi) with optional `sellingChannels: { retail, wholesale }` and conditionally-required `wholesaleProfile.*` fields when `sellingChannels.wholesale === true` (Joi `.when()`). Defaults to Retail Only if omitted. **No approval step** — the vendor is wholesale-enabled the moment this call succeeds. |
| `GET/PUT /api/vendor/auth/profile` | `PUT` extended to accept `wholesaleProfile.*` updates. |
| `PUT /api/vendor/auth/selling-channels` **(new)** | Lets a vendor toggle `sellingChannels.retail/wholesale` post-registration, self-service, effective immediately. Enabling `wholesale` for the first time requires `wholesaleProfile` fields to be present (either already on file or submitted in the same call) but does **not** block on any review. Disabling `wholesale` is always allowed (see §9.3 cascade). |
| `POST/PUT /api/vendor/products` | Validator extended with `retailEnabled, wholesaleEnabled, wholesale.moqEnabled, wholesale.moq, wholesale.priceTiers[]`. Server-side rejects `wholesaleEnabled=true` unless the vendor's `sellingChannels.wholesale.enabled === true` (no verification-status check in V1). Runs `validatePriceTiers()` (§5) before persisting. |

### 6.2 Admin APIs (`backend/src/modules/admin`)

| Endpoint | Change |
|---|---|
| `GET /api/admin/vendors/:id` (existing) | Response includes `wholesaleProfile` (read-only display of GST/business info) so admins have visibility even without a formal approval workflow. **No approve/reject action in V1** (that's V2, §11). |
| `GET /api/admin/analytics/dashboard`, `.../revenue`, `.../top-products` etc. | Extend existing aggregation `$match`/`$group` stages with `orderType`/`pricingType` filters; add Wholesale Vendors / Retail Vendors / Hybrid Vendors / Wholesale Orders / Bulk Revenue / Wholesale Products metrics — all computed from fields added in §4, no new collections. |
| Sub-admin permission checks | New `checkPermission('manage_wholesale_vendors' | 'manage_wholesale_products' | 'view_wholesale_analytics')` middleware guarding the above (§10). |

### 6.3 Product APIs

| Endpoint | Change |
|---|---|
| `GET /api/products/:id`, `GET /api/products` (public listing) | Response includes `retailEnabled, wholesaleEnabled, wholesale.{moq, priceTiers}` and a precomputed `startingWholesalePrice`/`maxSavingsPercent` for card badges. This is the **only** payload the client needs — pricing for arbitrary quantities is computed locally via `resolvePriceForQuantity.js` (§5), no separate quote call. |
| `GET /api/products` search/listing | New query params: `sellingChannel=retail|wholesale`, `bulkDiscount=true`, `hasMoq=true`, feeding the new filter/search facets (§7.4). |

**Deferred to V2**: `POST /api/user/pricing/quote` server-side pricing endpoint. Not needed in V1 given the algorithm's simplicity (§3); revisit if/when pricing logic gains server-only inputs (customer-specific price lists, RFQ, negotiated rates — §11/§14).

### 6.4 Checkout / Order APIs (`backend/src/modules/user/controllers/order.controller.js`)

In `placeOrder`, inside the existing per-item loop (after `resolveVariantSelection()` resolves the base unit price, before the item is pushed into `vendorMap`):

1. Call `pricingEngine.resolvePriceForQuantity(product, resolvedBasePrice, quantity)`.
2. If `eligible === false` (below MOQ on a wholesale-only or MOQ-gated item) → reject the whole request with `422` and a field-level error identifying the offending line — this closes the gap where `minimumOrderQuantity`/MOQ is currently never enforced anywhere. (In practice this should rarely trigger for wholesale-only products since Add-to-Cart is disabled client-side below MOQ, §7.2 — but checkout still enforces it server-side as the authoritative check, e.g. against stale cart state or direct API calls.)
3. Persist `pricingType, appliedTier, unitRetailPrice, savings` onto the order item; use the resolved `unitPrice` (not `product.price`) for tax/subtotal math.
4. After the vendor grouping step, compute `vendorItemGroup.orderType` and top-level `order.orderType` (§4.3).
5. Commission calculation (`Commission.insertMany`) carries `orderType`/`pricingType` per line (§4.4).

This is a **localized extension of an existing function**, not a new checkout path — retail-only orders flow through exactly as before.

### 6.5 Bulk Upload / CSV Import-Export (`backend/src/services/bulkUpload.service.js`, `backend/src/controllers/bulkUpload.controller.js`)

- Extend `generateTemplate()` columns: `Retail Enabled, Wholesale Enabled, MOQ Enabled, MOQ, Bulk Pricing Tiers`.
- **Storage clarification**: `Product.wholesale.priceTiers` is **always** a structured Mongo array of `{ minQty, price }` sub-documents — never a raw string in the database. The `Bulk Pricing Tiers` CSV **cell** uses a delimited serialization (`10:950|25:900|50:850|100:800`) purely because a spreadsheet cell can't hold a nested array; this is parsed into the structured array on import and re-serialized into the same format on export. With `maxQty` removed, this format is now unambiguous (`minQty:price`, no range syntax to get wrong).
- `validateBulkUpload()`: parse and run the row through the same `validatePriceTiers()` used by the API (§6.1) — one validation implementation, two entry points.
- `executeJobInBatches()`: map parsed tiers into `Product.wholesale.priceTiers` on the same `bulkWrite()` calls already building the update/insert documents.
- **Export**: mirror the same columns so a round-trip export → edit → import preserves wholesale data exactly.
- **Known pre-existing gap this plan must account for**: variant bulk-import is currently a stub — parsed but never written to `variants.prices`/`stockMap`. Wholesale bulk-import in V1 is scoped to **non-variant products only**; wholesale + variants via CSV is deferred until the existing variant-import gap is fixed (§14, §15).

### 6.6 Notifications (`backend/src/services/notification.service.js`)

| Event | Recipient | Trigger point |
|---|---|---|
| Bulk Order Received | Vendor | `placeOrder`, when a vendor group's `orderType` is `wholesale`/`mixed`. |
| Bulk Order Cancelled | Vendor | Existing order-cancellation controller, when the cancelled order/group was wholesale. |

`MOQ Validation Failed` is a **synchronous checkout-time UI error** (422 response, §6.4), not a persisted notification. `Wholesale Product Approved` and `Wholesale Vendor Approved` are **not built in V1** since there's no approval workflow to notify about — both move to V2 alongside the verification workflow itself (§11).

---

## 7. Frontend Impact

### 7.1 Vendor App (`frontend/src/modules/Vendor/`)

| Area | Files | Change |
|---|---|---|
| Registration | `pages/Register.jsx` | Add "Selling Channels" step (Retail / Wholesale checkboxes); conditionally render GST/Business/Contact fields when Wholesale is checked. No "pending review" state — the vendor is wholesale-active immediately on submit. |
| Profile/Settings | `pages/settings/StoreSettings.jsx` (or a new `pages/settings/SellingChannels.jsx`) | Toggle UI for Retail/Wholesale post-registration, wired to `PUT /api/vendor/auth/selling-channels`, takes effect immediately. |
| Product form | `pages/products/AddProduct.jsx`, `ProductForm.jsx` | Retail/Wholesale toggles per product, and (when Wholesale is on) a repeatable "pricing tier" row editor: just `Quantity (minQty)` + `Price` per row, "Add Tier" for unlimited rows — no upper-bound field to fill in, matching the simplified schema. Plus MOQ fields. |
| Manage Products | `pages/products/ManageProducts.jsx` | Channel badges (Retail/Wholesale/Both) and channel filter — see Wholesale Badge convention, §7.5. |
| Dashboard/Analytics | `pages/Analytics.jsx` | New cards: Retail Orders, Wholesale Orders, Bulk Revenue, Most Used Pricing Tier, Top Bulk Products — rendered only when `sellingChannels.wholesale.enabled` is true. |

### 7.2 Customer App (`frontend/src/modules/UserApp/`, `frontend/src/shared/`)

| Area | Files | Change |
|---|---|---|
| Product Detail | `pages/ProductDetail.jsx` | Three render modes: Retail-only (unchanged), **Wholesale-only** — MOQ badge (`Minimum Order: 20 Units`) + tier table, and the **Add to Cart button is disabled** whenever the selected quantity is below the MOQ/lowest-tier floor (button shows a disabled state + the MOQ text inline, rather than allowing the click and surfacing an error after the fact), Hybrid — Retail Price + Bulk Pricing table + live "You Save ₹X" as the quantity stepper changes, computed via `resolvePriceForQuantity.js` (§5) against the tier array already loaded with the product — no extra network call per keystroke. |
| Cart | `shared/components/Cart/CartDrawer.jsx`, `SwipeableCartItem.jsx`, `MobileCartBar.jsx` | Per-line: "Bulk Pricing Applied" badge, current tier, savings, and "Buy N more to unlock ₹X pricing" nudge — computed the same way, locally, from the product's tier array already held in the cart line's product snapshot. |
| Cart store | `shared/store/useStore.js` (`useCartStore`) | Add derived per-line fields (`pricingType`, `unitPrice`, `appliedTier`, `nextTier`) computed via `resolvePriceForQuantity.js` whenever quantity changes; `getTotal()` sums from these. |
| Checkout | `pages/Checkout.jsx` | Display per-item pricing type and savings from the server response (authoritative); surface MOQ/tier validation errors returned by `placeOrder` inline against the offending line. |
| Search/Category/Listing | `pages/Search.jsx`, `pages/Category.jsx`, `pages/categories.jsx`, `pages/FlashSale.jsx`, `pages/DailyDeals.jsx`, `pages/Brand.jsx`, `shared/components/ProductCard.jsx` | New filter chips: Retail Only / Wholesale Available / Bulk Discount Available / MOQ Products, wired to the new query params (§6.3). |
| Order history/detail | `pages/Orders.jsx`, `pages/OrderDetail.jsx` | Retail/Wholesale badge per order and per line, plus savings summary. |

### 7.3 Admin App (`frontend/src/modules/Admin/`)

| Area | Files | Change |
|---|---|---|
| Vendor management | `pages/vendors/ManageVendors.jsx`, `VendorDetail.jsx` | Channel badges (Retail/Wholesale/Hybrid), read-only wholesale profile display on `VendorDetail.jsx` (no approve/reject action in V1), channel filter on the list. |
| Vendor analytics | `pages/vendors/VendorAnalytics.jsx` | Wholesale-specific metrics per vendor. |
| Product management | `pages/products/ManageProducts.jsx`, `TaxPricing.jsx` | Channel badges/filter; `TaxPricing.jsx` extended to show tier pricing alongside existing tax/price columns. |
| Dashboard/Analytics | `pages/Dashboard.jsx`, `pages/Analytics.jsx`, `pages/reports/*` | New cards: Wholesale Vendors, Retail Vendors, Hybrid Vendors, Wholesale Orders, Bulk Revenue, Wholesale Products. |
| Sub Admin | `pages/subadmin/CreateSubAdmin.jsx`, `EditSubAdmin.jsx` | Add the three new permission checkboxes (§10). |
| Settings | Admin's `Settings` management page | Add the `wholesaleMarketplaceEnabled` platform kill-switch toggle (§13). |

### 7.4 Theme/UI Compliance

All new components (tier editor rows, channel toggles, badges, nudge banners) **must** consume tokens via `useTheme()` (`frontend/src/theme/provider/useTheme.js`) or the existing CSS variable classes (`var(--color-*)`) — no hardcoded hex/px values. Recurring visual patterns (a "savings badge," a "tier table," the Wholesale Badge itself) should get a semantic mapping added under `frontend/src/theme/semantic/` (following the existing `badgeSemantic.js`/`cardSemantic.js` pattern) rather than one-off inline styling.

### 7.5 Wholesale Badge (cross-cutting requirement)

Treated as a first-class deliverable, not a per-page afterthought — one semantic badge component (`theme/semantic/` + a shared `<WholesaleBadge variant="..."/>` in `shared/components/`), reused everywhere:

| Surface | File(s) | Badge |
|---|---|---|
| Product card | `shared/components/ProductCard.jsx`, `UserApp/components/Mobile/ProductListItem.jsx`, `MobileProductCard.jsx` | "Wholesale Available" |
| Vendor storefront | `UserApp/pages/Seller.jsx` | "Wholesale Seller" |
| Vendor cards on home/listing | `UserApp/components/Mobile/VendorShowcaseCard.jsx`, `FeaturedVendorsSection.jsx` | "Wholesale Seller" |
| Search & category filters | `UserApp/pages/Search.jsx`, `Category.jsx`, `categories.jsx` | Filter chips: Retail / Wholesale / Both |
| Customer order history | `UserApp/pages/Orders.jsx`, `OrderDetail.jsx` | "Wholesale Order" |
| Vendor product & order lists | `Vendor/pages/products/ManageProducts.jsx`, vendor order list pages | Channel badge per row |
| Admin vendor & product lists | `Admin/pages/vendors/ManageVendors.jsx`, `Admin/pages/products/ManageProducts.jsx` | "Wholesale Vendor" / "Wholesale Product" |

One component, one set of theme tokens, consistent copy — avoids five slightly-different ad hoc badges being built independently across modules.

---

## 8. Vendor & Admin Dashboard Analytics — Detail

Both reuse the existing aggregation infrastructure (`admin/controllers/analytics.controller.js`, `vendor/controllers/analytics.controller.js`), adding `$match`/`$group` on the new `orderType`/`pricingType` fields — no new collections, no new aggregation framework.

- **Vendor** (visible only if `sellingChannels.wholesale.enabled`): Retail Orders vs Wholesale Orders (count split), Bulk Revenue (`sum` where `pricingType='wholesale'`), Most Used Pricing Tier (`$group` by `appliedTier.minQty` across order items, sorted by count), Top Bulk Products (`$group` by `productId` where `pricingType='wholesale'`, sorted by revenue).
- **Admin**: Wholesale Vendors / Retail Vendors / Hybrid Vendors (three `Vendor.countDocuments` variants on `sellingChannels`), Wholesale Orders (`Order.countDocuments({orderType: {$in:['wholesale','mixed']}})`), Bulk Revenue (aggregate on `Commission` or `Order`), Wholesale Products (`Product.countDocuments({wholesaleEnabled:true})`).

---

## 9. Validation Rules (consolidated)

Enforced at **both** the Joi validator layer and a Mongoose pre-save hook on `Product`/`Vendor` (defense in depth, since `bulkWrite()` in the bulk-import path bypasses per-document Joi validation):

| # | Rule | Enforced at |
|---|---|---|
| 1 | Vendor: at least one of `sellingChannels.retail/wholesale` enabled. | Vendor register/update Joi + pre-save hook. |
| 2 | Product: at least one of `retailEnabled/wholesaleEnabled` enabled. | Product create/update Joi + pre-save hook + bulk-import validator. |
| 3 | Product can only set `wholesaleEnabled=true` if owning vendor has `sellingChannels.wholesale.enabled === true`. (No verification-status check in V1.) | Product create/update controller (cross-collection check) + bulk-import validator. |
| 4 | Wholesale-enabled product requires ≥ 1 price tier. | `validatePriceTiers()`, shared by API + bulk import. |
| 5 | `MOQ <= stockQuantity`. | `validatePriceTiers()`/product validator + pre-save hook. |
| 6 | Tiers unique and sorted ascending by `minQty`. (No overlap check needed — there's no upper bound per tier.) | `validatePriceTiers()`. |
| 7 | Every tier `price < product.price` (retail price). | `validatePriceTiers()`. |
| 8 | Checkout: quantity `>= MOQ` (or lowest tier `minQty` if no MOQ) for wholesale-only products before order creation. | `placeOrder` (§6.4), returns 422 with line-level error. Frontend additionally disables Add-to-Cart pre-emptively (§7.2). |
| 9 | Disabling vendor-level `wholesale` does not delete product wholesale data; it hides wholesale purchasing on that vendor's products until re-enabled (see cascade, §9.1 below). | Product read-path / pricing engine (checks live vendor channel state, not just the product flag). |

### 9.1 Vendor channel-toggle cascade

When a vendor disables `wholesale`: existing wholesale product data (`wholesale.priceTiers`, `moq`) is **preserved untouched**; the pricing engine treats the product as retail-only at read time by checking the vendor's *current* channel state in addition to the product's own flag (rule #9). Re-enabling wholesale instantly restores wholesale purchasing with no data re-entry and no approval wait (consistent with the self-service V1 model) — satisfying "without creating another vendor account" and making the toggle safely reversible.

---

## 10. Permission Updates (Sub Admin)

**Correction (post-Phase-1):** a central registry does exist — `backend/src/constants/permissions.js` (dot-notation `PERMISSIONS.SETTINGS_EDIT` etc., plus `PERMISSION_DEPENDENCIES` and `MODULE_TO_PERMISSION_MAP`), checked via `checkPermission()`/`checkAnyPermission()`/`checkAllPermissions()` middleware (`backend/src/middlewares/permission.middleware.js`). Add three new permission strings there, following the existing dot-notation convention:

- `manage_wholesale_vendors` — edit vendor wholesale profile from Admin, toggle a vendor's wholesale access if needed (e.g. suspend abuse) — no approval workflow attached in V1, just visibility/management.
- `manage_wholesale_products` — moderate wholesale product listings and tier pricing from Admin.
- `view_wholesale_analytics` — read-only access to the new wholesale analytics cards/reports.

Wire these into the relevant admin route handlers and the checkbox list in `CreateSubAdmin.jsx` / `EditSubAdmin.jsx`.

---

## 11. V1 Scope vs. V2 Roadmap

Explicit split, so "wholesale marketplace" ships as a lean, high-value V1 rather than a KYC/negotiation platform:

**V1 (this plan builds):**
- Selling Channels (Retail / Wholesale) at vendor level — self-service, no approval.
- Product-level Retail/Wholesale toggles, independent per product.
- Bulk pricing tiers: `{ minQty, price }`, unlimited rows.
- MOQ, with disabled-Add-to-Cart UX for wholesale-only products.
- Shared pricing algorithm (server authoritative, client-mirrored for preview — no dedicated API).
- Cart & checkout price recalculation and MOQ/tier validation.
- Vendor & Admin analytics (retail/wholesale split, bulk revenue, top tiers/products).
- Search & product filters (Retail Only / Wholesale Available / Bulk Discount / MOQ).
- Bulk upload/export (non-variant products).
- Wholesale Badge everywhere (§7.5).

**V2 (deferred, not built in this pass):**
- GST/KYC verification and admin approval workflow for wholesale vendors (adds `wholesaleProfile.verificationStatus`, admin approve/reject UI, `Wholesale Vendor/Product Approved` notifications — all designed in v1 of this plan, intentionally cut here; the schema is forward-compatible, see §4.1).
- Server-side `POST /pricing/quote` API (only needed once pricing logic grows server-only inputs).
- Customer-specific/negotiated B2B price lists (beyond quantity tiers).
- RFQ (Request for Quote) workflow for custom bulk orders.
- Net-terms/credit-based payment for verified wholesale buyers.
- Full "business accounts" (multi-seat B2B buyer accounts, PO numbers, tax-exempt invoicing).

---

## 12. Implementation Phases

Five phases, each independently shippable behind `wholesaleMarketplaceEnabled` (§13), each ending with the existing retail flow fully regression-tested.

**Phase 1 — Vendor Selling Channels**
Schema: `Vendor.sellingChannels`, `Vendor.wholesaleProfile` (informational, no verification state), `Settings.wholesaleMarketplaceEnabled`. Backend: registration/profile/selling-channels APIs. Frontend: registration step, profile toggle UI. Backfill script for existing vendors (optional but recommended).

**Phase 2 — Wholesale Products, Bulk Pricing, MOQ**
Schema: `Product.retailEnabled/wholesaleEnabled/wholesale.{moqEnabled, moq, priceTiers}`, new indexes. Backend: product create/update validator + cross-collection channel check + `validatePriceTiers()`. Frontend: product form tier editor (`minQty` + `price` rows), Manage Products channel badges/filter.

**Phase 3 — Pricing Engine, Product Page, Cart, Checkout**
`pricingEngine.service.js` (server, unit-tested) + `resolvePriceForQuantity.js` (client mirror). Product detail page's three render modes, including the disabled-Add-to-Cart/MOQ UX for wholesale-only products. Cart store integration (local tier computation, nudges). Checkout MOQ/tier enforcement in `placeOrder`, order/order-item schema extensions.

**Phase 4 — Orders, Analytics, Notifications**
`orderType`/`pricingType` propagation into `Commission`, order-history badges (customer + vendor), vendor and admin dashboard wholesale analytics cards, `Bulk Order Received/Cancelled` notifications, sub-admin permissions (§10).

**Phase 5 — Bulk Upload/Export, Search & Filters, Wholesale Badge rollout, Testing**
CSV template + import/export wholesale columns (non-variant scope, §6.5), customer-facing filter/search facets (§7.2), the cross-cutting Wholesale Badge component rolled out to every surface in §7.5, full functional test matrix (§12→13 below), rollback rehearsal.

*Dependency note:* Phase 1 and 2 must land before 3–5. Phase 4 can start once Phase 3's order-schema work lands. Phase 5's CSV work can start as soon as Phase 2's `validatePriceTiers()` exists, in parallel with Phases 3–4.

---

## 13. Testing & Verification Plan

### 13.1 Build Verification
- No compilation/type errors across backend (Mongoose schema loads cleanly, no duplicate index warnings) and frontend (Vite/React build).
- No schema conflicts: existing documents (sampled from a staging DB snapshot) still pass Mongoose validation on read/re-save under the extended schema.
- Existing retail-only flow (registration → product create → cart → checkout → order → vendor payout) is **byte-for-byte unchanged** when `wholesaleMarketplaceEnabled=false` and/or for any vendor/product with wholesale disabled.

### 13.2 Functional Test Matrix

| Scenario | Key assertions |
|---|---|
| Retail-only vendor | Cannot see wholesale fields anywhere; registration/profile unaffected. |
| Wholesale-only vendor | Submits GST/business info at registration, active immediately (no pending state); products cannot enable retail. |
| Hybrid vendor | Can toggle either channel independently, effective immediately; both dashboards' metrics render. |
| Retail-only product | No tier UI shown; unaffected checkout path. |
| Wholesale-only product | Add to Cart is disabled while quantity < MOQ/lowest tier, shows `Minimum Order: N Units`; becomes enabled at/above the floor; product page shows MOQ + tier table, no "Retail Price" line. |
| Hybrid product | Qty below lowest tier → retail price; qty at/above `minQty` → correct tier price; boundary quantities (`minQty`, `minQty-1`) correct. |
| Bulk pricing calculation | Highest applicable `minQty` always wins; unlimited-tier product (10+ rows) computes correctly; single-tier product works; savings math correct; client-computed preview matches server-computed checkout result exactly (drift check for the duplicated algorithm, §3). |
| MOQ enforcement | Add-to-Cart disabled client-side below floor; checkout still hard-rejects below-MOQ with 422 and correct line identification as a defense-in-depth check (e.g. stale cart, direct API call); exactly-at-MOQ succeeds. |
| Cart recalculation | Quantity change updates tier badge/savings/next-tier nudge instantly (no network wait); nudge disappears once next tier is reached. |
| Checkout validation | MOQ, tier, stock, coupon, and shipping validations all still compose correctly for a mixed cart (retail item A + wholesale item B, different vendors). |
| Order creation | `orderType` correctly computed as retail/wholesale/mixed at both vendor-group and order level; historical (pre-feature) orders still read/render correctly. |
| Analytics | Vendor and admin new metrics match manually-computed totals against seeded test orders. |
| CSV import/export | Round-trip a wholesale product through export → re-import without data loss; tier-validation errors surface per-row; non-variant scope enforced. |
| Notifications | `Bulk Order Received`/`Cancelled` fire exactly once per triggering event, to the correct recipient. |
| Vendor channel toggle cascade | Disabling wholesale hides wholesale purchasing without deleting tier data; re-enabling restores it instantly; a customer mid-checkout when a vendor disables wholesale gets a clear, correct re-validation error rather than a stale price. |
| Wholesale Badge | Badge renders consistently (same component, same copy) across product card, storefront, search filters, order history, and admin lists; hidden entirely when the feature flag is off. |
| Feature flag off | With `wholesaleMarketplaceEnabled=false`, no wholesale UI renders anywhere and all wholesale API endpoints return a clear disabled-state response (not a 500). |

---

## 14. Rollback Considerations

- **Primary rollback lever**: `Settings.wholesaleMarketplaceEnabled` flag — flips the entire feature off platform-wide instantly, no deploy needed.
- **Schema safety**: every new field is additive with a backward-compatible default; no existing field is renamed, retyped, or removed, and no existing index is dropped. A code rollback (git revert) requires no corresponding down-migration.
- **Partial rollback**: because phases are independently flaggable, it's possible to roll back just the customer-facing cart/checkout pricing UI while leaving vendor-side product configuration live, if a bug is isolated to one layer.
- **Data risk**: low. The only write-path changes to *existing* collections are additive sub-documents; no existing write path (`Order.create`, `Product.save`, etc.) has its existing fields' semantics altered, only extended.
- **Client/server pricing-algorithm drift** (new risk introduced by the V1 no-quote-API decision, §3): because the same tier-resolution rule is implemented twice, a future change to one copy without the other could cause the cart preview to show a different price than checkout charges. Mitigate by keeping the algorithm in a single well-tested pure function per side, covered by the drift-check test in §13.2, and revisit centralizing into a real API (V2, §11) if the rule ever grows beyond what's safe to trust twice.

---

## 15. Appendix — Pre-existing Gaps Identified During Research (context, not introduced by this feature)

1. `Product.minimumOrderQuantity` exists but is never read by checkout today, and the bulk-import CSV maps a semantically different column (`"Minimum Stock"`, a reorder threshold) onto it — this plan avoids the field entirely and introduces `wholesale.moq` instead (§4.2).
2. Bulk-import CSV template already parses `SKU`, `Cost Price`, `Subcategory`, and dimension columns that have **no corresponding field in `Product.model.js`**, so they're silently dropped on write today — unrelated to wholesale, flagged for whoever owns bulk-import.
3. Bulk-import variant handling is parsed but never actually persisted to `variants.prices`/`variants.stockMap` — a pre-existing stub that constrains this plan's CSV wholesale scope to non-variant products in V1 (§6.5).
4. Sub-admin `permissions` has no central registry/enum today (just a validated string array) — the three new wholesale permissions slot in using the same ad hoc pattern.
5. Cart has no backend persistence today (Zustand + localStorage only) — this plan deliberately does not introduce a backend Cart model, and (per the V1 simplification in §3) does not introduce a pricing API either; both the cart and checkout use logic that reads directly off data already being fetched (`placeOrder` remains the sole authoritative pricing source it already is today).
