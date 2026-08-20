# DWELLMART DTDC END-TO-END VERIFICATION & REMEDIATION REPORT

**Scope:** independent verification and remediation of the DTDC delivery integration
implemented by a prior agent, across UI → frontend → API → backend → database →
DTDC → shipment → AWB → tracking → order status → Admin/Vendor/Customer UI.

**Constraint honoured:** the Multi-Channel Vendor Architecture (migrations 0008–0010,
channel state machine, workspace authorization) was preserved, not redesigned.

---

## Executive Summary

The integration as delivered **could not have worked in production**. This is not a
judgement from reading the code — it is the result of running it. With a real
MongoDB and a stubbed carrier, the very first end-to-end booking attempt produced:

```
BOOK THREW -> ValidationError | Order validation failed:
  integration.partnerStatus: `booked` is not a valid enum value for path `partnerStatus`.
SHIPMENT AFTER BOOK -> { awb: 'D1000000001', status: 'failed' }
ORDER AFTER BOOK   -> { trackingNumber: undefined, status: 'pending', logs: 0 }
DTDC CALLS         -> [ 'booking' ]
```

A consignment was created at the carrier, the AWB was thrown away, the shipment was
marked `failed`, the order learned nothing — and every retry returned the same dead
record. Alongside that, the consignment payload itself carried an **empty origin
pincode, an empty destination pincode, a declared value of ₹0 and a COD amount of ₹0
on a ₹1,499 cash-on-delivery order**, because every address and money field was read
from a property name that does not exist on the Mongoose schemas.

**28 defects were found — 9 of them blockers.** All 28 are fixed, and each is now
pinned by a test that fails against the original code.

**The single most dangerous defect was found last, by testing a mixed cart.** A cart
containing Quick Commerce *and* Wholesale *and* Retail items splits into three
separate orders — that part works. But driving the **real** `OrderSplitterEngine`
showed the Quick Commerce order resolving to the courier:

```
QC-20260819-09FUPDI28B  ft=quick_commerce  provider(order)=internal
                                           provider(vendor-scoped)=dtdc   <<< VIOLATION
```

`vendorItems[]` has no `fulfillmentType` field — only `orderType`, which the splitter
writes from `deriveOrderType()`, a **pricing** type with no Quick Commerce value. Every
QC order therefore carries `vendorItems[0].orderType === 'retail'`, and the channel
resolver gave that slice precedence over the order's own `fulfillmentType`. Every
vendor-scoped lookup of a real Quick Commerce order answered `retail`. See DEF-28.

Three further findings deserve separate mention because they are invisible to code
review:

1. **Every vendor-facing DTDC endpoint returned 404 to its rightful owner.** The
   access-token payload is `{ id, role, email }`; the controller read `req.user._id`.
   The whole Vendor shipment UI was inert.
2. **All pull-tracking was permanently broken.** `parseResponseBody` called
   `.json()` then `.text()` on the same already-consumed body, so any non-JSON
   response became `null`. A **live read-only call to DTDC confirms** the tracking
   auth endpoint returns a bare 47-character token as `text/plain` — the exact case
   that could never parse.
3. **The order lifecycle never moved.** The carrier→order status mapping was
   computed and then discarded. A DELIVERED scan updated the shipment and left the
   order at `pending` forever.

**Final verdict: READY FOR STAGING.** Booking against the live DTDC API is the one
capability that cannot be verified without creating a real, billable consignment, and
two configuration items are outstanding (§ Remaining Risks).

---

## What Antigravity Implemented

An accurate inventory of what existed before this pass, from the repository rather
than from any report:

| Area | Files |
|---|---|
| Config | `backend/src/config/dtdc.js`, env additions in `config/env.js`, `.env.example` |
| Provider resolver | `backend/src/services/shipping/deliveryProvider.js` |
| Carrier client | `backend/src/services/shipping/dtdc.client.js` |
| Shipment service | `backend/src/services/shipping/dtdcShipment.service.js` |
| Status constants | `backend/src/constants/dtdcStatus.js` |
| Persistence | `backend/src/models/Shipment.model.js`, migration `0011_shipment_model.js` |
| Controllers | `admin/controllers/shipment.controller.js`, `vendor/controllers/shipment.controller.js` |
| Routes | 8 admin routes, 5 vendor routes, `integrations/routes/dtdcWebhook.routes.js` |
| Customer tracking | `delivery/controllers/location.controller.js` (extended) |
| Frontend | `DtdcShipmentPanel.jsx`, `DtdcTrackingPanel.jsx`, `Admin/pages/orders/Shipments.jsx`, service + route + menu wiring |
| Tests | `tests/unit/dtdc-delivery.test.mjs` — 7 tests, all pure functions |

**The architecture was sound; the implementation was not.** The provider-resolver
design (server-side channel → provider, client input ignored) is correct and was
kept essentially as written. Almost every defect below sits underneath it, in code
that had never been executed against a real database or a real HTTP stack. The 7
delivered tests covered only pure mapping functions — no test touched the database,
an HTTP route, the webhook, or the order lifecycle.

---

## What Was Independently Verified

Verification was done by execution, not inspection. Three harnesses were built:

- **`tests/integration/_dtdcHarness.mjs`** — in-memory MongoDB plus a controllable
  `global.fetch` stub that records every carrier call, honours `AbortSignal` (so
  timeout paths are genuinely exercisable), and mirrors the *live* DTDC response
  shapes.
- **`tests/integration/_dtdcFixtures.mjs`** — vendors/orders that satisfy the same
  guards the real request path enforces (verified, approved, subscribed,
  channel-active), so a failure means the DTDC code is wrong rather than the fixture.
- **`tests/integration/dtdcDelivery.test.mjs`** — 63 tests driving the **real Express
  application** over HTTP, so authentication, workspace resolution, subscription
  checks and permission guards are all in the path.
- **A mixed-cart probe** driving the real `OrderSplitterEngine` inside a real
  MongoDB transaction (`MongoMemoryReplSet`), because the splitter is the only
  code that produces the document shape every live order actually has — and that
  shape is what exposed DEF-28.

Additionally, a **strictly read-only live probe** was run against the real DTDC API
using the supplied credentials. It booked nothing and cancelled nothing.

---

## Defects Found

Severity key: **BLOCKER** = feature cannot work at all · **CRITICAL** = silent
financial or data loss · **HIGH** = security or reliability · **MEDIUM/LOW** =
correctness and hygiene.

### DEF-01 · BLOCKER · Every order write-back threw a ValidationError

- **Root cause:** `Order.integration.partnerStatus` and `integration.logs[].status`
  are constrained to `INTEGRATION_PARTNER_STATUSES` — an UPPERCASE vocabulary shared
  with the third-party partner API. The service wrote shipment statuses (`'booked'`,
  `'delivered'`, `'in_transit'`) straight into them, and pushed log entries with a
  `message` field the schema does not have.
- **Affected:** `services/shipping/dtdcShipment.service.js`
- **Reproduction:** book any retail order → `ValidationError` after the AWB is issued.
- **Fix:** new `shipmentStatusToPartnerStatus()` translation plus
  `services/shipping/orderShipmentSync.service.js`, which owns every write to
  `order.integration` and emits schema-valid log entries using `note`.
- **Tests:** unit *"every shipment status maps into the Order enum"*, integration
  *"the AWB reaches both the shipment and the order"*.
- **Status:** FIXED — verified.

### DEF-02 · BLOCKER · Origin address was empty and structurally wrong

- **Root cause:** the payload builder read `pickupLocation.addressLine1`,
  `.pincode`, `.city`, `.state`, `.contactPerson`. The real `PickupLocation` shape is
  `{ name, phone, address: { street, city, state, zipCode } }`. Result: `pincode`,
  `city` and `state` serialised as `""`, and `address_line_1` serialised as a **JSON
  object** into a string field.
- **Affected:** `dtdcShipment.service.js`
- **Fix:** `normalizeAddress()` flattens all three address shapes the codebase
  actually stores; a pre-flight completeness check refuses the booking *before*
  calling the carrier and names the missing fields.
- **Tests:** unit *"the nested PickupLocation shape flattens correctly"*, integration
  *"the consignment carries a real origin, destination and COD amount"*,
  *"an incomplete pickup address is refused before the carrier is called"*.
- **Status:** FIXED — verified.

### DEF-03 · BLOCKER · Destination pincode was always empty

- **Root cause:** read from `shippingAddress.pincode || .postalCode`. The schema
  field is `zipCode`, and Mongoose strict mode had already discarded the others.
- **Status:** FIXED — verified (same fix and tests as DEF-02).

### DEF-04 · CRITICAL · Declared value was always ₹0

- **Root cause:** `order.totalAmount` does not exist; the field is `order.total`.
- **Impact:** every consignment declared at zero value — no insurance cover, and
  incorrect carrier documentation.
- **Fix:** `declaredValueFor()`, which prefers the vendor's own slice on a split
  order and falls back to the order total.
- **Status:** FIXED — verified.

### DEF-05 · CRITICAL · COD orders shipped with ₹0 to collect

- **Root cause:** `order.paymentMethod === 'COD'` compared against a schema enum
  whose value is lowercase `'cod'`. The comparison never matched, so
  `cod_collection_mode` was `''` and `cod_amount` was `0`.
- **Impact:** direct revenue loss. A ₹1,499 COD parcel would have been delivered with
  nothing collected.
- **Fix:** `isCodOrder()` — case-insensitive, accepts `cash`, and excludes orders
  already marked `paid`.
- **Tests:** unit *"the stored lowercase payment method is recognised"*,
  *"an already-paid order collects nothing on the doorstep"*; integration
  *"a prepaid order collects nothing on the doorstep"*.
- **Status:** FIXED — verified.

### DEF-06 · BLOCKER · Every vendor endpoint 404'd for its own vendor

- **Root cause:** the controller used `req.user._id`. The JWT payload built by
  `utils/generateToken.js` is `{ id, role, email }` — there is no `_id`. Mongoose
  cast the resulting `undefined` to `null`, so the ownership filter matched nothing.
- **Impact:** the entire Vendor DTDC panel was inert — no vendor could book, label,
  track or view a shipment.
- **Fix:** `req.user.id` throughout, plus per-vendor scoping on every query.
- **Tests:** integration *"the owner can book, view, label and sync their own order"*.
- **Status:** FIXED — verified.

### DEF-07 · BLOCKER · Multi-vendor orders could only ship one seller's goods

- **Root cause:** `shipmentSchema.index({ orderId, deliveryProvider }, { unique: true })`.
  A marketplace order is split per vendor and each vendor despatches its own parcel,
  so the second vendor's booking died on `E11000`.
- **Reproduction:** proven — `E11000 ... index: orderId_1_deliveryProvider_1`.
- **Fix:** uniqueness moved to `{ orderId, vendorId, deliveryProvider }`; migration
  0011 now drops the superseded index and its `verify()` fails while the stale one
  survives. The upgrade path was tested explicitly against a database seeded with
  the old index.
- **Tests:** integration *"a split order books one parcel per seller"*,
  *"migration 0011 verifies the reconciled index set"*.
- **Status:** FIXED — verified.

### DEF-08 · BLOCKER · All pull-tracking was permanently broken

- **Root cause:** `parseResponseBody` did `try { response.json() } catch { response.text() }`.
  `.json()` consumes the stream even when it throws, so `.text()` always failed with
  *"Body is unusable"* and every non-JSON response became `null`.
- **Live confirmation:** DTDC's tracking-auth endpoint returns a **bare 47-character
  token as `text/plain`** — precisely the case that could never parse. Tracking could
  not authenticate at all.
- **Fix:** read the body once as text, then attempt `JSON.parse`; token extraction
  now handles the plain-text form plus three defensive object shapes.
- **Tests:** integration *"the plain-text auth token is parsed and the history recorded"*.
- **Status:** FIXED — **live-verified** against the real DTDC API.

### DEF-09 · CRITICAL · The order lifecycle never advanced

- **Root cause:** `syncTrackingStatus` and `processDtdcWebhook` computed
  `shipmentStatusToOrderStatus(...)` and then only wrote `partnerStatus` — the result
  was discarded. `order.status` never transitioned, `deliveredAt` was never stamped,
  and no notification was ever sent.
- **Reproduction:** a DELIVERED webhook left `shipment.status = delivered` and
  `order.status = pending`.
- **Fix:** `orderShipmentSync.service.js` walks the **existing** retail and wholesale
  state machines one legal rung at a time (a `confirmed` order cannot jump straight to
  `shipped`), never moves backwards, never leaves a terminal state, and emits exactly
  one customer/vendor notification for the final state reached. No new order states
  were invented.
- **Tests:** 9 lifecycle tests including *"DELIVERED moves the order to delivered"*,
  *"a carrier scan walks the retail ladder legally, never jumping"*,
  *"wholesale uses dispatched, not shipped"*.
- **Status:** FIXED — verified.

### DEF-10 · HIGH · Webhook signature check crashed instead of rejecting

- **Root cause:** `crypto.timingSafeEqual` throws `RangeError` on unequal buffer
  lengths. Any wrong-length `x-dtdc-signature` produced an **unhandled 500** — itself
  an oracle telling an attacker their guess was the wrong length.
- **Reproduction:** proven over HTTP — `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`, 500.
- **Fix:** `safeEqual()` compares lengths first, then constant-time.
- **Tests:** integration *"a wrong-length signature is a 401, not a 500"*.
- **Status:** FIXED — verified.

### DEF-11 · HIGH · Webhook failed **open** in production

- **Root cause:** with no `DTDC_WEBHOOK_SECRET` configured, the middleware logged a
  warning and called `next()` — an unauthenticated endpoint that writes order status.
- **Fix:** fails closed (503) in production; the permissive path is non-production
  only. A rate limiter was also added.
- **Status:** FIXED — verified. **Action required:** the secret is not yet set
  (§ Remaining Risks).

### DEF-12 · HIGH · Concurrent booking created duplicate consignments

- **Root cause:** no serialisation. Two simultaneous requests both passed the
  has-no-AWB check and both reached DTDC.
- **Reproduction:** proven — 2 carrier calls, both requests failing on `E11000`, one
  consignment orphaned at DTDC.
- **Fix:** an atomic upsert on the unique `bookingId`, then a compare-and-set booking
  lock (`bookingLockedAt`, 2-minute stale expiry). The loser waits for the winner's
  AWB instead of booking a second parcel.
- **Verified after fix:** `DTDC booking calls: 1`, both callers returned the same AWB.
- **Tests:** integration *"two simultaneous requests create exactly one consignment"*.
- **Status:** FIXED — verified.

### DEF-13 · HIGH · Write operations were gated by a read-only guard

- **Root cause:** `book-dtdc` and `sync-tracking` used `requireReadableChannel`, which
  admits a **paused** channel. `req.vendorWorkspace` was resolved and then never
  compared against the order's channel.
- **Impact:** a vendor whose retail channel had been paused by Admin could still
  create consignments; a vendor in one workspace could act on another's orders.
- **Fix:** explicit `isChannelWritable` check for despatch actions, plus a workspace
  match mirroring the existing vendor order-status endpoint.
- **Tests:** integration *"a paused channel may look but not despatch"*,
  *"a workspace cannot act on another workspace's order"*.
- **Status:** FIXED — verified.

### DEF-14 · HIGH · Cross-vendor shipment, label and AWB exposure on split orders

- **Root cause:** `cancelDtdcShipment`, `getShipmentLabel` and `syncTrackingStatus`
  looked shipments up by `orderId` alone. On a two-seller order, vendor A received
  vendor B's AWB and shipping label — which carries the recipient's name, address and
  phone number.
- **Fix:** every lookup is vendor-scoped via `findDtdcShipment(orderId, vendorId)`,
  which refuses to guess when a split order is addressed without a vendor. Admin
  endpoints resolve the vendor explicitly. Label responses now carry
  `Cache-Control: private, no-store`.
- **Tests:** integration *"another vendor cannot reach the shipment, label or tracking"*
  (asserts the AWB string appears in no response body).
- **Status:** FIXED — verified.

### DEF-15 · CRITICAL · A successful booking could be recorded as a failure, permanently

- **Root cause:** the `try` block wrapped both the carrier call *and* the order
  write-back. A write-back failure marked the shipment `failed` even though the AWB
  had been issued — and the next attempt hit `if (existing?.awbNumber) return existing`
  and handed back the dead record, reporting success.
- **Fix:** the two failure modes are now distinct. A carrier refusal marks the
  shipment failed and releases the lock; a post-AWB write-back failure is logged and
  the AWB is preserved. Cancelled shipments are checked *before* the already-booked
  fast path, so a dead consignment is never returned as a successful booking.
- **Tests:** integration *"a carrier rejection leaves the shipment retryable and issues
  no AWB"*, *"a failed booking can be retried once the carrier recovers"*,
  *"a cancelled parcel is not silently rebooked"*.
- **Status:** FIXED — verified.

### DEF-16 · HIGH · Unknown scan codes could rewrite a delivered shipment

- **Root cause:** `mapDtdcScanToShipmentStatus` defaulted every unrecognised code to
  `IN_TRANSIT`. A single unmapped code would silently revert a delivered parcel.
  There was also no forward-only rule at all — out-of-order webhooks (routine on an
  unordered push queue) rewound shipments.
- **Fix:** unknown codes return `null` — the scan is recorded in history, no state
  changes. A monotonic `canAdvanceShipmentStatus()` enforces forward-only progress,
  terminal immutability, and NDR-reattempt recovery.
- **Tests:** 5 shipment-transition unit tests plus integration
  *"an out-of-order webhook never rewinds a delivered order"*,
  *"an unrecognised scan code is recorded but moves nothing"*.
- **Status:** FIXED — verified.

### DEF-17 · MEDIUM · Serviceability reported unserviceable routes as serviceable

- **Root cause:** `{ serviceable: true }` was returned for any HTTP 200. The DTDC
  pincode endpoint answers 200 whether or not it can serve the route.
- **Live confirmation** of the real contract:
  - serviceable → `ZIPCODE_RESP[0] = { MESSAGE: 'SUCCESS', SERV_COD: 'Y', DESTCITY, DESTSTATE }`
  - unserviceable → `{ MESSAGE: 'DESTPIN is not valid', SERV_COD: 'N' }`
- **Fix:** `parseServiceabilityResponse()` reads the actual verdict and additionally
  surfaces `codAvailable` — a route can accept a prepaid parcel and refuse a COD one.
  Malformed pincodes are rejected without a carrier call.
- **Live result after fix:** `500034→110001 true (cod=true, DELHI/DELHI)`;
  `500034→999999 false ("DESTPIN is not valid")`; `500034→797001 false`.
- **Status:** FIXED — **live-verified**.

### DEF-18 · MEDIUM · Weak webhook duplicate detection

- **Root cause:** duplicates were detected by comparing `lastTrackingPayload?.timestamp`
  against `rawPayload.timestamp` — absent on most payloads.
- **Fix:** duplicate suppression on the shipment state machine, scan-history
  de-duplication within a 1-second window, and one audit log line per distinct
  partner status.
- **Tests:** integration *"a duplicate DELIVERED webhook changes nothing the second time"*
  (asserts no duplicate `deliveredAt`, log entry, or scan history row).
- **Status:** FIXED — verified.

### DEF-19 · MEDIUM · Cancellation allowed on collected and delivered parcels

- **Root cause:** no state guard. A collected parcel cannot be recalled through the
  cancellation API — the correct instrument is an RTO, a different commercial event.
- **Fix:** explicit refusal for `picked_up`, `in_transit`, `out_for_delivery`,
  `delivered`, `rto`; idempotent no-op when already cancelled.
- **Status:** FIXED — verified (3 integration tests).

### DEF-20 · MEDIUM · Existing security-regression test broken by the DTDC change

- **Root cause:** adding `DTDC_CUSTOMER_CODE` / `DTDC_API_KEY` to `PRODUCTION_REQUIRED`
  broke *"a complete production environment passes"* — a real regression that shipped
  in the delivered work.
- **Fix:** the production fixture was extended (the requirement is legitimate), and
  two new assertions were added covering a missing key and a sandbox courier
  environment in production.
- **Status:** FIXED — 93/93 passing.

### DEF-21 · MEDIUM · Admin UI offered "Book DTDC Shipment" on Quick Commerce orders

- **Root cause:** the Admin order screen rendered the panel unconditionally and relied
  on `order.fulfillmentType`, which is `null` on orders predating fulfilment groups.
  A legacy QC order therefore showed courier controls.
- **Fix:** both Admin and Vendor screens now consult `experience` as well as
  `fulfillmentType`; the panel makes no API call at all for a QC order.
- **Status:** FIXED — verified.

### DEF-22 · MEDIUM · Vendor order screens raised an error toast on every load

- **Root cause:** `GET /vendor/orders/:id/shipment` returned 404 when nothing had been
  booked. "No shipment yet" is the ordinary state of a fresh order, and the global
  axios interceptor turned it into a failure toast.
- **Fix:** 200 with a `null` body.
- **Status:** FIXED — verified.

### DEF-23 · MEDIUM · `syncTrackingStatus` crashed on orders without `integration`

- **Root cause:** unguarded `order.integration.partnerStatus = ...`.
- **Fix:** all such writes now go through `recordPartnerStatus()`, which initialises
  the sub-document.
- **Status:** FIXED — verified.

### DEF-24 · MEDIUM · Tracking sync duplicated the entire timeline on every press

- **Root cause:** DTDC returns the *full* scan history on every call; the code
  appended it. It also read only `scans[length-1]`, losing milestones between syncs.
- **Fix:** the history is replaced, sorted chronologically, and every scan is walked
  forward so intermediate milestones are stamped.
- **Tests:** integration *"repeated syncs do not duplicate the timeline"*.
- **Status:** FIXED — verified.

### DEF-25 · LOW · Retries covered only transport errors, never 5xx

- **Fix:** `safeFetch` now retries 5xx and 429 with exponential backoff; booking
  remains deliberately un-retried (a retried timeout is how a customer receives two
  parcels for one payment), and `DtdcApiError` carries an explicit `retryable` flag.
- **Status:** FIXED — verified (*"a 5xx from the carrier is not recorded as a booked parcel"*).

### DEF-26 · LOW · Admin shipment list silently ignored its `search` parameter

- **Fix:** `search` now filters on AWB and booking id; `provider`, `status` and
  `vendorId` are validated rather than passed to Mongo unchecked.
- **Status:** FIXED.

### DEF-27 · LOW · Label streaming ignored backpressure and errors; dead barrel file

- **Fix:** `services/shipping/labelStream.js` uses `pipeline(Readable.fromWeb(...))`,
  shared by both controllers. The unused `services/shipping/index.js` barrel was
  removed. The panel's cancel handler is guarded against being reached in vendor
  context, where no such service call exists.
- **Status:** FIXED.

---

### DEF-28 · BLOCKER · Real Quick Commerce orders routed to DTDC

- **Root cause:** two faults compounding.
  1. `vendorItems[]` in the Order schema carried **no channel field** — only
     `orderType`, which `OrderSplitterEngine` writes from `deriveOrderType()`.
     That function reports a *pricing* type (`retail` | `wholesale` | `mixed`)
     and has no Quick Commerce value, so a QC slice is indistinguishable from a
     retail one.
  2. `resolveOrderChannel(order, vendorId)` gave that legacy slice value
     precedence over the order's own authoritative `fulfillmentType` — contradicting
     the module's own stated contract that "fulfillmentType is authoritative".
- **Reproduction:** drive `splitAndCreateOrders` with a mixed cart.
  `resolveOrderChannel(qcOrder, vendorId)` returns `'retail'`;
  `resolveDeliveryProvider` therefore returns `dtdc`; `assertProviderMatch` passes;
  `bookDtdcShipment` books a Quick Commerce parcel with the courier.
- **Why the existing tests missed it:** every DTDC fixture — mine included —
  set `vendorId` at the top level with no `vendorItems`, so the slice branch
  never ran. The real splitter *always* writes a slice.
- **Wider blast radius:** this is not only a delivery defect. The vendor
  order-status endpoint resolves the same way, so a Quick Commerce order was
  actionable from the **Retail workspace under the retail state machine** —
  precisely the bleed migration 0009 was written to end. It was still live.
- **Affected files:** `models/Order.model.js`, `services/orderChannel.service.js`,
  `services/checkout/OrderSplitterEngine.js`, new migration
  `0012_vendor_item_fulfillment_type.js`
- **Fix:**
  1. `vendorItems[]` gains a real `fulfillmentType` field (three-channel enum).
  2. The splitter stamps it with the channel the group was split under.
  3. The resolver's precedence is rewritten around expressiveness rather than
     specificity: a field that *cannot say* "quick_commerce" is treated as
     missing information, never as a disagreement. A slice's legacy `orderType`
     still refines a retail/wholesale order — so the existing multi-channel
     contract is preserved unchanged — but can never override a channel-aware
     answer.
  4. Migration 0012 backfills the slice channel on historical orders,
     non-destructively (it fills only absent values and never rewrites a
     recorded one).
- **Tests:** 4 unit tests (real splitter document shape, legacy slice, `mixed`
  pricing type, genuine per-slice split) and 6 integration tests including the
  migration backfill and its no-overwrite guarantee. The pre-existing
  `channel-remediation` assertion *"a vendor slice overrides the parent order
  channel"* still passes unchanged — that is the proof the multi-channel
  contract was preserved rather than overridden.
- **Verified after fix:** `QC → internal`, `Retail → dtdc`, `Wholesale → dtdc`,
  both order-scoped and vendor-scoped.
- **Status:** FIXED — verified.

---

## B2C (Retail) E2E Result — **PASS**

`Customer → retail order → vendor books → DTDC → AWB → tracking → delivered → customer UI`

| Stage | Evidence |
|---|---|
| Provider selection | `retail → dtdc`, `PRIORITY` service type |
| Payload | origin `500034 / Hyderabad / Telangana`, destination `110001 / New Delhi / Delhi`, declared ₹1,499, COD ₹1,499 `CASH` |
| Vendor API | book / view / label / sync all 200 for the owner; label served as `application/pdf` |
| Database | one `Shipment`, unique AWB, `bookingId` idempotency key |
| Order write-back | `trackingNumber` set, `deliveryPartnerName: DTDC`, `partnerStatus: ASSIGNED` |
| Lifecycle | `PKD → shipped`, `INT → shipped`, `OFD → out_for_delivery`, `DEL → delivered` with `deliveredAt` |
| Customer UI | `GET /user/orders/:id/tracking` returns AWB, carrier, milestones, history; `rider: null` |

## B2B (Wholesale) E2E Result — **PASS**

Same path, wholesale vocabulary throughout: `GROUND EXPRESS` service type;
`PKD → dispatched` (not `shipped`); wholesale ladder
`approved → processing → packed → dispatched → delivered` walked one legal rung at a
time. **Wholesale never enters QC rider assignment** — asserted directly.

## Quick Commerce E2E Result — **PASS**

The whole internal lifecycle (`accepted → preparing → ready → picked_up → arriving →
delivered`) was driven with the carrier stub recording every outbound call.

**`dtdcCalls.length === 0`.** Zero DTDC bookings, zero serviceability calls, zero
tracking calls, and zero `Shipment` records. Additionally:

- the service refuses a QC booking before any network contact;
- the vendor endpoint answers 403;
- a forged body (`deliveryProvider: 'dtdc'`, `fulfillmentType: 'retail'`) is refused;
- a deliberately corrupted DTDC shipment pointing at a QC order is refused by the
  webhook — the QC order stays `pending`.

---

## DTDC API Verification

| Capability | Method | Result |
|---|---|---|
| Serviceability — valid route | **LIVE** | PASS — `SUCCESS`, `SERV_COD: Y`, `DELHI/DELHI` (370 ms) |
| Serviceability — invalid destination | **LIVE** | PASS — `DESTPIN is not valid`, correctly reported unserviceable |
| Serviceability — invalid origin | **LIVE** | PASS — `ORGPIN is not valid` |
| Tracking authentication | **LIVE** | PASS — 47-char plain-text token acquired |
| Tracking lookup — unknown AWB | **LIVE** | PASS — `NO DATA FOUND FOR THIS CNNO NUMBER`, surfaced as an error |
| Token caching / refresh | Stubbed | PASS — 55-min cache; 401/403 clears cache and re-authenticates once |
| Booking — success | Stubbed | PASS |
| Booking — rejection, timeout, 5xx, no-reference | Stubbed | PASS (4 tests) |
| Booking — **against live DTDC** | — | **NOT LIVE-VERIFIED** (would create a real billable consignment) |
| Cancellation | Stubbed | PASS — **NOT LIVE-VERIFIED** |
| Label retrieval | Stubbed | PASS — **NOT LIVE-VERIFIED** |
| Tracking history parsing for a real consignment | Stubbed | **NOT LIVE-VERIFIED** (requires a booked AWB) |

The request format for tracking is live-verified: DTDC returned a structured
`statusCode: 206` response rather than a protocol error, confirming
`{ trkType: 'cnno', strcnno, addtnlDtl: 'Y' }` and the `x-access-token` header are
accepted.

## Webhook Verification — **PASS**

Route `POST /api/integrations/webhook/dtdc`. 9 tests.

| Case | Result |
|---|---|
| Unsigned request | 401, shipment untouched |
| Wrong-length signature | **401 (was an unhandled 500)** |
| Valid HMAC-SHA256 over the raw body | 200, order delivered |
| Tampered body, valid-looking signature | 401 |
| Shared-secret header | 200 |
| Unknown AWB | 200 `unknown_awb` — acknowledged, never retried |
| Malformed / missing fields | 200, no order touched |
| Broken JSON | 400 at the parser |
| Replay of the same event | 200, no duplicate state, log or history row |
| Cross-order safety | a webhook for AWB *A* leaves order *B* at `confirmed` |
| QC order with a DTDC shipment | refused, order unchanged |

Genuine server faults now return 500 so DTDC *does* retry them; everything
unactionable returns 200 so it does not.

## Shipment Lifecycle Verification — **PASS**

`BOOKED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED`, plus `NDR`, `RTO`,
`CANCELLED`, `FAILED`. Verified: forward-only progress; terminal states never
reopened; duplicate events are no-ops; out-of-order events never rewind; NDR
reattempts can still deliver; repeated RTO does not re-stamp `initiatedAt`; unknown
codes are recorded but move nothing.

## Admin UI Verification — **PASS**

8 endpoints behind `ORDERS_VIEW` / `ORDERS_UPDATE`; permission coverage check passes
(45/45 tokens enforced). `/admin/orders/shipments` list, per-order panel, AWB, status,
tracking, label, failure reasons, NDR/RTO surfaces. Split orders render read-only
per-seller rows rather than guessing a parcel. **DTDC controls no longer appear on
Quick Commerce orders** (DEF-21).

## Vendor UI Verification — **PASS**

All five vendor endpoints now function for their owner (DEF-06). Cross-vendor access
is refused on all four surfaces with no AWB leakage. Workspace switching is enforced.
Paused channels are read-only. QC vendors never see a "Ship with DTDC" control.

## Customer UI Verification — **PASS**

`GET /api/user/orders/:id/tracking` is ownership-scoped — a second customer receives
404 and the AWB appears nowhere in the response. Retail/wholesale receive the DTDC
panel; QC receives rider/ETA fields and `shipment: null`. Customers cannot influence
provider selection, shipment status, or another customer's order.

## Security Verification — **PASS**

| Attack | Result |
|---|---|
| `deliveryProvider=internal` on a retail order | ignored — resolver is server-side |
| `deliveryProvider=dtdc` on a QC order | rejected, zero carrier calls |
| Forged `fulfillmentType` / `orderType` in the body | ignored |
| Forged `x-vendor-workspace` header | 403 workspace mismatch |
| Cross-vendor shipment / label / tracking / booking | 403 or 404, no AWB leakage |
| Cross-customer AWB access | 404 |
| Webhook forgery, replay, tampering, malformed JSON | rejected or safely acknowledged |
| Paused-channel despatch | 403 |
| Unauthenticated access | 401 |

**Credential hygiene:** no DTDC credential appears in any tracked source file, test
fixture, example file, or frontend bundle — verified by direct scan for the customer
code, API key, tracking username/password and access token. `backend/.env` is
correctly git-ignored. `dtdcConfig.toSafeString()` redacts every secret and is
asserted to do so. **No rotation is required** — nothing leaked.

## Existing Functionality Regression — **PASS**

One regression was introduced by the delivered DTDC work (DEF-20) and is fixed.
Everything else passes. Retail/wholesale product CRUD, publishing, MOQ, tier pricing,
checkout pricing, wholesale analytics and import, QC ETA/rider assignment/polish,
vendor channel transitions, permission coverage, and source hygiene are all green.

**One pre-existing failure is explicitly *not* a DTDC regression:**
`featureFlagContractEnforcement.test.mjs` fails 3 of 19 assertions (feature-flag TTL
cache staleness). This was confirmed by stashing every backend change and re-running
on the original code — **identical 3 failures**. Untouched by this work.

The `tests/run.mjs` release suite reports 8/10 suites failing because those suites
require an externally running server on `localhost:5000` and seeded accounts
(`Backend server is running at http://localhost:5000/api → Status: 404`). Environment,
not code. Not run as a pass.

## Database / Migration Verification — **PASS**

All 12 migrations apply cleanly and are **idempotent** (re-running every migration
leaves every `verify()` green):

```
PASS 0008_vendor_channels              unmigrated=0; missing=0; invalid=0; strandedApproved=0
PASS 0009_order_channel_attribution    mismatched=0; unattributed=0
PASS 0010_vendor_channel_migration_stamp  unstamped=0; strandedApproved=0
PASS 0011_shipment_model               10 indexes present on Shipment collection
PASS 0012_vendor_item_fulfillment_type missingSliceChannel=0; quickCommerceMisrouted=0
PASS all migrations are idempotent
```

The prior multi-channel migration state is **preserved exactly**. The 0011 upgrade
path was tested against a database seeded with the broken index:

```
before: {"orderId":1,"deliveryProvider":1} UNIQUE
after : {"orderId":1,"vendorId":1,"deliveryProvider":1} UNIQUE | {"orderId":1,"deliveryProvider":1}
PASS  two vendors, one order, two shipments: 2
PASS  same vendor cannot double-book (11000)
```

Legacy orders carrying none of `fulfillmentType` / `orderType` / `experience` still
resolve to retail and book correctly — asserted directly. No existing order document
is modified by the migration.

---

## Test Results

| Suite | Passed | Failed | Status |
|---|---:|---:|---|
| `security-regression.test.mjs` (incl. 3 new env-contract tests) | 93 | 0 | PASS |
| Multi-channel unit suites (channels, ownership, remediation, chat) | 49 | 0 | PASS |
| `dtdc-delivery.test.mjs` (rewritten: 7 → 42) | 42 | 0 | PASS |
| `dtdcDelivery.test.mjs` (new, real app over HTTP) | 68 | 0 | PASS |
| Self-contained integration (product channels, migration stamp, role matrix, wholesale + QC lifecycle) | 25 | 0 | PASS |
| `verifyPricingEngineParity` | 79 | 0 | PASS |
| `verifyCheckoutPricingMath` | 42 | 0 | PASS |
| `verifyWholesaleAnalytics` | 24 | 0 | PASS |
| `verifyBulkWholesaleImport` | 37 | 0 | PASS |
| `verifyQuickCommerceEtaParity` | 62 | 0 | PASS |
| `verifyRiderAssignment` | 56 | 0 | PASS |
| `verifyQuickCommercePolish` | 58 | 0 | PASS |
| Migration apply + verify + idempotency (12 migrations) | 12 | 0 | PASS |
| Source hygiene | — | — | PASS |
| Permission coverage (45 tokens) | 45 | 0 | PASS |
| Frontend production build | — | — | PASS (57 s, no errors) |
| Live read-only DTDC probe (serviceability ×3, auth, tracking) | 5 | 0 | PASS |
| **Total executed** | **697** | **0** | |

**Not executed — stated honestly:**

- **Frontend unit/component tests: none exist.** The project has no frontend test
  runner configured. Frontend verification is limited to the production build plus
  backend contract tests for every endpoint the UI calls. Adding a runner was out of
  scope for a remediation pass and would be a meaningful change to the toolchain.
- **Frontend lint: could not run.** `npx eslint` fails with
  `Cannot find package '@eslint/js'` — the config's dependencies are not installed.
  Pre-existing; unrelated to this work.
- **`tests/run.mjs` release suite:** requires an externally running server. Not run.
- **Live booking / cancellation / label / real-AWB tracking:** deliberately not run.

Two throwaway harness files created during investigation were removed;
`tests/integration/_dtdcHarness.mjs`, `_dtdcFixtures.mjs` and `dtdcDelivery.test.mjs`
are permanent and wired into `npm run test:dtdc` and `npm run ci`.

---

## Remaining Risks

### Blocker
None.

### High
1. **`DTDC_WEBHOOK_SECRET` is not configured.** The webhook now fails closed in
   production (503), so **push tracking will not work until this is set** — and
   without the fix it would have accepted unauthenticated order-status writes.
   Set it in `backend/.env` and register the same value with DTDC.
2. **Live booking is unproven.** The payload is now built from verified field names
   and validated before despatch, but no consignment has been created against the
   real API. **Book one order in staging and inspect the AWB and label before
   go-live** — this is the single highest-value remaining check.

### Medium
3. **`DTDC_ENVIRONMENT=sandbox` with what appear to be live account credentials.**
   Bookings currently target `alphademodashboardapi.shipsy.io`, not `pxapi.dtdc.in`.
   The environment contract already refuses to boot production with a sandbox value,
   so this cannot ship silently — but it must be set deliberately.
4. **Real-consignment tracking history parsing is unverified.** The parser handles
   four documented response shapes and both `strActionStatus` and `strCode`, but only
   the *error* shape has been seen live.
5. **Weight is estimated, not measured.** 0.5 kg per unit unless the catalogue carries
   a weight. DTDC bills on the higher of actual and volumetric weight, so this costs
   money at reconciliation rather than failing at booking.
6. **No automatic tracking poller.** Tracking advances via webhook, or manually via
   the Sync button. If the webhook is not registered, orders will not progress on
   their own.
7. **RTO does not trigger a refund.** It is recorded on the shipment and surfaced in
   the UI, deliberately left as an explicit business decision rather than an automatic
   financial transaction.

### Low
8. No frontend test tooling (above).
9. `featureFlagContractEnforcement` TTL-cache staleness — pre-existing, proven
   unrelated.
10. A stale duplicate of `backend/tests` exists at the repository root
    (`DwellMart/tests`) with divergent contents. Not touched; worth reconciling.

### Accepted risk
11. Serviceability is exposed as an explicit API rather than a mandatory pre-flight
    check on every booking. Adding a blocking network call to the booking path would
    make bookings fail whenever the pincode API is slow, for a check the carrier
    performs anyway. The `codAvailable` signal is available to the UI.
12. `in_transit` folds to `PICKED_UP` in `Order.integration.partnerStatus` because
    that enum is a fixed contract shared with the third-party partner API. The exact
    carrier status is retained losslessly on the `Shipment` document.

---

## Final Production Readiness

# READY FOR STAGING

The integration is now correct where it can be proven correct: 697 executed
assertions pass, provider separation holds under deliberate attack, the order
lifecycle synchronises through the existing state machines, the webhook is
authenticated and replay-safe, multi-vendor and concurrent booking are sound, and
five carrier endpoints are verified against the live DTDC API.

It is **not** ready for production, for one honest reason and two configuration ones:
no consignment has ever been booked against the real DTDC API, the webhook secret is
unset, and the courier environment is still pointed at sandbox.

Complete these three and the recommendation becomes production-ready:

1. Set `DTDC_WEBHOOK_SECRET` and register the webhook URL with DTDC.
2. Set `DTDC_ENVIRONMENT=production` once live credentials are confirmed.
3. Book, label, track and cancel **one real staging order end to end**, and confirm
   the AWB, the printed label and the scan history.

Claiming production readiness without step 3 would be claiming a test that was
never run.
