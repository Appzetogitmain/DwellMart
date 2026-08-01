# Quick Commerce Marketplace — Enterprise Implementation Blueprint

**Status:** Architecture & design document. **No implementation.** To be executed phase-by-phase later.
**Scope:** Add a second, independent shopping *experience* (Quick Commerce) alongside the existing Marketplace (B2C Retail + B2B Wholesale), without duplicating collections, APIs, or business logic.
**Precedent:** Reuses the patterns proven across the 5-phase Wholesale rollout (channel flags, feature-flag gating, shared authoritative services, dual-registry permissions, additive-only schema).

---

## Revision Note — v2 (post-architecture-review)

This revision deliberately trades enterprise-grade geospatial sophistication for MVP speed. Changes from v1:

| Area | v1 | v2 (this document) |
|---|---|---|
| Serviceability | Polygon `DeliveryZone` + vendor radius + zone priority/overlap rules | **Vendor location + radius only.** `DeliveryZone` collection removed entirely |
| Rider assignment | Nearest → broadcast-and-accept → batched dispatch | **Nearest available rider, assigned directly** |
| ETA | prep + travel + zone buffer + surge, ML roadmap | **prep + travel.** Nothing else |
| Caching | Geohash bucketing of coordinates | **Geo endpoints simply not cached** |
| New collections | `DeliveryZone` (+ deferred `RiderLocationPing`) | **Zero new collections** |
| Phases | 8 | **6** |
| Inventory | Implicit | **Explicitly documented shared-pool + checkout re-validation** |
| Store availability | Open / closed | **Open / Busy / Temporarily Closed / Offline** |
| QC homepage | Nearby stores | **Category-first (Blinkit-style)**, stores secondary |
| Vendor dashboard | Generic | **Operational: Today's Orders, Preparing, Out for Delivery, Delivered, Rejected, Avg ETA** |

**Deferred to V2 (§32):** polygon zones, zone priorities, geohash caching, rider broadcast, rider location history, ML ETA, Redis GEO, server-side cart, dedicated search engine, route optimisation.

**Net effect:** roughly 20–25% less implementation surface, no new collections, and the hardest GIS problems removed from the critical path — while the extension points for all of it remain intact.

---

## 0. Executive Summary & Guiding Principles

Quick Commerce (QC) is **not** a new marketplace. It is a second *experience* over the same catalog, vendor, order, and delivery primitives, distinguished by three things:

1. **Hyperlocal constraint** — only vendors within delivery range are visible.
2. **Time constraint** — orders promised in minutes, requiring ETA and live tracking.
3. **Separate taxonomy** — its own category tree (Groceries → Milk).

| # | Principle | Consequence |
|---|---|---|
| P1 | **One collection per concept** | No `QuickProduct`/`QuickOrder`/`QuickVendor`. Discriminator fields only. **V2 adds zero new collections.** |
| P2 | **Additive schema only** | Every new field defaults to today's behaviour. Existing docs valid unmigrated. |
| P3 | **One authoritative service per rule** | Pricing, ETA, serviceability each have exactly one server implementation. Clients preview; server decides. |
| P4 | **Flag-gated from day one** | `Settings.features.quickCommerceEnabled` OFF must be byte-identical to today. |
| P5 | **Experience isolation at the edge, sharing at the core** | Two worlds for customers; shared models/controllers/middleware behind. |
| P6 | **Simplest mechanism that is correct** *(new in v2)* | Radius over polygons, direct assignment over dispatch engines, formula over ML. Complexity must be earned by evidence. |

**The one genuinely new capability is geospatial** — and v2 reduces it to its simplest correct form: a distance check against a vendor's radius.

---

## 1. Overall System Architecture

### Current state (verified in codebase)
- Express + Mongoose monolith at `backend/src`; modules `admin`, `vendor`, `user`, `delivery`, `integrations`.
- Routes under `/api/{actor}/{resource}` plus public routes at `/api`.
- React SPA at `frontend/src` (`UserApp`, `Vendor`, `Admin`, `Delivery`, `shared`, token-based `theme`).
- Socket.io (`backend/src/socket.js`) with authenticated role rooms and `emitToRoom(room, event, data)`.

### Design: Experience as a first-class dimension

```
EXPERIENCE = 'marketplace' | 'quick_commerce'
```

```
Experience: marketplace          Experience: quick_commerce
  ├── channel: retail   (B2C)      └── (single channel in V1)
  └── channel: wholesale (B2B)
```

Carried as a discriminator on Vendor, Product, Category, Order, and as request-scoped `req.experience`.

**Why.** One code path for what is identical (auth, inventory, payment, commission, notifications); surgical divergence where behaviour must differ. Same shape as the shipped `sellingChannels` work.

**Alternatives.** (A) Separate microservice — rejected for V1; introducing the first service boundary alongside a new business line doubles risk. (B) Parallel collections — violates P1, doubles admin CRUD/bulk-upload/analytics. (C) Ad-hoc filtering per controller — rejected; a forgotten filter leaks Marketplace products into QC.

**Trade-off.** The failure mode is a forgotten filter. Mitigation is architectural, not disciplinary: one `resolveExperience` middleware plus a **shared query builder** all catalog reads go through (§17).

**Recommendation.** Discriminator + request context, enforced by the query builder and an isolation test.

---

## 2. Database Schema Changes

All additive, all defaulted (P2).

### 2.1 `Vendor.model.js`

```
sellingChannels: {
  retail:        { enabled: Boolean, default true  }   // existing
  wholesale:     { enabled: Boolean, default false }   // existing
  quickCommerce: { enabled: Boolean, default false }   // NEW
}

quickCommerceProfile: {                                 // NEW, all optional
  storeType:            'dark_store' | 'retail_outlet' | 'restaurant' | 'pharmacy'
  location:             { type: 'Point', coordinates: [lng, lat] }   // GeoJSON
  serviceRadiusKm:      Number (default 5, admin-capped)
  servicedPincodes:     [String]        // fallback when GPS denied
  preparationTimeMins:  Number (default 10)
  businessHours:        [{ day: 0-6, open: 'HH:mm', close: 'HH:mm', isClosed: Boolean }]

  availabilityStatus:   'open' | 'busy' | 'temporarily_closed' | 'offline'  (default 'open')
  busyExtraMins:        Number (default 10)   // added to ETA while 'busy'
  pausedUntil:          Date                  // auto-clears 'temporarily_closed'

  minOrderValue:        Number
  packagingFee:         Number
}
```

Indexes: `{ 'quickCommerceProfile.location': '2dsphere' }`, `{ 'sellingChannels.quickCommerce.enabled': 1, status: 1 }`.

**Availability states (v2 addition).** Binary open/closed loses real operational signal. Four states:

| State | Discoverable? | Orderable? | ETA effect |
|---|---|---|---|
| `open` | Yes | Yes | Normal |
| `busy` | Yes | Yes | **+`busyExtraMins`** |
| `temporarily_closed` | Yes (greyed, "opens at X") | No | — |
| `offline` | No | No | — |

**Why `busy` matters most.** Without it, an overloaded vendor's only options are to keep accepting orders it cannot meet (SLA breach) or go fully closed (lost revenue). `busy` is the pressure-release valve — it keeps the store earning while telling the customer the truth.

**Recommendation.** Derive one server-side `isCurrentlyOrderable` from `businessHours` + `availabilityStatus` + `pausedUntil`. Never let clients re-derive it (the pricing-parity lesson).

### 2.2 `Product.model.js`

```
retailEnabled:         Boolean (default true)    // existing
wholesaleEnabled:      Boolean (default false)   // existing
quickCommerceEnabled:  Boolean (default false)   // NEW

categoryId:              ObjectId → Category      // existing; marketplace tree
quickCommerceCategoryId: ObjectId → Category      // NEW; QC tree

quickCommerce: {                                  // NEW, all optional
  packSize:        String        // "500 ml", "1 kg"
  shelfLifeDays:   Number
  isPerishable:    Boolean
  maxOrderQty:     Number        // per-order cap (see §11)
  handlingNote:    String
}
```

Indexes: `{ quickCommerceEnabled: 1, isActive: 1 }`, `{ quickCommerceCategoryId: 1, isActive: 1 }`, `{ vendorId: 1, quickCommerceEnabled: 1 }`.

**Why a second category reference.** A dual-experience product genuinely belongs to two taxonomies — "Amul Milk 500ml" is `Groceries → Dairy → Milk` in QC but `Grocery & Staples` in Marketplace.

**Alternative.** Polymorphic `categories: [{ experience, categoryId }]` — more extensible, but breaks every existing `categoryId` query, populate, filter, and index for zero V1 benefit. **Rejected on backward-compatibility grounds; revisit only if a third experience appears.**

**Recommendation.** Two explicit fields, with a write-time check that each category's `experience` matches — mirroring the vendor-channel check already shipped for wholesale.

### 2.3 `Category.model.js`

```
experience: 'marketplace' | 'quick_commerce'   // NEW, default 'marketplace'
```

Existing schema is `{ name, slug, parentId, order, isActive }` — one tree via `parentId`. Adding `experience` makes it **a forest of two trees in one collection**.

Index: `{ experience: 1, parentId: 1, isActive: 1 }`.
**Invariant:** a child's `experience` must equal its parent's (controller + pre-save hook).

**Trade-off.** `slug` is currently unique collection-wide; two trees may want `/accessories`. **Recommendation:** compound unique `{ experience: 1, slug: 1 }` — the one non-additive index change, safe because it *loosens* a constraint (§28).

### 2.4 `Order.model.js`

```
experience: 'marketplace' | 'quick_commerce'  (default 'marketplace', indexed)
orderType:  'retail' | 'wholesale' | 'mixed'  (existing — marketplace semantics)

quickCommerce: {                               // NEW, QC orders only
  promisedEtaMinutes:  Number
  promisedAt:          Date
  etaBreakdown:        { prepMins, travelMins }
  acceptedAt:          Date
  preparedAt:          Date
  pickedUpAt:          Date
  customerLocation:    { type: 'Point', coordinates: [lng, lat] }
  deliveryDistanceKm:  Number
  packagingFee:        Number
  slaBreached:         Boolean (default false)
}
```

### 2.5 `DeliveryBoy.model.js`

```
currentLocation:  → migrate to GeoJSON Point + 2dsphere index (§27)
lastLocationAt:   Date                              // NEW — staleness detection
experiences:      ['marketplace'|'quick_commerce']  // NEW, default ['marketplace']
activeOrderId:    ObjectId → Order                  // NEW — single-active-order guard
```

**Existing gap.** `currentLocation` is `{ lat: Number, lng: Number }` — plain numbers, no GeoJSON, no 2dsphere index, therefore **not geo-queryable today**. Rider assignment requires converting it. This is the only breaking shape change in the module and needs a dual-write migration (§27).

### 2.6 New collections

**None.** *(v1 proposed `DeliveryZone`; removed in v2.)*

Everything reuses: Product, Vendor, Order, Category, Commission, Coupon, Notification, Settings, User, Admin, DeliveryBoy — plus the existing `Zipcode`/`City` collections for the pincode fallback (§13).

**Why zero new collections is worth protecting.** Every new collection carries admin CRUD, permissions, seed data, migrations, backups, and analytics joins. Radius-based serviceability needs none of it — a vendor's reach is fully described by a point and a number already on the Vendor document.

---

## 3. Collections — Final Inventory

| Collection | Change | Rationale |
|---|---|---|
| `Vendor` | +`sellingChannels.quickCommerce`, +`quickCommerceProfile`, +2dsphere index | Channel-pattern continuity |
| `Product` | +`quickCommerceEnabled`, +`quickCommerceCategoryId`, +`quickCommerce{}`, +3 indexes | One catalog (P1) |
| `Category` | +`experience`, compound slug index | Two trees, one collection |
| `Order` | +`experience`, +`quickCommerce{}` | One order pipeline |
| `DeliveryBoy` | GeoJSON migration, +`experiences`, +`activeOrderId` | Enables geo dispatch |
| `Settings` | +`features.quickCommerceEnabled`, +`quick_commerce` key | Existing k/v store |
| `Notification` | +type enum values | Enum extension |
| `Zipcode` / `City` | none | Reused for pincode fallback |
| `Commission`, `Coupon`, `User`, `Admin` | none | Fully reused |
| **New collections** | **0** | — |

---

## 4. Relationships

```
User ──1:N──> Order ──N:1──> Vendor ──1:N──> Product
                │                │               │
                │                │               ├──> Category (marketplace)
                │                │               └──> Category (quick_commerce)
                │                │
                │                └──> quickCommerceProfile.location (Point) + serviceRadiusKm
                │                          ⇅ distance check
                └──> DeliveryBoy ──> currentLocation (Point), activeOrderId
```

**Key decisions:**
- **Serviceability is computed, never stored.** A vendor's reach is `(point, radius)`; the customer relationship is a runtime distance comparison. Nothing to denormalise, nothing to drift.
- **Order → Vendor stays via `vendorItems[]`** even for single-vendor QC orders, so commission, vendor dashboards, and analytics need no special-casing.
- **Rider ↔ Order is 1:1 while active** (`activeOrderId`), which is what makes the simple assignment model safe (§10).

---

## 5. API Design

### 5.1 Experience resolution

```
Header:   X-Experience: quick_commerce | marketplace
Fallback: ?experience= query param
Default:  marketplace   (backward compatible)
```

`resolveExperience` middleware sets `req.experience` on public + user routes.

**Why a header over a URL prefix.** A prefix duplicates every route and controller — the duplication the requirements forbid. A header keeps one route, one controller, one validator, with filtering at the query layer.

**⚠️ Mandatory cache fix (correctness, not performance).** The response cache keys on `req.originalUrl` **only** (verified in `middlewares/responseCache.js`). With experience in a header, both experiences would share cache entries — Marketplace products surfacing in QC. **The `keyBuilder` must include experience before any QC read ships.** This is a one-line change, not geospatial complexity, and is non-negotiable.

**Geo endpoints are simply not cached** (v2 simplification, replacing geohash bucketing). Nearby/serviceability responses vary per coordinate; caching them either explodes the key space or serves wrong results. Not caching is simpler *and* safer, and these endpoints are index-backed and fast.

### 5.2 Route surface

| Endpoint | Status | Notes |
|---|---|---|
| `GET /api/products`, `/api/products/:id`, `/api/categories/all` | **Reused** | Filtered by `req.experience` |
| `POST /api/user/orders` | **Reused** | Branches on `experience` |
| `GET /api/vendor/products`, `POST/PUT /api/vendor/products` | **Reused** | Category options scoped by channels |
| `GET /api/quick/serviceability` | **NEW** | `?lat&lng` → `{ serviceable, vendorCount, etaRange }` |
| `GET /api/quick/vendors/nearby` | **NEW** | `$geoNear` vendor feed |
| `GET /api/quick/categories/feed` | **NEW** | Category-first home (§8) |
| `GET /api/quick/eta` | **NEW** | ETA preview for vendor + location |
| `GET /api/admin/analytics/quick-commerce` | **NEW** | Mirrors wholesale analytics pattern |
| `PATCH /api/delivery/location` | **NEW** | Rider location ping |
| `PUT /api/vendor/quick-commerce/settings` | **NEW** | Prep time, hours, radius, availability |

**~7 new endpoints** (zone CRUD removed). Any proposal for `/api/quick/products` should be rejected — that is the duplication this architecture exists to prevent.

---

## 6. Authentication & Authorization

**No new auth mechanism.** Existing JWT + `authenticate` + `authorize(role)` + `enforceAccountStatus` chain reused verbatim.

**Additions:**
- **Channel guard** on vendor endpoints — no `sellingChannels.quickCommerce.enabled`, no QC products or orders. Mirrors the shipped wholesale check.
- QC permissions for admin (§24).
- Experience guard for riders (`experiences` includes `quick_commerce`).

**Security note carried forward.** `toPublicVendor()` in `routes/public.routes.js` is now an **allowlist**, so every new `quickCommerceProfile` field is private by default. Opt in only: `storeType`, `preparationTimeMins`, `businessHours`, `availabilityStatus`, `minOrderValue`. **Never expose exact coordinates or `servicedPincodes`** — that publishes the entire store network to competitors. Return **distance** (a scalar), not position.

---

## 7. Vendor Flow

**Registration.** Extend the existing Selling Channels step (built for wholesale) with a third option. Selecting QC reveals: store type, address + **map pin**, service radius, prep time, business hours.

**Geocoding.** (A) Client-side geocode — fast, trusts client. (B) Server-side — authoritative, costs an API call. (C) Manual pin-drop with reverse-geocoded confirmation.
**Recommendation: (C) primary + (B) validation.** Pin-drop is most accurate for dark stores (often in unaddressed units); server-side reverse validation prevents pinning a location in a different city than the stated address.

**Product form.** Category dropdown shows only categories matching the vendor's enabled experiences. A both-experience vendor gets two category pickers — the same conditional-section pattern as the wholesale pricing editor.

**Operations dashboard (v2 — operational, not generic):**

| Widget | Why |
|---|---|
| **Today's Orders** | The only time window that matters in QC |
| **Preparing** | Live work queue |
| **Out for Delivery** | In-flight commitments |
| **Delivered** | Completed today |
| **Rejected** | Rejection rate is a health signal — high rejection means bad availability hygiene |
| **Average ETA (promised vs actual)** | The single best predictor of SLA breach |
| Availability control | Open / Busy / Temporarily Closed / Offline, one tap |

Plus a **Quick Orders** queue (separate tab from Marketplace Orders) with accept/reject and mark-prepared.

**Why these six.** A QC vendor's job is a real-time loop: accept → prepare → hand off. Lifetime revenue charts are Marketplace-dashboard thinking. These answer "what do I need to do in the next 10 minutes, and am I keeping my promises?"

---

## 8. Customer Flow

```
Landing / Experience Switcher
   ├── ⚡ Quick Commerce  → location → serviceability
   │                          ├── serviceable → QC home
   │                          └── not serviceable → "coming soon" + email capture
   └── 🛒 Marketplace     → existing flow, entirely unchanged
```

**Experience persistence.** Remember the last choice; always allow switching; never auto-redirect a returning Marketplace user into QC.

**Location cascade.** (1) Browser geolocation → (2) saved address with coordinates → (3) **manual pincode → `Zipcode`/`City` lookup → pincode serviceability** → (4) map pin. The pincode fallback matters because a meaningful share of users deny GPS; a GPS-only design makes QC unreachable for them.

### QC Homepage — category-first (v2 change)

The home surface leads with **categories**, not stores:

```
[ Milk ] [ Vegetables ] [ Fruits ] [ Bakery ]
[ Medicines ] [ Meat ] [ Snacks ] [ Cold Drinks ]

→ Reorder (your usuals)
→ Nearby Stores  (secondary section)
```

**Why.** QC intent is item-first ("I need milk"), not merchant-first ("what's near me?"). A store-first home forces the customer to guess which shop stocks their item.

**The architectural tension this creates — and how it is resolved.** Category browsing aggregates products across *all* nearby serviceable vendors. But a QC order must be single-vendor for a coherent ETA. Three options:

- **(A) Aggregate, then split into multiple orders at checkout.** Surprise splits, multiple fees, confusing tracking.
- **(B) Aggregate for discovery; pin the cart to the first vendor added.** Adding an item from another store prompts "Start a new cart with Store B?" (the Swiggy/Zomato model). Show "also available at…" for alternates.
- **(C) Store-first browsing.** Coherent but poor discovery.

**Recommendation: (B).** It delivers the category-first UX while keeping every order single-vendor **by construction** — which removes checkout split logic entirely (§18) rather than adding it. This is a simplification, not a compromise.

---

## 9. Admin Flow

| Area | Design |
|---|---|
| **Vendor Management** | Existing list + experience filter; approve QC capability separately from vendor approval; override radius / prep time |
| **Category Management** | Existing tree UI + experience switcher; two independent trees |
| **Serviceability Explorer** | Enter lat/lng or pincode → which vendors cover it, and why not if none. **Highest-value admin tool** — turns "why can't my customer order?" from a support escalation into a self-serve answer |
| **QC Analytics** | Orders, GMV, promised vs actual ETA, SLA breach %, top stores, coverage |
| **Settings & Flags** | Global QC on/off, default/max radius, average speed, rider timeout |
| **Permissions** | New `quickcommerce.*` tokens (§24) |

*Zone management removed in v2 — there are no zones.*

---

## 10. Delivery Flow

```
Order placed → assign nearest available rider → rider accepts
   → vendor prepares → pickup → en route (live tracking) → OTP → complete
```

### Assignment (v2 — simplified)

```
Riders where: isAvailable, experiences includes quick_commerce,
              activeOrderId is null, location within max pickup distance
→ sort by distance to vendor
→ assign the nearest
```

**One implementation note that is not added complexity:** perform the assign as a single `findOneAndUpdate` filtered on `{ activeOrderId: null, status: 'available' }`. That one query *is* "assign the nearest available rider" — it just does it without a race window. Two orders arriving in the same second would otherwise both pick the same rider. This is the same optimistic-guard pattern already used for stock decrement in `placeOrder`, so it is idiomatic here and costs nothing.

**Deferred to V2:** broadcast-and-accept, batched dispatch, route optimisation.

**Failure path (must be designed, not discovered).** No rider available → widen the search radius → retry → escalate to an admin queue → notify the customer of the delay. **An unassigned order must never silently stall.**

**Live tracking.** Rider `PATCH /api/delivery/location` (throttled, ~10–15s) → update `currentLocation` + `lastLocationAt` → `emitToRoom('order_' + orderId, 'rider_location', …)`. The customer's tracking page joins that room. **No new real-time infrastructure** — rooms and `emitToRoom` already exist.

---

## 11. Inventory Flow

> **Stated policy (explicit, as requested): inventory is a single shared pool across Marketplace and Quick Commerce. There is no reservation, no per-experience allocation, and no soft-hold. Stock is always re-validated server-side at checkout, inside the existing transaction, and decremented with an atomic optimistic guard. A cart never reserves stock.**

**Worked example.**

```
Product stock = 5
  Marketplace customer checks out 5  → transaction succeeds, stock = 0
  QC customer (2 already in cart)    → checkout re-validates → 0 available
                                     → rejected with "only 0 left", cart flagged
```

The QC customer's cart never held a claim on those units. This is correct behaviour, and it is the same guarantee the Marketplace already provides today.

**Why shared rather than reserved pools.** A single-location vendor has one physical shelf; modelling two pools would create phantom stock — units promised to QC that Marketplace cannot sell even when QC demand never materialises. Reservation systems also need expiry, release-on-abandonment, and reconciliation — a substantial subsystem built on a hypothesis.

**Alternative — reserved QC allocation.** Protects short-ETA promises, but requires the whole allocation subsystem above. **Rejected for V1.**

**The realistic failure mode, addressed cheaply.** One large Marketplace order draining a QC-critical SKU. Mitigated by the existing per-product `quickCommerce.maxOrderQty` cap, which bounds any single order's draw without any new machinery.

**Recommendation.** Shared pool + checkout re-validation + per-SKU cap. Revisit reservation only if operational data shows real contention — and even then, prefer low-stock alerts to vendors over an allocation engine.

**Reused entirely:** `stockQuantity`, the transactional decrement, the optimistic guard, and the low-stock/out-of-stock state derivation. No changes.

---

## 12. Nearby Vendor Detection

MongoDB `$geoNear` against the 2dsphere index on `Vendor.quickCommerceProfile.location`:

```
$geoNear: near=[customerLng, customerLat], distanceField='distanceMeters',
          maxDistance = <platform max radius>, spherical=true,
          query: { status:'approved', 'sellingChannels.quickCommerce.enabled': true }
→ $match: distanceMeters <= vendor's own serviceRadiusKm * 1000
→ $match: vendor currently orderable (derived, §2.1)
```

**Why the two-stage filter — a real subtlety.** `$geoNear`'s `maxDistance` is a single global value, but **each vendor has its own radius**. The pipeline must over-fetch to the platform maximum, then filter per-vendor. A naive single-radius query returns wrong results for vendors with smaller radii.

**Alternatives.** Geohash prefix matching (portable, less precise); PostGIS (better geo, wrong database); Redis GEO (fast, new infra + sync burden — **deferred to V2**).

**Recommendation: native `$geoNear`.** No new infrastructure, adequate well beyond current vendor counts.

**Trade-off.** `$geoNear` must be the **first pipeline stage**, which constrains composition with other filters and pagination. Budget for it — it is a common source of "why is this wrong/slow".

---

## 13. Delivery Radius Logic (v2 — simplified)

Serviceability resolves in four steps. **No polygons, no zones, no overlap rules, no priority ordering.**

```
1. Platform flag        → is QC enabled at all?
2. Vendor distance      → distance(customer, vendor) <= vendor.serviceRadiusKm ?
3. Vendor availability  → orderable? (business hours + availabilityStatus + pausedUntil)
4. Fallback (no GPS)    → is customer pincode in vendor.servicedPincodes ?
```

**Why radius-only is the right V1 choice.** Polygon serviceability is one of the hardest problems in the module: it needs a map-drawing admin tool, `$geoIntersects` queries, deterministic handling of overlaps and boundary points, and a zone-priority model — for an accuracy gain that is invisible to customers at launch scale. A circle is trivially explainable to vendors ("how far will you deliver?"), self-serve, and needs no tooling.

**What is genuinely lost.** Circles ignore geography — a river, highway, or one-way system can make a point 3 km away unreachable while a point 6 km away is easy. Vendors compensate by tuning their radius down, which is a blunt but workable instrument.

**Alternatives.** Per-vendor polygons (precise, needs drawing tooling — **V2**); admin operational zones (models rider coverage/hours — **V2**); pincode-only (simplest, but pincodes are large and coarse in metros).

**Recommendation.** Radius primary + pincode fallback. Both are already on the Vendor document; **neither requires a new collection.** Design the serviceability check behind a single service interface so polygon support can be added in V2 **without touching any caller.**

---

## 14. ETA Calculation (v2 — simplified)

```
ETA = preparationTime + travelTime
```

- `preparationTime` = vendor's `preparationTimeMins`, **plus `busyExtraMins` when `availabilityStatus === 'busy'`**.
- `travelTime` = distance ÷ configured average speed (a single platform-level setting).

**No zone buffers. No surge modelling. No traffic API. No ML.**

**Why so plain.** ETA accuracy is bounded by prep-time variance, which dominates travel-time error at short distances. A sophisticated travel model on top of a guessed prep time is false precision.

**Alternatives.** Routing API (accurate with live traffic — but per-call cost, added latency, and an external dependency in the checkout path); ML on historical data (best long-term, needs data that does not exist yet). **Both deferred to V2.**

**Two rules that must hold from day one:**

1. **One authoritative server-side implementation.** If the client previews an ETA it must call the same service or mirror it under a conformance test — the pricing-parity lesson. A customer shown "10 min" and promised 25 is the same class of trust failure as a price mismatch.
2. **Log promised vs actual from order #1.** This dataset is the prerequisite for any future ETA model, it is free to collect now, and it is **impossible to collect retroactively.**

**Where computed:** serviceability (range), category/product/store pages (estimate), cart (estimate), **checkout (authoritative — persisted to `order.quickCommerce.promisedEtaMinutes`)**.

---

## 15. Search Architecture

**V1: reuse the existing search** (Mongo text index + regex fallback on `name`/`tags`), adding two constraints:

1. **Experience scoping** — QC search returns only `quickCommerceEnabled` products.
2. **Serviceability scoping** — searching "milk" must only return products from vendors who can actually deliver here. Resolve nearby vendor IDs first, then constrain the text query to `vendorId ∈ nearbyVendorIds`.

**Why this is fast enough.** The nearby-vendor set is small (tens of vendors), so the `vendorId` constraint is highly selective.

**Deferred to V2:** Atlas Search / Elasticsearch, typo tolerance, faceting, per-zone precomputed catalogs.

**Recommendation.** Mongo text + geo pre-filter. Move to a search service only when catalog size or relevance complaints justify it.

---

## 16. Category Architecture

Two trees, one collection, discriminated by `experience` (§2.3).

- **Admin:** one tree component + experience switcher; no duplicated CRUD.
- **Vendor:** picker filtered to the vendor's enabled experiences.
- **Customer:** QC home renders `experience: 'quick_commerce'` roots as the primary navigation (§8).

**Why not shared/tagged categories.** The requirement is explicitly *separate* taxonomies; sharing nodes creates immediate ambiguity ("Snacks" under Groceries vs. a Marketplace tree) and lets the trees drift into each other.

**Migration.** All existing categories default to `marketplace` — the current tree is untouched. QC categories start empty and are **seeded by Admin**; auto-generating a grocery taxonomy would be guesswork.

---

## 17. Product Architecture

One collection, three channel flags, two category references (§2.2).

**The shared query builder is the load-bearing element of this design.** One helper constructs every catalog read:

```
buildCatalogFilter({ experience, nearbyVendorIds, ...filters })
```

It applies `isActive`, the correct experience flag, the correct category field, and — for QC — the serviceable-vendor constraint.

**Why this matters more than it looks.** The failure mode of a discriminator architecture is a forgotten filter. Centralising construction converts a discipline problem into a testable one.

**Recommendation.** Make it the only sanctioned path, and add a test asserting **no Marketplace-only product can ever appear in a QC response** — the architectural equivalent of the pricing-parity harness.

---

## 18. Order Architecture

One collection, discriminated by `experience`.

**QC orders are single-vendor by construction** — enforced at the **cart** level (§8/§19), not by splitting at checkout. Because the cart is pinned to one vendor, there is nothing to split, and no split logic to write. *(v1 proposed checkout-time splitting; v2 removes it entirely.)*

**Why single-vendor.** ETA, rider assignment, and preparation are all per-store concepts. A multi-vendor QC order has no coherent ETA, needs multi-pickup routing, and produces a confusing tracking UI.

**Status model.** Marketplace uses `pending → processing → shipped → delivered`. QC needs finer granularity:

```
placed → accepted → preparing → ready → picked_up → arriving → delivered
```

**Recommendation.** Extend the existing enum additively and map QC statuses onto the coarse Marketplace states for shared reporting — do **not** fork the status field.

**Reused unchanged:** idempotency keys, transactional creation, atomic stock decrement, commission insertion, coupon usage increment.

---

## 19. Cart Architecture

**Current state (verified):** there is **no backend Cart collection**. Cart is client-side Zustand persisted to `localStorage` (`cart-storage`), scoped by `ownerUserId`, with server-side re-pricing at checkout.

**Design: two independent, namespaced carts.**

```
cart-storage:marketplace
cart-storage:quick_commerce
```

**Why separate.** The experiences have incompatible fulfilment (different vendors, delivery models, ETAs, fees). A mixed cart cannot check out as one order, so allowing it only defers an error to checkout.

**Why not clear the other cart on switch.** Destroying a Marketplace basket because the user glanced at QC is hostile. Preserve both; show a per-experience badge count.

**QC-specific cart rules:**
- **Pinned to a single vendor** (§8). Adding from another store prompts to start a new cart.
- **Bound to the customer location** it was created against. If the address changes and the vendor becomes unserviceable, flag and re-validate — never silently check out.
- **Re-validated on open:** stock, vendor orderable, ETA refresh.

**Server-side cart deferred to V2.** Cross-device continuity and abandoned-cart recovery are real benefits, but the client-side cart works and is consistent with existing architecture.

---

## 20. Checkout Architecture

Reuse `placeOrder` with an experience branch. The existing sequence — idempotency → payment-method validation → per-item stock/variant/price resolution → coupon → shipping → transactional create → stock decrement → commission — is sound and **must not be forked**.

**QC additions inserted into that pipeline:**

1. **Serviceability re-validation** (authoritative; the client's check was a preview).
2. **Vendor orderable check** — reject with a clear reason if the store closed or went offline between cart and checkout.
3. **Stock re-validation** — unchanged existing behaviour, now explicitly documented as the anti-oversell guarantee (§11).
4. **ETA computation and persistence** — the promise is made here, atomically with the order.
5. **QC fee model** — distance-based delivery fee + packaging fee; **replaces** `calculateVendorShippingForGroups` for QC orders.
6. **Rider availability pre-check (advisory)** — if none available, warn or extend ETA rather than failing the order.

*(No order-splitting step — the cart is already single-vendor.)*

**Critical rule.** The server is authoritative for price, fee, **and** ETA. The client previews all three. Any checkout-time difference must surface as a clear, itemised change — never a silent adjustment.

**Coupons.** Reuse the existing engine; add optional `applicableExperiences` so promotions can target QC without a parallel system.

---

## 21. Analytics

Reuse the existing aggregation approach (`Order`/`Commission` pipelines) with `experience` added to `$match` — exactly as `orderType` was added for wholesale.

| Audience | Metrics |
|---|---|
| **Admin** | QC GMV, orders, AOV, **promised vs actual ETA**, SLA breach %, serviceability coverage, top stores, rider utilisation |
| **Vendor** | Today's orders, preparing, out for delivery, delivered, rejected, **average ETA (promised vs actual)**, accept/reject rate, peak hours, top SKUs |
| **Rider** | Deliveries, avg time, earnings, acceptance rate |

**The metric that matters most is promised vs actual ETA** — the leading indicator of QC health and the input to any future ETA model.

**Trade-off.** Live aggregation on the hot `Order` collection degrades with volume. **Recommendation:** live V1 (consistent with the existing codebase); pre-aggregated rollups when latency becomes visible. Do not pre-optimise.

---

## 22. Notifications

Extend the existing `Notification` model and `createNotification()` service — no new subsystem.

| Event | Recipient | Channel |
|---|---|---|
| New QC order | Vendor | Socket + push (**urgent — minutes count**) |
| Accepted / preparing / ready | Customer | Socket + push |
| Rider assigned / arriving | Customer | Socket + push |
| Delivery OTP | Customer | SMS / push |
| No rider available | Admin | Socket + dashboard alert |
| SLA breach | Admin | Dashboard alert |
| Vendor not responding | Admin | Escalation |

**Why urgency changes the design.** Marketplace notifications are informational; QC notifications are operational — a vendor who misses a new-order alert breaks the promise. **Recommendation:** sound/persistent UI for QC vendor alerts plus auto-escalation if unacknowledged within N seconds. This is a product requirement with an architectural consequence (acknowledgement tracking), not a cosmetic one.

---

## 23. Settings

Reuse the generic `Settings` key/value collection.

- `features.quickCommerceEnabled` — master flag (§25)
- `quick_commerce` key — default/max radius, average speed, rider search radius, rider timeout, max prep time, fee structure

**Why not a typed collection.** The k/v store already serves general/payment/features settings with working admin CRUD, caching, and public exposure. A typed collection buys schema validation at the cost of a parallel management surface.

**Trade-off.** `Mixed` means no schema enforcement. **Recommendation:** validate at the controller with Joi (the established pattern).

---

## 24. Permissions

Add to the **dual registry** — `backend/src/constants/permissions.js` **and** `frontend/src/modules/Admin/config/permissions.js`. A mismatch means a checkbox that grants nothing, or an endpoint no UI can reach.

```
quickcommerce.vendors.manage    → depends on vendors.view
quickcommerce.orders.manage     → depends on orders.view
quickcommerce.analytics.view    → depends on dashboard.view
quickcommerce.settings.manage   → depends on settings.view
```

*(`quickcommerce.zones.manage` removed — there are no zones.)*

**Recommendation:** add a parity test asserting the registries match. This bug class is invisible until an admin reports a non-functioning permission. `full_access` picks new tokens up automatically; **existing presets must not be silently widened.**

---

## 25. Feature Flags

| Layer | Flag | Effect |
|---|---|---|
| Platform | `features.quickCommerceEnabled` | Entire experience on/off |
| Vendor | `sellingChannels.quickCommerce.enabled` | Per-vendor |
| Vendor runtime | `availabilityStatus` / `pausedUntil` | Live operational control |
| Product | `quickCommerceEnabled` | Per-SKU |

*(Zone layer removed. City-by-city rollout is achieved by onboarding vendors in that city — vendors are the unit of geographic coverage.)*

**Recommendation.** Platform flag OFF must be **byte-identical** to today: no experience switcher, no QC routes reachable, no QC UI mounted — verified by test, as it was for wholesale.

---

## 26. Deployment Strategy

**V1: same monolith, same deployment.** No new services, no new datastore, no new collections.

**Sequence:**
1. Deploy schema additions + indexes (inert — flag off).
2. Build indexes **in the background** — a foreground 2dsphere build on a large collection will lock and cause an outage.
3. Deploy backend, flag OFF; verify zero behaviour change.
4. Deploy frontend, flag OFF.
5. Enable for internal test accounts.
6. Pilot: one city, a handful of vendors.
7. Progressive rollout by onboarding more vendors.

**Rollback.** Flag off (instant, no deploy) → code revert (no down-migration; additive fields are inert) → drop indexes only if problematic. The `DeliveryBoy` GeoJSON migration is the one step needing a documented reverse path (§27).

**Subdomain split (`quick.dwellmart.com`)** — deferred; revisit only if QC traffic harms Marketplace cache hit rates.

---

## 27. Migration Strategy

| Change | Type | Migration |
|---|---|---|
| Vendor/Product/Order/Category new fields | Additive, defaulted | **None required.** Optional backfill for index efficiency |
| Category `experience` | Additive, default `'marketplace'` | Backfill script (recommended, non-blocking) |
| Category slug index → compound | Index change | Drop + recreate; **loosens** a constraint, so safe |
| New indexes | Additive | **Background build, off-peak** |
| **`DeliveryBoy.currentLocation` → GeoJSON** | **Breaking shape change** | **Dual-write migration (below)** |

**The one risky migration.** `currentLocation` is `{lat, lng}` today; geo queries need `{ type:'Point', coordinates:[lng, lat] }`. **Note the axis reversal — `[lng, lat]` — the single most common source of silent geo bugs.**

1. Add a **new** field (`location`) alongside the old one — never mutate in place.
2. Dual-write both from the rider location endpoint.
3. Backfill historical rows.
4. Switch reads to the new field.
5. Drop the old field only after a full release cycle of stability.

No flag-day cutover; rollback stays trivial at every step.

---

## 28. Backward Compatibility Strategy

**The contract: with the flag off, DwellMart behaves exactly as it does today.**

| Guarantee | Mechanism |
|---|---|
| Existing vendors unaffected | `quickCommerce.enabled` defaults false |
| Existing products unaffected | `quickCommerceEnabled` defaults false |
| Existing categories unaffected | `experience` defaults `'marketplace'` |
| Existing orders remain valid | `experience` defaults `'marketplace'` |
| Existing API clients unaffected | Missing `X-Experience` → marketplace |
| Existing carts unaffected | Legacy `cart-storage` migrates to the marketplace namespace |
| No breaking response changes | Additive fields only |

**The one deliberate exception** is the Category slug index (unique → compound) — a constraint *relaxation*, so all existing data remains valid.

**Recommendation.** A regression suite asserting retail and wholesale flows are unchanged with the flag off — the approach that protected retail through five wholesale phases.

---

## 29. Performance Considerations

| Concern | Risk | Mitigation |
|---|---|---|
| **Cache key collision (experience in header)** | **High — correctness bug** | **Mandatory:** `keyBuilder` includes experience |
| Geo endpoint caching | Medium | **Do not cache** nearby/serviceability responses (v2 — replaces geohash bucketing) |
| `$geoNear` cost | Medium | 2dsphere index; cap `maxDistance`; limit results; must be first stage |
| Rider location writes | Medium | Throttle client-side (~10–15s); update latest position only; **no ping-history rows** |
| Socket fan-out | Low–Medium | Room-scoped emits (existing pattern); no broadcast |
| Analytics aggregation | Medium (grows) | Live V1; rollups later |
| Search geo pre-filter | Low–Medium | Small nearby-vendor sets keep `vendorId ∈ […]` selective |

**The cache collision deserves emphasis** — it is non-obvious, would pass code review, and fails in production as a *correctness* bug (wrong products in the wrong experience), not a slow page.

---

## 30. Security Considerations

| Risk | Mitigation |
|---|---|
| **Competitor scraping the store network** | `toPublicVendor` allowlist — never expose exact coordinates or `servicedPincodes`. Return **distance**, not position |
| **Customer location privacy** | Location is PII. Store only what is needed; define retention |
| **Rider location tracking** | Only during an active delivery; never off-shift. Explicit consent |
| **Order-tracking access control** | Tracking rooms authorised per order — a guessable `order_${id}` room must not leak a stranger's live rider position |
| **Geo query injection** | Validate/clamp lat/lng ranges; reject malformed GeoJSON |
| **Serviceability spoofing** | Server re-validates at checkout; client claims are advisory |
| **Fee/ETA tampering** | Server authoritative (§20) |
| **Permission drift** | Dual-registry parity test (§24) |

**The tracking-room authorisation point is the most easily overlooked.** Socket rooms are strings; without an ownership check, anyone who guesses an order ID can watch a rider's live location — a physical-safety issue, not merely a data leak.

---

## 31. Edge Cases

**Serviceability & location**
- GPS denied → pincode fallback; if that fails, a clear non-serviceable state
- Customer changes address after adding to cart → re-validate, flag cart
- Customer sits exactly on a radius boundary → deterministic comparison (`<=`)
- Vendor radius reduced while items are in a customer's cart

**Vendor**
- Goes `busy` between cart and checkout → ETA increases; surface the change, don't hide it
- Goes `offline`/`temporarily_closed` mid-cart → block checkout with a clear reason
- Disables QC channel with live orders → **existing orders must complete**
- Prep time changed mid-order → the promise is locked at checkout

**Order & delivery**
- No rider accepts → widen radius → admin escalation → customer notified
- Rider goes offline mid-delivery → reassignment path
- Customer unreachable at delivery → hold/return policy
- Item out of stock after placement → substitute/refund policy
- Cancellation after preparation started → who absorbs the cost (**a policy decision needing a schema field**)

**Data & platform**
- Product QC-enabled but vendor is not → must be invisible (validate on write, filter on read)
- Category deleted while products reference it
- Flag turned off with live QC orders → **hide entry points, never orphan committed orders**

---

## 32. Future Enhancements (V2+)

Everything deferred from v1, plus natural extensions. All **trigger-based, not date-based** — none should be built speculatively.

| Enhancement | Trigger |
|---|---|
| **Polygon delivery zones** | Radius proves too blunt (rivers/highways cause complaints) |
| **Zone priorities & overlap rules** | Multiple zones exist |
| **Rider broadcast-and-accept** | Rider rejection rate hurts assignment latency |
| **Batched dispatch / route optimisation** | Rider utilisation becomes the cost bottleneck |
| **Rider location history collection** | Audit/replay or dispute resolution needed |
| **ML-based ETA** | ~6 months of promised-vs-actual data |
| **Routing API integration** | ETA accuracy complaints |
| **Geohash caching / Redis GEO** | Vendor count or geo QPS makes `$geoNear` a bottleneck |
| **Server-side cart** | Evidenced cross-device usage |
| **Dedicated search service** | Catalog size or relevance complaints |
| **Scheduled QC delivery** | Customer demand for slots |
| **Subscriptions (daily milk)** | Recurring-order demand |
| **Live inventory sync (POS)** | Vendor integration demand |
| **Reserved QC stock allocation** | Evidenced contention (§11) |
| **Extracting QC to a service** | Independent scaling need |
| **Third experience** | Would justify the polymorphic `categories[]` refactor deferred in §2.2 |

---

## 33. Recommended Phase-wise Implementation Plan (6 phases)

Each phase is independently shippable behind the flag and ends with the Marketplace regression suite green.

### Phase 1 — Foundation
Feature flag · Experience concept + `resolveExperience` middleware · **cache `keyBuilder` fix** · Category `experience` + admin tree switcher · Vendor QC channel · Permissions (both registries)
**Risk:** Low. Unblocks everything.

### Phase 2 — Vendor Module
QC profile · Geocoding / map pin · 2dsphere index · Service radius · Business hours · Availability states (open/busy/temporarily closed/offline) · Product QC flag + QC category · Shared query builder · Admin QC approval
**Risk:** Geocoding accuracy; **filter leakage — needs the isolation test**.

### Phase 3 — Customer Module
Experience switcher · Location capture + pincode fallback · Serviceability API · `$geoNear` nearby vendors · **Category-first QC homepage** · Category/product browsing · Search (experience + geo scoped)
**Risk:** Highest technical risk in the module (geospatial correctness, the per-vendor radius two-stage filter).

### Phase 4 — Cart & Checkout
Namespaced QC cart · Vendor pinning · ETA service (prep + travel) · Checkout branch · Serviceability + orderable + **stock re-validation** · QC fee model · ETA persistence · QC status model
**Risk:** **Money path — highest business risk.**

### Phase 5 — Delivery
`DeliveryBoy` GeoJSON migration · Nearest-available rider assignment (atomic claim) · No-rider failure path · Live tracking rooms · Order status transitions · OTP delivery
**Risk:** The one breaking migration + assignment concurrency.

### Phase 6 — Analytics & Polish
QC analytics (admin + **operational vendor dashboard**) · Urgent vendor notifications + escalation · SLA tracking · Edge cases · Performance verification · Full test matrix · Pilot launch
**Risk:** Operational readiness.

**Dependencies:** 1 → 2 → 3 → 4 → 5 → 6. Phase 6 analytics can partially parallelise with 5.

**Recommendation.** Do not compress **Phase 3** (geospatial correctness) or **Phase 5** (concurrency + the breaking migration) — that is where an aggressive schedule produces production incidents. Phases 1–2 are mechanical extensions of patterns the team has executed five times.

---

## Appendix A — Key Recommendations

1. **Discriminator dimension, not parallel collections** — one Product, Order, Vendor, Category.
2. **Zero new collections.** Radius serviceability needs only fields already on Vendor.
3. **Shared query builder is mandatory** — the structural defence against experience leakage.
4. **Radius + pincode fallback only.** No polygons, no zones, no overlap rules in V1.
5. **Cart pinned to one vendor** — makes single-vendor orders structural and removes split logic entirely.
6. **Category-first QC homepage**; stores secondary.
7. **Shared inventory pool + checkout re-validation + per-SKU cap.** No reservation system.
8. **Four availability states**; `busy` adds to ETA rather than forcing a binary open/closed.
9. **ETA = prep + travel.** One authoritative service; log promised vs actual from order #1.
10. **Nearest available rider via a single atomic `findOneAndUpdate`** — the simple version, done without a race.
11. **Design the no-rider failure path explicitly.** Orders must never silently stall.
12. **Fix the response-cache `keyBuilder` before any QC read ships;** do not cache geo endpoints.
13. **`toPublicVendor` allowlist must never admit coordinates or serviced pincodes.**
14. **Authorise order-tracking socket rooms** — physical-safety issue.
15. **Dual permission registries in lockstep**, with a parity test.
16. **`DeliveryBoy` GeoJSON via dual-write**, never in place. Watch the `[lng, lat]` axis order.
17. **Flag off ⇒ byte-identical to today**, verified by test.
