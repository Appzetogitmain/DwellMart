Enterprise Technical AuditCodebase-verified10 Aug 2026

# DwellMart Production Readiness Audit

A full end-to-end review of the DwellMart multi-vendor commerce platform — 366 API routes, 50 data models, 379 React screens across four role applications — traced from UI through state, transport, controller, service, and database. Every finding below was confirmed by reading the implementation. Nothing was accepted on the word of a comment, a document, or a prior report.

**Not Production**
**Ready**Launch blocked

The platform is **architecturally ambitious and largely feature-complete** — the checkout splitter, reservation lifecycle, event bus, permission model, and refresh-token rotation are all genuine enterprise-grade designs. But the money path contains a defect that lets a customer set the price they pay, the production web server terminates no TLS, and the project's own release gate fails with fifteen regressions.

Eight P0 defects must close before any public launch. The most severe is not a hardening gap — it is a direct, exploitable path to free merchandise.

Readiness

**34/100**

Weighted across security, correctness, and operability

P0 Critical

**8**

Launch blockers

P1 High

**22**

Ship-quality defects

P2 Medium

**19**

Debt and hygiene

P3 Low

**7**

Polish

Release gate

**FAIL**

15 regressions in the repo's own suite

## 01Executive Summary

DwellMart is a three-experience commerce platform — B2C retail, B2B wholesale, and hyperlocal quick commerce — sharing one catalog, vendor, order, and delivery core, with four separate front-end applications (customer, vendor, delivery rider, admin). The code shows real engineering investment: a transactional order splitter, a three-phase inventory reservation lifecycle, an idempotency-guarded checkout session, a persistent retry queue, a permission token system with 40+ scopes, and an in-repo integration release gate.

That investment is unevenly distributed. Two parallel order-creation paths exist — a legacy one that is careful and a modern one that is not — and the frontend uses the unsafe one. The new path never recomputes prices from the database, never increments coupon usage, and never records commission at order time. Several safety nets built for it (the recovery worker, the admin alerting) contain query and schema errors that make them permanent no-ops.

Operationally, the deployment terminates no TLS, serves uploaded KYC documents without authentication, and does not route the upload path at all — meaning vendor and rider identity documents are simultaneously world-readable in principle and unreachable in practice. Two admin screens are pure theatre, persisting to `localStorage` and reporting success.

**Single most important finding**

**A customer can pay any amount they choose.** The checkout page spreads its local cart objects — including `price` — into the request body. Every downstream stage prefers that client value over the database price, and it becomes the amount sent to the payment gateway. Nothing in the validation pipeline compares the two. The chain is traced in full at P0-01.

## 02System Architecture Overview

Node/Express 4 + Mongoose 8 + Socket.IO on the backend; React 18 + Vite + Zustand + React Router 6 on the frontend. Deployed to a single nginx-fronted VM via pm2, with a Vercel-hosted alternate origin still whitelisted in CORS.

### Backend surface

| MountRouterGuardNotes |                      |                                            |                                                                  |
| --------------------- | -------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| /api                  | public.routes        | none                                       | 1,406 lines; catalog, vendors, coupons, campaigns, CMS, currency |
| /api/user             | user.routes          | authenticate + authorize('customer')       | auth, address, wishlist, review, order, checkout                 |
| /api/vendor           | vendor.routes        | + enforceAccountStatus + checkSubscription | 16 controllers                                                   |
| /api/admin            | admin.routes         | + requireAdmin + per-route permission      | 23 controllers, 40+ permission tokens                            |
| /api/delivery         | delivery.routes      | authorize('delivery')                      | rider ops, live location                                         |
| /api/quick            | quickCommerce.routes | feature flag only                          | serviceability, nearby, estimate                                 |
| /api/payments         | payment.routes       | **none**                                   | Cashfree session / verify / webhook                              |
| /api/integrations     | integration.routes   | partnerAuth (API key + scopes + IP)        | 3PL partner API                                                  |
| /api/support          | support.routes       | authenticate                               | conversations, attachments                                       |
| /api/v1/translate     | translationRoutes    | **none**                                   | proxies Google Cloud Translate                                   |

### Background workers

- **Quick Commerce SLA sweep** — escalation and breach detection.
- **Reservation sweep** (5 min) — releases expired inventory holds.
- **Retry queue worker** (60 s) — replays failed event-bus handlers from `FailedJob`.
- **Order recovery worker** (5 min) — *inert; see P0-05.*

All four run as in-process `setInterval` timers on a single pm2 instance, as do the rate limiter and the response cache. Horizontal scaling would duplicate every sweep and fragment both caches.

## 03Feature Inventory & Status

| FeatureBackendFrontendStatus             |                                                      |                                         |                 |
| ---------------------------------------- | ---------------------------------------------------- | --------------------------------------- | --------------- |
| Auth — customer / vendor / rider / admin | 4 auth controllers, bcrypt cost 12, rotating refresh | 4 scoped axios clients                  | **Full**        |
| Catalog browse, search, filters          | public.routes + catalogQuery.service                 | Home, Shop, Category, Search            | **Full**        |
| Retail checkout (COD)                    | checkout.controller → OrderSplitterEngine            | Checkout.jsx                            | **Broken**      |
| Retail checkout (online)                 | Cashfree session + webhook                           | Checkout.jsx                            | **Broken**      |
| Wholesale B2B marketplace                | pricingEngine tiers + MOQ                            | wholesale facets                        | **Broken**      |
| Quick Commerce ordering                  | geo, ETA, fee, rider assignment                      | QuickCommerceHome, tracking             | **Broken**      |
| Inventory reservation lifecycle          | InventoryReservationService                          | —                                       | **Partial**     |
| Coupons                                  | Coupon model, validate endpoint                      | Checkout coupon box                     | **Partial**     |
| Returns & refunds                        | ReturnRequest + admin/vendor review                  | 3 screens                               | **Partial**     |
| Commission & settlement                  | Commission, Settlement, payout request               | Earnings, WalletHistory, PayoutRequests | **Partial**     |
| Vendor subscriptions & billing           | plan / planSelection / subscriptionState             | onboarding wizard, renewal              | **Full**        |
| Push notifications (FCM)                 | firebase.service, DeviceToken, broadcast             | token registration                      | **Full**        |
| Live order tracking (sockets)            | authorized order rooms                               | tracking panel                          | **Partial**     |
| Support desk & live chat                 | SupportConversation + sockets                        | LiveChat, Support                       | **Partial**     |
| Bulk product import / export             | bulkUpload.service (1,055 lines)                     | admin + vendor                          | **Partial**     |
| Sub-admin RBAC                           | permission.middleware, activity log                  | SubAdmins, AdminRouteGuard              | **Partial**     |
| 3PL partner integration API              | API key, scopes, IP allowlist, audit log             | —                                       | **Full**        |
| Admin CMS (static pages)                 | Settings key/value                                   | policies/\*                             | **Partial**     |
| Admin “Content Management”               | **none**                                             | Content.jsx                             | **Placeholder** |
| Vendor Pickup Locations                  | **none** (model orphaned)                            | PickupLocations.jsx, 585 lines          | **Placeholder** |
| Product attributes / attribute sets      | **orphan models only**                               | —                                       | **Missing**     |
| City / Zipcode serviceability master     | **orphan models only**                               | —                                       | **Missing**     |
| Refund execution (gateway)               | **none** — status fields only                        | RefundReports (read-only)               | **Missing**     |

## 04P0 — Launch Blockers

**P0-01**

### Customer-controlled item price becomes the amount charged

The checkout screen spreads raw cart objects into the request body. Every downstream stage prefers `item.price` over `product.price`, and the result becomes the `order_amount` sent to Cashfree and the persisted `Order.total`. **The cart validation pipeline never compares the submitted price to the database price.** Setting `price: 1` on a ₹40,000 item buys it for ₹1.

Traced chain — all eight hops verified1. **frontend/src/modules/UserApp/pages/Checkout.jsx:595** — `items.map(item => ({ ...item, productId: … }))` spreads client `price`
2. **backend/src/modules/user/controllers/checkout.controller.js:131** — passed to `calculateCheckoutSessionSummary`
3. **backend/src/services/checkout/OrderSplitterEngine.js:167** — `const basePrice = Number(item.price ?? product?.price ?? 0)`
4. **backend/src/services/pricingEngine.service.js:71,76** — retail path returns `unitPrice = safeBasePrice` unchanged
5. **checkout.controller.js:148** — stored as `session.summary.grandTotal`
6. **backend/src/modules/payment/controllers/cashfree.controller.js:46** — `amount = roundMoney(session.summary.grandTotal)`
7. **OrderSplitterEngine.js:417–421** — written to `Order.subtotal / total`
8. **backend/src/services/checkout/CartValidationPipeline.js** — no price assertion anywhere in 257 lines

The legacy `POST /api/user/orders` path is *not* affected — it recomputes from the DB and its comment says so explicitly. The frontend does not use it.

**P0-02**

### `ReferenceError` crashes every Quick Commerce order on the legacy path

`distanceKm` is read and assigned inside the Quick Commerce pre-flight block but is never declared anywhere in the 1,229-line module. In an ES module (strict mode) this is an unconditional `ReferenceError`, surfacing as a 500. The line above it computes `vendorPoint`, which is then never used — the distance calculation was evidently deleted and its consumers left behind.

Evidence**backend/src/modules/user/controllers/order.controller.js:398** — `const vendorPoint = pointToLatLng(…)` *(assigned, never read)*
**:402** — `if (!Number.isFinite(distanceKm) || distanceKm > radiusKm)`
**:411, :559, :573, :646** — four further reads
`grep -n "distanceKm" order.controller.js` → 5 uses, **0 declarations**

**P0-03**

### Production nginx terminates no TLS

The only server block listens on port 80 with no `listen 443 ssl`, no certificate directives, and no redirect. Every JWT, refresh token, password, payment session ID, and shipping address crosses the network in cleartext. Session cookies are not the exposure — the tokens live in `localStorage` and travel in an `Authorization` header on every request.

Evidence**nginx/dwellmart.conf:2–3** — `listen 80; listen [::]:80;` — the file's only listeners
No `ssl_certificate`, no `return 301 https://…`, no HSTS header

**P0-04**

### Duplicate order creation — verify and webhook race each other

On a successful payment two independent code paths call `splitAndCreateOrders`: the browser's return-URL `verify` call and Cashfree's server-to-server webhook. Both guard on `status !== 'completed'`, but the status is only written *after* the splitter finishes. There is no atomic compare-and-set and no unique constraint on the session's completion. Concurrent arrival — the normal case, since the redirect and the webhook fire within the same second — produces two sets of orders, two ledgers, and a double stock commit.

Evidence**cashfree.controller.js:226** — `if (checkoutSession.status !== 'completed') { … splitAndCreateOrders(…) }`
**cashfree.controller.js:351** — `if (session.status === 'completed') return;` then the same call
Status set to `'completed'` only at **:243** and **:382**, after the splitter returns

**P0-05**

### The paid-but-no-order recovery worker can never match a session

The worker's query requires `'metadata.recoveryAttempts': { $lt: 3 }`. MongoDB comparison operators do not match documents where the field is absent, and sessions are created without it — `recoveryAttempts` is only ever written inside the catch block that the worker must first reach. The query therefore returns the empty set forever. **The entire safety net for “payment captured, order creation failed” is inert.**

Its admin alerting is independently broken: `createNotification` is called with `role:` instead of `recipientType:`, omits the required `recipientId`, and passes `type: 'system_alert'`, which is not in the schema enum. All three failures are swallowed by `.catch(() => null)`.

Evidence**backend/src/services/checkout/OrderRecoveryWorker.js:173** — `'metadata.recoveryAttempts': { $lt: MAX_RECOVERY_ATTEMPTS }`
**checkout.controller.js:151–156** — session `metadata` written as `{ items, coupon, customerLocation, shippingOption }`
**OrderRecoveryWorker.js:56, 113, 142** — `createNotification({ role: 'admin', type: 'system_alert', … })`
**backend/src/models/Notification.model.js:6** — `recipientId … required: true`; **:33** enum excludes `system_alert`

**P0-06**

### Payment endpoints are entirely unauthenticated

`payment.routes.js` mounts all three Cashfree handlers with no `authenticate` middleware. `POST /api/payments/cashfree/verify` accepts any session or order identifier and returns the **full CheckoutSession document and its orders** — shipping address, customer name, email, phone, line items, totals — to an anonymous caller. It will also drive order creation for someone else's paid session. `createPaymentSession` likewise mints a gateway session against any session ID.

Evidence**backend/src/routes/payment.routes.js:10–12** — three `paymentRouter.post` calls, no guard
**cashfree.controller.js:248, 256, 267** — responses embed `checkoutSession` and `orders` verbatim
Session IDs appear in the browser's return URL: `/order-confirmation/{sessionId}`

**P0-07**

### Stored XSS from admin-editable pages into every visitor, including admins

Static page content and the vendor terms document are stored as raw HTML with no sanitisation on write, and rendered with `dangerouslySetInnerHTML` with no sanitisation on read. `formatContent` explicitly returns markup untouched when it detects a tag. Neither `dompurify` nor `sanitize-html` appears in either package manifest. Any account with `settings.edit` can plant a payload on eight public pages; admins browse the same origin with `adminToken` in `localStorage`, so this escalates a sub-admin to super-admin.

Evidence**backend/src/modules/admin/controllers/staticPages.controller.js:38** — `value: { title, content: String(content).trim() }`
**backend/src/modules/admin/controllers/termsAndConditions.controller.js:26** — same pattern
**frontend/src/modules/UserApp/pages/StaticPage.jsx:19–23** — `if (/<[a-z][\s\S]*>/i.test(content)) return content;`
**StaticPage.jsx:125**, **Vendor/pages/Register.jsx:1215**, **SubscriptionOnboardingWizard.jsx:976** — three unsanitised sinks

**P0-08**

### The repository's own release gate fails

`npm test` runs an integration gate that the project itself defines as the definition of done. It reports **GATE FAILED** with fifteen regressions across three suites. Wholesale MOQ enforcement does not reject below-minimum orders and prices every line at retail; the entire Quick Commerce lifecycle fails at serviceability; and an authorization assertion catches Quick Commerce fee configuration being publicly readable. A sixteenth failure is in the harness itself — a test references gap `FLOW-3`, which is not registered.

Verbatim gate outputFAIL — a wholesale-only product below MOQ is rejected at checkout → **HTTP 201 "Order placed successfully."**
FAIL — the line is priced as wholesale → **retail**
FAIL — the highest applicable tier wins at quantity 50 → **1000**
FAIL — the subtotal uses the tier price, not the base price → **50000**
FAIL — the seeded store makes the location serviceable → **vendorCount: 0**
FAIL — customer can place a Quick Commerce order → **HTTP 409 "… no longer available on Quick Commerce."**
FAIL — the entire downstream Quick Commerce lifecycle → **blockedByGap() referenced unknown gap "FLOW-3"**
FAIL — Quick Commerce fee configuration is not publicly readable → **HTTP 200**

Compounding this: `.gitignore` excludes `tests/`, so `git ls-files backend/tests` returns nothing. **The test suite is not in version control** — CI cannot run the gate that gates the release.

## 05P1 — High Severity

**P1-01**

### Expired reservation → orders created with no stock deduction

Retail holds expire after 15 minutes and the sweep releases them. A customer who lingers at the gateway past that window still triggers the webhook; `commitReservation` then finds no `status: 'reserved'` rows, logs a warning, and returns `0`. The splitter has no fallback deduction. Payment is captured, orders are created, and inventory is never decremented — silent oversell with no alert.

Evidence**InventoryReservationService.js:29–33** — `retail: 15` minute TTL
**:159–164** — `if (reservations.length === 0) { console.warn(…); return 0; }`
**OrderSplitterEngine.js:462** — `await commitReservation(sessionId, dbSession)`, return value discarded

**P1-02**

### No ownership check on checkout-session confirmation

`confirmCheckout` looks up the session by ID alone and never compares `session.userId` to `req.user.id` — unlike `getCheckoutSession` two functions below, which does. Any authenticated customer holding another customer's session ID creates orders from that cart, against that shipping address, attributed to themselves.

Evidence**checkout.controller.js:208** — `CheckoutSession.findOne({ sessionId })`, no user predicate
**:267** — the sibling read handler *does* check: `if (userId && String(session.userId) !== String(userId)) throw ApiError(403)`

**P1-03**

### Coupon discount resolves to `NaN` in the enterprise checkout

The session builder reads `couponDoc.type === 'percent'` and `couponDoc.discount`. The schema defines `type` as `'percentage' | 'fixed' | 'freeship'` and stores the amount in `value`. The percentage branch never matches, so every coupon falls through to `Math.min(undefined, cartTotal)` → `NaN`, which propagates into the discount actually applied. Minimum-order-value, `startsAt`, and usage-limit checks are also absent from this path.

Evidence**checkout.controller.js:103–105** — `couponDoc.type === 'percent' ? … : Math.min(couponDoc.discount, cartTotal)`
**backend/src/models/Coupon.model.js:8–9** — `enum: ['percentage','fixed','freeship']`, `value: Number` — no `discount` field

**P1-04**

### Coupon usage limits are unenforceable through the new checkout

`usedCount` is incremented only inside the legacy `placeOrder` transaction. The splitter never touches it. A single-use launch coupon can be redeemed an unlimited number of times by every customer.

Evidence`grep -rn "usedCount" backend/src` → increments only at **user/order.controller.js:769, :778**
**backend/src/services/coupon.service.js** contains a correct `incrementCouponUsage` — **imported by nothing**

**P1-05**

### Any authenticated socket can join any support conversation

`join_order_tracking` is carefully authorized against the order — the comment even explains why. `join_conversation`, three handlers above it, joins whatever room ID it is handed. Every support message, including admin replies, is broadcast to that room. Cross-tenant disclosure of support history to any logged-in customer.

Evidence**backend/src/socket.js:92–96** — ``socket.on('join_conversation', id => socket.join(`conversation_${id}`))``
**backend/src/socket.js:133–141** — `join_order_tracking` resolves membership via `resolveOrderRoom`
**backend/src/services/support.service.js:103, 187, 269, 320** — message payloads emitted to the room

**P1-06**

### Socket CORS omits the production domain

The HTTP CORS allowlist includes `https://dwellmart.in` and `https://www.dwellmart.in`. The Socket.IO allowlist does not. Unless `CLIENT_URL` happens to equal the exact origin the visitor used, every real-time feature — live tracking, chat, notification badges, vendor order alerts — fails the handshake in production. Apex and `www` cannot both be covered.

Evidence**backend/src/app.js:61–69** — includes both dwellmart.in origins
**backend/src/socket.js:46–52** — `[CLIENT_URL, 'https://dwell-mart-3u11.vercel.app', 'http://localhost:3000', ':5173', ':3001']`

**P1-07**

### Vendor KYC documents served without authentication

`/uploads/delivery-docs` is protected by an HMAC-signed, expiring token — a well-built control. The generic `express.static(uploadsRoot)` mounted immediately after it protects nothing else. Vendor registration documents (PAN, GST, incorporation papers) are written to `uploads/vendor_documents/` under that root and are readable by anyone who can guess the filename, which is `{Date.now()}-{sanitised original name}{ext}`.

Evidence**backend/src/app.js:110–122** — delivery-docs gate
**backend/src/app.js:124–133** — `express.static(uploadsRoot)`, blocks only `/delivery-docs/`
**backend/src/modules/vendor/controllers/auth.controller.js:108–115** — writes to `uploads/vendor_documents`
**backend/src/middlewares/upload.js:34–43** — filename scheme

**P1-08**

### nginx never routes `/uploads/` — all local documents 404 in production

The config proxies only `/api/` and `/socket.io/`. A request for `/uploads/vendor_documents/…` falls through to `try_files $uri $uri/ /index.html` and returns the SPA shell. Admins reviewing vendor or rider applications see broken documents; the delivery-doc token scheme is unreachable. Cloudinary-hosted product imagery is unaffected.

Evidence**nginx/dwellmart.conf** — `location /`, `location /api/`, `location /socket.io/` only

**P1-09**

### Every vendor shows zero products on the storefront

The vendor product-count aggregation filters on `isApproved: true` and `status: 'published'`. Neither field exists in the Product schema, and no controller or service ever writes them. The `$match` selects nothing, so `productCount` and `totalProducts` are always `0` on `/api/vendors`, `/api/vendors/all`, and `/api/vendors/best-sellers` — and `?hasProducts=true` filters out every vendor on the platform.

Evidence**backend/src/routes/public.routes.js:635–651** — `{ vendorId: {$in}, isApproved: true, status: 'published', … }`
**backend/src/models/Product.model.js** — 130 lines, no `isApproved`, no `status`
`grep -rn "isApproved" product.controller.js catalog.controller.js bulkUpload.service.js` → no matches

**P1-10**

### Wholesale-only products are invisible in the marketplace catalog

The shared catalog filter applies `retailEnabled: { $ne: false }` unconditionally on the marketplace branch. The adjacent comment says wholesale-only SKUs must be excluded *when the wholesale flag is off* — but the condition is not gated on the flag. Even with wholesale enabled and `?sellingChannel=wholesale` requested, only hybrid products surface. Pure B2B inventory cannot be browsed.

Evidence**backend/src/services/catalogQuery.service.js:62** — `filter.retailEnabled = { $ne: false };` outside any flag check
**public.routes.js:299–301** — the wholesale facet adds `wholesaleEnabled: true` on top, without relaxing the above

**P1-11**

### Bulk import loads the entire product collection to build an always-empty map

Import validation reads every product document in the database to construct an SKU lookup. `sku` is not a field in the Product schema, so the map is always empty and duplicate-SKU detection never fires — while the unbounded read remains, spiking heap on every validation run.

Evidence**backend/src/services/bulkUpload.service.js:301** — `Product.find({}, { sku: 1, … }).lean()` — no filter, no limit
**:303–305** — `if (p.sku) existingSkuMap.set(…)`
**backend/src/models/Product.model.js** — no `sku` path

**P1-12**

### Low-stock warning becomes a hard failure after payment is captured

Session creation validates with `strictMode: false`; the splitter validates with `strictMode: true`, which promotes warnings to errors. The pipeline warns when `stockQuantity < quantity × 1.5`. A cart that passes at session creation therefore throws at order creation whenever stock sits in that band — after the customer has paid.

Evidence**CartValidationPipeline.js:192–194** — `else if (product.stockQuantity < quantity * 1.5) warnings.push(…)`
**:223** — `valid: errors.length === 0 && (!strictMode || warnings.length === 0)`
**:244** — `assertCartValid` forces `strictMode: true`; **checkout.controller.js:81** does not

**P1-13**

### Two admin/vendor screens are placeholders that report success

**Vendor → Pickup Locations** (585 lines) reads and writes `localStorage` exclusively. It contains no API call of any kind. The `PickupLocation` model exists in the backend and is imported by nothing. Data is device-local, invisible to operations, and never consulted by shipping or fulfilment.

**Admin → Content Management** is worse: its save handler writes to `localStorage` and toasts “Content saved successfully”, but the component initialises from hardcoded literals and never reads that key back. The data is lost on reload even locally.

Evidence**frontend/src/modules/Vendor/pages/PickupLocations.jsx:35–38** — ``localStorage.getItem(`vendor-${vendorId}-pickup-locations`)``; zero `api.` references in the file
**frontend/src/modules/Admin/pages/Content.jsx:8–17** — `useState({ homepage: { heroTitle: 'Welcome to Our Store', … } })`
**Content.jsx:19–22** — `localStorage.setItem('admin-content', …); toast.success('Content saved successfully')` — no read path exists
`grep -rl "PickupLocation.model.js" backend/src` → 0 files

**P1-14**

### Seed script hardcodes super-admin credentials and resets them on every run

`seedAdmin.js` creates `admin@admin.com` with password `admin123`, and if the account already exists it *overwrites the password back* to that value and re-enables the account. Anyone with shell access, or any deploy hook that invokes it, silently restores a known super-admin credential.

Evidence**backend/src/scripts/seedAdmin.js:19–26** — `existing.password = 'admin123'; existing.role = 'superadmin'; existing.isActive = true;`
Siblings: `seedDelivery.js` → `delivery123`, `seedVendor.js` → `vendor123`

**P1-15**

### New Delhi coordinates hardcoded as the vendor-location fallback

When a Quick Commerce vendor has no stored geo-point, three separate call sites substitute `{ latitude: 28.6139, longitude: 77.2090 }`. Distance, delivery fee, ETA, and the free-delivery threshold are then computed from Connaught Place regardless of where the store actually is — producing plausible-looking but entirely fictional charges rather than an error.

Evidence**services/checkout/OrderSplitterEngine.js:106** · **routes/quickCommerce.routes.js:326** · **modules/user/controllers/order.controller.js:398**

**P1-16**

### Unbounded collection reads on operator-triggered endpoints

Several handlers load whole result sets into memory with no limit and aggregate in JavaScript. Push broadcast additionally assembles every recipient ID, issues one `$in` over that array, and passes the resulting token list to a single FCM multicast — which the API caps at 500 tokens per call.

Evidence**modules/admin/controllers/broadcastPush.controller.js:39, 47, 68** — `User.find(…)`, `Vendor.find(…)`, `DeliveryBoy.find(…)`, all unbounded
**modules/vendor/controllers/performance.controller.js:22** — every order the vendor has ever received
**modules/vendor/controllers/customer.controller.js:78, :172** — same pattern
**modules/vendor/controllers/order.controller.js:408** — `Commission.find({ vendorId })` for a summary

**P1-17**

### Commission ledgers diverge between the two order paths

The legacy path writes `Commission` rows inside the order transaction, at placement. The enterprise splitter writes none — records are backfilled by `ensureVendorCommissionsForOrder` only when a rider marks the order delivered. Vendors see no pending earnings for the entire order lifetime, and any finance report that aggregates commissions mixes two different accrual points.

Evidence**modules/user/controllers/order.controller.js:744–759** — `Commission.insertMany(commissionDocs, { session })`
**services/checkout/OrderSplitterEngine.js** — 654 lines, no `Commission` import
Backfill callers: **modules/delivery/controllers/order.controller.js:342**, **services/quickCommerceOrderStatus.service.js:130** — both on `delivered`

**P1-18**

### Commission rate carries two different units across the API

The database and the money math treat `commissionRate` as a percentage. The admin list serializer divides by 100 before returning it, and the update handler guesses the caller's intent with `parsedRate <= 1 ? parsedRate * 100 : parsedRate`. The heuristic is correct for the admin UI and wrong for any direct API caller: sending `0.5` to mean half a percent stores 50%. The Joi validator advertises `0–100` while the shipped client sends `0–1`.

Evidence**models/Vendor.model.js:38** — `commissionRate: { default: 10, min: 0, max: 100 }`
**modules/admin/controllers/vendor.controller.js:26** — `commissionRate: normalizedCommissionRate / 100`
**:275** — `const dbCommissionRate = parsedRate <= 1 ? parsedRate * 100 : parsedRate;`
**services/commission.service.js:83** — `(subtotal * commissionRate) / 100` (percentage semantics)

**P1-19**

### Mongoose session leaked on every successful checkout

`splitAndCreateOrders` calls `endSession()` only in its `catch` block. On the success path the session is committed and abandoned, holding a connection-pool slot until garbage collection. Under sustained checkout load this exhausts the pool. The legacy path gets this right with `finally`.

Evidence**OrderSplitterEngine.js:500** — `await dbSession.commitTransaction();` with no matching `endSession()`
**:526** — `await dbSession.endSession()` reachable only via `catch`
Contrast **modules/user/controllers/order.controller.js:798–800** — `finally { await session.endSession(); }`

**P1-20**

### Seven exported frontend service functions call routes that do not exist

Independently confirmed by the repository's own contract test, which tracks this as known gap `DEAD-1`. None is imported today, so there is no live impact — each is a guaranteed 404 waiting for its first caller.

Dead paths, per tests/integration/support/knownGaps.mjsGET /api/admin/settings · PUT /api/admin/settings
POST /api/admin/notifications/push · POST /api/admin/notifications/message
GET /api/admin/policies/\:param · PUT /api/admin/policies/\:param
PATCH /api/support/conversations/\:param/assign
**Sources:** Admin/services/adminService.js · shared/services/supportApi.js

**P1-21**

### High-value order alerts never reach an admin

The order-created handler notifies admins for orders over ₹5,000 with `recipientId: 'admin'` — a string where the schema requires an ObjectId. The cast fails, `Notification.create` rejects, and `.catch(() => null)` discards it. There is no fraud or high-value monitoring in effect.

Evidence**services/events/marketplaceEventBus.js** — `if (order.total >= 5000) createNotification({ recipientId: 'admin', … }).catch(() => null)`
**models/Notification.model.js:6** — `recipientId: { type: ObjectId, required: true }`
The ₹5,000 threshold is itself hardcoded, not configurable

**P1-22**

### Tax-inclusive products record zero tax on the order

The splitter's tax loop has an empty branch for tax-inclusive products — the comment says “extract it, don't add it again”, but no extraction is performed. `Order.tax` is therefore `0` for every inclusive line, while the legacy path correctly back-computes it. GST reporting built on `Order.tax` will under-report.

Evidence**OrderSplitterEngine.js:202–206** — `if (product.taxIncluded === true) { /* comment only */ } else { taxAddedToTotal += … }`
Contrast **modules/user/controllers/order.controller.js:490–494** — `const basePrice = itemSubtotal / (1 + rate/100); itemTax = itemSubtotal - basePrice;`

## 06P2 — Medium: Database, Security Hardening, Consistency

### Database & indexing

- **No compound index for the customer order list.** `Order.find({ userId }).sort({ createdAt: -1 })` has only a single-field `userId` index — Mongo must sort in memory and will abort past 32 MB for heavy accounts. `Order.model.js:118`; 15 compound indexes defined, none on `{ userId, createdAt }`.
- **Unused text index.** `Product.model.js:112` declares `{ name: 'text', description: 'text', tags: 'text' }`, but every search path uses escaped `RegExp` instead (`public.routes.js:316, 395`). Pure write amplification and index storage.
- **Index on a non-existent field.** `Product.model.js:116` — `{ wholesaleEnabled, isActive, isDeleted }`; `isDeleted` exists on `Order`, not `Product`.
- **Duplicate index declaration.** Mongoose warns at boot: `Duplicate schema index on {"vendorType":1}` — declared both inline and at `Vendor.model.js:260`.
- **Reserved path collision.** Mongoose warns `` `errors` is a reserved schema pathname `` — a model uses it as a field.
- **18 models declare zero explicit indexes**, including `Commission`, `Settlement`, `ReturnRequest`, and `User` (email only). `getVendorWithdrawableCommissions` queries `{ vendorId, status }` with no supporting compound index.
- **Six fully orphaned collections** — `Attribute`, `AttributeSet`, `AttributeValue`, `City`, `PickupLocation`, `Zipcode` — imported by no file in the codebase.
- **Settings is an unvalidated ****`Mixed`**** key/value store** holding feature flags, payment gateway credentials, and CMS HTML in one collection with one unique key. Category-level Joi schemas exist for writes but the stored shape is unconstrained.

### Security hardening

- **Gateway secrets stored in plaintext** in `Settings{key:'payment'}` and returned in full by `GET /api/admin/settings/:category` to any sub-admin holding `settings.view`. The *public* reader is correctly allowlisted (`constants/publicSettings.js` is a genuinely well-built control) — the admin reader is not scoped. `cashfree.service.js:11–17`.
- **Webhook replay window is unbounded.** `verifyCashfreeSignature` recomputes the HMAC over `timestamp + rawBody` but never checks that the timestamp is recent. A captured webhook replays indefinitely. `cashfree.service.js:147–161`.
- **Tokens in ****`localStorage`** for all four roles, access and refresh — directly exfiltratable by P0-07. `frontend/src/shared/utils/api.js:6–39`.
- **No account lockout and no admin MFA.** Only IP rate limiting (30 attempts / 15 min in production) stands between an attacker and unlimited credential stuffing against a known super-admin address. `middlewares/rateLimiter.js:12`.
- **Non-constant-time comparison** for the environment-configured integration partner: `clientId !== envClientId || apiKey !== envApiKey`. The database-backed path correctly uses `timingSafeEqual`. `partnerAuth.middleware.js:46–47`.
- **Global admin notification stream.** `clearAllNotifications` and `markAllAsRead` match on `recipientType: 'admin'` alone — one sub-admin clearing their inbox deletes every admin's notifications platform-wide. `notification.service.js:186, 228`.
- **Unauthenticated translation proxy.** `/api/v1/translate` is public by design and forwards to Google Cloud Translate — a metered third-party service billable to the platform, protected only by the shared API rate limit.
- **Minimum charge floor.** `order_amount: Math.max(Number(amount || 0), 1)` — a fully discounted ₹0 order still charges ₹1. `cashfree.service.js:51`.

### Contract & consistency

- **Experience enum diverges between tiers.** The frontend defines three experiences including `WHOLESALE`; the backend defines two. A client sending `X-Experience: wholesale` is silently normalised to `marketplace`, and two branches in `public.routes.js:541, 560` compare against `EXPERIENCES.WHOLESALE` — which is `undefined` — so the wholesale category feature-flag check is dead code that can never fire.
- **\~30 admin routes have no client-side permission guard.** `offers/*`, `promocodes`, `notifications/*`, `support/*`, `reports/*`, `finance/*`, `analytics`, `settings/*`, `policies/*`, `campaigns`, `banners`, `testimonials`, `reviews`, `content` render without `AdminRouteGuard` while their siblings use it. The backend still enforces permission, so this is a UX defect (a sub-admin reaches a screen that then 403s on every call), not a data leak. `App.jsx:614–678`.
- **Two order-creation paths with different semantics** — pricing source, commission timing, coupon accounting, and stock mechanism all differ. Maintaining both indefinitely guarantees further drift.
- **In-process rate limiter and response cache** (`Map`-backed) plus four `setInterval` workers make the backend single-instance-only. `middlewares/responseCache.js:7`.
- **Deploy script has no gate.** `git reset --hard`, `npm install` (not `ci`), no test run, `sudo rm -rf /var/www/dwellmart/*` before copying (a 404 window), no health check, no rollback. `deploy.sh`.

## 07Dead Code & Orphan Feature Report

| CategoryCountItems                      |    |                                                                                                                                       |
| --------------------------------------- | -- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Orphan Mongoose models                  | 6  | Attribute, AttributeSet, AttributeValue, City, PickupLocation, Zipcode                                                                |
| Unreferenced backend services           | 5  | coupon.service · stock.service · performanceMetrics.service · orders/QuickCommerceOrderService · quickCommerceEta.fixtures            |
| Debug scripts in production source root | 14 | backend/src/{verify\_\*.js ×7, check\_\*.js ×3, fix\_user\_address\_indore, update\_qc\_vendor\_indore, advance\_escrow\_period}      |
| Unused frontend components              | 8  | AnimatedComponent · BrandCard · CategoryCard · NotificationBadge · ReviewItem · SocialShare · OrderCardSkeleton · ProductCardSkeleton |
| Unused frontend stores / hooks          | 4  | productStore · supportStore · useAnimation · useResponsiveHeaderPadding                                                               |
| Unused design-system type files         | 8  | {Accordion,Breadcrumb,Dropdown,PageHeader,Pagination,Select,Tabs,TextArea}.types.js                                                   |
| Dead lazy imports in App.jsx            | 4  | ComingSoon · GeneralSettings · PaymentShippingSettings · ContentFeaturesSettings                                                      |
| Unreachable route declaration           | 1  | App.jsx:784 — second `path="chat"` redirect, shadowed by :768                                                                         |
| Dead frontend service functions (404s)  | 7  | tracked as DEAD-1 — see P1-20                                                                                                         |
| Dead conditional branches               | 2  | public.routes.js:541, :560 — `EXPERIENCES.WHOLESALE` is undefined                                                                     |
| Assigned-never-read variable            | 1  | order.controller.js:398 — `vendorPoint`, orphaned by P0-02                                                                            |

Stale documentation compounds this: `PERFORMANCE_REPORT.md`, `ERROR_CATALOG.md`, `wholesale_qa_report.md`, and `design_system_adoption_report.md` all assert states the code does not support — notably the wholesale QA report, against a wholesale suite that currently fails eight assertions.

## 08Hardcoded Value Report

| LocationValueWhy it is a problemSev                                                                           |                                         |                                                                                                                                   |        |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------ |
| OrderSplitterEngine.js:106<br>quickCommerce.routes.js:326<br>order.controller.js:398                          | 28.6139, 77.2090                        | New Delhi substituted for any vendor missing a geo-point; fees and ETAs computed from the wrong city instead of erroring          | **P1** |
| scripts/seedAdmin.js:19–35                                                                                    | admin\@admin.com / admin123             | Known super-admin credential, re-applied on every run                                                                             | **P1** |
| app.js:49 · admin/delivery.controller.js:17                                                                   | 'delivery-doc-secret'                   | Fallback HMAC key for document access tokens when `JWT_SECRET` is unset — a publicly known signing key                            | **P1** |
| marketplaceEventBus.js                                                                                        | order.total >= 5000                     | High-value alert threshold not configurable per market or currency                                                                | **P2** |
| app.js:63–65 · socket.js:48                                                                                   | dwell-mart-3u11.vercel.app              | A preview deployment permanently trusted by CORS in production                                                                    | **P2** |
| cashfree.controller.js:53–54, 106–107, 153                                                                    | customer\@dwellmart.com<br>9999999999   | Placeholder identity sent to the payment gateway when real data is missing; corrupts reconciliation and receipts                  | **P2** |
| public.routes.js:1166, 1274                                                                                   | support\@dwellmart.com                  | Final fallback recipient for contact and feedback mail; an unmonitored address silently absorbs enquiries                         | **P2** |
| public.routes.js:657                                                                                          | /test\|sptest\|qwerty\|qa\s\|audit\|…/i | Test-vendor suppression by name regex — a legitimate store named “Audit Supplies” is hidden from the storefront                   | **P2** |
| public.routes.js:1354–1361                                                                                    | 6-currency metadata table               | Currency list, symbols, and locales compiled into a route handler rather than configuration                                       | **P2** |
| order.controller.js:698                                                                                       | +5 days                                 | Estimated delivery date fixed for every marketplace order regardless of destination or vendor                                     | **P2** |
| order.controller.js:687–691                                                                                   | 24 h / 168 h windows                    | Return windows and allowed reasons compiled in, not admin-configurable                                                            | **P2** |
| InventoryReservationService.js:29–33                                                                          | 10 / 15 / 30 min                        | Reservation TTLs fixed; directly implicated in P1-01                                                                              | **P2** |
| settings.controller.js:17–33                                                                                  | Full DEFAULT\_GENERAL\_SETTINGS         | Store name, address, phone, and a 10% default commission seeded from code literals                                                | **P2** |
| Admin/components/ProductFormModal.jsx:71, 183, 243                                                            | taxRate: 18                             | GST rate defaulted in three places on the client, duplicating the backend default                                                 | **P2** |
| shared/services/socketService.js:33<br>shared/store/useNotificationStore.js:13<br>shared/utils/helpers.js:102 | http\://localhost:5000                  | Localhost fallbacks that ship to production if the env var is unset — failure is silent, not loud                                 | **P2** |
| quickCommerce.routes.js:325 · order.controller.js:400                                                         | DISABLE\_GEO\_FENCING → radius 10000 km | Non-production mode disables geo-fencing entirely; the guard is an env var one misconfiguration away from global “serviceability” | **P1** |

## 09UI/UX & Accessibility

- **Accessibility is largely absent.** Only 45 of 379 JSX files (12%) contain any `aria-*` attribute or explicit `role`. Icon-only controls, modals, and drawers are unlabelled. This is below the threshold for WCAG 2.1 AA and, for a consumer commerce platform in India, below the expectations of the Rights of Persons with Disabilities Act.
- **Fourteen data-fetching screens render no loading state**, including `UserApp/Checkout`, `UserApp/Home`, `Admin/Customers`, `Admin/Categories`, `Admin/Brands`, and `Vendor/Notifications` — they mount, fire a request, and show an empty layout until data lands.
- **Two purpose-built skeleton components are never imported** — `ProductCardSkeleton` and `OrderCardSkeleton` exist to solve exactly the problem above.
- **Double-submit protection is present and correct** on checkout (`isPlacingOrder` disables both CTAs) — worth noting as a positive.
- **Error handling is centralised and consistent.** The axios interceptor handles refresh-token rotation, silent background endpoints, scope-aware redirects, and a redirect lock to prevent loops. This is genuinely well-built.
- **The design system is real but unevenly adopted** — 30 primitives under `shared/components/ui`, while admin screens still use raw Tailwind with hardcoded `bg-white`/`text-gray-800` that will not respond to the theme provider.
- **Two screens actively mislead the operator** (P1-13) — the worst UX failure in the codebase is a success toast for an action that did not happen.

## 10Priority Matrix & Remediation Order

| IDFixEffortBlocks launch |                                                                                                                                                            |    |                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -- | ---------------- |
| P0-01                    | Ignore client `price` entirely — resolve every unit price from the DB inside `computeGroupPricing`; add a hard price assertion to `CartValidationPipeline` | S  | Yes              |
| P0-02                    | Restore the `haversineDistanceKm` call that `vendorPoint` was computed for                                                                                 | XS | Yes              |
| P0-03                    | Terminate TLS at nginx, 301 all of :80, enable HSTS                                                                                                        | XS | Yes              |
| P0-04                    | Make completion an atomic CAS: `updateOne({sessionId, status:{$ne:'completed'}}, {$set:{status:'processing'}})` and split only if `modifiedCount === 1`    | S  | Yes              |
| P0-05                    | Change the worker predicate to `$or: [{field: {$exists: false}}, {field: {$lt: 3}}]`; fix the three `createNotification` call shapes                       | XS | Yes              |
| P0-06                    | Require `authenticate` on session/verify; scope every lookup to `req.user.id`; strip order and session bodies from responses                               | S  | Yes              |
| P0-07                    | Sanitise on write (server-side allowlist) *and* on render; add a CSP                                                                                       | M  | Yes              |
| P0-08                    | Un-ignore `tests/`, commit it, wire the gate into CI, then close all fifteen regressions                                                                   | L  | Yes              |
| P1-01                    | Re-reserve or hard-fail when `commitReservation` returns 0; never create orders on a zero commit                                                           | M  | Yes              |
| P1-02 · 05 · 07          | Close the three authorization gaps: session ownership, socket room membership, upload access                                                               | S  | Yes              |
| P1-03 · 04               | Route all coupon logic through the existing `coupon.service.js`, which is already correct and already unused                                               | S  | Yes              |
| P1-06 · 08               | Align socket CORS with HTTP CORS; add a `location /uploads/` proxy block                                                                                   | XS | Yes              |
| P1-09 · 10 · 11          | Remove the three phantom-field filters (`isApproved`, `status`, `sku`); gate `retailEnabled` on the wholesale flag                                         | S  | Yes              |
| P1-13 · 14               | Remove or implement the two placeholder screens; delete the credential-resetting seed scripts                                                              | S  | Yes              |
| P1-12 · 15–22            | Remaining high-severity correctness and consistency defects                                                                                                | M  | Strongly advised |
| P2 group                 | Indexes, secret handling, replay window, lockout, dead-code removal, deploy gating                                                                         | L  | No               |
| P3 group                 | Accessibility pass, loading states, documentation reconciliation                                                                                           | L  | No               |

**Sequencing.** P0-08 first — restore the gate to version control and to CI, because it already detects the wholesale and Quick Commerce breakage and will regression-guard every fix that follows. Then P0-01 and P0-04 together, since both live in the checkout-to-payment seam. P0-03, P1-06, and P1-08 are single-file nginx and CORS edits and should ship immediately regardless of the rest.

## 11Final Verdict

The platform is closer to production than the defect count suggests, because the defects cluster. Most of the P0 and P1 findings sit in one seam — the newer enterprise checkout path and its supporting workers — while the surrounding system (permission model, refresh-token rotation, partner API, public settings allowlist, catalog query centralisation, socket order rooms, axios interceptor) is competently built and in several places better than typical for this class of application.

What blocks launch is not breadth of decay but severity of a small number of specific defects: a price the customer controls, a payment endpoint with no authentication, a transport with no encryption, a duplicate-order race on the happy path, a recovery worker that cannot execute, and a stored-XSS route from a sub-admin to super-admin. Each is individually sufficient to cause direct financial or data loss on day one.

The project's own release gate already knows the system is not ready. The most valuable single action is to put that gate back under version control and in front of every merge.

**Not Production**
**Ready**Readiness 34 / 100

**Estimated path to “Production Ready With Risks”:** close all 8 P0 items and the 12 launch-blocking P1 items. The nginx, CORS, and phantom-field fixes are hours of work; the checkout pricing, ordering race, and reservation-commit corrections are the substantial engineering.

**Estimated path to “Production Ready”:** the above, plus the remaining P1 set, the indexing work, secret handling, and a green release gate running in CI.

**Scope and method.** Static analysis of the working tree at `DwellMart/` — 37,632 lines of backend JavaScript and 109,677 lines of frontend JavaScript/JSX across 837 source files, plus nginx and deployment configuration. The integration release gate was executed against an isolated test database; its verbatim output is quoted in P0-08. Every finding cites the file and line that establishes it. No code was modified.

**Not covered.** Runtime behaviour under load, penetration testing against a live environment, production database contents, third-party service configuration (Cashfree merchant settings, Firebase project rules, Cloudinary access controls), and the compiled `frontend/dist` bundle. Findings are limited to what the source establishes; where exploitability depends on deployment state, that dependency is stated in the finding.