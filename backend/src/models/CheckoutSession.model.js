/**
 * CheckoutSession
 *
 * The parent record for an enterprise marketplace checkout.
 *
 * Architecture:
 *   Customer places ONE order → creates ONE CheckoutSession →
 *   generates N FulfillmentGroups (one per Vendor × FulfillmentType) →
 *   generates N independent Orders.
 *
 * Payment is attached here. Settlements are attached to individual Orders.
 * Vendors never see this document — they only see their own Orders.
 */
import mongoose from 'mongoose';

const paymentAllocationSchema = new mongoose.Schema(
    {
        orderId:           { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
        fulfillmentGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'FulfillmentGroup' },
        vendorId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
        vendorName:        { type: String, trim: true },
        fulfillmentType:   { type: String, enum: ['quick_commerce', 'retail', 'wholesale'], default: 'retail' },
        // Financial ledger — all amounts in smallest currency unit (paise / cents)
        amount:            { type: Number, required: true, min: 0 }, // total allocated
        captured:          { type: Number, default: 0, min: 0 },     // confirmed received
        refunded:          { type: Number, default: 0, min: 0 },     // refunded so far
        pendingSettlement: { type: Number, default: 0, min: 0 },     // earned, not yet settled
        settled:           { type: Number, default: 0, min: 0 },     // confirmed settled to vendor
        status: {
            type: String,
            enum: ['allocated', 'captured', 'partially_refunded', 'refunded', 'settled'],
            default: 'allocated',
        },
    },
    { _id: false }
);

const checkoutSessionSchema = new mongoose.Schema(
    {
        sessionId: {
            type: String,
            required: true,
            unique: true,
            index: true,
            // Format: CS-YYYYMMDD-RANDOM  e.g. CS-20260806-A7F3K2
        },

        userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
        guestInfo: { name: String, email: String, phone: String },

        // References to generated documents
        fulfillmentGroupIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FulfillmentGroup' }],
        orderIds:            [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],

        // Payment
        paymentMethod: {
            type: String,
            enum: ['card', 'upi', 'wallet', 'cod', 'netbanking', 'emi'],
        },
        paymentStatus: {
            type: String,
            enum: ['pending', 'initiated', 'paid', 'failed', 'refunded', 'partially_refunded'],
            default: 'pending',
            index: true,
        },
        paymentId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
        gatewayOrderId:     { type: String, trim: true },   // e.g. Cashfree order_id
        gatewaySessionId:   { type: String, trim: true },   // e.g. Cashfree payment_session_id
        gatewayReference:   { type: String, trim: true },   // final transaction reference

        // Allocation Ledger — one entry per generated Order
        paymentAllocationLedger: [paymentAllocationSchema],

        // Grand summary (pre-computed at session creation, never re-derived)
        summary: {
            subtotal:          { type: Number, default: 0 },
            totalShipping:     { type: Number, default: 0 },
            totalTax:          { type: Number, default: 0 },
            totalDiscount:     { type: Number, default: 0 },
            totalPackagingFee: { type: Number, default: 0 },
            totalSavings:      { type: Number, default: 0 },
            grandTotal:        { type: Number, default: 0 },
        },

        shippingAddress: {
            name: String, email: String, phone: String,
            address: String, city: String, state: String,
            zipCode: String, country: String,
        },

        // Session lifecycle
        status: {
            type: String,
            enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'partially_completed'],
            default: 'pending',
            index: true,
        },

        // Idempotency guard — prevents double-checkout on network retries
        idempotencyKey:   { type: String, sparse: true },
        idempotencyScope: { type: String, sparse: true },

        completedAt:   { type: Date },
        failedAt:      { type: Date },
        failureReason: { type: String, trim: true },

        // Internal metadata
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    { timestamps: true }
);

// Idempotency — one session per actor+key
checkoutSessionSchema.index(
    { idempotencyScope: 1, idempotencyKey: 1 },
    {
        unique: true,
        sparse: true,
        partialFilterExpression: {
            idempotencyScope: { $exists: true, $type: 'string' },
            idempotencyKey:   { $exists: true, $type: 'string' },
        },
    }
);
checkoutSessionSchema.index({ userId: 1, createdAt: -1 });
checkoutSessionSchema.index({ status: 1, createdAt: -1 });
checkoutSessionSchema.index({ paymentStatus: 1, createdAt: -1 });

const CheckoutSession = mongoose.model('CheckoutSession', checkoutSessionSchema);
export { CheckoutSession };
export default CheckoutSession;
