# WHATSAPP OTP INTEGRATION — FINAL IMPLEMENTATION & E2E REPORT

**Date:** 2026-08-19
**Scope:** WhatsApp OTP + email fallback + explicit resend. Nothing else.
**Provider:** Interakt (BSP) · Template `otp_temp` · WhatsApp number 919310307357

---

## 1. Executive Summary

WhatsApp OTP is implemented, tested and verified end-to-end. A **real message was
delivered to the live test handset** through the production Interakt account
(message id `57882cb2-7675-4dc1-a457-6ab9a00f1854`), which validates the API key
format, the payload contract and the approved template in one shot.

The delivery path is: **WhatsApp first → email fallback → explicit user resend**,
with a **5-minute** code window held equal to the `otp_temp` template validity.

Test totals — all executed, all green:

| Suite | Before | After |
|---|---|---|
| Backend unit | 91 pass | **144 pass** |
| WhatsApp integration (new) | — | **42 pass** |
| DTDC integration (regression) | 68 pass | **68 pass** |
| Conformance (regression) | pass | **237 pass across 5 runners** |
| Frontend build | pass | **pass** |

Four defects were found during the work that were **not** in the original plan —
including a third undocumented OTP system and two unrated OTP endpoints. All are
fixed and described below.

**No WhatsApp messaging beyond OTP was built.** The template registry is an
allowlist containing exactly one entry, and a test asserts that
`update_regarding_case` is *not* sendable.

---

## 2. Phase 0 — Analysis

**Status: COMPLETE**

Baseline captured before any edit: 91 unit / 68 DTDC passing, hygiene and
permission gates clean.

Findings that changed the plan:

| # | Finding | Evidence |
|---|---|---|
| F1 | **Two** OTP systems existed, not one. Password reset was inlined in three controllers, bypassing `sendOTP` entirely. | `user/vendor/delivery auth.controller.js` |
| F2 | Reset OTP used `Math.random()` — not a cryptographic source, for a credential that grants a password change. | `user auth.controller.js:162` (pre-fix) |
| F3 | OTP expiry was 10 minutes in **four** places. | `otp.service.js` + 3 controllers |
| F4 | `.slice(-10)` destroyed the country code in **both** backend and frontend. | `auth.controller.js:38`, `authStore.js:71` |
| F5 | `DeliveryBoy` has `phone` required and its own reset flow — included for coherence. | `DeliveryBoy.model.js:10` |

A **third** OTP system (F6) was later surfaced by the global regression audit —
see §8.

---

## 3. Phase 1 — Phone Foundation

**Status: COMPLETE, VERIFIED**

**Created:** `src/utils/phone.js` — `toE164`, `isValidE164`, `splitE164`,
`maskPhone`, `buildPhoneFields`.

**Modified:** `User`, `Vendor`, `DeliveryBoy` models — added `phoneE164`,
`phoneVerified`, `whatsappOptIn`, `whatsappOptInAt`, `otpDeliveredVia`.
`phone` is preserved verbatim and never destructively rewritten.

**Country-code fix:** `buildPhoneFields` derives `phoneE164` from the *raw*
input while leaving `phone` in its national-only shape. This was deliberate —
the Cashfree client (`cashfree.service.js:61`) requires a bare 10-digit Indian
number and would break if `phone` changed shape. Address and guest-order
truncation sites were left untouched for the same reason.

**Migration `0013_phone_e164_backfill`:** additive, idempotent, tolerant of
duplicates, reports normalization failures, creates **no** unique index, and
deliberately does **not** set `phoneVerified` — a self-declared signup field has
never been proven to belong to the account holder.

**Tests:** 13 unit + 8 migration integration (against real MongoDB) — 21 pass.
Covers valid/invalid/malformed/missing/duplicate numbers, trunk-zero and `00`
prefixes, double-prefix prevention, masking, idempotency, and a negative test
proving `verify()` fails loudly on malformed data.

---

## 4. Phase 2 — Interakt Client

**Status: COMPLETE, VERIFIED WITH A LIVE SEND**

**Created:** `src/config/whatsapp.js`, `src/services/whatsapp/whatsapp.client.js`,
`src/services/whatsapp/whatsapp.templates.js`, `scripts/whatsappLiveCheck.mjs`.

Mirrors the existing DTDC client architecture: config getters read live from
`process.env`, `AbortController` timeout, `crypto.randomUUID()` correlation ids,
typed `WhatsAppApiError` with a `retryable` flag, single-read body parsing.

**Configuration** — real credentials in `.env` (gitignored, untracked, verified);
`.env.example` carries placeholders only. `INTERAKT_API_KEY` registered in the
env contract via a new `CONDITIONALLY_REQUIRED` pass, because the existing
`VALUE_ASSERTIONS` mechanism skips absent keys by design and could not express
"required only when the switch is on". `WHATSAPP_DRY_RUN=true` is now forbidden
in production — it would silently send nothing at all.

**Dry-run:** builds the exact payload, logs masked metadata, never touches the
network. Verified: the code, the API key and the full phone number are all
absent from the log line; only the masked last four appears.

**No automatic retry.** A WhatsApp send is not idempotent — Interakt allocates a
message id per call — so a retried timeout bills twice and leaves the user
holding two codes when only the newest verifies. Tests assert exactly one HTTP
attempt for 500, 429, 401 and timeout.

**Live test send:** ✅
```
node scripts/whatsappLiveCheck.mjs --live
→ mode=LIVE (one real message) target=••••8637 template=otp_temp
✓ send accepted: {"sent":true,"dryRun":false,"messageId":"57882cb2-7675-4dc1-a457-6ab9a00f1854"}
```
One message only. The account was not spammed.

**Verified payload:**
```json
{
  "countryCode": "+91",
  "phoneNumber": "7869958637",
  "type": "Template",
  "callbackData": "otp_verification_<id>",
  "template": {
    "name": "otp_temp",
    "languageCode": "en",
    "bodyValues": ["482913"],
    "buttonValues": { "0": ["482913"] }
  }
}
```
The code appears in **both** `bodyValues` and `buttonValues` — required by the
Copy Code button on your approved template. Body-only would report success and
never reach the handset.

**Tests:** 23 unit — payload contract, dial-code separation, callbackData cap,
config gating, verbatim API key, `result:false` handling, 4xx/429/5xx retryable
classification, timeout, malformed body, empty body, no-retry proofs, secrecy,
correlation-id uniqueness.

---

## 5. Phase 3 — OTP Channel Selection

**Status: COMPLETE, VERIFIED**

`src/services/otp.service.js` was rewritten as the **single** OTP authority. It
now owns generation, expiry, persistence and delivery for *both* purposes.
No second OTP system was created — the pre-existing second one was absorbed.

**One code, one record, many channels.** WhatsApp and email carry the same
generated code against the same stored record. The code is persisted *before*
it is sent, so a crash mid-send can never leave a user holding a code that was
never stored (asserted by test).

**Channel policy:**

| Flow | Rule | Verified |
|---|---|---|
| Registration / email verification | WhatsApp when a valid `phoneE164` exists — even unverified, since sending the code is *how* it becomes verified | ✅ |
| Login when unverified | Same | ✅ |
| **Password reset** | WhatsApp **only** when `phoneVerified === true` | ✅ |
| No / invalid phone | Email | ✅ |
| WhatsApp failure of any kind | Email | ✅ |

**5-minute window:** `OTP_EXPIRY_MS = 5 * 60 * 1000`, applied to verification
*and* reset, with email copy text derived from the constant so the two can never
drift. Verified consistent across service, DB write, verification logic,
frontend countdown and resend.

**`Math.random()` eliminated** from the reset path — now `crypto.randomInt`.

**Security decision — phone proof.** `phoneVerified` is set **only** when
WhatsApp was the *sole* carrier of the code (`provenance === 'whatsapp'`).
Under dual delivery the same code also reaches the inbox, so verifying it proves
nothing about the handset; treating it as proof would let email-only access mark
an arbitrary number as verified and thereby unlock the WhatsApp password-reset
path. `sendPhoneVerificationOTP()` forces WhatsApp-only delivery for that
purpose.

**Anti-enumeration:** `forgot-password` deliberately does **not** report the
delivery channel. It answers identically for an unknown email, and
"sent via WhatsApp" would confirm both that the account exists and that it
carries a verified phone.

**Rate limiting:** new `otpPerAccountLimiter` (5/15min prod, keyed on the
submitted email, `skipFailedRequests`) layered **under** — never replacing — the
existing per-IP `otpLimiter`. Applied to every OTP-sending route.

**Tests:** 17 unit + 18 E2E integration.

---

## 6. Phase 4 — Frontend

**Status: COMPLETE, VERIFIED BY BUILD**

`Register.jsx` already had a country-code selector producing `+91XXXXXXXXXX`;
the bug was entirely `authStore.js` truncating it. Fixed — the number is now
sent exactly as entered.

**`authStore.js`** — captures `otpChannel`, `otpExpiresInMinutes` and
`otpRequestedAt` from the server on register and resend, and persists them so a
mid-verification page reload keeps the countdown.

**`Verification.jsx`** — channel-aware badge and copy (WhatsApp green / email
amber), live 5-minute `mm:ss` countdown turning red under 60s, explicit expiry
message *"Your code has expired. Please request a new code."*, submit disabled
once expired, resend with loading state and 429 handling, code inputs cleared and
refocused on resend.

**Critical property:** the UI reports the channel **the server actually used** —
never an assumption from "a phone was supplied". If WhatsApp failed and email
took over, the user is told to check email. The OTP itself never reaches the
client.

**Resend is always user-initiated.** Nothing auto-resends.

---

## 7. Phase 5 — Webhook

**Status: IMPLEMENTED — LIVE ACTIVATION BLOCKED**

**Blocked because:** `INTERAKT_WEBHOOK_SECRET` has not been issued for this
account. No secret was invented and no verification is claimed against a real
Interakt callback.

Created `src/modules/integrations/routes/whatsappWebhook.routes.js`, mounted in
`app.js`, mirroring the DTDC webhook architecture including its length-safe
`timingSafeEqual` wrapper. Uses `req.rawBody` (already preserved globally) with
HMAC-SHA256 over `Interakt-Signature`.

**Fails closed in every environment** when the secret is absent — 503, no
exceptions for development. An open endpoint accepting vendor-shaped payloads is
not something to leave running "until the secret arrives".

**Acknowledges before processing** — Interakt requires 200 within 3 seconds,
performs no retries, and disables the webhook after 5 failures in 10 minutes.
No DB or network work happens before the response.

**A delivery failure never mints a replacement OTP** — that would invalidate the
code the user is mid-way through typing, unprompted. Recovery is the email that
already went out plus explicit resend.

**Tests:** 16 integration, over a real Express app with app.js's exact body
parser. Valid/missing/wrong-secret/malformed signatures, tampered body, bare hex
digest, sub-3s acknowledgement, unknown events, duplicates, all four delivery
states, non-OTP traffic ignored, secret never logged.

---

## 8. Security Verification

| Check | Result |
|---|---|
| Real API key present only in `.env` | ✅ (grep confirmed, gitignored + untracked) |
| No hardcoded credentials in `src/` | ✅ |
| `.env.example` contains placeholders only | ✅ |
| OTP never returned in an API response | ✅ |
| OTP never stored client-side | ✅ |
| OTP never logged (WhatsApp path) | ✅ asserted by test |
| API key never logged | ✅ asserted by test |
| Full phone never logged (masked to last 4) | ✅ asserted by test |
| Webhook secret never logged | ✅ asserted by test |
| Webhook signature bypass | ✅ rejected — missing/invalid/malformed/tampered |
| Reset OTP to unverified phone | ✅ blocked, zero Interakt calls |
| Reset OTP cryptographic source | ✅ fixed from `Math.random()` |
| OTP replay after consumption | ✅ rejected |
| Superseded OTP still valid | ✅ rejected |
| Cross-user OTP | ✅ rejected |
| Expired OTP | ✅ rejected |
| Account enumeration via channel disclosure | ✅ channel withheld on forgot-password |
| Phone change revokes verification | ✅ `phoneVerified` reset on number change |

**Defects found and fixed beyond the plan:**

- **F6 — a third OTP system.** `vendor requestRegistrationOTP` had its own inline
  generation with a 10-minute window, writing to `EmailVerification`. Aligned to
  the shared 5-minute constant. (WhatsApp legitimately cannot apply — this flow
  runs before the vendor document exists, so no phone is known.)
- **F7 — `vendor /auth/resend-otp` had no rate limiter at all.** Now limited.
- **F8 — `vendor /auth/request-registration-otp` had no rate limiter at all** —
  an unauthenticated endpoint that sends email on demand. Now limited.
- **F9 — undefined variable** introduced by me in `updateProfile` during Phase 1,
  caught immediately and fixed before the phase gate.

---

## 9. Migration Verification

- Registry: 13 migrations, no duplicate ids, correctly ordered.
- `0013` exposes both `up` and `verify`.
- Idempotent — a second run writes nothing (asserted by diffing all documents).
- Duplicate phone numbers are backfilled, not rejected.
- Unusable values are left null, never guessed at.
- `phone` preserved byte-identical.
- No unique index created (asserted).
- `verify()` fails loudly on malformed `phoneE164` (asserted).

`npm run migrate` was **not** executed — `MONGO_URI` points at a hosted
production cluster. Migration correctness is proven against an in-memory MongoDB
instead. Running it against production is an operator decision.

---

## 10. Backward Compatibility

| Area | Result |
|---|---|
| DTDC integration | ✅ 68/68 |
| Quick Commerce ETA / rider / analytics | ✅ 237 conformance assertions |
| Checkout & pricing | ✅ conformance |
| Vendor channels / product ownership | ✅ unit suite |
| Existing email OTP path | ✅ preserved — disabling WhatsApp restores original behaviour exactly (asserted) |
| Existing notifications | ✅ untouched — `createNotification` not modified |
| Existing rate limiting | ✅ additive only |
| Admin / vendor / delivery auth | ✅ all controllers load and pass |
| Frontend build | ✅ |

---

## 11. Tests Executed

| Command | Result | Pass | Fail |
|---|---|---|---|
| `npm run check:hygiene` | ✅ PASS | — | 0 |
| `npm run check:permissions` | ✅ PASS | 45 tokens | 0 |
| `npm run test:unit` | ✅ PASS | **144** | 0 |
| `npm run test:whatsapp:integration` | ✅ PASS | **42** | 0 |
| `npm run test:dtdc` | ✅ PASS | **68** | 0 |
| `npm run test:conformance` | ✅ PASS | **237** | 0 |
| `npm run build` (frontend) | ✅ PASS | built in 91s | 0 |
| `node scripts/whatsappLiveCheck.mjs --live` | ✅ PASS | 1 real message | 0 |
| `npm test` (gate suite) | ⛔ **BLOCKED** | — | — |
| `npx eslint` | ⛔ **BLOCKED** | — | — |

**`npm test` blocked:** the repo's own safety guard refuses to run
write-and-delete integration suites against a production-looking `MONGO_URI`.
Not overridden — doing so would write and delete real records. Run locally with
`ALLOW_TESTS_AGAINST_THIS_DB=yes` against a local database.

**ESLint blocked:** pre-existing breakage — `@eslint/js` is not installed
(`Cannot find package '@eslint/js'`). Not caused by these changes; the frontend
production build was used as the gate instead.

---

## 12. End-to-End Scenarios

| Flow | Result | Evidence |
|---|---|---|
| 1. Register → WhatsApp OTP → verify → account created | ✅ PASS | E2E FLOW 1 |
| 1b. WhatsApp-only delivery → `phoneVerified` true | ✅ PASS | E2E FLOW 1b |
| 1c. Phone proven iff email did not also carry the code | ✅ PASS | E2E FLOW 1c |
| 1d. Email also carried it → phone NOT proven | ✅ PASS | E2E FLOW 1d |
| 2. Login → WhatsApp OTP → verify | ✅ PASS | E2E FLOW 2 |
| 3. WhatsApp fails → email fallback → verify succeeds | ✅ PASS | E2E FLOW 3 |
| 4. Verified phone → forgot password → WhatsApp | ✅ PASS | E2E FLOW 4 |
| 5. Unverified phone → forgot password → NOT WhatsApp | ✅ PASS | E2E FLOW 5 |
| 5b. Phone change revokes the reset path | ✅ PASS | E2E FLOW 5b |
| 6. 5-minute expiry → rejected → resend works | ✅ PASS | E2E FLOW 6 / 6b |
| 7. Rate limiting (per-IP + per-account) | ⚠️ PARTIAL | Middleware verified on all routes and unit-loadable; live HTTP exhaustion not driven |
| 8. Reuse / wrong / expired / cross-user rejected | ✅ PASS | E2E FLOW 8a–8g |

---

## 13. Remaining Defects

1. **Flow 7 not driven end-to-end over HTTP.** The limiters are correctly
   configured and mounted on every OTP route, but no test exhausts them against
   a live server. Verified by inspection, not by execution.
2. **`generateDeliveryOtp` still uses `Math.random()`**
   (`delivery/order.controller.js:34`). This is the doorstep delivery-confirmation
   OTP — a different feature, deliberately out of scope. It is a genuine
   weakness and should be fixed in a follow-up.
3. **Typo in vendor OTP upsert:** `{ upsate: true, ... }`
   (`vendor auth.controller.js:~332`). Harmless — `upsert: true` is also present —
   but it is dead config. Left untouched as out of scope.
4. **No frontend component test tooling exists** in this repo. Per instructions I
   did not build one; the production build is the gate. Verification UI logic is
   therefore covered by build + inspection, not by unit test.
5. **Vendor and delivery frontends** were not updated for channel-aware messaging.
   Their backends work correctly and fall back safely; only the customer app
   surfaces the WhatsApp/email distinction.

---

## 14. Remaining External Prerequisites

1. 🔴 **ROTATE THE INTERAKT PASSWORD.** It was shared in plaintext and is
   compromised. Rotate the API key too once rollout is stable.
2. 🔴 **Webhook signing secret** — required to activate Phase 5.
   Settings → Developer Settings → Webhooks.
3. 🟠 **Balance is ₹400** — testing-level only. Top up before go-live.
4. 🟠 **Set `WHATSAPP_ENABLED=true`** and `WHATSAPP_DRY_RUN=false` when ready.
   Both currently ship OFF, so the integration is inert until you decide.
5. 🟡 **Run migration 0013** against production.
6. 🟡 **Turn off `WHATSAPP_OTP_DUAL_DELIVERY`** after ~2 weeks, once delivery
   receipts are live. Note this also enables `phoneVerified` on registration.
7. ⚪ Additional templates for order/payment/settlement/marketing — none exist;
   nothing was built against them.

---

## 15. Production Readiness

### **READY FOR STAGING**

Justification: every phase is implemented and verified with executed evidence;
a real message was delivered through the live account; 491 automated assertions
pass with zero regressions across DTDC, Quick Commerce, checkout and auth; and
the feature ships behind a default-OFF switch with email fallback intact, so it
cannot degrade the existing login path.

Not **READY FOR PRODUCTION** because three things are true:

1. The delivery webhook cannot be activated — the signing secret does not exist —
   so undelivered WhatsApp messages are currently invisible to the system. The
   5-minute template validity makes that a real gap, currently mitigated only by
   dual delivery.
2. Rate-limit enforcement is verified by configuration, not by execution (§13.1).
3. The account balance (₹400) and the un-rotated, exposed credentials are not
   production-safe.

Close items 1–3 in §14 and this moves to production-ready.
