DwellMart — Post-Audit Implementation Roadmap
Prepared for engineering assignment · Architecture planning document · No implementation
Planning Principles Applied
Before the phases, the reasoning that shaped this structure — because the sequencing is the deliverable, not the task list.

## 1. The root cause gets fixed first, not last. The audit's central finding was not any individual bug; it was that 353 passing assertions coexisted with a completely non-functional module. Contract tests validated layers in isolation while nothing validated that screens were wired to endpoints. Phase 0 therefore writes the failing end-to-end tests before any repair work begins. Those tests become the release gate, and Phase 3's exit criterion is simply "Phase 0 goes green." This costs ~2 days and permanently removes the failure class that produced six false "production ready" sign-offs.

## 2. Wholesale is decoupled from Quick Commerce and released early. The audit found B2B functionally sound and blocked only by shared platform-security issues. Two small phases (1 and 2) unblock a Wholesale GA weeks before QC is viable. Holding a working module hostage to a broken one would be a planning error.

## 3. "Functional" and "operable" are separated deliberately. Phase 3 makes a QC order complete end to end. Phase 4 makes it safe to run a business on. These are distinct gates: a flow that works but is invisible when it fails is not shippable. Splitting them lets Phase 3 be validated in staging while Phase 4 is built.

## 4. Critical work is merged by subsystem, not by actor. The three critical QC blockers span vendor, admin and rider surfaces, but all three are "the endpoint exists, the screen does not." They share test fixtures, seed data and review context. Splitting them by role would triple the setup cost for no isolation benefit.

## 5. Phases 0–2 parallelise. They touch disjoint files and have no interdependencies. A three-engineer team compresses the first three phases into one week of wall-clock time.

# PHASE 0 — Integration Test Harness & Release Gate
Purpose
The audit's most damaging finding was a process failure, not a code failure. Unit and contract tests passed at every phase while three flow-breaking gaps shipped. This phase builds the missing verification layer and encodes the known-broken flows as failing tests, so that repair work has an objective definition of done and the failure class cannot recur.

Priority
Critical — must precede repair work.

Business Impact
No user-facing change. Establishes the gate every subsequent phase is measured against. Converts "the harness passes" from a misleading signal into a trustworthy one.

Issues Covered
ID	Audit Finding
TEST-1	Zero integration coverage across both modules (§20, Test coverage: "Misleading")
TEST-2	No test drives an order through the UI layer (Final Verdict, lesson)
PROC-1	Release sign-off standard was contract-level, not flow-level
Files Expected To Change
New: backend/tests/integration/ — harness scaffold, seed fixtures, in-memory/ephemeral Mongo setup
New: backend/tests/integration/quickCommerceOrderLifecycle.test.mjs
New: backend/tests/integration/wholesaleOrderLifecycle.test.mjs
New: backend/tests/integration/roleAuthorizationMatrix.test.mjs
Modified: backend/package.json — test scripts
New: docs/release-gate.md — the definition of done for future phases
Dependencies
None. Can start immediately.

Implementation Scope
Stand up an integration test runner against an ephemeral database with realistic seed data: one hybrid vendor with retail + wholesale + QC channels, one QC-enabled rider, one QC category tree, products on each channel, one customer.

Author three suites. The QC lifecycle suite drives placement → vendor accept → preparing → ready → rider assign → picked up → arriving → OTP delivery, asserting at each step against the HTTP API the frontend actually calls — not against services directly. This suite is expected to fail at the vendor-accept step on day one; that failure is the deliverable. The Wholesale lifecycle suite covers MOQ rejection, tier pricing, and order completion, and should pass immediately, establishing the baseline. The role authorization matrix suite asserts every role against every sensitive endpoint, including the settings routes Phase 1 will repair.

Add a lightweight frontend contract check that statically verifies every api.* call path in the frontend resolves to a registered backend route. This is cheap and would have caught the vendor-screen mismatch directly.

Testing Checklist
Backend: all three suites execute; seed/teardown is idempotent; suites run in CI without a live database
API: every assertion targets an HTTP endpoint, never an imported service
Database: fixtures create and clean up without leaking state between suites
Permissions: matrix suite enumerates admin, subadmin, vendor, rider, customer, anonymous
Regression: existing 353 assertions still pass unchanged
Edge cases: suites fail loudly and specifically when a step is unreachable, rather than timing out
Expected Outcome
A red QC lifecycle test that precisely documents where the flow breaks, a green Wholesale baseline, and a repeatable gate. Every later phase gains an unambiguous completion signal.

# PHASE 1 — Settings Security Hotfix
Purpose
Close the most severe finding in the codebase: any anonymous user can read every settings category, and any authenticated subadmin can write them regardless of granted permissions. This is pre-existing infrastructure that both new modules depend on, and it is exploitable today in production.

Priority
Critical — ship as a standalone hotfix, ahead of all feature work.

Business Impact
Eliminates unauthenticated disclosure of platform configuration and any credentials stored under settings keys. Restores the permission system's authority over feature flags and payment configuration. Unblocks the Wholesale release path.

Issues Covered
ID	Sev	Audit Finding
SEC-1	Critical	GET /api/settings/:category public, unauthenticated, no key allowlist, no field filtering (public.routes.js:65)
SEC-2	High	GET/PUT /admin/settings/:category use adminAuth with no checkPermission (admin.routes.js:275-276)
SEC-3	High	No Joi validation on settings writes; raw req.body persisted (settings.controller.js:153-165)
SEC-4	High	Mass assignment / no value-range guards (negative fees accepted)
Files Expected To Change
Backend routes: backend/src/routes/public.routes.js, backend/src/modules/admin/routes/admin.routes.js
Backend controllers: backend/src/modules/admin/controllers/settings.controller.js
New validator: backend/src/modules/admin/validators/settings.validator.js
New constant: public-safe settings key + field allowlist
Frontend (verification only): frontend/src/modules/UserApp/pages/Checkout.jsx, storefront settings consumers — confirm no regression
Tests: extend Phase 0 role-authorization matrix
Dependencies
None. Parallel with Phase 0 and Phase 2.

Implementation Scope
Replace the public catch-all with an explicit allowlist of storefront-safe keys, and within each key an explicit field allowlist — the same allowlist discipline already applied successfully to toPublicVendor. Anything not named is not returned. Audit what is currently stored under payment before choosing the allowlist; if gateway credentials are present, treat their exposure as an incident requiring key rotation, not merely a code fix.

Apply SETTINGS_VIEW and SETTINGS_EDIT to the admin category routes, matching the pattern already correct two lines above on /settings/general.

Introduce per-category Joi schemas for the keys the platform actually owns — features, payment, quick_commerce, general — with type and range constraints. Unknown categories should be rejected rather than silently accepted, closing the arbitrary-key write.

Testing Checklist
API: anonymous GET /api/settings/payment, /features, /quick_commerce return 404 or filtered payloads only
Permissions: subadmin without settings.edit receives 403 on write; without settings.view receives 403 on read
Backend: negative fees, absurd radii, and unknown categories are rejected with 400
Frontend: checkout payment-method resolution, storefront branding, and feature-flag reads still function
Database: no existing settings documents are mutated by the change
Regression: full existing harness suite; storefront loads for anonymous users
Edge cases: missing settings document, empty value object, partial update preserving unlisted fields
Expected Outcome
The settings subsystem is governed: read access is allowlisted, write access is permission-gated and validated. The critical exposure is closed.

# PHASE 2 — Feature Flag Contract Enforcement
Purpose
The audit found the wholesale flag decorative — it gates vendor channel enablement only, not listing, pricing or checkout. The QC flag is enforced correctly. This inconsistency means "turn wholesale off" does not actually turn wholesale off, which is unacceptable for a kill switch.

Priority
High — final blocker for Wholesale GA.

Business Impact
Both feature flags become genuine kill switches. Wholesale can be enabled or disabled per environment with confidence, which is a precondition for staged rollout and incident response. Wholesale/B2B becomes releasable after this phase.

Issues Covered
ID	Sev	Audit Finding
FLAG-1	High	Wholesale flag not enforced at listing, pricing, or checkout (§3, §6)
FLAG-2	Medium	/quick route renders client-side with flag off (App.jsx:233)
FLAG-3	Low	Flag-off behaviour asserted only for QC, never for wholesale
Files Expected To Change
Backend services: backend/src/services/featureFlags.service.js, backend/src/services/pricingEngine.service.js (call-site gating, not engine logic), backend/src/services/catalogQuery.service.js
Backend controllers: backend/src/modules/user/controllers/order.controller.js, backend/src/routes/public.routes.js
Frontend routing: frontend/src/App.jsx
Frontend components: wholesale badge/filter consumers under frontend/src/modules/UserApp/
Tests: backend/scripts/verifyQuickCommercePolish.mjs — extend flag-off isolation section to cover wholesale
Dependencies
None functionally. Best sequenced after Phase 0 so the flag-off assertions land in the integration matrix.

Implementation Scope
Define one explicit contract for what "flag off" means and apply it identically to both modules: entry points hidden, new orders on that channel rejected, channel-specific pricing not applied, but committed orders always complete. That last clause is already correct for QC and must be preserved for wholesale.

Gate wholesale at three points: catalogue filtering (wholesale-only products not listed), the pricing engine call site in placeOrder (tier pricing not applied — fall back to retail), and the wholesale filter/badge surfaces. Resist the temptation to move the gate inside the pricing engine; the engine is parity-tested against a frontend mirror and should remain a pure function.

Add a client-side route guard for /quick mirroring the existing ExperienceSwitcher flag check, which is already correct and can be reused.

Testing Checklist
Backend: with wholesale off, tier pricing does not apply; wholesale-only products absent from listings; wholesale-only checkout rejected with a clear reason
Backend: with wholesale off, an in-flight wholesale order still completes through delivery
API: flag state changes take effect without restart
Frontend: /quick redirects with QC off; wholesale badges and filters disappear with wholesale off
Permissions: unchanged
Regression: retail flow entirely unaffected in all four flag combinations
Edge cases: both flags off; both on; flag flipped mid-session; flag flipped with live orders on both channels
Expected Outcome
Both flags are true kill switches with identical, documented semantics. Wholesale/B2B is production-releasable.

# PHASE 3 — Quick Commerce Flow Restoration
Purpose
Repair the three-way break that makes Quick Commerce non-functional. Every QC order currently dies silently after payment because no vendor can accept it and no rider can be assigned to it. This phase makes a QC order completable end to end.

Priority
Critical — the module has no value until this lands.

Business Impact
Quick Commerce transitions from "takes money and fails" to "fulfils orders." This is the single highest-value phase in the roadmap. It does not by itself make QC safe to operate — that is Phase 4 — but it makes it functional.

Issues Covered
ID	Sev	Audit Finding
FLOW-1	Critical	No vendor UI to accept/prepare/ready a QC order; screen calls an endpoint that rejects QC (Vendor/pages/orders/OrderDetail.jsx:64,83-89)
FLOW-2	Critical	No API or UI to set DeliveryBoy.experiences; assignment matches zero riders
FLOW-3	High	Vendor alerts are component-local and lost on refresh; never re-fetched (QuickCommerceOrderAlert.jsx:57)
FLOW-4	High	Acknowledgement has no path other than the transient toast
ROLE-1	Medium	/vendor/quick-commerce/dashboard returns 200 with channelEnabled:false instead of 403
Files Expected To Change
Backend

backend/src/modules/admin/controllers/delivery.controller.js — rider experience enrolment
backend/src/modules/admin/routes/admin.routes.js — new route + permission binding
backend/src/modules/admin/validators/delivery.validator.js — enrolment payload
backend/src/modules/delivery/controllers/notification.controller.js — unacknowledged urgent alert fetch
backend/src/modules/vendor/controllers/order.controller.js — channel guard on dashboard
Frontend

New: frontend/src/modules/Vendor/components/QuickCommerceOrderPanel.jsx
Modified: frontend/src/modules/Vendor/pages/orders/OrderDetail.jsx — branch by experience
Modified: frontend/src/modules/Vendor/components/QuickCommerceOrderAlert.jsx — hydrate from API on mount
Modified: frontend/src/modules/Admin/pages/delivery/* — rider QC toggle
New/Modified: vendor order service layer for /quick-status
Database: none — all fields exist.

Dependencies
Phase 0 — the failing lifecycle test defines completion
Phase 1 recommended first (avoids merge contention in admin routes)
Implementation Scope
Rider enrolment is the true root blocker and should be built first: an admin endpoint to set a rider's experiences array, permission-bound to existing delivery tokens, plus a toggle in the admin delivery management screen. Include a bulk action — onboarding a QC city means enabling dozens of riders, and one-at-a-time is a poor operator experience. Guard against removing quick_commerce from a rider holding an active QC order.

Vendor QC order operations should mirror the pattern already proven in Delivery/components/QuickCommerceActions.jsx — a stage-driven action panel with a single primary action per state. Reuse it as the template rather than designing fresh. The vendor order detail page must branch on order.experience and render this panel instead of the Marketplace status dropdown, which must be hidden entirely for QC orders. Accepting implicitly acknowledges, which the backend already handles.

Alert durability requires hydrating the alert component from persisted Notification records on mount, filtering for urgent and unacknowledged, rather than relying solely on the live socket event. The socket remains the low-latency path; the fetch is the correctness path.

Close the dashboard channel guard with a 403 while in this file.

Testing Checklist
UI: vendor sees stage-appropriate actions only; Marketplace dropdown absent on QC orders; rider toggle reflects and persists state
UI: vendor reloads mid-alert and the alert is still present
Frontend: every action maps to /quick-status; no call reaches the Marketplace status endpoint for a QC order
API: illegal transitions rejected 409; wrong-actor transitions rejected 403; enrolment validated
Backend: accepting stops the escalation clock; ready → rider can claim
Database: experiences persists; vendorAcknowledgedAt set once and not overwritten
Permissions: only permitted admins enrol riders; vendor cannot transition another vendor's order
Regression: Marketplace and Wholesale vendor order management entirely unchanged; existing rider Marketplace flow unchanged
Edge cases: two vendors on one order; rider disabled mid-delivery; vendor accepts an already-cancelled order; enrolment removed while order active
🚦 Gate: Phase 0 QC lifecycle test passes end to end
Expected Outcome
A Quick Commerce order can be placed, accepted, prepared, marked ready, assigned to a rider, tracked live, and completed with OTP — entirely through the UI. QC is functional but not yet operable.

# PHASE 4 — Quick Commerce Operations Centre
Purpose
Phase 3 makes orders complete on the happy path. This phase makes failures visible. Three alert types currently fire into an unlistened socket room, the escalation queue has no screen, and platform economics are unconfigurable. Operating a live QC business without these is running blind.

Priority
Critical — required for QC production release, not for QC to function.

Business Impact
Operators can see and act on stalled orders, SLA breaches, unresponsive stores and unreachable riders. Platform economics become tunable without a deploy. Quick Commerce becomes production-releasable after this phase.

Issues Covered
ID	Sev	Audit Finding
OPS-1	Critical	No admin UI for the escalation queue; endpoints exist unused
OPS-2	High	quick_commerce_sla_breach, quick_commerce_vendor_unresponsive, quick_commerce_rider_unreachable have no frontend listener
OPS-3	High	No QC settings screen; fees, radius, speed, ack timeout hardcoded
OPS-4	Medium	No rider reassignment workflow when a rider goes dark (detection exists, action does not)
OPS-5	Medium	escalateUnacknowledgedOrder lacks a recipientType filter
Files Expected To Change
New page: frontend/src/modules/Admin/pages/QuickCommerceOperations.jsx
New page: frontend/src/modules/Admin/pages/settings/QuickCommerceSettings.jsx
New hook: frontend/src/shared/hooks/useAdminAlerts.js
Modified: frontend/src/App.jsx, frontend/src/modules/Admin/config/adminMenu.json, AdminSidebar.jsx
Backend: backend/src/services/quickCommerceAlerts.service.js, backend/src/modules/admin/controllers/order.controller.js
New backend: rider reassignment endpoint
Validators: QC settings Joi schema (extends Phase 1 work)
Dependencies
Phase 1 — settings validation framework
Phase 3 — a functional flow to observe
Implementation Scope
Build a single operations console rather than scattered alert surfaces — one screen answering "what needs a human right now," with sections for unassigned/escalated orders, active SLA breaches, unresponsive stores and unreachable riders. Each row carries its action inline: retry assignment, manually assign, contact store, reassign rider. The two escalation endpoints already exist; the reassignment endpoint is new and should reuse the atomic claim and release helpers already built in riderAssignment.service.js.

Alerts should update the console live via a shared admin socket hook, with the underlying queue re-fetched on mount so a reloading operator does not lose state — the same durability principle applied to vendor alerts in Phase 3.

The QC settings screen is a form over the existing generic settings category endpoint, now validated. Cover delivery fee base and per-km, free-delivery threshold, average speed, platform radius ceiling, and vendor acknowledgement timeout. Surface the current effective values including code defaults, so an operator can see what is actually in force rather than an empty form.

Tighten the notification update filter while in the alerts service.

Testing Checklist
UI: escalated orders appear within one sweep interval; retry and manual assign work from the row; empty, loading and error states present
Frontend: socket alerts render live; console survives reload; no duplicate rows on reconnect
API: reassignment releases the previous rider and claims the new one atomically; settings writes validated and rejected when out of range
Backend: sweep emits are consumed; settings changes take effect on the next order without restart
Database: settings persist under quick_commerce; assignment state transitions recorded
Permissions: console gated on quickcommerce.orders.manage; settings on quickcommerce.settings.manage; a subadmin without them sees neither menu nor route
Regression: Phase 3 lifecycle test still green; Marketplace admin order management unchanged
Edge cases: reassigning an order whose original rider returns; settings changed mid-order (promise must stay locked at checkout); zero riders online; sweep running on two instances
Expected Outcome
Every failure mode the backend already detects is visible and actionable. Platform economics are tunable. Quick Commerce is production-releasable for pilot.

# PHASE 5 — Policy, Returns & Data Integrity
Purpose
Close the business-rule gaps that only surface in real operation: perishable goods accepting durable-goods return terms, out-of-stock picks with no defined resolution, and referential gaps the audit flagged in §17–18.

Priority
High — not a launch blocker for a controlled pilot; becomes one at scale.

Business Impact
The platform can answer "what happens when it goes wrong" for the most frequent real-world QC events. Reduces manual support load and disputed refunds.

Issues Covered
ID	Sev	Audit Finding
POL-1	High	QC returns not gated by experience; perishables accept marketplace return terms (order.controller.js:991)
POL-2	High	Item out of stock after placement — no substitution or partial-refund policy (§18)
POL-3	Medium	Customer unreachable at delivery — no hold/return policy
POL-4	Medium	Category deleted while QC products reference it — no cascade behaviour
POL-5	Low	Vendor reduces radius while items sit in a customer's cart
Files Expected To Change
Models: backend/src/models/Order.model.js (return-policy and fulfilment-outcome fields), backend/src/models/Category.model.js
Backend: backend/src/modules/user/controllers/order.controller.js, backend/src/modules/admin/controllers/catalog.controller.js, backend/src/modules/delivery/controllers/order.controller.js
Services: backend/src/services/quickCommerceOrderStatus.service.js
Frontend: customer order detail and returns UI; rider delivery-failure action
Constants: return windows and fulfilment outcomes per experience
Dependencies
Phase 3 — a working lifecycle to attach policy to
Implementation Scope
Introduce an experience-aware return policy: window, eligibility and reason set differ by experience, with perishable QC items defaulting to a short window or refund-only resolution. This is a schema addition plus a branch in the existing return-request validation — the model already carries experience.

Add a partial-fulfilment outcome to the order so a rider or store can mark a line unavailable, triggering an automatic partial refund calculation. Substitution — offering the customer an alternative — is the fuller answer and should be scoped explicitly; if deferred, record that decision rather than leaving the gap undocumented.

Define the delivery-failure path: rider marks unreachable, order enters a hold state with a defined disposition. Reuse the existing OTP infrastructure for the retry attempt.

Guard category deletion against referencing products, consistent with however the Marketplace tree already behaves — do not introduce a second convention.

Testing Checklist
Backend: QC return outside window rejected; marketplace return unaffected; partial refund arithmetic matches the charged total
API: fulfilment-outcome transitions validated; unreachable path reachable only from in-transit states
Database: new fields default to existing behaviour on historical orders
UI: customer sees the correct return eligibility per order type; rider has a delivery-failure action
Permissions: unchanged
Regression: existing marketplace and wholesale returns entirely unchanged; refund totals reconcile with commission records
Edge cases: partial refund on a coupon order; return on a partially fulfilled order; category deletion with active QC orders referencing it
Expected Outcome
Defined, enforced behaviour for the common failure modes of a rapid-delivery business.

# PHASE 6 — Analytics, Reporting & Experience-Aware UI
Purpose
Complete the reporting surface the blueprint specified but the implementation left partial, and finish the experience-awareness of shared customer and vendor screens.

Priority
Medium

Business Impact
Riders gain performance visibility, the platform can measure fleet quality, and vendors running both channels can distinguish a 15-minute order from a 5-day one — currently impossible in the order list, which the audit called operationally dangerous.

Issues Covered
ID	Sev	Audit Finding
ANA-1	Medium	No rider analytics — deliveries, avg time, earnings, acceptance rate (blueprint §21)
UX-1	High	Vendor order list has no experience filter or QC badge
UX-2	Medium	ProductDetail not experience-aware — no QC badge, pack size, max order qty
UX-3	Medium	Customer order history does not show QC stage; inconsistent with tracking page
UX-4	Medium	No confirmation on irreversible rider/vendor actions
API-1	Low	toPublicVendor omits the quickCommerce channel
Files Expected To Change
Backend: backend/src/modules/delivery/controllers/order.controller.js, backend/src/services/quickCommerceAnalytics.service.js (reuse existing pipelines, scope to rider), backend/src/routes/public.routes.js
Frontend: frontend/src/modules/Delivery/pages/Dashboard.jsx, Profile.jsx; frontend/src/modules/Vendor/pages/orders/AllOrders.jsx; frontend/src/modules/UserApp/pages/ProductDetail.jsx, Orders.jsx; frontend/src/modules/Delivery/components/QuickCommerceActions.jsx
Dependencies
Phase 3 — QC orders must exist and progress before analytics have data
Reuses quickCommerceAnalytics.service.js built in Phase 6 of the original programme
Implementation Scope
Rider analytics should reuse the existing aggregation service rather than adding new pipelines — the ETA, volume and responsiveness builders already exist and need only a rider-scoped match. This is the cheapest item in the roadmap relative to its blueprint prominence.

Group all experience-aware UI work into one workstream: the vendor order list gains an experience filter and a QC badge; product detail surfaces QC constraints (pack size, max order quantity, perishable handling) so a customer is not surprised at checkout; customer order history shows QC stage consistently with the tracking page. These share a badge component and a formatting utility and should not be built three times.

Add confirmation dialogs to irreversible transitions.

Testing Checklist
UI: rider dashboard renders analytics with empty and populated states; vendor filter narrows correctly; QC badges appear only on QC records
Frontend: shared badge component used everywhere; no duplicate implementations
API: rider analytics scoped to the requesting rider only — no cross-rider leakage
Backend: aggregation returns zero-safe values on a quiet day
Permissions: a rider cannot read another rider's analytics
Regression: marketplace order lists and product pages unchanged
Edge cases: rider with zero deliveries; vendor with only marketplace orders; product QC-enabled but vendor channel off
Expected Outcome
Complete reporting across all three audiences the blueprint named, and consistent experience-awareness across shared screens.

# PHASE 7 — Performance & Scale Readiness
Purpose
Address the performance findings before volume makes them visible. None are urgent at pilot scale; all become material at growth.

Priority
Medium

Business Impact
Checkout latency reduced and the stock-race window narrowed. Admin analytics remain responsive as order volume grows. The escalation sweep stops multiplying alerts across instances.

Issues Covered
ID	Sev	Audit Finding
PERF-1	Medium	N+1 in placeOrder — Product.findById and Vendor.findById per item, sequential; same vendor refetched per line
PERF-2	Medium	Admin analytics runs 15 parallel aggregations on the hot Order collection per load
PERF-3	Medium	Vendor dashboard polls every 30s regardless of tab visibility
PERF-4	Medium	Sweep is per-process with no leader election → N× duplicate alerts
DB-1	Medium	Missing index on Notification alert lookup
DB-2	Medium	Missing index on DeliveryBoy.lastLocationAt
Files Expected To Change
Backend: backend/src/modules/user/controllers/order.controller.js, backend/src/services/quickCommerceAlerts.service.js, backend/src/modules/admin/controllers/analytics.controller.js
Models: backend/src/models/Notification.model.js, backend/src/models/DeliveryBoy.model.js
Frontend: frontend/src/modules/Vendor/pages/QuickCommerceDashboard.jsx
New migration: index build script
Dependencies
Phase 3 and 4 — do not optimise code paths still being reshaped
Implementation Scope
Replace the per-item lookups in placeOrder with two batched $in queries before the loop, preserving the existing per-item validation logic exactly. This is a mechanical change with meaningful benefit: it shortens the window between validation and the transaction, which is where oversell risk lives.

Introduce a coarse cache or a consolidated aggregation for the admin analytics endpoint. Do not build rollups yet — the blueprint deliberately deferred them and the data does not yet justify the invalidation complexity.

Add a lease or advisory lock so only one instance runs each sweep pass. Pause dashboard polling on document.hidden.

Build the two missing indexes off-peak in the background.

Testing Checklist
Backend: checkout produces two lookup queries regardless of cart size; all existing validation still enforced per item
Backend: two instances running the sweep produce one alert per event
Database: indexes present and used — verify with explain plans on the sweep and alert queries
API: analytics response time measured before and after under seeded volume
Frontend: polling stops on hidden tab and resumes on focus
Regression: full harness suite; Phase 0 lifecycle tests green; MOQ, stock and pricing behaviour byte-identical
Edge cases: cart with duplicate products; cart with 100 items; instance killed mid-sweep
Expected Outcome
The system holds its behaviour under load with materially reduced database pressure on the hottest paths.

# PHASE 8 — Technical Debt & Polish
Purpose
Clear the accumulated low-severity items so they do not compound. Explicitly the lowest priority — this phase should be interruptible and deferrable.

Priority
Low

Business Impact
Reduced drift risk and improved page-load performance. No functional change.

Issues Covered
ID	Sev	Audit Finding
DEBT-1	Low	Variant price resolution exists in three implementations
DEBT-2	Low	quickCommerce.assignment.status defaults on every Marketplace order
DEBT-3	Low	browserTimezone computed at module scope
DEBT-4	Low	Frontend bundle 3.3 MB single chunk, no code splitting
DEBT-5	Low	useOrderTracking re-fetches full snapshot on rider_assigned
Files Expected To Change
backend/src/modules/admin/controllers/catalog.controller.js, backend/src/services/variantPricing.service.js
backend/src/models/Order.model.js
frontend/vite.config.js, frontend/src/App.jsx (route-level lazy loading)
frontend/src/shared/hooks/useOrderTracking.js, frontend/src/modules/Admin/pages/QuickCommerceAnalytics.jsx
Dependencies
All prior phases stable.

Implementation Scope
Consolidate the third variant-price copy into the shared service, covered by a differential test proving identical output before removal. Route-level code splitting on the admin and vendor bundles, which are the largest and least frequently loaded. Minor hook and default cleanups.

Testing Checklist
Backend: differential test proves variant pricing identical pre/post consolidation across all key formats
Frontend: all routes load after splitting; no chunk-loading failures on slow connections
Database: Marketplace orders no longer carry QC assignment defaults; historical orders unaffected
Regression: full harness suite plus Phase 0 integration suites
Edge cases: variant products across admin, vendor and checkout paths
Expected Outcome
Reduced duplication and a materially smaller initial bundle.

# MASTER ROADMAP
Phase	Priority	Complexity	Risk	Est. Files	Depends On	Status
0 — Integration Test Harness	Critical	M (2–3 d)	Low	~8 new	—	Not started
1 — Settings Security Hotfix	Critical	S (1–2 d)	Medium	~6	—	Not started
2 — Feature Flag Contract	High	S (2 d)	Medium	~8	0 (advisory)	Not started
3 — QC Flow Restoration	Critical	L (5–7 d)	Medium	~14	0, 1	Not started
4 — QC Operations Centre	Critical	M–L (4–6 d)	Low	~12	1, 3	Not started
5 — Policy, Returns & Integrity	High	M (4–5 d)	Medium	~12	3	Not started
6 — Analytics & Experience UI	Medium	M (4–5 d)	Low	~12	3	Not started
7 — Performance & Scale	Medium	M (3–4 d)	Medium	~9	3, 4	Not started
8 — Technical Debt & Polish	Low	S (2–3 d)	Low	~8	All	Not started
Total: ~27–35 engineer-days sequential. With three engineers and the parallelisation below, ~4 calendar weeks to QC GA.

Parallelisation plan

Week 1: Phase 0 ∥ Phase 1 ∥ Phase 2 → Wholesale GA at end of week 1
Week 2–3: Phase 3 (two engineers: rider enrolment + vendor UI) ∥ Phase 6 scaffolding
Week 3–4: Phase 4 ∥ Phase 5 → QC Pilot GA
Week 5+: Phases 6, 7, 8 post-launch
Risk annotations. Phase 1 is Medium risk despite being small — it changes an endpoint the storefront depends on, and an over-tight allowlist breaks anonymous browsing. Phase 5 is Medium because it touches refund arithmetic. Phase 7 is Medium because it rewrites the checkout query path, the most sensitive code in the system.

## 1. Critical Release Blockers
ID	Issue	Blocks	Cleared By
SEC-1	Unauthenticated read of any settings category	Everything	Phase 1
SEC-2	Settings routes bypass permission system	Everything	Phase 1
FLOW-2	No rider can be QC-enabled	Quick Commerce	Phase 3
FLOW-1	No vendor UI to accept a QC order	Quick Commerce	Phase 3
OPS-1	No admin escalation queue UI	Quick Commerce	Phase 4
OPS-2	Three alert types have no listener	Quick Commerce	Phase 4
TEST-1	No integration coverage — sign-off is unreliable	Everything	Phase 0
SEC-1 and SEC-2 block all releases including Wholesale, because they are platform-wide and exploitable today. If gateway credentials are found under the payment key during Phase 1, treat it as a security incident with key rotation, not a code fix.

## 2. Can Release After Which Phase?
Milestone	After	Conditions
Security patch to production	Phase 1	Ship standalone. Do not bundle with features.
Wholesale / B2B GA	Phase 2	Requires Phases 0+1+2. Flag-gated rollout.
Quick Commerce internal staging	Phase 3	Functional but not observable — staff-only.
Quick Commerce pilot GA	Phase 4	Limited geography, small vendor cohort, operator on standby.
Quick Commerce scale rollout	Phase 5 + 7	Policy gaps closed and performance validated under load.
Full enterprise readiness	Phase 8	All findings closed.
Do not ship QC after Phase 3. A working flow with invisible failures is more dangerous than a visibly broken one, because it accumulates silent customer harm.

## 3. Remaining Improvements (Non-Blocking)
Rider analytics · vendor order filters and badges · ProductDetail QC awareness · customer order-history stage consistency · confirmation dialogs · toPublicVendor channel exposure · dashboard polling on visibility · admin analytics caching · code splitting · useOrderTracking patch-vs-refetch.

## 4. Technical Debt Register
Item	Origin	Recommended Horizon
Variant pricing in three implementations	Pre-existing, partially consolidated Phase 4	Phase 8
No job runner — sweep on setInterval	Accepted trade-off, Phase 5 of original programme	Post-launch; required before multi-region
Live analytics aggregation, no rollups	Deliberate per blueprint	When admin dashboard latency becomes visible
Nested-path defaults polluting Marketplace orders	Mongoose behaviour	Phase 8
No code splitting	Pre-existing	Phase 8
Server-side cart deferred	Blueprint V2	Product decision
Coupon cap behaviour change	Phase 5 fix — alters existing money behaviour	Flag to release approver
## 5. Production Readiness Milestones
After Phase	Wholesale	Quick Commerce	Platform Security	Overall
Today	7.0	3.0	3.0	4.5
Phase 0	7.0	3.0	3.0	4.5 (confidence ↑, score flat)
Phase 1	7.5	3.5	8.0	6.0
Phase 2	8.5 ✅ GA	4.0	8.5	6.5
Phase 3	8.5	6.5	8.5	7.5
Phase 4	8.5	8.0 ✅ Pilot GA	8.5	8.3
Phase 5	8.5	8.5	8.5	8.5
Phase 6	9.0	9.0	8.5	8.8
Phase 7	9.0	9.0	9.0	9.0
Phase 8	9.2	9.2	9.0	9.2
Phase 0 moves no score, which is intentional and worth stating plainly to whoever approves this plan: it buys trustworthy scores rather than higher ones. Given that the previous six sign-offs were confidently wrong, that is the most valuable two days in this roadmap.

Traceability — Audit Coverage
Every audit finding maps to exactly one phase. No finding is unassigned.

Audit Section	Findings	Phases
Bugs #1–3 (critical flow)	FLOW-1, FLOW-2, OPS-1	3, 4
Bug #4–5 (security)	SEC-1, SEC-2	1
Bug #6–7 (alerts)	FLOW-3, OPS-2	3, 4
Bug #8 (flags)	FLAG-1	2
Bug #9–10	POL-1, PERF-1	5, 7
§4 UI/UX (11 items)	UX-1…4, OPS-1/3, FLOW-1/3	3, 4, 6
§5 Frontend (7 items)	FLOW-1/3, UX-2, PERF-3, DEBT-3/5	3, 6, 7, 8
§6 Backend (7 items)	FLOW-2, SEC-3, POL-1, PERF-1, ANA-1, OPS-5, API-1	1, 3, 4, 5, 6, 7
§7 Database (4 items)	DB-1, DB-2, DEBT-2, POL-4	5, 7, 8
§9 Roles (2 items)	SEC-2, ROLE-1	1, 3
§10 Security (4 items)	SEC-1…4, FLAG-2	1, 2
§11 Performance (5 items)	PERF-1…4, DB-1/2, DEBT-4	7, 8
§12–15 Missing APIs/UI/validation	FLOW-2, ANA-1, OPS-3, SEC-3, POL-1	1, 3, 4, 5, 6
§18 Edge cases	POL-1…5, OPS-4	4, 5
§20 Test coverage	TEST-1, TEST-2, PROC-1	0
Deferred by explicit product decision (documented, not lost): QC substitution UX depth, rider batching, surge pricing, delivery slots, proof-of-delivery photo; B2B business accounts, GST verification, RFQ, credit terms, purchase orders, approval hierarchies, contract pricing. These were scoped out of V1 in the approved blueprints and belong in a V2 product roadmap rather than this remediation plan — but they are the gap between DwellMart and Blinkit or Amazon Business, and should be planned as such rather than treated as polish.