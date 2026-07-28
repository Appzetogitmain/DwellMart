import mongoose from 'mongoose';

const commissionSchema = new mongoose.Schema(
    {
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
        vendorName: String,
        subtotal: { type: Number, required: true },
        commissionRate: { type: Number, required: true },
        commission: { type: Number, required: true },
        vendorEarnings: { type: Number, required: true },
        status: {
            type: String,
            enum: ['pending', 'requested', 'paid', 'cancelled'],
            default: 'pending',
            index: true,
        },
        paidAt: Date,
        settlementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Settlement' },
    },
    { timestamps: true }
);

const Commission = mongoose.model('Commission', commissionSchema);
export default Commission;
