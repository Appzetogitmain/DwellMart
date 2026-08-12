# DwellMart — Full Application Enterprise Audit & Production Readiness Review

**Audit date:** 2026-08-12
**Scope:** `DwellMart/backend` (Node/Express/MongoDB, ~44k LOC in `src`) + `DwellMart/frontend` (React 18/Vite/Zustand, ~598 source files) + `nginx/`, `tests/`
**Method:** Direct source inspection. Every finding below cites a file and line. No prior audit report, README, or code comment was treated as evidence — several are demonstrably wrong and are flagged as such.
**Not executed:** The runtime test suites (`npm test`, `test:conformance`) were **not run**. They connect to the live `MONGO_URI` in `backend/.env` and several (`advance_escrow_period.js`, `fix_user_address_indore.js`, `clean_test_vendors.js`) mutate real data. Running them was out of scope for a read-only audit. All findings are therefore static-analysis-verified, not runtime-reproduced, except where a behaviour was proven with an isolated script (noted inline).

---

# Executive Summary

| Metric | Rating | Basis |
|---|---|---|
| **Application Completion** | **~72%** | Most modules exist end-to-end. Deductions: no money-refund pipeline, pickup locations fake, 12 unenforced permissions, 6 dead feature flags, dual conflicting order paths. |
| **Production Readiness** | **~35%** | Gated by 9 blockers, three of which are direct, unauthenticated revenue loss. |
| **Security Rating** | **🔴 Poor (3/10)** | Unauthenticated free subscription activation; unguarded catalog export/import router; IDOR on payment verify; 12 permissions defined but never enforced. |
| **Performance Rating** | **🟠 Fair (5/10)** | Good index coverage and `$facet` aggregation on hot paths, undermined by client-side full-table aggregation in 3 finance pages and a 500-product localStorage sync on every page load. |
| **Scalability Rating** | **🔴 Poor (3/10)** | In-memory rate limiter, in-memory socket.io adapter, in-memory background job registry, in-memory analytics cache. The application **cannot run more than one instance correctly**. |
| **Maintainability Rating** | **🟠 Fair (5/10)** | Clean module boundaries and genuinely good documentation in the newer services (rider wallet, integrations). Undermined by two parallel order-creation engines, two parallel support systems, ~30 dead files, and 13 one-off scripts in the production source tree. |
| **Technical Debt Rating** | **🔴 High** | Two full checkout implementations with divergent pricing; two support ticketing systems; three copies of the same test/seed scripts. |

**Headline:** the codebase contains a genuinely well-engineered core (the rider earnings ledger, the inventory reservation lifecycle, the integrations partner module, the Quick Commerce ETA engine) sitting alongside revenue-critical paths that are either unauthenticated, unreachable, or arithmetically wrong. It is not shippable in its current state, but the blockers are concentrated and individually small.

---

# Module By Module Audit

## 1. Authentication & Session Management

**Status:** ✅ Fully Implemented · **Implementation: 90%**

**Fully implemented:** Register/OTP-verify/login/refresh/logout for all four actor types ([user.routes.js:40-53](DwellMart/backend/src/modules/user/routes/user.routes.js#L40-L53), [vendor.routes.js:87-112](DwellMart/backend/src/modules/vendor/routes/vendor.routes.js#L87-L112), [delivery.routes.js:40-58](DwellMart/backend/src/modules/delivery/routes/delivery.routes.js#L40-L58), [admin.routes.js:132-135](DwellMart/backend/src/modules/admin/routes/admin.routes.js#L132-L135)). Forgot/reset password with OTP. Refresh-token rotation ([api.js:146-179](DwellMart/frontend/src/shared/utils/api.js#L146-L179)) with per-scope in-flight de-duplication — a genuinely correct implementation. `enforceAccountStatus` ([authorize.js:26-79](DwellMart/backend/src/middlewares/authorize.js#L26-L79)) re-reads account state on every protected request, so a suspended account cannot ride a valid token.

**Security findings:**
- Mock OTP is correctly production-gated: `process.env.NODE_ENV !== 'production' && USE_MOCK_OTP` ([otp.service.js:8](DwellMart/backend/src/services/otp.service.js#L8), [vendor/auth.controller.js:307](DwellMart/backend/src/modules/vendor/controllers/auth.controller.js#L307)). ✅ No issue.
- **`backend/.env` ships with `NODE_ENV=development`, `USE_MOCK_OTP=true`, `MOCK_OTP=123456`, `CASHFREE_ENV=sandbox`.** The file is correctly gitignored and untracked (verified with `git ls-files`), but the deployed default is wrong on every one of those axes.
- Tokens are stored in `localStorage` ([api.js:9-38](DwellMart/frontend/src/shared/utils/api.js#L9-L38)) — XSS-exfiltratable. Standard for this architecture; combined with the stored-XSS upload vector (§14) it becomes a real chain.
- `authLimiter` is 30 requests / 15 min **per IP** across all auth endpoints ([rateLimiter.js:13-19](DwellMart/backend/src/middlewares/rateLimiter.js#L13-L19)). No per-account lockout, so distributed credential stuffing against one account is unmitigated.

**Production readiness:** ⚠ Ready once `.env` defaults are corrected.

---

## 2. Vendor Subscriptions & Billing

**Status:** ⚠ **BROKEN — CRITICAL** · **Implementation: 60% (0% enforced)**

**The single worst finding in this audit.**

`POST /api/subscription/initiate` is registered with **no authentication middleware whatsoever**:

```js
// backend/src/routes/subscription.routes.js:15-17
subscriptionRouter.post('/select-plan', validate(selectPlanSchema), billingController.selectPlan);
subscriptionRouter.post('/initiate', validate(initiateOnboardingSubscriptionSchema), billingController.initiateOnboardingSubscription);
subscriptionRouter.post('/confirm', validate(confirmOnboardingPaymentSchema), billingController.confirmOnboardingPayment);
```

The handler takes an `email` + `selectedPlanId` from the request body and calls ([billing.controller.js:99-127](DwellMart/backend/src/modules/vendor/controllers/billing.controller.js#L99-L127)):

```js
const vendor = await Vendor.findOne({ email: normalizedEmail });
if (!vendor) throw new ApiError(404, 'Vendor not found.');
if (!vendor.isVerified) throw new ApiError(403, 'Please verify your email first.');
const { plan } = await resolvePlanSelection({ selectionToken, selectedPlanId: selectedPlanId || vendor.selectedPlan });
...
const internalSubscription = await activateInternalSubscription({ vendor, plan, gateway: 'internal' });
```

And `activateInternalSubscription` ([subscriptionState.service.js:79-118](DwellMart/backend/src/services/billing/subscriptionState.service.js#L79-L118)) unconditionally writes:

```js
status: 'active',
latestPaymentStatus: 'paid',
...
await upsertPaymentRecord({ ..., status: 'paid', ... });   // fabricates a paid Payment record
```

**There is no payment check anywhere in this path.** Plan IDs are publicly enumerable via `GET /api/subscription/plans` (also unauthenticated) and `GET /api/public/subscription-plans` ([public.routes.js:1117](DwellMart/backend/src/routes/public.routes.js#L1117)).

**The same bypass exists a second time**, authenticated but still free: `POST /api/vendor/subscription/change-plan` → [subscription.controller.js:97](DwellMart/backend/src/modules/vendor/controllers/subscription.controller.js#L97) calls `activateInternalSubscription` directly with no gateway interaction. Any vendor can self-upgrade to the top plan, forever, for ₹0.

The legitimate Cashfree subscription path exists ([cashfree.controller.js:166-209](DwellMart/backend/src/modules/payment/controllers/cashfree.controller.js#L166-L209)) and is fully bypassable.

**Also:** `POST /api/subscription/confirm` is unauthenticated and returns any vendor's full subscription object given only their email — account enumeration + business-data disclosure.

**Also:** `SubscriptionPlan.features` is `Schema.Types.Mixed` with no limit fields ([SubscriptionPlan.model.js:8-11](DwellMart/backend/src/models/SubscriptionPlan.model.js#L8-L11)). No plan tier gates product count, order volume, or any capability. Subscriptions are binary active/expired only — `checkSubscription` ([checkSubscription.js:16](DwellMart/backend/src/middlewares/checkSubscription.js#L16)) blocks non-GET when expired, and that is the entire enforcement surface. **Tiered pricing is decorative.**

**Production readiness:** 🚫 Blocker.

---

## 3. Checkout & Order Creation

**Status:** ⚠ Broken (two engines, one fatally, one financially) · **Implementation: 75%**

### 3a. Two parallel order-creation engines

| | Legacy | Enterprise |
|---|---|---|
| Entry | `POST /api/user/orders` → [order.controller.js:119](DwellMart/backend/src/modules/user/controllers/order.controller.js#L119) (1126 lines) | `POST /api/user/checkout/session` → `/confirm` → [OrderSplitterEngine.js](DwellMart/backend/src/services/checkout/OrderSplitterEngine.js) |
| Stock | Direct atomic `$inc` at order time, **ignores `reservedQuantity`** | `InventoryReservation` hold → commit |
| Used by UI | **No** — `orderStore.createOrder` is never called from any component (verified) | Yes ([Checkout.jsx:690](DwellMart/frontend/src/modules/UserApp/pages/Checkout.jsx#L690)) |
| Live API | **Yes** | Yes |

The legacy engine is unreachable from the UI but fully live as an API. It deducts stock without consulting `reservedQuantity`, so a product with `stockQuantity: 5, reservedQuantity: 5` (fully held by an in-flight checkout session) can still be sold through it → **guaranteed oversell across the two paths**.

### 3b. `ReferenceError` — Quick Commerce legacy checkout is a guaranteed 500

```js
// backend/src/modules/user/controllers/order.controller.js:295-308
const vendorPoint = pointToLatLng(vendor.quickCommerceProfile?.location) || { latitude: 28.6139, longitude: 77.2090 };
const isDevMode = process.env.NODE_ENV !== 'production' || process.env.DISABLE_GEO_FENCING === 'true';
const radiusKm = isDevMode ? 10000 : (Number(vendor.quickCommerceProfile?.serviceRadiusKm) || 25);
if (!Number.isFinite(distanceKm) || distanceKm > radiusKm) {   // ← distanceKm is UNDECLARED
    ...
}
quickCommerceContext.distanceKm = distanceKm;                   // ← and again here
```

`distanceKm` is declared nowhere in the file (verified by exhaustive grep — the only other occurrences are reads at lines 456, 470, 543). ES modules are strict mode, so this throws `ReferenceError: distanceKm is not defined` on **every** Quick Commerce order through this endpoint. `vendorPoint` is computed and never used, and the `haversineDistanceKm` import (line 27) is now dead — the distance calculation was clearly deleted and its consumers left behind.

### 3c. Wholesale feature flag read from a key that has no writer — **customer charged less than the orders record**

Two different flag sources are used inside the same checkout:

```js
// splitAndCreateOrders — the code that CREATES the orders
// OrderSplitterEngine.js:307
isWholesaleMarketplaceEnabled(),    // reads Settings{key:'features'}.wholesaleMarketplaceEnabled === true  → default FALSE

// calculateCheckoutSessionSummary — the code that computes the AMOUNT CHARGED
// OrderSplitterEngine.js:654-655
const wholesaleSettingsDoc = await Settings.findOne({ key: 'wholesale' }).lean();
const wholesaleEnabled = wholesaleSettingsDoc?.value?.enabled !== false;   // → default TRUE
```

`'wholesale'` is **not in `SETTINGS_CATEGORY_SCHEMAS`** ([settings.validator.js:91-100](DwellMart/backend/src/modules/admin/validators/settings.validator.js#L91-L100)), so `updateSettingsByCategory` rejects it, and grep confirms **zero writers** anywhere in `backend/src`, `backend/scripts`, or `tests`. The document can never exist → `wholesaleEnabled` is permanently `true` in the summary and permanently `false` (by default) in the splitter.

**Consequence:** for a wholesale-capable vendor with price tiers, `CheckoutSession.summary.grandTotal` (the amount sent to Cashfree, [cashfree.controller.js:84](DwellMart/backend/src/modules/payment/controllers/cashfree.controller.js#L84)) applies bulk-tier discounts that the created `Order.total` does not. The customer pays the discounted amount; the ledger records the undiscounted amount. The gateway-vs-session amount check at [cashfree.controller.js:274](DwellMart/backend/src/modules/payment/controllers/cashfree.controller.js#L274) compares summary↔gateway (both wrong together) and never fires. `assertPriceConsistency` at [OrderSplitterEngine.js:544](DwellMart/backend/src/services/checkout/OrderSplitterEngine.js#L544) compares splitter-internal values only, so it never fires either.

### 3d. `assertPriceConsistency` cannot block anything

[PriceReconciliationService.js:99-111](DwellMart/backend/src/services/PriceReconciliationService.js#L99-L111) — on mismatch it `console.error`s and returns `{isConsistent:false}`. Both call sites discard the return value. A detected price mismatch does not stop the order.

### 3e. Coupon discount recorded incorrectly on split orders

[OrderSplitterEngine.js:471-472](DwellMart/backend/src/services/checkout/OrderSplitterEngine.js#L471-L472):
```js
couponCode:     coupon?.code     || null,
couponDiscount: coupon?.discount || 0,   // ← FULL cart discount, on EVERY sub-order
```
The per-group proportional share (`fgCouponDiscount`, correctly computed at line 380) is written to the `FulfillmentGroup` and to `vendorItems[].discount`, but the top-level `Order.couponDiscount` gets the full cart amount. A 3-vendor split records 3× the actual discount. `Order.discount` is **never set at all** in `orderPayload` — so every splitter-created order has `discount: 0`, which is what the admin P&L report sums (§11).

`orderPayload.packagingFee` (line 460) is also silently dropped — `Order` has no top-level `packagingFee` field ([Order.model.js:156-160](DwellMart/backend/src/models/Order.model.js#L156-L160)) and Mongoose strict mode discards it.

### 3f. Post-commit code inside the transaction's `try`

[OrderSplitterEngine.js:541-587](DwellMart/backend/src/services/checkout/OrderSplitterEngine.js#L541-L587): `commitTransaction()` and `endSession()` run at 541-542, then event emission, commission creation, and the `return` all sit inside the same `try`. Any throw from a synchronous `marketplaceEventBus.emit` handler lands in the `catch` at 576, which calls `abortTransaction()` on an already-ended session — masking the real error behind a session error while the orders remain committed.

### 3g. `calculateCheckoutSessionSummary` computes everything twice

Lines 663-699 compute per-group pricing, then lines 705-727 **recompute the identical loop** to derive `grandTotalRaw`. For a Quick Commerce group that is 4× `computeGroupPricing` and 2× `buildQcDelivery` (each of which does its own `Settings.findOne` + geo math) per checkout.

**Production readiness:** 🚫 Blocker (3c, 3b).

---

## 4. Payments (Cashfree)

**Status:** 🟡 Partially Implemented · **Implementation: 65%**

**Well implemented:** Webhook HMAC verification with a 5-minute replay window and `timingSafeEqual` ([cashfree.service.js:166-199](DwellMart/backend/src/services/billing/cashfree.service.js#L166-L199)). Amount-mismatch detection on both the verify and webhook paths. `claimCheckoutSessionForProcessing` compare-and-set idempotency so verify and webhook cannot both create orders. Zero-amount orders correctly rejected rather than charged ₹1 ([cashfree.service.js:53-55](DwellMart/backend/src/services/billing/cashfree.service.js#L53-L55)).

**⚠ IDOR / PII disclosure — legacy order branch of `verifyPayment`:**
```js
// backend/src/modules/payment/controllers/cashfree.controller.js:380-393
const order = await Order.findOne({ orderId: targetId });
if (order) {
    const cfOrder = await fetchCashfreeOrder(targetId);
    ...
    return res.status(200).json(new ApiResponse(200, { verified: true, isPaid, order }, ...));
}
```
No ownership check. The route is `optionalAuth` ([payment.routes.js:12](DwellMart/backend/src/routes/payment.routes.js#L12)), so **any unauthenticated caller** who supplies an `orderId` receives the full order document — `shippingAddress` (name, phone, email, street address), all line items, and totals. `checkSessionOwnership` is applied to the CheckoutSession branch (line 257) but this branch was never given the same treatment. Order IDs are `ORD-{Date.now()}-{4 base36 chars}` ([generateOrderId.js:4-8](DwellMart/backend/src/utils/generateOrderId.js#L4-L8)) — 36⁴ ≈ 1.7M per millisecond-bucket, brute-forceable against a known order time.

**`createPaymentSession`** has the same gap for `orderId` (line 129) and `subscriptionPlanId + email` (line 166) — both unauthenticated, both leak existence via a 404.

**❌ Missing: there is no refund pipeline at all.** `cashfree.service.js` exports `createCashfreeOrder`, `fetchCashfreeOrder`, `fetchCashfreeOrderPayments`, `verifyCashfreeSignature` — and nothing else. Grep for refund across all of `backend/src` returns only enum values, permission constants, and DB flag assignments. The admin "refund" override:
```js
// backend/src/modules/admin/controllers/order.controller.js:542-546
} else if (action === 'refund' || action === 'return_to_store') {
    order.status = 'returned';
    if (order.quickCommerce) order.quickCommerce.status = 'delivery_failed';
    order.paymentStatus = 'refunded';
}
await order.save();
```
This flips a string. No gateway call, no ledger entry, no commission reversal, no rider-earning reversal, no stock restoration, no customer notification. The same is true of the return-request approval path ([vendor/return.controller.js:277](DwellMart/backend/src/modules/vendor/controllers/return.controller.js#L277)).

**Production readiness:** 🚫 Blocker (no refunds; IDOR).

---

## 5. Inventory & Stock

**Status:** 🟡 Partially Implemented · **Implementation: 70%**

**Well implemented:** The reservation lifecycle ([InventoryReservationService.js](DwellMart/backend/src/services/checkout/InventoryReservationService.js)) uses a conditional `$expr` filter on `findOneAndUpdate` so `stockQuantity - reservedQuantity >= qty` is checked atomically — no read-then-write window. Per-fulfilment-type TTLs, a 5-minute expiry sweep ([server.js:42-52](DwellMart/backend/src/server.js#L42-L52)), and a PATH-B recovery for expired holds.

**⚠ Reserved-stock leak on duplicate reservation:**
```js
// InventoryReservationService.js:109-121
try {
    const [saved] = await InventoryReservation.create([reservationDoc], ...);
    reservations.push(saved);
} catch (err) {
    if (err?.code === 11000) {
        reservations.push(reservationDoc);   // ← the $inc at line 81 already happened
    } else { ... }
}
```
On a duplicate-key collision (same session, same product), `reservedQuantity` has already been incremented a second time but only one reservation document exists. `releaseReservation` decrements by the document's quantity, so the extra hold is orphaned permanently — that stock becomes unsellable until manual correction.

**❌ Variant stock is never enforced at checkout.** `Product.variants.stockMap` exists ([Product.model.js:38](DwellMart/backend/src/models/Product.model.js#L38)) and the legacy path decrements it ([user/order.controller.js:603-616](DwellMart/backend/src/modules/user/controllers/order.controller.js#L603-L616)), but the enterprise path — `reserveStock` and `commitReservation` — operates on `stockQuantity` only. A vendor selling S/M/L can oversell one size indefinitely through the live checkout.

**❌ `Product` has no `sku` field.** The schema ([Product.model.js:3-104](DwellMart/backend/src/models/Product.model.js#L3-L104)) does not define `sku` or `costPrice`, yet `bulkUpload.service.js` queries `Product.find({ sku: { $in: fileSkus } })` (line 316), does `Product.findOne({ sku: row.sku.toLowerCase() })` (line ~718), and writes `sku`/`costPrice` in every `insertOne` document. **Verified empirically** with an isolated Mongoose script in this repo's `node_modules`: strict mode drops both fields (`keys: ['name','price','_id']`, `sku present: false`). Therefore:
- SKUs are never persisted.
- The duplicate-detection map is always empty → the "skip"/"update" duplicate modes never trigger.
- **Every bulk import re-creates the entire catalogue as new products.**

**❌ Phantom index:** `productSchema.index({ wholesaleEnabled: 1, isActive: 1, isDeleted: 1 })` ([Product.model.js:116](DwellMart/backend/src/models/Product.model.js#L116)) — `isDeleted` is not a Product field. Queries at [public.routes.js:641](DwellMart/backend/src/routes/public.routes.js#L641) and [:716](DwellMart/backend/src/routes/public.routes.js#L716) filter on it and always match everything.

**🔵 Stale comment:** [Order.model.js:383](DwellMart/backend/src/models/Order.model.js#L383) says *"isDeleted field does NOT exist in Order schema"* — it is defined 76 lines above at line 307. The comment is wrong; the field and its inline index are correct.

**Production readiness:** 🚫 Blocker (bulk import duplication, variant oversell).

---

## 6. Catalog, Search & Filters

**Status:** ✅ Fully Implemented · **Implementation: 88%**

**Well implemented:** `buildCatalogFilter` centralises experience routing so a Quick Commerce query cannot leak Marketplace stock. Regex metacharacters are escaped on every user-supplied search/brand/city/state term ([public.routes.js:213](DwellMart/backend/src/routes/public.routes.js#L213), [:264](DwellMart/backend/src/routes/public.routes.js#L264), [:316](DwellMart/backend/src/routes/public.routes.js#L316), [:726](DwellMart/backend/src/routes/public.routes.js#L726), [:747](DwellMart/backend/src/routes/public.routes.js#L747)) — ReDoS/injection correctly handled. Response caching with TTLs per surface. 16 indexes on `Product` covering the real query shapes.

**Findings:**
- **Test-vendor suppression is a hardcoded regex in production code:** `PUBLIC_TEST_VENDOR_REGEX = /test|sptest|qwerty|qa\s|audit|seeded|demo|dummy|sample|free\s*vendor|^sk\s*store|^sagar\s*store/i` ([public.routes.js:657](DwellMart/backend/src/routes/public.routes.js#L657), duplicated verbatim in [catalogData.js](DwellMart/frontend/src/modules/UserApp/data/catalogData.js) as `DUMMY_STORE_REGEX`). A legitimate seller named "Testa Furnishings" or "Sample House" is silently invisible on the storefront. This is a data-hygiene problem being papered over in the read path.
- **Quick Commerce serviceability silently falls back to "everyone":** [public.routes.js:238-241](DwellMart/backend/src/routes/public.routes.js#L238-L241) — when no location is supplied *or* no vendor is in range, the filter is replaced with **all verified vendors**, defeating the geo-fence the surrounding comment claims to enforce.
- `listProducts` runs `getActiveSaleProductIds()` (a full `Campaign` scan) plus `isWholesaleMarketplaceEnabled()` (a `Settings.findOne`) on every uncached request. `featureFlags.service.js` has **no caching** at all ([featureFlags.service.js:10-13](DwellMart/backend/src/services/featureFlags.service.js#L10-L13)).
- `filter.$or` is used for search (line 317) and again for vendor name matching (line 727) — a search term combined with a campaign exclusion overwrites `filter._id`, which is set at line 325. Ordering happens to work today but is fragile.

**Production readiness:** ⚠ Ready with risks.

---

## 7. Cart, Coupons & Pricing

**Status:** 🟡 Partially Implemented · **Implementation: 78%**

**Well implemented:** Price is always re-derived server-side from the DB; client-sent `item.price` is used only as a tamper *tripwire* ([OrderSplitterEngine.js:182-193](DwellMart/backend/src/services/checkout/OrderSplitterEngine.js#L182-L193)). Vendor ID is taken authoritatively from `Product.vendorId`, never from the cart payload ([OrderSplitterEngine.js:89](DwellMart/backend/src/services/checkout/OrderSplitterEngine.js#L89)). Tax-inclusive vs tax-exclusive is handled correctly and separately for reporting vs. total ([OrderSplitterEngine.js:222-255](DwellMart/backend/src/services/checkout/OrderSplitterEngine.js#L222-L255)). Coupon discount is capped at cart subtotal to prevent negative totals ([user/order.controller.js:424](DwellMart/backend/src/modules/user/controllers/order.controller.js#L424)).

**Findings:**
- **❌ No per-user coupon limit.** `Coupon` enforces only a global `usageLimit`/`usedCount` ([public.routes.js:904](DwellMart/backend/src/routes/public.routes.js#L904), [checkout.controller.js:106](DwellMart/backend/src/modules/user/controllers/checkout.controller.js#L106)). One customer can consume a "first order" coupon on every order until the global cap is hit.
- **⚠ Coupon usage increments are fire-and-forget on the enterprise path:** `incrementCouponUsage(coupon.code).catch(console.error)` ([checkout.controller.js:282](DwellMart/backend/src/modules/user/controllers/checkout.controller.js#L282), [cashfree.controller.js:322](DwellMart/backend/src/modules/payment/controllers/cashfree.controller.js#L322), [:514](DwellMart/backend/src/modules/payment/controllers/cashfree.controller.js#L514)) — outside the transaction, no retry. The legacy path does it correctly inside the transaction with a conditional `$lt` guard ([user/order.controller.js:659-679](DwellMart/backend/src/modules/user/controllers/order.controller.js#L659-L679)). The engine that is actually used has the weaker implementation.
- **⚠ Minimum-order-value failure is silent:** [checkout.controller.js:123-125](DwellMart/backend/src/modules/user/controllers/checkout.controller.js#L123-L125) logs a warning and drops the coupon without telling the customer, who then sees a total higher than the one the cart previewed.
- `POST /api/coupons/validate` ([public.routes.js:889](DwellMart/backend/src/routes/public.routes.js#L889)) is unauthenticated with no rate limit beyond the global 1500/15min — coupon-code brute-forcing is practical.

**Production readiness:** ⚠ Ready with risks.

---

## 8. Orders, Returns & Fulfilment

**Status:** 🟡 Partially Implemented · **Implementation: 70%**

**Well implemented:** Return requests are vendor-scoped with per-item quantity validation against the original order, duplicate-open-request guard, and correct experience-aware return windows ([user/order.controller.js:952-1088](DwellMart/backend/src/modules/user/controllers/order.controller.js#L952-L1088)). Delivery OTP is hashed, TTL'd, attempt-limited, and cleared on success ([delivery/order.controller.js:286-318](DwellMart/backend/src/modules/delivery/controllers/order.controller.js#L286-L318)). Server-side status transition guards ([:258-263](DwellMart/backend/src/modules/delivery/controllers/order.controller.js#L258-L263)).

**Findings:**
- **❌ A paid order cannot be cancelled by the customer.** `cancelOrder` allows only `['pending','processing']` ([user/order.controller.js:812](DwellMart/backend/src/modules/user/controllers/order.controller.js#L812)), but the splitter sets paid orders to `'confirmed'` ([OrderSplitterEngine.js:456](DwellMart/backend/src/services/checkout/OrderSplitterEngine.js#L456)). Every successfully-paid order is immediately uncancellable by its owner.
- **❌ Delivery OTP is email-only.** `sendDeliveryOtpEmail` returns false and logs a warning for an order with no customer email ([delivery/order.controller.js:277-283](DwellMart/backend/src/modules/delivery/controllers/order.controller.js#L277-L283)); the rider then cannot complete the delivery because the OTP is mandatory (line 288). No SMS fallback exists. Guest and phone-only orders are undeliverable.
- **⚠ `trackingNumber` is assigned at order creation**, before anything ships ([user/order.controller.js:594](DwellMart/backend/src/modules/user/controllers/order.controller.js#L594)).
- **⚠ Duplicate admin notifications:** `createReturnRequest` loops over every active admin creating one `Notification` each ([user/order.controller.js:1053-1069](DwellMart/backend/src/modules/user/controllers/order.controller.js#L1053-L1069)), but the admin feed matches on `recipientType:'admin'` alone regardless of `recipientId` ([admin/notification.controller.js:16-21](DwellMart/backend/src/modules/admin/controllers/notification.controller.js#L16-L21)). With 5 admins, every return request produces 5 identical rows in every admin's feed. The same pattern appears in [billing.controller.js:26-43](DwellMart/backend/src/modules/vendor/controllers/billing.controller.js#L26-L43).
- **⚠ Commission creation is fire-and-forget:** [OrderSplitterEngine.js:568-572](DwellMart/backend/src/services/checkout/OrderSplitterEngine.js#L568-L572) — if `ensureVendorCommissionsForOrder` throws, the error is logged and the vendor's earning record for that order never exists. No retry, no reconciliation job.
- **Hardcoded:** `estimatedDelivery = now + 5 days` ([:595](DwellMart/backend/src/modules/user/controllers/order.controller.js#L595)); return windows 24h/168h ([:585](DwellMart/backend/src/modules/user/controllers/order.controller.js#L585), [:960](DwellMart/backend/src/modules/user/controllers/order.controller.js#L960)); allowed return reasons ([:588](DwellMart/backend/src/modules/user/controllers/order.controller.js#L588)).

**Production readiness:** 🚫 Blocker (paid orders uncancellable; OTP undeliverable without email).

---

## 9. Quick Commerce

**Status:** ✅ Fully Implemented (design) / ⚠ Broken (two paths) · **Implementation: 80%**

**Well implemented:** A real ETA engine with prep + travel decomposition, distance-tiered delivery fees, per-vendor overrides layered on platform defaults (`resolveEffectiveQCSettings`), an SLA sweep, vendor acknowledgement tracking with admin escalation, and a rider-assignment service with explicit `escalated` state rather than inferring from a null rider. The `Order.quickCommerce` sub-document is thoughtfully designed — `cancelledAtStage` and `cancelledAfterPreparation` capture exactly the settlement question that matters ([Order.model.js:252-264](DwellMart/backend/src/models/Order.model.js#L252-L264)).

**Findings:**
- **⚠ Geo-fence is disabled unless `NODE_ENV === 'production'`:** `const isDevMode = process.env.NODE_ENV !== 'production' || process.env.DISABLE_GEO_FENCING === 'true'; const radiusKm = isDevMode ? 10000 : ...` ([quickCommerce.routes.js:328-329](DwellMart/backend/src/routes/quickCommerce.routes.js#L328-L329)). A 10,000 km service radius. With `.env` shipping `NODE_ENV=development`, this is off by default. `DISABLE_GEO_FENCING` remains a production escape hatch.
- **⚠ Hardcoded Delhi fallback coordinate:** `pointToLatLng(...) || { latitude: 28.6139, longitude: 77.2090 }` ([quickCommerce.routes.js:326](DwellMart/backend/src/routes/quickCommerce.routes.js#L326)). A vendor with no geo-point is silently treated as being in Delhi, producing a fabricated distance, fee, and ETA on the checkout estimate the customer sees. The splitter deliberately does the opposite — it returns `null` and disables QC delivery, with a comment explaining why ([OrderSplitterEngine.js:108-114](DwellMart/backend/src/services/checkout/OrderSplitterEngine.js#L108-L114)). **The two paths contradict each other**, so the estimate shown and the order created can differ.
- Legacy `placeOrder` carries the same hardcoded coordinate at [user/order.controller.js:295](DwellMart/backend/src/modules/user/controllers/order.controller.js#L295) (dead — see §3b).

**Production readiness:** ⚠ Ready with risks once §3b/§3c are fixed.

---

## 10. Vendor Portal

**Status:** 🟡 Partially Implemented · **Implementation: 72%**

**⚠ `productCapabilityGuard` is a complete no-op:**
```js
// backend/src/modules/vendor/middleware/productCapabilityGuard.js:29-31
const vendor = req.vendor;
if (!vendor) return next();   // ← always taken
```
Grep across the entire backend returns exactly one occurrence of `req.vendor` — this read. **Nothing ever assigns it.** `authenticate` sets `req.user`; `enforceAccountStatus` reads the vendor document but does not attach it. The middleware is mounted on three routes ([vendor.routes.js:125](DwellMart/backend/src/modules/vendor/routes/vendor.routes.js#L125), [:131](DwellMart/backend/src/modules/vendor/routes/vendor.routes.js#L131), [:132](DwellMart/backend/src/modules/vendor/routes/vendor.routes.js#L132)) and enforces nothing. The `PRODUCT_FIELD_STRICT` env variable it documents has no effect anywhere.

Mitigating: channel flags (`retailEnabled`/`wholesaleEnabled`/`quickCommerceEnabled`) *are* independently resolved from vendor capabilities in [product.controller.js:305-451](DwellMart/backend/src/modules/vendor/controllers/product.controller.js#L305-L451), so the most damaging case is covered. The field-level allowlist is not.

**❌ Pickup Locations is entirely fake.** [PickupLocations.jsx:32-73](DwellMart/frontend/src/modules/Vendor/pages/PickupLocations.jsx#L32-L73) reads and writes `localStorage.getItem('vendor-${vendorId}-pickup-locations')`. A `PickupLocation` Mongoose model exists ([PickupLocation.model.js](DwellMart/backend/src/models/PickupLocation.model.js)) and is **imported by zero files**. There is no API. The vendor configures pickup locations that exist only in that one browser profile and are lost on cache clear. Hardcoded defaults include `country: "USA"` and a Mon-Sat 09:00-18:00 schedule, on an INR/India platform.

**⚠ Payout request is not transactional and races:**
```js
// backend/src/modules/vendor/controllers/order.controller.js:522-535
const settlement = await Settlement.create({ ... commissionIds: eligibleCommissionIds, amount: withdrawableAmount, ... });
await Commission.updateMany({ _id: { $in: eligibleCommissionIds } }, { $set: { status: 'requested', settlementId: settlement._id } });
```
No session, no transaction, no compare-and-set. Two concurrent requests both read the same eligible set and both create a `Settlement` → **double payout**. Contrast with the rider withdrawal service (§13), which does this correctly with a partial unique index. Hardcoded `MINIMUM_PAYOUT = 500` at line 509.

**⚠ Vendor shipping revenue is never credited.** Commission is computed on `subtotal` only ([commission.service.js:81-82](DwellMart/backend/src/services/commission.service.js#L81-L82)), and `vendorEarnings = subtotal - commission`. The shipping the vendor charged and the platform collected is not paid out to them.

**⚠ `getVendorWithdrawableCommissions` loads every pending commission with a populate and filters in JS** ([commission.service.js:119-140](DwellMart/backend/src/services/commission.service.js#L119-L140)) — unbounded, N+1 on `orderId`. Hardcoded 7-day escrow at line 124. Hardcoded 10% default commission at [:14](DwellMart/backend/src/services/commission.service.js#L14), [:78](DwellMart/backend/src/services/commission.service.js#L78), and [user/order.controller.js:372](DwellMart/backend/src/modules/user/controllers/order.controller.js#L372).

**Production readiness:** 🚫 Blocker (payout race; fake pickup locations).

---

## 11. Admin Panel, Analytics & Reporting

**Status:** 🟡 Partially Implemented · **Implementation: 65%**

**Well implemented:** Dashboard stats use a single `$facet` aggregation with an invalidation-aware cache ([analytics.controller.js:32-67](DwellMart/backend/src/modules/admin/controllers/analytics.controller.js#L32-L67)). Wholesale and Quick Commerce analytics are computed from real order lines (`items.pricingType`), not estimated. Sub-admin management, activity logs, and vendor approval with mandatory `vendorType` are complete.

**⚠ The Profit & Loss report is arithmetically wrong.**
```js
// frontend/src/modules/Admin/pages/finance/ProfitLoss.jsx:66-73
const revenue = financialSummary.reduce((sum, item) => sum + item.revenue, 0);   // Σ Order.total
const grossProfit  = revenue - totalDiscount;
const totalExpenses = totalTax + totalDelivery + totalDiscount;
const netProfit    = revenue - totalExpenses;
```
`Order.total` **already includes** tax and shipping and is **already net of** discount ([OrderSplitterEngine.js:253-255](DwellMart/backend/src/services/checkout/OrderSplitterEngine.js#L253-L255)). Subtracting all three again double-counts every one of them. Compounding this: there is no COGS, no commission, and no vendor/rider payout in the calculation — for a marketplace the platform's income is the commission, not GMV. The number labelled "Net Profit" is not a profit by any definition.

**⚠ Revenue counts unpaid orders.** Every analytics aggregation matches on `{ isDeleted: {$ne:true}, status: {$ne:'cancelled'} }` and never on `paymentStatus` ([analytics.controller.js:76](DwellMart/backend/src/modules/admin/controllers/analytics.controller.js#L76), [:112](DwellMart/backend/src/modules/admin/controllers/analytics.controller.js#L112), [:165](DwellMart/backend/src/modules/admin/controllers/analytics.controller.js#L165), [:190](DwellMart/backend/src/modules/admin/controllers/analytics.controller.js#L190), [:240](DwellMart/backend/src/modules/admin/controllers/analytics.controller.js#L240)). Every pending COD order and every abandoned card order inflates reported revenue.

**⚠ Three finance pages paginate the entire dataset into the browser.** `TaxReports`, `PaymentBreakdown`, and `RefundReports` each run `while (page <= totalPages) { await getSalesReport({page, limit:200}) }` and aggregate client-side ([TaxReports.jsx:18-39](DwellMart/frontend/src/modules/Admin/pages/finance/TaxReports.jsx#L18-L39), [PaymentBreakdown.jsx:15-36](DwellMart/frontend/src/modules/Admin/pages/finance/PaymentBreakdown.jsx#L15-L36), [RefundReports.jsx:20-68](DwellMart/frontend/src/modules/Admin/pages/finance/RefundReports.jsx#L20-L68)). At 100k orders that is 500 sequential round-trips and a browser OOM. There is no server-side aggregation endpoint for any of them.

**❌ `Admin → Content` is a localStorage mock.** [Content.jsx:8-22](DwellMart/frontend/src/modules/Admin/pages/Content.jsx#L8-L22) initialises with placeholder strings (`'Welcome to Our Store'`, `'About us content...'`, `'Terms and conditions content...'`) and `handleSave` writes to `localStorage.setItem('admin-content', ...)`. It is routed at `/admin/content` and reachable from the sidebar. (The separate `/admin/policies/*` pages are real and correctly wired to `GET/PUT /api/admin/pages/:slug`.)

**⚠ IDOR on notification read:** `markAsRead` uses `Notification.findByIdAndUpdate(id, {isRead:true})` with **no recipient filter** ([admin/notification.controller.js:50-54](DwellMart/backend/src/modules/admin/controllers/notification.controller.js#L50-L54)). Any admin — or any sub-admin holding only `dashboard.view` — can mark any customer's, vendor's, or rider's notification as read. The service-layer equivalent does scope correctly ([notification.service.js:199-207](DwellMart/backend/src/services/notification.service.js#L199-L207)); this controller bypasses it.

**❌ Admin push notifications are never delivered.** `notifyAdmins` anchors `recipientId` to a related entity id or `new mongoose.Types.ObjectId()` ([notification.service.js:121-137](DwellMart/backend/src/services/notification.service.js#L121-L137)); `dispatchPushNotification` then queries `DeviceToken.find({ recipientId, recipientType })` ([push.service.js:11-15](DwellMart/backend/src/services/push.service.js#L11-L15)) and always returns `no_active_tokens`. The in-app record and socket broadcast work; FCM does not. This silently swallows the `OrderRecoveryWorker` alerts that say *"Customer may need manual refund"* ([OrderRecoveryWorker.js:60](DwellMart/backend/src/services/checkout/OrderRecoveryWorker.js#L60), [:144](DwellMart/backend/src/services/checkout/OrderRecoveryWorker.js#L144)).

**⚠ Period-over-period trend badges never render.** `StatsCards` reads `stats.revenueChange`/`ordersChange`/`productsChange`/`customersChange` ([StatsCards.jsx:11](DwellMart/frontend/src/modules/Admin/components/Analytics/StatsCards.jsx#L11), [:21](DwellMart/frontend/src/modules/Admin/components/Analytics/StatsCards.jsx#L21), [:31](DwellMart/frontend/src/modules/Admin/components/Analytics/StatsCards.jsx#L31), [:41](DwellMart/frontend/src/modules/Admin/components/Analytics/StatsCards.jsx#L41)) — grep confirms **no backend endpoint produces any of these fields**. Correctly guarded by `Number.isFinite` so nothing fake is shown; the feature is simply absent.

**Production readiness:** ⚠ Ready with risks (P&L must be corrected or removed before anyone acts on it).

---

## 12. Permissions & Feature Flags

**Status:** ⚠ Broken · **Implementation: 55%**

### 12a. Twelve permissions are assignable but enforced nowhere

Verified by grepping `PERMISSIONS.<TOKEN>` across all of `backend/src` excluding the constants file:

| Permission | Route enforcements |
|---|---|
| `SETTLEMENTS_VIEW` | **0** |
| `REFUNDS_VIEW` | **0** |
| `SLIDERS_VIEW` / `SLIDERS_EDIT` | **0** |
| `WHOLESALE_VENDORS_MANAGE` | **0** |
| `WHOLESALE_PRODUCTS_MANAGE` | **0** |
| `QUICKCOMMERCE_ORDERS_MANAGE` | **0** |
| `QUICKCOMMERCE_SETTINGS_MANAGE` | **0** |
| `VENDORS_DELETE` | **0** |
| `SUBADMIN_VIEW/CREATE/EDIT/DELETE` | **0** (superadmin-only routes are used instead) |
| `REPORTS_EXPORT` | **0** |

All 12 appear in the sub-admin creation UI and in `PRESET_ROLES` ([permissions.js:132-202](DwellMart/backend/src/constants/permissions.js#L132-L202)). The `finance` preset grants `SETTLEMENTS_VIEW` + `REFUNDS_VIEW`, which mean nothing. Two of them (`quickcommerce.orders.manage`, `quickcommerce.settings.manage`) gate **frontend routes** ([App.jsx:681](DwellMart/frontend/src/App.jsx#L681), [:685](DwellMart/frontend/src/App.jsx#L685)) whose backing APIs check a different permission — so the UI is hidden while the API stays open to anyone with `orders.view`/`settings.view`.

### 12b. Write actions gated behind read permissions

- `PUT /admin/settlements/:id/approve` and `/reject` → `WALLET_VIEW` ([admin.routes.js:410-411](DwellMart/backend/src/modules/admin/routes/admin.routes.js#L410-L411)). Approving a vendor payout requires only the *view* permission.
- `POST /admin/notifications/broadcast-push` → `DASHBOARD_VIEW` ([admin.routes.js:343](DwellMart/backend/src/modules/admin/routes/admin.routes.js#L343)). The lowest permission in the system authorises a push broadcast to the entire user base.
- All five Custom Message CRUD routes → `DASHBOARD_VIEW` ([admin.routes.js:346-350](DwellMart/backend/src/modules/admin/routes/admin.routes.js#L346-L350)).
- `POST /admin/uploads/image` → `adminAuth` only, no permission ([admin.routes.js:309](DwellMart/backend/src/modules/admin/routes/admin.routes.js#L309)).

### 12c. ~35 admin frontend routes have no `AdminRouteGuard`

`offers/*`, `promocodes`, `notifications/*`, `support`, `support/live-chat`, `support/ticket-types`, `support/tickets`, `reports/*`, all seven `finance/*`, `analytics`, all three `settings/*`, all nine `policies/*`, `campaigns`, `banners`, `testimonials`, `reviews`, `content` ([App.jsx:643-707](DwellMart/frontend/src/App.jsx#L643-L707)). Any authenticated sub-admin can navigate to every one. The backend still rejects the API calls, so this is a broken-UX and information-architecture problem rather than a data breach — but the permission model is not coherently applied.

### 12d. Six of eight storefront feature flags are dead

The admin UI exposes toggles for `wishlistEnabled`, `reviewsEnabled`, `flashSaleEnabled`, `dailyDealsEnabled`, `liveChatEnabled`, `couponCodesEnabled`, `wholesaleMarketplaceEnabled`, `quickCommerceEnabled` ([ContentFeaturesSettings.jsx:128-240](DwellMart/frontend/src/modules/Admin/pages/settings/ContentFeaturesSettings.jsx#L128-L240)). Grep for `features.*` consumption across the whole codebase returns only `quickCommerceEnabled` and `wholesaleMarketplaceEnabled`. **Turning off Wishlist, Reviews, Flash Sale, Daily Deals, Live Chat, or Coupon Codes does nothing.**

### 12e. The `reviews` settings block is triple-mismatched

- Validator defines `enabled`, `requirePurchase`, `autoPublish`, `maxRating`, `minRating` ([settings.validator.js:78-84](DwellMart/backend/src/modules/admin/validators/settings.validator.js#L78-L84)).
- The UI writes `moderationMode`, `purchaseRequired`, `displaySettings.{showAll,verifiedOnly,withPhotosOnly}` ([ContentFeaturesSettings.jsx:259-321](DwellMart/frontend/src/modules/Admin/pages/settings/ContentFeaturesSettings.jsx#L259-L321)) — different key names, accepted only because the schema is `.unknown(true)`.
- **No backend code reads any of them.** `addReview` hardcodes purchase verification and `isApproved: false` ([user/review.controller.js:32-44](DwellMart/backend/src/modules/user/controllers/review.controller.js#L32-L44)).

### 12f. The Content tab of that page saves nothing

`handleContentChange` mutates `contentData`, but `handleSubmit` writes only `features` and `reviews` ([ContentFeaturesSettings.jsx:69-71](DwellMart/frontend/src/modules/Admin/pages/settings/ContentFeaturesSettings.jsx#L69-L71)). `content` is not a writable settings category either.

**Production readiness:** 🚫 Blocker.

---

## 13. Delivery, Rider Wallet & COD Settlement

**Status:** ✅ Fully Implemented · **Implementation: 90% — the strongest module in the codebase**

`riderWithdrawal.service.js` is the model the rest of the application should follow: a three-layer duplicate-payout defence (partial unique index on open requests, compare-and-set status transitions, unique gateway-reference index), funds locked at request time rather than approval time, a COD interlock that blocks payout while the rider holds unremitted platform cash, a payout-details cooling-off period, and a daily velocity cap ([riderWithdrawal.service.js:1-200](DwellMart/backend/src/services/wallet/riderWithdrawal.service.js#L1-L200)). Policy is settings-driven with sane fallbacks. A dedicated `withdrawalLimiter` sits under it ([rateLimiter.js:29-35](DwellMart/backend/src/middlewares/rateLimiter.js#L29-L35)). A maturity worker moves PENDING → AVAILABLE, a drift report exists, and admin adjustment/reversal paths are audit-logged.

**Findings:**
- Payouts are **manual** — an admin marks paid with a UTR. There is no disbursement gateway integration. This appears intentional, not missing.
- `DEFAULT_WITHDRAWAL_POLICY` hardcodes ₹100 min / ₹25,000 max / 3 per day / 24h cooling-off / ₹2,000 COD interlock ([riderWithdrawal.service.js:37-44](DwellMart/backend/src/services/wallet/riderWithdrawal.service.js#L37-L44)) — but every one is settings-overridable, so these are correct defaults rather than hardcoded values.
- `/uploads/delivery-docs` is protected by an HMAC-signed, expiring token ([app.js:41-55](DwellMart/backend/src/app.js#L41-L55), [:113-124](DwellMart/backend/src/app.js#L113-L124)) with a correct length-check before `timingSafeEqual`. Good. **But** the HMAC falls back to the literal string `'delivery-doc-secret'` if `JWT_SECRET` is unset ([app.js:49](DwellMart/backend/src/app.js#L49)) — a known-key forgery vector, mitigated only by `validateEnv` requiring `JWT_SECRET`.

**Production readiness:** ✅ Ready.

---

## 14. Bulk Upload, File Handling & the Unguarded `/api/products` Router

**Status:** ⚠ **BROKEN — CRITICAL** · **Implementation: 50%**

`app.js:137` mounts `bulkUploadRoutes` at `/api/products`. Every route in that file carries **`authenticate` only** — no role check, no permission check, no subscription check ([bulkUpload.routes.js:17-32](DwellMart/backend/src/routes/bulkUpload.routes.js#L17-L32)). The controller does not compensate:

- **`GET /api/products/export`** → `exportProductsCatalog({user})` sets `query = {}` for any non-vendor role ([bulkUpload.service.js:996-1008](DwellMart/backend/src/services/bulkUpload.service.js#L996-L1008)) and populates `vendorId` with `email, storeName, name`. **Any authenticated customer or delivery rider downloads the entire platform catalogue — every product, every cost price, every vendor's email — as an XLSX.**
- **`GET /api/products/bulk-upload/history`** → same pattern ([bulkUpload.controller.js:147-153](DwellMart/backend/src/controllers/bulkUpload.controller.js#L147-L153)): non-vendor roles get an unfiltered query returning every vendor's import history with populated emails.
- **`GET /api/products/bulk-upload/job/:jobId`** and **`POST .../cancel`** have **no ownership check at all** ([bulkUpload.controller.js:129-142](DwellMart/backend/src/controllers/bulkUpload.controller.js#L129-L142)). Any authenticated user can read or **cancel any vendor's running import**.
- **`POST /api/products/bulk-upload/validate` / `/process`** → `startBulkUploadJob` takes `targetVendorId` **from the request body** ([bulkUpload.controller.js:117](DwellMart/backend/src/controllers/bulkUpload.controller.js#L117)) and assigns it when the caller is not a vendor ([bulkUpload.service.js:606](DwellMart/backend/src/services/bulkUpload.service.js#L606)). A customer can inject products into any vendor's catalogue.

**The frontend never calls this router** — the Admin UI uses `/admin/products/*` and the Vendor UI uses `/vendor/products/*`, both correctly guarded (verified in `adminService.js:93-124`, `vendorService.js:168-199`). This is 100% unused, unguarded, live attack surface that should simply be deleted.

**File upload security ([upload.js](DwellMart/backend/src/middlewares/upload.js)):** MIME allowlists and size limits are correct, and filenames are sanitised. **But the extension is preserved unvalidated** (`path.extname(file.originalname)`, line 36) while MIME is taken from the client-supplied `Content-Type`. A file named `payload.html` declared as `image/png` is written to `uploads/tmp/` and served by `express.static` at `/uploads/tmp/...` ([app.js:126-135](DwellMart/backend/src/app.js#L126-L135)) → **stored XSS on the application origin**, which pairs directly with the `localStorage` token storage in §1.

**Temp files are never swept.** Cleanup only runs after a successful Cloudinary upload ([upload.service.js:39-49](DwellMart/backend/src/services/upload.service.js#L39-L49)). `backend/uploads/tmp/` currently holds 5 orphaned files dated April, ~6.5 MB.

**PII is committed to the repository.** `git ls-files` returns 8 tracked files under `backend/public/uploads` and `backend/uploads`, including three copies of **a real person's résumé** uploaded as a trade licence and two more as delivery documents.

`uploadCSV` ([upload.js:114-124](DwellMart/backend/src/middlewares/upload.js#L114-L124)) is exported and never imported.

**Production readiness:** 🚫 Blocker.

---

## 15. Notifications, Support & Real-time

**Status:** ✅ Fully Implemented · **Implementation: 82%**

**Well implemented:** Socket authorisation is genuinely careful — `resolveOrderRoom` and `resolveConversationRoom` verify membership against the database before joining, rather than trusting the requested room name ([socket.js:12-71](DwellMart/backend/src/socket.js#L12-L71)). Notifications are unified across DB persistence, socket emission, and FCM push ([notification.service.js:12-103](DwellMart/backend/src/services/notification.service.js#L12-L103)). Support chat is wired end-to-end across all four modules.

**Findings:**
- **⚠ Typing indicators bypass room authorisation:** `socket.on('typing_start', ...)` emits to `conversation_${conversationId}` with no membership check ([socket.js:144-162](DwellMart/backend/src/socket.js#L144-L162)). `socket.to(room).emit()` reaches everyone in that room whether or not the sender belongs to it. Any authenticated user can inject typing events with an arbitrary display name into any conversation by guessing an ID. Low impact, but it is the one hole in an otherwise correct authorisation model.
- **Two parallel support systems.** `SupportConversation`/`SupportMessage` (live, used by all four UIs) and `SupportTicket`/`TicketType` (8 admin endpoints at `/api/admin/support/tickets/*`, plus `adminService` wrappers, plus `shared/store/supportStore.js` — which **no component imports**). Only the `TicketType` CRUD half is reachable, via the `/admin/support/ticket-types` route. The ticket half is orphaned.
- `Admin → Support → Live Chat` is `const LiveChat = () => <Tickets />` — a 7-line alias creating a duplicate sidebar entry ([LiveChat.jsx](DwellMart/frontend/src/modules/Admin/pages/support/LiveChat.jsx)).
- Admin FCM push is never delivered (see §11).

**Production readiness:** ✅ Ready.

---

## 16. Third-Party Delivery Integrations

**Status:** ✅ Fully Implemented · **Implementation: 85%**

**Well implemented:** Scoped API-key auth, per-partner IP allowlisting, separate read/write rate limiters, full audit logging of every request, and Joi validation on every route ([integration.routes.js](DwellMart/backend/src/modules/integrations/routes/integration.routes.js)).

**⚠ Pass-the-hash weakness:**
```js
// backend/src/modules/integrations/middlewares/partnerAuth.middleware.js:91-94
const isValidKey =
    safeCompare(candidateHash, expectedHash) ||
    safeCompare(legacyHash, expectedHash) ||
    safeCompare(apiKey, expectedHash);        // ← raw key compared against the stored hash
```
The third branch accepts the **stored hash itself** as a valid API key. Anyone with read access to the `IntegrationPartner` collection (a DB backup, a read-replica credential, an aggregation-pipeline leak) can authenticate directly with the hash, defeating the entire point of hashing. `INTEGRATION_API_KEY_PEPPER` is also **empty** in `.env`, so `hashApiKey` degrades to a plain unsalted SHA-256.

**❌ No admin UI exists to create, list, or rotate `IntegrationPartner` records** — grep returns zero frontend references to integrations. Partners must be inserted directly into MongoDB or configured through the single-partner `INTEGRATION_CLIENT_ID`/`INTEGRATION_API_KEY` env pair. `IntegrationAuditLog` is written and never read by anything.

**Production readiness:** ⚠ Ready with risks.

---

# End-To-End Workflow Verification Matrix

| # | Workflow | Status | Evidence | Missing / Risk |
|---|---|---|---|---|
| 1 | Registration (customer) | ✅ Works | `user.routes.js:40-42` | — · Low |
| 2 | Login / Logout / Refresh | ✅ Works | `api.js:146-179`, `authorize.js:26-79` | No per-account lockout · Low |
| 3 | Password reset | ✅ Works | `user.routes.js:43-45` | — · Low |
| 4 | Profile & avatar | ✅ Works | `user.routes.js:49-52` | — · Low |
| 5 | Address management | ✅ Works | `user.routes.js:56-60` | — · Low |
| 6 | Catalog browse | ✅ Works | `public.routes.js:179-346` | Hardcoded test-vendor regex hides real sellers · Med |
| 7 | Search & filters | ✅ Works | `public.routes.js:314-321` | Regex escaped correctly · Low |
| 8 | Wishlist | ✅ Works | `user.routes.js:63-65` | `wishlistEnabled` flag ignored · Low |
| 9 | Cart validation | ✅ Works | `checkout.controller.js:33-42` | Unauthenticated endpoint · Low |
| 10 | Coupon apply | 🟡 Partial | `checkout.controller.js:93-145` | No per-user limit; silent min-order drop · **High** |
| 11 | Checkout (enterprise, COD) | 🟡 Partial | `checkout.controller.js:235-304` | Non-atomic status guard · Med |
| 12 | Checkout (enterprise, online) | ⚠ Broken | `OrderSplitterEngine.js:654-655` | **Charged amount ≠ order totals** (§3c) · **Critical** |
| 13 | Checkout (legacy `/user/orders`) | ⚠ Broken | `user/order.controller.js:299` | **`ReferenceError` on every QC order** · **Critical** |
| 14 | Quick Commerce estimate | 🟡 Partial | `quickCommerce.routes.js:326-329` | Delhi fallback + geo-fence off · **High** |
| 15 | Payment session | 🟡 Partial | `cashfree.controller.js:56-212` | No ownership check on legacy/subscription branches · **High** |
| 16 | Payment verify | ⚠ Broken | `cashfree.controller.js:380-393` | **Unauthenticated full-order PII disclosure** · **Critical** |
| 17 | Payment webhook | ✅ Works | `cashfree.service.js:166-199` | HMAC + replay window correct · Low |
| 18 | Order placement → split | ✅ Works | `OrderSplitterEngine.js:287-590` | Transactional with retry · Low |
| 19 | Inventory reserve → commit | 🟡 Partial | `InventoryReservationService.js:109-121` | Reserved-stock leak on 11000 · **High** |
| 20 | Variant stock enforcement | ❌ Missing | `InventoryReservationService.js:54-138` | Variants never decremented on live path · **High** |
| 21 | Order tracking (customer) | ✅ Works | `user.routes.js:76`, `socket.js:172-186` | — · Low |
| 22 | Order cancel (customer) | ⚠ Broken | `user/order.controller.js:812` vs `OrderSplitterEngine.js:456` | **Paid orders are uncancellable** · **High** |
| 23 | Return request | ✅ Works | `user/order.controller.js:952-1088` | Duplicate admin notifications · Med |
| 24 | Refund (money movement) | ❌ Missing | `cashfree.service.js` exports; `admin/order.controller.js:542-546` | **No gateway refund exists** · **Critical** |
| 25 | Rider assignment | ✅ Works | `riderAssignment.service.js` | Escalation path present · Low |
| 26 | Delivery status + OTP | 🟡 Partial | `delivery/order.controller.js:265-318` | **Email-only OTP blocks delivery** · **High** |
| 27 | COD cash settlement | ✅ Works | `deliveryCash.service.js` | Interlocked with payouts · Low |
| 28 | Rider wallet & withdrawal | ✅ Works | `riderWithdrawal.service.js:1-200` | Best module in the codebase · Low |
| 29 | Vendor registration | ✅ Works | `vendor.routes.js:87-99` | — · Low |
| 30 | Vendor subscription purchase | ⚠ Broken | `subscription.routes.js:15-17` | **Unauthenticated free activation** · **Critical** |
| 31 | Vendor plan change | ⚠ Broken | `subscription.controller.js:97` | **Free upgrade, no payment** · **Critical** |
| 32 | Vendor product CRUD | ✅ Works | `vendor/product.controller.js:305-451` | Channel flags enforced · Low |
| 33 | Vendor bulk import | ⚠ Broken | `bulkUpload.service.js:316`, `Product.model.js` | **SKU dropped → infinite duplicates** · **Critical** |
| 34 | Vendor payout request | ⚠ Broken | `vendor/order.controller.js:522-535` | **Non-transactional → double payout race** · **Critical** |
| 35 | Vendor pickup locations | ❌ Missing | `PickupLocations.jsx:32-73` | **localStorage only; no API** · **High** |
| 36 | Vendor shipping zones/rates | ✅ Works | `vendor.routes.js:194-201` | — · Low |
| 37 | Vendor analytics | ✅ Works | `vendor/analytics.controller.js` | — · Low |
| 38 | Admin order management | ✅ Works | `admin.routes.js:163-171` | — · Low |
| 39 | Admin vendor approval | ✅ Works | `admin/vendor.controller.js:112-142` | `vendorType` mandatory · Low |
| 40 | Admin sub-admin management | ✅ Works | `admin.routes.js:138-145` | `requireSuperAdmin` correct · Low |
| 41 | Admin permissions enforcement | ⚠ Broken | 12 tokens, 0 routes | **§12a** · **High** |
| 42 | Admin settings (general) | ✅ Works | `settings.controller.js:39-113` | — · Low |
| 43 | Admin settings (payment) | ⚠ Broken | `PaymentShippingSettings.jsx:27-88` | **Saving destroys the gateway secret** · **Critical** |
| 44 | Admin CMS (policies) | ✅ Works | `AdminPageEditor` → `/admin/pages/:slug` | — · Low |
| 45 | Admin CMS (`/admin/content`) | ❌ Missing | `Content.jsx:8-22` | **localStorage mock with placeholder text** · Med |
| 46 | Admin P&L report | ⚠ Broken | `ProfitLoss.jsx:66-73` | **Double-counts tax/shipping/discount** · **High** |
| 47 | Admin tax / payment / refund reports | 🟡 Partial | `TaxReports.jsx:18-39` | Full-table client-side aggregation · **High** |
| 48 | Marketing (coupons/banners/campaigns) | ✅ Works | `admin.routes.js:312-331` | — · Low |
| 49 | Push broadcast | 🟡 Partial | `admin.routes.js:343` | Gated on `DASHBOARD_VIEW` · Med |
| 50 | Support chat (all roles) | ✅ Works | `socket.js:127-135`, `supportApi.js` | Typing bypass · Low |
| 51 | Support tickets (legacy) | ❌ Dead | `supportStore.js` imported by nothing | Orphaned subsystem · Low |
| 52 | Reviews submit | ✅ Works | `user/review.controller.js:32-44` | Purchase-verified · Low |
| 53 | Review helpful vote | ⚠ Broken | `user.routes.js:70` | **Unauthenticated, unbounded `$inc`** · Med |
| 54 | Review settings | ❌ Missing | §12e | Stored, never read · Low |
| 55 | Feature flags (6 of 8) | ❌ Missing | §12d | Toggles do nothing · Med |
| 56 | Translation API | 🟡 Partial | `translationRoutes.js:7-9` | **Public, unauthenticated, metered** · **High** |
| 57 | Third-party integration API | ✅ Works | `integration.routes.js` | Pass-the-hash weakness · Med |
| 58 | Bulk upload via `/api/products/*` | ⚠ Broken | `bulkUpload.routes.js:17-32` | **Any user exports/imports catalogue** · **Critical** |

---

# Hardcoded Values Report

### 🔴 Critical Risk

| Value | File:Line | Purpose | Risk |
|---|---|---|---|
| `{ latitude: 28.6139, longitude: 77.2090 }` | [quickCommerce.routes.js:326](DwellMart/backend/src/routes/quickCommerce.routes.js#L326) | Vendor geo fallback | Fabricated distance → wrong delivery fee & ETA quoted to customer. Directly contradicts `OrderSplitterEngine.js:108-114`, so estimate ≠ order. **Fix:** return `notAvailable('VENDOR_NO_LOCATION')`. |
| `{ latitude: 28.6139, longitude: 77.2090 }` | [user/order.controller.js:295](DwellMart/backend/src/modules/user/controllers/order.controller.js#L295) | Same, legacy path | Same. **Fix:** delete with the dead endpoint. |
| `isDevMode ? 10000 : radius` | [quickCommerce.routes.js:328-329](DwellMart/backend/src/routes/quickCommerce.routes.js#L328-L329), [user/order.controller.js:297-298](DwellMart/backend/src/modules/user/controllers/order.controller.js#L297-L298) | Geo-fence bypass | 10,000 km radius whenever `NODE_ENV !== 'production'`. **Fix:** make it an explicit opt-in setting, never NODE_ENV-derived. |
| `'delivery-doc-secret'` | [app.js:49](DwellMart/backend/src/app.js#L49) | HMAC fallback secret | Known-key forgery of delivery-document access tokens. **Fix:** throw at boot if `JWT_SECRET` is absent. |
| `NODE_ENV=development`, `USE_MOCK_OTP=true`, `MOCK_OTP=123456`, `CASHFREE_ENV=sandbox` | `backend/.env:5,34,35,52` | Deployment config | All four are wrong for production and gate real security behaviour. **Fix:** production `.env` with a boot-time assertion. |

### 🟠 Production Risk

| Value | File:Line | Purpose | Risk |
|---|---|---|---|
| `PUBLIC_TEST_VENDOR_REGEX` | [public.routes.js:657](DwellMart/backend/src/routes/public.routes.js#L657) + [catalogData.js](DwellMart/frontend/src/modules/UserApp/data/catalogData.js) | Hide seed vendors | Legitimate sellers matching `test\|demo\|sample\|audit\|^sk store\|^sagar store` are invisible. **Fix:** an `isTestAccount` boolean on `Vendor`. |
| `commissionRate \|\| 10` | [commission.service.js:14](DwellMart/backend/src/services/commission.service.js#L14), [:78](DwellMart/backend/src/services/commission.service.js#L78), [user/order.controller.js:372](DwellMart/backend/src/modules/user/controllers/order.controller.js#L372) | Default commission | Three copies; drifts from `settings.general.defaultCommissionRate`, which is stored and never read. **Fix:** read the setting. |
| `sevenDaysAgo` escrow | [commission.service.js:123-124](DwellMart/backend/src/services/commission.service.js#L123-L124) | Vendor payout hold | Not configurable, unlike the rider equivalent. **Fix:** move to `settings.vendor`. |
| `MINIMUM_PAYOUT = 500` | [vendor/order.controller.js:509](DwellMart/backend/src/modules/vendor/controllers/order.controller.js#L509) | Payout floor | Not configurable. |
| `+5 days` estimated delivery | [user/order.controller.js:595](DwellMart/backend/src/modules/user/controllers/order.controller.js#L595) | ETA promise | Ignores shipping method, distance, vendor SLA. |
| `24` / `168` return-window hours | [user/order.controller.js:585](DwellMart/backend/src/modules/user/controllers/order.controller.js#L585), [:960](DwellMart/backend/src/modules/user/controllers/order.controller.js#L960) | Return policy | Legal/policy value in code. |
| `'9999999999'`, `'customer@dwellmart.com'` | [cashfree.service.js:57](DwellMart/backend/src/services/billing/cashfree.service.js#L57), [:65](DwellMart/backend/src/services/billing/cashfree.service.js#L65), [cashfree.controller.js:91-92](DwellMart/backend/src/modules/payment/controllers/cashfree.controller.js#L91-L92), [:149-150](DwellMart/backend/src/modules/payment/controllers/cashfree.controller.js#L149-L150), [:196](DwellMart/backend/src/modules/payment/controllers/cashfree.controller.js#L196) | Gateway customer fallback | Fake contact details on real transactions; breaks reconciliation and gateway-side fraud scoring. **Fix:** reject rather than substitute. |
| Static demo catalogue (536-line `products.js`, `vendors.js`, `brands.js`) | [catalogData.js:121,127,133,216](DwellMart/frontend/src/modules/UserApp/data/catalogData.js#L121) | Storefront fallback | **Fabricated products with fabricated prices and ratings are rendered to real customers** whenever the localStorage cache is empty (first visit, cleared cache, or a `QuotaExceededError` from the 500-product sync). Feeds Daily Deals, New Arrivals, Recommended, Featured Vendors, Brand Logos, and Search Suggestions. **Fix:** render an empty state. |
| `country: "USA"`, Mon-Sat 09:00-18:00 | [PickupLocations.jsx:53-67](DwellMart/frontend/src/modules/Vendor/pages/PickupLocations.jsx#L53-L67) | Pickup defaults | Wrong country on an India platform; moot until the feature is real. |

### 🟡 Needs Configuration

| Value | File:Line |
|---|---|
| CORS allowlist incl. `dwell-mart-3u11.vercel.app` and three localhost origins | [app.js:60-68](DwellMart/backend/src/app.js#L60-L68), [socket.js:78-86](DwellMart/backend/src/socket.js#L78-L86) |
| Rate limits 1500/30/10/10 per window | [rateLimiter.js:6,15,31,40](DwellMart/backend/src/middlewares/rateLimiter.js#L6) |
| Cache TTLs 30s/60s/300s | [public.routes.js:62,70-72](DwellMart/backend/src/routes/public.routes.js#L62) |
| Reservation TTLs 10/15/30 min | [InventoryReservationService.js:29-33](DwellMart/backend/src/services/checkout/InventoryReservationService.js#L29-L33) |
| `taxRate` default `18` | [Product.model.js:96](DwellMart/backend/src/models/Product.model.js#L96) |
| `lowStockThreshold` default `10` (schema) vs `5` (commit path) | [Product.model.js:28](DwellMart/backend/src/models/Product.model.js#L28) vs [InventoryReservationService.js:194](DwellMart/backend/src/services/checkout/InventoryReservationService.js#L194) — **inconsistent** |
| `MAX_IMPORT_ROWS = 10_000` | [bulkUpload.service.js:303](DwellMart/backend/src/services/bulkUpload.service.js#L303) |
| 500-product / 200-vendor catalog sync limits | [AppBootstrap.jsx:70-71](DwellMart/frontend/src/shared/components/AppBootstrap.jsx#L70-L71) |
| Six-currency metadata list | [public.routes.js:1356-1363](DwellMart/backend/src/routes/public.routes.js#L1356-L1363) |
| `express.json({ limit: '50mb' })` | [app.js:86](DwellMart/backend/src/app.js#L86) — 50 MB JSON bodies on every endpoint is a DoS amplifier |

### ✅ Acceptable

`DEFAULT_GENERAL_SETTINGS` seed values ([settings.controller.js:17-33](DwellMart/backend/src/modules/admin/controllers/settings.controller.js#L17-L33)) — first-run defaults, admin-overridable. `DEFAULT_WITHDRAWAL_POLICY` ([riderWithdrawal.service.js:37-44](DwellMart/backend/src/services/wallet/riderWithdrawal.service.js#L37-L44)) — every field settings-overridable. Design tokens under `frontend/src/theme/tokens/`. `ALLOWED_MIME_TYPES` / size limits ([upload.js:7-18](DwellMart/backend/src/middlewares/upload.js#L7-L18)). `ALLOWED_SLUGS` for public pages ([public.routes.js:1141](DwellMart/backend/src/routes/public.routes.js#L1141)) — a security allowlist, correctly hardcoded.

---

# Missing Functionality Report

| # | Missing capability | Why it must exist | Business impact | Evidence |
|---|---|---|---|---|
| 1 | **Payment refund execution** | Every order path can reach `paymentStatus: 'refunded'` and the return workflow is fully built | Customers are told they were refunded and receive no money. Chargebacks, gateway penalties, regulatory exposure under RBI consumer-protection norms | `cashfree.service.js` has no refund export; `admin/order.controller.js:542-546` only sets a string |
| 2 | **Payment authorisation on subscription activation** | The platform's entire vendor revenue model | 100% subscription revenue loss, exploitable unauthenticated | `subscription.routes.js:15-17` + `subscriptionState.service.js:79-118` |
| 3 | **Pickup Locations persistence** | A shipped, routed, sidebar-linked vendor feature | Vendors configure fulfilment addresses that vanish on cache clear; no order can route to them | `PickupLocations.jsx:32-73`; `PickupLocation.model.js` imported by zero files |
| 4 | **Variant-level stock enforcement in the live checkout** | The catalogue supports size/colour variants with per-variant stock | Oversells one variant while others sit in stock; manual cancellation and refund per incident | `InventoryReservationService.js` operates on `stockQuantity` only |
| 5 | **SKU as a first-class product field** | Bulk import, ERP reconciliation, and duplicate detection all assume it | Every re-import duplicates the catalogue; no stable external product identity | `Product.model.js` has no `sku`; `bulkUpload.service.js:316` queries it |
| 6 | **Per-user coupon usage limits** | Standard promotional control | A single customer drains a campaign budget | Only global `usedCount` is tracked |
| 7 | **Customer cancellation of paid orders** | Universal e-commerce expectation, and the return flow assumes delivery first | Every paid order requires a support ticket to cancel | `user/order.controller.js:812` |
| 8 | **SMS delivery OTP** | OTP is mandatory to complete delivery and is email-only | Any customer without a valid email has an undeliverable order | `delivery/order.controller.js:277-283` |
| 9 | **Vendor shipping revenue payout** | Vendors set their own shipping rates and the platform collects them | Vendors are silently short-paid on every shipped order | `commission.service.js:81-82` computes on subtotal only |
| 10 | **Server-side finance aggregation endpoints** | Tax, payment-mix, and refund reporting | Reports become unusable past ~20k orders | Three pages loop the entire dataset client-side |
| 11 | **Period-over-period analytics** | The dashboard UI is already built for it | Trend badges silently never render | `StatsCards.jsx:11-41`; no backend field |
| 12 | **Integration partner admin UI** | API keys must be issued, listed, and rotated | Key rotation requires direct DB access | Zero frontend references to integrations |
| 13 | **Subscription plan limits** | Tiered pricing implies tiered capability | Every plan is functionally identical; no upgrade incentive | `SubscriptionPlan.features` is `Mixed`, never read |
| 14 | **Commission reconciliation job** | Commission creation is fire-and-forget after the transaction | Silent permanent loss of a vendor's earning record | `OrderSplitterEngine.js:568-572` |
| 15 | **Idempotency on `confirmCheckout`** | Concurrent COD confirms both pass the status check | Duplicate order creation | `checkout.controller.js:252-259` — non-atomic read-then-act |

---

# Dead Code Report

### Backend

**Unreferenced models (imported by zero files):** `Attribute`, `AttributeSet`, `AttributeValue`, `PickupLocation`, `Zipcode`, `City`
**Written but never read:** `IntegrationAuditLog`, `FailedJob`
**Orphaned subsystem:** `SupportTicket` model + 8 admin ticket endpoints (`admin.routes.js:292-295`) + `adminService` wrappers — front-end store (`supportStore.js`) is imported by nothing. `TicketType` CRUD is the only reachable half.
**Unused middleware:** `productCapabilityGuard` (no-op, §10); `uploadCSV` export
**Dead imports:** `haversineDistanceKm` in `user/order.controller.js:27`
**Unused permission tokens:** 12 (§12a)
**Unreachable-from-UI live routers:** the whole of `routes/bulkUpload.routes.js` mounted at `/api/products` (§14); `POST /api/user/orders` → `placeOrder`, 1126 lines (§3a)
**One-off scripts inside `backend/src/`** — these ship with the deployed source tree and several mutate production data:
`advance_escrow_period.js` (fast-forwards `deliveredAt` so earnings mature early), `fix_user_address_indore.js`, `update_qc_vendor_indore.js`, `check_admin_settings.js`, `check_cart_product.js`, and 8 `verify_*.js` files.
**Triplicated scripts:** `seedCategories`, `seedPolicies`, `createTestUser`, `testFcmTokenStorage`, `testTranslation`, and 7 `verify*.mjs` files exist in `backend/scripts/`, `backend/tests/`, and `DwellMart/tests/`.
**Committed PII:** 8 tracked files under `backend/public/uploads/` and `backend/uploads/` including three copies of a real résumé.

### Frontend

**Unrouted pages (12):**
`Admin/pages/Users.jsx` · `Admin/pages/settings/store/{PaymentMethods,ShippingMethods,StoreProfile}.jsx` · `Admin/pages/settings/web/{Languages,SEOSettings,Themes}.jsx` · `Admin/components/Settings/{GeneralSettings,PaymentSettings,SEOSettings,ShippingSettings}.jsx` · `UserApp/pages/Notifications.jsx` (superseded by `NotificationsPage.jsx`)

> Note: `Admin/components/Settings/PaymentSettings.jsx` is the **only** UI in the codebase that can configure `cashfreeAppId` / `cashfreeSecretKey` / `cashfreeEnv`, and it is unrouted. The DB-override branch in `getCashfreeCredentials` ([cashfree.service.js:10-20](DwellMart/backend/src/services/billing/cashfree.service.js#L10-L20)) is therefore unreachable through the product.

**Imported but never rendered:** `ComingSoon` ([App.jsx:152](DwellMart/frontend/src/App.jsx#L152))
**Unreferenced components (10):** `AnimatedComponent`, `BrandCard`, `CategoryCard`, `Carousel`, `ConfirmationModal`, `NotificationBadge`, `OrderCardSkeleton`, `ProductCardSkeleton`, `Product/ReviewItem`, `Product/SocialShare`, `Mobile/{AnimatedInput,MobileFilterPanel,MobileProductCard,MultiVendorBadge}`, `QuickCommerce/ExpressCategorySection`, `Vendor/components/RequireVendorType`
**Unreferenced stores/utils (8):** `productStore`, `supportStore`, `data/adminMockData.js` (425 lines), `Admin/utils/campaignHelpers.js`, `shared/utils/commissionHelpers.js`, `shared/utils/initializeFashionHubData.js`, `shared/utils/initializeFashionHubProducts.js`, `Vendor/utils/vendorHelpers.js`
**Deprecated bridges still present:** `Admin/components/{Button,ConfirmModal,DataTable}.jsx`, `shared/components/Badge.jsx`, `Skeletons/{PageSkeleton,ProductGridSkeleton}.jsx`
**Fake pages:** `Admin/pages/Content.jsx` (localStorage + placeholder text); `Vendor/pages/PickupLocations.jsx` (localStorage)
**Duplicate route alias:** `Admin/pages/support/LiveChat.jsx` → `<Tickets />`
**Broken import path:** `Vendor/utils/vendorHelpers.js:1-2` imports from bare `'data/products'` / `'data/vendors'` with no alias configured in `vite.config.js` — this file cannot resolve. It is dead, which is the only reason the build succeeds.

---

# Security Findings

## 🔴 Critical

**S-1 · Unauthenticated free activation of paid vendor subscriptions**
`POST /api/subscription/initiate` has no auth middleware ([subscription.routes.js:16](DwellMart/backend/src/routes/subscription.routes.js#L16)) and calls `activateInternalSubscription`, which writes `status:'active'`, `latest_payment_status:'paid'`, and a fabricated `Payment{status:'paid'}` with no payment check ([subscriptionState.service.js:79-118](DwellMart/backend/src/services/billing/subscriptionState.service.js#L79-L118)). Plan IDs are publicly enumerable. `POST /api/vendor/subscription/change-plan` is the same bypass with auth but still no payment ([subscription.controller.js:97](DwellMart/backend/src/modules/vendor/controllers/subscription.controller.js#L97)).
**Fix:** require `authenticate` + `authorize('vendor')`; make `activateInternalSubscription` private to the webhook/verify path and require a verified gateway reference; keep a separate explicitly-named admin-only grant path for free plans.

**S-2 · Unauthenticated PII disclosure via payment verify**
`POST /api/payments/cashfree/verify` is `optionalAuth`; the legacy-order branch returns the complete order document with no ownership check ([cashfree.controller.js:380-393](DwellMart/backend/src/modules/payment/controllers/cashfree.controller.js#L380-L393)).
**Fix:** apply `checkSessionOwnership`-equivalent logic to the order branch and return the same sanitised shape used at line 34.

**S-3 · Broken access control on the `/api/products` bulk router**
Nine endpoints behind `authenticate` only. Any authenticated customer or rider can export the full catalogue with vendor emails, read every vendor's import history, cancel any running import, and import products into an arbitrary vendor's catalogue (§14). The router is unused by the frontend.
**Fix:** delete `routes/bulkUpload.routes.js` and its mount at `app.js:137`.

**S-4 · Admin payment settings save destroys the gateway secret**
`GET /admin/settings/payment` redacts secrets to the literal `'••••• (set)'` ([settings.controller.js:191-204](DwellMart/backend/src/modules/admin/controllers/settings.controller.js#L191-L204)). `PaymentShippingSettings` loads that whole object into state ([PaymentShippingSettings.jsx:29](DwellMart/frontend/src/modules/Admin/pages/settings/PaymentShippingSettings.jsx#L29)) and posts it back verbatim on save ([:86](DwellMart/frontend/src/modules/Admin/pages/settings/PaymentShippingSettings.jsx#L86)). `paymentSchema` is `.unknown(true)` so the placeholder is persisted. **Saving the payment settings page overwrites the real Cashfree secret with `'••••• (set)'` and takes down all payments.**
**Fix:** strip any value equal to the redaction sentinel server-side before `findOneAndUpdate`.

## 🟠 High

**S-5 · Twelve permissions defined, presented in the UI, and enforced by zero routes** (§12a). Sub-admins are granted authority the system does not honour; two frontend guards reference permissions their backing APIs never check.

**S-6 · Write operations gated behind read permissions.** Settlement approve/reject → `WALLET_VIEW`; platform-wide push broadcast → `DASHBOARD_VIEW` (§12b).

**S-7 · Public unauthenticated translation API.** `/api/v1/translate`, `/batch`, `/object` have no auth and no dedicated rate limit ([translationRoutes.js:7-9](DwellMart/backend/src/routes/translationRoutes.js#L7-L9)), backed by a metered Google Cloud Translate key. Trivial billing-exhaustion vector.

**S-8 · Stored XSS via unvalidated upload extension.** MIME is client-supplied and the original extension is preserved ([upload.js:36](DwellMart/backend/src/middlewares/upload.js#L36)); `uploads/tmp` is served by `express.static` ([app.js:126-135](DwellMart/backend/src/app.js#L126-L135)) and is never swept. Chains with `localStorage` token storage.

**S-9 · Pass-the-hash on integration API keys.** `safeCompare(apiKey, expectedHash)` accepts the stored hash as the credential ([partnerAuth.middleware.js:94](DwellMart/backend/src/modules/integrations/middlewares/partnerAuth.middleware.js#L94)); `INTEGRATION_API_KEY_PEPPER` is empty.

**S-10 · Payment session creation without ownership.** `createPaymentSession` accepts any `orderId` or any vendor `email` unauthenticated ([cashfree.controller.js:129](DwellMart/backend/src/modules/payment/controllers/cashfree.controller.js#L129), [:166](DwellMart/backend/src/modules/payment/controllers/cashfree.controller.js#L166)) — order/vendor enumeration via 404 vs 200.

## 🟡 Medium

**S-11 · IDOR on admin notification read.** `findByIdAndUpdate` with no recipient filter ([admin/notification.controller.js:50-54](DwellMart/backend/src/modules/admin/controllers/notification.controller.js#L50-L54)).
**S-12 · Unauthenticated review "helpful" vote.** Unbounded `$inc`, no dedup, no auth ([user.routes.js:70](DwellMart/backend/src/modules/user/routes/user.routes.js#L70), [review.controller.js:47-51](DwellMart/backend/src/modules/user/controllers/review.controller.js#L47-L51)).
**S-13 · Socket typing indicators bypass room authorisation** ([socket.js:144-162](DwellMart/backend/src/socket.js#L144-L162)).
**S-14 · Committed PII.** Eight tracked files including a real résumé.
**S-15 · `express.json({limit:'50mb'})` globally** ([app.js:86](DwellMart/backend/src/app.js#L86)) — memory-pressure DoS on any endpoint.
**S-16 · Unauthenticated coupon validation** with no dedicated rate limit ([public.routes.js:889](DwellMart/backend/src/routes/public.routes.js#L889)) — code brute-forcing.
**S-17 · Public feedback endpoint creates DB rows** with no captcha or rate limit ([public.routes.js:1237](DwellMart/backend/src/routes/public.routes.js#L1237)) and misuses `recipientId` as the feedback's own `_id` ([:1265](DwellMart/backend/src/routes/public.routes.js#L1265)).

## 🔵 Low

**S-18** · CORS allowlist hardcodes a Vercel preview domain ([app.js:62](DwellMart/backend/src/app.js#L62)).
**S-19** · `getScopeFromUrl` attaches the admin token to public API calls made from admin pages ([api.js:96-109](DwellMart/frontend/src/shared/utils/api.js#L96-L109)).
**S-20** · Public order tracking by `orderId` ([public.routes.js:1106](DwellMart/backend/src/routes/public.routes.js#L1106)) — field selection is appropriately minimal; enumeration only.
**S-21** · `authenticate` trusts the `role` claim in the JWT; `enforceAccountStatus` re-validates existence and status but not the role itself.

### ✅ Verified correct (called out because they are commonly wrong)

Webhook HMAC + replay window + `timingSafeEqual`. Server-authoritative pricing with a client-price tripwire. Authoritative `vendorId` from the product document. Regex escaping on all user-supplied search input. `express-mongo-sanitize` + `helmet`. Socket room membership verified against the DB. Delivery-document access tokens signed and expiring. Gateway-amount vs session-amount comparison on both verify and webhook paths.

---

# Database Findings

**Schema & indexing — good.** `Order` carries 16 purposeful compound indexes matching real query shapes; `Product` 16; the rider-wallet models use partial unique indexes correctly. The `Order.idempotencyScope + idempotencyKey` partial unique index ([Order.model.js:367-377](DwellMart/backend/src/models/Order.model.js#L367-L377)) is exactly right.

| # | Finding | Severity | Evidence |
|---|---|---|---|
| D-1 | **`Product` has no `sku` or `costPrice` field** while bulk upload reads and writes both. Mongoose strict mode drops them — verified empirically. | 🔴 Critical | `Product.model.js:3-104` vs `bulkUpload.service.js:316,~718` |
| D-2 | **Phantom index** `{wholesaleEnabled, isActive, isDeleted}` on a non-existent `Product.isDeleted` field; multiple queries filter on it. | 🟠 High | `Product.model.js:116`, `public.routes.js:641,716` |
| D-3 | **Reserved-stock leak** on duplicate-key during reservation — `reservedQuantity` incremented without a matching document, never released. | 🟠 High | `InventoryReservationService.js:109-121` |
| D-4 | **Two competing stock-mutation paths** — the legacy engine ignores `reservedQuantity` entirely. Guaranteed oversell across paths. | 🟠 High | `user/order.controller.js:602-638` vs `InventoryReservationService.js` |
| D-5 | **`Settings{key:'wholesale'}` has one reader and zero writers**, permanently inverting a feature flag inside the money path. | 🔴 Critical | `OrderSplitterEngine.js:654-655` |
| D-6 | **Payout request is not transactional** — `Settlement.create` then `Commission.updateMany` with no session and no compare-and-set. Concurrent requests double-pay. | 🔴 Critical | `vendor/order.controller.js:522-535` |
| D-7 | **`confirmCheckout` status check is read-then-act**, not a conditional update. Concurrent COD confirms can both proceed. | 🟠 High | `checkout.controller.js:252-259` |
| D-8 | **`Order.discount` is never written** by the splitter; `couponDiscount` receives the full cart discount on every sub-order. Finance aggregations sum both. | 🟠 High | `OrderSplitterEngine.js:437-473` |
| D-9 | `orderPayload.packagingFee` silently dropped — no such field on `Order`. | 🟡 Medium | `OrderSplitterEngine.js:460` vs `Order.model.js:156-160` |
| D-10 | **Unbounded queries.** `Admin.find({isActive:true})` per return request; `Vendor.find({isVerified:true})` as a QC fallback; `Commission.find({status:'pending'})` with populate per payout check. | 🟡 Medium | `user/order.controller.js:1053`, `public.routes.js:239`, `commission.service.js:119` |
| D-11 | `lowStockThreshold` default is `10` in the schema but `5` in the stock-state recompute. | 🟡 Medium | `Product.model.js:28` vs `InventoryReservationService.js:194,252` |
| D-12 | **No migration framework.** `backend/scripts/` holds seven ad-hoc `migrate*`/`backfill*` scripts with no ordering, no idempotency record, and no rollback. | 🟠 High | `backend/scripts/` |
| D-13 | Six models are dead (`Attribute`, `AttributeSet`, `AttributeValue`, `PickupLocation`, `Zipcode`, `City`); two are write-only (`IntegrationAuditLog`, `FailedJob`). | 🟡 Medium | grep-verified |
| D-14 | **Stale comment asserts a field does not exist** when it is defined 76 lines above. | 🔵 Low | `Order.model.js:307` vs `:383` |
| D-15 | Transactions require a replica set. Nothing validates this at boot; on a standalone `mongod` every `withTransaction` throws and all checkout fails. | 🟠 High | `config/db.js` |

---

# Performance Findings

| # | Finding | Severity | Evidence |
|---|---|---|---|
| P-1 | **Three finance pages paginate the entire dataset into the browser** and aggregate client-side — 500 sequential requests at 100k orders. | 🔴 Critical | `TaxReports.jsx:18-39`, `PaymentBreakdown.jsx:15-36`, `RefundReports.jsx:20-68` |
| P-2 | **Every page load fetches 500 products + 200 vendors + all brands and writes them to `localStorage`.** Multi-MB payload on every visit; a `QuotaExceededError` aborts the whole sync and silently falls back to the fake demo catalogue. | 🔴 Critical | `AppBootstrap.jsx:64-120` |
| P-3 | **`calculateCheckoutSessionSummary` computes every group's pricing twice**, calling `computeGroupPricing` up to 4× and `buildQcDelivery` 2× per QC group per checkout. | 🟠 High | `OrderSplitterEngine.js:663-727` |
| P-4 | **Feature flags are read from Mongo on every call with no cache**, and are invoked per catalog request and repeatedly per checkout. | 🟠 High | `featureFlags.service.js:10-13` |
| P-5 | **`checkSubscription` issues a DB query on every vendor request**, uncached. | 🟡 Medium | `checkSubscription.js:6` |
| P-6 | `getActiveSaleProductIds()` runs a full `Campaign` scan on every product-list, new-arrivals, popular, similar, and vendor-products request. | 🟡 Medium | `public.routes.js:162-176` |
| P-7 | **N+1 in `getVendorWithdrawableCommissions`** — loads all pending commissions with a populate, filters in JS. | 🟡 Medium | `commission.service.js:119-140` |
| P-8 | `ensureVendorCommissionsForOrder` issues a `findOne` + `findById` per vendor group, sequentially, per order. | 🟡 Medium | `commission.service.js:65-104` |
| P-9 | `commitReservation` fires a `setImmediate` loop doing `findById` + `save()` per product to recompute the stock label — could be a single `bulkWrite`. | 🟡 Medium | `InventoryReservationService.js:189-202` |
| P-10 | `compression()` is applied after `express.static`, so `/uploads` assets are served uncompressed. | 🔵 Low | `app.js:82` vs `:126` |
| P-11 | `Order.find(...)` in `getUserOrders` returns full Mongoose documents (no `.lean()`) including every item and vendor group. | 🔵 Low | `user/order.controller.js:777` |
| P-12 | The Quick Commerce feed does a `Category.find` + `Category.find` + `Product.aggregate` per request with no caching (deliberate — location-dependent), and the QC router is `router.use(requireQuickCommerce)`, adding a `Settings.findOne` to every QC request. | 🔵 Low | `quickCommerce.routes.js:39-46,168-230` |

### Scalability — the application cannot run more than one instance

| Component | State | Consequence at 2+ instances |
|---|---|---|
| `express-rate-limit` | In-memory (no store configured) | Effective limits multiply by instance count |
| `socket.io` | No Redis adapter | Notifications and live tracking reach only the connected instance |
| `activeJobs` bulk-upload registry | Module-level `Map` | Job status/cancel fail unless routed to the origin instance |
| `analyticsCache.service` | In-memory | Divergent dashboards; invalidation lost |
| `responseCache` middleware | In-memory `Map` | Inconsistent cache state |
| `RetryQueueService`, reservation sweep, order recovery, wallet maturity | `setInterval` in-process | Every worker runs N times concurrently with no distributed lock |

---

# Production Blockers

> Only genuine blockers. Each is a correctness, security, or financial-integrity defect that will cause real loss or data corruption on day one.

| # | Blocker | Module | Evidence |
|---|---|---|---|
| **B-1** | **Unauthenticated free activation of paid subscriptions** — total loss of vendor subscription revenue, exploitable with a single curl | Billing | `subscription.routes.js:16`, `subscriptionState.service.js:79-118`, `subscription.controller.js:97` |
| **B-2** | **Customer charged a different amount than the created orders record** — dead `Settings{key:'wholesale'}` inverts the wholesale flag in the summary path only | Checkout | `OrderSplitterEngine.js:654-655` vs `:307` |
| **B-3** | **No refund execution anywhere** — every refund path sets a DB string and moves no money | Payments | `cashfree.service.js` exports; `admin/order.controller.js:542-546` |
| **B-4** | **`/api/products/*` router lets any authenticated user export the full catalogue with vendor emails, cancel any import, and inject products into any vendor** | Bulk Upload | `bulkUpload.routes.js:17-32`, `bulkUpload.service.js:996-1008`, `bulkUpload.controller.js:129-153` |
| **B-5** | **Saving admin payment settings overwrites the Cashfree secret with the redaction placeholder**, taking down all payments | Settings | `settings.controller.js:191-204` + `PaymentShippingSettings.jsx:29,86` |
| **B-6** | **Bulk import silently drops `sku`** — duplicate detection is permanently inert, so every import re-creates the catalogue | Catalog | `Product.model.js` (no `sku`) vs `bulkUpload.service.js:316`; verified empirically |
| **B-7** | **Vendor payout request is non-transactional and races into double payouts** | Vendor Finance | `vendor/order.controller.js:522-535` |
| **B-8** | **Unauthenticated full-order PII disclosure via payment verify** | Payments | `cashfree.controller.js:380-393` |
| **B-9** | **Single-instance-only architecture** — six components hold state in process memory with no distributed backing | Infrastructure | rate limiter, socket.io, job registry, two caches, four `setInterval` workers |

### Strongly recommended before launch (near-blocking)

- **`ReferenceError` in `placeOrder`** — delete the dead legacy endpoint rather than fixing it (`user/order.controller.js:299`).
- **Paid orders cannot be cancelled by the customer** (`user/order.controller.js:812`).
- **Delivery OTP is email-only**, making orders without a valid email undeliverable (`delivery/order.controller.js:277-283`).
- **Variant stock never enforced** on the live checkout path.
- **Twelve permissions enforced nowhere** — sub-admin roles do not mean what the UI says (§12a).
- **Fake demo catalogue rendered to real customers** on cache miss (`catalogData.js:121,127,133,216`).
- **Pickup Locations is localStorage-only** (`PickupLocations.jsx:32-73`).
- **P&L report double-counts tax, shipping, and discount** (`ProfitLoss.jsx:66-73`).
- **Production `.env` defaults** — `NODE_ENV=development` alone disables the geo-fence and enables mock OTP.
- **Public unauthenticated translation API** on a metered key (`translationRoutes.js:7-9`).

---

# Enhancement Opportunities

> Non-blocking. Nothing here risks money, data, or security.

**Correctness & consistency**
- Unify the two order-creation engines; delete the legacy one.
- Unify the two support systems; delete `SupportTicket`.
- Reconcile `lowStockThreshold` (10 vs 5).
- Move `commissionRate || 10` to `settings.general.defaultCommissionRate`, which is already stored and never read.
- Make the escrow period, minimum payout, return windows, and estimated-delivery offset configurable.

**Performance**
- Cache feature flags and subscription state with a short TTL.
- Add server-side aggregation endpoints for tax, payment-mix, and refund reports.
- Replace the `localStorage` catalogue sync with paginated on-demand fetches.
- Collapse the duplicated pricing loop in `calculateCheckoutSessionSummary`.
- Batch the stock-label recompute into a single `bulkWrite`.

**Scalability**
- Redis store for `express-rate-limit`; Redis adapter for socket.io; Redis or Mongo for the analytics/response caches.
- Move `activeJobs` and the four `setInterval` workers to a real queue (BullMQ) with a distributed lock.

**Cleanup**
- Delete ~30 dead frontend files, 6 dead models, and 13 one-off scripts from `backend/src/`.
- Purge the 8 tracked PII files and add `backend/uploads/**`, `backend/public/uploads/**` to `.gitignore`.
- De-duplicate the triplicated seed/verify scripts into one location.
- Add a `tmp` upload sweeper.

**Missing capability (business-justified, not urgent)**
- Per-user coupon limits; period-over-period analytics; integration partner admin UI; subscription plan limits; commission reconciliation job; SMS OTP fallback; an `isTestAccount` flag to replace the test-vendor regex.

**Operational**
- A real migration framework with ordering and idempotency records.
- Boot-time assertion that the Mongo connection is a replica set (transactions are mandatory).
- Structured logging (there are ~200 raw `console.log`/`console.error` calls).
- Health checks that verify DB and gateway reachability, not just process liveness.

---

# Final Verdict

## 🚫 NOT PRODUCTION READY

**Justification, strictly from code:**

Three defects cause direct, immediate financial loss and are each exploitable on day one:

1. `POST /api/subscription/initiate` has **no authentication middleware** and calls a function that writes `status:'active'`, `latest_payment_status:'paid'`, and a fabricated paid `Payment` record with no payment check. Plan IDs are publicly listed. The entire vendor subscription revenue stream is free to anyone with curl, and free to every vendor via `change-plan`.

2. `Settings.findOne({ key: 'wholesale' })` in `calculateCheckoutSessionSummary` reads a key with **exactly one reader and zero writers** — verified by grep across `backend/src`, `backend/scripts`, and `tests`, and confirmed structurally because `'wholesale'` is absent from `SETTINGS_CATEGORY_SCHEMAS` so the write endpoint rejects it. The document can never exist, so wholesale tier pricing is permanently ON in the code that computes the amount charged to the gateway and permanently OFF in the code that creates the orders. The customer is charged one number; the ledger records another. Both existing consistency checks compare values that are wrong together, so neither fires.

3. There is **no refund execution anywhere in the codebase**. `cashfree.service.js` exports four functions, none of which is a refund. Every refund path — admin override, return approval, partial fulfilment — sets `order.paymentStatus = 'refunded'` and moves no money.

Alongside these, `/api/products/*` exposes nine endpoints behind `authenticate` alone, letting any customer download the full catalogue with every vendor's email; saving the admin payment settings page overwrites the live Cashfree secret with the string `'••••• (set)'`; bulk import silently discards `sku` because the field does not exist on the `Product` schema (verified empirically), so duplicate detection has never worked; and the vendor payout request creates a `Settlement` and updates `Commission` records with no transaction and no compare-and-set, so two concurrent requests pay twice.

Underneath all of that, six stateful components live in process memory, so the application is correct only as a single instance.

**This is not a low-quality codebase.** The rider earnings ledger is defended three ways against duplicate payout and is better engineered than most production systems. The inventory reservation lifecycle is atomic and correct. Socket room authorisation is verified against the database rather than trusted. The webhook signature check has a replay window and a timing-safe comparison. Regex escaping is applied consistently on every user-supplied search term. The Quick Commerce ETA and cancellation-stage modelling shows real domain thinking.

The problem is uneven rigour. The newest modules are excellent; the revenue-critical paths written earlier — subscriptions, refunds, the legacy checkout, bulk upload — were never finished, and two full implementations of checkout and of support ticketing were left running side by side with divergent behaviour.

**Path to readiness:** the nine blockers are individually small and concentrated in six files. B-1 is a two-line middleware addition. B-2 is a one-line flag-source correction. B-5 is a three-line server-side guard. B-4 is deleting a file and its mount. B-6 is a schema field plus an index. Realistic effort is **3–4 focused engineering weeks** for the blockers, plus infrastructure work for B-9 (Redis + a job queue) which can proceed in parallel. After that, this reaches **⚠ PRODUCTION READY WITH RISKS**, with the near-blocking list above as the immediate follow-on.
