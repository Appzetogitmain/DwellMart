# IMPLEMENTATION PLAN — Parcel Weight & Dimensions + Unbooked-Order Alerts

Two related pieces of work, both arising from the DTDC verification pass:

- **Track A** — orders that nobody has booked with the courier are currently invisible.
- **Track B** — DwellMart captures no weight or dimensions anywhere, so every
  consignment is declared at a hardcoded 0.5 kg per unit and 20 × 15 × 10 cm.

They can ship independently. Track B is the one with money attached.

---

## Findings that shape the plan

These come from reading the code, not from assumption.

| Finding | Consequence |
|---|---|
| `weight` appears in exactly one model — `Shipment.model.js` — the field we write our own estimate into. | There is no existing field to read. This is new data capture, not plumbing. |
| `Product` has **no** weight, and `orderItemSchema` has **no** weight. | `estimateWeightKg()` reads `item.weightKg ?? item.weight`, neither of which can exist. The 0.5 kg fallback is the only code path. |
| No weight input exists anywhere in the vendor or admin UI. | Both forms need new fields, plus the bulk-upload template. |
| `allowedFormSections.shipping` **already exists** in `frontend/src/shared/config/vendorCapabilities.js` — `true` for Retail, `false` for Wholesale and Quick Commerce. No `ShippingSection` component was ever built. | The architecture already anticipated this section. Wholesale's flag is simply wrong (it uses DTDC too), and Quick Commerce's `false` is correct and gives us the QC exclusion for free. |
| Vendor product writes pass through `productCapabilityGuard`, which rejects any field not listed in `productFieldOwnership.js`. Strict mode is the default. | New fields **must** be registered in `SHARED_PRODUCT_FIELDS` or every write 400s. |
| Admin product writes use a separate Joi schema (`admin/validators/catalog.validator.js`) and bypass the capability guard. | Two validators to update, not one. |
| Bulk upload builds products from spreadsheet columns in `bulkUpload.service.js`. | A third write path. Ignoring it leaves bulk-created products weightless. |
| Nothing auto-books a shipment. `ORDER_CREATED` only sends notifications; no cron or worker touches `Shipment`. | The unbooked-order gap is real and unmonitored. |
| `quickCommerceAlerts.service.js` already implements a leased, multi-instance-safe sweep. | Track A should copy that pattern rather than invent one. |

---

## On "is the product the right place?" — mostly yes, but not on its own

**Your instinct is right.** The product is the correct home for catalogue weight and
dimensions: it is entered once, reused on every order, and it is genuinely
channel-neutral (a box is a box, whether it sells retail or wholesale), which means
it belongs in `SHARED_PRODUCT_FIELDS` and is editable from either workspace.

But product-level data alone will **not** make the DTDC declaration correct, for
three reasons that are worth understanding before committing to the work.

### 1. DTDC bills the parcel, not the product

Multiple items ship in one box. The sum of product weights is close enough for
actual weight, but **dimensions do not sum**: three 20 cm boxes packed together are
not one 60 cm box. Any formula we invent for combined dimensions will be wrong, and
dimensions are not cosmetic — see below.

### 2. Volumetric weight is what actually gets charged

DTDC bills on **the higher of actual and volumetric weight**, where volumetric is
`(L × W × H) / 5000` for air. Today's hardcoded 20 × 15 × 10 gives 0.6 kg for
everything. A duvet, a lampshade, a bicycle helmet — all large and light — are
charged on volume, and we currently declare a fraction of it. Correct product
dimensions fix this for a single-item parcel and still leave multi-item parcels
guessing.

### 3. Variants change weight

`Product.variants` stores `prices` and `stockMap` as per-variant Maps. Weight has
the same property — a size 12 shoe against a size 6, a 500 ml bottle against 2 L.
Doing this properly means a `weightMap` alongside the existing Maps.

### Recommendation: two tiers, and defer the third

| Tier | What | Why |
|---|---|---|
| **1. Catalogue** *(build now)* | Weight + dimensions on the product, used to compute a default | Enter once, reuse everywhere. The only scalable source. |
| **2. Parcel** *(build now)* | An editable **Package Details** step in the booking panel, pre-filled from Tier 1, that the vendor confirms or corrects before pressing Book | This is the tier that actually protects revenue. It is the only place a human knows what physically went in the box. Cheaper to build than Tier 3. |
| **3. Per-variant** *(defer)* | `variants.weightMap`, mirroring `stockMap` | Only worth it for size-variant-heavy catalogues (fashion, footwear). Tier 2 absorbs the error until then. |

**Tier 1 without Tier 2 leaves every multi-item parcel wrong.** Tier 2 without Tier 1
makes the vendor type dimensions on every single booking, which they will stop doing
by the third order. They are worth building together, and together they are still a
smaller job than per-variant weights.

### Required or optional?

**Optional at first, loudly warned at booking.** Making weight mandatory immediately
would block a vendor from editing an existing product's price without first measuring
it — every legacy product becomes uneditable. Instead:

1. Ship the fields as optional, with the booking panel showing an explicit warning
   when weight is missing: *"Using an estimated 0.5 kg. DTDC may raise a weight
   discrepancy charge."*
2. Give admin a "products missing shipping details" report to drive backfill.
3. Once the catalogue is substantially covered, make it **required for new products
   only** — a one-line change to `requiredFields` in `vendorCapabilities.js`.

---

# TRACK A — Unbooked-order alerts

**Goal:** nobody discovers a two-day-old paid order that was never handed to the courier.

### A1 · Define the condition

An order needs booking when **all** of these hold:

- its channel resolves to `retail` or `wholesale` (never Quick Commerce);
- it is not `cancelled`, `returned` or `delivered`;
- it is past the point where despatch is expected — `confirmed` or later for retail,
  `approved` or later for wholesale;
- no `Shipment` exists for that `(orderId, vendorId)` with an AWB.

Threshold: **configurable, default 6 working hours** since the order reached that
state. Store it in `Settings` under a `shipping` key so it is tunable without a
deploy, matching how `quickCommerceAlerts` reads its own timeout.

### A2 · Backend — the sweep

**New file:** `backend/src/services/shipping/unbookedOrderAlerts.service.js`

Copy the proven structure from `quickCommerceAlerts.service.js`:

- `acquireSweepLease()` using the same `Settings`-backed lease with a distinct key
  (`_shipping_sweep_lease`), so multiple app instances do not all alert.
- `findUnbookedOrders()` — an aggregation with `$lookup` onto `shipments`, filtered
  by channel and age. Must be a single aggregation, not a per-order query; the vendor
  order list is already indexed on `(vendorId, status, createdAt)`.
- `runUnbookedOrderSweep()` — for each result, notify **once**:
  - vendor: `createNotification({ recipientType: 'vendor', priority: 'HIGH', … })`
  - admin, only past a second, longer threshold (default 24 h): `notifyAdmins(…)`
- Idempotency: stamp `order.integration.unbookedAlertedAt` and skip anything already
  stamped inside the window. Without this the sweep re-alerts every tick.
- `startUnbookedOrderSweep(intervalMs = 15 * 60_000)` / `stopUnbookedOrderSweep()`.

**Wire in:** `backend/src/server.js`, beside the existing
`startEscalatedOrderRecoveryWorker(2 * 60_000)` call.

**Index to add** on `Shipment`: `{ orderId: 1, awbNumber: 1 }` — the `$lookup` filters
on exactly this pair.

### A3 · Backend — the queryable list

Alerts are a push; people also need a pull.

- `GET /api/vendor/orders/awaiting-shipment` — the vendor's own unbooked orders.
  Guards: `...vendorAuth, ...requireReadableChannel`.
- `GET /api/admin/shipments/awaiting-booking` — platform-wide, paginated, filterable
  by vendor and age. Permission: `PERMISSIONS.ORDERS_VIEW`.

Both reuse `findUnbookedOrders()` so the number in the alert and the number on the
screen can never disagree.

### A4 · Frontend

- **Vendor order list** — a new **"Awaiting Shipment"** filter chip beside the existing
  status filters, with a count badge. This is the single highest-value surface: it puts
  the work where the vendor already looks.
- **Vendor order detail** — when an order qualifies, the existing `DtdcShipmentPanel`
  gains an amber banner above the Book button: *"This order has been ready to ship for
  8 hours."*
- **Admin → DTDC Shipments** — a second tab, **"Awaiting Booking"**, alongside the
  existing shipment list. Same table shell, different data source.
- Notification bell already renders whatever the notification service emits — no work.

### A5 · Tests

Add to `backend/tests/integration/dtdcDelivery.test.mjs`:

- a retail order past the threshold with no shipment **is** returned by the sweep;
- the same order **after booking** is not;
- a Quick Commerce order is **never** returned, at any age;
- a cancelled and a delivered order are never returned;
- the sweep alerts **once**, not once per tick;
- the vendor endpoint returns only that vendor's orders (cross-vendor denial).

### A6 · Estimate

| Item | Size |
|---|---|
| Sweep service + lease | ~180 lines, mirrors an existing file |
| Two endpoints | ~80 lines |
| Frontend: filter chip, banner, admin tab | ~250 lines |
| Tests | 6 integration cases |
| **Risk** | **Low.** Purely additive. Nothing existing changes behaviour. |

---

# TRACK B — Weight, weight unit and dimensions

### B0 · Data model

**`backend/src/models/Product.model.js`** — one new sub-document, placed beside the
existing fulfilment-policy fields:

```js
/**
 * Physical parcel characteristics, used to declare a consignment to the
 * courier. Channel-neutral: a box is the same box whether it sells retail or
 * wholesale. Quick Commerce never reads this — internal riders do not bill
 * on volumetric weight.
 *
 * Optional by design. A product without it books at an estimate and warns;
 * blocking the edit would make every pre-existing product uneditable.
 */
shipping: {
    weight:     { type: Number, min: 0 },                 // per unit
    weightUnit: { type: String, enum: ['kg', 'g'], default: 'kg' },
    length:     { type: Number, min: 0 },
    width:      { type: Number, min: 0 },
    height:     { type: Number, min: 0 },
    dimensionUnit: { type: String, enum: ['cm', 'in'], default: 'cm' },
},
```

**Why `weightUnit` and not kg-only:** vendors selling jewellery or spices think in
grams and will type `250` meaning 250 g. Storing a unit and normalising on read is
cheaper than fielding support tickets about a 250 kg earring. Normalisation happens
once, in the payload builder — the database keeps what the vendor entered.

**No migration needed.** Absent sub-documents read as `undefined`, which the payload
builder already handles. Add migration `0013` only to create the reporting index for
the "missing shipping details" screen.

### B1 · Field ownership — do this first, or every write 400s

**`backend/src/constants/productFieldOwnership.js`** — add `'shipping'` to
`SHARED_PRODUCT_FIELDS`, under the "Fulfilment policy" grouping.

This one line is what makes the field writable at all. `productCapabilityGuard` runs
in strict mode by default and rejects unknown keys with a 400. There is an existing
test — `tests/unit/product-field-ownership.test.mjs` — that asserts this list stays in
sync with the schema and validators; it will fail if the three drift apart, which is
the desired behaviour.

### B2 · Validators

Same Joi block in both, because the two write paths must accept identical shapes:

- `backend/src/modules/vendor/validators/product.validator.js` — both `createProductSchema` and `updateProductSchema`
- `backend/src/modules/admin/validators/catalog.validator.js` — same

```js
shipping: Joi.object({
    weight:        Joi.number().min(0).max(100000).allow(null).optional(),
    weightUnit:    Joi.string().valid('kg', 'g').optional(),
    length:        Joi.number().min(0).max(1000).allow(null).optional(),
    width:         Joi.number().min(0).max(1000).allow(null).optional(),
    height:        Joi.number().min(0).max(1000).allow(null).optional(),
    dimensionUnit: Joi.string().valid('cm', 'in').optional(),
}).optional(),
```

The upper bounds are deliberate: a typo of `1500` kg for `1.5` kg is a real support
cost, and DTDC will reject it anyway — better to catch it in the form.

### B3 · Carry it onto the order

The payload builder can only read what the order stores.

**`backend/src/models/Order.model.js`** — add to `orderItemSchema`:

```js
/** Snapshot of the product's parcel data at order time, in kg and cm. */
shippingWeightKg: Number,
shippingDims: { length: Number, width: Number, height: Number },
```

**Snapshot, not reference** — deliberately, and for the same reason `appliedTier` and
`unitRetailPrice` are already snapshotted on this schema. A vendor correcting a
product's weight next month must not retroactively change what an already-despatched
consignment declared.

**`backend/src/services/checkout/OrderSplitterEngine.js`** — in `computeGroupPricing`,
where `pricedItems` is built, normalise the product's shipping block to kg/cm and
write it onto the line. The product is already loaded into `productMap`; add
`shipping` to the `.select(…)` projection at line 321.

### B4 · Consume it in the consignment

**`backend/src/services/shipping/dtdcShipment.service.js`**

- `estimateWeightKg(items)` — read `item.shippingWeightKg` first, keep 0.5 kg as the
  documented fallback, and return `{ weight, isEstimated }` so callers can tell the
  vendor which they got.
- **New** `computeParcelDimensions(items)` — for a single-line, single-quantity parcel
  use the item's own dimensions; otherwise fall back to the current default. Do **not**
  invent a stacking formula; Tier 2 (below) is the honest answer for multi-item boxes.
- **New** `chargeableWeight(actualKg, dims)` — `max(actual, (L × W × H) / 5000)`.
  This is what DTDC bills, so this is the number to show the vendor.
- Replace the hardcoded `length: 20, width: 15, height: 10` in `buildConsignmentPayload`.
- Persist `isEstimated` on the `Shipment` so the admin list can flag estimated parcels.

### B5 · Tier 2 — package details at booking

**`backend/src/models/Shipment.model.js`** — the `weight` and `dimensions` fields
already exist. Add `weightSource: { type: String, enum: ['catalogue', 'estimated', 'vendor'] }`.

**`bookDtdcShipment(order, vendor, pickupLoc, overrides)`** — accept an optional
`{ weight, length, width, height }`. When present it wins over the computed value and
is stamped `weightSource: 'vendor'`. Validate the same bounds as B2.

**`frontend/src/shared/components/DtdcShipmentPanel.jsx`** — before booking, show:

```
Package details
  Weight  [ 2.4 ] kg      ← pre-filled from the catalogue
  L [ 30 ]  W [ 20 ]  H [ 15 ] cm
  Chargeable weight: 2.4 kg   (volumetric 1.8 kg)
  ⚠ Estimated — this product has no weight set.   ← only when estimated
  [ Book DTDC Shipment ]
```

Showing chargeable weight is the single most useful number on the screen: it is what
the vendor will actually be invoiced for, and it makes the volumetric rule visible
rather than a surprise on the statement.

### B6 · Vendor form

**New:** `frontend/src/modules/Vendor/components/ProductSections/ShippingSection.jsx`

Follow the existing section components exactly — same props shape, same card styling
as `InventorySection.jsx`. Contents: weight + unit selector, three dimension inputs +
unit selector, and a live "volumetric weight" readout so the vendor sees the
consequence of the numbers as they type.

**Wire into both forms** — `ProductForm.jsx` (edit) and `AddProduct.jsx` (add),
rendered behind the flag that already exists:

```jsx
{sections.shipping && <ShippingSection form={form} onChange={handleChange} />}
```

**`frontend/src/shared/config/vendorCapabilities.js`** — flip Wholesale's
`allowedFormSections.shipping` from `false` to `true`. Retail is already `true`.
Quick Commerce stays `false`, which is exactly right and gives the QC exclusion with
no extra code.

### B7 · Admin form

**`frontend/src/modules/Admin/components/ProductFormModal.jsx`** — the same fields, in
the same order, in a new "Shipping" block. The admin form is a single 1,758-line modal
rather than composed sections, so this is an inline addition rather than a component
import. Keep the field names and units identical to the vendor section; two different
vocabularies for the same data is how the retail/wholesale `orderType` confusion
happened.

### B8 · Bulk upload

**`backend/src/services/bulkUpload.service.js`** — add four columns to the template,
the parser and the export:

`Weight`, `Weight Unit`, `Dimensions (LxWxH)`, `Dimension Unit`

`Dimensions (LxWxH)` as one column parsed on `x` is materially easier for a vendor
filling a spreadsheet than three separate columns, and it matches how carriers print
it. Validate it the same way as B2 and surface a row-level error rather than silently
dropping it.

### B9 · Backfill visibility

- `GET /api/admin/products/missing-shipping` — retail/wholesale-published products
  with no `shipping.weight`, paginated. Permission: `PERMISSIONS.PRODUCTS_VIEW`.
- Surface as a card on the admin catalogue page: *"142 products have no shipping
  weight — consignments for these are estimated."*
- The vendor product list gets a subtle warning icon on affected rows.

Migration `0013_product_shipping_index` — a partial index on
`{ 'shipping.weight': 1 }` for products where retail or wholesale is enabled, so this
report does not table-scan a large catalogue.

### B10 · Tests

**Unit** (`tests/unit/dtdc-delivery.test.mjs`):
- grams normalise to kilograms;
- a missing weight falls back to 0.5 kg **and reports `isEstimated: true`**;
- chargeable weight returns volumetric when it exceeds actual, and actual otherwise;
- a single-item parcel uses the product's dimensions; a multi-item parcel falls back;
- a vendor override beats the catalogue value.

**Integration** (`tests/integration/dtdcDelivery.test.mjs`):
- a product with weight → the consignment carries the real weight and dimensions;
- a product without → 0.5 kg, and the shipment records `weightSource: 'estimated'`;
- a booking override → the consignment carries the vendor's numbers and
  `weightSource: 'vendor'`;
- out-of-bounds values are rejected before the carrier is called;
- a Quick Commerce product with a weight set still never reaches DTDC.

**Field ownership** — the existing `product-field-ownership.test.mjs` should be
extended to assert `shipping` is shared and not channel-owned.

### B11 · Estimate

| Item | Size | Risk |
|---|---|---|
| B0–B2 model, ownership, validators | ~60 lines | Low |
| B3 order snapshot + splitter | ~40 lines | **Medium** — touches the transactional checkout path |
| B4 payload builder | ~70 lines | Low, well covered by existing tests |
| B5 Tier-2 booking override | ~120 lines back + front | Low |
| B6–B7 vendor + admin forms | ~350 lines | Low |
| B8 bulk upload | ~80 lines | Low |
| B9 backfill reporting + migration | ~120 lines | Low |
| B10 tests | ~15 cases | — |

**The one genuinely risky change is B3**, because `OrderSplitterEngine` runs inside a
MongoDB transaction that produces every order in the system. It is additive — one more
field on a line item — but it must be exercised against the real splitter, not a
fixture. The `MongoMemoryReplSet` harness written during the DTDC verification does
exactly this and should be promoted from a throwaway probe into a permanent test.

---

## Suggested sequence

| Phase | Contents | Ships |
|---|---|---|
| **1** | Track A in full | Standalone. Nothing depends on it. |
| **2** | B0–B2 (model, ownership, validators) + B6–B7 (forms) | Vendors can start entering data immediately, before anything consumes it. |
| **3** | B3–B4 (order snapshot, payload) + B5 (booking override) | The point at which DTDC starts receiving real numbers. |
| **4** | B8 (bulk upload) + B9 (backfill reporting) | Drives catalogue coverage. |
| **5** | Flip weight to required for new products | Only once B9 shows coverage is high. |

Phase 2 before Phase 3 is deliberate: it lets the catalogue fill up while the
consumption path is still being built, so Phase 3 goes live against real data rather
than an empty field.

## Explicitly out of scope

- **Per-variant weights** (`variants.weightMap`) — deferred; Tier 2 absorbs the error.
- **Automatic booking on order placement** — a separate decision. Track A makes the
  manual gate visible, which is the smaller and safer step.
- **Multi-parcel shipments** (one order, several boxes) — DTDC supports it via
  `num_pieces`, which we already send, but per-box dimensions would need a new model.
