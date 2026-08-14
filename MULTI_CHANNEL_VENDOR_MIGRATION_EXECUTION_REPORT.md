# DwellMart Multi-Channel Vendor Migration — Execution Report

Date: 2026-08-13  
Architecture: one vendor identity, one subscription, independently approved Retail, Wholesale, and Quick Commerce channels  
Implementation state: code complete; production release gate blocked only on an isolated integration database, production credential rotation, and controlled migration execution

## Executive result

The application now treats `Vendor.channels` as the operational authority. `vendorType` remains a legacy classification and `sellingChannels` remains a derived compatibility projection. Workspace selection is URL-backed and every protected API verifies the selected channel against server-loaded vendor state.

Implemented combinations:

- Retail only
- Wholesale only
- Quick Commerce only
- Retail + Wholesale
- Retail + Quick Commerce
- Wholesale + Quick Commerce
- Retail + Wholesale + Quick Commerce

The implementation is additive. It does not create a `hybrid` type, duplicate route trees, split subscriptions, or channel-specific inventory pools.

## PHASE 0 ANALYSIS REPORT — Architecture validation

### Current state and findings

| Item | Expected | Actual before implementation | Status |
|---|---|---|---|
| Vendor identity | One account | One vendor account, wallet, bank profile and subscription already existed | ALREADY IMPLEMENTED |
| Multi-select registration | Preserve all requested channels | Request accepted multiple selections, while `vendorType` and its save hook collapsed authority to one channel | VALID |
| Channel authorization | Server-owned per-channel state | `vendorType`/`sellingChannels` were used inconsistently by routes, checkout, catalog and UI | VALID |
| Workspace UI | Shared shell, channel context | One route tree existed; UI derived most capabilities from `vendorType` | PARTIALLY VALID |
| Products | Shared record and inventory | One Product already had shared stock plus three publication flags and wholesale/QC extensions | PARTIALLY VALID |
| Orders | Channel-scoped views | Orders already carried `orderType`, `experience`, `fulfillmentType` and vendor slices | PARTIALLY VALID |
| Subscription | Vendor-level | Existing subscription was vendor-level | ALREADY IMPLEMENTED |
| Business overview | Read-only cross-channel report | No vendor overview endpoint/page existed | VALID |
| Migration system | Ordered, verifiable migration | Migration ledger/runner already existed | ALREADY IMPLEMENTED |

Files audited included Vendor, Product, Order and subscription models; vendor/admin/user controllers and routes; checkout, pricing, QC and bulk-import services; vendor/admin React routes, stores, layouts and forms; migration runner; security and conformance tests.

Impacts identified:

- Frontend: workspace selection, shell navigation, product forms, settings, dashboards and admin approval screens.
- Backend/API: authentication context, route middleware, catalog discovery, checkout, orders, analytics and admin governance.
- Database: additive channel subdocuments, revision counter, channel indexes and audit-log target.
- Security: client workspace, local storage, `vendorType`, and compatibility projections could not be trusted.
- Migration: the old projection hook could overwrite hybrid state unless changed only after backfill/cutover support was present.

### PHASE 0 IMPLEMENTATION

- Produced a dependency map from registration through admin approval, catalog, checkout, orders and vendor operations.
- Preserved the shared vendor route tree and vendor-level subscription.
- Selected query/header workspace propagation with server-side validation.
- Confirmed shared inventory and one-product-record architecture were compatible with the existing model.

### PHASE 0 TEST REPORT

- Baseline full integration runner was not deterministic because it depends on a running server, seeded identities and a mutable database.
- Existing database-free security suite established a safe regression baseline.
- Frontend baseline build was successful.

### PHASE 0 FINAL VERIFICATION REPORT

Acceptance criteria met: architecture matched the approved source of truth; incompatible assumptions were rejected; no code was based solely on the roadmap.

Effort: 2–3 engineer-days. Risk: high. Dependencies: none. Rollback: analysis-only.

PHASE 0 STATUS: COMPLETE

## PHASE 1 ANALYSIS REPORT — Canonical channel domain and schema

| Item | Expected | Actual | Status |
|---|---|---|---|
| Channel state model | Five canonical statuses with audit metadata | Absent | VALID |
| Legacy fields | Retain but remove authority | Required broadly by existing consumers | VALID |
| Indexes | Additive channel queries | Only legacy/QC indexes existed | VALID |
| Subscription | Remain account-level | Already account-level | ALREADY IMPLEMENTED |

### PHASE 1 IMPLEMENTATION

Backend files:

- `backend/src/constants/vendorChannels.js`
- `backend/src/services/vendorChannel.service.js`
- `backend/src/models/Vendor.model.js`
- `backend/src/models/AdminActivityLog.model.js`

Implemented:

- `channels.retail`, `channels.wholesale`, and `channels.quickCommerce` with `requested`, `active`, `paused`, `rejected`, and `disabled` states.
- Request/review timestamps, reviewer, requester and reason metadata.
- `channelsRevision` for optimistic admin concurrency.
- Explicit safe transition graph.
- Additive single/compound channel indexes and vendor-target admin audit index.
- `sellingChannels` projection from canonical active states after cutover.
- `vendorType` retained as informational compatibility data.
- No subscription or channel billing changes.

Security: channel helpers distinguish readable (`active`, `paused`) from writable (`active`) access. Paused channels can finish existing work but cannot accept new writes.

Rollback: additive fields and indexes can remain. The previous binary can read the compatibility projection during a short rollback window.

### PHASE 1 TEST REPORT

- Channel normalization, readable/writable lists and transition rules are unit tested.
- Mongoose/JavaScript syntax validation passed.
- No destructive index synchronization is used.

### PHASE 1 FINAL VERIFICATION REPORT

Acceptance: one identity, canonical channel authority, no hybrid type, one subscription, additive schema and legal transitions.

Effort: 3–4 engineer-days. Risk: high. Dependencies: Phase 0.

PHASE 1 STATUS: COMPLETE

## PHASE 2 ANALYSIS REPORT — Migration and compatibility projection

| Item | Expected | Actual | Status |
|---|---|---|---|
| Backfill | Idempotent, additive | Migration framework existed, channel migration did not | VALID |
| Existing vendors | Preserve current authorized channel | Legacy `vendorType` represented the effective single authority | VALID |
| Verification | Missing/invalid state checks | Framework supported `verify()` | PARTIALLY VALID |
| Live migration | Run against controlled target | Current configured database is hosted and not an isolated test target | INVALID for local execution |

### PHASE 2 IMPLEMENTATION

Files:

- `backend/src/migrations/0008_vendor_channels.js`
- `backend/src/migrations/index.js`

Sequence implemented:

1. Select only documents without `channelsRevision`.
2. Normalize unknown legacy classifications to Retail and count them.
3. Map approved/suspended account classification to one active channel; pending to requested; rejected to rejected; deactivated to disabled.
4. Set other channels disabled.
5. Write the compatibility `sellingChannels` projection in the same bulk operation.
6. Process unordered batches of 500 with a second idempotency filter.
7. Create indexes additively with `createIndexes()`.
8. Verify every vendor has three allowed statuses and a revision.

No down migration deletes data. Rollback retains the additive fields and deploys the prior binary; database restoration is required only if an unrelated migration fails.

### PHASE 2 TEST REPORT

- Registration/registry/hook migration tests pass.
- Static migration verification passed.
- A live backfill was deliberately not run against the hosted configured database.

### PHASE 2 FINAL VERIFICATION REPORT

Code acceptance is met. Deployment checklist requires a database snapshot, `npm run migrate`, and `npm run migrate:verify` against the intended environment.

Effort: 2–3 engineer-days. Risk: high. Dependencies: Phase 1, production backup and release window.

PHASE 2 STATUS: COMPLETE (implementation); deployment execution deferred to release gate

## PHASE 3 ANALYSIS REPORT — Backend authorization and API design

| Item | Expected | Actual | Status |
|---|---|---|---|
| Workspace resolution | URL/context plus server validation | Missing | VALID |
| Channel middleware | Never trust client/vendorType | Missing | VALID |
| Applications | Vendor can request future channels | Only legacy selling-channel update existed | PARTIALLY VALID |
| Admin approval | Independent status transitions | Account/type approval only | VALID |
| Audit | Record governance changes | Vendor channel audit was absent | VALID |

### PHASE 3 IMPLEMENTATION

Files include:

- `backend/src/middlewares/authorize.js`
- `backend/src/middlewares/vendorChannel.js`
- vendor auth/controller/routes/validators
- admin vendor controller/routes/validators
- notification/event services

Authorization flow:

1. Authenticate the vendor token.
2. Reload account and canonical channels from MongoDB.
3. Resolve workspace from `?workspace=`, `X-Vendor-Workspace`, or controlled body fallback.
4. Auto-resolve only when exactly one channel is available.
5. Reject missing multi-channel workspace, unknown workspace, wrong-workspace endpoint and unapproved channel.
6. Enforce readable or writable state server-side.

New APIs:

- `GET /api/vendor/auth/channels`
- `POST /api/vendor/auth/channels/:channel/apply`
- `DELETE /api/vendor/auth/channels/:channel/request`
- `PATCH /api/admin/vendors/:id/channels/:channel/status`

Modified APIs:

- Vendor registration stores all selected channels as `requested`, never `active`.
- Login/profile returns `channels`, `activeWorkspaces`, and `readableWorkspaces`.
- Account approval accepts `approvedChannels`; old `vendorType` remains a backward-compatible classification input.
- Legacy selling-channel update can request/withdraw but cannot self-approve.
- Legacy vendor-type update changes classification only.

Example application request:

```json
{
  "wholesaleProfile": {
    "gstNumber": "GSTIN",
    "businessName": "ABC Traders",
    "wholesaleContactName": "Owner",
    "wholesaleContactPhone": "9999999999",
    "bulkOrderSupportEmail": "b2b@example.com"
  }
}
```

Example channel response:

```json
{
  "activeWorkspaces": ["retail", "wholesale"],
  "readableWorkspaces": ["retail", "wholesale", "quick_commerce"],
  "channelsRevision": 4,
  "channels": {
    "retail": { "status": "active" },
    "wholesale": { "status": "active" },
    "quickCommerce": { "status": "paused" }
  }
}
```

Admin status updates require `vendors.approve`, validate feature availability/profile completeness, use `expectedRevision`, reject illegal transitions, prevent disabling a channel with active orders, notify the vendor and create an immutable admin audit record.

Rollback: frontend flag off, prior application binary, retained projection. Never delete channel data during rollback.

### PHASE 3 TEST REPORT

- Forged workspace, missing multi-workspace context and disabled channel cases pass unit tests.
- All 45 admin permission tokens remain covered.
- Security regression suite passes.

### PHASE 3 FINAL VERIFICATION REPORT

Acceptance: frontend selection grants no authority; `vendorType` grants no authority in canonical mode; admin actions are revision-safe and audited.

Effort: 5–7 engineer-days. Risk: critical. Dependencies: Phases 1–2.

PHASE 3 STATUS: COMPLETE

## PHASE 4 ANALYSIS REPORT — Vendor workspace system and shared shell

| Item | Expected | Actual | Status |
|---|---|---|---|
| Route design | One tree, workspace in URL | One shared route tree already existed | PARTIALLY VALID |
| Multi-tab safety | URL authority | No workspace context | VALID |
| Picker | Single auto, multiple choose | Missing | VALID |
| Sidebar | Common plus workspace-specific | Mostly static/capability-by-type | PARTIALLY VALID |

### PHASE 4 IMPLEMENTATION

Frontend files:

- `frontend/src/shared/config/vendorChannels.js`
- `frontend/src/modules/Vendor/hooks/useVendorWorkspace.js`
- `WorkspacePicker.jsx`
- vendor Layout, Header, Sidebar and route definitions
- API interceptor and auth store

Behavior:

- Single active channel redirects to `/vendor/dashboard?workspace=<channel>`.
- Multiple active channels redirect to `/vendor/workspaces`.
- Switching updates the current URL; tabs remain independent.
- `sessionStorage` remembers a per-tab convenience choice only; it is not authorization.
- API calls propagate the URL workspace in `X-Vendor-Workspace`.
- Direct URLs are rejected/redirected in UI and independently rejected by the API.
- Shared Profile, Wallet, Subscription, Support and Notifications remain common.
- Sidebar is assembled as common items plus workspace-specific items; no duplicate route trees were added.
- `VITE_VENDOR_MULTI_CHANNEL_ENABLED` supports UI rollback.

### PHASE 4 TEST REPORT

- Frontend production build: 3,338 modules transformed successfully.
- Existing chunk-size/dynamic-import warnings remain non-blocking and unrelated.
- URL parsing and server workspace enforcement are covered by channel tests.

### PHASE 4 FINAL VERIFICATION REPORT

Acceptance: URL/context workspace, shared shell, responsive picker/header/sidebar and safe direct access.

Effort: 4–5 engineer-days. Risk: medium. Dependencies: Phase 3.

PHASE 4 STATUS: COMPLETE

## PHASE 5 ANALYSIS REPORT — Product, publishing and shared inventory

| Item | Expected | Actual | Status |
|---|---|---|---|
| Product core | One record | Already one Product model | ALREADY IMPLEMENTED |
| Publication | Per-channel | Existing booleans were not consistently scoped | PARTIALLY VALID |
| Extensions | Wholesale/QC owned fields | Existing structures mostly matched | PARTIALLY VALID |
| Inventory | Shared V1 stock | Existing `stockQuantity` was shared | ALREADY IMPLEMENTED |
| Concurrent edits | Prevent silent overwrite | Mongoose version existed but UI/API did not enforce it | VALID |

### PHASE 5 IMPLEMENTATION

Backend/product/bulk files and vendor product pages/forms were updated.

Ownership rules enforced:

- Shared core: name, description, media, SKU, brand/category core, tax, variants and `stockQuantity`.
- Retail: `retailEnabled`, visibility/shipping-facing retail fields.
- Wholesale: `wholesaleEnabled`, MOQ and tier pricing.
- Quick Commerce: `quickCommerceEnabled`, `quickCommerceCategoryId`, `quickCommerce.maxOrderQty` and preparation/product constraints.
- Vendor QC location, radius, hours and availability stay on `quickCommerceProfile`, not Product.

Publishing rules:

- Create publishes only into the server-validated current workspace.
- Update cannot mutate another channel's flag.
- `PATCH /products/:id/channels/:channel` publishes/unpublishes a target channel after channel/profile validation.
- Delete from a workspace unpublishes that channel; it soft-deletes only when no channel remains published.
- Product reads can include shared drafts with `includeUnpublished=true`.
- `expectedVersion` rejects stale edits with HTTP 409.
- Bulk upload is workspace-scoped; wholesale updates do not disable retail/QC; QC bulk processing returns an explicit unsupported response until category mapping exists.
- Cross-vendor SKU lookup in bulk import was corrected.

Inventory behavior remains one atomic `stockQuantity` and reservation pool across all channels. No stock allocation or transfer feature was added.

### PHASE 5 TEST REPORT

- Pricing parity: 79 checks plus 500 randomized cases pass.
- Checkout pricing: 42 checks pass.
- Wholesale analytics: 24 checks pass.
- Wholesale import: 37 checks pass.
- Security inventory/reservation regressions pass.

### PHASE 5 FINAL VERIFICATION REPORT

Acceptance: shared core, explicit extension ownership, safe publishing, no cross-channel flag mutation and shared inventory.

Effort: 6–8 engineer-days. Risk: high. Dependencies: Phases 3–4.

PHASE 5 STATUS: COMPLETE

## PHASE 6 ANALYSIS REPORT — Catalog, checkout and orders

| Item | Expected | Actual | Status |
|---|---|---|---|
| Catalog eligibility | Active vendor channel + published product | Legacy projection was used in several queries | VALID |
| New orders | Active channel only | Vendor/account checks existed; channel checks were incomplete | PARTIALLY VALID |
| Vendor order views | Workspace-scoped | Vendor slices existed; workspace scope was incomplete | PARTIALLY VALID |
| Paused operations | Finish existing orders | No explicit readable/writable distinction | VALID |

### PHASE 6 IMPLEMENTATION

- Public Retail, Wholesale and QC discovery now require the matching canonical active vendor channel and product publication flag.
- Cart validation and order splitting revalidate account, channel, product, stock, MOQ and QC availability server-side.
- Direct order placement rejects inactive channels.
- Vendor order lists/details/status actions are filtered by current channel and vendor slice.
- Paused channels cannot accept products/new orders but retain read/order-completion access.
- QC-only actions require an exact QC workspace.
- Vendor analytics, customers and inventory are workspace-filtered.
- Shared order structures, payment flow, wallet, commission and subscription behavior remain unchanged.

Order behavior:

- Retail: existing shipping/order workflow, filtered to Retail vendor slices.
- Wholesale: existing MOQ/tier pricing and bulk metrics, filtered to Wholesale slices.
- Quick Commerce: existing ETA, radius, store availability, acknowledgement and rider status lifecycle, exact QC authorization.

During conformance, an authoritative server ETA/fee drift was found and fixed: server ETA now matches the client preview for actual accepted distance; zero/unknown distance has zero travel time; platform defaults were reconciled with the pinned contract; fee radius fallback no longer treats `null` as a zero-kilometre cap.

### PHASE 6 TEST REPORT

- QC ETA/fee/total: 62 checks plus randomized parity pass.
- Rider assignment/status: 56 checks plus 1,000 randomized contention rounds pass.
- QC analytics/alerts/isolation: 58 checks pass.
- Complete conformance command passes.

### PHASE 6 FINAL VERIFICATION REPORT

Acceptance: channel-safe discovery/checkout/orders, no stranded paused workflow, unchanged shared financial flows and verified QC parity.

Effort: 6–8 engineer-days. Risk: critical. Dependencies: Phases 3 and 5.

PHASE 6 STATUS: COMPLETE

## PHASE 7 ANALYSIS REPORT — Channel applications, settings and Business Overview

| Item | Expected | Actual | Status |
|---|---|---|---|
| Future expansion | Apply without re-registration | Missing | VALID |
| Business Overview | Read-only cross-channel | Missing | VALID |
| Common settings | Account-level | Existing pages could be reused | PARTIALLY VALID |

### PHASE 7 IMPLEMENTATION

- Added Selling Channels page with status, apply and request-withdraw flows.
- Wholesale application collects and validates its business profile.
- QC operational settings stay scoped to QC workspace/profile.
- Added `GET /api/vendor/business-overview` and a read-only responsive page.
- Overview returns total orders/revenue/unique customers and Retail/Wholesale/QC breakdowns.
- No products, orders or settings can be mutated from the overview.
- Wallet, bank, subscription, support, profile and notification screens remain shared.

### PHASE 7 TEST REPORT

- Frontend production build passes.
- API syntax, permissions, source hygiene and channel tests pass.
- Analytics arithmetic is covered by conformance suites.

### PHASE 7 FINAL VERIFICATION REPORT

Acceptance: expansion without another account/subscription, independent admin approval and read-only executive reporting.

Effort: 3–4 engineer-days. Risk: medium. Dependencies: Phases 3–6.

PHASE 7 STATUS: COMPLETE

## PHASE 8 ANALYSIS REPORT — Cutover, security and rollback

| Item | Expected | Actual | Status |
|---|---|---|---|
| Authority cutover | Channels, not type/query/UI | Implemented across protected routes, catalog and checkout | VALID |
| Compatibility | Retain old consumers | Projection and legacy response fields retained | VALID |
| Audit | Admin governance trace | Added | VALID |
| Feature flags | UI/cutover controls | Added | VALID |
| Secret hygiene | No credentials in examples | Real-looking credentials existed in `.env.example` | VALID security defect |

### PHASE 8 IMPLEMENTATION

- Default `VENDOR_CHANNEL_AUTHORITY_MODE=channels`; `shadow` logs disagreements; legacy mode is an emergency bridge only.
- `VITE_VENDOR_MULTI_CHANNEL_ENABLED` can disable the new frontend workspace gate.
- Product field strictness defaults on and can be temporarily relaxed only via an explicit backend flag.
- All account/channel governance actions are audited with actor, vendor, previous/new state, reason, IP and revision.
- Scrubbed database, Cloudinary and SMTP credentials from `.env.example` and replaced them with local/placeholders.
- Hardened the integration runner to load `.env`, require explicit `MONGO_URI`, and refuse any non-local database unless deliberately overridden.

Security implication: credentials previously present in Git history must be rotated. Removing current text is not sufficient.

Rollback sequence:

1. Disable the frontend feature flag.
2. Stop writes/admin channel changes.
3. Deploy the prior application binary.
4. Retain `channels`, revisions, indexes and compatibility projection.
5. Verify old catalog/login/order smoke tests.
6. Do not run a destructive down migration.

The rollback window should be brief because an old save hook may collapse a multi-channel compatibility projection when an old binary saves a vendor.

### PHASE 8 TEST REPORT

- 98 security/channel unit checks pass after transition enforcement.
- 45/45 permission tokens covered.
- Source hygiene and `git diff --check` pass.
- No live-looking credentials remain in example files.

### PHASE 8 FINAL VERIFICATION REPORT

Acceptance: canonical authority, feature-controlled UI, compatibility projection, audited changes, non-destructive rollback and secret-remediation action recorded.

Effort: 3–4 engineer-days. Risk: critical. Dependencies: all implementation phases.

PHASE 8 STATUS: COMPLETE

## PHASE 9 ANALYSIS REPORT — QA, rollout and release gate

| Item | Expected | Actual | Status |
|---|---|---|---|
| Unit/security | Green | Green | ALREADY IMPLEMENTED after fixes |
| Conformance | Green | Green after fixing ETA drift and stale contracts | VALID |
| Frontend build | Green | Green | ALREADY IMPLEMENTED after fixes |
| Integration/API E2E | Isolated seeded DB/server | No local MongoDB/Docker service; configured DB is hosted | PARTIALLY VALID / BLOCKED |
| Live migration | Snapshot and controlled release | Not authorized/safe from local workspace | PARTIALLY VALID / BLOCKED |

### PHASE 9 IMPLEMENTATION

Test and release tooling changes:

- Added `test:unit` and `test:channels` scripts.
- Added multi-channel unit suite.
- Corrected conformance contracts to recognize valid rider exception stages and intentional absence of QC defaults on marketplace orders.
- Added integration database safety guard.

### PHASE 9 TEST REPORT

Passing gates:

- JavaScript syntax: all changed JS/MJS files pass `node --check`.
- Security regression: 91/91.
- Channel unit tests: 7/7.
- Permission coverage: 45/45 tokens.
- Source hygiene: pass.
- Domain conformance: 358 deterministic checks plus randomized pricing, ETA, totals and 1,000 rider-contention rounds pass.
- Frontend production build: pass, 3,338 modules.
- Diff whitespace validation: pass.

Integration gate:

- An initial run against the already-running development server produced 4 passing and 6 failing suites. Failures reported missing seeded admin/support identities and shared mutable fixture state, not multi-channel assertion failures.
- The runner is now fail-closed and refuses the configured hosted database.
- It must be rerun against an isolated local/CI MongoDB with the documented seed data and its own backend process.

### PHASE 9 FIX AND RE-TEST REPORT

Fixed during test loops:

- Canonical channel checks in checkout wholesale pricing, QC availability and admin catalog helpers.
- QC ETA/client parity and delivery fee cap/default behavior.
- Rider verifier ownership/default assumptions.
- QC polish verifier casing and marketplace-no-pollution assumptions.
- Product optimistic version propagation.
- Channel transition validation and admin UI controls.
- Integration test database guard.

All deterministic gates pass after re-test.

### PHASE 9 FINAL VERIFICATION REPORT

Deployment readiness checklist:

- [x] Additive code and migration ready
- [x] Backend authorization verified
- [x] Admin permission/audit coverage verified
- [x] Frontend production build verified
- [x] Domain/security regressions verified
- [x] Non-destructive rollback documented
- [ ] Rotate credentials that existed in Git history
- [ ] Provision isolated integration MongoDB and run seed + full API suite
- [ ] Snapshot production database
- [ ] Run and verify migration 0008 in staging, then production
- [ ] Execute seven-combination smoke matrix in staging

Staging rollout:

1. Rotate exposed credentials and update secret manager.
2. Create an isolated staging database snapshot/clone with redacted data.
3. Deploy backend artifact with `VENDOR_CHANNEL_AUTHORITY_MODE=shadow` and frontend flag off.
4. Run `npm run migrate` and `npm run migrate:verify`.
5. Reconcile shadow mismatch logs; expected count must reach zero.
6. Set backend mode to `channels`.
7. Enable frontend flag for internal vendors, then all staging vendors.
8. Test all seven channel combinations, direct URL forgery, pause/disable, applications, product publishing, shared stock and order completion.

Production rollout:

1. Snapshot database and record migration ledger.
2. Deploy backend, run/verify migration before accepting new writes.
3. Monitor 4xx channel error codes, checkout conversion, catalog counts, admin conflicts, order SLA and migration mismatch metrics.
4. Enable frontend flag progressively.
5. Keep prior artifact and rollback runbook ready through the observation window.

Monitoring signals:

- `WORKSPACE_REQUIRED`, `CHANNEL_ACCESS_DENIED`, `CHANNEL_NOT_WRITABLE`, `WORKSPACE_MISMATCH`
- Channel counts by state and projection mismatches
- Catalog products/vendors per channel
- Checkout rejection rate by channel
- Shared stock reservation conflicts
- Orders/revenue by channel and QC SLA/assignment escalation
- Admin channel transition/audit failures

Effort: 3–5 engineer-days plus release window. Risk: critical. Dependencies: isolated database, credential owner and production access.

PHASE 9 STATUS: BLOCKED on external release prerequisites

## Final phase gate

- Acceptance criteria met in code: yes.
- Security verified: deterministic checks yes; credential rotation outstanding.
- Tests passing: unit, security, conformance, permissions, hygiene and build yes; full DB-backed E2E outstanding.
- APIs working: static/contract verification yes; isolated E2E outstanding.
- UI working: production build yes; staging browser matrix outstanding.
- Database safe: migration is additive/idempotent; live verification outstanding.
- Rollback possible: yes, with the documented short compatibility window.

Overall status: IMPLEMENTATION COMPLETE; PRODUCTION RELEASE BLOCKED until the three unchecked release prerequisites are completed.
