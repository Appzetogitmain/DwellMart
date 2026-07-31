import mongoose from 'mongoose';

export const INTEGRATION_PARTNER_STATUSES = [
    'NEW',
    'READY_FOR_ASSIGNMENT',
    'ASSIGNED',
    'PICKED_UP',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'DELIVERY_FAILED',
    'CANCELLED',
];

export const INTEGRATION_INVENTORY_UPDATE_MODES = [
    'AT_ORDER_PLACEMENT',
    'POST_DELIVERY',
];

const orderItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
    name: String,
    image: String,
    price: Number,
    quantity: Number,
    variant: { type: mongoose.Schema.Types.Mixed, default: {} },
    variantKey: String,
    // Wholesale pricing snapshot. Defaults reproduce pre-wholesale behaviour so
    // historical orders remain valid without migration.
    pricingType: { type: String, enum: ['retail', 'wholesale'], default: 'retail' },
    appliedTier: {
        _id: false,
        minQty: Number,
        price: Number,
    },
    unitRetailPrice: Number,
    savings: { type: Number, default: 0 },
});

const vendorItemGroupSchema = new mongoose.Schema({
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    vendorName: String,
    items: [orderItemSchema],
    subtotal: Number,
    shipping: Number,
    tax: Number,
    discount: Number,
    orderType: { type: String, enum: ['retail', 'wholesale', 'mixed'], default: 'retail' },
    status: {
        type: String,
        enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
        default: 'pending',
    },
});

const integrationLogEntrySchema = new mongoose.Schema(
    {
        status: { type: String, enum: INTEGRATION_PARTNER_STATUSES, required: true },
        timestamp: { type: Date, required: true },
        note: { type: String, trim: true, default: '' },
        source: { type: String, trim: true, default: 'third_party_api' },
        partnerReferenceId: { type: String, trim: true },
        requestId: { type: String, trim: true },
        rawPayload: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    { _id: false }
);

const orderIntegrationSchema = new mongoose.Schema(
    {
        eligibleForPartner: { type: Boolean, default: true, index: true },
        exposedToPartnerAt: { type: Date },
        deliveryPartnerName: { type: String, trim: true },
        partnerReferenceId: { type: String, trim: true },
        partnerStatus: {
            type: String,
            enum: INTEGRATION_PARTNER_STATUSES,
            default: 'READY_FOR_ASSIGNMENT',
            index: true,
        },
        lastPartnerSyncAt: { type: Date },
        deliveredAt: { type: Date },
        inventoryUpdateMode: {
            type: String,
            enum: INTEGRATION_INVENTORY_UPDATE_MODES,
            default: 'AT_ORDER_PLACEMENT',
        },
        inventoryUpdatedAfterDelivery: { type: Boolean, default: false },
        inventoryUpdatedAt: { type: Date },
        inventoryUpdateSource: { type: String, trim: true },
        logs: { type: [integrationLogEntrySchema], default: [] },
    },
    { _id: false }
);

const orderSchema = new mongoose.Schema(
    {
        orderId: { type: String, required: true, unique: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
        guestInfo: { name: String, email: String, phone: String },
        items: [orderItemSchema],
        vendorItems: [vendorItemGroupSchema],
        shippingAddress: {
            name: String,
            email: String,
            phone: String,
            address: String,
            city: String,
            state: String,
            zipCode: String,
            country: String,
        },
        paymentMethod: { type: String, enum: ['card', 'cash', 'bank', 'wallet', 'upi', 'cod'] },
        paymentStatus: {
            type: String,
            enum: ['pending', 'paid', 'failed', 'refunded'],
            default: 'pending',
        },
        status: {
            type: String,
            enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
            default: 'pending',
            index: true,
        },
        subtotal: { type: Number, default: 0 },
        shipping: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        discount: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        orderType: {
            type: String,
            enum: ['retail', 'wholesale', 'mixed'],
            default: 'retail',
            index: true,
        },
        totalSavings: { type: Number, default: 0 },
        couponCode: { type: String },
        couponDiscount: { type: Number, default: 0 },
        idempotencyKey: { type: String, sparse: true },
        idempotencyScope: { type: String, sparse: true },
        trackingNumber: { type: String, unique: true, sparse: true },
        deliveryBoyId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryBoy', index: true },
        deliveryOtpHash: { type: String, select: false },
        deliveryOtpExpiry: { type: Date, select: false },
        deliveryOtpSentAt: { type: Date, select: false },
        deliveryOtpDebug: { type: String, select: false },
        deliveryOtpVerifiedAt: Date,
        deliveryOtpAttempts: { type: Number, default: 0, select: false },
        estimatedDelivery: Date,
        deliveredAt: Date,
        isCashSettled: { type: Boolean, default: false },
        settledAt: Date,
        cancelledAt: Date,
        cancellationReason: String,
        isDeleted: { type: Boolean, default: false, index: true },
        deletedAt: Date,
        deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
        integration: { type: orderIntegrationSchema, default: () => ({}) },
    },
    { timestamps: true }
);

// Prevent duplicate order creation for the same retry key per actor (user/guest).
orderSchema.index(
    { idempotencyScope: 1, idempotencyKey: 1 },
    {
        unique: true,
        sparse: true,
        partialFilterExpression: {
            idempotencyScope: { $exists: true, $type: 'string' },
            idempotencyKey: { $exists: true, $type: 'string' },
        },
    }
);

orderSchema.index({ isDeleted: 1, createdAt: -1 });
orderSchema.index({ isDeleted: 1, status: 1, createdAt: -1 });
orderSchema.index({ 'vendorItems.vendorId': 1, createdAt: -1 });
orderSchema.index({ 'integration.eligibleForPartner': 1, status: 1, createdAt: -1 });
orderSchema.index({ 'integration.partnerStatus': 1, createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);
export { Order };
export default Order;
