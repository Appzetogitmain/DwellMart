import mongoose from 'mongoose';

const returnRequestSchema = new mongoose.Schema(
    {
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
        items: [
            {
                productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
                name: String,
                quantity: Number,
                reason: String,
            },
        ],
        reason: { type: String, required: true },
        status: {
            type: String,
            enum: ['pending', 'approved', 'processing', 'rejected', 'completed'],
            default: 'pending',
            index: true,
        },
        refundAmount: Number,
        refundStatus: { type: String, enum: ['pending', 'processed', 'failed'] },
        adminNote: String,
        rejectionReason: String,
        images: [String],
    },
    { timestamps: true }
);

returnRequestSchema.index({ vendorId: 1, createdAt: -1 });
returnRequestSchema.index({ vendorId: 1, status: 1, createdAt: -1 });

const ReturnRequest = mongoose.model('ReturnRequest', returnRequestSchema);
export { ReturnRequest };
export default ReturnRequest;
