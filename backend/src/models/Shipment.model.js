import mongoose, { Schema } from 'mongoose';

const trackingHistorySchema = new Schema({
    status: { type: String },
    timestamp: { type: Date },
    location: { type: String },
    description: { type: String }
}, { _id: false });

const shipmentSchema = new Schema(
    {
        orderId: {
            type: Schema.Types.ObjectId,
            ref: 'Order',
            required: true,
            index: true
        },
        fulfillmentGroupId: {
            type: Schema.Types.ObjectId,
            ref: 'FulfillmentGroup',
            index: true
        },
        vendorId: {
            type: Schema.Types.ObjectId,
            ref: 'Vendor',
            required: true,
            index: true
        },
        deliveryProvider: {
            type: String,
            enum: ['dtdc', 'internal'],
            required: true
        },
        channel: {
            type: String,
            enum: ['retail', 'wholesale', 'quick_commerce']
        },
        status: {
            type: String,
            enum: ['pending', 'booked', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled', 'rto', 'ndr', 'failed'],
            default: 'pending'
        },
        awbNumber: {
            type: String,
            sparse: true,
            unique: true
        },
        serviceType: {
            type: String
        },
        carrierName: {
            type: String,
            default: 'DTDC'
        },
        bookingId: {
            type: String,
            sparse: true,
            unique: true
        },
        /**
         * Held for the duration of a carrier booking call.
         *
         * Two concurrent "Book Shipment" clicks both pass the has-no-AWB check
         * and both reach DTDC, which creates two real consignments and bills
         * for both. Whoever wins this compare-and-set makes the call; the other
         * waits for the AWB rather than placing a second booking. Stale locks
         * expire so a crashed process cannot block the parcel forever.
         */
        bookingLockedAt: { type: Date, default: null },
        labelUrl: {
            type: String
        },
        estimatedDelivery: {
            type: Date
        },
        bookedAt: { type: Date },
        pickedUpAt: { type: Date },
        inTransitAt: { type: Date },
        outForDeliveryAt: { type: Date },
        deliveredAt: { type: Date },
        cancelledAt: { type: Date },
        
        lastTrackingUpdate: { type: Date },
        lastTrackingPayload: { type: Schema.Types.Mixed },
        
        failureReason: { type: String },
        
        ndrDetails: {
            reason: String,
            attempts: Number,
            lastAttemptAt: Date,
            resolution: String
        },
        rtoDetails: {
            initiatedAt: Date,
            reason: String,
            receivedAt: Date
        },
        
        originPincode: { type: String },
        destinationPincode: { type: String },
        
        weight: { type: Number },
        /**
         * Where the declared parcel data came from.
         *
         *   'vendor'    — a human confirmed the packed box at booking time
         *   'catalogue' — measurements captured on the order line at checkout
         *   'estimated' — the documented fallback; NOT a measurement
         *
         * Absent on shipments booked before this field existed, which is
         * indistinguishable from 'estimated' and is treated as such by the UI.
         */
        weightSource: {
            type: String,
            enum: ['vendor', 'catalogue', 'estimated'],
        },
        chargeableWeight: { type: Number },
        volumetricWeight: { type: Number },
        dimensions: {
            length: Number,
            width: Number,
            height: Number,
            unit: { type: String, default: 'cm' }
        },
        
        codAmount: { type: Number },
        declaredValue: { type: Number },
        
        trackingHistory: [trackingHistorySchema],
        metadata: { type: Schema.Types.Mixed }
    },
    {
        timestamps: true
    }
);

// ─── Indexes ───────────────────────────────────────────────────────────────
/**
 * One shipment per (order, vendor, provider).
 *
 * Deliberately NOT (orderId, provider): a marketplace order is split across
 * vendors and each vendor despatches its own parcel with its own AWB. The
 * narrower key rejected the second vendor's booking with a duplicate-key
 * error, so multi-vendor orders could only ever ship one seller's goods.
 */
shipmentSchema.index({ orderId: 1, vendorId: 1, deliveryProvider: 1 }, { unique: true });
shipmentSchema.index({ orderId: 1, deliveryProvider: 1 });
/**
 * Supports the unbooked-order sweep, which left-joins shipments by order and
 * keeps only those that actually carry an AWB. Without this the $lookup
 * degrades to a collection scan per order on every 15-minute pass.
 */
shipmentSchema.index({ orderId: 1, awbNumber: 1 });
shipmentSchema.index({ vendorId: 1, status: 1, createdAt: 1 });
shipmentSchema.index({ status: 1, deliveryProvider: 1, createdAt: 1 });

const Shipment = mongoose.model('Shipment', shipmentSchema);

export default Shipment;
