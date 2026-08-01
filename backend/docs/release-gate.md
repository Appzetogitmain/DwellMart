# Release Gate

The definition of done for every roadmap phase.

## Why this exists

Six consecutive phases of Quick Commerce work shipped behind 353 passing
assertions. Every assertion was correct. The module was still non-functional,
because nothing ever tested that a screen was wired to an endpoint, or that a
request survived the validator on its way to a controller.

Those tests verified *layers*. This gate verifies *flows*.

## Running it

```bash
npm test                  # the gate: contract + all integration suites
npm run test:contract     # static contract check only, no database
npm run test:integration  # database-backed lifecycle suites only
npm run test:conformance  # the existing scripts/verify*.mjs harnesses
npm run test:all          # conformance + gate
```

`INTEGRATION_VERBOSE=1` prints every request and response.

## Database isolation

The harness never touches the database `MONGO_URI` points at. It derives an
isolated database by appending `_integration_test` to that name and connects
there instead. The suffix is a hard-coded constant, not an env var, and every
destructive operation re-asserts it against the *live connection name*
immediately before deleting.

If you ever see the harness refuse to run with `REFUSING TO OPERATE on
database …`, that guard did its job. Do not work around it.

There is no way to point this harness at production. That is deliberate.

## The four outcomes

| Outcome | Meaning | Build |
|---|---|---|
| `PASS` | Behaviour is correct | ✅ |
| `GAP` | A defect listed in `knownGaps.mjs` is still present | ✅ tracked |
| `FAIL` | Anything else — a regression | ❌ |
| *fixed gap* | A listed defect no longer reproduces | ❌ until delisted |

That last row is the mechanism that makes phase completion objective.

## How a phase is completed

1. Fix the defect.
2. Run the gate. The assertion covering it now passes, so the gate **fails**
   with `KNOWN GAP … NO LONGER REPRODUCES`.
3. Delete that entry from `tests/integration/support/knownGaps.mjs`.
4. Run the gate. It passes.

**Deleting the entry is the definition of done.** A phase cannot be declared
complete while its entries remain, and cannot leave stale entries behind once
it is.

## Current baseline

| Gap | Phase | Summary |
|---|---|---|
| `SEC-1` | 1 | `GET /api/settings/:category` is public and unauthenticated for any key |
| `SEC-2` | 1 | Admin settings routes bypass the permission system |
| `SEC-3` | 1 | Settings writes are unvalidated |
| `FLAG-1` | 2 | The wholesale flag does not gate listing, pricing or checkout |
| `FLOW-3` | 3 | `customerLocation` is stripped by the validator — **no QC order can be created at all** |
| `FLOW-1` | 3 | No vendor screen calls `PATCH /vendor/orders/:id/quick-status` |
| `FLOW-2` | 3 | No API exists to enrol a rider into Quick Commerce |
| `OPS-1` | 4 | No admin screen calls the escalation queue endpoints |
| `DEAD-1` | 8 | Seven frontend service functions call routes that do not exist |

## Adding to the baseline

Every entry needs an audit ID, an owning phase, a summary, and evidence. This
is a ledger of accepted debt with a scheduled repayment date — not a place to
park an inconvenient failure. If a failure has no owning phase, it is a
regression and must be fixed, not listed.

## What the suites cover

- **`contract/frontendApiContract`** — static. Every frontend `api.*` call
  resolves to a registered Express route, *and* every endpoint backing a
  critical flow has a caller. The second direction is the valuable one: it is
  what catches a correct, tested, unreachable endpoint.
- **`integration/wholesaleOrderLifecycle`** — MOQ enforcement, tier selection,
  retail fallback, savings, stock decrement, oversell rejection, flag contract.
- **`integration/quickCommerceOrderLifecycle`** — discovery through OTP
  delivery, including fee/ETA persistence, atomic rider claim, dual-written
  location, tracking ownership, and rider release.
- **`integration/roleAuthorizationMatrix`** — unauthenticated access,
  cross-role tokens, per-permission enforcement, tenant isolation, feature-flag
  gating, and mass-assignment on registration.

## Fixtures

State is seeded directly through Mongoose models; behaviour is always exercised
over HTTP, including login. Seeding state is setup — seeding behaviour would be
a mock, and mocks are what let the original defects through.

Two fixture requirements are easy to miss and both were found the hard way:

- Vendors need an **active `VendorSubscription`**. `checkSubscription` guards
  every non-GET vendor route, so a vendor without one can log in and read but
  cannot act.
- Emails must not use the `.test` TLD. Joi validates against the IANA list,
  which excludes reserved TLDs, so `.test` addresses are rejected by the real
  login validators.
