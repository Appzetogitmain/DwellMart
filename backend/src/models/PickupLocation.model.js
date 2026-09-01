import mongoose from 'mongoose';

/**
 * Vendor pickup location.
 *
 * This model existed but was imported by ZERO files — the Vendor → Pickup
 * Locations screen persisted entirely to `localStorage`, so a vendor's
 * fulfilment addresses lived in one browser profile and were lost on a cache
 * clear. There was no API at all.
 *
 * The shape below matches what that screen already sent, so the existing UI
 * needs only its persistence swapped rather than a redesign.
 */
const operatingDaySchema = new mongoose.Schema(
    {
        open: { type: String, default: '09:00' },
        close: { type: String, default: '18:00' },
        closed: { type: Boolean, default: false },
    },
    { _id: false }
);

const pickupLocationSchema = new mongoose.Schema(
    {
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
        name: { type: String, required: true, trim: true },
        address: {
            street: { type: String, trim: true, default: '' },
            city: { type: String, trim: true, default: '' },
            state: { type: String, trim: true, default: '' },
            zipCode: { type: String, trim: true, default: '' },
            country: { type: String, trim: true, default: 'India' },
            latitude: { type: Number, default: null },
            longitude: { type: Number, default: null },
        },
        phone: { type: String, trim: true, default: '' },
        email: { type: String, trim: true, lowercase: true, default: '' },
        isActive: { type: Boolean, default: true },
        isDefault: { type: Boolean, default: false },
        operatingHours: {
            monday: { type: operatingDaySchema, default: () => ({}) },
            tuesday: { type: operatingDaySchema, default: () => ({}) },
            wednesday: { type: operatingDaySchema, default: () => ({}) },
            thursday: { type: operatingDaySchema, default: () => ({}) },
            friday: { type: operatingDaySchema, default: () => ({}) },
            saturday: { type: operatingDaySchema, default: () => ({ open: '10:00', close: '16:00' }) },
            sunday: { type: operatingDaySchema, default: () => ({ open: '10:00', close: '16:00', closed: true }) },
        },
    },
    { timestamps: true }
);

pickupLocationSchema.index({ vendorId: 1, isActive: 1 });

/**
 * At most one default location per vendor. Partial so the many non-default
 * locations do not collide on `false`.
 */
pickupLocationSchema.index(
    { vendorId: 1 },
    {
        unique: true,
        partialFilterExpression: { isDefault: true },
        name: 'unique_default_pickup_per_vendor',
    }
);

const PickupLocation = mongoose.model('PickupLocation', pickupLocationSchema);
export default PickupLocation;
export { PickupLocation };
