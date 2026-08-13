import mongoose from 'mongoose';

/**
 * Per-user coupon consumption.
 *
 * `Coupon` tracked only a global `usedCount`, so a single customer could use a
 * "first order" or "welcome" code on every order until the platform-wide cap
 * was exhausted. Recording who used what is the only way a per-user limit can
 * be enforced.
 *
 * Counting starts from the date this ships: prior usage cannot be reconstructed
 * reliably, because an order carries the code but a deleted order carries
 * nothing. Per-user limits therefore apply prospectively.
 */
const couponUsageSchema = new mongoose.Schema(
    {
        couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true, index: true },
        code: { type: String, required: true, uppercase: true, trim: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
        checkoutSessionId: { type: String, default: null },
        amount: { type: Number, default: 0 },
    },
    { timestamps: true }
);

// Supports "how many times has this user used this coupon".
couponUsageSchema.index({ couponId: 1, userId: 1 });

/**
 * One usage row per (coupon, order). Makes the increment idempotent when the
 * same order is confirmed twice — the enterprise checkout increments coupon
 * usage from three separate call sites.
 */
couponUsageSchema.index(
    { couponId: 1, orderId: 1 },
    {
        unique: true,
        partialFilterExpression: { orderId: { $type: 'objectId' } },
        name: 'unique_coupon_usage_per_order',
    }
);

const CouponUsage = mongoose.model('CouponUsage', couponUsageSchema);

export default CouponUsage;
export { CouponUsage };
