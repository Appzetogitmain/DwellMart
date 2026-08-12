import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { EXPERIENCES, EXPERIENCE_VALUES } from '../constants/experiences.js';

const deliveryBoySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true },
        password: { type: String, required: true, select: false },
        phone: { type: String, required: true },
        address: { type: String, trim: true },
        vehicleType: { type: String, trim: true },
        vehicleNumber: { type: String, trim: true },
        avatar: { type: String },
        applicationStatus: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
            index: true,
        },
        rejectionReason: { type: String, trim: true },
        documents: {
            drivingLicense: { type: String, trim: true },
            aadharCard: { type: String, trim: true },
        },
        resetOtp: { type: String, select: false },
        resetOtpExpiry: { type: Date, select: false },
        resetOtpVerified: { type: Boolean, default: false, select: false },
        refreshTokenHash: { type: String, select: false },
        refreshTokenExpiresAt: { type: Date, select: false },
        isActive: { type: Boolean, default: true },
        isAvailable: { type: Boolean, default: true },
        status: {
            type: String,
            enum: ['available', 'busy', 'offline'],
            default: 'available',
        },
        // Legacy shape: plain numbers, not geo-queryable. Retained and still
        // dual-written so every existing reader keeps working; `location` below
        // is the geo-queryable form. Do not remove until a full release cycle
        // after the backfill (see scripts/migrateDeliveryBoyLocation.js).
        currentLocation: {
            lat: { type: Number },
            lng: { type: Number },
        },
        /**
         * GeoJSON Point — note the [lng, lat] axis order, which is the reverse
         * of the `currentLocation` field above and of how humans write
         * coordinates. Sparse 2dsphere: riders who have never reported a
         * location are simply absent from geo queries rather than matching at
         * [0,0] in the Gulf of Guinea.
         */
        location: {
            type: {
                type: String,
                enum: ['Point'],
            },
            coordinates: { type: [Number] },
        },
        /** Staleness detection — a rider who stopped reporting is not assignable. */
        lastLocationAt: { type: Date },
        /**
         * Which experiences this rider serves. Defaults to marketplace only, so
         * no existing rider is silently enrolled into Quick Commerce.
         */
        experiences: {
            type: [String],
            enum: EXPERIENCE_VALUES,
            default: () => [EXPERIENCES.MARKETPLACE],
            index: true,
        },
        /**
         * The order this rider is currently carrying, or null when free.
         * This is the field the atomic assignment claim filters on — it is what
         * stops two simultaneous orders claiming the same rider.
         */
        activeOrderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            default: null,
            index: true,
        },
        totalDeliveries: { type: Number, default: 0 },
        rating: { type: Number, default: 0 },
        /**
         * Lifetime COD cash the rider has HANDED BACK to the platform, not
         * money earned. Kept for backward compatibility with existing reads;
         * `DeliveryCashLedger` is authoritative for cash in hand.
         */
        cashCollected: { type: Number, default: 0 },

        /**
         * Where the rider's wallet payouts are sent.
         *
         * Mirrors `Vendor.bankDetails` in shape and, like it, is stripped from
         * serialized output — a payout destination is not profile data and must
         * never travel in a list response.
         *
         * Account-takeover followed by a redirected payout is the primary attack
         * on this surface, so a change starts a cooling-off clock that the
         * withdrawal path refuses to pay through.
         */
        payoutDetails: {
            method: { type: String, enum: ['upi', 'bank_transfer', null], default: null },
            upiId: { type: String, trim: true, default: '' },
            accountName: { type: String, trim: true, default: '' },
            accountNumber: { type: String, trim: true, default: '' },
            ifscCode: { type: String, trim: true, uppercase: true, default: '' },
            bankName: { type: String, trim: true, default: '' },
            verifiedAt: { type: Date, default: null },
            verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
            lastChangedAt: { type: Date, default: null },
            coolingOffUntil: { type: Date, default: null },
        },
    },
    { timestamps: true }
);

/**
 * Never serialize payout destinations or credentials.
 * Mirrors the same guard on the Vendor model.
 */
deliveryBoySchema.methods.toJSON = function toJSON() {
    const obj = this.toObject();
    delete obj.password;
    delete obj.payoutDetails;
    delete obj.resetOtp;
    delete obj.resetOtpExpiry;
    delete obj.refreshTokenHash;
    return obj;
};

// Sparse so riders without a reported location are excluded, not defaulted.
deliveryBoySchema.index({ location: '2dsphere' }, { sparse: true });
// Backs the assignment candidate query (free + approved + available riders).
deliveryBoySchema.index({ activeOrderId: 1, status: 1, isAvailable: 1, applicationStatus: 1 });
// PERF-5: Backs the QC sweep staleness check (riders who have gone dark mid-delivery).
deliveryBoySchema.index({ lastLocationAt: 1, isAvailable: 1, status: 1 });

deliveryBoySchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

deliveryBoySchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const DeliveryBoy = mongoose.model('DeliveryBoy', deliveryBoySchema);
export default DeliveryBoy;
