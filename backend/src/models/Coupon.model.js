import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema(
    {
        code: { type: String, required: true, unique: true, uppercase: true, trim: true },
        name: { type: String },
        type: { type: String, enum: ['percentage', 'fixed', 'freeship'], required: true },
        value: { type: Number, required: true, min: 0 },
        minOrderValue: { type: Number, default: 0 },
        maxDiscount: { type: Number }, // cap for percentage coupons
        usageLimit: { type: Number }, // null = unlimited (platform-wide)
        usedCount: { type: Number, default: 0 },
        /**
         * How many times ONE customer may use this code. 0 / null = unlimited.
         *
         * Only a platform-wide cap existed, so a single customer could consume
         * an entire promotional budget on their own orders.
         */
        perUserLimit: { type: Number, default: 0, min: 0 },
        /** Restrict to a customer's first non-cancelled order. */
        firstOrderOnly: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },
        startsAt: { type: Date },
        expiresAt: { type: Date },
    },
    { timestamps: true }
);

couponSchema.index({ code: 1, isActive: 1 });
couponSchema.index({ isActive: 1, startsAt: 1, expiresAt: 1 });

const Coupon = mongoose.model('Coupon', couponSchema);
export { Coupon };
export default Coupon;
