/**
 * InventoryReservation
 *
 * A dedicated collection for tracking stock reservations during the checkout
 * process. Reservations are created when a CheckoutSession is initiated and
 * are either:
 *   - committed  → stock permanently deducted (payment confirmed)
 *   - released   → stock returned (payment failed / session expired)
 *
 * Reservation timeouts are fulfillment-type-specific:
 *   quick_commerce  → 10 minutes (fast-moving QC inventory)
 *   retail          → 15 minutes
 *   wholesale       → 30 minutes
 *
 * Benefits over embedding reservations in Product documents:
 *   ✅ Easier cleanup via TTL index
 *   ✅ Full audit history
 *   ✅ Better reporting (reserved vs available at any moment)
 *   ✅ No Product document bloat for high-demand items
 *   ✅ Independent lifecycle from Product schema
 */

import mongoose from 'mongoose';

const inventoryReservationSchema = new mongoose.Schema(
    {
        // Reference keys
        sessionId:   { type: String,                        required: true, index: true },
        productId:   { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Product', index: true },
        vendorId:    { type: mongoose.Schema.Types.ObjectId, required: false, ref: 'Vendor' },

        /**
         * Which variant this hold is against, e.g. `size=m|color=red`.
         *
         * Empty string for a product with no variant axes — NOT null, because
         * MongoDB's unique index treats missing and null differently across
         * documents and an empty string gives one stable value to collide on.
         *
         * Without this the reservation system tracked only product-level stock,
         * so a vendor selling S/M/L could oversell one size indefinitely.
         */
        variantKey:  { type: String, default: '', trim: true },

        quantity:        { type: Number, required: true, min: 1 },
        fulfillmentType: {
            type: String,
            enum: ['quick_commerce', 'retail', 'wholesale'],
            required: true,
        },

        status: {
            type: String,
            enum: ['reserved', 'committed', 'released', 'expired'],
            default: 'reserved',
            index: true,
        },

        // TTL — MongoDB will auto-delete expired documents after 0 seconds past this date.
        // This is a safety net; explicit release should happen first.
        expiresAt: { type: Date, required: true },

        // Audit trail
        committedAt: { type: Date, default: null },
        releasedAt:  { type: Date, default: null },
        releaseReason: { type: String, default: null }, // 'payment_failed' | 'session_expired' | 'manual'
    },
    {
        timestamps: true,
        // Lean model — no virtuals needed
    }
);

/**
 * One hold per (session, product, variant).
 *
 * The previous index was `{ sessionId, productId }`, which made a perfectly
 * ordinary cart — size S and size M of the same shirt — collide on a duplicate
 * key. The collision was swallowed as "already reserved", but the stock
 * increment had already been applied, so that reserved quantity could never be
 * released. Including the variant is what makes such a cart representable at
 * all.
 */
inventoryReservationSchema.index({ sessionId: 1, productId: 1, variantKey: 1 }, { unique: true });
inventoryReservationSchema.index({ status: 1, expiresAt: 1 }); // for sweep query

// MongoDB TTL index — auto-purge documents 1 hour after expiresAt
// (gives the sweep cron and monitoring time to log before deletion)
inventoryReservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export const InventoryReservation = mongoose.model('InventoryReservation', inventoryReservationSchema);
export default InventoryReservation;
