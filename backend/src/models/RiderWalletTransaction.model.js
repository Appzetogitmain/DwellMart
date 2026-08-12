/**
 * RiderWalletTransaction
 *
 * The append-only ledger for money the platform owes a delivery partner.
 *
 * This is the SOURCE OF TRUTH for every rider balance. `RiderWallet` is a cached
 * projection of these rows and must always be rebuildable from them alone
 * (see walletRebuild.service.js).
 *
 * Direction of value — the distinction that matters:
 *   RiderWalletTransaction  → platform OWES the rider   (an asset for the rider)
 *   DeliveryCashLedger      → rider OWES the platform   (COD cash in hand)
 * These are deliberately separate ledgers. Netting them into one balance would
 * let a payout silently offset unremitted COD cash, which is exactly the
 * reconciliation failure the two-ledger split exists to prevent.
 *
 * Immutability rule:
 *   Rows are NEVER updated to change an amount and NEVER deleted. The only
 *   mutable field is `state`, which advances along a fixed lifecycle. A wrong
 *   amount is corrected by writing a new REVERSAL or ADJUSTMENT row that offsets
 *   it, so the history of what was believed and when stays intact.
 *
 * State lifecycle:
 *   PENDING  → earning accrued, still inside the order's return window
 *   AVAILABLE→ matured; withdrawable
 *   LOCKED   → reserved against an open withdrawal request
 *   SETTLED  → paid out to the rider
 *   REVERSED → offset by a later correcting entry
 */

import mongoose from 'mongoose';

/** Entry types that increase what the platform owes the rider. */
export const CREDIT_TYPES = [
    'DELIVERY_EARNING',
    'INCENTIVE',
    'SURGE',
    'TIP',
    'ADJUSTMENT',
    'WITHDRAWAL_REVERSAL',
    /**
     * The LOCKED leg of a withdrawal hold. Paired with WITHDRAWAL_HOLD, which
     * debits AVAILABLE by the same amount — together they move funds between
     * buckets without changing what the rider is owed in total. Kept as its own
     * type so a statement reads "Withdrawal lock", not "Adjustment".
     */
    'WITHDRAWAL_LOCK',
];

/** Entry types that decrease what the platform owes the rider. */
export const DEBIT_TYPES = [
    'PENALTY',
    'REVERSAL',
    'WITHDRAWAL_HOLD',
    'WITHDRAWAL_PAID',
];

export const TRANSACTION_TYPES = [...CREDIT_TYPES, ...DEBIT_TYPES];

export const TRANSACTION_STATES = ['PENDING', 'AVAILABLE', 'LOCKED', 'SETTLED', 'REVERSED'];

/**
 * The rate card inputs that produced a DELIVERY_EARNING, frozen at the moment
 * of accrual. Rate cards are superseded rather than edited, but snapshotting
 * here means a two-year-old payslip can still be explained line by line without
 * reading historical config.
 */
const earningBreakdownSchema = new mongoose.Schema(
    {
        rateCardId: { type: mongoose.Schema.Types.ObjectId, ref: 'RiderRateCard', default: null },
        rateCardName: { type: String, trim: true, default: '' },
        baseFare: { type: Number, default: 0 },
        distanceKm: { type: Number, default: 0 },
        perKmRate: { type: Number, default: 0 },
        distanceFare: { type: Number, default: 0 },
        surgeMultiplier: { type: Number, default: 1 },
        surgeAmount: { type: Number, default: 0 },
        peakHourBonus: { type: Number, default: 0 },
        codHandlingFee: { type: Number, default: 0 },
        minimumFareApplied: { type: Boolean, default: false },
        experience: { type: String, trim: true, default: '' },
    },
    { _id: false }
);

const riderWalletTransactionSchema = new mongoose.Schema(
    {
        deliveryBoyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DeliveryBoy',
            required: true,
            index: true,
        },

        /** Always a positive magnitude. Sign is carried by `direction`. */
        amount: {
            type: Number,
            required: true,
            min: 0,
        },

        direction: {
            type: String,
            enum: ['CREDIT', 'DEBIT'],
            required: true,
            index: true,
        },

        type: {
            type: String,
            enum: TRANSACTION_TYPES,
            required: true,
            index: true,
        },

        state: {
            type: String,
            enum: TRANSACTION_STATES,
            default: 'PENDING',
            required: true,
            index: true,
        },

        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            default: null,
            index: true,
        },

        withdrawalId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'RiderWithdrawalRequest',
            default: null,
            index: true,
        },

        /** Points at the transaction this row corrects, for REVERSAL entries. */
        reversalOf: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'RiderWalletTransaction',
            default: null,
        },

        earningBreakdown: { type: earningBreakdownSchema, default: undefined },

        /** When a PENDING earning becomes AVAILABLE. Null for non-maturing types. */
        maturesAt: { type: Date, default: null },
        maturedAt: { type: Date, default: null },
        settledAt: { type: Date, default: null },

        /**
         * Running balance after this entry, for statement rendering. Advisory
         * only — never used as an input to a balance calculation, because a
         * cached figure must never be able to corrupt the derived truth.
         */
        balanceAfter: { type: Number, default: null },

        /**
         * Caller-supplied replay guard. Unique when present, so a retried
         * withdrawal or a re-delivered webhook cannot double-post.
         */
        idempotencyKey: { type: String, trim: true, default: null },

        description: { type: String, trim: true, default: '' },
        notes: { type: String, trim: true, default: '' },

        createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
        createdByType: {
            type: String,
            enum: ['system', 'admin', 'delivery'],
            default: 'system',
        },
    },
    { timestamps: true }
);

// ── Indexes ──────────────────────────────────────────────────────────────────

// Idempotency: exactly one DELIVERY_EARNING per order, ever. This is the
// structural guarantee behind "never duplicate" — not an application check that
// a concurrent request could race past.
riderWalletTransactionSchema.index(
    { orderId: 1, type: 1 },
    {
        unique: true,
        partialFilterExpression: {
            orderId: { $type: 'objectId' },
            type: 'DELIVERY_EARNING',
        },
        name: 'unique_delivery_earning_per_order',
    }
);

// Caller-supplied replay guard.
riderWalletTransactionSchema.index(
    { idempotencyKey: 1 },
    {
        unique: true,
        partialFilterExpression: { idempotencyKey: { $type: 'string' } },
        name: 'unique_wallet_idempotency_key',
    }
);

// Rider statement / transaction history — the most frequent read.
riderWalletTransactionSchema.index({ deliveryBoyId: 1, createdAt: -1 });

// Balance projection: grouped sum by state for one rider.
riderWalletTransactionSchema.index({ deliveryBoyId: 1, state: 1, direction: 1 });

// Maturity sweep: due PENDING rows, oldest first.
riderWalletTransactionSchema.index({ state: 1, maturesAt: 1 });

// Withdrawal reconciliation.
riderWalletTransactionSchema.index({ withdrawalId: 1, type: 1 });

const RiderWalletTransaction = mongoose.model('RiderWalletTransaction', riderWalletTransactionSchema);

export { RiderWalletTransaction };
export default RiderWalletTransaction;
