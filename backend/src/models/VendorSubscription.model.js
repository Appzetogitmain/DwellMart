import mongoose from 'mongoose';

const vendorSubscriptionSchema = new mongoose.Schema(
    {
        vendor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor',
            required: true,
            index: true,
        },
        plan: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'SubscriptionPlan',
            required: true,
        },
        gateway: {
            type: String,
            enum: ['internal', 'cashfree', 'stripe', 'razorpay'],
            default: 'internal',
            index: true,
        },
        gateway_customer_id: {
            type: String,
            trim: true,
            default: null,
        },
        gateway_subscription_id: {
            type: String,
            trim: true,
            required: true,
        },
        status: {
            type: String,
            enum: ['active', 'trialing', 'past_due', 'canceled', 'incomplete'],
            default: 'incomplete',
            index: true,
        },
        current_period_start: {
            type: Date,
            default: null,
        },
        current_period_end: {
            type: Date,
            default: null,
            index: true,
        },
        cancel_at_period_end: {
            type: Boolean,
            default: false,
        },
        latest_payment_status: {
            type: String,
            enum: ['pending', 'paid', 'failed', 'refunded'],
            default: 'pending',
        },
        external_status: {
            type: String,
            trim: true,
            default: '',
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

vendorSubscriptionSchema.index(
    { gateway: 1, gateway_subscription_id: 1 },
    { unique: true, sparse: true }
);
vendorSubscriptionSchema.index({ vendor: 1, status: 1, current_period_end: -1 });

vendorSubscriptionSchema.virtual('vendorId').get(function vendorId() {
    return this.vendor;
});

vendorSubscriptionSchema.virtual('planId').get(function planId() {
    return this.plan;
});

vendorSubscriptionSchema.virtual('startDate').get(function startDate() {
    return this.current_period_start;
});

vendorSubscriptionSchema.virtual('endDate').get(function endDate() {
    return this.current_period_end;
});

vendorSubscriptionSchema.virtual('paymentStatus').get(function paymentStatus() {
    if (this.latest_payment_status === 'paid') return 'completed';
    return this.latest_payment_status;
});

const VendorSubscription = mongoose.model('VendorSubscription', vendorSubscriptionSchema);

export default VendorSubscription;
