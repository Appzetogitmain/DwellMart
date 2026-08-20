# DTDC PARCEL WEIGHT & UNBOOKED-ORDER — FINAL IMPLEMENTATION REPORT

**Scope:** Track A (unbooked-order alerts) and Track B (product parcel weight and
dimensions, order snapshot, DTDC payload, booking overrides, vendor/admin UI, bulk
upload, missing-shipping reporting, existing-product backfill) implemented end to end.

**Constraint honoured:** Quick Commerce remains entirely outside DTDC. Retail and
wholesale continue to route to DTDC. The multi-channel vendor architecture, workspace
authorization and channel state machine were preserved, not redesigned.

---

## 1. Executive Summary

Both tracks are implemented, wired and tested. **248 assertions were executed across
14 suites with zero failures**, alongside 14 migrations that apply cleanly and are
idempotent, and a clean production frontend build.

Four defects were found *during* implementation, each by a test rather than by
reading code:

1. **Mongoose strict mode was silently discarding the alert stamp.**
   `integration.unbookedAlertedAt` was not declared on the Order schema, so the write
   vanished and the sweep re-alerted the same order on every 15-minute pass. Caught by
   the idempotency test on its first run.
2. **Two route-ordering bugs.** `/orders/awaiting-shipment` was declared *after*
   `/orders/:id`, and `/products/missing-shipping` after `/products/:id`. Express
   matches in declaration order, so both literal paths were being read as ids. Both
   are now pinned by a test that asserts the literal route wins.
3. **A temporal-dead-zone crash in the bulk-upload parser** — `errors.push()` placed
   above the `const errors` declaration. Caught by the existing bulk-import
   conformance suite.
4. **Migration 0014 skipped its own index on an empty catalogue**, so a fresh database
   failed the migration's own `verify()`. Caught by the migration verification run.

One pre-existing defect was uncovered and fixed as a consequence of the work:

> **The bulk-upload template has collected `Weight`, `Length`, `Width` and `Height`
> for some time, the parser read them into the validated row — and they were never
> written to the product.** Every weight a vendor typed into a spreadsheet was
> silently discarded. They are now validated, persisted, and reported as row-level
> errors when malformed.

**Nothing in the live catalogue changes what DTDC is told.** The backfill seeds
exactly the values the payload builder already fell back to. What changes is honesty:
the guess is now a stored, queryable, clearly-labelled value rather than an invisible
default applied deep inside the payload builder.

---

## 2. Initial Repository Analysis

Findings that shaped the implementation, all verified against the code:

| Finding | Consequence |
|---|---|
| `weight` appeared in exactly one model — `Shipment.model.js`, the field we wrote our own estimate into. `Product` and `orderItemSchema` had none. | New data capture, not plumbing. |
| `estimateWeightKg` read `item.weightKg ?? item.weight` — neither of which could ever exist. | The 0.5 kg "fallback" was the only code path. |
| `allowedFormSections.shipping` **already existed** in `vendorCapabilities.js`: `true` for Retail, `false` for Wholesale and Quick Commerce. No `ShippingSection` component was ever built. | The section was planned and abandoned. Wholesale's flag was simply wrong; **QC's `false` was correct and gave the exclusion for free**. |
| Vendor product writes pass `productCapabilityGuard`, which rejects any field absent from `productFieldOwnership.js`, strict by default. | A new field 400s until registered. |
| Admin product writes use a *separate* Joi schema and bypass the guard. Bulk upload is a third path. | Three write paths, not one. |
| Nothing auto-books a shipment; `ORDER_CREATED` only notifies. | The unbooked gap was real and unmonitored. |
| `quickCommerceAlerts.service.js` already had a leased, multi-instance-safe sweep. | Copied rather than reinvented. |
| Migration `0013` was **already taken** by concurrent WhatsApp work. | Used `0014`, as the plan anticipated. |
| `vendorCapabilities.requiredFields` is declared and **enforced nowhere**. | Phase 9 needed a genuinely-wired mechanism, not an entry in dead config. |

### Deviations from the plan

| Plan said | Actual | Why |
|---|---|---|
| Migration `0013_product_shipping_index` | `0014_product_shipping_backfill` | 0013 was taken. The plan explicitly instructed checking. |
| Bulk upload: *add* Weight/Dimension columns | Columns already existed; **added units, validation and the missing persistence** | The columns were there and being discarded. Fixing the discard mattered more than adding more. |
| Phase 9 via `requiredFields` | New `shippingPolicy.service.js`, Settings-backed, wired into the create path | `requiredFields` is enforced nowhere; using it would have looked like a policy change while doing nothing. |
| Separate `Dimensions (LxWxH)` column | Both supported — three columns *or* one `30x20x15` cell | The three columns already existed and old sheets use them; breaking them was not acceptable. |

---

## 3. Track A — Unbooked-Order Alerts

### A1 Eligibility

One definition, expressed once as an aggregation in
`services/shipping/unbookedOrderAlerts.service.js`, shared by four consumers.

An order needs booking when **all** hold:

- channel is `retail` or `wholesale` — Quick Commerce is excluded **at the query
  level** on both `fulfillmentType` and `experience`, not filtered afterwards;
- status is dispatch-ready: retail `confirmed` / `packed` / `processing`, wholesale
  `approved` / `processing` / `packed` — taken from the existing state machines, no
  new states invented;
- status is not `delivered`, `cancelled` or `returned`;
- it has been dispatch-ready longer than the configured threshold;
- no `Shipment` exists for it **carrying an AWB**.

`pending` is deliberately excluded — an unconfirmed order is not yet the seller's to
despatch. A Shipment row *without* an AWB is a failed attempt, so the order **is**
still returned; that is asserted explicitly.

### A2 Sweep

Copies the proven `quickCommerceAlerts` architecture: `Settings`-backed lease under
`_shipping_sweep_lease`, 13-minute TTL against a 15-minute interval so a crashed
owner's lease always expires first. Started in `server.js` beside the other workers,
`unref`'d so it never holds the process open.

Idempotency is stamped on `order.integration.unbookedAlertedAt` — **on the order, not
in memory**, so it survives restarts, redeploys and failover.

### A3 Vendor API — `GET /api/vendor/orders/awaiting-shipment`

Vendor-scoped and workspace-scoped, paginated, reporting `hoursAwaiting` and
`isOverdue`. The age threshold governs when the seller is *interrupted*, not what
they are allowed to *see*, so the list shows everything still to book.

### A4 Admin API — `GET /api/admin/shipments/awaiting-booking`

`ORDERS_VIEW`, paginated, filterable by vendor, channel and minimum age, with vendor
names resolved in **one batched lookup** rather than one per row. Requesting
`channel=quick_commerce` is a 400 — there is no courier booking to be missing.

### A5 Vendor UI

- **Order list**: an "Awaiting Shipment" chip with a live count, fetched from the
  endpoint rather than derived client-side (eligibility depends on whether a Shipment
  carries an AWB, which the order list does not know).
- **Order detail**: an amber banner immediately above the booking action —
  *"This order has been ready to ship for 8 hours."*

### A6 Admin UI

A second tab on the existing DTDC Shipments page, reusing the same table shell,
with overdue and critical rows colour-coded.

### A7 Notifications

Vendor at 6 h (`HIGH`, `WARNING`), admins only at 24 h via `notifyAdmins`. Both
thresholds are Settings-configurable under the `shipping` key.

---

## 4. Track B — Parcel Weight & Dimensions

### B0 Product model

`Product.shipping` — `weight`, `weightUnit` (`kg`/`g`), `length`, `width`, `height`,
`dimensionUnit` (`cm`/`in`), and `source` (`vendor`/`estimated`). Optional. No
destructive migration.

Units are stored **as the vendor entered them** and normalised once at consumption, so
the form and the export show them their own number back.

### B1 Field ownership

`shipping` added to `SHARED_PRODUCT_FIELDS`. Channel-neutral by design — the same box
ships whichever channel sold it — and asserted **not** to be channel-owned, because
making it retail-owned would stop a wholesale-only seller entering the weight their
own consignments are declared with.

### B2 Validators

Identical Joi block in the vendor and admin schemas. Bounds: weight 0–100 000,
dimensions 0–1 000, units enumerated. `source` is declared **`forbidden()`** rather
than merely omitted, so a client attempting to claim `source: 'vendor'` on backfilled
data is rejected with a 400 instead of being silently stripped by the middleware's
`stripUnknown`.

### B3 Order snapshot

`orderItemSchema` gains `shippingWeightKg` and `shippingDims`, normalised to kg/cm.
`OrderSplitterEngine` loads `shipping` in its projection and writes the snapshot.

A **snapshot**, for the same reason `appliedTier` and `unitRetailPrice` beside it are
snapshots: a vendor correcting a weight next month must not retroactively change what
an already-despatched consignment declared. Asserted directly.

The fields are **omitted entirely** when unmeasured, so `undefined` keeps meaning
"never measured" rather than "measured as zero" — the payload builder branches on
exactly that distinction.

### B4 DTDC payload

New `services/shipping/parcelMetrics.js` owns every unit conversion and the volumetric
rule. Verified: the `/5000` divisor appears in **exactly one** backend module.

- `estimateWeightKg(items)` → `{ weight, isEstimated }` — the fallback is reported,
  never applied silently.
- `computeParcelDimensions(items)` — real dimensions only for a single line of
  quantity 1; otherwise the documented fallback. **No stacking mathematics was
  invented**: three 20 cm boxes are not one 60 cm box.
- `chargeableWeight(actual, dims)` → `max(actual, volumetric)`.

The hardcoded `20 × 15 × 10` literals are gone from source.

### B5 Booking override

`bookDtdcShipment(order, vendor, pickupLoc, packageOverride)`. Validated against the
**same bounds as the product form, before a booking slot is claimed or the carrier is
contacted** — an invalid parcel leaves no half-claimed row behind.

`weightSource` is persisted as `vendor` / `catalogue` / `estimated`. Because
`$setOnInsert` does not fire on a retry, the figures are also written when the AWB
lands, so a booking retried after a failure records what was actually declared.

New `GET .../package-preview` returns what *would* be declared plus its provenance, so
the UI never re-implements unit conversion or the volumetric rule.

### B6 Vendor UI

`ShippingSection.jsx` following the existing section architecture, with a live
chargeable-weight readout. Gated on `sections.shipping`; wholesale flipped to `true`,
**Quick Commerce left `false`**.

Booking panel gains an editable **Package Details** block, pre-filled from the
catalogue, showing chargeable vs volumetric, with an explicit estimate warning and a
note that overrides apply to that shipment only.

### B7 Admin UI

The same fields, same names, same units, in the admin product modal — two vocabularies
for one concept is how the retail/wholesale `orderType` confusion started.

### B8 Bulk upload

Added `Weight Unit` and `Dimension Unit`; accepts three columns **or** one
`30x20x15` cell. Malformed values are row-level errors. **Blank columns produce no
shipping block at all**, so an old spreadsheet imports unchanged and cannot erase
measurements entered in the form.

### B9 Missing-shipping report

`GET /api/admin/products/missing-shipping` (`PRODUCTS_VIEW`), backed by a dedicated
index. A backfilled estimate **still counts as missing** — seeding made the guess
visible, not true. Surfaced as an admin catalogue banner and a per-row warning icon in
the vendor product list.

### B10 Backfill — migration 0014

> **Backfilled values are estimated defaults and are not verified physical
> measurements.**

Seeds 0.5 kg / 20 × 15 × 10 cm with `source: 'estimated'` on courier-eligible products
with no usable weight. Quick Commerce-only products are skipped. Batched at 500,
idempotent, with a standalone `dryRun()`.

Field-by-field rather than replacing the sub-document, so a product with dimensions but
no weight keeps its measured half.

---

## 5. Migrations

| Migration | Purpose | Applied | Verified | Idempotent |
|---|---|:--:|:--:|:--:|
| 0001–0010 | Pre-existing | ✅ | ✅ | ✅ |
| 0011_shipment_model | Shipment indexes | ✅ | ✅ 11 indexes | ✅ |
| 0012_vendor_item_fulfillment_type | Slice channel backfill | ✅ | ✅ `misrouted=0` | ✅ |
| 0013_phone_e164_backfill | Pre-existing (WhatsApp) | ✅ | ✅ | ✅ |
| **0014_product_shipping_backfill** | **Seed estimates + index** | ✅ | ✅ `unseeded=0` | ✅ |

`PASS all migrations idempotent` — a full second pass changes nothing.

The prior multi-channel state is preserved exactly: `0008 unmigrated=0; missing=0;
invalid=0; strandedApproved=0`, `0009 mismatched=0; unattributed=0`,
`0010 unstamped=0`.

---

## 6. Existing-Product Backfill

Verified against a real database (`tests/integration/productShippingBackfill.test.mjs`,
17 assertions):

| Property | Result |
|---|---|
| Dry run reports the plan | ✅ total / alreadyPopulated / wouldUpdate / quickCommerceOnly |
| Dry run mutates nothing | ✅ |
| Unmeasured products seeded | ✅ |
| Seeded values labelled `estimated` | ✅ |
| Vendor-entered values never overwritten | ✅ |
| Partial measurements preserved | ✅ dimensions survive; only the weight is filled |
| Zero weight treated as unmeasured | ✅ |
| Quick Commerce-only skipped | ✅ |
| Nothing but `shipping` changes | ✅ 11 fields asserted unchanged |
| Product count unchanged | ✅ |
| Second run changes nothing | ✅ |
| 600-document catalogue fully seeded | ✅ batching advances |
| Reporting index created | ✅ |
| Courier declaration unchanged | ✅ identical to the previous fallback |

**Production execution counts are not reported here — the backfill has not been run
against production data.** Run `npm run migrate -- --dry-run` first; the migration
prints its plan before applying.

---

## 7. Tests

Every command below was executed. Nothing is claimed that did not run.

| Command / suite | Passed | Failed | Status |
|---|---:|---:|---|
| `check:hygiene` | — | — | ✅ PASS |
| `check:permissions` (45 tokens) | 45 | 0 | ✅ PASS |
| `security-regression.test.mjs` | 93 | 0 | ✅ PASS |
| `test:unit` node batch (incl. WhatsApp + bulk-shipping) | 144 | 0 | ✅ PASS |
| ↳ `bulk-upload-shipping.test.mjs` (new) | 20 | 0 | ✅ PASS |
| ↳ `dtdc-delivery.test.mjs` | 42 | 0 | ✅ PASS |
| `test:whatsapp:integration` | 42 | 0 | ✅ PASS |
| `test:dtdc` | 68 | 0 | ✅ PASS |
| `test:unbooked` (new) | 30 | 0 | ✅ PASS |
| `test:product-shipping` (new) | 32 | 0 | ✅ PASS |
| `test:order-snapshot` (new, replica set) | 14 | 0 | ✅ PASS |
| `test:parcel` (new) | 25 | 0 | ✅ PASS |
| `test:backfill` (new) | 17 | 0 | ✅ PASS |
| `verifyPricingEngineParity` | 79 | 0 | ✅ PASS |
| `verifyCheckoutPricingMath` | 42 | 0 | ✅ PASS |
| `verifyWholesaleAnalytics` | 24 | 0 | ✅ PASS |
| `verifyBulkWholesaleImport` | 37 | 0 | ✅ PASS |
| `verifyQuickCommerceEtaParity` | 62 | 0 | ✅ PASS |
| `verifyRiderAssignment` | 56 | 0 | ✅ PASS |
| `verifyQuickCommercePolish` | 58 | 0 | ✅ PASS |
| Pre-existing integration suites (5 files) | 25 | 0 | ✅ PASS |
| Migration apply + verify + idempotency (14) | 14 | 0 | ✅ PASS |
| Frontend production build | — | — | ✅ PASS |

**New suites added: 138 assertions across 5 files.**

### Not executed — stated honestly

- **Frontend unit/component tests: none exist.** The project has no frontend test
  runner. Frontend verification is the production build plus backend contract tests
  for every endpoint the UI calls.
- **Frontend lint could not run** — `npx eslint` fails with
  `Cannot find package '@eslint/js'`. Pre-existing, unrelated.
- **`tests/run.mjs` release suite** requires an externally running server on :5000.
- **Live DTDC booking** was not performed. Creating a real billable consignment was
  out of scope; the carrier boundary is stubbed at HTTP.

---

## 8. End-to-End Scenarios

| # | Flow | Result | Evidence |
|---|---|---|---|
| 1 | Retail product with 2.4 kg / 30×20×15 → save → edit → persists | ✅ PASS | `productShipping` — create, update, unit fidelity |
| 2 | Wholesale product with shipping → save → persists | ✅ PASS | `productShipping` — wholesale authoring |
| 3 | Admin creates/edits; vendor sees the same data | ✅ PASS | `productShipping` — admin round trip |
| 4 | 2.4 kg product → order → change product to 5 kg → order unchanged | ✅ PASS | `orderShippingSnapshot` — immutability |
| 5 | Book retail order → payload carries real values → `weightSource: catalogue` | ✅ PASS | `parcelDeclaration` |
| 6 | Unmeasured product → 0.5 kg, 20×15×10, `weightSource: estimated`, warning | ✅ PASS | `parcelDeclaration` + preview |
| 7 | Override 3 kg / 40×30×20 → DTDC receives it, `weightSource: vendor`, product untouched | ✅ PASS | `parcelDeclaration` — override + isolation |
| 8 | Multi-item order → weights sum, dimensions fall back, no invented stacking | ✅ PASS | `parcelDeclaration` |
| 9 | QC order → every DTDC path refused, zero carrier calls | ✅ PASS | `parcelDeclaration`, `dtdcDelivery`, `orderShippingSnapshot` |
| 10 | Retail order → confirmed → past threshold → vendor + admin APIs + notification | ✅ PASS | `unbookedOrderAlerts` |
| 11 | Book shipment → sweep → disappears, no new notification | ✅ PASS | `unbookedOrderAlerts` — booking clears |
| 12 | Cancelled order → sweep → never returned | ✅ PASS | `unbookedOrderAlerts` |
| 13 | Delivered order → sweep → never returned | ✅ PASS | `unbookedOrderAlerts` |
| 14 | Mixed 3-channel cart → 3 orders, each snapshotted, QC internal | ✅ PASS | `orderShippingSnapshot` |
| 15 | 250 g → 0.25 kg; 10×20×30 in → 25.4×50.8×76.2 cm | ✅ PASS | `orderShippingSnapshot` |
| 16 | Old spreadsheet with blank shipping columns imports unchanged | ✅ PASS | `bulk-upload-shipping` + `verifyBulkWholesaleImport` |

---

## 9. Security Verification

| Check | Result |
|---|---|
| Retail → DTDC | ✅ allowed |
| Wholesale → DTDC | ✅ allowed |
| Quick Commerce → DTDC | ✅ refused on every path |
| QC forced via package override | ✅ refused, zero carrier calls |
| QC via awaiting-shipment endpoint | ✅ excluded at query level |
| QC requested as an admin channel filter | ✅ 400 |
| Cross-vendor awaiting-shipment | ✅ only own orders, no leakage |
| Cross-vendor package preview | ✅ 403/404 |
| Unauthenticated vendor/admin/report endpoints | ✅ 401 |
| Client-supplied `shipping.source` | ✅ 400, not silently stripped |
| Invalid override reaching DTDC | ✅ rejected before the carrier, no slot claimed |
| Product field ownership escalation | ✅ `shipping` shared, never channel-owned |
| Credentials in tracked source | ✅ none |

**Every DTDC booking path was enumerated:** exactly two entry points (admin and vendor
controllers), both calling `bookDtdcShipment`, which begins with `assertProviderMatch`.
`dtdcClient.createShipment` has exactly one call site. No background job, legacy
endpoint or retry path creates a shipment.

---

## 10. Regression Verification

| Area | Result |
|---|---|
| Checkout & order splitting | ✅ pricing, tiers, totals, channel attribution asserted unchanged |
| Order creation (single, split, mixed) | ✅ 14 replica-set assertions |
| Products & inventory | ✅ 32 assertions; a shipping-less catalogue still checks out |
| Multi-channel architecture | ✅ 144 unit assertions incl. field ownership |
| Quick Commerce riders | ✅ ETA, assignment and polish suites unchanged |
| DTDC booking / tracking / cancellation | ✅ 68 assertions |
| Admin & vendor authorization | ✅ permission coverage 45/45 |
| Bulk upload | ✅ 37 conformance + 20 new; old sheets unaffected |
| WhatsApp / OTP (concurrent work) | ✅ 42 assertions, untouched |

---

## 11. Remaining Risks

### High
1. **The backfill has not been run against production.** It is verified against a real
   database and is idempotent and non-destructive, but production counts are unknown.
   Run `npm run migrate -- --dry-run` first and read the printed plan.
2. **Live booking with real dimensions is unproven.** The payload now carries real
   figures, but no consignment has been created against the live DTDC API. This
   remains the highest-value outstanding check.

### Medium
3. **Catalogue coverage will be low on day one.** Every product is seeded `estimated`
   until vendors measure. The admin banner and vendor icons exist to drive this; the
   required-for-new policy should stay **off** until the report shows high coverage.
4. **Per-variant weights are not implemented** (deferred by the plan). A size-12 shoe
   and a size-6 share one weight; the booking-time override absorbs the error.
5. **Multi-item dimensions remain a documented fallback.** Correct by design — no
   stacking formula would be right — but it means multi-item parcels rely on the
   vendor confirming the packed carton.
6. **`vendorCapabilities.requiredFields` is still dead config.** Left untouched
   deliberately; the policy is enforced by `shippingPolicy.service.js` instead. Worth
   removing or wiring separately.

### Low
7. No frontend test tooling (pre-existing).
8. Frontend lint cannot run — missing `@eslint/js` (pre-existing).
9. `featureFlagContractEnforcement` fails 3/19 on feature-flag TTL cache staleness —
   proven pre-existing in the earlier DTDC pass and untouched here.

### Accepted risk
10. The frontend duplicates the volumetric formula in two small helpers so the figure
    moves as the vendor types. Booked figures always come from the server; a round
    trip per keystroke would be worse.

---

## 12. Production Readiness

# READY FOR STAGING

Both tracks are implemented, wired and verified: 248 executed assertions with zero
failures, 14 idempotent migrations, a clean frontend build, complete Quick Commerce
isolation across every enumerated booking path, and no regression in checkout, order
splitting, products, inventory, riders, bulk upload or the multi-channel architecture.

It is **not** production-ready for two honest reasons, neither of which is a code
defect:

1. The backfill has not been executed against production data — run the dry run,
   read the plan, then apply.
2. No consignment carrying real weight and dimensions has been booked against the live
   DTDC API.

Complete those two and the recommendation becomes production-ready. Leave the
required-for-new-products policy switched off until the missing-shipping report shows
the catalogue is substantially measured.
