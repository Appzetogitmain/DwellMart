import mongoose from 'mongoose';

const deliveryCashLedgerSchema = new mongoose.Schema(
    {
        deliveryBoyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DeliveryBoy',
            required: true,
            index: true,
        },
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        type: {
            type: String,
            enum: [
                'COD_COLLECTION',
                'CASH_SETTLEMENT',
                'UPI_SETTLEMENT',
                'BANK_SETTLEMENT',
                'ADJUSTMENT',
                'REVERSAL',
            ],
            required: true,
            index: true,
        },
        direction: {
            type: String,
            enum: ['CREDIT', 'DEBIT'],
            required: true,
        },
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            default: null,
            index: true,
        },
        settlementId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DeliveryCashSettlement',
            default: null,
            index: true,
        },
        referenceNumber: {
            type: String,
            trim: true,
            default: null,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        createdByType: {
            type: String,
            enum: ['system', 'delivery', 'admin'],
            default: 'system',
        },
        notes: {
            type: String,
            trim: true,
            default: '',
        },
    },
    { timestamps: true }
);

// Idempotency: Prevent duplicate COD_COLLECTION entries for the same order.
deliveryCashLedgerSchema.index(
    { orderId: 1, type: 1 },
    {
        unique: true,
        sparse: true,
        partialFilterExpression: {
            orderId: { $exists: true, $ne: null },
            type: 'COD_COLLECTION',
        },
    }
);

deliveryCashLedgerSchema.index({ deliveryBoyId: 1, createdAt: -1 });

const DeliveryCashLedger = mongoose.model('DeliveryCashLedger', deliveryCashLedgerSchema);
export default DeliveryCashLedger;
