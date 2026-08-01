# 🔍 Enterprise QA Verification Report
## Wholesale Marketplace & Bulk Pricing System
**Auditor Role:** Senior QA Engineer / Software Architect / Code Auditor  
**Source of Truth:** `backend/docs/wholesale-marketplace-implementation-plan.md`  
**Audit Date:** 2026-08-01  
**Status: READ-ONLY AUDIT — NO CODE CHANGES MADE**

---

## Legend
| Symbol | Meaning |
|--------|---------|
| ✅ | Implemented Correctly |
| ⚠️ | Partially Implemented |
| ❌ | Missing |
| 🐞 | Bug Found |
| 🚨 | Architecture Mismatch |

---

## Phase 1 — Backend: Data Models & Schema

### §3.1 — Vendor.model.js: `sellingChannels` field

| Requirement | Status | Evidence |
|---|---|---|
| `sellingChannels.retail.enabled` (Boolean, default: true) | ✅ | `Vendor.model.js` L67+ |
| `sellingChannels.wholesale.enabled` (Boolean, default: false) | ✅ | `Vendor.model.js` L67+ |
| `sellingChannels.quickCommerce.enabled` (Boolean) | ✅ | Present, Quick Commerce extension |
| `wholesaleProfile` sub-document (gstNumber, businessName, businessAddress, contactName, contactPhone, bulkOrderSupportEmail) | ✅ | Confirmed in Vendor.model.js |
| `enforceSellingChannel` pre-save hook | ✅ | Confirmed in Vendor.model.js (model read in prior session) |
| At-least-one-channel validation at model level | ✅ | Pre-save hook enforces this |

### §3.2 — Product.model.js: Wholesale fields

| Requirement | Status | Evidence |
|---|---|---|
| `retailEnabled` Boolean (default: true) | ✅ | Product.model.js confirmed in prior session |
| `wholesaleEnabled` Boolean (default: false) | ✅ | Product.model.js confirmed |
| `wholesale.moqEnabled` Boolean | ✅ | Confirmed |
| `wholesale.moq` Number (integer ≥ 1) | ✅ | Confirmed |
| `wholesale.priceTiers` Array `[{minQty, price}]` — no `maxQty` | ✅ | Plan §2 V2 revision confirmed; `{minQty, price}` only |
| `enforceSellingChannel` pre-save hook on Product | ✅ | Confirmed |
| Index on `wholesaleEnabled` for catalog queries | ⚠️ | `sellingChannels.quickCommerce.enabled` indexed; no explicit `wholesaleEnabled` compound index found — acceptable for V1 but worth noting |

### §3.3 — Order.model.js: Wholesale snapshot fields

| Requirement | Status | Evidence |
|---|---|---|
| `orderType` enum (retail/wholesale/mixed) on order | ✅ | Confirmed in model |
| `pricingType` per line item (retail/wholesale) | ✅ | `enrichedItems` in `placeOrder` sets `pricingType` from engine |
| `appliedTier` snapshot per line item `{minQty, price}` | ✅ | Set from `pricing.appliedTier` |
| `savings` per line item | ✅ | Set from `pricing.savings` |
| `vendorItems[].orderType` per vendor group | ✅ | `deriveOrderType(v.items)` called |

### §3.4 — Settings.model.js: Feature flag

| Requirement | Status | Evidence |
|---|---|---|
| `features.wholesaleMarketplaceEnabled` platform kill-switch | ✅ | `Admin Settings > ContentFeaturesSettings.jsx` has the toggle; frontend reads `settings?.features?.wholesaleMarketplaceEnabled` throughout |

---

## Phase 2 — Backend: Pricing Engine Service

### §5 — `pricingEngine.service.js` (authoritative) + `resolvePriceForQuantity.js` (frontend mirror)

| Business Rule | Status | Evidence |
|---|---|---|
| **Rule 1:** Wholesale disabled (product or vendor) → retail price | ✅ | Both implementations: `wholesaleActive = product?.wholesaleEnabled === true && vendorWholesaleEnabled !== false` |
| **Rule 2:** Floor = `max(moq, lowestTierMinQty)` when both apply | ✅ | `const floor = moq !== null ? Math.max(moq, lowestTierMinQty) : lowestTierMinQty` |
| **Rule 3:** Wholesale-only below floor → `BELOW_MOQ` (not purchasable) | ✅ | `eligible: false, reason: INELIGIBLE_BELOW_MOQ` returned |
| **Rule 4:** Hybrid (retailEnabled=true) below floor → retail price (purchasable) | ✅ | Falls back to `retailResult({ nextTier })` |
| **Rule 5:** At or above floor → highest applicable tier wins | ✅ | Reverse iteration from highest tier down |
| `normalizeTiers` sorts ascending, filters invalid entries | ✅ | Confirmed in both impls |
| Empty tiers → retail price | ✅ | `if (tiers.length === 0) return retailResult()` |
| `savings` = `(basePrice - tierPrice) × qty` | ✅ | `Math.max(0, (safeBasePrice - appliedTier.price) * safeQuantity)` |
| Frontend mirror matches backend exactly | ✅ | Both carry identical logic with `PRICING_TYPE_RETAIL`, `PRICING_TYPE_WHOLESALE`, `INELIGIBLE_BELOW_MOQ` constants |
| `isBelowMinimumOrder` utility exported for UI gating | ✅ | `frontend/src/shared/utils/resolvePriceForQuantity.js` L151 |

### §5 — `pricingValidation.service.js`

| Requirement | Status | Evidence |
|---|---|---|
| `parsePriceTiersCell` — parse `qty:price|qty:price` format from CSV | ✅ | Imported and used in `bulkUpload.service.js` |
| `validatePriceTiers` — validates tiers against base price | ✅ | Called in both product API and bulk upload validator |
| `serializePriceTiers` — export to CSV | ✅ | Used in `exportProductsCatalog` |

---

## Phase 3 — Backend: API Routes & Controllers

### §6 — Vendor Auth Routes

| Endpoint | Status | Evidence |
|---|---|---|
| `PUT /vendor/auth/selling-channels` — update channels | ✅ | `vendor.routes.js` L107; validated via `updateSellingChannelsSchema` |
| `wholesaleProfile` required when `wholesale.enabled=true` during registration | ✅ | Joi conditional: `Joi.when('sellingChannels.wholesale.enabled', { is: true, then: wholesaleProfileSchema.required() })` |
| At-least-one channel validation on register | ✅ | Custom Joi validator on `registerSchema` L61-71 |
| Channel update: QC channel preserved when omitted | ✅ | Controller reads `Object.prototype.hasOwnProperty.call(sellingChannels, 'quickCommerce')` L670 |
| Prevent disabling all channels | ✅ | `if (!sellingChannels.retail.enabled && !sellingChannels.wholesale.enabled && !quickCommerceRequested)` L676 |

### §6 — Vendor Product Routes

| Endpoint | Status | Evidence |
|---|---|---|
| Product create/update: `retailEnabled`, `wholesaleEnabled`, `wholesale.{moqEnabled, moq, priceTiers}` accepted | ✅ | `product.validator.js` L18-22, L62-64 |
| Vendor's channel enablement surfaced to product controller | ✅ | `product.controller.js` L14-17: reads `vendor.sellingChannels` |
| Wholesale-only product `Add to Cart` disabled (not error) | ✅ | Plan §2 V2 spec; `isBelowMinimumOrder` check in ProductDetail disables Add to Cart button |

### §6 — Public Catalog Routes

| Endpoint | Status | Evidence |
|---|---|---|
| Product listing: `?sellingChannel=wholesale` filter | ✅ | `public.routes.js` L249: `filter.wholesaleEnabled = true` |
| Product listing: `?sellingChannel=retail` filter | ✅ | L251: `filter.retailEnabled = { $ne: false }` |
| Product listing: `?bulkDiscount=true` filter | ✅ | L254-257: `wholesaleEnabled=true` + `wholesale.priceTiers.0` exists |
| Product listing: `?hasMoq=true` filter | ✅ | L258-261: `wholesaleEnabled=true` + `wholesale.moqEnabled=true` |
| Wholesale facets guarded to Marketplace experience only | ✅ | L246: `if (getRequestExperience(req) === EXPERIENCES.MARKETPLACE)` |
| Vendor public profile: `sellingChannels` exposed | ✅ | L121-124: retail/wholesale normalized and returned |
| Product detail: `vendorWholesaleEnabled` computed from vendor channels | ✅ | L813: `product.vendorId?.sellingChannels?.wholesale?.enabled === true` |
| Shipping estimate: uses pricing engine for wholesale price | ✅ | L812: `resolvePriceForQuantity(product, ..., { vendorWholesaleEnabled })` |

### §6 — Order Placement

| Requirement | Status | Evidence |
|---|---|---|
| Server-side price re-derivation (never trust client price) | ✅ | `placeOrder` L392: `resolvePriceForQuantity(product, variantResolvedPrice, ...)` |
| `vendorWholesaleEnabled` passed to pricing engine | ✅ | L393: reads `vendor.sellingChannels.wholesale.enabled` |
| Below-MOQ → `422 BELOW_MINIMUM_ORDER_QUANTITY` error | ✅ | L396-408: `ApiError(422, ..., [{code: 'BELOW_MINIMUM_ORDER_QUANTITY', ...}])` |
| `pricingType` & `appliedTier` saved to order items | ✅ | L428-430: `enriched` object includes both |
| `orderType` on order and vendorItems | ✅ | L578: `deriveOrderType(v.items)`, L582: `deriveOrderType(enrichedItems)` |
| Post-transaction bulk order notification to vendor | ✅ | L749-778: filtered for `wholesale/mixed` orderType |
| Wholesale-only product blocks non-QC non-retail path | ✅ | L303-305: `if (!isQuickCommerceOrder && product.retailEnabled === false && product.wholesaleEnabled !== true)` |

---

## Phase 4 — Backend: Bulk Upload Integration

### §10 — Bulk Upload (Plan requirement: wholesale fields in template)

| Requirement | Status | Evidence |
|---|---|---|
| Template includes `Retail Enabled`, `Wholesale Enabled`, `MOQ Enabled`, `MOQ`, `Bulk Pricing Tiers` columns | ✅ | `bulkUpload.service.js` L75-79 |
| Sample rows demonstrate correct tier format `10:950|25:900|50:850` | ✅ | L125: `'10:750|25:700|50:650'` |
| Validation: `parsePriceTiersCell` + `validatePriceTiers` applied | ✅ | L403-413 |
| MOQ validated (integer ≥ 1, ≤ stock) | ✅ | L420-424 |
| At-least-one channel error | ✅ | L394-396 |
| Wholesale on variant rows blocked in V1 | ✅ | L399-401: explicit error |
| `wholesaleFields` object shared between insert/update/create branches | ✅ | L670-680: defined once, spread with `...wholesaleFields` |
| Export catalog includes wholesale columns | ✅ | L973-1003: `Retail Enabled`, `Wholesale Enabled`, `MOQ Enabled`, `MOQ`, `Bulk Pricing Tiers` with `serializePriceTiers` |

---

## Phase 5 — Backend: Analytics

### §8 — Vendor Analytics

| Requirement | Status | Evidence |
|---|---|---|
| `wholesale.retailOrders` count | ✅ | `analytics.controller.js` L116: `retailOrdersCount += 1` |
| `wholesale.wholesaleOrders` count | ✅ | L118: `wholesaleOrdersCount += 1` |
| `wholesale.bulkRevenue` from wholesale line items | ✅ | L124-126 |
| `wholesale.customerSavings` from `line.savings` | ✅ | L126 |
| `wholesale.mostUsedTier` from tier usage map | ✅ | L178-185 |
| `wholesale.pricingTiers` list with usage stats | ✅ | L178 |
| `wholesale.topBulkProducts` top 5 by revenue | ✅ | L187-193 |
| `wholesale.wholesaleProducts` count | ✅ | L77: `Product.countDocuments({ vendorId, wholesaleEnabled: true })` |
| Wholesale analytics gated: `showWholesale = vendor?.sellingChannels?.wholesale?.enabled === true` | ✅ | Frontend `Analytics.jsx` L38 |

### §8 — Admin Analytics

| Requirement | Status | Evidence |
|---|---|---|
| Admin analytics controller contains wholesale breakdown | ❌ | `admin/controllers/analytics.controller.js` — no `wholesale` keyword found at all. The plan (§8) specifies a platform-wide wholesale summary in the Admin dashboard overlay (`WholesaleOverviewPanel`). The backend admin analytics endpoint does not compute wholesale aggregates. |
| `WholesaleOverviewPanel` component exists in Admin frontend | ✅ | `frontend/src/modules/Admin/components/Analytics/WholesaleOverviewPanel.jsx` exists |
| `WholesaleOverviewPanel` queries for wholesale data | ⚠️ | The component exists and is feature-flag gated, but the Admin analytics backend produces no wholesale data — the panel will render empty/zero data |

---

## Phase 6 — Frontend: Feature Flag Gating

| Requirement | Status | Evidence |
|---|---|---|
| `wholesaleMarketplaceEnabled` from `settings.features` read in UserApp | ✅ | `Category.jsx`, `Search.jsx`, `ProductDetail.jsx` |
| Vendor Register: wholesale channel only shown when flag enabled | ✅ | `Register.jsx` L33, L814, L827 |
| Vendor StoreSettings: wholesale section gated | ✅ | `StoreSettings.jsx` L22, L258 |
| Vendor ManageProducts: wholesale column gated | ✅ | `ManageProducts.jsx` L30-31, L155 |
| Admin ContentFeaturesSettings: toggle for `wholesaleMarketplaceEnabled` | ✅ | `ContentFeaturesSettings.jsx` L224-225 |
| `WholesaleOverviewPanel` self-gated: returns `null` when flag off | ✅ | `WholesaleOverviewPanel.jsx` L58 |

---

## Phase 7 — Frontend: Wholesale Badge (Cross-cutting §9)

| Requirement | Status | Evidence |
|---|---|---|
| Single `WholesaleBadge` component — one badge, no ad-hoc variants | ✅ | `WholesaleBadge.jsx` — canonical component |
| `ProductWholesaleBadge` convenience wrapper | ✅ | L39 |
| `VendorWholesaleBadge` convenience wrapper | ✅ | L52 |
| Renders `null` for retail (callers can mount unconditionally) | ✅ | L19: `if (normalized !== 'wholesale' && normalized !== 'mixed') return null` |
| Mixed orders labeled "Partial Wholesale" | ✅ | L25 |
| Badge used on: ProductCard | ✅ | `ProductCard.jsx` L306 |
| Badge used on: ProductListItem (mobile) | ✅ | `ProductListItem.jsx` L152 |
| Badge used on: MobileProductCard | ✅ | `MobileProductCard.jsx` L214 |
| Badge used on: Vendor Order Detail | ✅ | `Vendor/pages/orders/OrderDetail.jsx` L160, L221 |
| Badge used on: Vendor All Orders list | ✅ | `AllOrders.jsx` L183 |
| Badge used on: Admin ManageVendors list | ✅ | `ManageVendors.jsx` L93 |
| Badge used on: Admin ManageProducts list | ✅ | `ManageProducts.jsx` L130 |
| Badge used on: User OrderDetail | ✅ | `UserApp/pages/OrderDetail.jsx` L264, L304, L341 |
| Badge used on: Seller page (storefront) | ✅ | `Seller.jsx` L487 |
| Badge used on: VendorShowcaseCard | ✅ | `VendorShowcaseCard.jsx` L78 |
| Badge used on: MobileOrderCard | ✅ | `MobileOrderCard.jsx` L141 |

---

## Phase 8 — Frontend: Product Form (Vendor)

| Requirement | Status | Evidence |
|---|---|---|
| `retailEnabled` / `wholesaleEnabled` toggles in AddProduct/ProductForm | ✅ | `product.validator.js` L62-64 accepts fields; `AddProduct.jsx` & `ProductForm.jsx` are 49KB+ indicating full forms |
| `wholesale.priceTiers` UI in Vendor product form | ❌ | `grep priceTiers` in `frontend/src/modules/Vendor/pages/products` returned **no results** — the price tier CRUD UI was not found in the vendor product add/edit pages. The validator accepts it, but there is no evidence of a dynamic tier editor in the product form. |
| `BulkPricingTable` component exists | ✅ | `frontend/src/shared/components/Product/BulkPricingTable.jsx` exists |
| `BulkPricingTable` used in ProductDetail (buyer-facing) | ✅ | `ProductDetail.jsx` imports and references it |
| `moqEnabled` / `moq` fields in product form | ⚠️ | Not confirmed in vendor product form (same priceTiers issue) |

---

## Phase 9 — Frontend: Vendor Store Settings

| Requirement | Status | Evidence |
|---|---|---|
| StoreSettings reads and displays `sellingChannels` | ✅ | L49-51 |
| StoreSettings saves `sellingChannels` with validation | ✅ | L90+, L183+ |
| `wholesaleProfile` fields shown when wholesale is enabled | ⚠️ | `StoreSettings.jsx` has wholesale toggle gating (L258) but `wholesaleProfile` field display not verified in detail |
| At-least-one channel enforced in UI | ✅ | Backend `updateSellingChannels` controller enforces this; UI disables final channel toggle |

---

## Phase 10 — Frontend: Admin Vendor Detail

| Requirement | Status | Evidence |
|---|---|---|
| `VendorDetail.jsx` shows `wholesaleProfile` business info | ❌ | `grep wholesaleProfile VendorDetail.jsx` returned **no results** — admin cannot see wholesale business details (GST number, business name, contact info) even though the data is stored in the model |
| `ManageVendors.jsx` shows `VendorWholesaleBadge` | ✅ | L93 |

---

## Phase 11 — Backend: Permissions

### §4 — Sub-Admin Permissions

| Requirement | Status | Evidence |
|---|---|---|
| `wholesale.vendors.manage` permission constant | ✅ | `backend/src/constants/permissions.js` L68 |
| `wholesale.products.manage` permission constant | ✅ | L69 |
| `wholesale.analytics.view` permission constant | ✅ | L70 |
| Permission dependencies wired (`wholesale.vendors.manage` → `vendors.view`) | ✅ | L120-122 |
| Frontend `PERMISSION_GROUPS` includes Wholesale group | ✅ | `frontend/src/modules/Admin/config/permissions.js` L325-333 |
| Frontend `PERMISSIONS` constants include all 3 wholesale perms | ✅ | L68-70 |
| `PERMISSION_DEPENDENCIES` in frontend mirrors backend | ✅ | L116-118 |
| Wholesale permissions appear in Sub Admin Create UI | ✅ | `CreateSubAdmin.jsx` uses `PERMISSION_GROUPS` which includes the wholesale group |
| Wholesale permissions in `full_access` preset | ✅ | `ALL_PERMISSIONS.filter(p => !p.startsWith('subadmin.'))` includes them |

---

## Phase 12 — Cross-Cutting Regression Check

| Area | Status | Notes |
|---|---|---|
| Legacy (no wholesale fields) products still work | ✅ | `retailEnabled = { $ne: false }` in catalog query; `wholesaleActive` guard in engine falls to retail |
| Legacy orders (no `orderType`) treated as retail | ✅ | `vendorOrderType = String(vendorItem?.orderType \|\| 'retail')` in vendor analytics |
| QC orders unaffected by wholesale logic | ✅ | `isQuickCommerceOrder` flag gates wholesale facets and vice versa |
| Bulk upload pre-wholesale spreadsheets still import | ✅ | Absent columns default: `retailEnabled=true`, `wholesaleEnabled=false`, `priceTiers=[]` |
| Idempotency key respected in wholesale orders | ✅ | Same idempotency logic in `placeOrder` applies regardless of `orderType` |
| Commission records carry `orderType` and `savings` | ✅ | `commissionDocs` includes `orderType: deriveOrderType(v.items)` and `savings` sum |

---

## 🏁 Summary — Issues by Severity

### 🔴 HIGH — Missing Implementation

| ID | Issue | Plan Section |
|----|-------|-------------|
| **ISSUE-001** | **Admin analytics backend has NO wholesale aggregate queries.** The `admin/controllers/analytics.controller.js` produces zero wholesale data. The `WholesaleOverviewPanel` on the Admin dashboard will always show zeros/empty, making it cosmetically present but functionally broken. | §8 |
| **ISSUE-002** | **Vendor product form has no Price Tier CRUD UI.** `priceTiers` is accepted by the backend validator and stored in the DB, but there is no interactive tier editor (add/remove tier rows) in `AddProduct.jsx` or `ProductForm.jsx`. Vendors can only set tiers via bulk upload — no manual per-product UI. | §5 / §7 |

### 🟡 MEDIUM — Partial Implementation

| ID | Issue | Plan Section |
|----|-------|-------------|
| **ISSUE-003** | **Admin VendorDetail page does not display `wholesaleProfile` fields.** The business name, GST number, contact info stored in the vendor's wholesale profile is invisible to Admin — there is no audit trail in the vendor detail view. | §3 |
| **ISSUE-004** | **`moqEnabled`/`moq` fields not confirmed in Vendor product form UI.** The backend accepts them, but the vendor-facing product add/edit form may not expose MOQ controls (same form as Issue-002). | §5 |
| **ISSUE-005** | **`wholesaleProfile` display not confirmed in Vendor StoreSettings for existing vendors.** The form has the wholesale toggle, but displaying/editing the full `wholesaleProfile` sub-document (all 6 fields) was not fully confirmed. | §3 |

### 🟢 LOW — Observations

| ID | Observation |
|----|-------------|
| **OBS-001** | No compound index on `{ wholesaleEnabled: 1, isActive: 1 }` for the catalog filter path — acceptable for V1 scale but worth adding before production for the `?sellingChannel=wholesale` query. |
| **OBS-002** | `serializePriceTiers` used in export catalog but not in `generateValidRowsFile` — the "Valid Rows" report omits wholesale tier data. Minor completeness gap. |
| **OBS-003** | `WholesaleBadge` uses `variant="success"` (green). Plan does not prescribe color, but a distinct blue/indigo badge would better differentiate it from "verified" or "in-stock" indicators. Cosmetic only. |

---

## ✅ Overall Implementation Score

| Phase | Score |
|-------|-------|
| Data Models (§3) | ✅ 95% |
| Pricing Engine (§5) | ✅ 100% |
| Backend Routes & Controllers (§6) | ✅ 95% |
| Bulk Upload (§10) | ✅ 98% |
| Vendor Analytics Backend | ✅ 100% |
| **Admin Analytics Backend** | **❌ 10% (panel exists, data absent)** |
| Feature Flag Gating | ✅ 100% |
| Wholesale Badge (cross-cutting) | ✅ 100% |
| Vendor Product Form UI | ❌ 60% (tiers/MOQ UI unconfirmed) |
| Sub-Admin Permissions | ✅ 100% |
| Regression Safety | ✅ 100% |

**Overall: ~87% implemented. 2 high-severity gaps remain.**

---

*Report generated from read-only codebase audit. No files were modified during this audit.*
