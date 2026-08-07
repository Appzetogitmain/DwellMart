/**
 * FulfillmentGroup
 *
 * Intermediate layer between CheckoutSession and Order.
 *
 * Architecture:
 *   CheckoutSession → [FulfillmentGroup × N] → [Order × N]
 *
 * Each FulfillmentGroup represents exactly ONE vendor × ONE fulfillment type.
 * It carries all the fulfillment-specific pricing, delivery details, coupon,
 * and status for that vendor's portion of the checkout.
 *
 * Vendors never see FulfillmentGroups — they only see their Orders.
 * Admins can inspect FulfillmentGroups to diagnose exactly which leg of a
 * checkout failed.
 *
 * Future fulfillment types (restaurant, pharmacy, digital, etc.) add a new
 * entry to the `fulfillmentType` enum and a new block inside `deliveryDetails`
 * without touching CheckoutSession or Order schemas.
 */
import mongoose from 'mongoose';

const itemSnapshotSchema = new mongoose.Schema(
    {
        productId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        vendorId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
        name:            String,
        image:           String,
        price:           Number,          // unit price charged
        quantity:        Number,
        variantKey:      String,
        variant:         { type: mongoose.Schema.Types.Mixed, default: {} },
        pricingType:     { type: String, enum: ['retail', 'wholesale'], default: 'retail' },
        appliedTier:     { _id: false, minQty: Number, price: Number },
        unitRetailPrice: Number,
        savings:         { type: Number, default: 0 },
    },
    { _id: false }
);

const fulfillmentGroupSchema = new mongoose.Schema(
    {
        sessionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'CheckoutSession',
            required: true,
            index: true,
        },

        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            index: true,
            default: null,
        },

        vendorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
        vendorName: { type: String, trim: true },

        fulfillmentType: {
            type: String,
            enum: ['quick_commerce', 'retail', 'wholesale'],
            required: true,
            index: true,
        },

        // FulfillmentGroup lifecycle — admin sees this to diagnose partial failures
        status: {
            type: String,
            enum: ['pending', 'validated', 'payment_received', 'order_created', 'completed', 'failed', 'cancelled'],
            default: 'pending',
            index: true,
        },
        failureReason: { type: String, trim: true },

        items: [itemSnapshotSchema],

        // Pricing breakdown for this fulfillment group
        pricing: {
            subtotal:    { type: Number, default: 0 },
            shipping:    { type: Number, default: 0 },
            tax:         { type: Number, default: 0 },
            discount:    { type: Number, default: 0 },
            packagingFee:{ type: Number, default: 0 },
            total:       { type: Number, default: 0 },
            savings:     { type: Number, default: 0 },
        },

        // Applied coupon for this fulfillment group (coupons are scoped per group)
        coupon: {
            code:     { type: String, trim: true },
            type:     String,
            discount: { type: Number, default: 0 },
            scope:    { type: String, enum: ['platform', 'vendor', 'category', 'sku', 'fulfillment', 'user'] },
        },

        // Fulfillment-type-specific delivery metadata
        deliveryDetails: {
            // ── Quick Commerce ──────────────────────────────────────────
            qc: {
                promisedEtaMinutes:  Number,
                promisedAt:          Date,
                prepMins:            Number,
                travelMins:          Number,
                deliveryFee:         Number,
                packagingFee:        Number,
                distanceKm:          Number,
                customerLocation: {
                    type:        { type: String, enum: ['Point'] },
                    coordinates: [Number],
                },
            },
            // ── Retail ──────────────────────────────────────────────────
            retail: {
                shippingOption:    String,   // 'standard' | 'express'
                estimatedDelivery: Date,
                carrierName:       String,
                awbNumber:         String,
                trackingUrl:       String,
            },
            // ── Wholesale ───────────────────────────────────────────────
            wholesale: {
                minOrderQuantity: Number,
                gstNumber:        String,
                freightMethod:    String,
                leadTimeDays:     Number,
                invoiceNumber:    String,
                dispatchedAt:     Date,
            },
        },

        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    { timestamps: true }
);

fulfillmentGroupSchema.index({ sessionId: 1, vendorId: 1, fulfillmentType: 1 });
fulfillmentGroupSchema.index({ status: 1, createdAt: -1 });

const FulfillmentGroup = mongoose.model('FulfillmentGroup', fulfillmentGroupSchema);
export { FulfillmentGroup };
export default FulfillmentGroup;
