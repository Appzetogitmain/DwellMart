import mongoose from 'mongoose';
import { EXPERIENCES, EXPERIENCE_VALUES } from '../constants/experiences.js';
import {
    QUICK_COMMERCE_ORDER_STATUS_VALUES,
    QUICK_COMMERCE_ASSIGNMENT_STATUS,
    QUICK_COMMERCE_ASSIGNMENT_STATUS_VALUES,
} from '../constants/quickCommerce.js';

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
        // Which shopping experience produced this order. Historical orders
        // default to marketplace, so no migration is required.
        experience: {
            type: String,
            enum: EXPERIENCE_VALUES,
            default: EXPERIENCES.MARKETPLACE,
            index: true,
        },
        // Populated only for Quick Commerce orders.
        // DEBT-2: Fields that are QC-specific carry no default so they are
        // absent on Marketplace and Wholesale orders. Historical orders already
        // have the values written; this only affects new documents.
        // Queries like `slaBreached: { $ne: true }` continue to work correctly
        // because undefined evaluates the same as false for that filter.
        quickCommerce: {
            // The promise made to the customer, locked in at checkout.
            promisedEtaMinutes: { type: Number },
            promisedAt: { type: Date },
            etaBreakdown: {
                _id: false,
                prepMins: Number,
                travelMins: Number,
            },
            status: {
                type: String,
                enum: QUICK_COMMERCE_ORDER_STATUS_VALUES,
            },
            acceptedAt: { type: Date },
            preparedAt: { type: Date },
            pickedUpAt: { type: Date },
            customerLocation: {
                type: {
                    type: String,
                    enum: ['Point'],
                },
                coordinates: { type: [Number] },
            },
            deliveryDistanceKm: { type: Number },
            deliveryFee: { type: Number },           // no default — absent on Marketplace orders
            packagingFee: { type: Number },          // no default — absent on Marketplace orders
            slaBreached: { type: Boolean },          // no default — absent on Marketplace orders
            /**
             * Measured door-to-door minutes, recorded at delivery.
             *
             * Stored rather than derived so "promised vs actual ETA" — the
             * leading indicator of Quick Commerce health — is a single field to
             * aggregate instead of a date subtraction repeated in every query.
             */
            actualEtaMinutes: { type: Number },
            /**
             * Urgent-alert acknowledgement for the store.
             *
             * A Quick Commerce vendor who misses a new-order alert breaks the
             * promise, so the alert is tracked rather than fired and forgotten:
             * unacknowledged past a threshold, it escalates to an admin.
             */
            vendorNotifiedAt: { type: Date },
            vendorAcknowledgedAt: { type: Date },
            vendorEscalatedAt: { type: Date },
            /**
             * Set when a customer cancels after the store had already begun
             * preparing. The goods exist and someone has to absorb their cost —
             * this records that the situation arose so it can be settled, rather
             * than losing the distinction between "cancelled before any work"
             * and "cancelled after the order was packed".
             *
             * The settlement policy itself is a business decision; this is the
             * field it will be applied against.
             */
            cancelledAfterPreparation: { type: Boolean },  // no default — absent on Marketplace orders
            /** Quick Commerce status at the moment of cancellation. */
            cancelledAtStage: { type: String },
            /**
             * Rider assignment outcome.
             *
             * Recorded explicitly rather than inferred from `deliveryBoyId`
             * being null, because "no rider yet" and "no rider available, needs
             * a human" are operationally different states. An order sitting in
             * `escalated` is what the admin queue reads.
             *
             * Only initialized on QC orders — Marketplace orders have no
             * assignment sub-document to avoid the pollution flagged in DEBT-2.
             */
            assignment: {
                status: {
                    type: String,
                    enum: QUICK_COMMERCE_ASSIGNMENT_STATUS_VALUES,
                },
                attempts: { type: Number },
                lastAttemptAt: { type: Date },
                assignedAt: { type: Date },
                escalatedAt: { type: Date },
                searchRadiusKm: { type: Number },
            },
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
        integration: { type: orderIntegrationSchema, default: () => ({}) },
        // Phase 5 policy fields (optional with safe defaults for legacy orders)
        returnPolicy: {
            type: { type: String },
            windowHours: { type: Number },
            eligible: { type: Boolean, default: true },
            refundOnly: { type: Boolean, default: false },
            allowedReasons: [{ type: String }],
        },
        fulfilmentOutcome: {
            status: { type: String, enum: ['fulfilled', 'partially_fulfilled', 'unfulfilled'] },
            unavailableItems: [
                {
                    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
                    variantKey: String,
                    name: String,
                    quantity: Number,
                    reason: String,
                    refundAmount: Number,
                },
            ],
            fulfilledItems: [{ type: mongoose.Schema.Types.Mixed }],
            refundAmount: { type: Number, default: 0 },
            refundStatus: { type: String, enum: ['pending', 'processed', 'failed'] },
            notes: String,
        },
        deliveryFailureReason: String,
        retryHistory: [
            {
                attemptNumber: Number,
                attemptedAt: { type: Date, default: Date.now },
                reason: String,
                callAttempts: Number,
                otpAttempts: Number,
                notes: String,
                gpsLocation: {
                    type: { type: String, enum: ['Point'] },
                    coordinates: [Number],
                },
            },
        ],
        adminOverride: {
            action: String,
            reason: String,
            adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
            timestamp: { type: Date, default: Date.now },
        },
    },
    { timestamps: true }
);

orderSchema.virtual('deliveryAttempts').get(function () {
    return Array.isArray(this.retryHistory) ? this.retryHistory.length : 0;
});
orderSchema.set('toJSON', { virtuals: true });
orderSchema.set('toObject', { virtuals: true });

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
// Backs the admin escalation queue and the Quick Commerce live-order views.
orderSchema.index({ experience: 1, 'quickCommerce.assignment.status': 1, createdAt: -1 });
orderSchema.index({ experience: 1, 'quickCommerce.status': 1, createdAt: -1 });
orderSchema.index({ experience: 1, status: 1, createdAt: -1 });
orderSchema.index({ deliveryBoyId: 1, status: 1, createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);
export { Order };
export default Order;
