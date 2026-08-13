import mongoose from 'mongoose';

export const REFUND_STATUSES = [
    'requested',   // recorded, nothing sent to the gateway yet
    'initiated',   // accepted by the gateway, settling
    'succeeded',   // gateway confirmed
    'failed',      // gateway rejected; retryable
    'cancelled',   // withdrawn before initiation
    'manual_settled', // COD/offline, settled outside the gateway with a proof reference
    'legacy_unverified', // pre-dates this ledger; money movement NOT established
];

export const REFUND_METHODS = ['gateway', 'manual_bank', 'manual_cash', 'unknown'];

/**
 * Records one reversal effect so partial failure is visible and resumable.
 * A refund that paid the customer but failed to reverse the vendor commission
 * must not look identical to one that completed cleanly.
 */
const reversalSchema = new mongoose.Schema(
    {
        status: { type: String, enum: ['pending', 'done', 'failed', 'skipped'], default: 'pending' },
        ref: { type: String, default: '' },
        error: { type: String, default: '' },
        at: { type: Date },
    },
    { _id: false }
);

/**
 * Refund ledger.
 *
 * Before this existed every refund path in the application set
 * `order.paymentStatus = 'refunded'` and moved no money — the customer was told
 * they had been refunded and received nothing. This collection is the record of
 * money actually leaving the platform, and the state machine that gets it there.
 */
const refundSchema = new mongoose.Schema(
    {
        refundNumber: { type: String, required: true, unique: true, index: true },

        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
        /** Human-readable order id, denormalised for the admin queue. */
        orderNumber: { type: String, index: true },
        checkoutSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CheckoutSession', default: null },
        returnRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReturnRequest', default: null, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null, index: true },

        amount: { type: Number, required: true, min: 0 },
        currency: { type: String, default: 'INR' },
        reason: { type: String, required: true, trim: true },
        refundType: { type: String, enum: ['full', 'partial', 'item_level'], default: 'full' },
        method: { type: String, enum: REFUND_METHODS, default: 'gateway' },

        status: { type: String, enum: REFUND_STATUSES, default: 'requested', index: true },

        /**
         * Our idempotency key AND the gateway's refund_id. Reused verbatim on
         * every retry: generating a new one per attempt would turn a retry into
         * a second refund.
         */
        idempotencyKey: { type: String, required: true, unique: true },
        gatewayOrderId: { type: String, default: null },
        gatewayRefundId: { type: String, default: null },
        gatewayStatus: { type: String, default: null },
        gatewayRaw: { type: mongoose.Schema.Types.Mixed, default: {} },

        /** Offline settlement evidence — required when method is manual_*. */
        manualProofRef: { type: String, default: '' },

        reversals: {
            commission: { type: reversalSchema, default: () => ({}) },
            riderEarning: { type: reversalSchema, default: () => ({}) },
            codLedger: { type: reversalSchema, default: () => ({}) },
            stock: { type: reversalSchema, default: () => ({}) },
        },

        initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
        requestedAt: { type: Date, default: Date.now },
        initiatedAt: { type: Date },
        settledAt: { type: Date },
        failedAt: { type: Date },
        failureReason: { type: String, default: '' },
        attempts: { type: Number, default: 0 },
    },
    { timestamps: true }
);

// Backs the admin queue (oldest outstanding first).
refundSchema.index({ status: 1, requestedAt: 1 });

/**
 * At most one refund may be open per order at a time. Prevents a double-submit
 * or a concurrent admin action from issuing the same money twice. Historical
 * `legacy_unverified` rows are excluded so the index can build over them.
 */
refundSchema.index(
    { orderId: 1 },
    {
        unique: true,
        partialFilterExpression: { status: { $in: ['requested', 'initiated'] } },
        name: 'unique_open_refund_per_order',
    }
);

const Refund = mongoose.model('Refund', refundSchema);

export default Refund;
export { Refund };
