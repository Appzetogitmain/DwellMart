# Developer scripts — NOT part of the deployed application

These files previously lived in `backend/src/`, which meant they shipped inside
the production image. Several of them **mutate real data**:

| Script | What it does |
|---|---|
| `advance_escrow_period.js` | Back-dates `deliveredAt` so vendor earnings mature early — rewrites financial history |
| `add_rider_test_funds.js` | Credits a rider wallet |
| `clean_qc_orders.js` | Deletes orders |
| `fix_user_address_indore.js` | Overwrites customer addresses |
| `update_qc_vendor_indore.js` | Overwrites vendor geo-coordinates |

The rest are read-only diagnostics (`check_*`, `verify_*`, `diagnose_*`,
`debug_*`, `test_*`).

## Rules

1. **Never run a mutating script against production.** Every one connects using
   `MONGO_URI` from `backend/.env`, which may point at production.
2. **Nothing here may be imported by application code.** They are entry points,
   not modules. A CI check should fail the build if `backend/src/` regains a
   top-level script other than `app.js`, `server.js` and `socket.js`.
3. **Schema changes belong in `src/migrations/`**, not here. That runner is
   ordered, idempotent, lease-protected and records what ran where.
4. Prefer deleting a script over keeping it. Most of these were written to
   verify a single fix and have no ongoing purpose.
