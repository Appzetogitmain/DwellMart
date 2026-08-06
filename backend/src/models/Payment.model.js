import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
    {
        vendor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor',
            required: true,
            index: true,
        },
        subscription: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'VendorSubscription',
            required: true,
            index: true,
        },
        gateway: {
            type: String,
            enum: ['internal', 'cashfree', 'stripe', 'razorpay'],
            default: 'internal',
            index: true,
        },
        amount: { type: Number, required: true, min: 0 },
        currency: { type: String, required: true, trim: true, uppercase: true },
        status: {
            type: String,
            enum: ['pending', 'paid', 'failed', 'refunded'],
            required: true,
            default: 'pending',
            index: true,
        },
        transaction_id: { type: String, trim: true, default: null },
        invoice_id: { type: String, trim: true, default: null },
        raw: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    { timestamps: true }
);

paymentSchema.index({ gateway: 1, transaction_id: 1 }, { unique: true, sparse: true });
paymentSchema.index({ gateway: 1, invoice_id: 1 }, { unique: true, sparse: true });

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
