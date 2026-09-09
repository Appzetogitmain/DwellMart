import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
    {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
        rating: { type: Number, required: true, min: 1, max: 5 },
        comment: { type: String },
        images: [String],
        helpfulCount: { type: Number, default: 0 },
        notHelpfulCount: { type: Number, default: 0 },
        isApproved: { type: Boolean, default: false, index: true },
        isHidden: { type: Boolean, default: false, index: true },
        vendorResponse: { type: String, default: '' },
        responseDate: { type: Date },
        isVerifiedPurchase: { type: Boolean, default: false },
    },
    { timestamps: true }
);

// One review per user per product
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });
reviewSchema.index({ createdAt: -1 });
reviewSchema.index({ isApproved: 1, createdAt: -1 });

const Review = mongoose.model('Review', reviewSchema);
export { Review };
export default Review;
