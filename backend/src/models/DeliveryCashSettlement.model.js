import mongoose from 'mongoose';

const deliveryCashSettlementSchema = new mongoose.Schema(
    {
        settlementNumber: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        deliveryBoyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DeliveryBoy',
            required: true,
            index: true,
        },
        amount: {
            type: Number,
            required: true,
            min: 0.01,
        },
        settlementMethod: {
            type: String,
            enum: ['cash', 'upi', 'bank_transfer'],
            default: 'cash',
            required: true,
        },
        status: {
            type: String,
            enum: ['pending', 'completed', 'rejected', 'cancelled'],
            default: 'pending',
            index: true,
        },
        orderIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Order',
            },
        ],
        cashCollectedBeforeSettlement: {
            type: Number,
            default: 0,
        },
        cashCollectedAfterSettlement: {
            type: Number,
            default: 0,
        },
        referenceNumber: {
            type: String,
            trim: true,
            default: null,
        },
        notes: {
            type: String,
            trim: true,
            default: '',
        },
        rejectionReason: {
            type: String,
            trim: true,
            default: '',
        },
        requestedAt: {
            type: Date,
            default: Date.now,
        },
        receivedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
            default: null,
        },
        receivedAt: {
            type: Date,
            default: null,
        },
        rejectedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

deliveryCashSettlementSchema.index({ deliveryBoyId: 1, status: 1, createdAt: -1 });

// Partial unique index: Allows multiple completed/rejected/cancelled records per rider, but enforces at most ONE 'pending' settlement request.
deliveryCashSettlementSchema.index(
    { deliveryBoyId: 1 },
    {
        unique: true,
        partialFilterExpression: { status: 'pending' },
        name: 'unique_pending_settlement_per_rider',
    }
);

const DeliveryCashSettlement = mongoose.model('DeliveryCashSettlement', deliveryCashSettlementSchema);
export default DeliveryCashSettlement;
