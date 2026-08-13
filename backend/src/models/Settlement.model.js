import mongoose from 'mongoose';

const settlementSchema = new mongoose.Schema(
    {
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
        commissionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Commission' }],
        amount: { type: Number, required: true },
        paymentMethod: { type: String, enum: ['bank_transfer', 'wallet', 'upi'], default: 'bank_transfer' },
        transactionId: String,
        notes: String,
        rejectionReason: String,
        rejectedAt: Date,
        approvedAt: Date,
        status: { type: String, enum: ['pending', 'completed', 'failed', 'rejected'], default: 'pending' },
        /**
         * Replay guard for the vendor's payout request. Paired with the partial
         * unique index below, which is the structural half of the defence.
         */
        idempotencyKey: { type: String, default: undefined },
    },
    { timestamps: true }
);

/**
 * At most ONE open settlement per vendor.
 *
 * `requestPayout` computed eligible commissions, created a Settlement, then
 * marked those commissions `requested` — with no session, no transaction and no
 * compare-and-set. Two concurrent requests both read the same eligible set and
 * both created a settlement over it, so the vendor was paid twice for the same
 * commissions.
 *
 * The transactional rewrite closes the window; this index makes the outcome
 * structurally impossible even if that code is later changed or reverted.
 * Mirrors `unique_open_withdrawal_per_rider` in the rider wallet module, which
 * already solved this problem correctly.
 */
settlementSchema.index(
    { vendorId: 1 },
    {
        unique: true,
        partialFilterExpression: { status: 'pending' },
        name: 'unique_open_settlement_per_vendor',
    }
);

settlementSchema.index(
    { idempotencyKey: 1 },
    {
        unique: true,
        partialFilterExpression: { idempotencyKey: { $type: 'string' } },
        name: 'unique_settlement_idempotency_key',
    }
);

settlementSchema.index({ status: 1, createdAt: -1 });

const Settlement = mongoose.model('Settlement', settlementSchema);
export default Settlement;
