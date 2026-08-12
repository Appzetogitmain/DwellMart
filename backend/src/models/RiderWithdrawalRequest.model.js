/**
 * RiderWithdrawalRequest
 *
 * A rider's request to be paid out from their available wallet balance.
 *
 * Money movement is never recorded here — it lives in RiderWalletTransaction.
 * This document is the workflow envelope around two ledger rows:
 *   WITHDRAWAL_HOLD  written at request time, moving AVAILABLE → LOCKED
 *   WITHDRAWAL_PAID  written on payout, retiring the locked amount
 * On rejection or cancellation the hold is released with WITHDRAWAL_REVERSAL.
 *
 * Status lifecycle:
 *   pending    → awaiting admin review        (funds locked)
 *   approved   → cleared, payout not yet sent (funds locked)
 *   processing → handed to the payout rail    (funds locked)
 *   paid       → terminal, money sent         (funds settled)
 *   rejected   → terminal, admin declined     (hold released)
 *   failed     → terminal, rail declined      (hold released)
 *   cancelled  → terminal, rider withdrew it  (hold released)
 */

import mongoose from 'mongoose';

export const WITHDRAWAL_OPEN_STATUSES = ['pending', 'approved', 'processing'];
export const WITHDRAWAL_STATUSES = [...WITHDRAWAL_OPEN_STATUSES, 'paid', 'rejected', 'failed', 'cancelled'];

/**
 * The payout destination as it stood when the request was raised. Frozen so a
 * later change to the rider's bank details cannot retroactively alter where an
 * already-reviewed payout appears to have been sent.
 */
const payoutSnapshotSchema = new mongoose.Schema(
    {
        method: { type: String, enum: ['upi', 'bank_transfer'], required: true },
        upiId: { type: String, trim: true, default: '' },
        accountNumberMasked: { type: String, trim: true, default: '' },
        ifsc: { type: String, trim: true, default: '' },
        accountName: { type: String, trim: true, default: '' },
        bankName: { type: String, trim: true, default: '' },
    },
    { _id: false }
);

const riderWithdrawalRequestSchema = new mongoose.Schema(
    {
        requestNumber: {
            type: String,
            required: true,
            unique: true,
            index: true,
            // Format: RWD-YYYYMMDD-XXXXXX
        },

        deliveryBoyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DeliveryBoy',
            required: true,
            index: true,
        },

        amount: { type: Number, required: true, min: 0.01 },

        method: { type: String, enum: ['upi', 'bank_transfer'], required: true },

        payoutSnapshot: { type: payoutSnapshotSchema, required: true },

        status: {
            type: String,
            enum: WITHDRAWAL_STATUSES,
            default: 'pending',
            required: true,
            index: true,
        },

        /** Ledger rows this request produced. */
        holdTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'RiderWalletTransaction', default: null },
        payoutTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'RiderWalletTransaction', default: null },
        reversalTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'RiderWalletTransaction', default: null },

        /** Balance context at request time, for the reviewer. */
        availableBalanceAtRequest: { type: Number, default: 0 },
        codCashInHandAtRequest: { type: Number, default: 0 },

        gatewayReference: { type: String, trim: true, default: null },
        utr: { type: String, trim: true, default: null },

        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
        reviewedAt: { type: Date, default: null },
        paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
        paidAt: { type: Date, default: null },

        rejectionReason: { type: String, trim: true, default: '' },
        failureReason: { type: String, trim: true, default: '' },
        adminNotes: { type: String, trim: true, default: '' },

        idempotencyKey: { type: String, trim: true, default: null },

        requestedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

// ── Indexes ──────────────────────────────────────────────────────────────────

// At most ONE open request per rider. Structural, not advisory: two concurrent
// submissions cannot both create a hold against the same balance.
riderWithdrawalRequestSchema.index(
    { deliveryBoyId: 1 },
    {
        unique: true,
        partialFilterExpression: { status: { $in: WITHDRAWAL_OPEN_STATUSES } },
        name: 'unique_open_withdrawal_per_rider',
    }
);

// Replay guard for retried submissions.
riderWithdrawalRequestSchema.index(
    { idempotencyKey: 1 },
    {
        unique: true,
        partialFilterExpression: { idempotencyKey: { $type: 'string' } },
        name: 'unique_withdrawal_idempotency_key',
    }
);

// One payout per gateway reference — the third layer of duplicate-payout defence.
riderWithdrawalRequestSchema.index(
    { gatewayReference: 1 },
    {
        unique: true,
        partialFilterExpression: { gatewayReference: { $type: 'string' } },
        name: 'unique_withdrawal_gateway_reference',
    }
);

// Admin queue, and the aging analytic.
riderWithdrawalRequestSchema.index({ status: 1, createdAt: -1 });
riderWithdrawalRequestSchema.index({ deliveryBoyId: 1, createdAt: -1 });

const RiderWithdrawalRequest = mongoose.model('RiderWithdrawalRequest', riderWithdrawalRequestSchema);

export { RiderWithdrawalRequest };
export default RiderWithdrawalRequest;
