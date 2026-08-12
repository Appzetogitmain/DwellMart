# DwellMart — Full Remediation & Production Readiness Implementation Plan

**Source of truth:** `FULL_APPLICATION_ENTERPRISE_AUDIT_REPORT.md` (2026-08-12)
**Plan version:** 1.0
**Status:** Planning only — no code changes authorised by this document.

---

## How to read this plan

Every finding in the audit carries an ID. This plan re-uses those IDs verbatim so traceability is bidirectional:

| Prefix | Source section in audit |
|---|---|
| `B-n` | Production Blockers |
| `S-n` | Security Findings |
| `D-n` | Database Findings |
| `P-n` | Performance Findings |
| `M-n` | Missing Functionality Report |
| `HC-n` | Hardcoded Values Report (numbered here for tracking; the audit lists them by value) |
| `DC-n` | Dead Code Report (numbered here) |
| `§x` | Module-By-Module Audit subsection |
| `W-n` | End-To-End Workflow Verification Matrix row |

**Nothing in the audit is dropped.** Phase 17 contains a closure matrix asserting every ID above is claimed by exactly one phase.

---

## Team & capacity assumptions

| Role | Count | Notation |
|---|---|---|
| Backend Engineer | 3 | BE1, BE2, BE3 |
| Frontend Engineer | 2 | FE1, FE2 |
| Full-Stack / DevOps hybrid | 1 | FS1 |
| QA Engineer | 2 | QA1, QA2 |
| Principal Architect (review/design, 40%) | 1 | ARCH |

- **Sprint = 2 working weeks = 10 working days.**
- Engineering capacity ≈ **60 eng-days per sprint**, 300 across five sprints.
- QA capacity ≈ **20 QA-days per sprint**, 100 across five sprints.
- Effort classification: **S** ≤ 2 eng-days · **M** 3–8 · **L** 9–20 · **XL** > 20.

---

## Program-level guardrails (apply to every phase)

1. **No phase merges a security fix with a refactor.** Security fixes ship on their own branch and their own release so they can be reverted independently.
2. **Every schema change is additive-first.** Add field → dual-write → backfill → read-switch → remove legacy. No destructive migration in a single release.
3. **Every money-path change ships behind a kill switch** read from `Settings`, not from `NODE_ENV`.
4. **Feature-flag discipline:** a flag is only introduced together with the code that reads it. The audit found 6 flags with zero readers (§12d) — this is the practice that caused it.
5. **Staging must mirror production topology**, specifically a MongoDB replica set. Transactions are mandatory across checkout, and a standalone `mongod` makes every `withTransaction` throw (D-15).
6. **Regression gate:** the workflow matrix (W-1…W-58) is the regression suite. No phase closes until its owned rows go green and no previously-green row regresses.

---

## Finding inventory — master count

| Category | Count | Phases claiming them |
|---|---|---|
| Production Blockers | 9 | 0, 1, 2, 3, 4, 5, 6, 7, 12 |
| Security Findings | 21 | 1, 2, 3, 8, 15 |
| Database Findings | 15 | 0, 2, 5, 6, 7, 14 |
| Performance Findings | 12 (+6 scalability components) | 10, 11, 12 |
| Missing Functionality | 15 | 4, 5, 6, 7, 8, 9, 10, 15 |
| Hardcoded Values (Critical) | 5 | 0, 6, 13 |
| Hardcoded Values (Production Risk) | 10 | 6, 9, 13 |
| Hardcoded Values (Needs Config) | 11 | 13 |
| Dead Code items | 9 groups | 14 |
| Module findings not otherwise ID'd | 14 | 3, 6, 7, 8, 9, 10, 14, 15 |
| Workflow matrix rows | 58 | all |

---

# PHASE 0 — Foundation: Environment, Boot Guards & Migration Framework

### Objective
Establish the preconditions every later phase depends on: a correct production configuration contract, a boot-time fail-fast guard so misconfiguration cannot reach traffic, and a real migration framework so Phases 5–7 can change schemas safely.

### Business Impact
No direct customer-facing change. This phase is the reason the other sixteen can be executed safely. Without it, the geo-fence stays disabled, mock OTP stays reachable, and every subsequent schema change is an ad-hoc script with no ordering or rollback.

### Risk Level
**Medium** — low blast radius in code, but a wrong boot guard takes the whole service down at deploy. Mitigated by shipping the guard in warn-only mode first.

### Dependencies
None. **This phase blocks Phases 5, 6, 7, 13.**

### Estimated Effort
**M — 8 eng-days**, 3 QA-days. BE1 + FS1.

---

### Issues Covered

| ID | Finding |
|---|---|
| **B-9 (partial)** | Single-instance architecture — this phase only establishes the config contract; the fix lands in Phase 12 |
| **HC-1** | `backend/.env` ships `NODE_ENV=development`, `USE_MOCK_OTP=true`, `MOCK_OTP=123456`, `CASHFREE_ENV=sandbox` |
| **HC-2** | `'delivery-doc-secret'` HMAC fallback at `app.js:49` |
| **HC-3** | `isDevMode ? 10000 : radius` geo-fence bypass derived from `NODE_ENV` (`quickCommerce.routes.js:328-329`, `user/order.controller.js:297-298`) — the *config contract* half; the code fix is Phase 6 |
| **D-12** | No migration framework — seven ad-hoc `migrate*`/`backfill*` scripts with no ordering, idempotency, or rollback |
| **D-15** | Nothing validates that the Mongo connection is a replica set; transactions silently unavailable on standalone |
| **§1** | Deployed defaults wrong on four axes |
| **W-13, W-14** | Geo-fence and mock-OTP behaviour gated on `NODE_ENV` |

---

### Root Cause Analysis

**HC-1 — production defaults committed as development defaults.**
*Why it exists:* `backend/.env` was authored as a working developer file and never forked into an environment-specific contract. `.env.example` exists and is tracked, but nothing asserts parity between it and the runtime environment.
*Files/modules affected:* `backend/.env`, `backend/.env.example`, `backend/src/config/env.js`, `backend/src/server.js`.
*Workflows impacted:* Vendor OTP registration (mock OTP accepted), Quick Commerce serviceability (geo-fence disabled), payments (sandbox gateway), delivery debug OTP route (`delivery.routes.js:66-68` registers `/orders/:id/debug-otp` when not production).
*Side effects:* Flipping `NODE_ENV=production` simultaneously activates the geo-fence, disables mock OTP, disables the debug-OTP route, and tightens three rate limits. **Four behavioural changes on one variable flip** — this must be staged and verified as four separate assertions, not assumed.

**HC-2 — HMAC secret with a literal fallback.**
*Why it exists:* Defensive `|| 'delivery-doc-secret'` written so local development works without a `.env`. `validateEnv` does require `JWT_SECRET`, so the fallback is currently unreachable in a booted server — but it is a latent known-key forgery vector the moment anyone adds a code path that runs before `validateEnv`, or reuses `isValidDeliveryDocToken` in a script.
*Files:* `backend/src/app.js:41-55`.
*Workflows:* Delivery document access (`/uploads/delivery-docs/*`) — rider Aadhaar and driving licence.
*Side effects:* Removing the fallback means any process importing `app.js` without env loaded now throws at module scope. Must be converted to a lazy read inside the function, not a module-level constant.

**D-12 — no migration framework.**
*Why it exists:* The project grew organically; each schema change was solved with a one-off script (`backfillRiderWallets.js`, `migrateCategoryExperience.js`, `migrateVendorType.js`, `backfillVendorSellingChannels.js`, `grandfatherVendors.js`, `migrateDeliveryBoyLocation.js`).
*Files:* `backend/scripts/*`.
*Workflows:* Every future schema change — specifically Phase 6 (`sku`, `costPrice`, variant stock), Phase 5 (settlement idempotency), Phase 7 (order field corrections).
*Side effects:* Introducing a migration runner retroactively means the seven existing scripts must be either registered as already-applied or made idempotent. Registering them as applied without verifying they *were* applied on production will silently skip a needed migration.

**D-15 — replica-set requirement unasserted.**
*Why it exists:* Transactions were introduced later than the connection code. `config/db.js` connects and reports success identically for standalone and replica-set topologies.
*Files:* `backend/src/config/db.js`, `backend/src/server.js`.
*Workflows:* All of checkout (`splitAndCreateOrders`), legacy order placement, order cancellation, rider withdrawal creation — every `withTransaction` call site.
*Side effects:* The assertion must run *after* connect and *before* `server.listen`, otherwise the process accepts traffic during the window and fails every checkout with an opaque Mongo error.

---

### Backend Changes

**Configuration & boot**
- `src/config/env.js` — expand `validateEnv` from a presence check into a **typed environment contract**: required-in-production set (`NODE_ENV`, `MONGO_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CLIENT_URL`, `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV`, Cloudinary triplet, SMTP set, Firebase set), forbidden-in-production set (`USE_MOCK_OTP`, `MOCK_OTP`, `DISABLE_GEO_FENCING`, `PRODUCT_FIELD_STRICT=false`), and value assertions (`CASHFREE_ENV` must be `production` when `NODE_ENV=production`; `INTEGRATION_API_KEY_PEPPER` must be non-empty).
- Ship in two stages: **stage A** logs a structured `CONFIG_VIOLATION` warning per breach and boots; **stage B** (next release) throws. Never ship the throwing version first.
- `src/config/db.js` — after connect, read the topology via the driver's admin command and assert replica-set membership when `NODE_ENV=production`. Expose the result as `db.supportsTransactions` for use by a health endpoint.
- `src/server.js` — sequence becomes: `validateEnv()` → `connectDB()` → `assertTransactionSupport()` → `runPendingMigrations()` (gated, see below) → workers → `listen`.
- `src/app.js:41-55` — move the HMAC secret read inside `isValidDeliveryDocToken`; remove the literal fallback; throw a typed error if absent so the 403 path is distinguishable from a config error in logs.

**Migration framework**
- New `src/migrations/` directory with numbered, idempotent, forward-only migration modules, each exporting `id`, `description`, `up()`, and `verify()`.
- New `SchemaMigration` model: `{ migrationId, appliedAt, appliedBy, checksum, durationMs, status }`, unique on `migrationId`.
- New runner service supporting `--dry-run`, `--to <id>`, `--verify-only`, and an advisory lock (a single-document `findOneAndUpdate` lease in `SchemaMigration`) so concurrent instances cannot run migrations simultaneously — this matters immediately once Phase 12 introduces multiple instances.
- **Do not auto-run migrations on boot in production.** Boot verifies that no *pending* migration exists and refuses to start if one does; application is an explicit deploy step.
- Reconcile the seven existing `backend/scripts/*` migration scripts: each is either (a) rewritten as a numbered migration with a `verify()` that detects already-applied state, or (b) formally retired with a written record of which environments it ran against.

**Health**
- Extend `GET /health` beyond process liveness to report `{ db: connected|degraded, transactions: supported|unsupported, pendingMigrations: n, configViolations: n }`. Keep an unauthenticated shallow variant for the load balancer and gate the detailed variant behind an internal token.

**No API, controller, service, model, or permission changes** beyond the above. No validation changes.

---

### Frontend Changes
None. This phase is backend/infrastructure only.

*Explicitly noted so the phase is not padded:* the frontend consumes no environment contract from the backend, and none is introduced here.

---

### UI Changes
None.

---

### Database Changes

| Collection | Change |
|---|---|
| `schemamigrations` (new) | Created by the framework. Unique index on `migrationId`. Second document reserved as the advisory lock. |

- **Migrations:** `0001_bootstrap_migration_ledger` — creates the collection, its index, and records the seven pre-existing scripts as either applied or retired based on an operator-supplied manifest.
- **Backfill:** none.
- **Data integrity checks:** a `verify-only` run must confirm the ledger's recorded state matches observable schema reality (e.g. if `migrateVendorType` is marked applied, assert zero approved vendors lack `vendorType`).

---

### Integration Changes
- **Payment gateway:** none functionally; the config contract now asserts `CASHFREE_ENV` matches `NODE_ENV`, which will surface any environment currently running production traffic against sandbox.
- **Subscription flow:** none.
- **Notifications:** none.
- **External services:** the Firebase and SMTP variable sets move from "optional" to "required in production", which will fail boot on any environment currently missing them. Inventory these before stage B.
- **Webhooks:** none.

---

### Testing Requirements

**Unit**
- `validateEnv` — one test per required key, per forbidden key, per value assertion; assert stage-A warns and stage-B throws.
- Migration runner — ordering, idempotency (running twice is a no-op), lock contention (second runner blocks), `--dry-run` performs no writes, failure mid-migration leaves the ledger consistent.
- `isValidDeliveryDocToken` — valid token, expired token, tampered signature, mismatched length, missing secret.

**Integration**
- Boot against a standalone `mongod`: assert refusal in production mode, assert warn-and-continue in development mode.
- Boot with a pending migration: assert refusal to listen.
- Boot with `USE_MOCK_OTP=true` and `NODE_ENV=production`: assert refusal (stage B).

**API**
- `GET /health` shallow and detailed variants; detailed variant rejects an unauthenticated caller.

**Frontend / E2E**
- None owned by this phase, but the full E2E smoke suite must pass unchanged against a stage-A build to prove zero behavioural drift.

**Security**
- Confirm the delivery-doc token cannot be forged with the removed literal secret.
- Confirm the detailed health endpoint leaks no connection string, secret, or migration content.

**Regression**
- W-1…W-58 smoke pass. Particular attention to W-13/W-14 (geo-fence) and vendor OTP registration, since these are the behaviours coupled to `NODE_ENV`.

---

### Verification Checklist

- [ ] `validateEnv` stage A logs exactly one `CONFIG_VIOLATION` per breach, with the key name and never the value.
- [ ] Production-profile boot with any forbidden key present fails with a non-zero exit and a named error (stage B).
- [ ] Boot against a standalone `mongod` in production profile exits non-zero before `listen` is called.
- [ ] `GET /health` detailed reports `transactions: supported` on the staging replica set.
- [ ] `runPendingMigrations --dry-run` on a production clone reports zero writes and lists pending IDs.
- [ ] Running the migration runner twice in a row produces zero additional ledger rows.
- [ ] Two concurrent runner processes: exactly one acquires the lease; the other exits cleanly with a lock-held message.
- [ ] `grep -r "delivery-doc-secret" backend/src` returns zero results.
- [ ] `backend/.env.example` documents every key in the required set, with no real values.
- [ ] An environment inventory document exists listing, per environment, the value of every key in the forbidden set.

---

### Rollback Strategy

**Low-risk, fully reversible.**
- The config contract is additive in stage A (warn-only) — rollback is redeploying the previous image; no state is touched.
- Stage B (throwing) is the only risky step: rollback is an immediate redeploy of stage A, plus correcting the offending environment variable. **Pre-condition for shipping stage B:** the stage-A warning count in production logs has been zero for 48 hours.
- The migration ledger is additive; a new empty collection. Rollback is dropping `schemamigrations`, which restores the prior (unmanaged) state exactly.
- The delivery-doc HMAC change is behaviour-preserving as long as `JWT_SECRET` is set — which `validateEnv` already required before this phase. Rollback is a code revert.
- **No data is mutated in this phase**, so there is no backfill to reverse.

---

# PHASE 1 — Revenue Protection: Subscription Billing Authorization

### Objective
Close the unauthenticated free-subscription path and the authenticated free-upgrade path, so a paid subscription can only be activated by a verified gateway payment or an explicit, audited admin grant.

### Business Impact
**Direct and total.** Today 100% of vendor subscription revenue is optional. Any unauthenticated caller who knows a verified vendor's email can activate the most expensive plan with a single request; any logged-in vendor can self-upgrade indefinitely via `change-plan`. This phase is the highest-value single unit of work in the programme.

### Risk Level
**High** — it changes the activation path every existing vendor's subscription flows through. A mistake here blocks legitimate vendors from subscribing (revenue loss in the other direction) or orphans in-flight onboarding sessions.

### Dependencies
Phase 0 (config contract asserts `CASHFREE_ENV`). **Blocks Phase 9 (subscription plan limits) — limits are meaningless until activation is authorised.**

### Estimated Effort
**L — 12 eng-days**, 6 QA-days. BE1 (lead) + FE1 + ARCH review.

---

### Issues Covered

| ID | Finding |
|---|---|
| **B-1** | Unauthenticated free activation of paid vendor subscriptions |
| **S-1** | Same, as a security finding — `subscription.routes.js:16` has no auth middleware; `activateInternalSubscription` fabricates a paid `Payment` record |
| **S-10 (partial)** | `createPaymentSession` accepts `subscriptionPlanId + email` unauthenticated (`cashfree.controller.js:166`) — vendor enumeration via 404 vs 200; the order-branch half is Phase 3 |
| **§2** | Vendor Subscriptions & Billing module — 0% enforced |
| **M-2** | Missing: payment authorisation on subscription activation |
| **W-30** | Workflow: vendor subscription purchase |
| **W-31** | Workflow: vendor plan change |

---

### Root Cause Analysis

**B-1 / S-1 — activation decoupled from payment.**
*Why it exists:* `activateInternalSubscription` was written as a shared helper for three legitimately different situations — a genuinely free (₹0) plan, an admin-granted plan, and a Cashfree-confirmed paid plan. Because it is a single function with no payment argument, every caller gets the "already paid" behaviour. The onboarding route was then exposed without auth so a vendor mid-registration (who has no token yet) could complete the flow. Those two decisions compose into an unauthenticated money bypass.
*Files/modules affected:*
- `src/routes/subscription.routes.js` (3 unauthenticated routes)
- `src/modules/vendor/controllers/billing.controller.js` (`selectPlan`, `initiateOnboardingSubscription`, `confirmOnboardingPayment`)
- `src/modules/vendor/controllers/subscription.controller.js` (`changePlan`)
- `src/services/billing/subscriptionState.service.js` (`activateInternalSubscription`, `upsertSubscriptionRecord`, `upsertPaymentRecord`)
- `src/services/billing/planSelection.service.js` (`createPlanSelection`, `resolvePlanSelection`)
- `src/modules/payment/controllers/cashfree.controller.js` (Source 3, and the `sub_` branches of `verifyPayment` and `handleWebhook`)
- `src/models/{VendorSubscription,Payment,OnboardingPlanSelection}.model.js`

*Workflows impacted:* vendor registration → plan selection → payment → activation; vendor plan upgrade/downgrade; vendor renewal after expiry (`/vendor/renew-subscription` is deliberately outside `VendorProtectedRoute`, so it depends on an unauthenticated-capable path); admin visibility of vendor subscriptions.

*Potential side effects — these are the dangerous ones:*
1. **The renewal page is outside the protected route.** `App.jsx:749` renders `VendorRenewSubscription` unauthenticated by design, because an expired vendor is blocked by `checkSubscription` on non-GET. If auth is naively added to `/subscription/*`, expired vendors can no longer renew — converting a revenue leak into a revenue *stoppage*. The renewal path must be re-based onto `vendorAuthOnly` (which already exists and excludes `checkSubscription`, see `vendor.routes.js:62`), not onto `vendorAuth`.
2. **Onboarding has no token yet.** A vendor who has registered and verified email but not logged in currently uses the unauthenticated route. The replacement must be a short-lived, single-use, server-issued onboarding token bound to the vendor id — not a permanent bypass and not the email address.
3. **Existing `internal` subscriptions.** Every subscription activated to date has `gateway: 'internal'` and a fabricated `Payment{status:'paid'}`. Some of those are legitimate (₹0 plans); some may be exploited. They cannot be distinguished retroactively from the record alone. A reconciliation report is required (see Database Changes) before any enforcement that treats `internal` as suspect.
4. **`Payment` records are the audit trail.** Fabricated paid records already exist and will pollute any future revenue reporting built in Phase 10.

**S-10 (subscription half) — enumeration.**
*Why it exists:* Source 3 of `createPaymentSession` takes an email to locate the vendor, and returns 404 when absent. The route is `optionalAuth`.
*Files:* `src/routes/payment.routes.js:11`, `src/modules/payment/controllers/cashfree.controller.js:166-209`.
*Workflows:* vendor subscription checkout initiation.
*Side effects:* the onboarding wizard (`SubscriptionOnboardingWizard.jsx:502`) legitimately calls this before login. Same constraint as (2) above — it must move to the onboarding token, not to full auth.

---

### Backend Changes

**APIs requiring changes**

| Endpoint | Current | Target |
|---|---|---|
| `POST /api/subscription/select-plan` | Unauthenticated | Unauthenticated but **rate-limited and non-committal** — issues a selection token only; must not touch vendor state |
| `POST /api/subscription/initiate` | Unauthenticated, activates | **Removed as an activation path.** Becomes "create a payment intent": requires an onboarding token, returns a Cashfree session; activates nothing |
| `POST /api/subscription/confirm` | Unauthenticated, leaks state | Requires onboarding token; returns only the caller's own subscription state, sanitised |
| `POST /api/vendor/subscription/change-plan` | Authenticated, activates free | Creates a payment intent for the price delta; activation only via webhook/verify |
| `POST /api/payments/cashfree/session` (Source 3) | Unauthenticated by email | Requires onboarding token or vendor auth |
| `POST /api/payments/cashfree/verify` (`sub_` branch) | Unauthenticated | Requires onboarding token or vendor auth; remains idempotent |
| `POST /api/payments/cashfree/webhook` (`sub_` branch) | Signature-verified | Unchanged — this becomes the **only** unattended activation path |
| `POST /api/admin/vendors/:id/grant-subscription` | Does not exist | **New.** Superadmin-only, reason-mandatory, audit-logged, explicitly marked `gateway: 'admin_grant'` |

**Controllers**
- `billing.controller.js` — `initiateOnboardingSubscription` loses its `activateInternalSubscription` call entirely and becomes an intent-creation handler. `confirmOnboardingPayment` stops returning arbitrary vendors' subscriptions.
- `subscription.controller.js` — `changePlan` loses its `activateInternalSubscription` call; returns a `checkout` payload instead of `checkout: null`.
- `cashfree.controller.js` — the `sub_` branches of `verifyPayment` and `handleWebhook` become the sole activation callers, and must pass a verified payment reference through.
- New `admin/subscriptionGrant.controller.js`.

**Services**
- `subscriptionState.service.js` — **the central change.** `activateInternalSubscription` is replaced by `activateSubscription({ vendor, plan, activationSource, gatewayPaymentRef, actorId, reason })` where `activationSource` is a required enum: `gateway_verified | gateway_webhook | zero_price_plan | admin_grant`. The function refuses to run without a `gatewayPaymentRef` when the source is a gateway one, and refuses `zero_price_plan` when the plan's price for the vendor's currency is non-zero. `upsertPaymentRecord` gains a required `source` and stops defaulting `status` to `'paid'`.
- `planSelection.service.js` — selection tokens become short-TTL, single-use, and bound to a vendor id once known.
- New `onboardingToken.service.js` — issues and verifies a signed, short-lived (30 min), single-purpose token scoped to `vendorId` + `purpose: 'subscription_onboarding'`. Issued at the end of email verification, not on demand by email.

**Models**
- `VendorSubscription` — add `activationSource` (enum, required for new documents), `gatewayPaymentRef`, `grantedBy`, `grantReason`. Existing documents backfill to `activationSource: 'legacy_internal'`.
- `Payment` — add `source` and `verifiedAt`; make `status` explicit rather than defaulted at the call site.
- `OnboardingPlanSelection` — add `consumedAt`, `vendorId`, `expiresAt` (TTL index).
- New `AdminActivityLog` entry type for `SUBSCRIPTION_GRANT`.

**Middleware**
- New `requireOnboardingToken` — verifies the token, loads the vendor, attaches `req.onboardingVendor`. Deliberately **not** named `authenticate`, so nobody mistakes it for a session.
- Apply `authLimiter`-class rate limiting to `select-plan` and the onboarding endpoints.

**Database schema updates** — see Database Changes below.

**Validation updates**
- `initiateOnboardingSubscriptionSchema` / `confirmOnboardingPaymentSchema` — `email` is no longer accepted as an identity claim; the vendor comes from the token.
- `changePlanSchema` — unchanged shape, new server-side assertion that the target plan is active and priced.
- New Joi schema for the admin grant endpoint: `planId`, `reason` (min length enforced), optional `expiresAt`.

**Permission enforcement updates**
- Admin grant endpoint requires `requireSuperAdmin`. It is deliberately **not** wired to `VENDORS_EDIT` — granting paid product for free is a superadmin action.
- Register a new permission token only if the business wants delegation; if introduced it must be enforced on the route in the same PR (guardrail 4).

**Security improvements**
- Remove email-as-identity from all three subscription endpoints (closes S-10's subscription half and the enumeration oracle).
- Uniform 200-with-neutral-body for onboarding-status lookups so vendor existence is not disclosed.
- Audit-log every activation with source, actor, and payment reference.

---

### Frontend Changes

**Pages affected**
- `modules/Vendor/pages/Register.jsx` — must capture and store the onboarding token returned by email verification.
- `modules/Vendor/components/SubscriptionOnboardingWizard.jsx` (lines ~502, ~516) — send the onboarding token instead of the raw email; handle a new "payment required" response where it previously received an immediate activation.
- `modules/Vendor/pages/SubscriptionManagement.jsx` (lines ~177, ~189) — `changePlan` now returns a checkout payload; the page must route into the Cashfree modal instead of showing immediate success.
- `modules/Vendor/pages/VendorRenewSubscription.jsx` (lines ~65, ~77) — same, and must continue to work for an *expired* vendor. This is the highest-regression-risk screen in the phase.
- `modules/Admin/pages/vendors/VendorDetail.jsx` — new "Grant subscription" action, superadmin-only.
- `modules/Admin/pages/vendors/VendorSubscriptions.jsx` — display `activationSource` so operators can distinguish paid, granted, and legacy.

**Components affected**
- `shared/utils/cashfreeLoader.js` consumers — the change-plan flow now needs the same modal handling the checkout flow already has.
- New `AdminGrantSubscriptionModal` with mandatory reason field.

**Forms affected**
- Plan selection (onboarding) — no longer submits an email as identity.
- Change-plan form — gains a price-delta confirmation step before payment.
- Admin grant form — plan + reason + optional expiry.

**State management changes**
- `modules/Vendor/store/vendorAuthStore.js` — persist the onboarding token separately from the session token, with its own expiry, and clear it on successful login or on expiry. **It must never be written to the same key as `vendor-token`**, or `api.js`'s scope resolver (`api.js:96-109`) will attach it as an Authorization header to every vendor request.
- New selector exposing `subscription.activationSource` for the admin view.

**API integration updates**
- All four call sites listed above switch payloads.
- Add handling for a new `402 PAYMENT_REQUIRED`-style response code on change-plan, distinct from the existing `SUBSCRIPTION_INACTIVE` code already handled in `api.js:247-253`.

**UX changes**
- Change-plan becomes a two-step flow (confirm delta → pay) where it was one-click.
- Onboarding gains an explicit "your payment is being confirmed" interstitial, because activation is now asynchronous via webhook rather than synchronous.

**Error handling updates**
- Distinguish and message separately: onboarding token expired, payment cancelled, payment pending confirmation, plan no longer available, already subscribed to this plan.
- The existing generic `toastService.error(error)` path in `api.js:258` is too coarse for the payment-pending case; suppress the toast for that code and render inline.

---

### UI Changes

**Screens requiring modification**
1. Vendor onboarding — plan selection
2. Vendor onboarding — payment step
3. Vendor subscription management
4. Vendor renewal (expired state)
5. Admin → Vendor detail (grant action)
6. Admin → Vendor subscriptions list

**New UI states**
- *Payment pending confirmation* — polling or socket-driven, with a manual "check again" affordance and a support escape hatch after 2 minutes.
- *Onboarding token expired* — recoverable, with a "resend verification" action rather than a dead end.
- *Price-delta confirmation* — shows current plan, target plan, amount payable, effective date.
- *Admin grant confirmation* — shows what is being given away and requires a typed reason.

**Empty states**
- Vendor subscriptions list when a vendor has never subscribed — distinguish "never subscribed" from "expired", which the current UI conflates.

**Validation states**
- Reason field on admin grant: minimum length, inline error.
- Plan selection: disabled state with explanation when a plan is inactive or is the current plan.

**Loading states**
- Payment session creation, gateway modal open, verification poll — three distinct spinners today collapse into one ambiguous state; separate them.

**Success states**
- Activation confirmed (with plan name, period end, and invoice reference).
- Admin grant applied (with an audit-trail link).

**Error states**
- Payment failed / cancelled / amount mismatch — each with a distinct message and a retry that does not re-create a duplicate selection.

**Permission-based visibility rules**
- "Grant subscription" is rendered only for `role === 'superadmin'`, and the backend enforces it independently. The audit found ~35 admin routes with no frontend guard (§12c); this new action must not join them.

---

### Database Changes

**Collections impacted:** `vendorsubscriptions`, `payments`, `onboardingplanselections`, `adminactivitylogs`, `vendors`.

**Schema updates**
- `vendorsubscriptions`: `+activationSource`, `+gatewayPaymentRef`, `+grantedBy`, `+grantReason`. Index on `activationSource` for the reconciliation report.
- `payments`: `+source`, `+verifiedAt`. Index on `{ vendor: 1, createdAt: -1 }`.
- `onboardingplanselections`: `+vendorId`, `+consumedAt`, `+expiresAt` with a TTL index.

**Migrations**
- `0002_subscription_activation_source` — additive fields; backfill `activationSource: 'legacy_internal'` and `source: 'legacy_internal'` for all existing documents. Forward-only, no data loss.
- `0003_onboarding_selection_ttl` — adds the TTL index. **Caution:** a TTL index on a backfilled `expiresAt` will delete historical selection records. Backfill `expiresAt` to a far-future date for existing rows, or leave it unset (TTL ignores missing fields).

**Backfill requirements**
- Every existing `VendorSubscription` and `Payment` gets the legacy marker. Approximately equal to the current vendor count — small, single-pass, batched.

**Data integrity checks**
- **Reconciliation report (run before enforcement, retained as evidence):** for every `VendorSubscription` with `gateway: 'internal'` and a non-zero plan price, list vendor, plan, amount, activation date. This is the exploitation-exposure inventory. It is a business decision, not an engineering one, whether to revoke.
- Assert post-migration: zero subscriptions with `activationSource` unset; zero `Payment` records with `status: 'paid'` and no `source`.
- Assert ongoing: no new `VendorSubscription` may be created with `activationSource` in the gateway set and a null `gatewayPaymentRef` — enforce at the schema level with a conditional required validator.

---

### Integration Changes

**Payment gateway (Cashfree)**
- The `sub_{vendorId}_{planId}_{timestamp}` order-id convention is parsed by string splitting in three places (`cashfree.controller.js:227-229`, `:438-440`). This is fragile and now becomes security-relevant, because it is the sole activation trigger. Replace with a persisted `SubscriptionPaymentIntent` document keyed by the gateway order id, so activation looks up an intent rather than parsing an identifier.
- Webhook becomes the primary activation path; verify becomes the reconciliation path.

**Subscription flow updates**
- Activation moves from synchronous (request-time) to asynchronous (webhook-time), with verify as a synchronous fallback. Both must be idempotent against the same intent.

**Notification updates**
- `sendVendorOnboardingSuccessEmail` currently fires on the fabricated activation. It must move to fire on genuine activation, and must remain guarded by `onboardingEmailSentAt` so the webhook and verify paths cannot double-send.
- Admin notification on subscription activation (`billing.controller.js:26-43`) currently creates one row per admin. That duplication bug is owned by Phase 8; do not fix it here, but do not extend it either — the new grant flow must use a single `notifyAdmins` call.

**External services impacted:** none beyond Cashfree.

**Webhook requirements**
- The `sub_` webhook branch must tolerate out-of-order delivery (webhook arriving before the verify call and vice versa) and duplicate delivery. Reuse the claim/compare-and-set pattern already proven in `claimCheckoutSessionForProcessing`.

---

### Testing Requirements

**Unit**
- `activateSubscription` — refuses each invalid `activationSource`/`gatewayPaymentRef` combination; accepts `zero_price_plan` only when the resolved price is zero in the vendor's currency; refuses when the plan is inactive.
- `onboardingToken.service` — issue, verify, expiry, single-use consumption, wrong-purpose rejection, wrong-vendor rejection.
- `planSelection.service` — token TTL and single-use.

**Integration**
- Full onboarding: register → verify email → receive onboarding token → select plan → create intent → simulate webhook → assert activation with `activationSource: 'gateway_webhook'` and a non-null `gatewayPaymentRef`.
- Change-plan: assert no activation occurs without a webhook; assert activation is idempotent when webhook and verify both fire.
- Expired-vendor renewal: assert the flow completes end-to-end with an expired subscription (this is the regression trap).
- Zero-price plan: assert immediate activation with `activationSource: 'zero_price_plan'` and no gateway call.

**API**
- `POST /api/subscription/initiate` without a token → 401.
- `POST /api/subscription/initiate` with another vendor's token → 403.
- `POST /api/subscription/confirm` with an arbitrary email → no longer accepted; no vendor state disclosed.
- `POST /api/vendor/subscription/change-plan` → returns a checkout payload, and a follow-up read shows the subscription unchanged until webhook.
- `POST /api/admin/vendors/:id/grant-subscription` as admin (non-super) → 403; as superadmin without a reason → 400; as superadmin with a reason → 200 and an audit-log row.

**Frontend**
- Component tests for the payment-pending, token-expired, and price-delta states.
- Store test asserting the onboarding token is never written to the `vendor-token` key.

**E2E**
- W-30 and W-31 executed against a sandbox gateway, including the cancel-payment path.

**Security tests (these are the acceptance-defining tests)**
- **Attempt the original exploit verbatim:** unauthenticated `POST /api/subscription/initiate` with a known verified vendor email and the highest-priced plan id → must be rejected, and must leave zero new `VendorSubscription` and zero new `Payment` rows.
- Authenticated vendor calling `change-plan` repeatedly → zero activations without payment.
- Vendor A's onboarding token used against Vendor B's id → 403.
- Enumeration: identical response shape and timing for a known and unknown vendor email on every subscription endpoint.
- Replay: the same gateway webhook delivered twice → exactly one activation, one `Payment` row.

**Regression**
- W-29 (vendor registration), W-30, W-31, W-39 (admin vendor approval), and the full vendor-panel smoke — because `checkSubscription` gates every non-GET vendor route, an activation bug here silently disables the entire vendor panel.

---

### Verification Checklist

- [ ] Unauthenticated `POST /api/subscription/initiate` returns 401 and creates zero database rows (verified by row count before/after).
- [ ] `grep -rn "activateInternalSubscription" backend/src` returns zero results.
- [ ] Every call site of the replacement `activateSubscription` passes an explicit `activationSource`; no default exists in the signature.
- [ ] A `VendorSubscription` cannot be persisted with a gateway `activationSource` and a null `gatewayPaymentRef` (schema-level assertion, proven by a failing write test).
- [ ] `changePlan` produces no subscription state change until a webhook or verified payment arrives.
- [ ] An expired vendor can complete renewal end-to-end (explicit E2E evidence, screen recording attached to the ticket).
- [ ] A ₹0 plan still activates immediately with `activationSource: 'zero_price_plan'`.
- [ ] Duplicate webhook delivery produces exactly one activation and one `Payment` row.
- [ ] The reconciliation report has been produced, reviewed by the business, and a written decision recorded on legacy `internal` subscriptions.
- [ ] Admin grant is superadmin-only, reason-mandatory, and produces an `AdminActivityLog` row; the frontend action is hidden for non-superadmins.
- [ ] No subscription endpoint discloses vendor existence through status code, body, or timing.

---

### Rollback Strategy

**This is the hardest phase to roll back, because reverting restores a known-exploitable revenue bypass.** Plan accordingly.

- **Preferred rollback is forward-fix, not revert.** Ship behind a `Settings`-backed kill switch `billing.enforceGatewayActivation` (default true). If legitimate vendors are blocked, flip the switch to allow `admin_grant` activation without changing code, and process affected vendors manually while the defect is fixed. **The switch must never re-enable the unauthenticated route** — that route is deleted, not flagged.
- **Code revert** is possible for the frontend independently of the backend, because the backend accepts the onboarding token and rejects the email; an old frontend simply fails closed. Verify this asymmetry explicitly before release.
- **Schema changes are additive**; rolling back code leaves the new fields populated and harmless. No down-migration is required.
- **The backfill is idempotent** and sets a constant; re-running is safe.
- **Do not roll back the deletion of `POST /api/subscription/initiate`'s activation behaviour under any circumstance.** If the phase must be abandoned mid-flight, the minimum viable state is: route requires authentication, even if the rest of the intent/webhook work is incomplete.
- **Deploy order:** backend first (accepts both old and new payloads for one release), then frontend, then remove old-payload tolerance in the following release. This avoids a lockstep deploy on a revenue path.

---

# PHASE 2 — Payment Integrity: Pricing Consistency & Credential Safety

### Objective
Guarantee that the amount charged to the customer equals the sum of the orders created, that a detected mismatch halts the transaction instead of logging it, that per-order financial fields record the truth, and that saving admin settings cannot destroy the payment gateway credential.

### Business Impact
**Direct financial corruption today.** For any wholesale-capable vendor with price tiers, the customer is charged a bulk-discounted total while the order ledger records the undiscounted total — every such transaction silently under-collects or misreports. Separately, one click on the admin payment settings page overwrites the live Cashfree secret with the literal string `••••• (set)`, taking down all payments platform-wide. Both are single-line-class defects with outsized consequences.

### Risk Level
**Critical** — this phase edits the function that computes the amount sent to the payment gateway. A regression here mischarges real customers.

### Dependencies
Phase 0 (config contract, migration framework). Independent of Phase 1 and may run in parallel with it, but **both touch `cashfree.controller.js`** — coordinate branch ownership or sequence them.
**Blocks Phase 7** (checkout consolidation builds on a correct pricing summary) and **Phase 10** (reporting cannot be corrected while its inputs are wrong).

### Estimated Effort
**L — 14 eng-days**, 8 QA-days. BE2 (lead) + FE1 + ARCH review on the pricing invariant.

---

### Issues Covered

| ID | Finding |
|---|---|
| **B-2** | Customer charged a different amount than the created orders record — dead `Settings{key:'wholesale'}` inverts the wholesale flag in the summary path only |
| **B-5** | Saving admin payment settings overwrites the Cashfree secret with the redaction placeholder |
| **S-4** | Same, as a security finding — redaction sentinel round-trips through the write path |
| **D-5** | `Settings{key:'wholesale'}` has one reader and zero writers |
| **D-8** | `Order.discount` never written by the splitter; `couponDiscount` receives the full cart discount on every sub-order |
| **D-9** | `orderPayload.packagingFee` silently dropped — no such field on `Order` |
| **§3c** | Wholesale feature flag read from a key that has no writer |
| **§3d** | `assertPriceConsistency` cannot block anything — logs and returns, both call sites discard the result |
| **§3e** | Coupon discount recorded incorrectly on split orders |
| **§3g** | `calculateCheckoutSessionSummary` computes every group's pricing twice (moved here from Phase 11 because the duplicate loop must be removed *while* correcting the flag, not after) |
| **W-12** | Workflow: checkout (enterprise, online) |
| **W-43** | Workflow: admin settings (payment) |

---

### Root Cause Analysis

**B-2 / D-5 / §3c — two flag sources with opposite defaults.**
*Why it exists:* The wholesale marketplace flag was introduced in `featureFlags.service.js` reading `Settings{key:'features'}.wholesaleMarketplaceEnabled === true` (defaults **false**). `calculateCheckoutSessionSummary` was written separately — plausibly earlier, plausibly by a different author — reading `Settings{key:'wholesale'}.enabled !== false` (defaults **true**). The second key was never added to `SETTINGS_CATEGORY_SCHEMAS`, so the admin write endpoint rejects it and no seed script creates it. The document is unreachable, so the reader permanently resolves `true`.
*Files/modules affected:*
- `src/services/checkout/OrderSplitterEngine.js` — `calculateCheckoutSessionSummary` (lines 652-655 read, 663-699 first compute loop, 705-727 duplicate compute loop), `splitAndCreateOrders` (line 307 reads the correct flag), `computeGroupPricing` (consumes `wholesaleEnabled`)
- `src/services/featureFlags.service.js`
- `src/services/pricingEngine.service.js` — `resolvePriceForQuantity` consumes `vendorWholesaleEnabled`
- `src/modules/user/controllers/checkout.controller.js` — calls the summary
- `src/modules/payment/controllers/cashfree.controller.js` — sends `summary.grandTotal` to the gateway (line 84) and compares against it (line 274)

*Workflows impacted:* W-12 (online checkout) primarily; W-11 (COD checkout) inherits the same summary but confirms against orders created by the splitter, so the customer sees a total that does not match what they are asked to pay on delivery. W-24 and W-46 inherit corrupted amounts downstream.

*Potential side effects — the subtle ones:*
1. **Fixing the flag changes prices for real carts.** A wholesale-capable vendor's customer who sees ₹X today will see ₹Y after the fix (higher, because tier pricing stops applying when the flag is genuinely off). This is a *correction*, but it is a visible price change and needs business sign-off and a customer-communication decision before release.
2. **The direction of the fix is a business question, not an engineering one.** Two valid resolutions exist: (a) the summary is wrong and must respect `features.wholesaleMarketplaceEnabled`; (b) the flag should be on and the splitter is wrong. Engineering must not choose. **Recommended:** make the summary call `isWholesaleMarketplaceEnabled()` so both paths share one source, then let the business set the flag deliberately. This makes the behaviour explicit either way.
3. **Existing in-flight `CheckoutSession` documents** carry summaries computed under the old logic. Sessions created before the deploy and confirmed after it will mismatch. Drain or invalidate pending sessions at deploy, or accept a short window and reconcile.
4. **`assertPriceConsistency` will start firing** once it can block (see §3d) — on historical patterns it may reveal *other* mismatches this audit did not isolate. Expect discovery.

**§3d — the consistency check is decorative.**
*Why it exists:* `assertPriceConsistency` returns `{isConsistent, difference, details}` and `console.error`s on mismatch. Neither call site (`OrderSplitterEngine.js:544`, `user/order.controller.js:518`) reads the return value. It was written as observability and mistaken for a guard.
*Side effects:* Making it throw converts a silent corruption into a hard checkout failure. That is correct, but it must ship **after** B-2 is fixed, or every wholesale cart fails checkout on deploy day. **Sequencing is mandatory: fix the flag, observe zero mismatches for a soak period, then enforce.**

**B-5 / S-4 — redaction sentinel round-trip.**
*Why it exists:* `getSettingsByCategory` redacts nine secret field names to `'••••• (set)'` so the admin UI can show "configured" without exposing the value. The UI (`PaymentShippingSettings.jsx:29`) loads the entire returned object into `paymentData` state and posts it back verbatim on save (line 86). `paymentSchema` is `.unknown(true)`, so the sentinel is accepted and persisted. The redaction was added without a matching write-side guard.
*Files:* `src/modules/admin/controllers/settings.controller.js` (191-204 redact, 213-257 write), `src/modules/admin/validators/settings.validator.js` (47-53), `frontend/src/modules/Admin/pages/settings/PaymentShippingSettings.jsx`, `frontend/src/shared/store/settingsStore.js` (111-141).
*Workflows:* W-43. Also latent for `gateway` and `integrations` categories, which share the redaction branch.
*Potential side effects:* **The blast radius is total payment outage**, and it is silent — the settings page reports success. Note also that the only UI capable of *setting* these credentials (`Admin/components/Settings/PaymentSettings.jsx`) is unrouted dead code (DC group), so today a destroyed secret can only be restored via direct database access or environment variables. Phase 14 removes the dead component; this phase must therefore either restore a working credential screen or formally declare credentials env-only.

**D-8 / §3e — order financial fields record the wrong values.**
*Why it exists:* `orderPayload` in `splitAndCreateOrders` was assembled by copying fields from the pricing result, and two were mis-wired: `discount` was omitted entirely (so it defaults to 0), and `couponDiscount` was set from `coupon.discount` — the *cart-wide* figure — rather than `fgCouponDiscount`, the proportional share correctly computed 91 lines earlier and correctly written to the `FulfillmentGroup` and `vendorItems[].discount`.
*Files:* `src/services/checkout/OrderSplitterEngine.js:437-473`.
*Workflows:* every splitter-created order; all finance reporting (W-46, W-47); vendor settlement narratives.
*Side effects:* A 3-vendor split records 3× the actual coupon discount across orders. Any report summing `couponDiscount` across orders overstates discount. Any report summing `discount` reads zero. Phase 10 depends on this being corrected first.

**D-9 — `packagingFee` dropped.**
*Why it exists:* `Order` has no top-level `packagingFee` field; Mongoose strict mode discards it silently. The value survives in `vendorItems[0].packagingFee` and `quickCommerce.packagingFee`, so nothing visibly broke.
*Side effects:* Adding the field is safe and additive, but any aggregation written against it must account for historical orders where it is absent — `$ifNull` everywhere, or backfill from `vendorItems`.

**§3g — duplicate compute loop.**
*Why it exists:* A later fix (`P1-22`) needed `grandTotal` derived from `computeGroupPricing().total` rather than rebuilt from components. Rather than restructure the existing loop, a second identical loop was appended. For a Quick Commerce group this means up to 4× `computeGroupPricing` and 2× `buildQcDelivery` per checkout, each with its own `Settings.findOne` and geo maths.
*Side effects:* Collapsing the loops changes nothing functionally **provided** the accumulators and the grand total are derived from the same pass. This must be proven by a golden-value test against current output *after* the B-2 fix, not before.

---

### Backend Changes

**APIs requiring changes**

| Endpoint | Change |
|---|---|
| `POST /api/user/checkout/session` | Summary now computed with the unified wholesale flag; response `summary` values change for affected carts |
| `POST /api/user/checkout/confirm` | Inherits corrected summary; consistency check now enforcing |
| `POST /api/payments/cashfree/session` | Sends the corrected `grandTotal` |
| `POST /api/payments/cashfree/verify` | Existing amount comparison now compares two independently-correct values |
| `PUT /api/admin/settings/:category` | Rejects/strips the redaction sentinel before persisting |
| `GET /api/admin/settings/:category` | Returns an explicit `_redactedFields: []` array so the client can reason about it structurally instead of string-matching |

**Controllers**
- `admin/settings.controller.js` — `updateSettingsByCategory` gains a sentinel-strip step that runs **before** Joi validation: for each field in `SECRET_FIELDS`, if the submitted value equals the redaction sentinel (or is absent), preserve the stored value; only overwrite on a genuinely new value. Emit an audit log entry when a secret is changed, recording that it changed but never the value.
- `user/checkout.controller.js` — surface a typed `PRICE_CONSISTENCY_FAILED` error when the (now-enforcing) check trips, distinct from validation errors.

**Services**
- `checkout/OrderSplitterEngine.js` — the core of this phase:
  - `calculateCheckoutSessionSummary` reads `isWholesaleMarketplaceEnabled()`; the `Settings{key:'wholesale'}` read is deleted.
  - The two compute loops collapse into one; accumulators and `grandTotal` derive from the same `computeGroupPricing` result per group.
  - `splitAndCreateOrders` `orderPayload` gains `discount: pricing.discount` and corrects `couponDiscount` to the proportional `fgCouponDiscount`; `packagingFee` is retained only once the model field exists.
  - The post-commit block (events, commission creation, return) moves **out** of the transaction `try` into a `finally`-adjacent scope, so a throw after commit cannot call `abortTransaction()` on an ended session. *(This is §3f, owned by Phase 7 — but the code region is identical. Decision: implement the structural move here, and let Phase 7 own the behavioural work around retries. Record the overlap explicitly in both phases' tickets to avoid a merge conflict.)*
- `PriceReconciliationService.js` — `assertPriceConsistency` gains a `mode` parameter (`observe | enforce`) sourced from a `Settings`-backed kill switch `checkout.enforcePriceConsistency`. In `enforce` it throws a typed error. Default ships as `observe`; flips to `enforce` after soak.
- `featureFlags.service.js` — becomes the single wholesale-flag source. (Caching is Phase 11; do not add it here.)

**Models**
- `Order` — add top-level `packagingFee: { type: Number, default: 0 }`. Additive.
- No other model changes.

**Middleware** — none.

**Database schema updates** — see Database Changes.

**Validation updates**
- `paymentSchema` in `settings.validator.js` — add explicit optional string definitions for the nine secret fields with a custom rule rejecting the sentinel value outright, so the guard exists at two layers (controller strip + schema reject).

**Permission enforcement updates** — none in this phase. (`SETTINGS_EDIT` already gates the write route correctly.)

**Security improvements**
- Secrets can no longer be destroyed by a settings save.
- Secret changes are audit-logged as events without values.
- The `_redactedFields` contract removes the need for any client to string-match on `'••••• (set)'`.

---

### Frontend Changes

**Pages affected**
- `modules/Admin/pages/settings/PaymentShippingSettings.jsx` — stop round-tripping redacted values. Track which fields the server marked redacted (`_redactedFields`), render them as write-only inputs with a "leave blank to keep current" affordance, and omit untouched secret fields from the payload entirely.
- `modules/UserApp/pages/Checkout.jsx` — the summary values it renders may change; the price-changed messaging path must handle a `PRICE_CONSISTENCY_FAILED` response gracefully rather than showing a generic failure toast.
- `modules/UserApp/pages/OrderConfirmation.jsx` — displays session summary; verify it reads the corrected fields.

**Components affected**
- `modules/UserApp/components/Mobile/CheckoutOrderSummary.jsx` — packaging fee and discount lines must read from the corrected fields; confirm no component derives discount by subtraction from `total`.
- `shared/utils/cartTotals.js` — its header comment states it "mirrors the backend `placeOrder` arithmetic". `placeOrder` is the *legacy* engine being retired in Phase 7 and it is not the engine that computes the charged amount. Re-point this helper at the enterprise summary semantics, or reduce it to a display-only estimate clearly labelled as such.

**Forms affected**
- Admin payment settings form — secret fields become write-only with explicit clear/replace semantics.

**State management changes**
- `shared/store/settingsStore.js` — `fetchCategorySettings` must retain `_redactedFields` and `updateSettings` must not blindly forward the whole object for the `payment`, `gateway`, and `integrations` categories.

**API integration updates**
- Settings save payload becomes a partial update for secret-bearing categories.
- Checkout error handling gains the new typed code.

**UX changes**
- Secret fields show "Configured — leave blank to keep" rather than a masked value that looks editable.
- If a customer's cart total changes as a result of the flag correction, the checkout must surface a clear "prices updated" notice rather than silently re-rendering.

**Error handling updates**
- `PRICE_CONSISTENCY_FAILED` gets a dedicated, non-generic message with a "refresh cart" action, and must not be swallowed by the blanket `toastService.error(error)` in `api.js:258`.

---

### UI Changes

**Screens requiring modification**
1. Admin → Settings → Payment & Shipping
2. Customer checkout — order summary
3. Customer order confirmation

**New UI states**
- *Secret configured (write-only)* — a distinct visual treatment from an empty field and from an editable value.
- *Secret pending replacement* — user has typed a new value but not saved.
- *Price updated since you last looked* — checkout-level notice.
- *Price consistency failure* — blocking, recoverable, with a cart-refresh action.

**Empty states**
- Payment settings where no gateway credential has ever been configured — currently indistinguishable from "configured"; must be explicit, because the only UI that could set them is dead code.

**Validation states**
- Secret field: rejects the sentinel string if a user pastes it back; minimum-length hint per credential type.

**Loading states**
- Settings save: distinguish "saving" from "verifying credential" if a credential test is added.

**Success states**
- "Payment settings saved. Gateway secret unchanged." vs "…Gateway secret updated." — the distinction is the whole point of the fix and must be visible.

**Error states**
- Save rejected because a secret field contained the sentinel.

**Permission-based visibility rules**
- Secret fields visible only to holders of `SETTINGS_EDIT`; read-only holders (`SETTINGS_VIEW`) see the configured/not-configured indicator without the input. Backend enforces independently.

---

### Database Changes

**Collections impacted:** `orders`, `settings`, `checkoutsessions` (read-only impact), `adminactivitylogs`.

**Schema updates**
- `orders`: `+packagingFee` (Number, default 0).
- No index changes.

**Migrations**
- `0004_order_packaging_fee` — additive field. Backfill from `vendorItems[0].packagingFee` where present and non-zero, else `quickCommerce.packagingFee`, else 0. Batched, idempotent, resumable.
- `0005_purge_orphan_wholesale_settings_key` — delete any `Settings{key:'wholesale'}` document if one exists (none is expected; the migration asserts and records the count). Prevents a future reader from resurrecting the split-brain.

**Backfill requirements**
- `orders.packagingFee` as above. Read-only until Phase 10 consumes it.
- **No backfill of `discount`/`couponDiscount` on historical orders.** Historical values are wrong but they are the record of what was computed at the time. Correcting them retroactively would rewrite financial history. Instead, Phase 10's reporting must treat orders created before the fix date as a separate cohort, and the cutover timestamp must be recorded in the migration ledger.

**Data integrity checks**
- Pre-deploy: report the count and total value of `CheckoutSession` documents in `pending`/`processing` status, to size the in-flight drain.
- Post-deploy assertion: for every new order, `|Order.total − (subtotal + shipping + packagingFee + taxAddedToTotal − discount)| ≤ 0.01`.
- Post-deploy assertion: for every new multi-order session, `|session.summary.grandTotal − Σ order.total| ≤ 0.01`. This is the invariant B-2 violates; it becomes a monitored metric, not just a test.
- Ongoing: a daily reconciliation job flagging any session where the invariant fails, feeding the alerting introduced in Phase 15.

---

### Integration Changes

**Payment gateway**
- No API contract change. The amount sent changes for affected carts. Reconciliation with Cashfree settlement reports must be re-baselined after the cutover date.
- If Cashfree credentials were destroyed by B-5 in any environment, they must be re-established before this phase's testing can be meaningful — check every environment as a pre-condition.

**Subscription flow** — untouched (Phase 1 owns it), but note both phases modify `cashfree.controller.js`; coordinate.

**Notification updates** — none.

**External services impacted** — none.

**Webhook requirements**
- The webhook's existing amount-mismatch guard (`cashfree.controller.js:464`) becomes genuinely meaningful once the two sides are computed consistently. Its failure path currently marks the session failed and returns — confirm that behaviour is still correct now that mismatches should be impossible rather than routine.

---

### Testing Requirements

**Unit**
- `calculateCheckoutSessionSummary` vs `splitAndCreateOrders` — a property-style test over a matrix of carts (retail-only, wholesale-only, QC-only, mixed multi-vendor, coupon/no-coupon, tax-inclusive/exclusive, flag on/off) asserting the grand-total invariant holds in every combination. **This is the acceptance-defining test for B-2.**
- Golden-value test: the collapsed single loop produces byte-identical output to the previous double loop for a fixed fixture set (run against the pre-fix flag value to isolate the refactor from the correction).
- `assertPriceConsistency` — observe mode returns without throwing; enforce mode throws with a typed error and the correct detail payload.
- Coupon proportional split — for an N-vendor cart, `Σ order.couponDiscount === coupon.discount ± 0.01` and each order's value matches its `FulfillmentGroup`.
- Settings sentinel strip — sentinel preserved-not-overwritten; genuinely new value written; absent field preserved; non-secret fields unaffected.

**Integration**
- Full online checkout for a wholesale-capable vendor with tiers, flag off and flag on, asserting gateway amount == Σ order totals in both.
- COD checkout for the same carts.
- Admin saves payment settings without touching secrets → stored secret byte-identical afterwards (read directly from the database, not through the redacting endpoint).
- Admin saves a new secret → stored value updated, audit-log row created, value absent from the log.

**API**
- `PUT /api/admin/settings/payment` with the literal sentinel in `cashfreeSecretKey` → 400 or silently preserved (assert the stored value either way).
- `GET /api/admin/settings/payment` → `_redactedFields` present and accurate.
- Checkout session creation returns a summary whose `grandTotal` matches a subsequently-created order set.

**Frontend**
- Payment settings form: assert the save payload omits untouched secret fields entirely.
- Checkout: assert the `PRICE_CONSISTENCY_FAILED` code renders the dedicated state, not a generic toast.

**E2E**
- W-12 (online checkout) for each cart archetype in the matrix, against the sandbox gateway.
- W-43 (admin payment settings) save-and-verify-payments-still-work cycle: save settings → immediately place a test order → payment succeeds. **This is the regression that B-5 would otherwise cause, and it must be an automated E2E, not a manual check.**

**Security tests**
- Attempt to write the sentinel into every one of the nine `SECRET_FIELDS` across `payment`, `gateway`, and `integrations`.
- Confirm `GET` responses never contain a real secret value for any role including superadmin.
- Confirm the audit log records secret-change events without values.

**Regression**
- W-9, W-10, W-11, W-12, W-15, W-16, W-17, W-18 — the entire cart-to-payment corridor.
- W-27, W-28, W-34 — settlement figures derive from order totals.
- Full vendor earnings screen, because `Commission.subtotal` derives from group subtotals.

---

### Verification Checklist

- [ ] `grep -rn "key: 'wholesale'" backend/src` returns zero results.
- [ ] `calculateCheckoutSessionSummary` and `splitAndCreateOrders` both obtain the wholesale flag from `isWholesaleMarketplaceEnabled()` — verified by call-graph inspection, not by grep alone.
- [ ] The grand-total invariant test matrix passes for all cart archetypes with the flag both on and off.
- [ ] `computeGroupPricing` is invoked at most once per (fulfilmentType, vendor) group per summary computation — asserted with a call counter in test.
- [ ] `assertPriceConsistency` ships in `observe` mode; the soak dashboard shows **zero** mismatches over a minimum 7-day production window before the switch is flipped to `enforce`.
- [ ] `Order.discount` is non-zero on a new coupon order; `Σ Order.couponDiscount` across a multi-vendor split equals the cart coupon discount.
- [ ] `Order.packagingFee` is populated on new QC orders and backfilled on historical ones.
- [ ] Saving admin payment settings with untouched secrets leaves the stored `cashfreeSecretKey` byte-identical (verified by direct database read before and after).
- [ ] An end-to-end test proves a payment still succeeds immediately after a settings save.
- [ ] The in-flight `CheckoutSession` drain plan is documented and executed at deploy.
- [ ] A written business decision exists on the wholesale flag's intended production value, and the flag is set accordingly and deliberately.
- [ ] The daily grand-total reconciliation job is deployed and reporting zero failures.

---

### Rollback Strategy

- **Two independent kill switches, both `Settings`-backed, neither `NODE_ENV`-derived:**
  - `checkout.enforcePriceConsistency` — flip to `observe` instantly if the enforcing check produces false positives. This is the primary safety valve and it must be exercised in staging before release.
  - `features.wholesaleMarketplaceEnabled` — the business-facing flag. Flipping it changes prices, so it is a business decision, not an incident action.
- **The B-5 fix is trivially revertible and carries near-zero rollback risk** — it is a controller-level strip plus a schema rule. Ship it **first and separately** from the pricing work; it is the cheapest high-value change in the entire programme and should not be held hostage to Phase 2's larger scope. *Recommended: extract B-5/S-4 as a standalone hotfix release ahead of the rest of this phase.*
- **The pricing correction is not cleanly revertible in effect**, because orders created under the corrected logic are correct and orders created under a reverted logic are not. Rollback is therefore: flip `enforcePriceConsistency` to `observe`, redeploy the previous build, and accept that the mismatch resumes. Any orders created in the corrected window remain valid.
- **Schema changes are additive**; `packagingFee` defaults to 0 and is ignored by the previous build.
- **The `packagingFee` backfill is idempotent** (derived, not incremented) and safe to re-run.
- **Do not roll back migration `0005`.** Re-creating an orphan `wholesale` settings key would restore the split-brain.
- **Deploy order:** B-5 hotfix → drain in-flight sessions → pricing fix in `observe` mode → soak 7 days → `enforce`. Four separate releases, not one.

---

# PHASE 3 — Access Control & Data Exposure Remediation

### Objective
Close every broken-access-control and information-disclosure finding: delete the unguarded bulk-product router, add ownership checks where they are missing, and remove the enumeration and abuse vectors on public endpoints.

### Business Impact
Today any authenticated customer or delivery rider can download the entire product catalogue including every vendor's email address and cost prices, read every vendor's import history, and cancel any vendor's running import. Any unauthenticated caller who supplies an order id receives that order's full shipping address, phone, email, and line items. These are the findings that create regulatory and competitive exposure rather than direct revenue loss.

### Risk Level
**Medium-High** — the fixes are mostly deletions and guard additions, which are low-complexity, but the bulk router deletion must be proven unused before removal, and adding ownership checks can break flows that silently relied on their absence.

### Dependencies
Phase 0. Independent of Phases 1 and 2 except for shared ownership of `cashfree.controller.js` with both — **three phases touch that file; assign a single owner for the file across the sprint.**
**Blocks nothing**, but should precede Phase 9 (new features must not be built on an unguarded surface).

### Estimated Effort
**L — 16 eng-days**, 8 QA-days. BE3 (lead) + BE1 + FS1 for the upload/static work.

---

### Issues Covered

| ID | Finding |
|---|---|
| **B-4** | `/api/products/*` router: any authenticated user can export the catalogue, read/cancel any import, inject products into any vendor |
| **B-8** | Unauthenticated full-order PII disclosure via payment verify |
| **S-2** | Same as B-8, security framing |
| **S-3** | Same as B-4, security framing |
| **S-7** | Public unauthenticated translation API on a metered Google Cloud key |
| **S-8** | Stored XSS via unvalidated upload extension; `uploads/tmp` publicly served and never swept |
| **S-10 (order half)** | `createPaymentSession` accepts any `orderId` unauthenticated |
| **S-11** | IDOR on admin notification read — `findByIdAndUpdate` with no recipient filter |
| **S-12** | Unauthenticated, unbounded review "helpful" vote |
| **S-13** | Socket typing indicators bypass room authorisation |
| **S-14** | Committed PII — 8 tracked files including a real résumé |
| **S-15** | `express.json({limit:'50mb'})` applied globally |
| **S-16** | Unauthenticated coupon validation with no dedicated rate limit |
| **S-17** | Public feedback endpoint creates rows with no captcha/rate limit; misuses `recipientId` |
| **S-18** | CORS allowlist hardcodes a Vercel preview domain |
| **S-19** | `getScopeFromUrl` attaches the admin token to public API calls from admin pages |
| **S-20** | Public order tracking by `orderId` — enumeration only |
| **S-21** | `authenticate` trusts the JWT `role` claim; `enforceAccountStatus` does not re-validate role |
| **DC — live unguarded router** | `routes/bulkUpload.routes.js` and its mount at `app.js:137` |
| **W-16, W-53, W-58** | Workflow rows for payment verify, helpful vote, bulk upload |

---

### Root Cause Analysis

**B-4 / S-3 — a duplicate router mounted without guards.**
*Why it exists:* The bulk-upload handlers were written once and mounted three times: at `/api/admin/products/*` with full permission guards, at `/api/vendor/products/*` with vendor auth and subscription checks, and at `/api/products/*` with `authenticate` alone. The third mount is almost certainly the original prototype, kept for backward compatibility and never removed. The controllers then compensate for role only partially: `exportProductsCatalog` and `getImportHistory` branch on `user.role === 'vendor'` and fall through to an unfiltered query for everyone else; `checkJobStatus` and `cancelJobHandler` have no ownership logic at all; `startBulkUploadJob` takes `targetVendorId` from the request body.
*Files/modules affected:* `src/routes/bulkUpload.routes.js`, `src/app.js:137`, `src/controllers/bulkUpload.controller.js` (all nine handlers), `src/services/bulkUpload.service.js` (`exportProductsCatalog`, `startBulkUploadJob`, `validateBulkUpload`), `src/models/BulkImportHistory.model.js`.
*Workflows impacted:* W-33, W-58. Also every vendor's catalogue confidentiality and every vendor's import integrity.
*Potential side effects:*
1. **Verify the router is genuinely unused before deleting.** The audit confirmed the frontend calls only `/admin/*` and `/vendor/*`, but a mobile client, a partner script, or an internal tool could be calling `/api/products/*`. **Instrument before deleting:** log every request to the router for one release, confirm zero traffic, then remove. Deleting blind on a production system is how a partner integration breaks silently.
2. The `else if (targetVendorId)` fall-through exists so an **admin** can act on behalf of a vendor. That capability is legitimate and must be preserved on the admin mount while being removed from the unguarded one — the fix is not simply "always scope to `user.id`".

**B-8 / S-2 — ownership check applied to one branch and not the sibling.**
*Why it exists:* `verifyPayment` handles three sources. `checkSessionOwnership` was added to the CheckoutSession branch (line 257) during a prior security fix (the code carries a `P0-06 FIX` comment about sanitising session PII). The legacy Order branch at line 380 was not part of that fix and still returns the raw document.
*Files:* `src/modules/payment/controllers/cashfree.controller.js:380-393`, `src/routes/payment.routes.js:12`.
*Workflows:* W-16.
*Side effects:* The route is `optionalAuth` **by design**, to support guest checkout. Naively requiring authentication breaks guest payment verification. The correct fix is per-branch ownership: authenticated user must own the order; guest must present a matching order-scoped proof (the same `orderId` + email/phone pair used at placement), and the response must use the existing `sanitizeCheckoutSessionResponse`-style allowlist rather than the raw document.

**S-7 — public metered API.**
*Why it exists:* `translationRoutes.js` carries the comment "Translation endpoints are completely public" — it was an intentional decision for an anonymous storefront that needs translation before login. The cost consequence was not considered.
*Files:* `src/routes/translationRoutes.js`, `src/controllers/translationController.js`, `src/services/translationService.js`, `frontend/src/services/translationService.js`, `frontend/src/utils/translationCache.js`, `frontend/src/hooks/{useDynamicTranslation,usePageTranslation}.jsx`.
*Workflows:* every storefront page render in a non-default language.
*Side effects:* Adding authentication breaks anonymous browsing in translated languages. The correct fix is **not** auth — it is a strict per-IP rate limit, a server-side response cache keyed on `(text, targetLang)` with a long TTL, a maximum payload size and batch length, and a hard monthly spend cap with a graceful "untranslated" fallback. A translation cache also removes most of the cost structurally.

**S-8 — extension trusted, MIME client-supplied, tmp publicly served.**
*Why it exists:* Three independently reasonable decisions compose badly: multer's `fileFilter` checks `file.mimetype` (which is the client's `Content-Type`, not sniffed content); `filename` sanitises the base name but preserves `path.extname(file.originalname)` verbatim; `app.js:126-135` serves `../uploads` statically so that Cloudinary-bound temp files are reachable during processing.
*Files:* `src/middlewares/upload.js:27-55`, `src/app.js:126-135`, `src/services/upload.service.js`.
*Workflows:* product image upload, vendor document upload, support attachment, delivery registration documents.
*Side effects:* The tmp directory is *supposed* to be transient — cleanup runs only after a successful Cloudinary upload, and the audit found five orphaned files from April. Fixing the extension does not fix the exposure; the directory should not be publicly served at all. Removing the static mount may break any historical stored URL that points at `/uploads/tmp/...` — audit stored URLs before removing.

**S-11 — service-layer scoping bypassed by a controller.**
*Why it exists:* `notification.service.js` implements correctly-scoped `markAsRead(notificationId, recipientId, recipientType)`. The admin controller does not call it; it calls `Notification.findByIdAndUpdate` directly. A convenience shortcut that skipped the scoped helper.

**S-12 — endpoint registered without auth.**
*Why it exists:* `router.post('/reviews/:id/helpful', reviewController.voteHelpful)` sits between two `customerAuth` routes in `user.routes.js:68-70`; the omission looks accidental. There is also no per-user vote record, so even with auth the counter could be inflated by one user repeatedly.

**S-13 — `socket.to()` semantics misunderstood.**
*Why it exists:* `join_conversation` and `join_order_tracking` were correctly hardened with DB-backed authorisation, but `typing_start`/`typing_stop` were left as pass-throughs. `socket.to(room).emit()` delivers to the room regardless of the sender's membership, so authorisation on *join* does not imply authorisation on *emit*.

**S-14 — uploads committed.**
*Why it exists:* `backend/public/uploads/` and `backend/uploads/` were not in `.gitignore` when the first test uploads were made. Eight files are tracked, including three copies of a real person's résumé.
*Side effects:* **Removing the files from HEAD does not remove them from history.** A decision is required: accept history (rotate nothing, files remain in clones) or rewrite history (`filter-repo`) and force-push, which invalidates every existing clone and any open branch. Given these are PII, history rewrite is the defensible choice, but it is a coordinated team event, not a code change.

**S-15 — global 50 MB body limit.**
*Why it exists:* Raised to accommodate bulk-upload JSON payloads (`processUpload` posts validated rows as JSON). Applied globally rather than per-route.
*Side effects:* Lowering it globally will break `processUpload` for large imports. The fix is a small global default with a raised limit on the specific bulk routes only.

**S-16 / S-17 — public write endpoints without abuse controls.**
*Why they exist:* Both are storefront conveniences added without rate limits. S-17 additionally sets `recipientId: newFeedback._id` on the admin notification — using the feedback's own id as a recipient — because the schema required an ObjectId and no admin id was to hand. `notifyAdmins` was later written to solve exactly this; the feedback route predates it.

**S-19 — scope inferred from page path.**
*Why it exists:* `getScopeFromUrl` falls back to `window.location.pathname` when the request URL has no scope prefix, so a `/products` call made from an admin page resolves to the `admin` scope and attaches the admin token. Convenient for admin-context calls; over-broad for public endpoints.

**S-21 — role trusted from the token.**
*Why it exists:* `authenticate` sets `req.user = decoded` including `role`. `enforceAccountStatus` re-reads the account and validates status but branches on `req.user.role` rather than the persisted role. A token issued before a role change retains the old role until expiry. Access-token TTL is short (`JWT_EXPIRES_IN` defaults to 15m, `.env` sets `1d` — note the discrepancy), which bounds but does not eliminate the window.

---

### Backend Changes

**APIs requiring changes**

| Endpoint | Change |
|---|---|
| `/api/products/*` (9 endpoints) | **Instrument for one release, then delete the router and its mount** |
| `POST /api/payments/cashfree/verify` | Per-branch ownership; sanitised response for the legacy order branch |
| `POST /api/payments/cashfree/session` | Ownership check on the `orderId` branch |
| `POST /api/v1/translate`, `/batch`, `/object` | Dedicated strict rate limiter, payload/batch caps, server-side cache, spend guard |
| `PUT /api/admin/notifications/:id/read` | Route through the scoped service helper |
| `POST /api/user/reviews/:id/helpful` | Require `customerAuth`; add per-user vote uniqueness |
| `POST /api/coupons/validate` | Dedicated rate limiter |
| `POST /api/feedback` | Rate limiter; use `notifyAdmins`; stop misusing `recipientId` |
| `GET /api/orders/track/:id` | Add a light rate limiter (field selection already minimal) |
| `/uploads/tmp/*` | Remove from the public static mount |

**Controllers**
- `bulkUpload.controller.js` — `checkJobStatus` and `cancelJobHandler` gain ownership resolution against `BulkImportHistory.uploadedBy.id` / `vendorId`; `getImportHistory` and `exportProducts` require an explicit admin capability for the cross-vendor branch instead of falling through on "not a vendor".
- `cashfree.controller.js` — legacy-order branch ownership and response sanitisation.
- `admin/notification.controller.js` — delegate `markAsRead`/`markAllAsRead` to `notification.service.js`.
- `user/review.controller.js` — `voteHelpful` becomes authenticated and idempotent per user.
- Feedback handler in `public.routes.js` — switch to `notifyAdmins`.

**Services**
- `bulkUpload.service.js` — `exportProductsCatalog` and `startBulkUploadJob` take an explicit, caller-supplied scope object rather than inferring from `user.role`; `targetVendorId` is only honoured when the scope grants cross-vendor authority.
- `translationService.js` — add a persistent cache layer and a spend guard.
- New `uploadRetention.service.js` — sweeps `uploads/tmp` on an interval, with an age threshold.

**Models**
- New `ReviewHelpfulVote` `{ reviewId, userId, createdAt }` with a unique compound index — makes the vote idempotent per user.
- `Notification` — no schema change, but the feedback route stops writing a nonsense `recipientId`.
- New `TranslationCache` `{ sourceHash, targetLang, text, createdAt }` with a TTL index (or Redis in Phase 12; start with Mongo to avoid a dependency).

**Middleware**
- `upload.js` — derive the stored extension from an **allowlist keyed on the sniffed content type**, not from the original filename; reject on mismatch between declared MIME and sniffed content.
- `app.js` — replace the global `express.json({limit:'50mb'})` with a modest global default and a per-route override on the bulk endpoints; remove `/uploads/tmp` from the static mount; move the CORS allowlist to configuration.
- New `translationLimiter`, `couponValidateLimiter`, `feedbackLimiter`, `publicTrackingLimiter` in `rateLimiter.js`.
- `authenticate` / `enforceAccountStatus` — `enforceAccountStatus` already loads the account; extend it to overwrite `req.user.role` from the persisted record so a stale token role cannot be used (S-21).

**Database schema updates** — see Database Changes.

**Validation updates**
- Translation endpoints: maximum text length, maximum batch size, allowed target-language allowlist.
- Feedback: length caps on all free-text fields.

**Permission enforcement updates**
- Cross-vendor bulk operations require an explicit permission check on the admin mount (aligns with Phase 8's broader work; the token choice must be agreed with that phase to avoid inventing a duplicate).

**Security improvements**
- Delete an entire unguarded router.
- Ownership on two payment endpoints.
- Content-sniffed upload validation; tmp no longer public; tmp swept.
- Abuse controls on four public write endpoints.
- Socket emit-side authorisation.
- Role re-validated from persistence on every request.

---

### Frontend Changes

**Pages affected**
- `modules/Admin/pages/support/Tickets.jsx` and any admin notification consumer — behaviour unchanged, but confirm nothing relied on the unscoped `markAsRead`.
- `modules/UserApp/pages/ProductDetail.jsx` — the "helpful" control must now require login and reflect the user's own vote state.
- `modules/UserApp/pages/Checkout.jsx` / `PaymentReturn.jsx` — guest payment verification must send whatever guest proof the backend now requires.

**Components affected**
- `shared/components/Product/ReviewItem.jsx` *(currently unreferenced dead code — see Phase 14; if the helpful control lives elsewhere, locate the live component before editing)*.
- `shared/components/ProductReviewCard.jsx` — likely the live review renderer; add voted/not-voted state.
- Upload-consuming components: `BulkUploadModal.jsx`, vendor `MediaSection.jsx`, `Documents.jsx`, support attachment — surface the new rejection reason when content sniffing fails.

**Forms affected**
- Feedback form — handle a rate-limit response.
- Coupon apply — handle a rate-limit response distinctly from "invalid code".

**State management changes**
- `shared/utils/api.js` — `getScopeFromUrl` must not attach a privileged token to unprefixed public endpoints (S-19). Introduce an explicit public-endpoint list or require callers to opt into a scope.
- Review store: track the current user's vote per review.

**API integration updates**
- Guest payment verification payload.
- Helpful-vote endpoint now authenticated; unauthenticated users get a login prompt rather than a silent failure.

**UX changes**
- "Helpful" becomes a login-gated, one-per-user toggle rather than an unlimited counter.
- Rate-limited actions show a clear cooldown message.

**Error handling updates**
- Distinguish 429 from 400 across coupon validate, feedback, and translation, and never show a raw "Too many requests" toast for a background translation call — fall back to untranslated text silently.

---

### UI Changes

**Screens requiring modification**
1. Product detail — review helpful control
2. Feedback form
3. Checkout — coupon field
4. Vendor/admin bulk upload modal
5. Vendor documents upload
6. Support attachment upload

**New UI states**
- *Vote recorded / already voted* — the control reflects persisted per-user state.
- *Login required to vote.*
- *Rate limited* — with a human-readable retry hint, on coupon, feedback, and upload.
- *Upload rejected: file content does not match its extension* — a distinct, actionable message, not a generic "invalid file type".

**Empty states**
- Import history for a user with no imports — currently a non-vendor sees everyone's; after the fix they see their own, which may be empty.

**Validation states**
- Upload: pre-submit client-side extension check that mirrors the server allowlist (advisory only; the server remains authoritative).

**Loading states** — unchanged.

**Success states**
- Vote recorded, with the count updating optimistically and reconciling on response.

**Error states**
- 429 on coupon/feedback; 403 on cross-vendor bulk actions; 401 on helpful vote.

**Permission-based visibility rules**
- Cross-vendor import history and catalogue export controls render only for users holding the admin capability; the vendor variant is scoped implicitly.

---

### Database Changes

**Collections impacted:** `reviews` (via new vote collection), `notifications`, `bulkimporthistories`, `translationcaches` (new), `reviewhelpfulvotes` (new).

**Schema updates**
- New `reviewhelpfulvotes` with unique `{ reviewId, userId }`.
- New `translationcaches` with `{ sourceHash, targetLang }` unique and a TTL index.
- `bulkimporthistories` — add an index on `{ 'uploadedBy.id': 1, createdAt: -1 }` to back the newly-scoped history query.

**Migrations**
- `0006_review_helpful_votes` — creates the collection and index. **No backfill is possible**: existing `helpfulCount` values are unattributable. Decision required: retain the historical counts as an opaque baseline, or reset to zero. **Recommended: retain, and record the cutover date**, since resetting destroys legitimate signal along with the inflated portion.
- `0007_translation_cache` — creates the collection, indexes, TTL.
- `0008_bulk_import_history_index` — index only, built in the background.

**Backfill requirements**
- None mandatory. The `helpfulCount` decision above is the only judgement call.

**Data integrity checks**
- Report reviews whose `helpfulCount` is implausible relative to the product's `reviewCount` — evidence for the retain-vs-reset decision.
- Confirm zero `Notification` documents are created with `recipientId` equal to a `Feedback` `_id` after the fix.
- Confirm the `uploads/tmp` sweeper reduces the directory to zero files older than the threshold.

---

### Integration Changes

**Payment gateway** — no contract change; ownership checks are local. Guest verification proof must be agreed with the frontend before implementation.

**Subscription flow** — untouched here; Phase 1 owns the subscription branch of the same controller.

**Notification updates**
- Feedback notifications route through `notifyAdmins`, producing one row instead of a misattributed one.
- Socket typing events gain authorisation, which may reduce event volume — confirm the frontend does not depend on receiving its own echo.

**External services impacted**
- **Google Cloud Translate** — the cache plus rate limits should materially reduce spend. Establish the current monthly baseline before the change so the reduction is measurable, and configure a hard budget alert on the GCP project independently of application code.
- **Cloudinary** — unaffected functionally, but removing the public tmp mount means any URL pattern that pointed at tmp instead of Cloudinary must be found and corrected first.

**Webhook requirements** — none.

---

### Testing Requirements

**Unit**
- Bulk-upload scope resolution: vendor scope, admin cross-vendor scope, and an unauthorised role — asserted per handler, all nine.
- Upload content sniffing: matched, mismatched, extensionless, double-extension (`x.png.html`), and a polyglot file.
- `voteHelpful` idempotency per user.
- Rate limiters: boundary behaviour at the limit and one over.

**Integration**
- Authenticated customer calls every `/api/products/*` endpoint → all rejected (during the instrumentation release, assert they are *logged*; after removal, assert 404).
- Vendor A attempts to read and cancel Vendor B's import job → 403 on both.
- Admin cross-vendor export still works with the correct capability.

**API**
- `POST /api/payments/cashfree/verify` with another user's order id, authenticated → 403; unauthenticated → no PII in the body.
- `PUT /api/admin/notifications/:id/read` for a customer's notification → 403/404, and the notification remains unread.
- Translation: oversized text, oversized batch, disallowed target language, and over-limit request rate.

**Frontend**
- `getScopeFromUrl` unit test: a `/products` request from an `/admin/*` page carries no Authorization header.
- Helpful-vote component: unauthenticated → login prompt; already voted → disabled.

**E2E**
- W-16 (payment verify) for authenticated and guest.
- W-53 (helpful vote).
- W-58 (bulk upload) via the admin and vendor mounts, confirming the `/api/products` mount is gone.

**Security tests (acceptance-defining)**
- **Replay each audit exploit verbatim:** catalogue export as a customer; import-history read as a rider; cancel another vendor's job; unauthenticated order PII via verify; upload `payload.html` declared as `image/png` and attempt to fetch it from `/uploads/...`; inject a typing event into a foreign conversation room; unbounded helpful-vote loop. **Every one must fail after the phase, and each is recorded as a named regression test.**
- Confirm history-rewrite (or the accepted alternative) for the eight tracked PII files, and that `.gitignore` prevents recurrence.
- Confirm the CORS allowlist no longer hardcodes the Vercel preview domain and is environment-driven.

**Regression**
- W-6, W-7, W-9, W-10 (catalogue and cart, affected by the api.js scope change).
- W-32, W-33 (vendor product CRUD and bulk import).
- W-50 (support chat, affected by the socket change).
- All four upload surfaces.

---

### Verification Checklist

- [ ] One full release has run with `/api/products/*` instrumented, and the traffic log shows **zero** requests from any client before deletion.
- [ ] `grep -rn "bulkUploadRoutes" backend/src` returns zero results after removal.
- [ ] An authenticated non-vendor cannot export the catalogue, read cross-vendor import history, or cancel another vendor's job — proven by three named security tests.
- [ ] `POST /api/payments/cashfree/verify` returns no `shippingAddress`, `guestInfo`, or line-item detail to a non-owner, for both the session and legacy-order branches.
- [ ] Uploading a file whose sniffed content contradicts its extension is rejected; the stored filename's extension is derived from sniffed content.
- [ ] `/uploads/tmp/*` returns 404 from the public origin.
- [ ] The tmp sweeper runs on schedule and the directory holds zero files older than the retention threshold.
- [ ] Helpful votes are one-per-user and require authentication.
- [ ] Coupon validate, feedback, translation, and public tracking each have a dedicated limiter distinct from `apiLimiter`.
- [ ] Typing events emitted into a conversation the socket has not joined are dropped.
- [ ] `enforceAccountStatus` overwrites `req.user.role` from persistence — proven by a test using a token minted with a stale role.
- [ ] Global JSON body limit is reduced; bulk routes carry an explicit override; a payload above the global limit on a non-bulk route is rejected.
- [ ] The eight tracked PII files are removed from HEAD, `.gitignore` covers both upload trees, and a written decision exists on history rewrite.
- [ ] A Google Cloud Translate budget alert is configured, and post-change spend is measurably below the pre-change baseline.

---

### Rollback Strategy

- **Ship as four independent releases**, because they have unrelated blast radii and reverting one must not revert the others:
  1. Ownership checks + notification IDOR + helpful vote + socket typing (pure guard additions)
  2. Rate limiters + body-limit change + CORS externalisation
  3. Upload content sniffing + tmp static removal + sweeper
  4. `/api/products/*` instrumentation → (next release) deletion
- **The router deletion is the only irreversible-feeling step**, and it is fully reversible by restoring two files. The instrumentation release is precisely the mechanism that makes it safe; do not skip it to save a cycle.
- **Rate limiters must be `Settings`-tunable at runtime**, not constants — if a legitimate client trips a limit in production, the response must be a value change, not a deploy.
- **The tmp static-mount removal is the highest-regression-risk item**: audit stored URLs first. If any persisted record points at `/uploads/tmp/...`, migrate those assets to Cloudinary *before* removing the mount, and keep the mount behind a signed-token guard (reusing the delivery-docs pattern from `app.js:41-55`) as an intermediate step rather than deleting it outright.
- **The upload sniffing change can reject files the old code accepted.** Ship it in log-only mode for one release, review what would have been rejected, then enforce.
- **`getScopeFromUrl` is the riskiest frontend change** — over-restricting it silently drops the Authorization header from calls that legitimately needed it. Ship with a temporary console warning when a scope is downgraded, and review before removing the warning.
- **History rewrite for the PII files is not rollback-able and is not a code change.** Schedule it as a coordinated team event with a documented cut-off, or accept history and document that decision. Do not attempt it as part of a normal release.

---

# PHASE 4 — Refund & Money-Movement Pipeline

### Objective
Build the refund capability the application does not have: real gateway refunds, a refund ledger, correct reversal of every downstream financial effect, and a customer-visible refund lifecycle. Replace the four places where code sets `paymentStatus = 'refunded'` and moves no money.

### Business Impact
Customers are currently told they have been refunded and receive nothing. This is the finding most likely to produce chargebacks, payment-processor penalties, and consumer-protection complaints. It also blocks the entire returns business process from functioning as designed — the return workflow is fully built and terminates in a lie.

### Risk Level
**Critical** — this phase introduces outbound money movement where none existed. Every defect is a direct financial loss in one direction or the other (double refund, or refund recorded but not issued).

### Dependencies
Phase 0 (migrations), **Phase 2 (order financial fields must be correct before refund amounts are derived from them)**, and Phase 5 shares the commission-reversal surface — sequence Phase 4 before Phase 5 or agree the boundary explicitly.
**Blocks Phase 10** (refund reporting is meaningless without refund data).

### Estimated Effort
**XL — 22 eng-days**, 12 QA-days. BE1 (lead) + BE2 + FE2 + ARCH design review on the ledger model.

---

### Issues Covered

| ID | Finding |
|---|---|
| **B-3** | No refund execution anywhere — every refund path sets a DB string and moves no money |
| **M-1** | Missing: payment refund execution |
| **§4** | Payments module — no refund pipeline; `cashfree.service.js` exports four functions, none a refund |
| **§8** | Admin refund override flips a string only (`admin/order.controller.js:542-546`) |
| **§8** | Return approval sets `paymentStatus = 'refunded'` (`vendor/return.controller.js:277`) |
| **§9** | QC partial fulfilment records a refund breakdown that is never paid (`quickCommerceFulfilment.service.js:89,163`) |
| **W-24** | Workflow: refund (money movement) |
| **W-47 (partial)** | Refund reporting depends on this data existing |

---

### Root Cause Analysis

**B-3 / M-1 — refund was modelled but never implemented.**
*Why it exists:* The domain model anticipates refunds thoroughly — `Order.paymentStatus` has `refunded` and `partially_refunded`; `CheckoutSession.paymentAllocationLedger[].refunded` exists as a number; `ReturnRequest` has `refundAmount` and `refundStatus`; `Notification` has `REFUND` category and type; `MARKETPLACE_EVENTS.PAYMENT_REFUNDED` and `RETURN_REFUNDED` are defined; a `REFUNDS_VIEW` permission exists. Every *representation* of a refund is present. The *execution* — a call to the gateway's refund API — was never written. This is a classic case of the schema being completed ahead of the integration and the gap never being closed.
*Files/modules affected:*
- `src/services/billing/cashfree.service.js` — no refund function exists; must be added
- `src/modules/payment/controllers/cashfree.controller.js` — webhook must handle refund events
- `src/modules/admin/controllers/order.controller.js:518-549` — `deliveryOverride` refund action
- `src/modules/admin/controllers/return.controller.js:170-232` — admin return status transitions
- `src/modules/vendor/controllers/return.controller.js:152-277` — vendor return status transitions
- `src/services/quickCommerceFulfilment.service.js:89-163` — partial-fulfilment refund breakdown
- `src/modules/user/controllers/order.controller.js:804-936` — `cancelOrder` (paid orders currently cannot reach it; see Phase 7)
- `src/models/{Order,ReturnRequest,Payment,CheckoutSession}.model.js`
- `src/services/wallet/riderEarnings.service.js` — earning reversal already exists and must be wired to refunds
- `src/services/commission.service.js` — commission reversal on refund

*Workflows impacted:* W-22 (cancel), W-23 (return request), W-24 (refund), W-26 (delivery failure), W-34 (vendor payout — a refunded order's commission must not be payable), W-46/W-47 (finance reporting).

*Potential side effects — this phase has the most:*
1. **Refunds must reverse four downstream effects, not one.** Issuing money back is necessary but insufficient. A refund must also: reverse the vendor's `Commission` record, reverse the rider's earning if the order was delivered (the reversal function already exists — `riderEarnings.service.js:212-271`), restore stock if the goods come back, and adjust the COD cash ledger if the order was cash-collected. Missing any one leaves the platform paying out on revenue it refunded.
2. **COD orders have no gateway payment to refund.** A COD refund is a physical or bank-transfer operation, not an API call. The pipeline must branch on payment method and support a manual-settlement path with proof-of-payment capture — otherwise COD returns are silently unrefundable.
3. **Partial refunds against a split order.** An order created by the splitter is one of N sub-orders sharing a single gateway payment keyed on `CheckoutSession.sessionId`. A refund for one sub-order is a *partial* refund of the gateway order. The `paymentAllocationLedger` was designed for exactly this and is currently written once and never updated — it must become a live ledger.
4. **Idempotency is mandatory.** A double-submitted refund is real money lost. Every refund must carry a client-supplied or server-derived idempotency key, and the gateway's own refund idempotency semantics must be used in addition, not instead.
5. **Refunds are asynchronous.** Cashfree refunds settle over days and emit their own webhook events. A refund is not "done" when the API returns 200; it is `initiated`. The UI must not claim completion, and the audit's existing pattern of instant `refundStatus: 'processed'` must be replaced with a real state machine.
6. **The `REFUNDS_VIEW` permission exists and is enforced nowhere** (S-5, Phase 8). This phase creates the surface that permission should guard; coordinate with Phase 8 so the token is wired when the screens land.

**§9 — QC partial fulfilment computes refunds it cannot issue.**
*Why it exists:* `quickCommerceFulfilment.service.js` correctly computes a per-item refund breakdown including proportional tax and discount, writes it to `Order.fulfilmentOutcome.refundAmount`, sets `refundStatus`, and notifies the customer "Item Unavailable — Refund Initiated". No refund is initiated. The notification is the most damaging part: it makes an explicit promise.

---

### Backend Changes

**APIs requiring changes / added**

| Endpoint | Status | Purpose |
|---|---|---|
| `POST /api/admin/refunds` | **New** | Initiate a refund against an order or return request; idempotent |
| `GET /api/admin/refunds` | **New** | Refund queue with status, ageing, and failure reasons |
| `GET /api/admin/refunds/:id` | **New** | Refund detail with gateway trace and reversal effects |
| `POST /api/admin/refunds/:id/retry` | **New** | Retry a failed refund |
| `POST /api/admin/refunds/:id/mark-manual-settled` | **New** | COD/offline settlement with proof reference; audit-logged |
| `GET /api/user/refunds` | **New** | Customer-visible refund status |
| `POST /api/payments/cashfree/webhook` | Changed | Handle `REFUND_STATUS_WEBHOOK` events |
| `PATCH /api/admin/return-requests/:id/status` | Changed | Approving a refund-bearing return enqueues a refund instead of flipping a flag |
| `PATCH /api/vendor/return-requests/:id/status` | Changed | Same |
| `POST /api/admin/orders/:id/delivery-override` | Changed | The `refund` action enqueues a refund |
| `POST /api/vendor/orders/:id/partial-fulfilment` | Changed | Enqueues a refund for unavailable items |

**Controllers**
- New `admin/refund.controller.js` — queue, detail, initiate, retry, manual-settle.
- New `user/refund.controller.js` — read-only customer view.
- `admin/order.controller.js` — `deliveryOverride` refund branch delegates to the refund service.
- `admin/return.controller.js` + `vendor/return.controller.js` — status transitions to a refund-bearing state enqueue a refund; they no longer set `paymentStatus` directly.
- `cashfree.controller.js` — new webhook branch for refund lifecycle events.

**Services**
- New `refund/RefundOrchestrator.service.js` — the single entry point. Responsibilities: validate refundability, compute the authoritative amount, allocate against the `paymentAllocationLedger`, create the `Refund` record, call the gateway (or route to manual), and on confirmation trigger reversals.
- New `refund/RefundReversalService.js` — reverses commission, rider earning, COD cash ledger, and stock, each idempotently and each recorded on the `Refund` document so partial failure is visible and resumable.
- `billing/cashfree.service.js` — add `createCashfreeRefund({ orderId, refundId, amount, note })` and `fetchCashfreeRefund`. Must send a gateway-level idempotency key.
- `commission.service.js` — add `reverseCommissionForRefund(orderId, amount)`; must handle the case where the commission is already `requested` or `paid` in a `Settlement` (Phase 5 owns settlement state; agree the contract).
- `wallet/riderEarnings.service.js` — already has reversal; wire it to the refund event rather than only to admin action.
- `deliveryCash.service.js` — add a COD-refund adjustment path.
- `quickCommerceFulfilment.service.js` — replace the fabricated `refundStatus` with a real enqueue.
- `events/marketplaceEventBus.js` — `PAYMENT_REFUNDED` and `RETURN_REFUNDED` gain real emitters and handlers.
- `events/RetryQueueService.js` — register a `REFUND_SETTLEMENT` job type so failed gateway calls retry durably (the persistent retry queue and `FailedJob` model already exist and are currently write-only — this gives them a second real consumer).

**Models**
- New `Refund`: `{ refundNumber, orderId, checkoutSessionId, returnRequestId, userId, vendorId, amount, currency, reason, refundType (full|partial|item_level), method (gateway|manual_bank|manual_cash), status (requested|initiated|processing|succeeded|failed|cancelled), gatewayRefundId, gatewayStatus, idempotencyKey (unique), initiatedBy, approvedBy, manualProofRef, reversals: { commission, riderEarning, codLedger, stock } each with status+ref, requestedAt, initiatedAt, settledAt, failedAt, failureReason }`. Unique index on `idempotencyKey`; partial unique index preventing two open refunds for the same `(orderId, returnRequestId)`.
- `Order` — `+refundedAmount` (Number, default 0), `+refundState`. `paymentStatus` transitions to `partially_refunded`/`refunded` become derived from `refundedAmount` vs `total`, not set directly.
- `CheckoutSession` — `paymentAllocationLedger[].refunded` becomes live; add `refundedTotal`.
- `ReturnRequest` — `+refundId` linking to the `Refund` record; `refundStatus` becomes a mirror of the refund's status rather than an independent flag.
- `Payment` — `+refundedAmount`.

**Middleware** — none new. Refund endpoints use existing admin auth plus the permission work below.

**Database schema updates** — see Database Changes.

**Validation updates**
- Refund initiation: amount must be > 0 and ≤ (order total − already refunded); reason mandatory; item-level refunds validated against order line quantities.
- Manual settlement: proof reference mandatory, minimum length.

**Permission enforcement updates**
- `REFUNDS_VIEW` gates the refund queue and detail. A new `REFUNDS_EXECUTE` (or reuse of `WALLET_EDIT`) gates initiation, retry, and manual settlement — **the choice must be made with Phase 8**, and whichever token is chosen must be enforced in the same PR that adds the route (guardrail 4).
- Manual settlement should require a higher bar than gateway refunds, since it asserts money moved outside the system.

**Security improvements**
- Every refund is idempotent at two layers (local unique key + gateway key).
- Every refund is audit-logged with actor, amount, reason, and reversal outcomes.
- Refund amounts are always server-computed; a client-supplied amount is validated against the order, never trusted.

---

### Frontend Changes

**Pages affected**
- **New** `modules/Admin/pages/finance/Refunds.jsx` — the refund queue (initiate, retry, manual-settle, filter by status/ageing).
- **New** `modules/Admin/pages/finance/RefundDetail.jsx` — gateway trace, reversal status per effect, audit trail.
- `modules/Admin/pages/finance/RefundReports.jsx` — currently derives "refunds" from `ReturnRequest` records; must re-point at real `Refund` data. *(The report's correctness work is Phase 10; the data-source switch is here.)*
- `modules/Admin/pages/ReturnRequestDetail.jsx` — approving a refund-bearing return now shows a refund being enqueued, with its status.
- `modules/Admin/pages/OrderDetail.jsx` — refund action and refunded-amount display.
- `modules/Vendor/pages/returns/ReturnRequestDetail.jsx` — vendor sees refund status but cannot initiate gateway refunds.
- `modules/UserApp/pages/OrderDetail.jsx` — customer-visible refund status and expected timeline.
- `modules/UserApp/pages/Orders.jsx` — refund badge on refunded/partially-refunded orders.

**Components affected**
- New `RefundStatusBadge`, `RefundTimeline`, `InitiateRefundModal`, `ManualSettlementModal`, `ReversalEffectsPanel`.
- `shared/components/Dashboard/StatusBadge.jsx` — extend with refund states.

**Forms affected**
- Initiate refund: amount (pre-filled, server-validated), reason, item selection for item-level refunds.
- Manual settlement: method, reference, proof, note.

**State management changes**
- New `shared/store/refundStore.js`.
- `orderStore` — surface `refundedAmount` and `refundState`.

**API integration updates**
- Six new endpoints wired.
- Refund status updates delivered over the existing socket notification channel so the customer sees progress without polling.

**UX changes**
- Refund is presented as a **process with stages**, never as an instant outcome. The current UI's implicit "refunded = done" must be replaced everywhere.
- The customer-facing message must state an expected settlement window and never claim money has arrived.

**Error handling updates**
- Gateway refund failure: actionable admin error with retry, distinct from validation failure.
- Partial reversal failure (e.g. refund succeeded but commission reversal failed): must surface prominently as an inconsistent state requiring attention, not be swallowed.

---

### UI Changes

**Screens requiring modification**
1. Admin → Finance → Refunds (new)
2. Admin → Finance → Refund detail (new)
3. Admin → Finance → Refund reports (data source)
4. Admin → Return request detail
5. Admin → Order detail
6. Vendor → Return request detail
7. Customer → Order detail
8. Customer → Orders list

**New UI states**
- *Refund requested* / *initiated* / *processing at gateway* / *succeeded* / *failed* / *manually settled* — six distinct, visually distinguishable states.
- *Partially refunded* — with the refunded amount against the order total.
- *Reversal incomplete* — a warning state where money moved but a downstream reversal failed.
- *COD refund pending manual settlement* — with an explicit call to action.

**Empty states**
- Refund queue with no refunds — distinguish "no refunds ever" from "no refunds matching this filter".
- Customer refunds view when none exist.

**Validation states**
- Amount exceeds refundable balance — inline, with the computed maximum shown.
- Reason too short; proof reference missing on manual settlement.

**Loading states**
- Initiating (gateway call in flight) must be non-cancellable and must block double submission at the UI layer in addition to the server-side idempotency key.

**Success states**
- "Refund initiated" — explicitly not "refunded". Shows the expected settlement window and the gateway reference.

**Error states**
- Gateway declined, gateway timeout (with the caution that the refund may still have been accepted — the retry must be idempotent and the UI must say so), amount validation failure, already-refunded.

**Permission-based visibility rules**
- Queue and detail: `REFUNDS_VIEW`.
- Initiate / retry: the execute-level token.
- Manual settlement: superadmin or the execute token plus a second confirmation.
- Vendors see refund status on their own returns only and never see an initiate control.

---

### Database Changes

**Collections impacted:** `refunds` (new), `orders`, `returnrequests`, `payments`, `checkoutsessions`, `commissions`, `riderwallettransactions`, `deliverycashledgers`, `adminactivitylogs`, `failedjobs`.

**Schema updates** — as listed under Models. Indexes:
- `refunds`: unique `idempotencyKey`; `{ status: 1, requestedAt: 1 }` for the queue; `{ orderId: 1 }`; `{ returnRequestId: 1 }`; partial unique on open refunds per order.
- `orders`: `{ refundState: 1, updatedAt: -1 }`.

**Migrations**
- `0009_refund_ledger` — creates `refunds` and its indexes; adds `refundedAmount`/`refundState` to `orders`; adds `refundedTotal` to `checkoutsessions`; adds `refundId` to `returnrequests`.
- `0010_backfill_legacy_refund_markers` — **this is the delicate one.** Historical orders carry `paymentStatus: 'refunded'` with no money movement. They must be reclassified so the new system does not treat them as settled refunds. Recommended: create `Refund` records with `status: 'legacy_unverified'` and `method: 'unknown'`, linked to those orders, flagged for manual reconciliation. **Do not silently convert them to `succeeded`** — that would assert money moved when the audit proves it did not.

**Backfill requirements**
- `orders.refundedAmount` = 0 for all historical orders (the honest value, since no refunds were issued).
- The legacy-marker reconciliation above.

**Data integrity checks**
- Invariant: `Order.refundedAmount ≤ Order.total` — enforced and monitored.
- Invariant: `Σ Refund.amount (status: succeeded) for an order == Order.refundedAmount`.
- Invariant: no order in `refunded` state with `refundedAmount < total`.
- Reconciliation job: compare `Refund` records against the gateway's refund list daily and flag divergence. **This is the control that catches a refund issued at the gateway but not recorded locally, which is otherwise invisible.**
- Report at migration time: count and total value of orders currently marked `refunded` with no corresponding money movement — this is the customer-liability inventory and it is a business escalation, not an engineering artefact.

---

### Integration Changes

**Payment gateway (Cashfree)**
- New: refund creation API, refund status API, refund webhook events. These require verifying the account's refund permissions and settlement balance behaviour in sandbox first.
- Refunds may fail for reasons unrelated to code (insufficient settlement balance) — the failure taxonomy must be captured and surfaced, not collapsed into "failed".

**Subscription flow** — out of scope; subscription refunds are explicitly deferred and must be recorded as a known gap.

**Notification updates**
- Customer notifications on refund initiated / settled / failed, using the existing `REFUND` category and type which are already defined and unused.
- The QC partial-fulfilment notification ("Refund Initiated") becomes truthful.
- Admin notification on refund failure — routed through `notifyAdmins`. Note that **admin push is currently never delivered** (§11); in-app and socket will work, push will not until Phase 8 fixes it. Do not rely on push for refund-failure alerting until then.

**External services impacted** — none beyond Cashfree.

**Webhook requirements**
- New refund-event branch, sharing the existing signature verification and replay window.
- Must be idempotent and tolerate out-of-order delivery relative to the synchronous API response.
- Must handle a refund webhook for a refund the system has no record of (gateway-initiated or manually issued in the Cashfree dashboard) — log, alert, and create a reconciliation record rather than crashing or ignoring.

---

### Testing Requirements

**Unit**
- Refund amount computation: full, partial, item-level, with tax and proportional coupon discount; against split orders sharing one gateway payment.
- Idempotency: same key twice → one refund, one gateway call.
- Ledger allocation: refunding sub-order 2 of 3 updates `paymentAllocationLedger` correctly and leaves the others untouched.
- Each reversal in isolation, and each reversal's idempotency.
- State machine: every legal and illegal transition.

**Integration**
- Gateway refund success → all four reversals complete → order state consistent.
- Gateway refund failure → refund `failed`, **zero reversals applied**, retry available.
- Reversal partial failure → refund `succeeded`, reversal flagged incomplete, resumable.
- COD refund → routes to manual, no gateway call, cash ledger adjusted on settlement.
- Refund of an order whose commission is already in a `requested` settlement → correct interaction with Phase 5's settlement state (this is the cross-phase seam and needs an explicit test).

**API**
- Every new endpoint: authorised, unauthorised, and wrong-permission cases.
- Amount exceeding refundable balance → 400 with the computed maximum.
- Double-submit with the same idempotency key → single refund.

**Frontend**
- Refund modal blocks double submission.
- Refund status renders every one of the six states.
- Customer view never displays "refunded" for an `initiated` refund.

**E2E**
- W-24 end-to-end in sandbox: return request → approve → refund initiated → webhook settles → customer sees settled → commission reversed → rider earning reversed.
- COD variant through manual settlement.
- Failure variant with retry.

**Security tests**
- Vendor attempts to initiate a refund → 403.
- Admin without the execute token attempts initiation → 403.
- Refund amount tampering from the client → server recomputes and rejects.
- Refund webhook with an invalid signature → rejected.
- Refund webhook replayed → single effect.

**Regression**
- W-22, W-23, W-26, W-34, W-46, W-47.
- Vendor earnings screen and settlement figures, since commission reversal changes payable balances.
- Rider wallet, since earning reversal touches the ledger that Phase 13 of the audit rated the strongest module — **do not regress it.**

---

### Verification Checklist

- [ ] `grep -rn "paymentStatus = 'refunded'" backend/src` returns zero direct assignments outside the refund service.
- [ ] A sandbox refund moves real money in the gateway and the local `Refund` record reaches `succeeded` only via webhook confirmation.
- [ ] Double-submitting a refund produces exactly one gateway call and one `Refund` record.
- [ ] All four reversals (commission, rider earning, COD ledger, stock) are applied and individually idempotent.
- [ ] A partial reversal failure is visible in the UI as an inconsistent state and is resumable.
- [ ] COD orders route to manual settlement and cannot silently call the gateway.
- [ ] A refund against one sub-order of a split checkout updates only that sub-order and the shared ledger.
- [ ] The QC partial-fulfilment notification no longer claims a refund that was not enqueued.
- [ ] The legacy-refund reconciliation report has been produced and escalated to the business with a written decision.
- [ ] The daily gateway-vs-local refund reconciliation job is deployed and reporting zero divergence.
- [ ] `REFUNDS_VIEW` and the execute token are enforced on every new route (verified by an authorisation test per endpoint, not by inspection).
- [ ] No customer-facing string asserts money has arrived before the gateway confirms settlement.

---

### Rollback Strategy

**This phase adds outbound money movement. Rollback must be biased toward "stop paying" rather than "restore previous behaviour", because previous behaviour was to pay nothing.**

- **Master kill switch** `refunds.executionEnabled` (`Settings`-backed, default **off** at first deploy). With it off, refunds can be *requested* and queued but never sent to the gateway. This lets the entire pipeline — queue, ledger, reversals-in-dry-run, UI — ship and be observed before a single rupee moves.
- **Staged enablement:** (1) queue-only, no gateway; (2) gateway enabled with a low per-refund and per-day value cap enforced server-side; (3) caps raised after a soak period. The caps are `Settings` values, not constants.
- **Code rollback is safe at any stage** — the `Refund` collection is additive, and reverting the code leaves records that a later deploy can resume. Nothing is destroyed.
- **Gateway-side rollback is impossible.** A refund sent cannot be recalled. This is why the value caps and the staged enablement are mandatory and not optional hardening.
- **Reversals must be revertible independently of the refund.** If a reversal is wrong, it must be correctable without re-issuing or clawing back the refund. Each reversal records its own reference so it can be compensated.
- **Do not roll back migration `0010`.** Reverting the legacy-marker reclassification would restore the false impression that historical `refunded` orders were settled.
- **Deploy order:** schema + ledger + UI (kill switch off) → observe → enable gateway with caps → soak → raise caps. Minimum four releases.

---

# PHASE 5 — Vendor Settlement & Commission Ledger Integrity

### Objective
Make vendor payouts safe: eliminate the double-payout race, guarantee commission records exist for every order, credit vendors for the shipping they charged, and make the payout balance computation correct and scalable.

### Business Impact
The payout request path can pay a vendor twice for the same commissions under concurrency. Separately, commission records are created fire-and-forget after the checkout transaction — when that call fails, the vendor's earning for that order silently never exists. Both are direct, unrecoverable-without-manual-intervention financial errors, in opposite directions.

### Risk Level
**Critical** — money leaves the platform through this path.

### Dependencies
Phase 0 (migrations), Phase 2 (order financial fields), **Phase 4 (refund reversal interacts with settlement state)**. The rider wallet module is the reference implementation and must not be modified by this phase.

### Estimated Effort
**L — 16 eng-days**, 8 QA-days. BE2 (lead) + FE2.

---

### Issues Covered

| ID | Finding |
|---|---|
| **B-7** | Vendor payout request is non-transactional and races into double payouts |
| **D-6** | Same, database framing — `Settlement.create` then `Commission.updateMany`, no session, no compare-and-set |
| **M-9** | Missing: vendor shipping revenue payout |
| **M-14** | Missing: commission reconciliation job |
| **§10** | Commission fire-and-forget after transaction commit (`OrderSplitterEngine.js:568-572`) |
| **P-7** | N+1 in `getVendorWithdrawableCommissions` — loads all pending commissions with populate, filters in JS |
| **P-8** | `ensureVendorCommissionsForOrder` issues sequential `findOne` + `findById` per vendor group |
| **HC** | Hardcoded 7-day escrow (`commission.service.js:123-124`), `MINIMUM_PAYOUT = 500` (`vendor/order.controller.js:509`), default commission rate `10` in three places |
| **§12b (partial)** | `PUT /admin/settlements/:id/approve` and `/reject` gated on `WALLET_VIEW` — a read permission authorising money movement *(the permission model itself is Phase 8; the settlement routes are corrected here because the phase already owns them)* |
| **W-34** | Workflow: vendor payout request |

---

### Root Cause Analysis

**B-7 / D-6 — read-then-write across two collections with no transaction.**
*Why it exists:* `requestPayout` was written as a straightforward sequence: compute eligible commissions, create a `Settlement`, mark the commissions `requested`. The eligibility computation happens in a separate service call that returns plain data, so by the time the write happens the read is stale. There is no session, no conditional update, and no unique constraint preventing two open settlements for one vendor. The rider withdrawal service — written later — solves exactly this problem with a partial unique index and compare-and-set, and that pattern was never back-ported.
*Files/modules affected:* `src/modules/vendor/controllers/order.controller.js:505-550`, `src/services/commission.service.js:116-147`, `src/models/{Settlement,Commission}.model.js`, `src/modules/admin/controllers/settlement.controller.js`.
*Workflows impacted:* W-34, W-38 (admin settlement approval), vendor earnings display.
*Potential side effects:*
1. The fix must preserve the ability for a vendor to have **sequential** settlements; only **concurrent open** ones are illegal.
2. Any existing duplicate settlements in production must be identified before the constraint is added, or the unique index build will fail. **Run the duplicate report first.**
3. `approveSettlement` transitions state; it must be compare-and-set too, or two admins approving simultaneously produce the same class of bug one step later.

**§10 / M-14 — commission creation is fire-and-forget.**
*Why it exists:* `ensureVendorCommissionsForOrder` was deliberately moved outside the checkout transaction so a commission failure could not roll back a paid order — a correct instinct. But it was made fire-and-forget (`.catch(console.error)`) rather than durable. The application already has a persistent retry queue (`RetryQueueService` + `FailedJob` model) used for COD capture and rider earnings; commission creation was never registered with it.
*Side effects:* Fixing this correctly means enqueuing rather than calling, which changes timing — a commission may not exist immediately after checkout. Any code that assumes it does (vendor earnings display right after an order) must tolerate the gap.

**M-9 — shipping revenue never credited.**
*Why it exists:* `vendorEarnings = subtotal − commission`. The vendor's shipping charge is collected from the customer and included in `Order.total`, but never enters the vendor's earning calculation. Whether shipping should be credited to the vendor, retained by the platform, or split is a **business policy decision** that engineering must not assume. The defect is that no policy is expressed at all — the money simply lands nowhere.
*Side effects:* Whatever policy is chosen changes vendor payouts. It must be applied from a cutover date forward, not retroactively, and communicated to vendors.

**P-7 / P-8 — computation shape.**
*Why they exist:* `getVendorWithdrawableCommissions` loads every pending commission with a populated order and filters in JavaScript for `status === 'delivered'` and a 7-day-old `deliveredAt`. Both conditions are expressible in an aggregation. `ensureVendorCommissionsForOrder` loops vendor groups doing two sequential queries each. Both are correctness-neutral but scale linearly with vendor history.

---

### Backend Changes

**APIs requiring changes**

| Endpoint | Change |
|---|---|
| `POST /api/vendor/earnings/request-payout` | Transactional; idempotent; blocked when an open settlement exists |
| `GET /api/vendor/earnings` | Balance computed by aggregation; exposes locked/withdrawable/paid breakdown consistently with the rider wallet's vocabulary |
| `PUT /api/admin/settlements/:id/approve` | Compare-and-set transition; permission raised from `WALLET_VIEW` to an edit-level token |
| `PUT /api/admin/settlements/:id/reject` | Same |
| `POST /api/admin/settlements/:id/mark-paid` | **New** — records the actual disbursement with a UTR, mirroring the rider withdrawal pattern |
| `GET /api/admin/commissions/reconciliation` | **New** — orders without commission records |

**Controllers**
- `vendor/order.controller.js` — `requestPayout` rewritten transactionally.
- `admin/settlement.controller.js` — compare-and-set transitions; new mark-paid.
- New `admin/commissionReconciliation.controller.js`.

**Services**
- `commission.service.js` — `getVendorWithdrawableCommissions` becomes a single aggregation; `ensureVendorCommissionsForOrder` becomes batched (one vendor lookup for all groups, one bulk write) and idempotent by unique constraint rather than by pre-read.
- New `settlement.service.js` — owns settlement creation, transitions, and the commission state machine, so the controller holds no financial logic.
- New `commissionReconciliation.service.js` — scheduled job finding delivered orders with no commission record and enqueuing creation.
- `events/RetryQueueService.js` — register `COMMISSION_CREATE` as a durable job type.
- `checkout/OrderSplitterEngine.js` — replace the fire-and-forget call with an enqueue.

**Models**
- `Settlement` — add `idempotencyKey` (unique), `utr`, `paidAt`, `paidBy`, `rejectionReason`; **partial unique index preventing more than one settlement per vendor in an open status** (mirroring `unique_open_withdrawal_per_rider`).
- `Commission` — add unique compound index `{ orderId, vendorId }` so duplicate creation is impossible at the database level; add `shippingEarnings` and `reversedAmount`; extend `status` to include `reversed`.
- No changes to any rider wallet model.

**Middleware** — none new.

**Database schema updates** — see Database Changes.

**Validation updates**
- Payout request accepts an optional idempotency key header, consistent with the checkout and rider-withdrawal conventions already in use.
- Mark-paid requires a UTR of a validated shape.

**Permission enforcement updates**
- Settlement approve/reject/mark-paid move from `WALLET_VIEW` to `WALLET_EDIT`. This is a **breaking permission change** for any sub-admin currently holding only `WALLET_VIEW` — inventory affected accounts and coordinate with Phase 8.

**Security improvements**
- Double payout becomes structurally impossible (unique index), not merely unlikely.
- Every settlement transition is audit-logged with actor.
- Money-moving actions require an edit-level permission.

---

### Frontend Changes

**Pages affected**
- `modules/Vendor/pages/Earnings.jsx` — balance breakdown, open-settlement blocking state, idempotent request.
- `modules/Vendor/pages/WalletHistory.jsx` — settlement history with the new states.
- `modules/Admin/pages/PayoutRequests.jsx` — approve/reject/mark-paid with UTR capture.
- **New** `modules/Admin/pages/finance/CommissionReconciliation.jsx` — orders missing commissions, with a re-enqueue action.

**Components affected**
- New `SettlementStatusBadge`, `MarkPaidModal`, `PayoutBlockedNotice`.

**Forms affected**
- Payout request — sends an idempotency key; disabled while an open settlement exists.
- Mark-paid — UTR, date, note.

**State management changes**
- Vendor earnings store: represent locked / withdrawable / requested / paid as distinct values rather than a single number.

**API integration updates**
- New mark-paid and reconciliation endpoints.

**UX changes**
- The vendor is told *why* payout is unavailable (open settlement, below minimum, escrow not matured) rather than seeing a disabled button.

**Error handling updates**
- 409 on concurrent payout request → a clear "a payout request is already in progress" state, not a generic error.

---

### UI Changes

**Screens requiring modification**
1. Vendor → Earnings
2. Vendor → Wallet history
3. Admin → Payout requests
4. Admin → Commission reconciliation (new)

**New UI states**
- *Payout blocked — open settlement in progress* (with a link to it).
- *Payout blocked — below minimum* (showing the configured minimum and the shortfall).
- *Payout blocked — earnings still in escrow* (showing when the next tranche matures).
- *Settlement paid* with UTR.
- *Commission missing* — reconciliation row with a re-enqueue action.

**Empty states**
- No eligible commissions yet — explain escrow rather than showing ₹0 with no context.
- Reconciliation view with nothing outstanding (the healthy state).

**Validation states**
- UTR format validation on mark-paid.

**Loading states**
- Payout request in flight must block the button; the idempotency key protects the server, the UI protects the user's perception.

**Success states**
- Payout requested (with the settlement reference and expected review window).

**Error states**
- Concurrent request, below minimum, no eligible commissions, approval conflict.

**Permission-based visibility rules**
- Approve / reject / mark-paid render only for `WALLET_EDIT`; `WALLET_VIEW` sees a read-only queue.

---

### Database Changes

**Collections impacted:** `settlements`, `commissions`, `orders` (read), `adminactivitylogs`, `failedjobs`.

**Schema updates** — as listed. Indexes:
- `settlements`: unique `idempotencyKey`; **partial unique** on `{ vendorId }` where `status` is in the open set; `{ status: 1, createdAt: -1 }`.
- `commissions`: **unique** `{ orderId, vendorId }`; `{ vendorId, status: 1 }`; `{ vendorId, status: 1, 'order.deliveredAt': 1 }` equivalent supported via aggregation on the orders side.

**Migrations**
- `0011_commission_unique_index` — **must be preceded by a duplicate-detection and cleanup step.** If duplicate `(orderId, vendorId)` commissions exist, the index build fails. The migration reports duplicates and refuses to proceed until they are resolved, rather than silently deleting financial records.
- `0012_settlement_open_unique_index` — same pattern: detect vendors with more than one open settlement (**these are the double-payout victims/candidates**), report, require resolution, then build.
- `0013_settlement_payout_fields` — additive fields.
- `0014_commission_shipping_earnings` — additive; **no retroactive backfill** of shipping earnings; the field is populated from the policy cutover date forward.

**Backfill requirements**
- None retroactive for shipping (deliberate).
- `commissions.reversedAmount` = 0.

**Data integrity checks**
- **Pre-migration duplicate reports for both indexes — these double as the incident inventory for B-7.** If any vendor has two open settlements covering overlapping commissions, that is a live double-payout candidate and must be escalated immediately, not merely fixed in code.
- Invariant: no commission belongs to more than one settlement.
- Invariant: `Σ Settlement.amount` for a vendor in paid status ≤ `Σ eligible Commission.vendorEarnings`.
- Reconciliation job: delivered orders with no commission record → alert and enqueue.
- Reconciliation job: commissions in `requested` whose settlement no longer exists → orphan detection.

---

### Integration Changes

**Payment gateway** — none. Vendor payouts remain manual bank transfers recorded with a UTR, consistent with the rider payout model. Automated disbursement is out of scope and must be recorded as a deliberate deferral.

**Subscription flow** — none.

**Notification updates**
- Payout requested → admin (via `notifyAdmins`, replacing the current `createNotification` call that passes the **vendor's** id as `recipientId` with `recipientType: 'admin'` — a latent misattribution that happens to work only because the admin feed ignores `recipientId`).
- Settlement approved / rejected / paid → vendor.
- Commission reconciliation failure → admin.

**External services impacted** — none.

**Webhook requirements** — none.

---

### Testing Requirements

**Unit**
- `getVendorWithdrawableCommissions` aggregation returns identical results to the previous JS filter across a fixture matrix (golden-value test).
- `ensureVendorCommissionsForOrder` idempotency under duplicate invocation.
- Settlement state machine: every legal and illegal transition.

**Integration**
- **Concurrent payout requests (the B-7 regression test):** fire N simultaneous requests for the same vendor; assert exactly one `Settlement` is created and each eligible commission is claimed exactly once.
- Concurrent approvals of the same settlement → one succeeds, one 409s.
- Commission creation failure → job lands in the retry queue → retried → commission exists.
- Refund of an order in a `requested` settlement → correct interaction with Phase 4.

**API**
- Payout request below minimum, with no eligible commissions, with an open settlement — three distinct 4xx responses.
- Approve/reject as `WALLET_VIEW` only → 403.

**Frontend**
- Payout button disabled states render the correct reason.
- Mark-paid UTR validation.

**E2E**
- W-34 end-to-end: order delivered → escrow matures → payout requested → admin approves → marked paid → vendor sees settlement.

**Security tests**
- Vendor A requests payout scoped to Vendor B's commissions → impossible (scope comes from the token, not the body — assert explicitly).
- `WALLET_VIEW`-only sub-admin cannot approve.

**Regression**
- W-32, W-34, W-37, W-38.
- **Rider wallet end-to-end must be re-run unchanged** — it shares `Settings{key:'delivery'}` policy reads and the retry queue, and it is the module the audit rated strongest. Any regression here is a serious quality failure.

---

### Verification Checklist

- [ ] The duplicate reports for both new unique indexes have been produced, reviewed, and resolved before the indexes are built.
- [ ] N concurrent payout requests produce exactly one settlement — proven by an automated concurrency test, not by reasoning.
- [ ] A partial unique index prevents a second open settlement per vendor at the database level.
- [ ] `Commission` has a unique `{ orderId, vendorId }` index and duplicate creation fails at the database, not in application logic.
- [ ] Commission creation is enqueued durably; killing the process mid-checkout still results in a commission after the retry worker runs.
- [ ] The commission reconciliation job reports zero delivered orders without commissions after one full cycle.
- [ ] `getVendorWithdrawableCommissions` executes as a single aggregation — verified by query profiling, not by code reading.
- [ ] Settlement approve/reject/mark-paid require `WALLET_EDIT`; affected sub-admin accounts have been inventoried and re-granted.
- [ ] The shipping-revenue policy decision is documented, implemented from a recorded cutover date, and communicated to vendors.
- [ ] Escrow period, minimum payout, and default commission rate are read from settings, not constants.
- [ ] The rider wallet regression suite passes unchanged.

---

### Rollback Strategy

- **Index migrations are the irreversible-in-practice step.** Dropping a unique index is trivial, but the *cleanup* performed to allow it to build is not. Never delete a financial record to satisfy an index build — resolve duplicates by marking, not removing, and keep the pre-cleanup state exported.
- **Ship the unique indexes before the code that relies on them.** The constraint alone eliminates the double-payout window even if the transactional rewrite is reverted. This ordering means a code rollback still leaves the system safer than it started.
- **`settlements.enforceSingleOpenRequest`** kill switch controls the application-level guard; the index remains regardless. If the guard produces false positives, flip the switch — the index still prevents the actual harm.
- **The commission enqueue change is behaviour-preserving on success** and only differs on failure. Rollback restores fire-and-forget; jobs already in the queue are drained by the retry worker either way.
- **The permission raise on settlement routes can lock out operators.** Inventory and re-grant affected accounts *before* deploy, and keep a documented superadmin path to approve settlements manually during the transition.
- **Do not roll back the shipping-earnings policy once vendors have been notified.** Reversing a communicated payout policy is a trust event, not a deploy.
- **Deploy order:** duplicate reports → cleanup → indexes → transactional rewrite → permission raise → shipping policy. Six steps, at least three releases.

---

# PHASE 6 — Catalog & Inventory Data Integrity

### Objective
Restore truth to the product record: add the `sku` and `costPrice` fields the bulk importer already writes and the database silently discards, enforce variant-level stock in the live checkout, close the reserved-stock leak, and remove the phantom index and phantom filters.

### Business Impact
Every bulk import currently re-creates the entire catalogue as new products because duplicate detection reads a field that does not exist. Variant stock is never decremented on the live checkout path, so a vendor selling S/M/L can oversell one size indefinitely. Both produce operational chaos — duplicate listings, cancelled orders, manual reconciliation.

### Risk Level
**High** — schema changes to the most-read collection in the system, plus a change to the stock path that every order depends on.

### Dependencies
Phase 0 (migration framework — mandatory here). Independent of Phases 1–5.
**Blocks Phase 7** (checkout consolidation must land on a correct inventory model) and **Phase 9** (some missing features touch the catalogue).

### Estimated Effort
**XL — 22 eng-days**, 12 QA-days. BE3 (lead) + BE1 + FE1.

---

### Issues Covered

| ID | Finding |
|---|---|
| **B-6** | Bulk import silently drops `sku` — duplicate detection permanently inert |
| **D-1** | `Product` has no `sku` or `costPrice` field while bulk upload reads and writes both (verified empirically) |
| **D-2** | Phantom index `{wholesaleEnabled, isActive, isDeleted}` on a non-existent `Product.isDeleted` field; queries filter on it |
| **D-3** | Reserved-stock leak on duplicate-key during reservation |
| **D-4** | Two competing stock-mutation paths — legacy engine ignores `reservedQuantity` *(the engine deletion is Phase 7; the stock-model unification is here)* |
| **D-11** | `lowStockThreshold` default `10` in schema vs `5` in the commit path |
| **M-4** | Missing: variant-level stock enforcement in the live checkout |
| **M-5** | Missing: SKU as a first-class product field |
| **§5** | Inventory & Stock module findings |
| **§6** | `PUBLIC_TEST_VENDOR_REGEX` hardcoded test-vendor suppression (HC, production risk) |
| **§6** | Quick Commerce serviceability silently falls back to all verified vendors |
| **HC-3 (code half)** | Geo-fence `isDevMode` bypass and the Delhi fallback coordinate in `quickCommerce.routes.js:326-329` |
| **W-19, W-20, W-33** | Workflows: reserve→commit, variant stock, vendor bulk import |

---

### Root Cause Analysis

**B-6 / D-1 / M-5 — the schema and the importer disagree, silently.**
*Why it exists:* The bulk importer was written against an intended `Product` shape that includes `sku` and `costPrice`. The schema was never updated. Mongoose strict mode drops unknown fields on write without warning, and passes unknown fields through on *query* filters without casting — so `Product.find({ sku: {...} })` is syntactically valid and matches nothing. Neither failure produces an error. **This is the single most instructive defect in the audit: two silent behaviours composing into a completely non-functional feature that reports success.**
*Files/modules affected:* `src/models/Product.model.js`, `src/services/bulkUpload.service.js` (SKU collection at 309-323, generation and duplicate check at 478-495, insert/update documents at ~700-830, export headers at 1010-1034), `src/controllers/bulkUpload.controller.js`, `src/modules/integrations/services/inventory.service.js:11,30` (already reads `productDoc.sku`), `src/models/BulkImportHistory.model.js:33`.
*Workflows impacted:* W-33 (vendor bulk import), W-58, admin catalogue export, the third-party inventory integration which resolves products by `sku`/`itemCode`/`hsnCode`.
*Potential side effects:*
1. **Adding `sku` with a unique index will fail** if two products share a generated SKU after backfill. Backfill must generate deterministically-unique values, and the index must be built only after a duplicate report is clean.
2. **The integration module already queries `sku`** (`inventory.service.js:30`) — it has been silently failing to resolve products by SKU and falling back to other identifiers. Adding the field changes integration behaviour; verify with the partner.
3. **Existing duplicate products created by the broken importer** are a data cleanup problem, not a code problem. Quantify them; deduplication is a business decision (which duplicate is canonical, what happens to orders referencing the others).
4. `costPrice` is exported in the catalogue export header (`bulkUpload.service.js:1020`) and is currently always empty. Adding it means **cost data becomes exportable** — which, combined with the Phase 3 export-authorisation fix, is why Phase 3 must land first.

**D-2 — phantom index and phantom filters.**
*Why it exists:* `isDeleted` was presumably planned for `Product` soft-deletes, added to an index and to several query filters, but never added to the schema. `{ isDeleted: { $ne: true } }` matches every document, so the filters are no-ops and the index is dead weight.
*Decision required:* either implement `Product` soft-delete properly (add the field, honour it in the delete controller, keep the index) or remove the field from all filters and drop the index. **The audit cannot decide this; the business must.** Note `deleteProduct` currently exists in both admin and vendor controllers — inspect whether they hard-delete or deactivate before choosing.

**D-3 — reserved-stock leak.**
*Why it exists:* The `$inc` on `reservedQuantity` happens before the `InventoryReservation` document is created. On a duplicate-key error the code treats the situation as idempotent and continues, but the second `$inc` has already applied and no document records it, so `releaseReservation` can never return it.
*Side effects:* The fix is to make the reservation document the source of truth — create it first (or use a single atomic upsert), and only increment on genuine creation. A reconciliation job should also detect and correct existing drift, because leaked reservations are already in production data.

**D-4 / M-4 — two stock models.**
*Why it exists:* The reservation system was added for the enterprise checkout; the legacy engine predates it and decrements `stockQuantity` directly while ignoring `reservedQuantity`. Additionally, the legacy engine *does* decrement `variants.stockMap` (order.controller.js:603-616) while the enterprise reservation path does not — so the newer, live path is the one missing variant enforcement.
*Side effects:* Adding variant reservation is more than a field change: `InventoryReservation` must become variant-aware, availability must be computed per variant, and the atomic conditional filter must operate on a nested map path. Reservations for a product with no variants must continue to work unchanged.

**§6 — QC serviceability fallback and test-vendor regex.**
*Why they exist:* Both are pragmatic patches over data problems. The serviceability fallback (`public.routes.js:238-241`) was added so customers without a location could still browse, but it silently replaces the geo-filter with "all verified vendors", defeating the fence the surrounding comment claims to enforce. The test-vendor regex suppresses seeded demo data in the read path instead of marking it in the data.

---

### Backend Changes

**APIs requiring changes**

| Endpoint | Change |
|---|---|
| `POST/PUT /api/admin/products`, `/api/vendor/products` | Accept and persist `sku`, `costPrice`; SKU uniqueness validated |
| `GET /api/admin/products`, `/api/vendor/products` | Return `sku`; support SKU search |
| `POST /api/{admin,vendor}/products/bulk-upload/validate` | Duplicate detection now functional — the response shape's warning counts will change materially |
| `GET /api/{admin,vendor}/products/export` | `SKU` and `Cost Price` columns populate |
| `POST /api/user/checkout/session` | Variant-aware reservation; variant availability errors |
| `GET /api/quick/serviceability`, `/vendors/nearby` | Fallback behaviour made explicit rather than silent |
| `GET /api/products` (public) | `isDeleted` filter resolved per the soft-delete decision |

**Controllers**
- `admin/catalog.controller.js`, `vendor/product.controller.js` — SKU handling, uniqueness errors, variant stock validation on update.
- `bulkUpload.controller.js` — no structural change; behaviour changes because the service beneath it starts working.

**Services**
- `bulkUpload.service.js` — SKU lookup and duplicate detection become functional; the generated-SKU fallback must be deterministic and collision-resistant.
- `checkout/InventoryReservationService.js` — **the largest change in this phase.** Reservations become variant-aware (`variantKey` on the reservation document, availability computed against `variants.stockMap` when a variant is specified); the duplicate-key path stops double-incrementing; `commitReservation` and `releaseReservation` handle variant paths; the sweep is unchanged in shape.
- `stock.service.js` — unify the stock-label derivation so schema and runtime agree on the threshold (D-11).
- `quickCommerce.service.js` / `routes/quickCommerce.routes.js` — remove the Delhi fallback coordinate; return an explicit unavailable reason. Replace the `isDevMode` radius bypass with a `Settings`-backed override.
- `catalogQuery.service.js` — resolve the `isDeleted` filter decision.
- New `inventoryReconciliation.service.js` — detects and corrects `reservedQuantity` drift against open reservations.

**Models**
- `Product` — `+sku` (String, trimmed, indexed, **unique per platform or per vendor — a business decision; per-vendor is the safer default for a marketplace**), `+costPrice` (Number, min 0), `+isDeleted` (only if soft-delete is adopted). Fix or drop the phantom index.
- `InventoryReservation` — `+variantKey`; adjust the existing unique constraint to `{ sessionId, productId, variantKey }`.

**Middleware** — none.

**Validation updates**
- `createProductSchema` / `updateProductSchema` (both admin and vendor) — `sku` format, length, uniqueness; `costPrice` numeric and non-negative; `costPrice` should not be exposed on any public product read.
- Bulk import row validation — SKU required or generated, format-checked.

**Permission enforcement updates** — none new; the export authorisation is Phase 3's.

**Security improvements**
- `costPrice` must be excluded from `PRODUCT_LIST_SELECT` and every public product projection. Adding a cost field to the most-read public collection is a disclosure risk if the projection is not tightened in the same change.

---

### Frontend Changes

**Pages affected**
- `modules/Vendor/pages/products/ProductForm.jsx` and `modules/Admin/pages/ProductForm.jsx` — SKU and cost-price inputs, uniqueness error handling.
- `modules/Vendor/pages/products/ManageProducts.jsx`, `modules/Admin/pages/products/ManageProducts.jsx` — SKU column, SKU search.
- `modules/Vendor/pages/StockManagement.jsx` — variant-level stock visibility.
- `modules/UserApp/pages/ProductDetail.jsx` — variant availability must reflect reserved stock, not just `stockMap`.
- `modules/UserApp/pages/Checkout.jsx` — variant-specific out-of-stock errors.

**Components affected**
- `modules/Vendor/components/ProductSections/{InventorySection,VariantsSection,PricingSection}.jsx` — SKU, cost price, per-variant stock.
- `shared/components/BulkUploadModal.jsx` — duplicate warnings become meaningful and volumes will jump; the UI must handle a large warning list.
- `shared/components/Product/VariantSelector.jsx` — disable unavailable variants using true availability.

**Forms affected**
- Product create/edit; bulk import mapping; stock adjustment.

**State management changes**
- `vendorProductStore` — SKU in list/detail shapes.
- Cart/product stores — variant availability separate from variant existence.

**API integration updates**
- SKU uniqueness conflict (409) handled distinctly from validation errors.
- Variant-specific stock errors surfaced against the correct variant.

**UX changes**
- Bulk import preview must clearly distinguish "will create", "will update", and "will skip (duplicate)" — currently every row is "will create" because detection is inert.
- Out-of-stock messaging becomes variant-specific.

**Error handling updates**
- `SKU_ALREADY_EXISTS`, `VARIANT_OUT_OF_STOCK`, `VARIANT_INSUFFICIENT_STOCK` as distinct typed errors.

---

### UI Changes

**Screens requiring modification**
1. Vendor / Admin product form
2. Vendor / Admin product list
3. Vendor stock management
4. Bulk upload preview
5. Product detail (variant selector)
6. Checkout (variant errors)

**New UI states**
- *Duplicate SKU detected* — in-form and in bulk preview.
- *Variant out of stock* / *only N left* — per variant chip.
- *Variant reserved by another shopper* — distinct from out-of-stock, because it is temporary.
- *SKU auto-generated* — visible, editable before save.

**Empty states**
- Product list filtered by SKU with no match.
- Stock management for a product with no variants (must not render an empty variant grid).

**Validation states**
- SKU: format, length, live uniqueness check on blur.
- Cost price: non-negative; warn if greater than selling price.

**Loading states**
- SKU uniqueness check in flight.
- Bulk preview computing duplicates (now a real query).

**Success states**
- Import summary showing created / updated / skipped counts that are finally accurate.

**Error states**
- SKU conflict with a link to the conflicting product.
- Variant stock failure at checkout with a "choose another variant" affordance.

**Permission-based visibility rules**
- `costPrice` visible to the owning vendor and to admins with `PRODUCTS_VIEW`; **never** rendered on any customer-facing surface.

---

### Database Changes

**Collections impacted:** `products`, `inventoryreservations`, `bulkimporthistories`.

**Schema updates**
- `products`: `+sku`, `+costPrice`, optionally `+isDeleted`. Index `{ vendorId: 1, sku: 1 }` unique (recommended scope). Drop or fix `{wholesaleEnabled, isActive, isDeleted}`.
- `inventoryreservations`: `+variantKey`; unique index changed to `{ sessionId, productId, variantKey }`.

**Migrations**
- `0015_product_sku_costprice` — additive fields.
- `0016_backfill_product_sku` — generate deterministic SKUs for all existing products (vendor prefix + slug + short hash). **Must be deterministic and re-runnable**, producing the same SKU for the same product on every run.
- `0017_product_sku_unique_index` — duplicate report first; refuse to build on conflict; build in background.
- `0018_inventory_reservation_variant_key` — additive; existing reservations get `variantKey: null`; the unique index is rebuilt to include it.
- `0019_reserved_quantity_drift_correction` — recompute `reservedQuantity` from open reservations and correct leaked values. **Report before correcting; the delta is evidence of D-3's production impact.**
- `0020_product_isdeleted_resolution` — either adds the field and honours it, or removes the filters and drops the index, per the business decision. Not both.

**Backfill requirements**
- SKU for every product (mandatory before the unique index).
- `costPrice` left null — it is genuinely unknown and must not be fabricated.
- `reservedQuantity` correction.

**Data integrity checks**
- Pre-migration: count of products with identical generated SKUs.
- Pre-migration: count of duplicate products created by the broken importer (same vendor, same name, near-identical price) — the cleanup inventory.
- Post-migration: `reservedQuantity` equals the sum of open reservation quantities for every product; **this becomes a monitored invariant**, because D-3's class of bug recurs silently.
- Ongoing: variant `stockMap` totals reconcile with `stockQuantity` where the vendor maintains both.

---

### Integration Changes

**Payment gateway** — none.
**Subscription flow** — none.
**Notification updates** — low-stock notifications become variant-aware if the business wants them to; otherwise unchanged.
**External services impacted**
- **Third-party inventory integration** (`modules/integrations/services/inventory.service.js`) resolves products by `sku` and updates `variants.stockMap.<key>`. It has been operating with `sku` always undefined. Adding the field changes its resolution behaviour — **coordinate with the partner and re-run the integration contract tests before release.**
- Cloudinary unaffected.
**Webhook requirements** — none.

---

### Testing Requirements

**Unit**
- SKU generation determinism and collision resistance.
- Duplicate detection across all three `duplicateMode` values (`skip`, `update`, `create`) — none of which have ever executed their intended branch.
- Variant availability computation: no variants, variants with stock, variants with reservations, variant absent from `stockMap`.
- Reservation duplicate-key path: assert `reservedQuantity` increments exactly once.
- Stock-label threshold consistency between schema default and runtime derivation.

**Integration**
- Bulk import the same file twice: first creates N, second skips N (or updates N), and creates **zero** duplicates. **This is the acceptance-defining test for B-6.**
- Concurrent checkout of the last unit of a specific variant → exactly one succeeds.
- Reservation → expiry → sweep → `reservedQuantity` returns to zero.
- Reservation with a duplicate product line in one cart → no leak.

**API**
- SKU uniqueness conflict returns 409 with the conflicting product reference.
- Public product read contains no `costPrice` (assert on the serialised response, for every public product endpoint).
- Variant-specific stock errors identify the variant.

**Frontend**
- Bulk preview renders accurate created/updated/skipped counts.
- Variant selector disables genuinely unavailable variants.

**E2E**
- W-19, W-20, W-33.
- Full purchase of a variant product from selection through delivery.

**Security tests**
- `costPrice` absent from every unauthenticated product response.
- SKU enumeration does not disclose other vendors' products.

**Regression**
- W-6, W-7, W-9, W-11, W-12, W-18, W-19, W-20, W-32, W-33.
- The integration partner contract suite.
- **Quick Commerce browse and checkout**, because this phase removes the Delhi fallback and the radius bypass — QC serviceability behaviour changes materially.

---

### Verification Checklist

- [ ] `sku` and `costPrice` are defined on the `Product` schema and persist through `create`, `bulkWrite`, and `findOneAndUpdate` — proven by reading the raw document back from the database.
- [ ] Importing the same file twice creates zero duplicate products.
- [ ] All three `duplicateMode` branches are exercised by tests and demonstrably reachable.
- [ ] A unique SKU index exists at the agreed scope, built only after a clean duplicate report.
- [ ] `costPrice` appears in no unauthenticated response (asserted across every public product endpoint).
- [ ] Variant-level stock is reserved, committed, and released on the enterprise checkout path.
- [ ] Concurrent purchase of the last unit of a variant results in exactly one successful order.
- [ ] `reservedQuantity` equals the sum of open reservations for every product, and a monitored invariant enforces this continuously.
- [ ] The `reservedQuantity` drift report was produced before correction and retained as evidence.
- [ ] `isDeleted` is either a real, honoured field or fully removed from filters and indexes — **not partially either**.
- [ ] `lowStockThreshold` resolves to one value across schema and runtime.
- [ ] The Delhi fallback coordinate is gone; a vendor without a geo-point yields an explicit unavailable reason on both the estimate and the order paths.
- [ ] The QC radius override is a settings value, not derived from `NODE_ENV`.
- [ ] The QC serviceability fallback either applies the geo-filter or explicitly tells the customer their location is unknown — no silent all-vendors substitution.
- [ ] The test-vendor regex is replaced by an `isTestAccount` flag *(or the replacement is explicitly deferred to Phase 13 with a written rationale)*.

---

### Rollback Strategy

- **Schema additions are safe and reversible.** `sku` and `costPrice` are ignored by the previous build.
- **The unique SKU index is the one-way door.** Build it only after a clean duplicate report; keep the pre-index duplicate export. Dropping the index is instant if it causes write failures.
- **The SKU backfill is deterministic and idempotent** — re-running produces identical values, so a partial run is safe to resume.
- **Variant-aware reservation is the highest-risk change and needs its own kill switch:** `inventory.variantReservationEnabled`. With it off, reservations behave exactly as today (product-level only). Enable per environment, soak, then enable in production.
- **The `reservedQuantity` drift correction is a data mutation** — snapshot the affected documents before correcting, so the pre-state is recoverable.
- **Removing the Delhi fallback changes customer-visible availability.** Ship it behind `quickCommerce.strictVendorGeolocation` so it can be reverted without a deploy if it unexpectedly removes serviceable stores (which would itself indicate a vendor-data problem to fix, not a reason to keep the fallback permanently).
- **Do not roll back the phantom-index removal** — it costs memory and matches nothing.
- **Deploy order:** schema → backfill → duplicate report → unique index → importer behaviour → variant reservation (flag off) → variant reservation (flag on) → QC geolocation strictness. Minimum five releases.

---

# PHASE 7 — Checkout Consolidation & Order Lifecycle Completion

### Objective
Retire the legacy order engine, close the order-lifecycle gaps it and the enterprise engine both leave, and make the transaction boundary correct.

### Business Impact
Two order engines with divergent stock models, divergent pricing and divergent coupon handling is the root cause behind several other findings. The legacy engine also throws a guaranteed `ReferenceError` on Quick Commerce orders and can oversell stock held by the enterprise engine. Separately, no paid order can currently be cancelled by the customer who placed it, and any order without a customer email cannot be delivered because the OTP has no other channel.

### Risk Level
**High** — deleting the order engine that the UI does not use is low-risk; the lifecycle changes touch every order.

### Dependencies
Phase 2 (pricing correctness), Phase 6 (inventory model), Phase 4 (cancellation of a paid order requires refunds to exist).

### Estimated Effort
**L — 20 eng-days**, 10 QA-days. BE1 (lead) + BE3 + FE2.

---

### Issues Covered

| ID | Finding |
|---|---|
| **§3a** | Two parallel order-creation engines; legacy unreachable from UI but live as API |
| **§3b** | `ReferenceError: distanceKm is not defined` — guaranteed 500 on every QC order via the legacy endpoint |
| **§3f** | Post-commit code inside the transaction's `try`; `abortTransaction()` on an ended session masks the real error |
| **D-7** | `confirmCheckout` status check is read-then-act, not a conditional update — concurrent COD confirms can both proceed |
| **M-7** | Missing: customer cancellation of paid orders |
| **M-8** | Missing: SMS delivery OTP |
| **M-15** | Missing: idempotency on `confirmCheckout` |
| **§8** | `trackingNumber` assigned at order creation, before anything ships |
| **§8** | Duplicate admin notifications — one row per admin, all visible to every admin |
| **DC** | `orderStore.createOrder` (frontend, never called); `haversineDistanceKm` dead import |
| **HC** | `+5 days` estimated delivery; `24`/`168` return windows; hardcoded allowed return reasons |
| **W-13, W-22, W-26** | Workflows: legacy checkout, order cancel, delivery status + OTP |

---

### Root Cause Analysis

**§3a / §3b — a retired engine that was never removed.**
*Why it exists:* The enterprise checkout (`CheckoutSession` → `OrderSplitterEngine`) was built to replace `placeOrder`, and the controller's own header comment states the legacy endpoint "remains fully functional for backward compatibility". It was left mounted. Later, a refactor deleted the distance calculation from its Quick Commerce branch and left three references to the now-undeclared `distanceKm` behind. Nobody noticed because no client calls it. The dead `haversineDistanceKm` import is the fingerprint of that deletion.
*Files/modules affected:* `src/modules/user/controllers/order.controller.js:119-771`, `src/modules/user/routes/user.routes.js:73`, `frontend/src/shared/store/orderStore.js:74-143`, `frontend/src/shared/utils/cartTotals.js`.
*Side effects:* Before deleting, confirm no non-web client uses it — same instrumentation discipline as Phase 3's router deletion. `cartTotals.js` documents itself as mirroring `placeOrder`'s arithmetic; it must be re-pointed at the enterprise semantics (Phase 2 flags this too) or the storefront's displayed estimate drifts from the charged amount.

**§3f — the transaction `try` extends past commit.**
*Why it exists:* Retry-on-write-conflict was added by wrapping the whole body in a loop with a `try/catch`. The `commitTransaction`/`endSession` calls sit inside that `try`, followed by event emission, commission creation, and the `return`. Any throw after commit lands in the catch, which calls `abortTransaction()` on an ended session — producing a session error that masks the original and leaves committed orders that the caller believes failed.
*Note:* Phase 2 performs the structural move of this block. Phase 7 owns the retry-loop semantics around it. **Coordinate: the same lines are edited by both phases.**

**D-7 / M-15 — non-atomic session confirmation.**
*Why it exists:* `confirmCheckout` reads the session, checks `status === 'completed'`, then acts. Two concurrent COD confirms both pass the check. The codebase already contains the correct pattern — `claimCheckoutSessionForProcessing` — used by the payment paths but not by COD.

**M-7 — paid orders uncancellable.**
*Why it exists:* `cancelOrder` allows `['pending','processing']`. The splitter sets paid orders to `'confirmed'`. The two were written against different status vocabularies. Fixing it requires refunds to exist (Phase 4), which is why this is sequenced here and not earlier.

**M-8 — OTP has one channel.**
*Why it exists:* `sendDeliveryOtpEmail` was the only notification channel available when delivery OTP was built. The OTP is mandatory to complete delivery, so an order without a valid email is undeliverable and the rider has no path forward. There is no SMS provider integrated anywhere in the codebase.
*Side effects:* Introducing SMS is a new external dependency with cost, deliverability, and regulatory (DLT template) implications in India. It is not a small change and should not be treated as one.

**§8 — duplicate admin notifications.**
*Why it exists:* Callers loop over all active admins creating one `Notification` each, while `getAdminNotifications` matches on `recipientType: 'admin'` alone. The `notifyAdmins` helper exists to solve this and post-dates the call sites.

---

### Backend Changes

**APIs requiring changes**

| Endpoint | Change |
|---|---|
| `POST /api/user/orders` | **Instrument, then delete** along with `placeOrder` |
| `POST /api/user/checkout/confirm` | Atomic claim; idempotency key support |
| `PATCH /api/user/orders/:id/cancel` | Allow `confirmed`/`processing` for paid orders; enqueue a refund; enforce a cancellation window |
| `POST /api/delivery/orders/:id/resend-delivery-otp` | Channel selection (email/SMS) |
| `PATCH /api/delivery/orders/:id/status` | OTP verification unchanged; delivery blocked-without-channel state resolved |
| `GET /api/admin/orders` | Unaffected, but `trackingNumber` semantics change |

**Controllers**
- `user/order.controller.js` — delete `placeOrder` (~650 lines) and its helpers once instrumentation is clean; rewrite `cancelOrder` for paid orders.
- `user/checkout.controller.js` — `confirmCheckout` uses the claim service and honours `x-idempotency-key`.
- `delivery/order.controller.js` — multi-channel OTP dispatch.

**Services**
- `checkout/CheckoutSessionClaimService.js` — extend to cover the COD confirm path.
- `checkout/OrderSplitterEngine.js` — retry-loop boundary corrected (with Phase 2).
- New `notification/otpDelivery.service.js` — channel abstraction (email now, SMS added) with per-channel failure recording.
- New `sms.service.js` — provider adapter behind an interface, so the provider choice is not baked into call sites.
- All admin-notification call sites migrate to `notifyAdmins`.

**Models**
- `Order` — `trackingNumber` becomes nullable and is assigned on dispatch, not creation; `+cancellationWindowHours` snapshot or derive from policy; `+otpChannel`, `+otpDeliveryAttempts`.
- `CheckoutSession` — reuse existing idempotency fields for the confirm path.

**Middleware** — none new.

**Validation updates**
- Cancellation reason required for paid-order cancellation.
- OTP channel must be one the order actually has (email present / phone present).

**Permission enforcement updates** — none.

**Security improvements**
- Removing an entire unauthenticated-adjacent legacy code path reduces attack surface.
- Atomic claim removes a duplicate-order vector.

---

### Frontend Changes

**Pages affected**
- `modules/UserApp/pages/Orders.jsx`, `OrderDetail.jsx` — cancel action available for paid orders within the window; refund status surfaced (Phase 4 components).
- `modules/UserApp/pages/Checkout.jsx` — idempotency key on confirm.
- `modules/Delivery/pages/OrderDetail.jsx` — OTP channel selection and resend feedback.
- `modules/Admin/pages/OrderDetail.jsx` — tracking number now appears at dispatch, not creation.

**Components affected**
- `shared/store/orderStore.js` — **delete `createOrder`** (dead code, Phase 14 overlap; delete it here since this phase removes its endpoint).
- `shared/utils/cartTotals.js` — re-point at enterprise semantics or demote to a labelled estimate.
- New `CancelOrderModal` with reason and refund expectation.

**Forms affected** — cancellation reason; OTP channel selection.

**State management changes** — order store must represent "cancellable" as a server-provided capability rather than inferring from status, so the rule lives in one place.

**API integration updates** — idempotency header on confirm; new cancel semantics.

**UX changes**
- Cancellation of a paid order must set the expectation of a refund timeline, not imply instant reversal.
- Tracking number absent until dispatch — the UI must show a meaningful placeholder rather than an empty field.

**Error handling updates** — cancellation-window-expired and not-cancellable-at-this-stage as distinct messages.

---

### UI Changes

**Screens requiring modification**
1. Customer orders list / detail
2. Customer checkout
3. Rider order detail
4. Admin order detail

**New UI states**
- *Cancellable — refund will be issued* (with the window remaining).
- *No longer cancellable* (with the reason).
- *Cancellation requested — refund initiated.*
- *OTP sent via email* / *via SMS* / *no channel available — contact support* (the last one replaces today's dead end).
- *Tracking not yet assigned.*

**Empty states** — orders list unchanged.

**Validation states** — cancellation reason required.

**Loading states** — cancel in flight must block double submission.

**Success states** — cancellation confirmed with refund reference.

**Error states** — window expired; already dispatched; refund enqueue failure.

**Permission-based visibility rules** — customers cancel only their own orders; riders select an OTP channel only for orders assigned to them.

---

### Database Changes

**Collections impacted:** `orders`, `checkoutsessions`.

**Schema updates** — `orders`: `trackingNumber` nullable (already `sparse`), `+otpChannel`, `+otpDeliveryAttempts`, `+cancellation` sub-document (requestedAt, reason, refundId).

**Migrations**
- `0021_order_otp_channel` — additive.
- `0022_order_cancellation_metadata` — additive.
- No change to historical `trackingNumber` values.

**Backfill requirements** — none.

**Data integrity checks**
- Assert zero orders created after cutover have a `trackingNumber` before reaching a dispatched status.
- Assert every cancelled paid order has a linked refund (once Phase 4 is live).
- Monitor: orders stuck in a delivery state with no OTP channel available — this is the M-8 population and should trend to zero.

---

### Integration Changes

**Payment gateway** — cancellation triggers Phase 4's refund path; no new gateway surface.
**Subscription flow** — none.
**Notification updates** — admin notifications consolidated to one row per event; OTP gains an SMS channel.
**External services impacted** — **new SMS provider.** Requires vendor selection, DLT template registration for India, cost modelling, and a deliverability fallback. Treat as its own workstream inside this phase.
**Webhook requirements** — SMS delivery-receipt webhook if the provider offers one, for the `otpDeliveryAttempts` record.

---

### Testing Requirements

**Unit** — cancellation eligibility rules; OTP channel resolution; claim-service idempotency for COD.
**Integration** — concurrent COD confirms produce one order set; paid-order cancellation enqueues exactly one refund; OTP falls back email→SMS and records both attempts.
**API** — `POST /api/user/orders` returns 404 after removal; cancel outside the window → 400; confirm with a repeated idempotency key → same result, one order set.
**Frontend** — cancel modal blocks double submit; tracking placeholder renders.
**E2E** — W-11, W-13 (absence), W-22, W-26 including the SMS path in a provider sandbox.
**Security tests** — cancel another user's order → 403; OTP resend for an unassigned order → 403.
**Regression** — W-11, W-12, W-18, W-21, W-22, W-23, W-26, W-27; full rider app flow.

---

### Verification Checklist

- [ ] One release ran with `POST /api/user/orders` instrumented and recorded **zero** traffic before deletion.
- [ ] `grep -rn "placeOrder" backend/src` returns zero results; `grep -rn "distanceKm" backend/src/modules/user` returns zero results.
- [ ] `orderStore.createOrder` is deleted from the frontend.
- [ ] The post-commit block sits outside the transaction `try`; a forced throw after commit does not call `abortTransaction`.
- [ ] Concurrent COD confirms create exactly one order set.
- [ ] A paid order can be cancelled within the configured window and produces exactly one refund.
- [ ] An order with no email completes delivery via SMS OTP.
- [ ] `trackingNumber` is null until dispatch on newly created orders.
- [ ] A single admin notification row is produced per event regardless of admin count.
- [ ] Estimated delivery, return windows, and return reasons are read from settings.

---

### Rollback Strategy

- **Instrument-then-delete** for the legacy endpoint, identical to Phase 3's router.
- **Paid-order cancellation ships behind `orders.allowPaidCancellation`** and is enabled only after Phase 4's refund pipeline is live with caps raised. Enabling cancellation without working refunds recreates B-3's promise-without-payment problem in a new place.
- **SMS ships behind `notifications.smsEnabled`** with email remaining the default channel until deliverability is proven.
- **The claim-service change is behaviour-preserving on the happy path** and only differs under concurrency; safe to revert.
- **Do not roll back the transaction-boundary fix** — reverting restores an error-masking path.
- **Deploy order:** instrument → transaction boundary → atomic confirm → delete legacy engine → SMS (flag off → on) → paid cancellation (flag off → on).

---

# PHASE 8 — Permissions, Roles & Feature Flag Enforcement

### Objective
Make the permission model mean what it says: enforce or remove all twelve unenforced tokens, raise write actions off read permissions, guard every admin route in the frontend, and make every feature flag either functional or deleted.

### Business Impact
Sub-admins are granted authority the system does not honour, and operators believe they have disabled features that remain fully active. Turning off "Wishlist", "Reviews", "Flash Sale", "Daily Deals", "Live Chat", or "Coupon Codes" does nothing at all. This is a governance and trust problem: the admin console reports a configuration state the system does not implement.

### Risk Level
**Medium-High** — permission changes can lock out live operators; feature-flag enforcement can switch off working functionality if a default is wrong.

### Dependencies
Phase 0. Coordinates with Phase 4 (refund permission tokens) and Phase 5 (settlement permission raise). Should follow Phase 3 so it is not guarding a surface that is about to be deleted.

### Estimated Effort
**L — 18 eng-days**, 10 QA-days. BE2 (lead) + FE1 + FE2.

---

### Issues Covered

| ID | Finding |
|---|---|
| **S-5** | Twelve permissions defined, presented in the UI, enforced by zero routes |
| **S-6** | Write operations gated behind read permissions (settlements → `WALLET_VIEW`; push broadcast → `DASHBOARD_VIEW`) |
| **§12a** | The twelve-token inventory |
| **§12b** | Custom-message CRUD and image upload under-gated |
| **§12c** | ~35 admin frontend routes with no `AdminRouteGuard` |
| **§12d** | Six of eight storefront feature flags have zero readers |
| **§12e** | `reviews` settings block triple-mismatched between validator, UI, and (absent) consumers |
| **§12f** | Content tab of the settings page saves nothing |
| **§10** | `productCapabilityGuard` is a no-op — `req.vendor` is never set anywhere |
| **§11** | Admin push notifications never delivered (`notifyAdmins` anchor id vs `DeviceToken` lookup) |
| **§11** | IDOR on admin notification read *(fixed in Phase 3; the permission framing is closed here)* |
| **M-13** | Missing: subscription plan limits |
| **W-41, W-54, W-55** | Workflows: permission enforcement, review settings, feature flags |

---

### Root Cause Analysis

**S-5 / §12a — tokens added ahead of enforcement.**
*Why it exists:* Permissions were designed as a complete taxonomy up front (`ALL_PERMISSIONS`, `PRESET_ROLES`, `MODULE_TO_PERMISSION_MAP`) and wired to routes incrementally. Twelve were never reached. Because `PRESET_ROLES.finance` grants `SETTLEMENTS_VIEW` and `REFUNDS_VIEW`, an operator assigning that preset reasonably believes those boundaries exist.
*Files:* `src/constants/permissions.js`, `src/modules/admin/routes/admin.routes.js`, `frontend/src/modules/Admin/config/permissions.js`, `frontend/src/modules/Admin/pages/subadmin/*`.
*Decision required per token:* enforce it on a real route, or delete it from the taxonomy and the presets. **Leaving a token defined and unenforced is not an acceptable outcome.** Two of them (`QUICKCOMMERCE_ORDERS_MANAGE`, `QUICKCOMMERCE_SETTINGS_MANAGE`) already gate frontend routes whose APIs check different permissions — those must be reconciled first because they create a false sense of restriction.

**§12d — flags with no readers.**
*Why it exists:* The settings UI writes an open-ended `features` object (`featuresSchema` is `Joi.object().pattern(Joi.string(), booleanFlag)` — deliberately permissive so new flags need no validator change). That flexibility meant flags could be added to the UI without anyone adding a reader. Only `quickCommerceEnabled` and `wholesaleMarketplaceEnabled` were ever consumed.
*Decision required per flag:* implement the gate, or remove the toggle. Implementing `reviewsEnabled` means gating review submission, display, and aggregation; implementing `couponCodesEnabled` means gating validation, application, and the UI entry point. **These are real features, not one-liners.**

**§12e — three vocabularies for one settings block.**
*Why it exists:* The validator, the UI, and the (absent) consumer were written at different times by different authors. `.unknown(true)` allowed the UI's divergent keys to persist silently.

**§10 — `req.vendor` never assigned.**
*Why it exists:* `productCapabilityGuard` was written expecting an upstream middleware to attach the vendor document. `enforceAccountStatus` loads the vendor but discards it. The guard fails open on its first line, so it has never rejected anything, and the `PRODUCT_FIELD_STRICT` env variable it documents has never had any effect.
*Mitigating:* channel flags are independently resolved in `product.controller.js`, so the most damaging case is already covered. The field-level allowlist is not.

**§11 — admin push mis-targeted.**
*Why it exists:* Admin notifications have no single recipient, so `notifyAdmins` anchors `recipientId` to a related entity or a fresh ObjectId. `dispatchPushNotification` then queries `DeviceToken` by that id and finds nothing. In-app and socket delivery work because they key on `recipientType`.
*Side effects:* This silently swallows `OrderRecoveryWorker`'s "customer may need manual refund" alerts. Any alerting built in Phase 4 or 15 must not depend on admin push until this is fixed.

---

### Backend Changes

**APIs requiring changes**
- Every route currently gated on a read permission for a write action: settlements approve/reject (→ Phase 5), push broadcast, custom-message CRUD, admin image upload.
- Routes for the twelve tokens that survive the enforce-or-delete decision.
- New: `GET /api/admin/permissions/matrix` — the authoritative token→route mapping, so the UI and documentation stop drifting.

**Controllers** — permission decorators applied; no business-logic change.

**Services**
- `featureFlags.service.js` — becomes the single reader for **all** flags, with a typed accessor per flag so an unreferenced flag is detectable by static analysis. **This is the structural fix that prevents §12d recurring.**
- New `permissionMatrix.service.js` — enumerates registered routes and their required permissions at boot; used by a CI check that fails when a token has zero enforcing routes.
- `push.service.js` / `notification.service.js` — admin push resolves recipients by querying `DeviceToken` for `recipientType: 'admin'` (all admin devices) rather than by a synthetic `recipientId`.

**Models**
- `Admin` — no change.
- `SubscriptionPlan.features` — introduce a typed limit shape (`maxProducts`, `maxOrdersPerMonth`, capability booleans) so M-13 becomes implementable; enforcement itself may be staged.
- `DeviceToken` — ensure `recipientType: 'admin'` registration actually occurs from the admin panel (verify the admin app registers tokens at all).

**Middleware**
- `enforceAccountStatus` — attach the loaded account as `req.account` and, for vendors, `req.vendor`, fixing `productCapabilityGuard` by supplying what it expects. Then decide whether to keep the guard (with `PRODUCT_FIELD_STRICT` honoured) or delete it as redundant with the channel resolution in the controller. **Do not leave it half-alive.**
- New `requireFeature(flagName)` middleware for flag-gated routes.

**Validation updates**
- `reviewsSchema` reconciled to a single vocabulary shared by validator, UI, and consumers.
- `featuresSchema` tightened from open-ended to an explicit known-flag list, so a UI toggle for a non-existent flag fails validation loudly instead of persisting silently.

**Permission enforcement updates** — the core of the phase. Every decision recorded in a written matrix reviewed by the business.

**Security improvements**
- Removes twelve false-assurance tokens.
- Write actions require write permissions.
- Feature flags become enforceable controls rather than decoration.

---

### Frontend Changes

**Pages affected**
- All ~35 unguarded admin routes in `App.jsx:643-707` receive `AdminRouteGuard` with the correct permission.
- `modules/Admin/pages/subadmin/{CreateSubAdmin,EditSubAdmin}.jsx` — the permission picker shows only tokens that are actually enforced, with a description sourced from the matrix endpoint.
- `modules/Admin/pages/settings/ContentFeaturesSettings.jsx` — remove or implement each flag toggle; fix the `reviews` key vocabulary; **remove the Content tab or wire it to a real endpoint** (§12f).
- Storefront pages consuming the newly-enforced flags: wishlist entry points, review sections, flash-sale and daily-deals surfaces, live-chat launcher, coupon field.

**Components affected**
- `shared/components/PermissionGuard.jsx`, `modules/Admin/components/AdminRouteGuard.jsx`, `modules/Admin/hooks/usePermission.js` — align with the matrix.
- New `FeatureGate` component so flag checks are consistent and greppable.

**Forms affected** — sub-admin permission assignment; feature settings.

**State management changes** — `settingsStore` exposes typed flag accessors instead of raw object access, mirroring the backend.

**API integration updates** — permission matrix endpoint consumed by the sub-admin screens.

**UX changes** — an operator disabling a feature sees it disappear from the storefront; a sub-admin without a permission sees the nav item hidden *and* the route blocked, not one or the other.

**Error handling updates** — 403 from a permission-gated route renders a permission-denied state rather than a generic toast.

---

### UI Changes

**Screens requiring modification** — all admin routes listed above; sub-admin create/edit; content & features settings; every storefront surface behind a newly-live flag.

**New UI states**
- *Permission denied* (in-panel, with the required permission named).
- *Feature disabled by administrator* — storefront-side, for each newly-enforced flag.
- *Flag has no effect* — removed entirely; no toggle may exist without a consumer.

**Empty states** — sub-admin permission picker grouped by module with only enforceable tokens.

**Validation states** — permission dependency enforcement (`PERMISSION_DEPENDENCIES` already exists; surface it in the UI so granting `orders.update` visibly requires `orders.view`).

**Loading states** — matrix fetch on the sub-admin screens.

**Success states** — role saved, with a summary of effective access.

**Error states** — attempting to save a role with an unsatisfied dependency.

**Permission-based visibility rules** — this phase *is* the rules. Every admin nav item, route, and action maps to exactly one token, and the mapping is generated from the matrix rather than hand-maintained in `adminMenu.json`.

---

### Database Changes

**Collections impacted:** `admins`, `settings`, `subscriptionplans`, `devicetokens`.

**Schema updates** — `SubscriptionPlan.features` typed shape; no `Admin` change.

**Migrations**
- `0023_normalize_review_settings` — migrate `purchaseRequired` → `requirePurchase`, `moderationMode` → `autoPublish` semantics, preserving operator intent. **Requires a written mapping decision; do not guess.**
- `0024_prune_orphan_feature_flags` — remove flags with no consumer from stored settings **only after** the enforce-or-delete decision, so a flag pending implementation is not deleted.
- `0025_subscription_plan_limits` — additive typed limits, defaulted to unlimited so no existing vendor is newly constrained.

**Backfill requirements** — review settings key migration; plan limits defaulted.

**Data integrity checks**
- CI check: every token in `ALL_PERMISSIONS` has ≥1 enforcing route, or is absent from the taxonomy.
- CI check: every flag written by the settings UI has ≥1 reader.
- Report: sub-admins currently holding tokens that are being deleted or re-scoped — **must be reviewed before deploy** so nobody silently loses or gains access.

---

### Integration Changes

**Payment gateway** — none.
**Subscription flow** — plan limits become expressible (enforcement may be staged into a later release).
**Notification updates** — admin push begins working; verify the admin panel registers device tokens at all before claiming the fix.
**External services impacted** — Firebase (admin topic or multi-device targeting).
**Webhook requirements** — none.

---

### Testing Requirements

**Unit** — permission middleware per token; `requireFeature` behaviour on and off; feature accessor typing.
**Integration** — a sub-admin with each preset role exercised against every admin route, asserting allow/deny matches the matrix. **This is a large but mechanical test matrix and it is the acceptance evidence for S-5.**
**API** — every write route rejects its corresponding read-only token.
**Frontend** — every admin route renders the permission-denied state for a user lacking the token; every feature-gated storefront surface disappears when the flag is off.
**E2E** — W-41, W-54, W-55; a full sub-admin session per preset role.
**Security tests** — privilege escalation attempts across all four presets; direct API calls bypassing hidden UI.
**Regression** — the entire admin panel per preset role; storefront with every flag on and every flag off.

---

### Verification Checklist

- [ ] Every token in `ALL_PERMISSIONS` has at least one enforcing route, or has been removed from the taxonomy and from all presets — proven by an automated CI check, not by review.
- [ ] No write action is gated on a `*_VIEW` token.
- [ ] All ~35 previously unguarded admin routes carry an `AdminRouteGuard`.
- [ ] Every feature flag has at least one reader, or the toggle is gone — proven by an automated CI check.
- [ ] Disabling each of the six previously-dead flags demonstrably changes storefront behaviour.
- [ ] `reviews` settings use one vocabulary across validator, UI, and consumer.
- [ ] The Content tab either persists to a real endpoint or is removed.
- [ ] `productCapabilityGuard` is either functional (`req.vendor` populated, `PRODUCT_FIELD_STRICT` honoured, rejection proven by test) or deleted.
- [ ] Admin push notifications are received on a registered admin device.
- [ ] The sub-admin impact report was reviewed and affected accounts re-granted before deploy.
- [ ] The permission matrix endpoint is the single source for UI, docs, and tests.

---

### Rollback Strategy

- **Permission raises are the lockout risk.** Ship the matrix and the CI checks first (no behaviour change), then raise permissions in a release that is preceded by the impact report and by re-granting affected accounts. Keep a documented superadmin break-glass path.
- **Feature-flag enforcement ships flag-by-flag**, each in its own release, each defaulting to the current (enabled) behaviour so enabling enforcement cannot switch a live feature off by surprise.
- **Frontend route guards are additive and safe** — worst case an over-restrictive guard hides a page, which is visible and quickly reverted.
- **`productCapabilityGuard`:** if made functional, ship with `PRODUCT_FIELD_STRICT=false` (sanitise mode) first and review what would have been rejected before enforcing.
- **Do not roll back the CI checks.** They are the mechanism that prevents §12a and §12d recurring.
- **Deploy order:** matrix + CI checks → frontend guards → permission raises (with impact report) → flag enforcement one at a time → capability guard.

---

# PHASE 9 — Missing Business Functionality

### Objective
Build the shipped-but-fake and entirely-absent capabilities: real pickup-location persistence, per-user coupon limits, an integration-partner admin console, and subscription plan limits.

### Business Impact
Vendors currently configure pickup locations that exist only in one browser's `localStorage` and vanish on cache clear — a routed, sidebar-linked feature with a Mongoose model that no code imports. A single customer can drain a promotional budget because coupons have only a global cap. API keys for delivery partners can only be issued by direct database access.

### Risk Level
**Medium** — mostly new surface area rather than changes to live money paths.

### Dependencies
Phase 3 (do not build on an unguarded surface), Phase 8 (permission tokens for the new admin screens), Phase 1 (plan limits are meaningless until subscription activation is authorised).

### Estimated Effort
**XL — 24 eng-days**, 12 QA-days. FS1 (lead) + FE1 + BE3.

---

### Issues Covered

| ID | Finding |
|---|---|
| **M-3** | Pickup Locations persistence — `localStorage` only; `PickupLocation` model imported by zero files |
| **M-6** | Per-user coupon usage limits |
| **M-12** | Integration partner admin UI — no way to create, list, or rotate API keys |
| **M-13** | Subscription plan limits *(schema shape from Phase 8; enforcement here)* |
| **§7** | Coupon usage increments fire-and-forget on the enterprise path; minimum-order-value failure is silent |
| **§16** | `IntegrationAuditLog` written and never read |
| **§10** | Pickup Locations hardcoded `country: "USA"` and default operating hours |
| **W-10, W-35, W-57** | Workflows: coupon apply, pickup locations, integration API |

---

### Root Cause Analysis

**M-3 — a feature built entirely on the client.**
*Why it exists:* The screen was built to demonstrate the UX before the API existed, persisted to `localStorage` as a placeholder, and the placeholder shipped. The `PickupLocation` model was created in anticipation and never wired. Nothing failed loudly, so nothing prompted completion.
*Files:* `frontend/src/modules/Vendor/pages/PickupLocations.jsx`, `backend/src/models/PickupLocation.model.js`, `frontend/src/App.jsx:815`, `VendorSidebar.jsx`.
*Workflows impacted:* W-35; and any future order-routing or shipping-label feature that would depend on pickup addresses.
*Side effects:* Existing vendors have data in their browsers. A migration path should offer to import what is in `localStorage` on first load of the real feature, or it is silently discarded — which is defensible but must be a decision, not an accident. The hardcoded `country: "USA"` default on an INR/India platform must be corrected.

**M-6 / §7 — coupons have only a global cap.**
*Why it exists:* `Coupon` tracks `usageLimit`/`usedCount` and nothing per user. The enterprise checkout also increments usage *outside* the transaction with `.catch(console.error)`, while the legacy engine did it correctly inside a transaction with a conditional `$lt` guard — the weaker implementation is the one in production use.
*Side effects:* Adding per-user limits requires a usage-record collection and changes coupon eligibility evaluation in three places (public validate, session creation, order creation). All three must agree, or the customer sees a coupon accepted at validate and rejected at checkout.

**M-12 / §16 — integration partners are database-only.**
*Why it exists:* The integrations module was built API-first with env-var credentials for a single partner, and the multi-partner `IntegrationPartner` model was added without an admin surface. `IntegrationAuditLog` is written on every request and has no reader.
*Side effects:* Key rotation currently requires direct database access, which is itself an operational security problem. The admin UI must never display a stored key (they are hashed) — it can only issue a new one and show it once.

---

### Backend Changes

**APIs — new**
- `GET/POST/PUT/DELETE /api/vendor/pickup-locations` — full CRUD, vendor-scoped, with a default-location constraint.
- `GET /api/admin/integration-partners`, `POST` (issue key, returned once), `PATCH /:id` (scopes, IP allowlist, active), `POST /:id/rotate-key`, `DELETE /:id`.
- `GET /api/admin/integration-audit-logs` — filterable by partner, endpoint, status, date.
- `GET /api/admin/coupons/:id/usage` — per-user usage breakdown.

**APIs — changed**
- `POST /api/coupons/validate`, `POST /api/user/checkout/session`, checkout confirm — all three consult per-user usage.
- Coupon usage increment moves inside the order-creation transaction.
- Vendor-facing endpoints that should respect plan limits (product create, bulk import) consult the plan.

**Controllers** — new `vendor/pickupLocation.controller.js`, `admin/integrationPartner.controller.js`, `admin/integrationAudit.controller.js`.

**Services**
- New `pickupLocation.service.js` — default-location invariant, address validation, geocoding hook.
- `coupon.service.js` — per-user eligibility, transactional increment, and a single shared eligibility evaluator used by all three call sites.
- New `integrationPartner.service.js` — key generation, peppered hashing, rotation with a grace window, scope validation.
- New `planLimit.service.js` — resolves the active plan's limits and evaluates usage.

**Models**
- `PickupLocation` — finally used; add `vendorId` index, `isDefault`, `isActive`, operating hours, geo-point.
- New `CouponUsage` `{ couponId, userId, orderId, usedAt }` with a unique index supporting per-user counting.
- `Coupon` — `+perUserLimit`, `+firstOrderOnly`.
- `IntegrationPartner` — `+createdBy`, `+rotatedAt`, `+previousKeyHash` + `+previousKeyValidUntil` for rotation grace.

**Middleware** — none new; plan-limit checks are service calls inside controllers so the error can be specific.

**Validation** — pickup address (India postal format), operating hours, coupon per-user limit, partner scopes against a known scope list, IP allowlist entries.

**Permission enforcement** — integration partner management requires a dedicated token (superadmin-only recommended, given it issues API credentials); audit-log read under `SETTINGS_VIEW` or a new token, decided with Phase 8.

**Security improvements** — API keys shown once, hashed with a non-empty pepper (Phase 3 dependency), rotation with grace, audit-log visibility.

---

### Frontend Changes

**Pages affected**
- `modules/Vendor/pages/PickupLocations.jsx` — **rewritten** against the API; one-time `localStorage` import prompt.
- **New** `modules/Admin/pages/settings/IntegrationPartners.jsx` and `IntegrationAuditLogs.jsx`.
- `modules/Admin/pages/PromoCodes.jsx` — per-user limit fields, usage view.
- `modules/UserApp/pages/Checkout.jsx` — coupon rejection reasons including per-user exhaustion.
- `modules/Vendor/pages/SubscriptionManagement.jsx` — plan limits and current usage.

**Components affected** — new `PickupLocationForm`, `OperatingHoursEditor`, `ApiKeyIssuedModal` (one-time reveal with copy), `PlanUsageMeter`.

**Forms affected** — pickup location CRUD; coupon create/edit; partner create/rotate.

**State management** — new `pickupLocationStore`; coupon store carries per-user state; `vendorStore` exposes plan usage.

**API integration** — all new endpoints; `localStorage` read path removed after the import prompt.

**UX changes** — pickup locations persist across devices; coupon rejection is specific ("you have already used this code") rather than generic.

**Error handling** — plan-limit exceeded with an upgrade call-to-action; coupon per-user exhaustion; partner key rotation warning about the grace window.

---

### UI Changes

**Screens** — vendor pickup locations; admin integration partners; admin integration audit logs; admin promo codes; vendor subscription.

**New UI states** — *importing local data* (one-time), *no pickup locations yet*, *default location set*, *API key issued — copy now, it will not be shown again*, *key rotating — old key valid until X*, *plan limit reached*, *coupon already used by you*.

**Empty states** — no pickup locations; no partners; no audit entries in range.

**Validation states** — address/postal validation; at least one active default location required; operating hours coherence (open before close).

**Loading states** — geocoding a pickup address; issuing a key.

**Success states** — location saved and set as default; key issued; plan limits displayed with headroom.

**Error states** — duplicate default; invalid scope; rotation attempted while a grace window is open.

**Permission-based visibility rules** — integration partner screens superadmin-only; audit logs read-only for settings viewers; vendors see only their own pickup locations.

---

### Database Changes

**Collections impacted:** `pickuplocations`, `couponusages` (new), `coupons`, `integrationpartners`, `integrationauditlogs`, `subscriptionplans`.

**Migrations**
- `0026_pickup_location_indexes` — `{ vendorId: 1, isActive: 1 }`, partial unique on `{ vendorId, isDefault: true }`.
- `0027_coupon_usage` — new collection, unique `{ couponId, userId, orderId }`, plus a counting index.
- `0028_coupon_per_user_limit` — additive fields, defaulted to unlimited so existing coupons are unchanged.
- `0029_integration_partner_rotation` — additive fields.
- `0030_integration_audit_log_indexes` — the collection has been written since inception with no read indexes; add them before exposing the reader, or the first admin query scans everything.

**Backfill** — no historical `CouponUsage` can be reconstructed reliably from orders alone (coupon code is on the order, but a customer's prior usage across deleted orders is unknowable). Start counting from the cutover and record the date; per-user limits apply prospectively.

**Data integrity checks** — exactly one default pickup location per vendor; `IntegrationAuditLog` growth rate and a retention policy (it is unbounded today).

---

### Integration Changes

**Payment gateway** — none.
**Subscription flow** — plan limits consulted at product create and bulk import.
**Notification updates** — vendor notified on plan-limit approach; admin notified on partner key rotation.
**External services impacted** — an optional geocoding provider for pickup addresses; if none is adopted, coordinates are entered manually and that must be an explicit product decision.
**Webhook requirements** — none.

---

### Testing Requirements

**Unit** — default-location invariant; coupon per-user eligibility; key hashing and rotation grace; plan-limit evaluation.
**Integration** — pickup CRUD scoped to the owning vendor; coupon exhausted per user but available to another; partner authenticates with a rotated key during grace and fails after it.
**API** — cross-vendor pickup access → 403; partner endpoints reject non-superadmin; coupon usage view.
**Frontend** — `localStorage` import prompt appears once and only when local data exists; API key reveal shown exactly once.
**E2E** — W-10, W-35, W-57.
**Security** — API key never returned after issuance; audit log does not contain key material; pickup locations not cross-readable.
**Regression** — W-9, W-10, W-11, W-32, W-36, W-57.

---

### Verification Checklist
- [ ] Pickup locations persist server-side and are visible from a second browser and device.
- [ ] `grep -rn "localStorage" frontend/src/modules/Vendor/pages/PickupLocations.jsx` returns only the one-time import path.
- [ ] `country` defaults are India-appropriate and configurable.
- [ ] A coupon with `perUserLimit: 1` is rejected for a second use by the same customer at validate, session creation, and confirm — all three.
- [ ] Coupon usage increments inside the order transaction; a rolled-back order does not consume usage.
- [ ] An API key is displayed exactly once and never retrievable afterwards.
- [ ] Key rotation keeps the previous key valid for the configured grace window and then rejects it.
- [ ] Integration audit logs are queryable with indexes in place and have a retention policy.
- [ ] Plan limits are enforced at product create and bulk import, with a clear upgrade path in the UI.

### Rollback Strategy
- All four capabilities are **new surface**; reverting removes features rather than restoring broken ones — low risk.
- **Pickup locations:** keep the `localStorage` read path for one release after the API ships so a revert does not lose vendor data mid-transition.
- **Coupon per-user limits** ship defaulted to unlimited; enabling per coupon is a data change, not a deploy.
- **Plan limits** ship defaulted to unlimited for every existing plan; tightening is a business decision applied per plan.
- **Key rotation must never invalidate an active partner key without the grace window** — that is an outage for the partner.

---

# PHASE 10 — Reporting & Analytics Correctness

### Objective
Make the numbers true. Fix the P&L double-counting, exclude unpaid orders from revenue, move client-side full-table aggregation to the server, and deliver the trend metrics the UI already renders slots for.

### Business Impact
The Profit & Loss page reports a figure that is not a profit by any definition — it subtracts tax, shipping, and discount from a total that already accounts for all three, and includes no COGS, commission, or payout. Revenue includes every unpaid pending order. Decisions are being made on these numbers.

### Risk Level
**Medium** — no customer-facing behaviour changes, but reported figures will shift visibly and must be explained.

### Dependencies
**Phase 2** (order financial fields must be correct), **Phase 4** (refund data must exist), **Phase 5** (commission data must be complete). Reporting cannot be fixed before its inputs are.

### Estimated Effort
**L — 14 eng-days**, 8 QA-days. BE2 + FE2.

---

### Issues Covered

| ID | Finding |
|---|---|
| **§11** | P&L double-counts tax, shipping, and discount; no COGS, commission, or payout |
| **§11** | Revenue aggregations never filter on `paymentStatus` — unpaid orders inflate revenue |
| **P-1** | Three finance pages paginate the entire dataset into the browser |
| **M-10** | Missing: server-side finance aggregation endpoints |
| **M-11** | Missing: period-over-period analytics (`revenueChange` etc. rendered but never produced) |
| **§4/§11** | Refund reports derive from `ReturnRequest` instead of real refunds *(data source switched in Phase 4; correctness here)* |
| **W-46, W-47** | Workflows: P&L, tax/payment/refund reports |

---

### Root Cause Analysis

**P&L arithmetic.** `Order.total` already includes tax and shipping and is already net of discount. The page treats all three as separate deductions from that total. Compounding it, `Order.discount` is 0 on every splitter-created order (D-8, Phase 2) and `couponDiscount` carries the full cart value on each sub-order — so the discount term is simultaneously zero in one field and inflated in another. **A marketplace P&L should be built on commission revenue minus platform costs, not on GMV.** This is a product-definition problem as much as a code defect, and the correct metric set must be agreed with finance before implementation.

**Unpaid orders in revenue.** Every aggregation matches `{ isDeleted: {$ne:true}, status: {$ne:'cancelled'} }`. A pending COD order that is never delivered, and an abandoned card order left in `pending`, both count as revenue.

**Client-side aggregation.** `TaxReports`, `PaymentBreakdown`, and `RefundReports` each loop `while (page <= totalPages)` at 200 rows per call. No server-side aggregation endpoint exists for any of them, so the browser is the aggregation engine.

**Trend metrics.** `StatsCards` reads four `*Change` fields; no endpoint produces them. Correctly guarded by `Number.isFinite`, so nothing false is displayed — the feature is simply absent.

---

### Backend Changes

**APIs — new**
- `GET /api/admin/reports/tax-summary`, `/payment-mix`, `/refund-summary` — server-aggregated, date-ranged, paginated results not raw orders.
- `GET /api/admin/analytics/dashboard?compare=previous_period` — returns current and prior-period values plus computed deltas.
- `GET /api/admin/reports/pl` — a defensible marketplace P&L: gross merchandise value, platform commission revenue, refunds, delivery cost, payment-gateway fees (if obtainable), net platform revenue. Explicitly **not** "net profit" unless COGS becomes available.

**APIs — changed** — every existing analytics endpoint gains a `paymentStatus` filter with a documented default, and a cohort boundary at the Phase 2 cutover date so pre-fix and post-fix orders are not silently mixed.

**Controllers** — `admin/analytics.controller.js`, `admin/report.controller.js` extended; new aggregation handlers.

**Services** — new `reporting/financeAggregation.service.js` owning all pipelines; `analyticsCache.service.js` extended to cover the new endpoints with correct invalidation.

**Models** — none new. Consider a nightly pre-aggregated `DailyFinanceRollup` if query cost proves high; decide after measuring rather than pre-emptively.

**Validation** — date ranges bounded (reject unbounded "all time" on heavy pipelines); period enum.

**Permission enforcement** — reports under `REPORTS_VIEW`; export under `REPORTS_EXPORT` (currently unenforced — Phase 8 resolves the token; wire it here).

---

### Frontend Changes

**Pages affected** — `ProfitLoss.jsx` (rewritten around the new metric set), `TaxReports.jsx`, `PaymentBreakdown.jsx`, `RefundReports.jsx` (all three stop looping), `RevenueOverview.jsx`, `OrderTrends.jsx`, `Dashboard.jsx` (trend badges become live).

**Components affected** — `StatsCards.jsx` (deltas now populated), all `Analytics/*Chart` components fed by the new shapes.

**Forms affected** — date-range pickers gain server-enforced bounds.

**State management** — `analyticsStore` gains the new endpoints; remove the client-side aggregation helpers entirely.

**API integration** — pagination removed from report pages; a single aggregate call each.

**UX changes** — reports load in one request; a clear note where a metric's basis changed at the cutover date.

**Error handling** — range-too-large rejection with a suggested narrower range.

---

### UI Changes

**Screens** — six finance/analytics screens plus the dashboard.
**New UI states** — *period comparison unavailable* (insufficient history), *metric basis changed on <date>* annotation, *range too large*.
**Empty states** — no data in the selected range, distinguished from "no data at all".
**Validation states** — date range bounds.
**Loading states** — one skeleton per report instead of an indeterminate multi-request wait.
**Success states** — figures with an explicit basis label ("commission revenue", not "profit").
**Error states** — aggregation timeout with a narrower-range suggestion.
**Permission-based visibility rules** — export controls only for `REPORTS_EXPORT`.

---

### Database Changes

**Collections impacted:** `orders`, `refunds`, `commissions` (read-only); optional new `dailyfinancerollups`.
**Migrations** — `0031_analytics_supporting_indexes` — indexes backing the new pipelines (`{ paymentStatus, createdAt }`, `{ status, deliveredAt }`), built in background.
**Backfill** — none.
**Data integrity checks** — reconcile a sample period's aggregated figures against a manual sum; assert reported revenue ≤ sum of paid order totals; assert refund totals match Phase 4's ledger.

---

### Integration Changes
**Payment gateway** — optionally ingest Cashfree settlement reports to attribute gateway fees; treat as a stretch item.
**Subscription flow** — subscription revenue should appear as a distinct line, drawing on Phase 1's authorised activations.
**Notification updates** — none.
**External services** — none.
**Webhook requirements** — none.

---

### Testing Requirements
**Unit** — each aggregation pipeline against fixtures with known expected totals; delta computation including divide-by-zero and no-prior-period cases.
**Integration** — aggregated endpoint output equals a brute-force sum over the same fixture set.
**API** — range validation; permission enforcement; pagination of results not of raw orders.
**Frontend** — report pages issue exactly one request; charts render the new shapes.
**E2E** — W-46, W-47.
**Security** — reports scoped correctly; no vendor-identifying data leaks into vendor-facing analytics.
**Regression** — W-38, W-46, W-47, W-48; vendor analytics; QC analytics.

---

### Verification Checklist
- [ ] P&L no longer subtracts tax, shipping, or discount from a total that already includes them.
- [ ] The P&L metric set has been agreed in writing with finance and each figure carries an explicit basis label.
- [ ] Revenue figures exclude unpaid orders by default, with the filter visible and adjustable.
- [ ] Tax, payment-mix, and refund reports each issue exactly one request regardless of dataset size.
- [ ] A 100k-order dataset renders each report within an agreed budget (measured, not assumed).
- [ ] Trend badges display real period-over-period deltas.
- [ ] Refund reporting reads the `Refund` ledger, not `ReturnRequest`.
- [ ] The Phase 2 cutover cohort boundary is applied and surfaced in the UI.

### Rollback Strategy
- **Reporting changes are read-only** — reverting restores the previous (wrong) numbers with no data impact.
- **Ship new endpoints alongside the old pages first**, compare outputs on production data for a period, then switch the UI. This is the only way to be confident the new pipelines are right.
- **Announce the change to stakeholders before it lands.** Numbers moving without explanation destroys trust in the reporting more than the original defect did.
- Keep the old client-side aggregation code behind a flag for one release for side-by-side comparison, then delete it.

---

# PHASE 11 — Performance Optimization

### Objective
Remove the redundant work identified in the audit: the duplicate pricing computation, uncached feature-flag and subscription reads, the 500-product `localStorage` sync, and the per-request scans.

### Business Impact
Page-load and checkout latency, mobile data consumption, and database load. The `localStorage` sync in particular downloads a multi-megabyte payload on every visit and, when it exceeds quota, silently falls back to a **fabricated demo catalogue shown to real customers**.

### Risk Level
**Medium** — caching introduces staleness; the storefront fallback removal changes what an unpopulated client renders.

### Dependencies
Phase 2 (owns the duplicate pricing loop — coordinate), Phase 6 (catalogue shape), Phase 12 (a shared cache makes several of these correct at multi-instance scale).

### Estimated Effort
**L — 14 eng-days**, 7 QA-days. BE3 + FE1.

---

### Issues Covered

| ID | Finding |
|---|---|
| **P-2** | Every page load fetches 500 products + 200 vendors + all brands into `localStorage`; quota failure silently falls back to fake demo data |
| **P-4** | Feature flags read from Mongo on every call, no cache |
| **P-5** | `checkSubscription` queries the database on every vendor request |
| **P-6** | `getActiveSaleProductIds()` full `Campaign` scan on five public endpoints |
| **P-9** | `commitReservation` `setImmediate` loop doing `findById` + `save()` per product |
| **P-10** | `compression()` applied after `express.static` |
| **P-11** | `getUserOrders` returns full Mongoose documents without `.lean()` |
| **P-12** | QC feed uncached by design; `requireQuickCommerce` adds a `Settings.findOne` per request |
| **P-3** | Duplicate pricing loop *(implemented in Phase 2; verified here)* |
| **HC** | Static demo catalogue rendered to real customers (production-risk hardcoded value) |
| **DC** | `data/{products,vendors,brands}.js`, `catalogData.js` fallbacks |

---

### Root Cause Analysis

The storefront's `catalogData.js` was built as an offline-capable layer with a bundled demo catalogue as the ultimate fallback. `AppBootstrap` then syncs the real catalogue into `localStorage` on every mount. Three problems compose: the sync is unconditional and large; a `QuotaExceededError` inside the try block aborts the *entire* sync including the vendor and brand writes; and the fallback is fabricated product data with invented prices and ratings that reaches real customers on a first visit or after a cache clear. The remaining items are conventional missing-cache and missing-`.lean()` findings, individually small.

---

### Backend Changes
- **Caching layer** with TTL and explicit invalidation for feature flags, subscription state, and active-sale product ids. Start in-process (correct for single instance), and make the interface swappable so Phase 12 can move it to Redis without touching call sites.
- `commitReservation` — replace the per-product `findById`+`save()` loop with a single `bulkWrite`.
- `getUserOrders` and similar read paths — add `.lean()` and tighten projections.
- Move `compression()` above the static mounts.
- `requireQuickCommerce` — read the flag through the cache.
- Verify Phase 2 removed the duplicate pricing loop; add a call-count assertion to the test suite so it cannot return.

**Models / migrations** — none.
**Validation / permissions** — unchanged.
**Security** — cache keys must never span tenants; a vendor-scoped cached value must include the vendor id in the key. Review every key for this before merge.

---

### Frontend Changes
- **`AppBootstrap.jsx` — replace the bulk sync** with on-demand paginated fetches per surface. Remove the `localStorage` catalogue entirely, or reduce it to a small, explicitly-labelled recently-viewed cache.
- **`catalogData.js` — delete the static fallbacks.** Components that currently degrade to fake data must render an empty or loading state instead.
- Affected components: `DailyDealsSection`, `NewArrivalsSection`, `RecommendedSection`, `FeaturedVendorsSection`, `BrandLogosScroll`, `SearchSuggestions`, `ProductListItem`, `Brand.jsx`, `categories.jsx`.
- Add request de-duplication and caching at the API layer (per-key in-flight sharing) so removing the blanket sync does not produce a request storm.

**State management** — remove `localStorage`-backed catalogue selectors; introduce per-surface query state.
**UX changes** — first paint shows skeletons rather than fabricated products. This is a visible change and is the correct one.
**Error handling** — a failed catalogue fetch shows a retry affordance, not silent fake data.

---

### UI Changes
**Screens** — home, category, brand, search, sellers.
**New UI states** — *loading skeleton* per section (some already exist and are unused), *failed to load — retry*, *no products available*.
**Empty states** — genuine empty states replacing demo content. **This is the single most important UI change in the phase.**
**Validation / loading / success / error states** — per section as above.
**Permission-based visibility rules** — none.

---

### Database Changes
**Collections impacted** — none structurally.
**Migrations** — `0032_campaign_active_window_index` supporting `getActiveSaleProductIds`.
**Backfill** — none.
**Data integrity checks** — none.

---

### Integration Changes
None. (Cache backend selection is Phase 12.)

---

### Testing Requirements
**Unit** — cache TTL and invalidation; key isolation across tenants; `bulkWrite` stock-label derivation equals the previous per-document result.
**Integration** — flag change propagates within the TTL; subscription expiry is honoured within the TTL (**this is the risky one — an expired subscription must not remain writable for the full TTL; use a short TTL or invalidate on expiry**).
**API** — response-shape parity after `.lean()`; no virtuals lost (`Order` uses `toJSON: { virtuals: true }` and has a `deliveryAttempts` virtual — `.lean()` drops it; verify no consumer depends on it).
**Frontend** — no `localStorage` catalogue writes remain; sections render skeletons then real data; no demo product ever renders.
**E2E** — W-6, W-7, W-8 on a cold cache and a warm one.
**Security** — cached vendor-scoped data never served across vendors.
**Regression** — the entire storefront; vendor panel (subscription cache); QC surfaces.

---

### Verification Checklist
- [ ] No fabricated demo product, vendor, or brand can render under any condition — proven by deleting the static data files and confirming the build and all storefront tests still pass.
- [ ] `localStorage` no longer holds a catalogue payload.
- [ ] Feature-flag and subscription reads are cached with a documented TTL and correct invalidation; an expired subscription is blocked from writes within the agreed bound.
- [ ] `commitReservation` performs one bulk write per session rather than N document saves.
- [ ] `compression()` precedes the static mounts and `/uploads` responses are compressed.
- [ ] `.lean()` added where verified safe; the `deliveryAttempts` virtual dependency is checked.
- [ ] Cache keys are tenant-scoped; a review sign-off exists for every key.
- [ ] Measured before/after: storefront first-load payload, checkout p95 latency, and database ops-per-request.

### Rollback Strategy
- **Caching ships behind per-cache TTL settings**, with `0` meaning bypass — instant runtime disable without deploy.
- **The `localStorage` removal is the visible change.** Ship it behind a flag, measure bounce and conversion for a week, then delete the static data files. Deleting the files first makes rollback require a code restore rather than a flag flip.
- `.lean()` and `bulkWrite` changes are behaviour-preserving and safely revertible.
- **Do not roll back the demo-data removal** on aesthetic grounds — showing fabricated products to customers is a correctness and trust failure, not a UX preference.

---

# PHASE 12 — Horizontal Scalability & Stateless Runtime

### Objective
Make the application correct when more than one instance runs. Six components currently hold state in process memory.

### Business Impact
The application cannot be scaled horizontally or deployed with zero downtime. Rate limits multiply by instance count, notifications reach only the connected instance, background workers run N times concurrently without a lock, and bulk-upload job status fails unless the request happens to land on the originating instance.

### Risk Level
**High** — infrastructure change touching every request path.

### Dependencies
Phase 0 (config contract). Phase 11 (cache interface should be swappable before the backend is swapped).

### Estimated Effort
**L — 16 eng-days**, 8 QA-days. FS1 (lead) + BE1 + DevOps.

---

### Issues Covered

| ID | Finding |
|---|---|
| **B-9** | Single-instance-only architecture |
| **Scalability table** | `express-rate-limit` in-memory; `socket.io` without a Redis adapter; `activeJobs` module-level `Map`; `analyticsCache` in-memory; `responseCache` in-memory `Map`; four `setInterval` workers with no distributed lock |
| **D-15 (operational half)** | Replica set required for transactions *(asserted in Phase 0; provisioned here)* |

---

### Root Cause Analysis
Each component was built correctly for a single process. `express-rate-limit` defaults to a memory store; `socket.io` defaults to no adapter; `activeJobs` is a module-scope `Map` in `bulkUpload.service.js`; both caches are in-process; and `server.js` starts four `setInterval` workers (reservation sweep, retry queue, order recovery, wallet maturity) unconditionally at boot. None of these is a defect at one instance and all are defects at two. The rider wallet and reservation workers are the dangerous ones — running the same maturity or sweep job concurrently on two instances can double-apply effects unless every operation is idempotent, which has not been verified for all of them.

---

### Backend Changes
- **Redis introduced** as shared infrastructure: `rate-limit-redis` store, `@socket.io/redis-adapter`, cache backend behind Phase 11's interface.
- **Job state:** `activeJobs` moves to a persisted store (`BulkImportHistory` already carries progress fields — promote it to the source of truth and delete the in-memory map).
- **Distributed locking** for the four `setInterval` workers — a lease-based lock so exactly one instance runs each sweep. Alternatively move them to a dedicated worker process; **recommended**, because it also removes background load from request-serving instances.
- **Idempotency audit of every worker** before enabling multi-instance: reservation sweep, retry queue, order recovery, wallet maturity, QC alert sweep. Each must be provably safe if it runs twice concurrently, lock or no lock.
- Graceful shutdown: drain connections, release leases, finish in-flight jobs.
- Session/socket affinity removed as a requirement.

**Models** — none new; `BulkImportHistory` becomes authoritative for job state.
**Migrations** — none.
**Validation / permissions** — unchanged.
**Security** — Redis must be network-isolated and authenticated; it will hold rate-limit counters and cached authorisation-adjacent data (subscription state), so it is in scope for the threat model.

---

### Frontend Changes
- Socket reconnection handling must tolerate reconnecting to a different instance (room re-join on reconnect — verify `socketService.js` already re-joins conversation and order rooms; if not, add it).
- Bulk-upload progress polling must work regardless of which instance answers.

**UI changes** — none visible beyond more reliable real-time behaviour; add a *reconnecting* indicator on long-lived screens (support chat, order tracking, bulk import).

---

### Database Changes
**Collections impacted** — none structurally. `bulkimporthistories` gains read traffic as the job-state source.
**Migrations** — `0033_bulk_import_history_job_state_index` on `{ jobId: 1 }`.
**Backfill** — none.
**Data integrity checks** — assert no orphaned "processing" jobs after a rolling deploy; assert no double-applied wallet maturity transitions during a two-instance soak.

---

### Integration Changes
**Payment gateway** — webhooks must be safe to receive on any instance (already are; the claim service handles it).
**Subscription flow** — unaffected.
**Notification updates** — socket delivery becomes cross-instance via the Redis adapter; verify push and in-app are unaffected.
**External services impacted** — **Redis is a new production dependency** requiring provisioning, HA, monitoring, and a documented failure mode. Decide explicitly what happens when Redis is unavailable: fail closed (reject requests) or fail open (degrade to in-memory, accepting incorrect rate limits). **Recommended: fail open for caching, fail closed for locks.**
**Webhook requirements** — none new.

---

### Testing Requirements
**Unit** — lock acquisition, expiry, and contention; job-state read/write through the persisted store.
**Integration** — two instances behind a load balancer: rate limit is shared; a socket event emitted on instance A reaches a client on instance B; a bulk job started on A is queryable and cancellable on B; each sweep runs once per interval across the pair.
**API** — unchanged contracts; verified under round-robin routing.
**Frontend** — reconnect re-joins rooms and resumes progress polling.
**E2E** — the full workflow matrix executed against a two-instance deployment. **This is the acceptance gate for B-9 and cannot be substituted with single-instance testing.**
**Security** — Redis not reachable from outside the private network; no secret material cached.
**Regression** — everything. A two-instance soak of at least 72 hours before production rollout.

---

### Verification Checklist
- [ ] Two instances share rate-limit counters (proven by exhausting a limit against instance A and being blocked on B).
- [ ] A socket notification emitted on one instance is received by a client connected to the other.
- [ ] A bulk-upload job started on one instance reports progress and accepts cancellation on the other.
- [ ] Each background sweep executes exactly once per interval across the cluster.
- [ ] Every worker is documented as idempotent, with the reasoning recorded, independent of the lock.
- [ ] Graceful shutdown drains connections and releases leases; a rolling deploy causes no failed requests.
- [ ] Redis failure mode is documented, implemented, and tested for both the cache and lock paths.
- [ ] A 72-hour two-instance soak completes with no duplicated financial effects (wallet maturity, COD capture, rider earnings).

### Rollback Strategy
- **Scale back to one instance** — the immediate mitigation for any multi-instance defect, and it restores exactly today's behaviour.
- **Each component migrates independently** (rate limiter, then socket adapter, then cache, then job state, then workers) so a problem is attributable and revertible in isolation.
- **The worker migration is the riskiest** — prefer extracting to a dedicated single worker process over distributed locking, because "exactly one process runs it" is a far stronger guarantee than "a lock usually works".
- **Do not enable multi-instance in production until the two-instance soak passes**, regardless of schedule pressure. Duplicate financial effects are the failure mode and they are not always immediately visible.

---

# PHASE 13 — Configuration Externalization

### Objective
Move every business-policy constant out of code and into administered settings, and replace the two remaining data-shaped hacks (the test-vendor regex, the CORS allowlist).

### Business Impact
Business policy currently requires a code deploy to change: commission rate, escrow period, minimum payout, return windows, delivery estimates, reservation timeouts, tax rate, rate limits. Operations cannot respond to a commercial decision without engineering.

### Risk Level
**Low-Medium** — mechanical, but a wrong default silently changes financial behaviour.

### Dependencies
Phase 0 (config contract), Phase 5 (owns the commission/escrow/payout constants — this phase generalises the pattern), Phase 8 (settings validation).

### Estimated Effort
**M — 8 eng-days**, 4 QA-days. BE2 + FE2.

---

### Issues Covered

| ID | Finding |
|---|---|
| **HC — Needs Configuration (11 items)** | CORS allowlist; rate limits; cache TTLs; reservation TTLs; `taxRate` default 18; `lowStockThreshold` 10 vs 5 *(unified in Phase 6)*; `MAX_IMPORT_ROWS`; catalogue sync limits *(removed in Phase 11)*; currency metadata list; 50 MB body limit *(sized in Phase 3)* |
| **HC — Production Risk** | `PUBLIC_TEST_VENDOR_REGEX` / `DUMMY_STORE_REGEX`; commission default 10 in three places; 7-day escrow; `MINIMUM_PAYOUT` 500; `+5 days` estimated delivery; 24/168 return windows; `'9999999999'` / `'customer@dwellmart.com'` gateway fallbacks; `country: "USA"` *(fixed in Phase 9)* |
| **S-18** | CORS allowlist hardcodes a Vercel preview domain |
| **§6** | Test-vendor suppression regex duplicated across backend and frontend |

---

### Root Cause Analysis
Each constant was correct when written and none had a configuration surface, so the value went inline. Three of them (commission default, escrow, minimum payout) are duplicated across files, so they can already drift. The gateway customer fallbacks (`'9999999999'`, `'customer@dwellmart.com'`) are a different class: they substitute fake contact details onto real transactions, which breaks reconciliation and defeats gateway-side fraud scoring — those should be **removed, not configured**, with the request rejected instead. The test-vendor regex hides legitimate sellers whose names happen to match (`Testa Furnishings`, `Sample House`, `SK Store`) and is duplicated in two languages.

---

### Backend Changes
- New `settings` categories (`commerce`, `fulfilment`, `security`) added to `SETTINGS_CATEGORY_SCHEMAS` with proper Joi bounds — reusing the pattern that already exists for `quick_commerce`, which is the model to follow.
- A single `policy.service.js` resolving every value with a documented default, so a missing setting degrades to today's behaviour rather than to zero.
- Remove the gateway contact fallbacks; validate and reject instead.
- Replace `PUBLIC_TEST_VENDOR_REGEX` with a `Vendor.isTestAccount` boolean, honoured in the public read paths.
- CORS allowlist from configuration.
- `MAX_IMPORT_ROWS`, reservation TTLs, cache TTLs, rate limits sourced from settings with sane bounds.

**Models** — `Vendor` `+isTestAccount` (indexed).
**Validation** — bounds on every new setting; a negative fee or zero speed must be rejected at the schema, as `quickCommerceSchema` already does.
**Permissions** — new categories under `SETTINGS_VIEW`/`SETTINGS_EDIT`; the `security` category (rate limits, body limits) should require superadmin.

---

### Frontend Changes
- New admin settings sections for commerce and fulfilment policy, following the existing `QuickCommerceSettings.jsx` pattern.
- Vendor-facing surfaces that display policy (return window, escrow period, minimum payout) read it from settings rather than hardcoding matching strings.
- Remove `DUMMY_STORE_REGEX` from `catalogData.js`.

**UI changes** — new settings screens with per-field help text stating the effect and the safe range; a *value differs from default* indicator; confirmation on changing a financial policy (commission, escrow, minimum payout) with an explicit "this affects future payouts" warning.

---

### Database Changes
**Collections impacted:** `settings`, `vendors`.
**Migrations**
- `0034_vendor_is_test_account` — additive; backfill by applying the current regex **once**, producing a reviewable list rather than applying silently. An operator confirms the list before it is committed.
- `0035_seed_policy_settings` — writes current in-code values as the initial settings so behaviour is identical on deploy day.
**Data integrity checks** — assert every policy read resolves to the same value pre- and post-migration (a golden-value comparison run).

---

### Integration Changes
**Payment gateway** — removing the fake contact fallbacks means some previously-accepted requests now fail validation. Inventory how often the fallbacks currently trigger before removing them, or checkout breaks for a population you did not know existed.
**Others** — none.

---

### Testing Requirements
**Unit** — `policy.service` defaults equal the previous constants exactly; bounds rejection per field.
**Integration** — changing a setting changes behaviour without a restart; a missing setting falls back to the default.
**API** — new settings categories accept valid and reject invalid payloads.
**Frontend** — settings screens; policy-derived copy updates.
**E2E** — place an order after changing the return window and assert the new window applies.
**Security** — non-superadmin cannot edit the `security` category.
**Regression** — full commerce flow with default settings, asserting zero behaviour change on deploy day.

### Verification Checklist
- [ ] Every value in the audit's "Needs Configuration" and "Production Risk" lists is either administered, removed, or has a written rationale for remaining hardcoded.
- [ ] Seeded settings reproduce today's behaviour exactly (golden-value comparison passes).
- [ ] Commission rate, escrow, and minimum payout each have exactly one source.
- [ ] `isTestAccount` replaces both copies of the regex; the backfill list was operator-reviewed.
- [ ] Gateway contact fallbacks are removed; requests missing contact details are rejected with a clear error.
- [ ] CORS origins come from configuration; the Vercel preview domain is gone from source.

### Rollback Strategy
- Settings default to the current constants, so a revert is behaviourally neutral.
- **Financial policy changes are not revertible in effect** once payouts are computed against them — gate commission/escrow/payout edits behind confirmation and audit logging.
- The `isTestAccount` backfill is reviewable and reversible per vendor.
- Removing the gateway fallbacks is the one behaviour-changing item; ship it after measuring how often they fire.

---

# PHASE 14 — Dead Code Elimination & Repository Hygiene

### Objective
Remove everything the audit proved unreachable, resolve the duplicated subsystems, and clean the repository of committed PII and one-off scripts.

### Business Impact
Indirect but real: two order engines, two support systems, and ~30 dead files are the conditions that let defects like the `distanceKm` `ReferenceError` and the dead `productCapabilityGuard` survive unnoticed. Every future change costs more while they remain.

### Risk Level
**Low-Medium** — deletion is safe when preceded by evidence, dangerous when not.

### Dependencies
Phases 3, 7, 8 (each deletes code this phase would otherwise remove — sequence after them to avoid conflicts).

### Estimated Effort
**M — 8 eng-days**, 4 QA-days. BE3 + FE2.

---

### Issues Covered
All **DC** items: 6 unreferenced models (`Attribute`, `AttributeSet`, `AttributeValue`, `PickupLocation` *(revived in Phase 9)*, `Zipcode`, `City`); 2 write-only models (`IntegrationAuditLog` *(reader added in Phase 9)*, `FailedJob` *(reader added in Phase 4)*); the orphaned `SupportTicket` subsystem (model + 8 admin endpoints + `adminService` wrappers + `supportStore`); dead middleware (`productCapabilityGuard` *(resolved in Phase 8)*, `uploadCSV`); dead import (`haversineDistanceKm` *(removed in Phase 7)*); 12 unrouted frontend pages; `ComingSoon` imported-never-rendered; ~16 unreferenced components; 8 unreferenced stores/utils; 6 deprecated bridges; 2 fake pages (`Admin/Content.jsx` *(Phase 8)*, `Vendor/PickupLocations.jsx` *(Phase 9)*); the `LiveChat` duplicate alias; `Vendor/utils/vendorHelpers.js` with an unresolvable import; 13 one-off scripts in `backend/src/`; triplicated seed/verify scripts; **S-14** committed PII.

---

### Root Cause Analysis
Three distinct causes, requiring three different responses:
1. **Superseded implementations kept "for compatibility"** (legacy order engine, `SupportTicket`, `Admin/components/Settings/*`) — these need a decision and a deletion, not archaeology.
2. **Anticipatory code** (`Attribute*`, `Zipcode`, `City`, `PickupLocation`) — models created for planned features. `PickupLocation` is being revived; the others should be deleted and re-added if the feature arrives.
3. **Development artefacts committed to source** (13 scripts in `backend/src/`, triplicated test/seed scripts, 8 PII files). `backend/src/advance_escrow_period.js` **mutates financial data** (back-dating `deliveredAt` so earnings mature early) and ships inside the deployed source tree — that is the most serious item here.

**Critical note on `Admin/components/Settings/PaymentSettings.jsx`:** it is dead code *and* the only UI capable of configuring Cashfree credentials. It cannot simply be deleted — Phase 2 must first decide whether credentials are env-only or a working screen is restored. **Do not delete it before that decision is recorded.**

---

### Backend Changes
- Delete the `SupportTicket` subsystem after confirming `TicketType` usage is preserved (the `/admin/support/ticket-types` route is live and used).
- Delete unreferenced models and their files.
- Delete `uploadCSV`.
- Move the 13 one-off scripts out of `backend/src/` into a non-deployed `tools/` directory, or delete them. **`advance_escrow_period.js`, `fix_user_address_indore.js`, and `update_qc_vendor_indore.js` mutate data and must not ship in a production image under any circumstance.**
- De-duplicate `backend/scripts/`, `backend/tests/`, and root `tests/` into one location.
- Add a CI check failing the build on an unreferenced export in `src/` (dead-code detection), so this does not re-accumulate.

**Models / migrations** — dropping unused collections is optional; if any hold data, export before dropping. Prefer leaving empty collections in place over risking data loss.

---

### Frontend Changes
- Delete the 12 unrouted pages, ~16 unreferenced components, 8 unreferenced stores/utils, and 6 deprecated bridges *(after confirming the deprecation replacements are fully adopted)*.
- Remove the `ComingSoon` import.
- Resolve `LiveChat` — either give it a distinct purpose or remove the route and the sidebar entry.
- Fix or delete `Vendor/utils/vendorHelpers.js` (its bare `'data/products'` import cannot resolve; the file is dead, which is the only reason the build succeeds).
- Add a CI check for unreferenced modules.

**UI changes** — removal of sidebar entries that led to dead or duplicate pages; no new states.

---

### Database Changes
**Collections impacted** — `supporttickets`, `tickettypes` (retained), `attributes`, `attributesets`, `attributevalues`, `zipcodes`, `cities`.
**Migrations** — `0036_archive_unused_collections` — export-then-drop, gated on an operator confirmation that each is empty or archived.
**Data integrity checks** — confirm no live code references before drop; confirm `SupportTicket` holds no records that customers can still see.

---

### Integration Changes
None, except that removing scripts from the deployed tree slightly reduces image size and attack surface.

---

### Testing Requirements
**Unit / integration** — full suite must pass after each deletion batch.
**API** — deleted endpoints return 404; retained neighbours unaffected (`ticket-types` in particular).
**Frontend** — build succeeds; bundle-size delta recorded; no route regressions.
**E2E** — full matrix as a regression gate.
**Security** — confirm PII files removed from HEAD and `.gitignore` covers both upload trees; the history decision is executed or formally accepted.
**Regression** — W-50, W-51 (support), the vendor and admin panels end-to-end.

### Verification Checklist
- [ ] Every deleted file was proven unreferenced by tooling, not by reading.
- [ ] `backend/src/` contains no one-off or data-mutating scripts.
- [ ] Seed/verify scripts exist in exactly one location.
- [ ] The `SupportTicket` subsystem is gone and `TicketType` management still works.
- [ ] `Admin/components/Settings/PaymentSettings.jsx` is deleted **only after** the credential-management decision is recorded.
- [ ] The 8 PII files are removed from HEAD; `.gitignore` prevents recurrence; the history decision is documented.
- [ ] CI fails on newly-unreferenced exports in both backend and frontend.
- [ ] Frontend bundle size reduction is measured and recorded.

### Rollback Strategy
- Deletions are recoverable from version control; batch them by subsystem so a revert is surgical.
- **Delete in small, independently revertible commits**, never one sweeping change.
- **Do not drop collections holding data.** Export first; prefer leaving them.
- The CI dead-code checks may fail on legitimately-new code before it is wired — allow an explicit annotation to suppress, reviewed at merge.

---

# PHASE 15 — Observability & Operational Readiness

### Objective
Make failures visible. Replace ~200 raw console calls with structured logging, add alerting on the financial invariants introduced in earlier phases, and give operators the runbooks and dashboards to run this system.

### Business Impact
Several audit findings were silent by construction — commission creation failing into a `.catch(console.error)`, admin push never delivering, reserved-stock leaking, price mismatches logging and continuing. Without observability the fixes cannot be confirmed to hold.

### Risk Level
**Low** — additive.

### Dependencies
Phases 2, 4, 5, 6, 12 (each defines an invariant this phase monitors).

### Estimated Effort
**M — 10 eng-days**, 4 QA-days. FS1 + BE2.

---

### Issues Covered
Audit "Operational" enhancements: structured logging; health checks that verify dependencies; the monitored invariants defined across Phases 2, 4, 5, 6; **§11** admin push never delivered *(fixed in Phase 8; alerting must not depend on it until then)*; **D-12** migration visibility; error taxonomy and correlation.

---

### Root Cause Analysis
Logging grew ad hoc; there is no correlation id in log output despite `requestId` middleware existing (`middlewares/requestId.js` is applied first in `app.js` but its value never reaches log lines). There is no alerting, so every invariant added by this programme would be unobserved without it.

---

### Backend Changes
- Structured JSON logging with the existing `requestId` as the correlation key, log levels, and redaction of secrets and PII (order addresses, phone numbers, tokens).
- Replace `console.*` across `src/` with the logger; **explicitly redact** in the two places that currently log full objects (`checkout.controller.js:89` logs the entire validation result; the webhook logs payloads).
- Metrics: checkout success/failure, payment verify outcomes, refund states, reservation drift, settlement transitions, worker run counts, migration state.
- **Alerts on the invariants:** session-vs-orders total mismatch (Phase 2), refund gateway-vs-local divergence (Phase 4), delivered-orders-without-commission (Phase 5), `reservedQuantity` drift (Phase 6), duplicate worker execution (Phase 12).
- Error taxonomy: typed application errors with stable codes, so alerting can be precise rather than string-matching.
- `/health` extended per Phase 0; add `/ready` distinguishing liveness from readiness for the load balancer.

**Frontend changes** — client error reporting with the same correlation id; surface a support reference on error screens so a customer report maps to a log trace.

**UI changes** — error states display a correlation reference; admin gains a lightweight system-health panel *(optional; only if it will be maintained)*.

**Database changes** — none. Log and metric storage is external.

**Integration changes** — a log aggregation and alerting provider is a new operational dependency requiring selection, cost approval, and PII-handling review.

---

### Testing Requirements
**Unit** — redaction (no secret, token, or full address reaches a log line); level filtering.
**Integration** — correlation id propagates request → log → error response.
**API** — `/health` and `/ready` behave correctly under a simulated database outage.
**E2E** — trigger each monitored invariant deliberately in staging and confirm the alert fires.
**Security** — log output audited for PII and secret leakage. **This must be a named review, not an assumption.**
**Regression** — no performance degradation from logging volume; measure.

### Verification Checklist
- [ ] `grep -rn "console\." backend/src | wc -l` is materially reduced and every remaining instance is justified.
- [ ] No log line contains a token, secret, full address, or phone number — proven by a log-scanning test.
- [ ] Correlation ids appear in every request log and in error responses.
- [ ] Each of the five invariant alerts fires when deliberately violated in staging.
- [ ] Runbooks exist for: payment gateway outage, refund failure backlog, reservation drift, settlement dispute, worker duplication, Redis outage.
- [ ] `/ready` removes an instance from rotation during a rolling deploy.

### Rollback Strategy
- Logging changes are additive; log level is runtime-configurable, so verbosity problems are a config change.
- Alerting thresholds start deliberately loose and tighten after a baseline period — a noisy alert that gets muted is worse than no alert.
- Removing `console.*` is behaviour-neutral; revert is a code restore.

---

# PHASE 16 — Test Automation, Regression Suite & Release Hardening

### Objective
Convert the audit's 58-row workflow matrix into an executable regression suite, add the security regression tests that prove each exploit is closed, and establish a release process that prevents recurrence.

### Business Impact
The audit could not run the existing suites because they connect to the live database and several mutate production data (`advance_escrow_period.js` back-dates financial records). There is currently no safe way to verify a release.

### Risk Level
**Low** — additive, but it gates every other phase's sign-off.

### Dependencies
Runs **alongside every phase**, not after. Each phase contributes its own tests; this phase provides the harness, the environment, and the gate.

### Estimated Effort
**XL — 20 eng-days** spread across all sprints, 20 QA-days. QA1 + QA2 + BE/FE contributions.

---

### Issues Covered
The audit's inability to execute tests safely; absence of a regression gate; the "Testing Requirements" of all sixteen phases; W-1…W-58 as the executable matrix.

---

### Root Cause Analysis
Test scripts, seed scripts, and one-off data-mutation scripts live intermixed across three directories with no separation between "safe to run" and "will modify production". `npm test` points at `tests/run.mjs` which requires a live `MONGO_URI`. There is no ephemeral test database, no fixture strategy, and no CI gate.

---

### Changes
- **Ephemeral test environment:** containerised MongoDB replica set (required for transactions) plus Redis, provisioned per CI run. **This unblocks everything else.**
- **Fixture strategy:** deterministic seed data covering every actor, experience, and cart archetype used in the phase test matrices.
- **Test taxonomy and separation:** unit / integration / API contract / E2E / security regression, with the data-mutating scripts quarantined outside the test tree entirely.
- **The 58-row matrix becomes the E2E suite**, each row an automated test tagged with its owning phase.
- **Security regression suite:** one named test per audit exploit — B-1 free subscription, B-4 catalogue export, B-8 order PII, S-8 stored XSS, S-12 unbounded vote, S-13 typing injection, plus the Phase 5 concurrency and Phase 6 duplicate-import tests. **Every one must reproduce the original exploit and assert it now fails.**
- **CI gates:** unit + integration + contract on every PR; E2E + security on merge to main; permission-matrix and dead-code checks (Phases 8, 14) as blocking.
- Load testing for the endpoints Phase 10 and 11 touch, with recorded baselines.
- Release process: staged deploys, kill-switch inventory per release, documented rollback per phase, and a post-deploy verification script.

---

### Testing Requirements
*(This phase is testing.)* Its own acceptance is that every other phase's suite runs green in CI against ephemeral infrastructure, unattended, with no access to production data.

### Verification Checklist
- [ ] CI provisions an ephemeral MongoDB replica set and Redis; no test touches a shared database.
- [ ] All 58 workflow rows are automated and tagged to a phase.
- [ ] Every audit exploit has a named security regression test that fails against the pre-fix build and passes against the post-fix build. **Both directions must be demonstrated.**
- [ ] Data-mutating scripts cannot execute in CI or from a production image.
- [ ] Coverage thresholds agreed and enforced on the financial services (checkout, pricing, refund, settlement, wallet).
- [ ] A post-deploy verification script runs after every production release.
- [ ] The kill-switch inventory is complete and each switch is exercised in staging.

### Rollback Strategy
- Test infrastructure changes carry no production risk.
- If a new gate blocks delivery spuriously, allow a documented, time-boxed, reviewed override — never a silent skip.

---

# PHASE 17 — Closure & Traceability Matrix

### Objective
Prove no audit finding is unowned.

### Coverage assertion

| Audit section | Count | Phases | Unclaimed |
|---|---|---|---|
| Production Blockers B-1…B-9 | 9 | 1, 2, 3, 4, 5, 6, 7, 12 | **0** |
| Security S-1…S-21 | 21 | 1, 2, 3, 8, 15 | **0** |
| Database D-1…D-15 | 15 | 0, 2, 5, 6, 7, 14 | **0** |
| Performance P-1…P-12 + 6 scalability components | 18 | 10, 11, 12 | **0** |
| Missing Functionality M-1…M-15 | 15 | 4, 5, 6, 7, 8, 9, 10 | **0** |
| Hardcoded — Critical | 5 | 0, 6, 13 | **0** |
| Hardcoded — Production Risk | 10 | 6, 9, 13 | **0** |
| Hardcoded — Needs Configuration | 11 | 3, 6, 11, 13 | **0** |
| Dead Code groups | 9 | 3, 7, 8, 9, 14 | **0** |
| Module findings §1–§16 not otherwise ID'd | 14 | 3, 6, 7, 8, 9, 10, 14, 15 | **0** |
| Workflow matrix W-1…W-58 | 58 | all phases; automated in 16 | **0** |
| Near-blocking list (10 items) | 10 | 0, 6, 7, 8, 10, 11, 12 | **0** |

**Explicit deferrals** — recorded as accepted gaps, not omissions:
1. **Automated vendor payout disbursement** — payouts remain manual with UTR capture (Phase 5), consistent with the rider model.
2. **Subscription refunds** — out of Phase 4's scope; no mechanism exists to refund a subscription payment.
3. **COGS-based profitability** — Phase 10 delivers commission-based platform revenue; true profit needs cost data the system does not hold.
4. **Product soft-delete** — Phase 6 requires a business decision; either outcome closes D-2, but "implement soft-delete" is not assumed.
5. **Git history rewrite for the 8 PII files** — Phase 3/14 require a decision; accepting history is a valid, documented outcome.
6. **Geocoding provider for pickup addresses** — Phase 9 ships with manual coordinates if no provider is adopted.

---

# Dependency Graph

```
                          ┌──────────────────────────────────────────┐
                          │ PHASE 0 — Foundation                     │
                          │ config contract · boot guards · migrations│
                          └───────────────┬──────────────────────────┘
                                          │ (blocks all schema work)
        ┌─────────────────┬───────────────┼───────────────┬─────────────────┐
        ▼                 ▼               ▼               ▼                 ▼
  ┌───────────┐     ┌───────────┐   ┌───────────┐   ┌───────────┐    ┌───────────┐
  │ PHASE 1   │     │ PHASE 2   │   │ PHASE 3   │   │ PHASE 6   │    │ PHASE 16  │
  │ Subscript.│     │ Payment   │   │ Access    │   │ Catalog & │    │ Test      │
  │ Billing   │     │ Integrity │   │ Control   │   │ Inventory │    │ Harness   │
  └─────┬─────┘     └─────┬─────┘   └─────┬─────┘   └─────┬─────┘    └─────┬─────┘
        │                 │               │               │                │
        │                 ▼               │               │                │ runs
        │           ┌───────────┐         │               │                │ across
        │           │ PHASE 4   │◄────────┘               │                │ ALL
        │           │ Refunds   │  (must not build on     │                │ phases
        │           └─────┬─────┘   an unguarded surface) │                │
        │                 │                               │                │
        │                 ▼                               │                │
        │           ┌───────────┐                         │                │
        │           │ PHASE 5   │                         │                │
        │           │ Settlement│                         │                │
        │           └─────┬─────┘                         │                │
        │                 │                               │                │
        │                 └──────────┬────────────────────┘                │
        │                            ▼                                     │
        │                      ┌───────────┐                               │
        │                      │ PHASE 7   │                               │
        │                      │ Checkout  │                               │
        │                      │ Consolid. │                               │
        │                      └─────┬─────┘                               │
        │                            │                                     │
        └──────────┬─────────────────┘                                     │
                   ▼                                                       │
             ┌───────────┐                                                 │
             │ PHASE 8   │  permissions · feature flags                    │
             └─────┬─────┘                                                 │
                   │                                                       │
     ┌─────────────┼─────────────┬──────────────┐                          │
     ▼             ▼             ▼              ▼                          │
┌─────────┐  ┌─────────┐   ┌─────────┐    ┌─────────┐                      │
│ PHASE 9 │  │PHASE 10 │   │PHASE 11 │    │PHASE 12 │                      │
│ Missing │  │Reporting│   │  Perf   │    │ Scale   │                      │
│  Funcs  │  │         │   │         │    │         │                      │
└────┬────┘  └────┬────┘   └────┬────┘    └────┬────┘                      │
     │            │             │              │                           │
     └────────────┴──────┬──────┴──────────────┘                           │
                         ▼                                                 │
                   ┌───────────┐                                           │
                   │ PHASE 13  │ config externalization                    │
                   └─────┬─────┘                                           │
                         ▼                                                 │
                   ┌───────────┐                                           │
                   │ PHASE 14  │ dead code (LAST — after all deletions)    │
                   └─────┬─────┘                                           │
                         ▼                                                 │
                   ┌───────────┐                                           │
                   │ PHASE 15  │ observability ◄───────────────────────────┘
                   └─────┬─────┘   (monitors invariants from 2,4,5,6,12)
                         ▼
                   ┌───────────┐
                   │ PHASE 17  │ closure & traceability
                   └───────────┘
```

### Hard dependencies (violating these produces defects)

| Predecessor | Successor | Why |
|---|---|---|
| **0** | 5, 6, 7, 9, 13 | Migration framework required for every schema change |
| **0** | 6, 12 | Replica-set assertion required before transaction-dependent work |
| **2** | 4 | Refund amounts derive from order financial fields that are currently wrong |
| **2** | 10 | Reporting cannot be corrected while its inputs are corrupt |
| **3** | 9 | Do not build new features on an unguarded surface |
| **3** | 6 | `costPrice` becomes exportable — export authorisation must land first |
| **4** | 7 | Paid-order cancellation requires a working refund pipeline |
| **4** | 5 | Refund reversal interacts with settlement state |
| **4** | 10 | Refund reporting needs refund data to exist |
| **5** | 10 | Commission completeness needed for revenue reporting |
| **6** | 7 | Checkout consolidation must land on a correct inventory model |
| **1** | 9 | Plan limits are meaningless until activation is authorised |
| **8** | 4, 5 | Permission tokens for refund and settlement routes |
| **11** | 12 | Cache interface must be swappable before the backend is swapped |
| **all** | 14 | Dead-code removal last, or it conflicts with every other deletion |
| **2,4,5,6,12** | 15 | Observability monitors invariants those phases define |

### Soft dependencies (sequencing preference, not correctness)

- **1 ↔ 2 ↔ 3** all modify `cashfree.controller.js` — assign a **single file owner** for the sprint or serialise the merges.
- **2 ↔ 7** both edit the `OrderSplitterEngine` transaction boundary — Phase 2 performs the structural move, Phase 7 owns retry semantics. Coordinate in the same sprint or accept a rebase.
- **6 ↔ 11** both touch catalogue read paths.
- **8 ↔ 4/5** permission-token decisions must be made once, not twice.

### Parallelisable

- Phases **1, 2, 3, 6** after Phase 0 (four independent streams).
- Phases **9, 10, 11, 12** after Phase 8.
- Phase **16** runs continuously alongside everything.

---

# Critical Path

**The minimum set that must be complete before any production release.**

```
0 → 2 → 4 → 5 → 7 → 8 → 12 → 16
    ↑    ↑
    1    3        (parallel entries, both mandatory)
    6             (parallel entry, mandatory)
                  15 (mandatory — you cannot operate this without it)
```

### Release-blocking phases

| Phase | Why it blocks release |
|---|---|
| **0** | Without the config contract, production runs with the geo-fence disabled and mock OTP reachable |
| **1** | Unauthenticated free subscriptions — total revenue loss, exploitable with one request |
| **2** | Customers charged an amount that does not match their orders; a settings save destroys the gateway secret |
| **3** | Any authenticated user exports the full catalogue with vendor emails; unauthenticated order PII disclosure |
| **4** | Customers are told they were refunded and receive nothing |
| **5** | Concurrent payout requests pay a vendor twice |
| **6** | Every bulk import duplicates the catalogue; variants oversell |
| **7** | Paid orders cannot be cancelled; orders without email cannot be delivered |
| **8** | Twelve permissions grant authority the system does not honour |
| **12** | The application is incorrect at more than one instance — no HA, no zero-downtime deploy |
| **15** | Every fix above defines an invariant that is unmonitored without it |
| **16** | No safe way to verify a release exists today |

### Non-blocking (fast-follow, in priority order)

**10** (reporting correctness) → **11** (performance) → **9** (missing functionality) → **13** (config externalization) → **14** (dead code)

> **Caveat on Phase 10:** it is not customer-blocking, but the business is currently making decisions on a P&L that double-counts tax, shipping, and discount. **Do not defer it past the first post-launch cycle**, and until it lands, treat every finance report as unreliable in writing.

### Longest dependency chain

`0 → 2 → 4 → 5 → 7 → 8 → 12 → 15` — **eight sequential phases**, ~106 eng-days of strictly serial work. This is the schedule floor: no amount of additional headcount compresses it below roughly four sprints, because each phase depends on its predecessor's output.

---

# Production Readiness Checklist

### A. Security
- [ ] Unauthenticated subscription activation is impossible; the original exploit is a passing regression test
- [ ] No endpoint returns another actor's PII without an ownership check
- [ ] `/api/products/*` router deleted after a zero-traffic instrumentation release
- [ ] Every permission token is enforced or removed; a CI check prevents regression
- [ ] No write action is gated on a `*_VIEW` permission
- [ ] All ~35 previously unguarded admin frontend routes carry a guard
- [ ] File uploads validated by sniffed content; `/uploads/tmp` not publicly served; sweeper running
- [ ] Public write endpoints (coupon validate, feedback, translation, tracking, helpful vote) rate-limited
- [ ] Integration API keys hashed with a non-empty pepper; pass-the-hash branch removed; rotation with grace
- [ ] Committed PII removed from HEAD; `.gitignore` updated; history decision documented
- [ ] Secrets never returned by any endpoint; secret changes audit-logged without values
- [ ] `enforceAccountStatus` re-validates role from persistence
- [ ] Every audit exploit has a named regression test proven to fail pre-fix and pass post-fix

### B. Financial integrity
- [ ] `Σ Order.total == CheckoutSession.summary.grandTotal` for every session — enforced and monitored
- [ ] `assertPriceConsistency` runs in `enforce` mode after a clean 7-day soak
- [ ] Refunds move real money; local records reach `succeeded` only on gateway confirmation
- [ ] All four refund reversals (commission, rider earning, COD ledger, stock) applied and idempotent
- [ ] Refund value caps configured; gateway-vs-local reconciliation job green
- [ ] Concurrent payout requests produce exactly one settlement — proven by a concurrency test
- [ ] Unique indexes on `{orderId, vendorId}` commissions and on open settlements per vendor
- [ ] Commission creation is durable (retry queue), not fire-and-forget
- [ ] Zero delivered orders without a commission record
- [ ] `Order.discount` and `couponDiscount` record true values
- [ ] Subscription activation requires a verified payment or an audited admin grant
- [ ] Legacy `internal` subscription reconciliation report reviewed with a written business decision
- [ ] Legacy `refunded` order inventory reviewed with a written business decision

### C. Data integrity
- [ ] `sku` and `costPrice` persist; a repeat import creates zero duplicates
- [ ] Unique SKU index built after a clean duplicate report
- [ ] Variant stock reserved, committed, and released on the live path
- [ ] `reservedQuantity` equals open reservations for every product — monitored invariant
- [ ] Phantom `isDeleted` index resolved (implemented or removed, not partially)
- [ ] `lowStockThreshold` has one value across schema and runtime
- [ ] All migrations idempotent, ordered, dry-runnable, with a verify step
- [ ] Zero pending migrations at boot in production

### D. Correctness & completeness
- [ ] Legacy order engine deleted after a zero-traffic instrumentation release
- [ ] `distanceKm` `ReferenceError` eliminated with its dead endpoint
- [ ] Paid orders cancellable within a configured window, producing a refund
- [ ] Delivery OTP has a working channel for every order (SMS fallback live)
- [ ] Pickup locations persist server-side
- [ ] Per-user coupon limits enforced at all three evaluation points
- [ ] Every feature flag has a reader; disabling each demonstrably changes behaviour
- [ ] No fabricated demo product, vendor, or brand can render under any condition
- [ ] `productCapabilityGuard` functional or deleted
- [ ] Admin push notifications received on a registered device

### E. Performance & scale
- [ ] Finance reports issue one request each; 100k-order dataset within the agreed budget
- [ ] Feature-flag and subscription reads cached with correct invalidation
- [ ] `localStorage` catalogue sync removed
- [ ] Two instances share rate limits, sockets, job state, and caches
- [ ] Each background worker runs exactly once per interval cluster-wide
- [ ] Every worker documented as idempotent independent of its lock
- [ ] 72-hour two-instance soak with zero duplicated financial effects
- [ ] Graceful shutdown; rolling deploy causes no failed requests

### F. Operability
- [ ] Structured logging with correlation ids; no secret or PII in log output
- [ ] All five financial invariant alerts fire on deliberate violation in staging
- [ ] `/health` and `/ready` verify dependencies, not just liveness
- [ ] Runbooks for gateway outage, refund backlog, reservation drift, settlement dispute, worker duplication, Redis outage
- [ ] Kill-switch inventory complete; every switch exercised in staging
- [ ] Post-deploy verification script runs on every production release
- [ ] Production `.env` audited: `NODE_ENV=production`, no forbidden keys, `CASHFREE_ENV=production`, pepper non-empty

### G. Process
- [ ] CI provisions ephemeral MongoDB replica set + Redis; no test touches a shared database
- [ ] All 58 workflow rows automated and tagged
- [ ] Data-mutating scripts cannot run in CI or from a production image
- [ ] Coverage thresholds enforced on checkout, pricing, refund, settlement, wallet
- [ ] Dead-code and permission-matrix CI checks blocking
- [ ] Rollback documented and rehearsed per phase

---

# Risk Matrix

### P0 — Critical (revenue loss, security exposure, or data corruption; release-blocking)

| ID | Finding | Category | Phase |
|---|---|---|---|
| B-1 / S-1 | Unauthenticated free activation of paid subscriptions | Revenue loss · Privilege escalation | 1 |
| B-2 / D-5 | Charged amount ≠ orders recorded (dead wholesale settings key) | Payment inconsistency · Revenue loss | 2 |
| B-3 / M-1 | No refund execution anywhere | Financial · Regulatory | 4 |
| B-4 / S-3 | `/api/products/*` unguarded — catalogue export, import hijack | Data exfiltration · Privilege escalation | 3 |
| B-5 / S-4 | Settings save destroys the Cashfree secret | Production outage | 2 |
| B-6 / D-1 | Bulk import drops `sku` — infinite catalogue duplication | Data corruption | 6 |
| B-7 / D-6 | Vendor payout race → double payout | Revenue loss | 5 |
| B-8 / S-2 | Unauthenticated full-order PII disclosure | PII exposure · Regulatory | 3 |
| B-9 | Single-instance-only architecture | Outage risk · No HA | 12 |
| §3b | `ReferenceError` — QC legacy checkout 500s | Broken workflow | 7 |
| §3a / D-4 | Two order engines, divergent stock → oversell | Inventory corruption | 6, 7 |
| S-10 | Payment session creation without ownership | Enumeration · IDOR | 1, 3 |

### P1 — High (material business impact; must precede or immediately follow launch)

| ID | Finding | Category | Phase |
|---|---|---|---|
| S-5 / §12a | 12 permissions enforced nowhere | Governance · Privilege | 8 |
| S-6 / §12b | Write actions on read permissions | Privilege escalation | 5, 8 |
| S-7 | Public metered translation API | Cost abuse | 3 |
| S-8 | Stored XSS via upload extension | Security | 3 |
| S-9 | Pass-the-hash on integration keys | Security | 3 |
| D-3 | Reserved-stock leak | Inventory corruption | 6 |
| D-7 | Non-atomic `confirmCheckout` | Duplicate orders | 7 |
| D-8 / §3e | `Order.discount` unwritten; `couponDiscount` inflated | Financial reporting | 2 |
| D-12 | No migration framework | Operational risk | 0 |
| D-15 | Replica-set requirement unasserted | Total checkout failure | 0 |
| M-4 | Variant stock never enforced | Inventory corruption | 6 |
| M-7 | Paid orders uncancellable | Broken workflow | 7 |
| M-8 | Email-only delivery OTP | Undeliverable orders | 7 |
| M-9 | Vendor shipping revenue never credited | Vendor underpayment | 5 |
| M-14 | Commission fire-and-forget | Silent vendor earning loss | 5 |
| §11 | P&L double-counts; revenue includes unpaid | Wrong business decisions | 10 |
| P-1 | Finance pages aggregate client-side | Unusable at scale | 10 |
| P-2 | 500-product localStorage sync → fake demo data shown | Trust · Performance | 11 |
| §12d | 6 of 8 feature flags dead | Governance | 8 |
| §10 | `productCapabilityGuard` no-op | Missing enforcement | 8 |
| §11 | Admin push never delivered | Silent alert loss | 8 |
| HC | Geo-fence disabled by `NODE_ENV`; Delhi fallback coordinate | Wrong fees/ETA | 0, 6 |
| M-3 | Pickup locations localStorage-only | Fake feature | 9 |
| §12c | ~35 unguarded admin routes | Governance | 8 |

### P2 — Medium (quality, maintainability, moderate exposure)

| ID | Finding | Phase |
|---|---|---|
| S-11 IDOR on notification read · S-12 unbounded helpful vote · S-13 typing bypass · S-14 committed PII · S-15 50 MB body limit · S-16 coupon brute-force · S-17 feedback abuse | 3 |
| D-2 phantom index · D-11 threshold mismatch · D-13 dead models | 6, 14 |
| P-4…P-9 caching, N+1, `.lean()`, bulk writes | 11 |
| M-6 per-user coupon limits · M-12 integration admin UI · M-13 plan limits | 9 |
| M-10 server aggregation · M-11 trend analytics | 10 |
| §12e review settings mismatch · §12f content tab saves nothing | 8 |
| §8 duplicate admin notifications · §8 tracking number at creation | 7 |
| §6 test-vendor regex · §6 QC serviceability fallback | 6, 13 |
| §16 no integration admin UI · `IntegrationAuditLog` unread | 9 |
| §15 two support systems | 14 |
| HC production-risk values (commission, escrow, payout, ETA, return windows, gateway fallbacks) | 13 |

### P3 — Low (hygiene, defence in depth)

| ID | Finding | Phase |
|---|---|---|
| S-18 CORS preview domain · S-19 token scope leakage · S-20 tracking enumeration · S-21 role from token | 3, 13 |
| D-14 stale comment | 14 |
| P-10 compression order · P-11 missing `.lean()` · P-12 QC per-request flag read | 11 |
| DC — all dead code groups | 14 |
| HC — needs-configuration values | 13 |
| Structured logging, runbooks, health checks | 15 |

---

# Sprint Breakdown

**Team:** 3 BE · 2 FE · 1 FS/DevOps · 2 QA (**3 QA recommended — see Effort Estimate**) · ARCH 40%
**Sprint = 2 weeks = 60 eng-days · 20 QA-days**

### Sprint 1 — "Stop the bleeding" (60 eng-days)
| Phase | Effort | Owner |
|---|---|---|
| **0** Foundation | 8 | BE1 + FS1 |
| **1** Subscription billing authorization | 12 | BE1 + FE1 |
| **2** Payment integrity (**B-5 as a day-1 hotfix**) | 14 | BE2 + FE1 |
| **3** Access control & data exposure | 16 | BE3 + FS1 |
| **16** Test harness — ephemeral infra, fixtures | 10 | QA1 + QA2 |

**Exit criteria:** B-1, B-5, B-8 closed. B-2 shipped in `observe` mode. `/api/products/*` instrumented. CI runs against an ephemeral replica set.
**Sprint risk:** three phases touch `cashfree.controller.js` — assign BE2 as sole file owner.

### Sprint 2 — "Make the money right" (60)
| Phase | Effort | Owner |
|---|---|---|
| **4** Refund pipeline | 22 | BE1 + BE2 + FE2 |
| **5** Settlement & commission ledger | 16 | BE2 + FE2 |
| **6** Catalog & inventory integrity (start) | 18 of 22 | BE3 + FE1 |
| **16** Security regression suite | 4 | QA1 |

**Exit criteria:** B-3 pipeline live with the kill switch **off**. B-7 unique indexes built. B-6 schema + backfill deployed. B-2 soak underway.

### Sprint 3 — "Consolidate and govern" (60)
| Phase | Effort | Owner |
|---|---|---|
| **6** Catalog & inventory (finish) | 4 | BE3 |
| **7** Checkout consolidation & order lifecycle | 20 | BE1 + BE3 + FE2 |
| **8** Permissions, roles & feature flags | 18 | BE2 + FE1 + FE2 |
| **11** Performance (start) | 10 | BE3 + FE1 |
| **16** Workflow matrix automation | 8 | QA1 + QA2 |

**Exit criteria:** Legacy order engine deleted. B-2 flipped to `enforce`. Refund caps raised. All permission tokens enforced or removed. Variant reservation live.

### Sprint 4 — "Scale and see" (60)
| Phase | Effort | Owner |
|---|---|---|
| **9** Missing business functionality | 24 | FS1 + FE1 + BE3 |
| **10** Reporting & analytics correctness | 14 | BE2 + FE2 |
| **11** Performance (finish) | 4 | BE3 |
| **12** Horizontal scalability | 16 | FS1 + BE1 |
| **16** Load testing baselines | 2 | QA2 |

**Exit criteria:** Pickup locations real. Reports server-aggregated and arithmetically correct. Two-instance soak started.

### Sprint 5 — "Harden and close" (60)
| Phase | Effort | Owner |
|---|---|---|
| **13** Configuration externalization | 8 | BE2 + FE2 |
| **14** Dead code & repo hygiene | 8 | BE3 + FE2 |
| **15** Observability & operational readiness | 10 | FS1 + BE2 |
| **16** Suite completion, CI gates, release process | 16 | QA1 + QA2 + BE1 |
| **Hardening** — soak, rehearsed rollback, production readiness sign-off | 18 | all |

**Exit criteria:** Every checklist item green. 72-hour two-instance soak clean. Rollback rehearsed for each critical phase. Phase 17 closure matrix signed.

---

# Implementation Order

**The exact sequence engineers should execute. Do not reorder without re-reading the hard-dependency table.**

1. **Phase 0 stage A** — config contract in warn-only mode; migration framework; replica-set assertion
2. **B-5 / S-4 hotfix** — settings sentinel strip. *Standalone release. Two files. Highest value-per-hour in the programme; do not couple it to Phase 2's larger scope*
3. **Phase 16 (a)** — ephemeral CI infrastructure. *Blocks safe verification of everything after this point*
4. **Phase 1** — subscription authorization *(backend tolerant of both payloads → frontend → remove tolerance)*
5. **Phase 3 (a)** — ownership checks, notification IDOR, helpful vote, socket typing
6. **Phase 3 (b)** — rate limiters, body limit, CORS externalization
7. **Phase 3 (c)** — upload sniffing in log-only mode; tmp static behind a token; sweeper
8. **Phase 3 (d)** — instrument `/api/products/*`
9. **Phase 2** — wholesale flag unification + duplicate loop collapse + order financial fields, shipped in `observe` mode. *Drain in-flight sessions at deploy*
10. **Phase 0 stage B** — config contract throws *(only after 48h of zero warnings)*
11. **Phase 6 (a)** — `sku`/`costPrice` schema + deterministic backfill + duplicate report
12. **Phase 6 (b)** — unique SKU index; importer duplicate detection becomes live
13. **Phase 4 (a)** — refund ledger, orchestrator, UI, reversals — kill switch **off**
14. **Phase 5 (a)** — duplicate reports → cleanup → unique indexes *(the constraint alone closes B-7)*
15. **Phase 5 (b)** — transactional payout rewrite; durable commission creation
16. **Phase 4 (b)** — enable gateway refunds with low value caps
17. **Phase 3 (e)** — delete `/api/products/*` *(after confirmed zero traffic)*
18. **Phase 6 (c)** — variant reservation, flag off → soak → on
19. **Phase 6 (d)** — QC geolocation strictness; remove the Delhi fallback
20. **Phase 2 (b)** — flip `assertPriceConsistency` to `enforce` *(after a clean 7-day soak)*
21. **Phase 7 (a)** — transaction boundary; atomic COD confirm
22. **Phase 7 (b)** — instrument, then delete the legacy order engine
23. **Phase 8 (a)** — permission matrix + CI checks *(no behaviour change)*
24. **Phase 8 (b)** — frontend route guards
25. **Phase 8 (c)** — permission raises *(after the impact report and re-granting)*
26. **Phase 8 (d)** — feature-flag enforcement, one flag per release
27. **Phase 4 (c)** — raise refund caps
28. **Phase 7 (c)** — SMS OTP (flag off → on); paid-order cancellation (flag off → on)
29. **Phase 11** — caching, bulk writes, `.lean()`, compression order
30. **Phase 11 (b)** — remove the `localStorage` catalogue and the demo-data fallback
31. **Phase 9** — pickup locations, coupon per-user limits, integration console, plan limits
32. **Phase 10 (a)** — new aggregation endpoints running **alongside** the old pages for comparison
33. **Phase 10 (b)** — switch the UI; announce the metric change to stakeholders first
34. **Phase 12** — Redis; then rate limiter → socket adapter → cache → job state → workers, one at a time
35. **Phase 12 (b)** — 72-hour two-instance soak
36. **Phase 13** — configuration externalization *(seeded to current values; golden-value comparison)*
37. **Phase 15** — structured logging, invariant alerts, runbooks
38. **Phase 14** — dead-code removal *(last, in small revertible batches)*
39. **Phase 16 (b)** — full matrix automation, CI gates, release process
40. **Phase 17** — closure sign-off

---

# Effort Estimate

### By phase

| Phase | Classification | Eng-days | QA-days | Regression-days |
|---|---|---|---|---|
| 0 Foundation | M | 8 | 3 | 1 |
| 1 Subscription billing | L | 12 | 6 | 2 |
| 2 Payment integrity | L | 14 | 8 | 3 |
| 3 Access control | L | 16 | 8 | 3 |
| 4 Refund pipeline | XL | 22 | 12 | 4 |
| 5 Settlement ledger | L | 16 | 8 | 3 |
| 6 Catalog & inventory | XL | 22 | 12 | 4 |
| 7 Checkout consolidation | L | 20 | 10 | 3 |
| 8 Permissions & flags | L | 18 | 10 | 3 |
| 9 Missing functionality | XL | 24 | 12 | 2 |
| 10 Reporting correctness | L | 14 | 8 | 2 |
| 11 Performance | L | 14 | 7 | 2 |
| 12 Scalability | L | 16 | 8 | 4 |
| 13 Config externalization | M | 8 | 4 | 2 |
| 14 Dead code | M | 8 | 4 | 2 |
| 15 Observability | M | 10 | 4 | 1 |
| 16 Test automation | XL | 20 | 20 | — |
| **Total** | | **262** | **144** | **41** |

### Classification summary
- **Small (≤2 days):** none as whole phases; the B-5 hotfix (~1 day) is the only Small item, extracted deliberately.
- **Medium (3–8):** Phases 0, 13, 14, 15 — 34 eng-days
- **Large (9–20):** Phases 1, 2, 3, 5, 7, 8, 10, 11, 12 — 140 eng-days
- **Extra-Large (>20):** Phases 4, 6, 9, 16 — 88 eng-days

### Capacity reconciliation

| | Demand | Capacity (5 sprints) | Delta |
|---|---|---|---|
| Engineering | 262 | 300 (6 engineers) | **+38 (13% buffer)** |
| QA | 144 | 100 (2 QA) | **−44 shortfall** |
| Regression | 41 | included in QA above | — |

> **QA is the constraint, not engineering.** With two QA engineers the programme is 44 QA-days short. Three options, in order of preference:
> 1. **Add a third QA engineer** (150 QA-days capacity) — closes the gap with margin. *Recommended.*
> 2. Engineers own unit and integration tests (~40 days of the demand), leaving QA on integration, E2E, security, and regression. Viable but reduces engineering buffer to near zero.
> 3. Extend to a sixth sprint. Delays the critical path by two weeks.

### Calendar
- **5 sprints = 10 working weeks** with the recommended team.
- **Critical-path floor: ~4 sprints (8 weeks)** — the serial chain `0→2→4→5→7→8→12→15` is ~106 eng-days and cannot be parallelised away.
- **Production release gate: end of Sprint 4** at the earliest, and only if Phases 15 and 16 are complete enough to operate and verify. **Realistically end of Sprint 5.**

### Confidence and contingency
- **High confidence (±15%):** Phases 0, 1, 2, 3, 5, 8, 13, 14 — well-bounded, evidence-rich.
- **Medium (±30%):** Phases 6, 7, 10, 11, 12 — schema migrations and infrastructure carry discovery risk.
- **Low (±50%):** Phases 4, 9, 16 — Phase 4 introduces a new gateway integration with unknown sandbox behaviour; Phase 9 adds an SMS/geocoding vendor decision; Phase 16 depends on how much of the existing suite is salvageable.
- **Recommended contingency: 20% (≈52 eng-days).** The audit's own pattern — silent failures composing into non-functional features — means **expect discovery**, particularly once `assertPriceConsistency` starts enforcing and reveals mismatches this audit did not isolate.

---

# Final Deliverable — Master Roadmap

### Current state
🚫 **NOT PRODUCTION READY.** Nine blockers; three cause direct, immediate revenue loss and are exploitable on day one. Six components hold state in process memory, so the application is correct only as a single instance. Twelve permissions and six feature flags are decorative. There is no refund capability, no migration framework, and no safe way to run the test suite.

### Target state
🚀 **ENTERPRISE PRODUCTION READY.** Every audit finding closed or formally deferred with a written rationale. Every financial invariant monitored and alerting. Every exploit a passing regression test. Multi-instance, zero-downtime deployable. Business policy administered rather than compiled.

### The journey

| Stage | Sprints | Verdict at exit | What changes |
|---|---|---|---|
| **Stage 1 — Contain** | 1 | 🚫 Not ready, *no longer exploitable* | Free subscriptions closed. Gateway secret protected. PII disclosure closed. Catalogue export locked. Pricing corrected in `observe`. CI can verify a build. |
| **Stage 2 — Correct the money** | 2 | 🚫 Not ready, *financially sound* | Refunds move real money. Double payout structurally impossible. SKU persists; imports stop duplicating. |
| **Stage 3 — Consolidate** | 3 | ⚠️ **Ready with risks** | One order engine. Pricing enforced. Permissions mean what they say. Feature flags functional. Variant stock enforced. |
| **Stage 4 — Complete & scale** | 4 | ⚠️ Ready with risks, *scalable* | Reports true. Fake features made real. Demo data gone. Two-instance correct. |
| **Stage 5 — Harden** | 5 | ✅ **PRODUCTION READY** | Policy administered. Dead code gone. Observability and runbooks live. Full regression automated. Rollback rehearsed. |
| **Post-programme** | +1–2 | 🚀 **Enterprise ready** | Deferrals resolved: automated disbursement, subscription refunds, COGS-based profitability. |

### The three things that matter most

1. **Ship the B-5 settings-sentinel hotfix on day one.** Two files, roughly one engineer-day, and it prevents a total payment outage that one click on an admin screen currently triggers. Nothing else in this programme has a comparable value-to-effort ratio.
2. **Do not defer Phase 16.** The audit could not run the test suite because it points at a live database and some scripts mutate financial records. Every phase after Sprint 1 is unverifiable until that is fixed — Phase 16 is not overhead, it is the gate on everything else.
3. **Sequence the price-consistency enforcement correctly.** Fix the wholesale flag → soak in `observe` for seven days with zero mismatches → only then enforce. Enforcing first fails every wholesale checkout on deploy day; never enforcing leaves the corruption in place. The order is the entire safety of that change.

### Governance
- **Weekly:** blocker burn-down; open kill switches; invariant alert volume.
- **Per phase:** verification checklist signed by engineering *and* QA before close; rollback rehearsed for every P0 phase.
- **Escalate to the business, do not decide in engineering:** the wholesale flag's intended value; legacy `internal` subscription revocation; legacy `refunded` order liability; vendor shipping-revenue policy; product soft-delete; git history rewrite; the P&L metric definition.
- **Do not close the programme** until Phase 17's traceability matrix shows zero unclaimed findings and every deferral carries a written, business-accepted rationale.






