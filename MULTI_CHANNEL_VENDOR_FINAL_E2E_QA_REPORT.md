# DwellMart Multi-Channel Vendor
# FINAL END-TO-END QA & PRODUCTION READINESS REPORT

**Audit date:** 2026-08-13
**Auditor role:** Independent Principal QA / Architecture / Security / Production-Readiness review
**Repository:** `c:\Users\RCom\Desktop\AppZeto\DWELL\DwellMart`
**Method:** Source-of-truth = actual code, actual executed tests, actual database state, actual HTTP responses.
Previous implementation/remediation reports (`MULTI_CHANNEL_VENDOR_MIGRATION_EXECUTION_REPORT.md`, `REMEDIATION_EXECUTION_REPORT.md`) were **not** trusted and were not used as evidence.

**Source code was not modified during this audit.** No defect was fixed. No destructive migration was executed. No records were created, updated, or deleted in the database.

---

## 0. Testing envelope and honesty statement

| Capability | Status | Note |
|---|---|---|
| Static code tracing (UI → store → API → route → middleware → controller → service → model) | **DONE** | All layers traced |
| Read-only database inspection (live Atlas `dwellmart_db`) | **DONE** | 74 vendors, 203 products, 353 orders |
| Migration ledger verification against the real DB | **DONE** | `schemamigrations` collection read directly |
| Backend unit / security / conformance suites | **EXECUTED** | Real output recorded in §19 |
| Frontend production build | **EXECUTED** | Real output recorded in §19 |
| Read-only runtime HTTP probes (app mounted in-process, no background workers) | **EXECUTED** | 30 authorization probes + 12 catalog probes |
| Backend **integration** suites (`npm run test:gate`) | **BLOCKED — isolated DB required** | The repo's own runner refuses to run against the remote cluster. Not overridden. |
| Mutating E2E (register 7 combinations, approve, create products, place orders, pause/disable) | **NOT PERFORMED — by operator decision** | Live Atlas cluster; would create real vendors/orders and send real emails. Operator selected read-only runtime probes. |
| Frontend unit / component / E2E tests | **DO NOT EXIST** | `frontend/package.json` has no `test` script and there is not a single `*.test.*` / `*.spec.*` file under `frontend/src` |

Anything below marked **CONFIRMED (runtime)** was reproduced against the running API. Anything marked **CONFIRMED (code+data)** is proven by reading the code together with real database contents. Anything marked **UNVERIFIED** is explicitly labelled as such and is *not* claimed as passing.

---

## 1. Executive Summary

The Multi-Channel Vendor Architecture is **architecturally sound and substantially implemented**. The core idea — one vendor account, one login, one subscription, one wallet, canonical `channels.{retail,wholesale,quickCommerce}.status` as the sole authorization source, URL-backed workspaces, per-channel admin approval — is genuinely present in the code, not merely claimed. The vendor-workspace authorization boundary is the strongest part of the system: **every one of 14 cross-workspace attack attempts was correctly rejected at runtime**, including query-parameter, header, and channel-specific route tampering.

However, the system is **NOT production ready**. The audit found one defect that breaks the primary vendor workflow on two of the three channels, and a cluster of public catalog endpoints that were never brought under the channel-authorization model at all.

**Headline findings:**

1. **CRITICAL — Wholesale and Quick Commerce vendors cannot create or edit products.** `productCapabilityGuard` documents itself as defaulting to observe-only, but its code defaults to **strict rejection**. Simulated against the exact payload the vendor UI emits, the Wholesale workspace is rejected on 8 fields and Quick Commerce on 8 fields, both returning HTTP 400. Retail is unaffected — which is why this has plausibly gone unnoticed. This alone is a production blocker.

2. **HIGH — Four public catalog endpoints have no channel authorization whatsoever.** Measured live: `/api/new-arrivals` returned 100 products of which **60 belong to vendors whose retail channel is not active**, plus 3 Quick-Commerce-only and 1 wholesale-only product. `/api/flash-sale` and `/api/popular` leak similarly. `/api/vendors/:id/products` served 3 products for a QC-only store on the retail marketplace, 2 of them QC-only. The guarded path (`/api/products`) leaked nothing — the shared `buildCatalogFilter` works; these endpoints simply bypass it.

3. **HIGH — A product can be listed but not openable.** A retail+QC product whose vendor has retail active and QC inactive appears in the marketplace listing but returns **404 on its detail page**, because detail-page channel resolution uses if/else priority (`quickCommerceEnabled` first) instead of the requested experience. Reproduced live on product `6a7572f30a09274de4000f23`.

4. **HIGH — The legacy order endpoint bypasses retail and wholesale channel authorization.** `POST /api/user/orders` verifies vendor account status and the QC channel, but never checks `channels.retail.status` or `channels.wholesale.status`. Pausing a retail channel does not block new retail orders through this route. It is still wired in the frontend order store.

5. **HIGH — Migration 0008's idempotency guard is structurally unable to detect an unmigrated vendor** once the Mongoose schema is deployed, and its `verify()` reports OK anyway. Four vendors in the live database (`channelsRevision: 0`, all three channels `disabled`, created hours *before* the migration ran) are proof.

**Verdict:** **NOT READY.** The blocking issues are concentrated and well-understood; none require architectural change. See §29 and §30.

---

## 2. Architecture Verification

Verified against the stated requirements:

| Requirement | Status | Evidence |
|---|---|---|
| One vendor account | **PASS** | Single `Vendor` document; channels are embedded sub-documents, not separate accounts |
| One login | **PASS** | `POST /api/vendor/auth/login` — one credential path, returns `channelSummary` |
| One subscription | **PASS** | `checkSubscription` middleware is account-level, not channel-level |
| One wallet | **PASS** | `/vendor/earnings` is explicitly account-wide, not workspace-scoped ([vendor.routes.js:189](DwellMart/backend/src/modules/vendor/routes/vendor.routes.js#L189)) |
| One bank profile | **PASS** | `bankDetails` on the vendor root; `/auth/bank-details` is not channel-scoped |
| Shared inventory in V1 | **PASS** | Single `stockQuantity` + `reservedQuantity` on `Product`. **No** `retailStock`/`wholesaleStock`/`qcStock` fields exist in the schema or the live data |
| Separate operational workspaces | **PASS** | Products, orders, customers, analytics, shipping, returns, reviews all channel-scoped server-side |
| No "hybrid" vendor type | **PASS (with 1 naming leftover)** | `VendorTypes` has exactly `quick_commerce`/`retail`/`wholesale`. A variable named `hybridVendors` survives in admin analytics as a *counter*, not a type — see F-19 |
| Channel-specific authorization | **PASS** | `requireReadableChannel` / `requireWritableChannel` / `requireSpecificChannel` — verified at runtime |
| URL-backed workspace | **PASS** | `?workspace=` is authoritative; `sessionStorage` is a per-tab hint only, and the server re-derives from the request |
| Per-channel admin approval | **PARTIAL** | Per-channel `PATCH /admin/vendors/:id/channels/:channel/status` exists and is correct. Initial account approval is all-or-nothing in the UI — see F-13 |
| `vendorType` is NOT the authorization source | **PASS** | 38 `vendorType` references audited; none is an authorization decision in canonical mode |
| `sellingChannels` is projection-only | **PASS** | `projectSellingChannels()` derives it from canonical `channels`; pre-save hook enforces it |

### Dependency map (as built)

```
UI  Vendor SPA (React 18 / Vite / Zustand)
    ├── vendorAuthStore  ── login → { vendor, activeWorkspaces[], readableWorkspaces[], channels{} }
    ├── useVendorWorkspace  ── reads ?workspace= from URL (authoritative)
    ├── VendorLayout  ── redirect guard: URL → sessionStorage hint → single-active → /vendor/workspaces
    ├── WorkspacePicker · VendorHeader (switcher) · VendorSidebar (capability-driven menu)
    ├── SellingChannels page  ── apply / withdraw
    └── shared/utils/api.js  ── injects  X-Vendor-Workspace  header from the URL
                                    │
API │  Express, mounted in src/app.js
    ├── authenticate → authorize('vendor') → enforceAccountStatus  [re-loads vendor EVERY request]
    ├── checkSubscription
    └── vendorChannel.js
          ├── resolveVendorWorkspace   ── query ?workspace | X-Vendor-Workspace | body.workspace
          ├── requireChannel({write})  ── isChannelWritable / isChannelReadable
          └── requireSpecificChannel   ── QC-only endpoints
                                    │
SVC │  vendorChannel.service.js  (channelAuthorityMode: legacy | shadow | channels — currently "channels")
    │  featureFlags.service.js · catalogQuery.service.js · CartValidationPipeline · OrderSplitterEngine
    │  pricingEngine · pricingValidation · quickCommerce.service · stock/InventoryReservationService
                                    │
DB  │  Vendor.channels.{retail,wholesale,quickCommerce}.{status,…}  + channelsRevision   [CANONICAL]
    │  Vendor.sellingChannels                                                            [PROJECTION]
    │  Vendor.vendorType                                                                 [LEGACY LABEL]
    │  Product.{retailEnabled,wholesaleEnabled,quickCommerceEnabled}                     [PUBLISHING]
    │  Order.{orderType,fulfillmentType}                                                 [INCONSISTENT — see F-06]
    └─ Migration 0008_vendor_channels (registered, applied 2026-08-13T12:16:47Z)
```

---

## 3. Phase 0–9 Results (Discovery, Data Model, Migration, Registration, Login/Workspace, Security, Admin, Applications, Products)

### Phase 1 — Codebase discovery: **COMPLETE**
Backend inventory: 58 models, 8 migrations, 12 middlewares, 7 module groups (vendor/admin/user/delivery/payment/integrations/notifications), 40+ services.
Frontend inventory: 4 modules (Vendor/Admin/UserApp/Delivery), workspace hook + picker + header switcher + layout guard + selling-channels page + business overview, 2 stores touching workspace.

### Phase 2 — Data model: **PASS**
`channelStateSchema` ([Vendor.model.js:12-23](DwellMart/backend/src/models/Vendor.model.js#L12-L23)) carries `status`, `requestedAt`, `activatedAt`, `pausedAt`, `rejectedAt`, `disabledAt`, `reviewedAt`, `reviewedBy` (ref Admin), `requestedBy` (`vendor|admin|migration`), `reason`. All five states enumerated. `channelsRevision` present with `min: 0`. Three compound indexes `{channels.X.status, status, isActive}` exist **and are live in the database** (verified via `db.vendors.indexes()`).

Model hooks confirmed **not** to derive canonical channels from `vendorType`: the only hook that reads `VendorCapabilities[this.vendorType]` is gated behind `VENDOR_CHANNEL_AUTHORITY_MODE === 'legacy'`, which is unset in `.env` (defaults to `channels`).

### Phase 3 — Migration: see §18. Logic verified, applied to the DB, **but the idempotency guard is defective (F-05)**.

### Phase 4 — Registration: see §4. Code-verified for all 7 combinations; live registration not executed (operator decision).

### Phase 5 — Login & workspace: see §5. **PASS** with one gap (F-16).

### Phase 6 — Workspace security: see §6. **PASS — 14/14 attacks blocked at runtime.**

### Phase 7 — Admin channel management: see §7. **PASS with 3 defects** (F-12, F-13, F-14).

### Phase 8 — Vendor channel applications: see §7. **PASS with 1 state-machine defect** (F-11).

### Phase 9 — Products: see §8. **CRITICAL blocker (F-01)** plus 2 further defects.

---

## 4. Registration Results (Phase 4)

Traced: `POST /api/vendor/auth/register` → [auth.controller.js:135-303](DwellMart/backend/src/modules/vendor/controllers/auth.controller.js#L135-L303).

`requestedChannelsFromSellingChannels()` maps the submitted selection to `requested`/`disabled` states, never to `active`. Verified by unit test #3 and by the live DB (all 12 `pending` vendors show `requested` on exactly the channel they applied for, `sellingChannels` all-false because the projection only marks `active` channels).

| Combination | Requested channels created | Wholesale profile validated | Feature flag validated | Verdict |
|---|---|---|---|---|
| Retail only | `retail: requested` | n/a | n/a | **PASS (code)** |
| Wholesale only | `wholesale: requested` | Yes — 5 mandatory fields | Yes | **PASS (code)** |
| Quick Commerce only | `quickCommerce: requested` | n/a | Yes | **PASS (code)**, but no QC operating profile is collected or required — **F-15** |
| Retail + Wholesale | both `requested` | Yes | Yes | **PASS (code)** |
| Retail + QC | both `requested` | n/a | Yes | **PASS (code)** |
| Wholesale + QC | both `requested` | Yes | Both | **PASS (code)** |
| All three | all three `requested` | Yes | Both | **PASS (code)** |

- No channel is silently lost: each flag maps 1:1.
- No unexpected activation: `requested` is the only reachable state at registration.
- Retail is opt-out (`!== false`), and the "at least one channel" rule is enforced.
- `initialVendorType` is derived for the legacy label only and does not gate anything.

**Live-DB state after registration** could not be captured for new registrations (no vendors created). Existing pending vendors confirm the shape.

**Status: PASS (code-verified) / live registration BLOCKED by operator decision.**

---

## 5. Login / Workspace Results (Phase 5)

`login` returns `{ vendorType, ...channelSummary }` = `activeWorkspaces[]`, `readableWorkspaces[]`, `channels{}`.

| Scenario | Behaviour | Verdict |
|---|---|---|
| Single-channel vendor | `readableWorkspaces.length === 1` → `WorkspacePicker` auto-`Navigate`s to `/vendor/dashboard?workspace=X` | **PASS** |
| Multi-channel vendor | Picker renders one card per readable workspace | **PASS** |
| Paused workspace | Card renders with amber "Paused" badge and "View existing orders (paused — no new orders)" | **PASS** |
| Zero readable workspaces | Explicit empty-state message, no redirect loop (`/vendor/workspaces` is in `workspaceOptional`) | **PASS** |
| URL synchronisation | `withWorkspace()` sets `?workspace=`; `useVendorWorkspace` reads it back | **PASS** |
| Refresh / direct URL / copied URL | Workspace comes from `location.search`, so it survives all three | **PASS** |
| Browser back/forward | Driven by react-router `location`, so state follows history | **PASS (code)** — not exercised in a browser |
| Multiple tabs | Last-workspace hint uses `sessionStorage` (per-tab), not `localStorage` — tabs do not fight | **PASS** |
| Invalid workspace in URL | `WORKSPACES.includes(value)` → `null` → layout guard redirects | **PASS** |
| Inactive workspace in URL | Client redirects; **server independently returns 403** | **PASS (runtime-confirmed)** |
| Workspace stored only in storage? | **No.** URL is authoritative; `api.js` reads the header value *from the URL*, never from storage | **PASS** |
| Stale `activeWorkspaces` after an admin change | `refreshProfile()` runs **once per mount** only — see **F-16** | **PARTIAL** |

**Status: PASS with one UX-staleness gap.**

---

## 6. Authorization Results (Phase 6) — runtime-executed

All probes issued against the real API with tokens minted for real vendors. **30 probes, 0 authorization failures.**

| # | Attack | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | Retail vendor, no workspace → `/vendor/products` | 200 (single channel auto-resolved) | `200` | **PASS** |
| 2 | Retail vendor `?workspace=retail` | 200 | `200` | **PASS** |
| 3 | Retail vendor `?workspace=wholesale` | 403 | `403 CHANNEL_ACCESS_DENIED` | **PASS** |
| 4 | Retail vendor `?workspace=quick_commerce` | 403 | `403 CHANNEL_ACCESS_DENIED` | **PASS** |
| 5 | Retail vendor, **header** `X-Vendor-Workspace: wholesale` | 403 | `403 CHANNEL_ACCESS_DENIED` | **PASS** |
| 6 | Retail vendor `?workspace=bogus` | 400 | `400 INVALID_WORKSPACE` | **PASS** |
| 7 | Retail vendor → QC-specific dashboard | 403 | `403 CHANNEL_ACCESS_DENIED` | **PASS** |
| 8 | Retail vendor → `/vendor/orders?workspace=wholesale` | 403 | `403` | **PASS** |
| 9 | Retail vendor → `/vendor/analytics/overview?workspace=quick_commerce` | 403 | `403` | **PASS** |
| 10 | Wholesale vendor `?workspace=wholesale` | 200 | `200` | **PASS** |
| 11 | Wholesale vendor `?workspace=retail` | 403 | `403` | **PASS** |
| 12 | Wholesale vendor `?workspace=quick_commerce` | 403 | `403` | **PASS** |
| 13 | Wholesale vendor → QC dashboard | 403 | `403` | **PASS** |
| 14 | QC vendor `?workspace=quick_commerce` | 200 | `200` | **PASS** |
| 15 | QC vendor `?workspace=retail` | 403 | `403` | **PASS** |
| 16 | QC vendor → `/vendor/orders?workspace=wholesale` | 403 | `403` | **PASS** |
| 17 | QC vendor → QC dashboard | 200 | `200` | **PASS** |
| 18 | Unauthenticated → `/vendor/products` | 401 | `401 AUTH_REQUIRED` | **PASS** |
| 19 | Unauthenticated → `/vendor/auth/channels` | 401 | `401` | **PASS** |
| 20 | Unauthenticated → `/admin/vendors` | 401 | `401` | **PASS** |

**Tampering vectors tested and defeated:** query parameter, HTTP header, workspace-specific route. Body tampering is defeated by the same `resolveVendorWorkspace` code path (single normalisation function for all three sources). `localStorage` / `sessionStorage` / frontend state cannot influence the decision because the server re-reads `req.vendor` from the database on **every** request via `enforceAccountStatus` ([authorize.js:42-63](DwellMart/backend/src/middlewares/authorize.js#L42-L63)) — this also closes the stale-token / channel-revocation window.

**Status: PASS. This is the strongest subsystem in the implementation.**

---

## 7. Admin Results (Phase 7 & 8)

### Admin channel management — `PATCH /admin/vendors/:id/channels/:channel/status`
| Control | Present | Evidence |
|---|---|---|
| `expectedRevision` optimistic concurrency | **YES** | [vendor.controller.js:247-251](DwellMart/backend/src/modules/admin/controllers/vendor.controller.js#L247-L251), returns `409 CHANNEL_REVISION_CONFLICT`. UI sends it. |
| State-transition rules enforced | **YES** | `canTransitionVendorChannel(previous, status)` → 409 on illegal transition |
| Account-approved precondition | **YES** | `status==='active'` requires `vendor.status==='approved'` |
| Active-order protection on disable | **YES** | Counts non-terminal orders for that channel, forces pause-first |
| Feature-flag protection | **YES** | Wholesale + QC both re-checked on activate |
| Wholesale profile completeness | **YES** | 5 fields re-validated on activate |
| QC profile/setup validation | **NO** | **F-15** |
| Audit log | **YES** | `recordVendorAdminAction(..., 'vendor_channel_status_updated', {channel, previousStatus, status, reason, channelsRevision})` |
| Admin identity + timestamp | **YES** | `reviewedBy: req.user.id`, `reviewedAt`, plus per-state timestamp field |
| Reason captured | **YES** | Persisted on the channel state and in the audit entry |
| Vendor notification | **YES** | `createNotification` per channel change |
| One channel change cannot alter another | **YES** | Writes are scoped to `vendor.channels[path]` only |
| Admin permission gate | **YES** | `perm(PERMISSIONS.VENDORS_APPROVE)` |

**Admin UI** ([VendorDetail.jsx:435-438](DwellMart/frontend/src/modules/Admin/pages/vendors/VendorDetail.jsx#L435-L438)) renders exactly the legal transitions: Activate (from `requested`/`paused`), Pause (from `active`), Reject (from `requested`), Disable (from `paused`). No illegal button exists. Reason is prompted for reject/pause/disable.

**Defects:** F-12 (account approval bypasses the transition validator), F-13 (initial approval is all-or-nothing and never rejects the un-approved requested channels), F-14 (`updateVendorQuickCommerce` UI omits `expectedRevision`).

### Vendor channel applications (Phase 8)
`GET /vendor/auth/channels`, `POST /vendor/auth/channels/:channel/apply`, `DELETE /vendor/auth/channels/:channel/request` — all present and wired to the `Selling Channels` page, which is in the unified sidebar menu.

| Transition | Result |
|---|---|
| Retail → request Wholesale | **PASS** — requires complete wholesale profile + feature flag |
| Retail → request QC | **PASS** — requires feature flag; **no QC setup collected (F-15)** |
| Wholesale → request Retail | **PASS** |
| Wholesale → request QC | **PASS** |
| QC → request Retail | **PASS** |
| QC → request Wholesale | **PASS** |
| Re-application after rejection | **PASS** — `rejected` is not in the blocked list |
| Withdrawal | **PASS** — only from `requested` |
| Vendor self-activation | **IMPOSSIBLE** — the only status a vendor endpoint can write is `requested` or `disabled` |

**Confirmed: vendors never self-activate a channel.** Defect F-11 (a vendor can re-apply from the terminal `disabled` state, contradicting `VENDOR_CHANNEL_STATUS_TRANSITIONS`).

---

## 8. Product Results (Phase 9 & 10)

### Ownership boundaries — **correct by design**
- Create: `rest.retailEnabled/wholesaleEnabled/quickCommerceEnabled` are set **only** from the server-resolved `req.vendorWorkspace` ([product.controller.js:301-304](DwellMart/backend/src/modules/vendor/controllers/product.controller.js#L301-L304)) — the client cannot choose.
- Update: sending another channel's flag returns 400 "Use the target workspace to publish or unpublish another channel."
- `updateProductChannel` requires `channel === req.vendorWorkspace`.
- Delete is a per-workspace unpublish; the product is only soft-deleted once every channel flag is false.
- Channel-specific config (`wholesale.*`, `quickCommerce.*`, `quickCommerceCategoryId`) is explicitly **preserved** when a channel is disabled and restored on re-enable ([product.controller.js:438-462](DwellMart/backend/src/modules/vendor/controllers/product.controller.js#L438-L462)).
- Optimistic concurrency: `expectedVersion` vs `product.__v` → `409 PRODUCT_VERSION_CONFLICT` on both update paths.
- Single product document, never duplicated per channel — confirmed in the live data (48 products carry `retailEnabled+quickCommerceEnabled`, 4 carry `retailEnabled+wholesaleEnabled`, as single documents).

### But the workflow is blocked
**F-01 makes Wholesale and Quick Commerce product create/update return HTTP 400 in the default configuration.** All the correctness above is unreachable on those two channels.

### Multi-channel matrix (Phase 10)
| Config | Duplication | Independent publication | Shared core consistent | Config survives disable | Verdict |
|---|---|---|---|---|---|
| Retail only | none | ✓ | ✓ | ✓ | **PASS** |
| Retail + Wholesale | none | ✓ | ✓ | ✓ | **PASS (code)** — blocked in practice by F-01 |
| Retail + QC | none | ✓ | ✓ | ✓ | **FAIL at read time — F-03** (listed but 404 on detail) |
| Wholesale + QC | none | ✓ | ✓ | ✓ | **PASS (code)** — blocked by F-01 |
| All three | none | ✓ | ✓ | ✓ | **PARTIAL** — F-01 + F-03 |

Additional defect: **F-09** — editing a product from a workspace force-sets that workspace's flag to `true` ([product.controller.js:372](DwellMart/backend/src/modules/vendor/controllers/product.controller.js#L372)), silently re-publishing a product the vendor had deliberately unpublished.

---

## 9. Inventory Results (Phase 11)

**Shared inventory V1 is correctly implemented.**

- One `stockQuantity` and one `reservedQuantity` per product (plus per-variant `stockMap`/`reservedMap`). **No** `retailStock` / `wholesaleStock` / `qcStock` field exists anywhere in the schema or the live documents — the requirement "ensure no separate stock model was unintentionally introduced" is **satisfied**.
- Therefore Stock 100 − retail 10 − wholesale 20 − QC 5 = **65** holds structurally: all three channels decrement the same field.
- Atomic decrement on the checkout path: `Product.findOneAndUpdate({_id, stockQuantity: {$gte: qty}}, {$inc: {stockQuantity: -qty}})` inside `session.withTransaction` ([order.controller.js:661-669](DwellMart/backend/src/modules/user/controllers/order.controller.js#L661-L669)) — conditional filter prevents oversell.
- Reservations: `InventoryReservationService.reserveStock` uses conditional `$inc` on `reservedQuantity`, with variant-aware keys (migration 0007 applied) and rollback on duplicate/error.
- Release on cancellation and on payment failure both present (`releaseReservation`, and `$inc` restore inside the cancellation transaction).

**Defect F-18 (LOW/latent):** `src/services/stock.service.js` still exports `validateAndDeductStock` / `restoreStock`, which perform a **non-atomic** read-modify-write (`product.stockQuantity -= qty; await product.save()`), i.e. a classic oversell race. Grep confirms **zero call sites** — it is dead code, but it is dead code that looks like the right helper to reach for.

**Concurrent cross-channel order test: NOT EXECUTED** (requires mutating E2E). Mechanism verified by code inspection only.

---

## 10. Catalog Results (Phase 12) — the weakest area

The shared builder is correct. The endpoints that bypass it are not.

### Measured live (no authentication)

| Endpoint | Returned | QC-only leaked | Wholesale-only leaked | From vendors whose **retail channel is not active** | Verdict |
|---|---|---|---|---|---|
| `GET /api/products` (uses `buildCatalogFilter` + vendor eligibility pre-resolution) | 88 | 0 | 0 | **0** | **PASS** |
| `GET /api/new-arrivals` | 100 | **3** | **1** | **60** | **FAIL** |
| `GET /api/flash-sale` | 9 | **1** | 0 | **6** (+3 with a missing vendor) | **FAIL** |
| `GET /api/popular` | 10 | 0 | 0 | **2** | **FAIL** |
| `GET /api/vendors/:id/products` (QC-only store "Army store") | 3 | **2** | 0 | **3** | **FAIL** |
| `GET /api/vendors/:id` (same QC-only store) | 200 OK | — | — | vendor has no active retail channel | **FAIL** |

The four-condition visibility rule (*product channel enabled* **AND** *vendor channel active* **AND** *vendor account eligible* **AND** *platform feature flag*) is enforced on `/api/products`, `/api/similar/:id`, `/api/products/:id`, the Quick Commerce surfaces, and the vendor listing pages. It is enforced on **none** of the five endpoints above.

### Category correctness
- QC uses `quickCommerceCategoryId` with a `categoryId` fallback ✓; Retail/Wholesale use `categoryId` ✓; `getCategoryExperience()` blocks cross-tree assignment on write ✓.
- **F-04 (CONFIRMED runtime):** adding `search=` to a Quick Commerce category listing **destroys the category filter**. `filter.$or` is set by `buildCatalogFilter` for the QC category, then unconditionally overwritten at [public.routes.js:342](DwellMart/backend/src/routes/public.routes.js#L342). Measured: category-only → **0 items**; category + `search=a` → **5 items** from other categories.

### Direct-ID leakage
`GET /api/products/:id` **does** re-validate vendor status and channel — good. But its channel resolution is priority-based rather than experience-based, producing **F-03**.

---

## 11. Cart Results (Phase 13)

`CartValidationPipeline.validateCart` is well built and is the model the rest of the system should follow. Server-side it verifies, per line item: product exists / active / visible; variant selection valid; **product channel flag matches the line's fulfillment type**; **vendor account eligible**; **vendor channel `active`** (`vendor.channels[path].status === 'active'`); QC store open + within radius; wholesale MOQ via the authoritative pricing engine; QC `maxOrderQty`; stock sufficiency. Errors are collected per item rather than thrown on first failure, so the UI can show per-line warnings.

| Check | Verdict |
|---|---|
| Cart line keeps correct channel context | **PASS** — `fulfillmentType` resolved per line and re-derived server-side |
| Pricing correct | **PASS** — `resolvePriceForQuantity`, client price never trusted |
| MOQ correct | **PASS** |
| Vendor workspace does not affect customer authorization | **PASS** — no vendor workspace concept exists on customer routes |
| Unavailable-channel products cannot proceed | **PASS** |
| Stale cart channel state revalidated | **PASS** — validation re-runs inside `assertCartValid` in the splitter transaction |
| Wholesale feature flag honoured | **PASS** |
| **QC feature flag honoured** | **FAIL — F-08.** `isWholesaleMarketplaceEnabled()` is checked; `isQuickCommerceEnabled()` is not |

---

## 12. Checkout Results (Phase 14)

Two order-creation paths exist and they do **not** enforce the same rules.

| Control | `POST /user/checkout/session` + `/confirm` (OrderSplitterEngine, used by the Checkout UI) | `POST /user/orders` (legacy `placeOrder`, still wired in `orderStore.createOrder`) |
|---|---|---|
| Vendor account approved/active | ✓ | ✓ |
| **Vendor retail channel active** | ✓ | **✗ — never checked** |
| **Vendor wholesale channel active** | ✓ | **✗ — only used to decide pricing** |
| Vendor QC channel active | ✓ | ✓ |
| Product published on the channel | ✓ | ✓ |
| Wholesale feature flag | ✓ | ✓ |
| QC feature flag | ✗ (F-08) | ✓ |
| Inventory re-validated + atomic decrement | ✓ | ✓ |
| MOQ / tier pricing | ✓ | ✓ |
| Price / tax / shipping server-derived | ✓ | ✓ |
| QC serviceability, radius, ETA, fee | ✓ | ✓ |

**Client is never trusted for price** — both paths recompute from `Product.price` through the pricing engine, and `verifyPricingEngineParity` (79 assertions) and `verifyCheckoutPricingMath` (42 assertions) both pass. **Client is never trusted for vendor authorization** — `vendorId` is re-read from the product document, not the payload.

**But the client *is* effectively trusted for the retail/wholesale channel gate on the legacy route.** That is **F-02**.

---

## 13. Order Results (Phase 15 & 16)

### Vendor order surfaces
- Listing, detail, and status update are all workspace-scoped **server-side** ([order.controller.js:57, 115-117, 168](DwellMart/backend/src/modules/vendor/controllers/order.controller.js#L57)). The workspace filter is not a client-side convenience.
- Cross-vendor isolation is enforced twice: in the query (`vendorItems.vendorId`) **and** by sanitising `vendorItems`/`items` down to the caller's own slice before responding. Vendor A cannot see Vendor B's lines even within a shared multi-vendor order. **PASS.**
- QC gets its own finer lifecycle endpoints behind `requireSpecificChannel('quick_commerce')`.
- Paused-channel semantics are deliberate and correct: `PATCH /orders/:id/status` uses `requireReadableChannel`, so a paused channel can finish accepted work but `requireWritableChannel` blocks new product publication. This matches the requirement.

### Order channel attribution is inconsistent — **F-06**
Live data proves it:

| `orderType` | `fulfillmentType` | Count |
|---|---|---|
| `retail` | `retail` | 219 |
| `retail` | `quick_commerce` | **54** |
| `retail` | `wholesale` | **31** |
| `retail` | *(null)* | 10 |
| `retail` | *(missing)* | 4 |
| `wholesale` | `wholesale` | 3 |
| *(missing)* | *(missing)* | **32** |

`getVendorOrders` matches on **either** field (`$or`), but `updateOrderStatus` gates on **`orderType` alone**. Consequences on real data:
- The 31 wholesale-fulfilled orders appear in the Wholesale workspace list but `updateOrderStatus` returns **403 "This order belongs to a different workspace"** — the vendor can see them and cannot action them.
- The 54 QC-fulfilled orders also appear in the **Retail** workspace, where `orderType==='retail'` matches the workspace, `orderType` is not `quick_commerce`, and the **retail** state machine is applied to a Quick Commerce order.

### Not executed
Pausing a channel with live orders, disabling a channel, and observing the resulting order behaviour end-to-end were **not executed** (mutating). The guard code (`activeOrders` count before disable) is verified by reading; its runtime behaviour is **UNVERIFIED**.

---

## 14. Analytics Results (Phase 17)

| Surface | Channel source | Verdict |
|---|---|---|
| Vendor `GET /analytics/overview` | `req.vendorWorkspace` (server-resolved), filters orders on `fulfillmentType \| orderType \| vendorItems.orderType`, products on the workspace flag | **PASS** — no client-side filtering |
| Vendor `GET /business-overview` | Account-wide, read-only, grouped by `fulfillmentType ?? orderType ?? 'retail'` | **PASS with F-07** |
| Vendor `GET /performance/metrics` | `requireReadableChannel` | **PASS** |
| Admin retail/wholesale segmentation | Canonical `channels.retail.status` / `channels.wholesale.status` | **PASS** |
| Admin Quick Commerce analytics | Canonical `channels.quickCommerce.status` | **PASS** |
| Admin broadcast targeting | Canonical channel status per audience | **PASS** |

**Unique-customer calculation:** `business-overview` uses `$addToSet` per channel and a cross-channel `Set` for the total, so a customer active on two channels is counted once in the total and once per channel — correct.

**F-07 (MEDIUM):** `businessOverview` (a) **overwrites** rather than accumulates when two `$group` keys collapse to the same channel bucket (`channels[channel] = {...}` at [businessOverview.controller.js:27](DwellMart/backend/src/modules/vendor/controllers/businessOverview.controller.js#L27)), and (b) applies **no date range and no cancelled/returned exclusion**, so cancelled orders inflate reported revenue. `analytics/overview` correctly excludes `cancelled`/`returned`, so the two surfaces disagree.

**Security:** no analytics endpoint relies on client-side filtering. **PASS.**

---

## 15. UI / UX Results (Phase 18)

| Item | Verdict |
|---|---|
| Shared shell (header, sidebar, profile, wallet, subscription, notifications, support) | **PASS** — one `VendorLayout`, one sidebar, channel-agnostic account surfaces |
| Channel-specific menu | **PASS** — `getVendorCapabilities(workspace)` drives the menu; QC gets an injected Quick Commerce entry; Shipping Management is retail-only; Reviews/Returns/Customers gated on capability flags |
| Workspace switcher | **PASS** — `<select>` in `VendorHeader`, rendered only when `readableWorkspaces.length > 1` |
| Paused badge | **PASS** — in `WorkspacePicker` |
| Stale data on workspace switch | **PASS** — `vendorProductStore` records the workspace at fetch time and clears the list when it changes |
| Loading / empty / error states | **PASS** — loading and empty states present in `WorkspacePicker`, `ManageProducts`, `SellingChannels`; errors surface through the axios interceptor toast |
| Responsive / mobile | **PASS (code)** — `VendorBottomNav`, breakpoint handling, safe-area padding. **Not visually verified.** |
| `Selling Channels` reachable | **PASS** — present in `UNIFIED_VENDOR_MENU` |
| `Business Overview` reachable | **PASS** — present in `UNIFIED_VENDOR_MENU` |
| Channel state freshness | **PARTIAL — F-16** |
| Zero-channel vendor experience | **PARTIAL — F-17** (a friendly picker message, but every other page 403s with a raw error toast) |

---

## 16. Security Results (Phase 19)

| Test | Result |
|---|---|
| IDOR — cross-vendor product access | **PASS** — every vendor product query is `{_id, vendorId: req.user.id}` |
| IDOR — cross-vendor order access | **PASS** — query-level + response-level sanitisation |
| IDOR — cross-vendor bulk-import job access | **PASS** — job workspace compared to `req.vendorWorkspace` |
| Privilege escalation — vendor self-activating a channel | **PASS** — no vendor endpoint can write `active` |
| Workspace tampering (query / header / body) | **PASS — runtime-confirmed, 14/14 blocked** |
| `vendorType` tampering | **PASS** — `vendorType` grants nothing in canonical mode; the admin endpoint that sets it explicitly documents and behaves as classification-only |
| `sellingChannels` tampering | **PASS** — overwritten by `projectSellingChannels()` in the pre-save hook |
| Direct API access without UI | **PASS for vendor routes / FAIL for `POST /user/orders` (F-02) and the five unguarded catalog endpoints (F-02b)** |
| Stale token / channel revocation | **PASS** — `enforceAccountStatus` re-reads the vendor from the DB on every request |
| Inactive-channel access | **PASS** |
| Admin authorization | **PASS** — `perm(PERMISSIONS.VENDORS_APPROVE)`; permission-coverage check confirms all 45 tokens are route-enforced |
| Channel-approval authorization | **PASS** |
| Repository-wide sweep for authorization bypasses | 3 found: F-02 (legacy order route), F-02b (catalog endpoints), F-08 (QC feature flag at cart validation) |
| Secrets in `.env` | **NOTE** — the repository working tree contains a live Atlas connection string with credentials, Cloudinary and Firebase secrets, and SMTP credentials. `.gitignore` was not audited for coverage. Outside multi-channel scope but relevant to production readiness. |

**Security regression suite: 91/91 passing** (uploads hardening, paid-order cancellation, permission coverage, production environment contract).

---

## 17. Performance Results (Phase 21)

| Area | Finding |
|---|---|
| Channel indexes | **GOOD** — `{channels.X.status, status, isActive}` exists for all three channels and is live in the DB |
| Catalog vendor pre-resolution | **CONCERN** — `listProducts` runs an unbounded `Vendor.find({status, isActive, channels.X.status})` returning **every** eligible vendor id on **every** catalog request, then uses it as `vendorId: {$in: [...]}`. At 74 vendors this is free; at 10k vendors it is a large array shipped into every query and a growing `$in`. Recommend an aggregation `$lookup` or a denormalised `product.vendorChannelActive` flag. |
| `$in` vendor filters | Same as above; index `vendorId_1_isActive_1` covers the lookup |
| N+1 queries | **NONE FOUND on the hot paths.** `CartValidationPipeline`, `OrderSplitterEngine`, and `placeOrder` all batch-fetch products and vendors before their loops with explicit `.select()` projections. `getVendorProductCountsMap` uses a single aggregation. |
| `new-arrivals` fallback | Issues up to **4 sequential queries** (primary find, count, fallback find, `countDocuments({isActive:true})`) on page 1 |
| Frontend workspace switching | **GOOD** — product store clears on workspace change rather than refetching everything blindly |
| Cache isolation | **CONCERN** — `listCache`/`marketingCache`/`detailCache` response caches sit in front of catalog routes. `Vary: X-Vendor-Workspace` is set by `resolveVendorWorkspace` for vendor routes, but the public caches key on the URL; `X-Experience` is a **header**, not a query parameter, on many frontend calls. If the cache does not vary on `X-Experience`, a Quick Commerce response can be served to a marketplace request. **UNVERIFIED — not measured; recommend confirming `responseCache.js` key composition.** |
| Frontend bundle | `chunk-admin` 974 kB, `vendor` 1,028 kB, `index` 668 kB (uncompressed). Several **3–15 MB PNG assets** ship unoptimised (`winter scarf` 14.8 MB, `summer dress` 13.2 MB). Not multi-channel-specific but a real production concern. |
| Measured timings | Migration 0008 took **3,941 ms** for 69 vendors (recorded in the ledger). Frontend build 55.27 s. |

---

## 18. Migration Results (Phase 18 / Phase 3)

### Verified against the live database — **APPLIED**

```
migrationId : 0008_vendor_channels
status      : applied
appliedAt   : 2026-08-13T12:16:47.309Z
appliedBy   : DESKTOP-IG0IM7A:5364
durationMs  : 3941
result      : { migrated: 69, invalidTypeDefaultedToRetail: 23 }
error       : null
```

- **Migration exists:** `src/migrations/0008_vendor_channels.js` ✓
- **Migration is registered:** present in `MIGRATIONS[]` in `src/migrations/index.js` ✓ (also asserted by unit test #7)
- **Migration is applied:** ✓ **verified by reading the `schemamigrations` collection**, not by trusting a report
- **All 7 prior migrations applied:** ✓ (0001–0007)
- **`verify()` currently returns ok:** ✓ `missing=0; invalid=0`

### Post-migration data state (live)

| `vendorType` | account status | channels r/w/q | `channelsRevision` | count |
|---|---|---|---|---|
| retail | approved | active / disabled / disabled | 1 | 24 |
| retail | rejected | disabled / disabled / disabled | 1 | 12 |
| retail | pending | requested / disabled / disabled | 1 | 10 |
| quick_commerce | approved | disabled / disabled / active | 1 | 7 |
| wholesale | approved | disabled / active / disabled | 1 | 7 |
| retail | approved | active / disabled / disabled | 1 | 5 |
| **retail** | **approved** | **disabled / disabled / disabled** | **0** | **4** ← not migrated |
| quick_commerce | pending | disabled / disabled / requested | 1 | 2 |
| wholesale | pending | disabled / requested / disabled | 1 | 2 |
| quick_commerce | approved | disabled / disabled / active | 1 | 1 |

Distinct channel statuses in production: `requested`, `active`, `disabled`. No vendor holds more than one active channel today, so multi-channel behaviour has **no production traffic yet**.

### Per-scenario logic verification (unit tests #8–#14, all passing)
retail vendorType ✓ · wholesale vendorType ✓ · QC via `sellingChannels` ✓ · historical multi-select `sellingChannels` wins over `vendorType` ✓ · deactivated vendor → all disabled ✓ · pending → `requested` preserved ✓ · malformed `vendorType` → retail ✓ · rejected → `rejected` ✓ (code path present).

**Multi-channel intent is not lost:** `hasExplicitLegacyChannels` prefers `sellingChannels` whenever any flag is explicitly `true`, falling back to `vendorType` only for single-channel legacy records.

**No unauthorized grant:** a channel only becomes `active` if it was enabled in `sellingChannels` (or matched `vendorType`) **and** the account is `approved`/`suspended`. Rejected accounts get `rejected`; deactivated accounts get `disabled`.

### Defects
- **F-05 (HIGH):** the idempotency/selection guard is `$or` of four `$exists: false` conditions. Once the current Mongoose schema is deployed, **every saved vendor already has `channels.*.status` (default `disabled`) and `channelsRevision` (default 0)** — so such a vendor matches none of the conditions and is silently skipped. `verify()` checks only *existence* and *enum validity*, so it reports `ok` for a vendor that was never migrated. **Proof:** the 4 vendors above were created at `2026-08-13T07:51` and `08:19`; the migration ran at `12:16` the same day and did not touch them. They are `approved` + `isActive` with **zero** channels.
  *Current blast radius:* all 4 are unverified seeded test fixtures (`vendor_a_…@test.com`), so **no real vendor is presently locked out**. The defect is nonetheless live and will recur on any future re-run or on any vendor written between a schema deploy and the migration step.
- **F-10 (MEDIUM):** the migration **rewrites `vendorType`** for 23 vendors (`invalidTypeDefaultedToRetail: 23`) as a side effect of a channel backfill. The original values are not preserved anywhere and there is no down-migration. Whatever those 23 vendors were classified as is now unrecoverable from the database.

**Classification: migration logic verified ✓ · migration applied ✓ (DB-verified) · migration coverage incomplete ✗**

---

## 19. Test Results (Phase 22) — actually executed

| Suite | Command | Passed | Failed | Skipped | Duration | Result |
|---|---|---|---|---|---|---|
| Vendor channel unit tests | `node --test tests/unit/vendor-channels.test.mjs` | **14** | 0 | 0 | 1.21 s | **PASS** |
| Security regression | `node tests/unit/security-regression.test.mjs` | **91** | 0 | 0 | — | **PASS** |
| Pricing engine parity | `node scripts/verifyPricingEngineParity.mjs` | **79** | 0 | 0 | — | **PASS** |
| Checkout pricing math | `node scripts/verifyCheckoutPricingMath.mjs` | **42** | 0 | 0 | — | **PASS** |
| Wholesale analytics | `node scripts/verifyWholesaleAnalytics.mjs` | **24** | 0 | 0 | — | **PASS** |
| Bulk wholesale import | `node scripts/verifyBulkWholesaleImport.mjs` | **37** | 0 | 0 | — | **PASS** |
| Quick Commerce ETA parity | `node scripts/verifyQuickCommerceEtaParity.mjs` | **62** | 0 | 0 | — | **PASS** |
| Rider assignment | `node scripts/verifyRiderAssignment.mjs` | **56** | 0 | 0 | — | **PASS** |
| Quick Commerce polish | `node scripts/verifyQuickCommercePolish.mjs` | **58** | 0 | 0 | — | **PASS** |
| Source hygiene | `npm run check:hygiene` | ✓ | 0 | — | — | **PASS** |
| Permission coverage | `npm run check:permissions` | 45 tokens | 0 | — | — | **PASS** |
| Frontend production build | `npm run build` | ✓ | 0 | — | 55.27 s | **PASS** |
| **Backend integration suites** | `npm run test:gate` | — | — | — | — | **BLOCKED — isolated DB required** |
| **Contract test** (`frontendApiContract`) | via `test:gate` | — | — | — | — | **BLOCKED — isolated DB required** |
| **Migration tests against a DB** | n/a | — | — | — | — | **BLOCKED — isolated DB required** |
| **Frontend unit / component tests** | n/a | — | — | — | — | **DO NOT EXIST** |
| **E2E (browser)** | n/a | — | — | — | — | **DO NOT EXIST** |
| **Read-only runtime probes** (this audit) | in-process app mount | **30 + 12** | 0 auth failures | — | — | **EXECUTED** |

**Total genuinely executed assertions: 463 backend + 42 runtime probes.**

`test:gate` output, verbatim:
```
✗ Refusing to run integration tests against a remote/production-looking database.
  MONGO_URI points at a hosted cluster. These suites write and delete real records.
  Use a local database, or set ALLOW_TESTS_AGAINST_THIS_DB=yes if you are certain.
```
The override was **not** used. This is correct behaviour by the runner and is recorded as BLOCKED, not as a failure.

### Test-coverage assessment (F-20)
The 14 channel tests are **pure unit tests of four modules** (`vendorChannels` constants, `vendorChannel.service`, the two middleware functions, and the migration's pure builder). They construct plain objects — no HTTP, no database, no controller, no route. There is **zero automated coverage** of: registration across the 7 combinations, admin approval/pause/disable, the vendor application flow, product create/update per workspace, catalog channel visibility, cart/checkout channel gating, or order workspace scoping. Every defect in this report sits in that uncovered surface, which is exactly why the suite is green while the system is not ready.

---

## 20. Hardcoded / Mock / Dead Code Findings (Phase 23)

| Item | Location | Assessment |
|---|---|---|
| TODO / FIXME / HACK markers | entire `backend/src` + `frontend/src` | **0 found** — enforced by `check:hygiene` |
| Hardcoded channel path lists | `migrations/0008:32`, `admin/vendor.controller.js:185` (`['retail','wholesale','quickCommerce']`) | Acceptable — schema paths, not authorization |
| Hardcoded channel enums in models | `Order`, `Commission`, `FulfillmentGroup`, `BulkImportHistory` | Acceptable — persisted enums |
| **Dead code:** `stock.service.js` | `validateAndDeductStock`, `restoreStock` | **0 call sites.** Non-atomic oversell-prone implementation left in the tree — **F-18** |
| **Dead legacy endpoint:** `PUT /vendor/auth/selling-channels` | `vendor.routes.js:111` | Still routed and functional; the frontend store method it served is now a `console.warn` no-op stub. Provides a second, less-guarded write path into `channels` — **F-11b** |
| Dead frontend stub | `vendorAuthStore.updateSellingChannels` | Deliberate no-op with a deprecation warning; documented for removal |
| Hardcoded test-vendor filter regex | `public.routes.js:735` `PUBLIC_TEST_VENDOR_REGEX` = `/test\|sptest\|qwerty\|qa \|audit\|seeded\|demo\|dummy\|sample\|free\s*vendor\|^sk\s*store\|^sagar\s*store/i` | **Production data hiding via a hardcoded blocklist**, including two apparently real store names (`sk store`, `sagar store`). A legitimate vendor named e.g. "Demo Electronics" is invisible on the public store list — **F-21** |
| Vacuous query condition | `public.routes.js:743,799` — `isDeleted: {$ne: true}` on `Vendor` | The `Vendor` schema has **no** `isDeleted` field; the condition matches every document. Misleading, not harmful — **F-22** |
| Legacy `hybrid` naming | `admin/analytics.controller.js` `hybridVendors` | A retail∩wholesale counter, not a vendor type — **F-19** |
| Mock channel status / static vendor data / fake analytics | searched | **None found.** All channel statuses, analytics and vendor data are read from the database |
| Unused workspace components | searched | **None.** `WorkspacePicker`, `SellingChannels`, `BusinessOverview` are all routed **and** linked from `UNIFIED_VENDOR_MENU` |
| Unused middleware | searched | `RequireVendorType.jsx` / `RequireCapability.jsx` still exist alongside the workspace model; verify before removal |
| Legacy authorization branches | `channelAuthorityMode() === 'legacy'` paths in middleware, service, cart pipeline, order controller | **Intentional rollback switch**, consistently implemented across all five call sites. Not dead, but it is a documented way to turn canonical authorization off via one environment variable — **F-23** |

---

## 21. Legacy Dependency Findings (Phase 20)

**`vendorType` — 38 references, all classified:**

| Class | Count | Locations |
|---|---|---|
| Schema definition / index | 3 | `Vendor.model.js` |
| Display / API response only | 4 | `toPublicVendor`, `login`, `getChannels`, `marketplaceEventBus` (labelled `legacyVendorType`) |
| Admin classification endpoint (explicitly grants nothing) | 8 | `admin/vendor.controller.js:321-354` |
| Admin approval single-channel shorthand | 5 | `admin/vendor.controller.js:126-181` |
| Migration input | 6 | `0008_vendor_channels.js` |
| **Legacy-mode-only authorization** | 2 | `vendorChannel.service.js:24` (`legacyChannelForVendor`), reachable only when `VENDOR_CHANNEL_AUTHORITY_MODE=legacy` |
| Comments / documentation | 10 | — |
| **Authorization risk in canonical mode** | **0** | — |

**`sellingChannels` — all references classified:**

| Class | Locations |
|---|---|
| Compatibility projection (written from canonical) | `Vendor.model.js` pre-save hook, `admin/vendor.controller.js:297,433` |
| Registration input (converted to `requested` states) | `auth.controller.js:201-260` |
| Legacy vendor self-service endpoint | `auth.controller.js:716-783` (**F-11b**) |
| Validators | `vendor/validators/auth.validator.js` |
| Indexes retained for rollback | `Vendor.model.js:213,296,297` |
| Public registration metadata | `public.routes.js:132` |
| Legacy-mode-only authorization | `vendorChannel.service.js:31` |
| **Authorization risk in canonical mode** | **0** |

**Verdict: no authorization path depends on legacy `vendorType` or `sellingChannels` in canonical mode. PASS.**

**Legacy vendors continue working:** the 24 approved retail vendors migrated to `retail: active` and pass the runtime authorization probes. **Historical orders remain valid:** the 353 existing orders retain their `orderType`/`fulfillmentType`; no migration rewrote them — though F-06 shows the two fields were never reconciled.

---

## 22. Critical Defects

---
### **F-01 — Wholesale and Quick Commerce vendors cannot create or edit products (production blocker)**
- **Severity:** CRITICAL
- **Category:** Functional / Configuration inversion
- **File:** [backend/src/modules/vendor/middleware/productCapabilityGuard.js:47](DwellMart/backend/src/modules/vendor/middleware/productCapabilityGuard.js#L47)
- **Evidence:**
  The file's own header states: *"`PRODUCT_FIELD_STRICT=true` → 400 Bad Request for prohibited fields; unset (default) → observe-only"*. The code does the opposite:
  ```js
  const strictMode = process.env.PRODUCT_FIELD_STRICT !== 'false';
  ```
  With the variable unset (it is absent from `backend/.env`), `strictMode === true`. Simulated against the exact payload key set emitted by `frontend/src/modules/Vendor/pages/products/ProductForm.jsx` `handleSubmit`:
  ```
  PRODUCT_FIELD_STRICT env = undefined -> strictMode = true (rejects on prohibited fields)
    workspace=retail          prohibited=0  -> passes
    workspace=wholesale       prohibited=8  -> HTTP 400 on first: "originalPrice"
                              [originalPrice, totalAllowedQuantity, warrantyPeriod, guaranteePeriod,
                               isNewArrival, codAllowed, returnable, cancelable]
    workspace=quick_commerce  prohibited=8  -> HTTP 400 on first: "subcategoryId"
                              [subcategoryId, brandId, totalAllowedQuantity, minimumOrderQuantity,
                               warrantyPeriod, guaranteePeriod, hsnCode, variants]
  ```
  The guard runs before the Joi validator on `POST /vendor/products` and `PUT /vendor/products/:id` ([vendor.routes.js:138-139](DwellMart/backend/src/modules/vendor/routes/vendor.routes.js#L138-L139)), so it sees the raw body. `enforceAccountStatus` now populates `req.vendor`, which is what made this previously-inert guard go live.
- **Reproduction:** Log in as a Quick Commerce vendor → Products → Add Product → fill any valid form → Save. Response: `400 {"message":"Field \"subcategoryId\" is not allowed for Quick Commerce vendors."}`. Same for Wholesale on `originalPrice`.
- **Business impact:** Two of the three channels cannot onboard or maintain a catalogue. Quick Commerce and Wholesale are non-operational for vendors. Retail is unaffected, which is why the defect survives a retail-only smoke test.
- **Recommended action:** Either (a) invert the default to match the documentation (`=== 'true'`), or (b) reconcile the three `allowedProductFields` lists with the real `ProductForm` payload and the Joi schemas, then keep strict mode. Option (a) is the safe immediate fix; option (b) is the correct end state. Add a test that asserts the guard against the actual UI payload for all three workspaces.

---

## 23. High Risk Defects

---
### **F-02 — `POST /api/user/orders` bypasses retail and wholesale channel authorization**
- **Severity:** HIGH
- **Category:** Authorization bypass / Business rule
- **File:** [backend/src/modules/user/controllers/order.controller.js:123-360](DwellMart/backend/src/modules/user/controllers/order.controller.js#L123-L360), routed at [user.routes.js:76](DwellMart/backend/src/modules/user/routes/user.routes.js#L76)
- **Evidence:** The handler checks `vendor.isActive === false || vendor.status !== 'approved'` (line 277) and, for QC only, `vendor.channels.quickCommerce.status === 'active'` (line ~292). There is **no** check of `channels.retail.status` or `channels.wholesale.status` anywhere in the function. The wholesale channel status is read only to decide `vendorWholesaleEnabled` for *pricing* (line ~355). The parallel path (`POST /user/checkout/confirm` → `OrderSplitterEngine` → `assertCartValid`) does enforce it at [CartValidationPipeline.js:183](DwellMart/backend/src/services/checkout/CartValidationPipeline.js#L183).
- **Reproduction:** Admin pauses (or disables) a vendor's retail channel. `POST /api/user/orders` with that vendor's product and a valid customer token. The order is created. The same cart through `/user/checkout/confirm` is correctly rejected with *"seller is not accepting new retail orders"*.
- **Business impact:** "Pause a channel → new orders blocked" — a core requirement — is not enforced on a live endpoint. A wholesale order can be placed against a vendor with no wholesale authorization, at retail pricing (tiers silently drop). The route is still referenced by `frontend/src/shared/store/orderStore.js:113`.
- **Recommended action:** Call `assertCartValid` from `placeOrder`, or retire the legacy route entirely and remove `orderStore.createOrder`.

---
### **F-02b — Five public catalog endpoints have no channel authorization**
- **Severity:** HIGH
- **Category:** Data leakage / Business rule
- **Files:** [public.routes.js:377-398](DwellMart/backend/src/routes/public.routes.js#L377-L398) (`/flash-sale`), [401-493](DwellMart/backend/src/routes/public.routes.js#L401-L493) (`/new-arrivals`), [496-509](DwellMart/backend/src/routes/public.routes.js#L496-L509) (`/popular`), [907-915](DwellMart/backend/src/routes/public.routes.js#L907-L915) (`/vendors/:id`), [918-974](DwellMart/backend/src/routes/public.routes.js#L918-L974) (`/vendors/:id/products`)
- **Evidence:** Each builds its filter inline (`{isActive: true, …}`) instead of calling `buildCatalogFilter`, and none pre-resolves an eligible vendor set. Measured live against the production database:
  ```
  /api/products     : returned=88  QC-only=0  wholesale-only=0  vendor-retail-not-active=0   ← guarded, clean
  /api/new-arrivals : returned=100 QC-only=3  wholesale-only=1  vendor-retail-not-active=60
  /api/flash-sale   : returned=9   QC-only=1  wholesale-only=0  vendor-retail-not-active=6  vendor-missing=3
  /api/popular      : returned=10  QC-only=0  wholesale-only=0  vendor-retail-not-active=2
  /api/vendors/:id/products (QC-only store "Army store") : returned=3, of which QC-only=2
  /api/vendors/:id          (same store, no active retail channel) : HTTP 200
  ```
  `new-arrivals` also has a fallback branch (line 464) that drops to a bare `{isActive: true}` filter whenever the page is under-filled — which is why 60 of 100 results are ineligible.
- **Reproduction:** `curl http://localhost:5000/api/new-arrivals?limit=100` — no authentication — then cross-reference each `vendorId` against `vendors.channels.retail.status`.
- **Business impact:** Customers see and can add to cart products from vendors who are paused, disabled, rejected, or QC/wholesale-only. Checkout will then reject them (the checkout path *is* guarded), producing a broken funnel and a support burden. Wholesale-only pricing and Quick Commerce inventory are exposed on the retail storefront.
- **Recommended action:** Route all five through `buildCatalogFilter` with the same eligible-vendor pre-resolution used by `listProducts`, and delete the unfiltered `new-arrivals` fallback branch. Add a conformance test asserting that every public catalog endpoint returns only channel-eligible products.

---
### **F-03 — A multi-channel product is listed but returns 404 on its detail page**
- **Severity:** HIGH
- **Category:** Correctness / Multi-channel independence
- **File:** [public.routes.js:571-586](DwellMart/backend/src/routes/public.routes.js#L571-L586) (and the same pattern at [512-547](DwellMart/backend/src/routes/public.routes.js#L512-L547) for `/similar/:id`)
- **Evidence:** Channel eligibility on the detail page is resolved by if/else **priority** on the product's own flags, not by the experience the customer is browsing:
  ```js
  if (product.quickCommerceEnabled === true) { require vendor QC active }
  else if (product.wholesaleEnabled === true && product.retailEnabled === false) { require vendor wholesale active }
  else { require vendor retail active|paused }
  ```
  A product with `retailEnabled: true` **and** `quickCommerceEnabled: true` therefore always takes the QC branch. **Confirmed live:** product `6a7572f30a09274de4000f23` ("Vendor A Quick Commerce Item", vendor "Fashion Hub Store", `channels.retail.status = active`, `channels.quickCommerce.status` not active):
  ```
  appears in marketplace list (/api/products)  : true
  GET /api/products/6a7572f30a09274de4000f23   : 404 Product not found.
  ```
  The live database contains **48 products** with both `retailEnabled` and `quickCommerceEnabled` set, so this is not a corner case.
- **Reproduction:** As above, with `curl`.
- **Business impact:** Directly violates *"disabling one channel does not disable other channels."* Customers hit a dead product page from a working listing; SEO and paid traffic land on 404s.
- **Recommended action:** Resolve the channel from `getRequestExperience(req)` (and the `sellingChannel` query where relevant), exactly as `buildCatalogFilter` does, rather than from flag priority. Apply the same fix to `/similar/:id`.

---
### **F-05 — Migration 0008 cannot detect an unmigrated vendor, and `verify()` reports OK anyway**
- **Severity:** HIGH
- **Category:** Migration correctness / Idempotency
- **File:** [backend/src/migrations/0008_vendor_channels.js:49-59, 103-117](DwellMart/backend/src/migrations/0008_vendor_channels.js#L49-L59)
- **Evidence:** Both the selection filter and `verify()` test only `$exists`:
  ```js
  $or: [ {channelsRevision: {$exists:false}},
         {'channels.retail.status': {$exists:false}}, … ]
  ```
  Once `Vendor.model.js` is deployed, Mongoose writes `channels.{retail,wholesale,quickCommerce} = {status:'disabled'}` and `channelsRevision = 0` as **defaults on every save**. Such a vendor satisfies none of the conditions and is skipped; `verify()` then finds `missing=0, invalid=0` and reports success.
  **Proof from the live database:**
  ```
  4 vendors with channelsRevision=0, all three channels 'disabled', status='approved', isActive=true
    6a7d77792c47fbe99fae7da7  created 2026-08-13T07:51:21Z
    6a7d777a2c47fbe99fae7dc1  created 2026-08-13T07:51:22Z
    6a7d7e1a2507d88c4d7792b6  created 2026-08-13T08:19:38Z
    6a7d7e1b2507d88c4d7792ce  created 2026-08-13T08:19:39Z
  migration 0008 applied at  2026-08-13T12:16:47Z   ← ran AFTER all four, touched none
  migration verify() result  : missing=0; invalid=0  (reports OK)
  ```
- **Current blast radius:** all four are unverified seeded test fixtures. `Vendor.countDocuments({status:'approved', isVerified:true, no channel active}) = 0` — **no real vendor is presently locked out.** The defect is live, not currently causing harm.
- **Business impact:** Any vendor written between a schema deploy and the migration step is left with zero channels: they can log in, then receive `403 NO_ACTIVE_CHANNEL` on every workspace-scoped route, and the migration reports success. A re-run does not repair them.
- **Recommended action:** Select on semantic emptiness (`channelsRevision: 0` **or** no channel in a non-`disabled` state, joined with a legacy signal) rather than `$exists`. Strengthen `verify()` to assert that every `approved`+`isActive` vendor holds at least one non-`disabled` channel. Then re-run.

---
### **F-06 — `orderType` and `fulfillmentType` are not reconciled, breaking order actions per workspace**
- **Severity:** HIGH
- **Category:** Data consistency / Correctness
- **Files:** [vendor/order.controller.js:73-75 vs 166-170](DwellMart/backend/src/modules/vendor/controllers/order.controller.js#L166-L170)
- **Evidence:** Listing matches on **either** field; the status-update gate uses **`orderType` alone**. Live order distribution:
  ```
  orderType=retail    fulfillmentType=retail          219
  orderType=retail    fulfillmentType=quick_commerce   54
  orderType=retail    fulfillmentType=wholesale        31
  orderType=retail    fulfillmentType=null/missing     14
  orderType=wholesale fulfillmentType=wholesale         3
  (both missing)                                       32
  ```
- **Reproduction:**
  (a) Vendor opens the **Wholesale** workspace → one of the 31 wholesale-fulfilled orders is listed → clicking any status action returns `403 "This order belongs to a different workspace."`
  (b) Vendor opens the **Retail** workspace → one of the 54 QC-fulfilled orders is listed (because `orderType==='retail'`) → the check at line 172 does not fire → the **retail** state machine is applied to a Quick Commerce order.
- **Business impact:** 85 of 353 existing orders (24%) are either unactionable in the workspace that lists them or actionable through the wrong lifecycle. Channel-scoped analytics that key off `orderType` under-report wholesale and QC.
- **Recommended action:** Make `fulfillmentType` the single channel discriminator for vendor-facing order scoping (with `orderType` as fallback only when absent), align listing and mutation on the identical predicate, and add a data migration to backfill `orderType` from `fulfillmentType` for the 85 mismatched records plus the 32 with neither.

---

## 24. Medium Risk Defects

---
### **F-04 — A search term destroys the Quick Commerce category filter**
- **Severity:** MEDIUM
- **Category:** Correctness
- **File:** [public.routes.js:339-346](DwellMart/backend/src/routes/public.routes.js#L339-L346)
- **Evidence:** `buildCatalogFilter` expresses the QC category constraint as `$or: [{quickCommerceCategoryId}, {categoryId}]`. `listProducts` then executes `filter.$or = [{name: rx}, {tags: rx}]`, replacing it. **Confirmed live:**
  ```
  QC list, category=6a66ea8ffc5779ab97dad5d5 (Medical Devices)             -> 0 items
  QC list, category=6a66ea8ffc5779ab97dad5d5 & search=a                    -> 5 items
  ```
  The same overwrite pattern affects any marketplace request combining `search` with a filter that uses `$or`.
- **Business impact:** Searching inside a Quick Commerce category silently returns products from every other category. Customers cannot trust in-category search.
- **Recommended action:** Compose with `$and: [...]` instead of assigning `$or`, or build the search clause through `buildCatalogFilter` so there is one owner of the filter shape.

---
### **F-04b — The wholesale feature-flag kill switch can be cancelled by an active sale**
- **Severity:** MEDIUM (conditional)
- **Category:** Feature-flag bypass
- **File:** [public.routes.js:316-320 vs 348-351](DwellMart/backend/src/routes/public.routes.js#L348-L351)
- **Evidence:** When `wholesaleMarketplaceEnabled` is off and the caller requests wholesale, the code sets a kill switch `filter._id = {$in: []}`. Thirty lines later it unconditionally executes `filter._id = {$nin: activeSaleProductIds}` whenever any sale is active, **replacing** the kill switch. Verified statically:
  ```
  buildCatalogFilter(marketplace, wholesaleOFF, wholesale requested)
    = {"isActive":true,"_id":{"$in":[]},"wholesaleEnabled":true}
  public.routes.js:349 then executes: filter._id = { $nin: activeSaleProductIds }
  campaigns collection docs = 4
  ```
  Not reproducible at runtime today because `wholesaleMarketplaceEnabled` is currently `true` in the live settings.
- **Business impact:** Turning wholesale off platform-wide does not reliably hide wholesale listings; the outcome depends on whether a sale campaign happens to be running.
- **Recommended action:** Merge `_id` constraints (`$and`) rather than assigning; add a regression test that toggles the flag with an active campaign present.

---
### **F-07 — Business Overview overwrites channel buckets and counts cancelled revenue**
- **Severity:** MEDIUM
- **Category:** Analytics correctness
- **File:** [businessOverview.controller.js:25-33](DwellMart/backend/src/modules/vendor/controllers/businessOverview.controller.js#L25-L33)
- **Evidence:** (a) `channels[channel] = { … }` assigns; two `$group` keys that both map to the `retail` bucket (any unrecognised value falls back to `'retail'` at line 26) silently discard the first. (b) The aggregation has no `createdAt` range and no `status: {$nin: ['cancelled','returned']}` filter, whereas `analytics/overview` excludes both — so the two vendor-facing analytics surfaces report different revenue for the same account.
- **Business impact:** Vendors see inflated, internally inconsistent cross-channel revenue on the one screen designed to give them a unified view.
- **Recommended action:** Accumulate (`+=`) instead of assigning; add the cancelled/returned exclusion and an optional period filter matching `analytics/overview`.

---
### **F-08 — Cart validation does not check the Quick Commerce feature flag**
- **Severity:** MEDIUM
- **Category:** Feature-flag enforcement
- **File:** [CartValidationPipeline.js:104-163](DwellMart/backend/src/services/checkout/CartValidationPipeline.js#L104-L163)
- **Evidence:** `isWholesaleMarketplaceEnabled()` is awaited and enforced (line 161). `isQuickCommerceEnabled()` is never called in this file. Grep across `src/` confirms QC-flag enforcement exists in `placeOrder`, `quickCommerce.routes`, `public.routes`, and the admin/vendor channel endpoints — but not in the pipeline used by `/checkout/confirm`.
- **Business impact:** Disabling Quick Commerce platform-wide does not block QC checkout through the session/confirm path that the customer UI actually uses.
- **Recommended action:** Add the QC flag check alongside the wholesale one, symmetric in shape.

---
### **F-09 — Editing a product silently re-publishes it to the current workspace**
- **Severity:** MEDIUM
- **Category:** Correctness / Least surprise
- **File:** [vendor/product.controller.js:372](DwellMart/backend/src/modules/vendor/controllers/product.controller.js#L372)
- **Evidence:** `req.body[currentFlag] = true;` is executed on every `PUT /vendor/products/:id`, before the merge, regardless of whether the request touches channel state. The comment acknowledges it (*"Saving an existing shared core from a target workspace publishes it there"*).
- **Reproduction:** Unpublish a product from the Retail workspace, then edit its description from the Retail workspace. It reappears in the retail catalogue. Also: a wholesale-only product edited from the Retail workspace becomes retail-published.
- **Business impact:** Deliberate unpublishing is undone by an unrelated edit; a wholesale-only SKU can leak onto the retail storefront with retail pricing.
- **Recommended action:** Only set the flag when the request explicitly asks to publish, or require the dedicated `PATCH /products/:id/channels/:channel` endpoint for all publication changes.

---
### **F-10 — Migration 0008 destructively rewrites `vendorType` for 23 vendors with no rollback**
- **Severity:** MEDIUM
- **Category:** Data loss
- **File:** [0008_vendor_channels.js:31, 78](DwellMart/backend/src/migrations/0008_vendor_channels.js#L78)
- **Evidence:** `update: { $set: { vendorType: canonicalType, … } }`. Ledger result: `invalidTypeDefaultedToRetail: 23`. The migration has no `down()`. The prior values are not written to any audit trail.
- **Business impact:** 23 vendors' original business classification is unrecoverable. If any of them were wholesale or Quick Commerce under a legacy label, `sellingChannels` was the only surviving signal — and if that was also absent, they were granted **retail** by default.
- **Recommended action:** Retain a `legacyVendorTypeBeforeMigration` field on future migrations of this kind. Manually review the 23 affected vendors against the `db_dump.archive` snapshot to confirm no channel intent was lost.

---
### **F-11 — Vendor channel endpoints bypass the state machine (`disabled` is documented as terminal)**
- **Severity:** MEDIUM
- **Category:** State-machine integrity
- **File:** [vendor/auth.controller.js:796-816](DwellMart/backend/src/modules/vendor/controllers/auth.controller.js#L796-L816)
- **Evidence:** `VENDOR_CHANNEL_STATUS_TRANSITIONS.disabled = []` — no transition out of `disabled` is legal, and `updateVendorChannelStatus` enforces this with `canTransitionVendorChannel`. `applyForChannel` blocks only `['active','paused','requested']`, so a channel an admin explicitly **disabled** can be moved to `requested` by the vendor. `canTransitionVendorChannel` is never called on this path.
- **Business impact:** An administrative disable is not durable; the vendor can immediately re-queue the channel. If re-application after a disable is intended business behaviour, then the constant is wrong and the admin UI (which offers no path out of `disabled`) is misleading.
- **Recommended action:** Decide the intended semantics, then make the constant, the admin endpoint, the vendor endpoint, and the admin UI agree. Route all four through `canTransitionVendorChannel`.

---
### **F-11b — The legacy `PUT /vendor/auth/selling-channels` endpoint is a second, less-guarded write path into `channels`**
- **Severity:** MEDIUM
- **Category:** Attack surface / Dead code
- **File:** [vendor.routes.js:111](DwellMart/backend/src/modules/vendor/routes/vendor.routes.js#L111) → [auth.controller.js:716-783](DwellMart/backend/src/modules/vendor/controllers/auth.controller.js#L716-L783)
- **Evidence:** The frontend store method that called it is now a `console.warn` no-op stub explicitly marked deprecated, yet the route is live. It writes `vendor.channels[path].status = 'requested'` and increments `channelsRevision` with the same state-machine bypass as F-11, plus a read-modify-write on `channelsRevision` with no `expectedRevision` guard.
- **Business impact:** Two divergent code paths mutate canonical authorization state; the deprecated one receives less review and no test coverage.
- **Recommended action:** Remove the route and the controller, or reimplement it as a thin wrapper over `applyForChannel`/`withdrawChannelRequest`.

---
### **F-12 — Initial account approval activates channels without validating the transition**
- **Severity:** MEDIUM
- **Category:** State-machine integrity
- **File:** [admin/vendor.controller.js:169-182](DwellMart/backend/src/modules/admin/controllers/vendor.controller.js#L169-L182)
- **Evidence:** `updateVendorStatus` with `status: 'approved'` writes `status: 'active'` directly into each selected channel. It never calls `canTransitionVendorChannel`, so `disabled → active` and `rejected → active` both succeed here while the dedicated channel endpoint rejects them with 409. It also does not require that the channel was ever `requested`.
- **Business impact:** An admin can grant a channel the vendor never applied for, and can resurrect a rejected or disabled channel through the account-approval screen — the exact transitions the per-channel endpoint is written to prevent.
- **Recommended action:** Route the approval loop through the same transition validator and reject channels not in `requested`.

---
### **F-13 — Approval is all-or-nothing; un-approved requested channels are left dangling**
- **Severity:** MEDIUM
- **Category:** Missing functionality / Workflow
- **Files:** [VendorDetail.jsx:163-172](DwellMart/frontend/src/modules/Admin/pages/vendors/VendorDetail.jsx#L163-L172), [admin/vendor.controller.js:155-195](DwellMart/backend/src/modules/admin/controllers/vendor.controller.js#L155-L195)
- **Evidence:** The UI sends **every** channel currently in `requested` state — there is no per-channel checkbox at approval time. Server-side, when `status === 'approved'`, channels **not** in `selected` are simply not written: a vendor who applied for retail+wholesale and is approved for retail only keeps `wholesale: requested` indefinitely, with no rejection, no reason, and no notification. Only `status === 'rejected'` (whole-account rejection) converts `requested → rejected`.
- **Business impact:** Partial approval — the central promise of per-channel approval — is unavailable in the admin UI, and partial approval via the API leaves an orphaned request that appears "pending" to the vendor forever.
- **Recommended action:** Add per-channel selection to the approval dialog, and on approval explicitly reject (with reason) any `requested` channel not selected.

---
### **F-14 — The Quick Commerce admin toggle omits `expectedRevision`**
- **Severity:** MEDIUM
- **Category:** Concurrency
- **File:** [VendorDetail.jsx:196-215](DwellMart/frontend/src/modules/Admin/pages/vendors/VendorDetail.jsx#L196-L215)
- **Evidence:** `updateVendorQuickCommerce(vendor.id, { enabled: nextEnabled })` — no `expectedRevision`. The backend guard is `if (expectedRevision !== undefined && …)`, so omitting it **skips the concurrency check entirely**. `handleChannelStatus` on the same page does send it.
- **Business impact:** Two admins editing the same vendor concurrently can silently clobber each other's channel decision through this one control.
- **Recommended action:** Send `expectedRevision: vendor.channelsRevision`, and consider making the parameter mandatory server-side for all channel-mutating endpoints.

---
### **F-15 — Quick Commerce can be requested and activated with no operating profile**
- **Severity:** MEDIUM
- **Category:** Missing validation
- **Files:** [auth.controller.js:212-218](DwellMart/backend/src/modules/vendor/controllers/auth.controller.js#L212-L218), [auth.controller.js:806-808](DwellMart/backend/src/modules/vendor/controllers/auth.controller.js#L806-L808), [admin/vendor.controller.js:265-267](DwellMart/backend/src/modules/admin/controllers/vendor.controller.js#L265-L267), [SellingChannels.jsx](DwellMart/frontend/src/modules/Vendor/pages/SellingChannels.jsx)
- **Evidence:** Wholesale requires five profile fields at registration, at application, and again at activation. Quick Commerce requires **only the platform feature flag** at all three points. No geo-point, service radius, preparation time, or business hours is collected or validated. The `SellingChannels` page renders profile inputs for wholesale only.
- **Business impact:** A QC channel can be activated for a store with no location. Checkout then fails at the last step with `VENDOR_LOCATION_MISSING` / `"is not set up for Quick Commerce delivery yet"` — the correct guard, but far too late. The vendor's channel shows `active` while being structurally unable to trade.
- **Recommended action:** Require a minimum QC profile (location point, service radius, preparation time) before `quick_commerce` may transition to `active`, mirroring the wholesale profile gate, and collect it in the application form.

---
### **F-16 — Channel state is refreshed once per layout mount**
- **Severity:** MEDIUM
- **Category:** UX / Staleness
- **File:** [VendorLayout.jsx:56-61](DwellMart/frontend/src/modules/Vendor/components/Layout/VendorLayout.jsx#L56-L61)
- **Evidence:** `profileRefreshed` is a `useRef` guard, so `refreshProfile()` runs exactly once per mount. Zustand `persist` keeps `vendor.activeWorkspaces` in `localStorage` across sessions.
- **Business impact:** When an admin pauses, disables, or approves a channel, the vendor's picker, switcher, and sidebar keep showing the old set until a full reload. Not a security issue — the server rejects the stale choice — but the vendor sees a workspace that immediately errors, with a raw toast rather than an explanation.
- **Recommended action:** Refresh on window focus or poll `/vendor/auth/channels` on a modest interval, and map `NO_ACTIVE_CHANNEL` / `CHANNEL_ACCESS_DENIED` responses to an automatic refresh plus a redirect to the picker.

---
### **F-17 — A vendor with zero active channels gets raw 403 errors on every page**
- **Severity:** MEDIUM
- **Category:** UX / Error handling
- **Files:** [vendorChannel.js:38](DwellMart/backend/src/middlewares/vendorChannel.js#L38), [WorkspacePicker.jsx:46](DwellMart/frontend/src/modules/Vendor/pages/WorkspacePicker.jsx#L46)
- **Evidence:** Login has **no** channel precondition — an approved vendor with all channels `disabled` authenticates successfully, then receives `403 NO_ACTIVE_CHANNEL` from every workspace-scoped route. The picker has a friendly empty state, but the layout only redirects there when `activeWorkspaces.length !== 1`; direct navigation to any other vendor URL produces an unexplained error toast.
- **Business impact:** The four `channelsRevision: 0` vendors in the live database are exactly this shape today (currently harmless, since they are unverified fixtures). Any vendor whose last channel is disabled lands in the same state.
- **Recommended action:** Surface a dedicated "no active channel" screen with a link to Selling Channels, and treat `NO_ACTIVE_CHANNEL` as a first-class client state rather than a generic error.

---
### **F-21 — Public vendor visibility is filtered by a hardcoded name blocklist**
- **Severity:** MEDIUM
- **Category:** Hardcoded business logic
- **File:** [public.routes.js:735](DwellMart/backend/src/routes/public.routes.js#L735)
- **Evidence:**
  ```js
  const PUBLIC_TEST_VENDOR_REGEX =
    /test|sptest|qwerty|qa\s|audit|seeded|demo|dummy|sample|free\s*vendor|^sk\s*store|^sagar\s*store/i;
  ```
  Applied to both `storeName` and `name` on `/api/vendors`, `/api/vendors/all`, and `/api/vendors/best-sellers`.
- **Business impact:** Test-data suppression is encoded as a name pattern in production source. Two entries (`^sk store`, `^sagar store`) name what appear to be real stores. Any legitimate vendor whose name contains "demo", "sample", "audit", or "test" is invisible on the public store directory with no diagnostic.
- **Recommended action:** Replace with an explicit `isTestAccount` boolean on the vendor document, backfilled once, and delete the regex.

---

## 25. Low Risk Findings

| ID | Severity | Finding | File | Impact | Action |
|---|---|---|---|---|---|
| **F-18** | LOW | `stock.service.js` exports a non-atomic `validateAndDeductStock` (read-modify-write `product.save()`) with **zero call sites** — an oversell race preserved in the tree | `backend/src/services/stock.service.js` | A future caller reintroduces overselling | Delete, or replace the body with the atomic conditional `$inc` |
| **F-19** | LOW | `hybridVendors` counter name survives in admin analytics despite "no hybrid vendor type" | `admin/analytics.controller.js:~372` | Terminology drift; risks reintroducing the concept | Rename to `retailAndWholesaleVendors` |
| **F-20** | LOW→HIGH (process) | Channel test suite is 14 pure unit tests over 4 modules; no HTTP, DB, controller, catalog, cart, checkout, or order coverage. No frontend test tooling exists at all | `backend/tests/unit/`, `frontend/package.json` | Every defect in this report is in the uncovered surface | See §30 |
| **F-22** | LOW | `isDeleted: {$ne: true}` applied to `Vendor`, which has no `isDeleted` field — the condition matches every document | `public.routes.js:743,799` | Misleading; reviewers assume soft-delete filtering exists | Remove, or add the field |
| **F-23** | LOW | `VENDOR_CHANNEL_AUTHORITY_MODE=legacy` disables canonical channel authorization across 5 call sites via one env var; unset in `.env` (safe default) | `vendorChannel.service.js` + 4 consumers | A single misconfiguration reverts authorization to `vendorType`/`sellingChannels` | Add a boot-time warning when not `channels`; plan removal after the cutover window |
| **F-24** | LOW | `GET /api/products/flash-sale` (a plausible client URL) resolves to `/products/:id` and throws an unhandled-looking `CastError` stack before returning 404 | `public.routes.js:601` | Log noise; leaks internal query shape into logs | Validate the `:id` param as an ObjectId before querying |
| **F-25** | LOW | `SellingChannels` `apply()`/`withdraw()` have no `.catch`; failures rely on the global interceptor toast and leave `busy` state via `finally` | `SellingChannels.jsx:15-25` | Ambiguous error feedback on a state-changing action | Add explicit error handling |
| **F-26** | LOW | Live secrets present in the working tree: Atlas URI with credentials, Cloudinary, Firebase, SMTP | `backend/.env`, `frontend/.env` | Credential exposure if the tree is shared or committed | Rotate; verify `.gitignore` coverage; move to a secret manager |
| **F-27** | LOW | Unoptimised catalogue image assets shipped in the bundle (14.8 MB, 13.2 MB, 10.2 MB PNGs) | `frontend/src/assets` | Poor mobile load times | Compress / convert to WebP / serve from CDN |
| **F-28** | LOW | `RequireVendorType.jsx` and `RequireCapability.jsx` coexist with the workspace model | `frontend/src/modules/Vendor/components/` | Two guard mechanisms; drift risk | Confirm which is authoritative, remove the other |

---

## 26. Missing Functionality

1. **Per-channel selection at initial account approval** (F-13) — the admin cannot approve a subset of requested channels from the UI.
2. **Explicit rejection of un-approved requested channels** (F-13) — they remain `requested` with no reason and no notification.
3. **Quick Commerce operating-profile capture and validation** (F-15) — no equivalent of the wholesale profile gate at any of the three enforcement points.
4. **Quick Commerce feature-flag enforcement in the primary checkout pipeline** (F-08).
5. **Retail/wholesale channel enforcement on the legacy order endpoint** (F-02).
6. **Channel authorization on five public catalog endpoints** (F-02b).
7. **Automated coverage for the entire channel-aware request path** (F-20) — no integration, contract, or E2E test exercises workspace behaviour through HTTP.
8. **Any frontend test tooling** — no runner, no tests, no CI gate on the UI.
9. **A `down()` / rollback for migration 0008** (F-10).
10. **A first-class "no active channel" vendor state** in the UI (F-17).

---

## 27. Partial Implementations

| Area | What works | What is incomplete |
|---|---|---|
| Per-channel admin approval | Dedicated per-channel endpoint with full guards, audit log, notification, optimistic concurrency | Initial approval is all-or-nothing and skips transition validation (F-12, F-13) |
| Channel state machine | Constant, admin endpoint, and admin UI agree | Vendor-facing endpoints bypass it entirely (F-11, F-11b) |
| Catalog channel visibility | `buildCatalogFilter` + eligible-vendor pre-resolution is correct and leak-free on `/api/products` | Five endpoints bypass it (F-02b); detail-page resolution uses flag priority (F-03); `$or` composition is fragile (F-04) |
| Checkout channel enforcement | `CartValidationPipeline` is thorough and server-authoritative | Missing the QC feature flag (F-08); a parallel unguarded route exists (F-02) |
| Multi-channel product model | Single document, independent flags, preserved per-channel config, optimistic concurrency | Create/update blocked on 2 of 3 channels (F-01); edit force-republishes (F-09) |
| Order channel attribution | Workspace scoping is enforced server-side and vendor isolation is solid | `orderType`/`fulfillmentType` never reconciled (F-06) |
| Migration 0008 | Correct transformation logic, verified by 7 unit tests, applied and recorded in the ledger | Selection guard cannot detect unmigrated vendors; `verify()` gives false assurance (F-05); destructive `vendorType` rewrite (F-10) |
| Vendor UI channel awareness | URL-backed workspace, picker, switcher, capability-driven menu, cache isolation on switch | Channel state refreshed once per mount (F-16); zero-channel state unhandled (F-17) |
| Analytics | Vendor and admin analytics both read canonical channel state; no client-side security filtering | Business Overview overwrites buckets and includes cancelled revenue (F-07) |

---

## 28. Production Blockers

Must be resolved before release:

| # | ID | Blocker |
|---|---|---|
| 1 | **F-01** | Wholesale and Quick Commerce vendors cannot create or edit products (HTTP 400). Two of three channels are non-operational. |
| 2 | **F-02** | `POST /api/user/orders` accepts orders for paused/disabled retail and wholesale channels. Channel pause is not enforceable. |
| 3 | **F-02b** | Five public catalog endpoints expose products from ineligible vendors and channels to unauthenticated users (measured: 60/100 on `/new-arrivals`). |
| 4 | **F-03** | Multi-channel products are listed but 404 on their detail page. 48 products in the live catalogue are at risk. |
| 5 | **F-05** | Migration 0008 cannot detect an unmigrated vendor and `verify()` reports success regardless. Must be corrected and re-run before any further vendor onboarding. |
| 6 | **F-06** | 24% of existing orders are unactionable in the workspace that lists them, or actionable through the wrong lifecycle. |
| 7 | **F-20** | No integration, contract, or E2E coverage of the channel-aware request path, and no frontend test tooling. The green suite does not constitute release evidence. |

---

## 29. Accepted Risks

Risks that may reasonably be carried into staging **if consciously accepted and documented**:

1. **`VENDOR_CHANNEL_AUTHORITY_MODE` rollback switch (F-23)** — a deliberate, consistently implemented cutover control. Safe while unset. Accept for the migration window; remove afterwards.
2. **Unbounded eligible-vendor `$in` pre-resolution (§17)** — correct and fast at 74 vendors. Accept for launch; revisit before ~1,000 vendors.
3. **`vendorType` retained as a legacy label** — grants nothing in canonical mode (verified across all 38 references). Accept as compatibility surface.
4. **`sellingChannels` retained as a projection** — machine-written from canonical state on every save. Accept.
5. **No multi-channel vendors in production yet** — every live vendor holds exactly one active channel, so the multi-channel defects have had no production exposure to date. This is a reason the defects are still cheap to fix, **not** a reason to ship them.
6. **Migration 0008's 23 rewritten `vendorType` values (F-10)** — acceptable only after manual reconciliation against `db_dump.archive` confirms no channel intent was lost.

---

## 30. Recommended Next Actions

**Priority 1 — unblock the release (est. 1–2 days)**
1. Fix **F-01**: invert `PRODUCT_FIELD_STRICT` to match its own documentation, then reconcile the three `allowedProductFields` lists with the real `ProductForm` payload. Add a test asserting the guard against the actual UI payload for all three workspaces.
2. Fix **F-02**: call `assertCartValid` from `placeOrder`, or retire the legacy route and `orderStore.createOrder`.
3. Fix **F-02b**: route `/flash-sale`, `/popular`, `/new-arrivals`, `/vendors/:id`, `/vendors/:id/products` through `buildCatalogFilter` with eligible-vendor pre-resolution; delete the unfiltered `new-arrivals` fallback.
4. Fix **F-03**: resolve product-detail and `/similar/:id` channel eligibility from the requested experience, not from flag priority.

**Priority 2 — data and correctness (est. 2–3 days)**
5. Fix **F-05** and re-run migration 0008 with a semantic selection filter and a strengthened `verify()`; confirm the 4 `channelsRevision: 0` vendors are repaired or removed.
6. Fix **F-06**: choose `fulfillmentType` as the single discriminator, align listing and mutation predicates, and backfill the 85 mismatched + 32 empty orders.
7. Fix **F-04** and **F-04b**: compose Mongo filters with `$and` instead of assigning `$or` / `_id`.
8. Fix **F-08** (QC feature flag in the cart pipeline) and **F-07** (Business Overview accumulation, cancelled-order exclusion).

**Priority 3 — workflow completeness (est. 3–4 days)**
9. Fix **F-11**, **F-11b**, **F-12**: make the constant, both admin paths, both vendor paths, and the admin UI agree on the state machine; route everything through `canTransitionVendorChannel`.
10. Fix **F-13**: per-channel selection at approval, with explicit rejection + reason + notification for un-selected requested channels.
11. Fix **F-15**: require and collect a minimum Quick Commerce operating profile before activation.
12. Fix **F-09**, **F-14**, **F-16**, **F-17**.

**Priority 4 — make the result provable (est. 3–5 days) — do not skip**
13. Provision an **isolated test database** and unblock `npm run test:gate`, the contract suite, and migration tests in CI. This is the single highest-leverage action in this report: it converts every fix above from "believed correct" into "demonstrated correct".
14. Write integration tests covering the **full 7-combination matrix** through HTTP: registration → approval → login → workspace → product → catalog → cart → checkout → order.
15. Add frontend test tooling (Vitest + Testing Library) and cover `useVendorWorkspace`, `WorkspacePicker`, `VendorLayout` redirect logic, and the workspace-switch cache reset.
16. Add a conformance test asserting that **every** public catalog endpoint enforces the four-condition visibility rule — the guard that would have caught F-02b.

**Priority 5 — hygiene**
17. F-18, F-19, F-21, F-22, F-24, F-25, F-26 (rotate secrets), F-27, F-28.

---

## Final Scores

| Dimension | Score | Justification |
|---|---:|---|
| **Architecture** | **8.5 / 10** | Canonical channel model, clean separation of authorization from publishing state, single shared catalog filter builder, a genuine cutover switch. Loses points for two parallel order paths with different rules and two parallel channel-mutation paths with different guards. |
| **UI** | **7.0 / 10** | URL-backed workspace, picker, switcher, paused badges, capability-driven menu, cache isolation on switch — all present and correct. Loses points for once-per-mount channel refresh, unhandled zero-channel state, and approval UI without per-channel selection. |
| **Frontend** | **6.5 / 10** | Build passes; workspace plumbing is correct and tab-safe; the client never holds authorization. Loses points for the total absence of test tooling and for still calling the legacy order endpoint. |
| **Backend** | **5.5 / 10** | Middleware, services, and vendor-facing controllers are strong. Dragged down by a critical guard inversion, an unguarded legacy order route, five unguarded catalog endpoints, and filter-composition bugs proven at runtime. |
| **Database** | **7.0 / 10** | Correct canonical schema, all channel indexes live, shared-inventory V1 clean, migration applied and recorded. Loses points for the migration coverage gap, the destructive `vendorType` rewrite, and unreconciled `orderType`/`fulfillmentType`. |
| **Security** | **7.5 / 10** | The vendor workspace boundary is excellent — 14/14 tampering attempts blocked at runtime, per-request DB revalidation closes the stale-token window, vendor isolation is enforced twice. Loses points for the F-02 authorization bypass, the F-02b unauthenticated data leakage, and live secrets in the tree. |
| **Performance** | **7.5 / 10** | No N+1 on any hot path, batch fetches with projections everywhere, correct compound indexes, atomic stock operations. Loses points for the unbounded vendor `$in` pre-resolution, the 4-query `new-arrivals` path, unverified cache-key isolation, and multi-MB image assets. |
| **Testing** | **3.5 / 10** | 463 assertions genuinely executed and green — but they cover pure functions, not the channel-aware request path. Integration tests are blocked by design, frontend tests do not exist, and every defect in this report sits in the untested surface. |
| **Maintainability** | **7.5 / 10** | Zero TODO/FIXME, enforced source hygiene, 45/45 permission tokens route-enforced, genuinely explanatory comments, one shared filter builder, one channel constants module. Loses points for duplicated authorization logic across parallel paths and for dead code that looks live. |
| **OVERALL** | **60 / 100** | Sound architecture and an excellent authorization core, undermined by a critical workflow blocker on two channels, unauthenticated catalog leakage, and the absence of any test coverage that would have caught either. |

---

## FINAL VERDICT

# NOT READY

**Rationale.** The Multi-Channel Vendor Architecture is genuinely built, not merely scaffolded. Its authorization core is the strongest part of the system and passed every attack this audit could construct at runtime. But three of its seven supported vendor configurations cannot complete the basic product workflow (F-01), the channel-pause guarantee is unenforced on a live order endpoint (F-02), five public endpoints serve ineligible products to anonymous users (F-02b, measured at 60 of 100 results on one of them), listed products return 404 (F-03), and a quarter of existing orders are mis-scoped (F-06). None of this was caught because the automated suite — although 463 assertions strong and entirely green — does not execute a single channel-aware HTTP request.

The defects are concentrated, individually well-understood, and none demands architectural change. Priorities 1–2 of §30 are realistically 3–5 days of work. **Once those are complete *and* an isolated database exists so the integration and contract suites actually run, this system is a credible candidate for READY FOR STAGING.**

---

### Audit integrity statement

No source file was modified. No defect was fixed. No database record was created, updated, or deleted. No migration was executed. No test result in §19 is reported unless the command was run and its output observed; every suite that could not run is marked **BLOCKED** with the reason. Migration 0008 is reported as applied **because the `schemamigrations` collection was read directly**, not because a prior report said so. Findings are labelled **CONFIRMED (runtime)**, **CONFIRMED (code+data)**, or **UNVERIFIED** according to the evidence actually obtained.

*Report generated 2026-08-13.*
