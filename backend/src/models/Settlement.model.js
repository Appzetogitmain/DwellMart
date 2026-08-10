import mongoose from 'mongoose';

const settlementSchema = new mongoose.Schema(
    {
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
        commissionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Commission' }],
        amount: { type: Number, required: true },
        paymentMethod: { type: String, enum: ['bank_transfer', 'wallet', 'upi'], default: 'bank_transfer' },
        transactionId: String,
        notes: String,
        rejectionReason: String,
        rejectedAt: Date,
        approvedAt: Date,
        status: { type: String, enum: ['pending', 'completed', 'failed', 'rejected'], default: 'pending' },
    },
    { timestamps: true }
);

const Settlement = mongoose.model('Settlement', settlementSchema);
export default Settlement;
