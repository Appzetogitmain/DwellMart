import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {
    QUICK_COMMERCE_STORE_TYPES,
    QUICK_COMMERCE_AVAILABILITY,
    QUICK_COMMERCE_AVAILABILITY_VALUES,
} from '../constants/quickCommerce.js';
import { VendorCapabilities, VENDOR_TYPE_VALUES } from '../constants/vendorCapabilities.js';
import { VENDOR_CHANNEL_STATUS_VALUES } from '../constants/vendorChannels.js';
import { channelSummary, projectSellingChannels } from '../services/vendorChannel.service.js';

const channelStateSchema = new mongoose.Schema({
    status: { type: String, enum: VENDOR_CHANNEL_STATUS_VALUES, default: 'disabled', index: true },
    requestedAt: { type: Date, default: null },
    activatedAt: { type: Date, default: null },
    pausedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    disabledAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    requestedBy: { type: String, enum: ['vendor', 'admin', 'migration', null], default: null },
    reason: { type: String, trim: true, default: '' },
}, { _id: false });

const vendorSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, index: true },
        password: { type: String, required: true, select: false },
        phone: { type: String },

        /**
         * WhatsApp addressing + consent.
         *
         * `phone` is preserved verbatim as the display value. `phoneE164` is
         * the normalised form used to address WhatsApp, kept separate so a
         * bad normalisation can never destroy what the user actually typed.
         *
         * No unique index: production already contains duplicate phone values,
         * and adding one here would fail the migration rather than surface them.
         */
        phoneE164: { type: String, trim: true, default: null, index: true, sparse: true },
        phoneVerified: { type: Boolean, default: false },
        whatsappOptIn: { type: Boolean, default: false },
        whatsappOptInAt: { type: Date, default: null },
        /**
         * Which channel carried the CURRENT verification code.
         *
         * Only 'whatsapp' — meaning WhatsApp was the sole carrier — lets a
         * successful verification prove the handset. See otp.service.js.
         */
        otpDeliveredVia: { type: String, default: null, select: false },
        country: { type: String, trim: true, default: '' },
        storeName: { type: String, required: true },
        storeLogo: { type: String },
        storeDescription: { type: String },
        /**
         * Legacy business classification retained during migration. It is
         * informational only and must never grant operational permissions.
         */
        vendorType: {
            type: String,
            enum: VENDOR_TYPE_VALUES,
            default: 'retail',
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'suspended', 'rejected'],
            default: 'pending',
            index: true,
        },
        suspensionReason: { type: String },
        // Soft-deleted vendors are excluded from authentication, checkout, and
        // discovery while historical orders keep their vendor reference.
        isActive: { type: Boolean, default: true, index: true },
        commissionRate: { type: Number, default: 10, min: 0, max: 100 },
        isVerified: { type: Boolean, default: false },
        rating: { type: Number, default: 0 },
        reviewCount: { type: Number, default: 0 },
        totalSales: { type: Number, default: 0 },
        totalEarnings: { type: Number, default: 0 },
        bestSellerScore: { type: Number, default: 0, index: true },
        followersCount: { type: Number, default: 0 },
        shippingEnabled: { type: Boolean, default: true },
        freeShippingThreshold: { type: Number, default: 1000, min: 0 },
        defaultShippingRate: { type: Number, default: 65, min: 0 },
        shippingMethods: {
            type: [{ type: String, enum: ['standard', 'express', 'overnight'] }],
            default: ['standard'],
        },
        handlingTime: { type: Number, default: 1, min: 0 },
        processingTime: { type: Number, default: 1, min: 0 },
        address: {
            street: String,
            city: String,
            state: String,
            zipCode: String,
            country: String,
            formattedAddress: String,
        },
        bankDetails: {
            accountName: { type: String },
            accountNumber: { type: String },
            bankName: { type: String },
            ifscCode: { type: String },
            upiId: { type: String },
        },
        documents: {
            gst: String,
            pan: String,
            aadhar: String,
            businessLicense: String,
            msme: String,
            uin: String,
            enrolmentId: String,
            tradeLicense: {
                url: { type: String },
                fileType: { type: String, enum: ['image', 'pdf', 'word'] },
            },
        },
        sellingChannels: {
            retail: {
                enabled: { type: Boolean, default: true },
            },
            wholesale: {
                enabled: { type: Boolean, default: false },
            },
            // Quick Commerce is a separate shopping experience, not a marketplace
            // channel. Defaults false so every existing vendor is unaffected.
            quickCommerce: {
                enabled: { type: Boolean, default: false },
            },
        },
        // Canonical operational authority. `vendorType` and `sellingChannels`
        // remain compatibility projections during the staged migration.
        channels: {
            retail: { type: channelStateSchema, default: () => ({ status: 'disabled' }) },
            wholesale: { type: channelStateSchema, default: () => ({ status: 'disabled' }) },
            quickCommerce: { type: channelStateSchema, default: () => ({ status: 'disabled' }) },
        },
        channelsRevision: { type: Number, default: 0, min: 0 },
        /**
         * Stamped by migration 0008. Present and equal to the migration
         * version means "this vendor's canonical channels were backfilled".
         * The migration selects on this rather than on `$exists` of the
         * channel sub-documents, which Mongoose now writes by default and
         * which therefore cannot distinguish migrated from unmigrated.
         */
        channelMigrationVersion: { type: Number, default: null },
        /**
         * Original `vendorType` when migration 0008 had to normalise an
         * unrecognised value. Retained so the rewrite stays auditable and
         * recoverable rather than destructive.
         */
        legacyVendorTypeBeforeChannelMigration: { type: String, default: null },
        /**
         * Explicit test/seed account marker. Public listings exclude these.
         * Replaces a hardcoded store-name regex that classified production
         * vendors by name and hid legitimate sellers whose names happened to
         * contain "demo", "sample", "test" and similar.
         */
        isTestAccount: { type: Boolean, default: false, index: true },
        // Quick Commerce operating profile. Populated only for vendors on the
        // Quick Commerce channel; every field is optional so existing vendor
        // documents remain valid without migration.
        quickCommerceProfile: {
            storeType: {
                type: String,
                enum: QUICK_COMMERCE_STORE_TYPES,
            },
            // GeoJSON Point — note the [longitude, latitude] axis order.
            location: {
                type: {
                    type: String,
                    enum: ['Point'],
                },
                coordinates: {
                    type: [Number],
                },
            },
            locationAddress: { type: String, trim: true },
            serviceRadiusKm: { type: Number, min: 0.5, default: 5 },
            // Fallback serviceability when a customer denies location access.
            servicedPincodes: [{ type: String, trim: true }],
            preparationTimeMins: { type: Number, min: 0, default: 10 },
            businessHours: [
                {
                    _id: false,
                    day: { type: Number, min: 0, max: 6, required: true },
                    open: { type: String, trim: true },
                    close: { type: String, trim: true },
                    isClosed: { type: Boolean, default: false },
                },
            ],
            availabilityStatus: {
                type: String,
                enum: QUICK_COMMERCE_AVAILABILITY_VALUES,
                default: QUICK_COMMERCE_AVAILABILITY.OPEN,
            },
            // Added to the ETA while the store is marked busy.
            busyExtraMins: { type: Number, min: 0, default: 10 },
            minOrderValue: { type: Number, min: 0, default: 0 },
            packagingFee: { type: Number, min: 0, default: 0 },
            baseFee: { type: Number, min: 0 },
            perKmFee: { type: Number, min: 0 },
            freeAboveSubtotal: { type: Number, min: 0 },
            freeDeliveryEnabled: { type: Boolean },
            maxDeliveryDistanceKm: { type: Number, min: 0.5 },
        },
        wholesaleProfile: {
            gstNumber: { type: String, trim: true },
            businessName: { type: String, trim: true },
            businessAddress: {
                street: String,
                city: String,
                state: String,
                zipCode: String,
                country: String,
            },
            wholesaleContactName: { type: String, trim: true },
            wholesaleContactPhone: { type: String, trim: true },
            bulkOrderSupportEmail: { type: String, trim: true, lowercase: true },
        },
        otp: { type: String, select: false },
        otpExpiry: { type: Date, select: false },
        resetOtp: { type: String, select: false },
        resetOtpExpiry: { type: Date, select: false },
        resetOtpVerified: { type: Boolean, default: false, select: false },
        refreshTokenHash: { type: String, select: false },
        refreshTokenExpiresAt: { type: Date, select: false },
        agreedToTerms: { type: Boolean, default: false },
        agreedToTermsAt: { type: Date },
        onboardingStatus: {
            type: String,
            enum: ['registered', 'email_verified', 'plan_selected', 'payment_pending', 'subscription_active'],
            default: 'registered',
        },
        onboardingStartedAt: { type: Date, default: Date.now },
        onboardingCompletedAt: { type: Date },
        onboardingEmailSentAt: { type: Date, default: null },
        onboardingEmailInvoiceId: { type: String, trim: true, default: null },
        selectedPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan' },
        hasUsedTrial: { type: Boolean, default: false, index: true },
        trialUsedAt: { type: Date, default: null },
        billing: {},
        joinDate: { type: Date, default: Date.now },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

vendorSchema.index({ status: 1, bestSellerScore: -1, rating: -1, createdAt: -1 });
vendorSchema.index({ status: 1, rating: -1, reviewCount: -1, createdAt: -1 });
vendorSchema.index({ status: 1, createdAt: -1 });
// Sparse: only Quick Commerce vendors carry a location, so non-QC vendors are
// excluded from the geo index entirely.
vendorSchema.index({ 'quickCommerceProfile.location': '2dsphere' }, { sparse: true });
vendorSchema.index({ 'sellingChannels.quickCommerce.enabled': 1, status: 1 });
vendorSchema.index({ 'channels.retail.status': 1, status: 1, isActive: 1 });
vendorSchema.index({ 'channels.wholesale.status': 1, status: 1, isActive: 1 });
vendorSchema.index({ 'channels.quickCommerce.status': 1, status: 1, isActive: 1 });

vendorSchema.pre('save', async function (next) {
    // Calculate Best Seller Score
    const salesScore = (Number(this.totalSales) || 0) * 0.40;
    const ratingScore = (Number(this.rating) || 0) * 10 * 0.30;
    const reviewScore = (Number(this.reviewCount) || 0) * 0.15;
    const verifiedBonus = this.isVerified ? 10 : 0;
    this.bestSellerScore = salesScore + ratingScore + reviewScore + verifiedBonus;

    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

vendorSchema.pre('save', function syncCountry(next) {
    if (!this.country && this.address?.country) {
        this.country = String(this.address.country).trim();
    }
    if (!this.address?.country && this.country) {
        this.address = this.address || {};
        this.address.country = this.country;
    }
    next();
});

/**
 * Keep sellingChannels as a compatibility/search projection. Canonical
 * channel states drive it after cutover; legacy mode is rollback-only.
 */
// Compatibility projection: canonical channels are authoritative outside the
// temporary legacy rollback mode.
vendorSchema.pre('save', function syncSellingChannelProjection(next) {
    if (String(process.env.VENDOR_CHANNEL_AUTHORITY_MODE || 'channels').toLowerCase() !== 'legacy') {
        this.sellingChannels = projectSellingChannels(this);
        return next();
    }
    const caps = VendorCapabilities[this.vendorType];
    if (caps?.internalChannels) {
        this.sellingChannels = {
            retail:        { enabled: caps.internalChannels.retail === true },
            wholesale:     { enabled: caps.internalChannels.wholesale === true },
            quickCommerce: { enabled: caps.internalChannels.quickCommerce === true },
        };
    }
    next();
});

vendorSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

vendorSchema.virtual('selectedPlanId')
    .get(function selectedPlanId() {
        return this.selectedPlan;
    })
    .set(function selectedPlanId(value) {
        this.selectedPlan = value;
    });

vendorSchema.methods.toPublicVendor = function () {
    const obj = this.toObject ? this.toObject() : { ...this };
    delete obj.password;
    delete obj.bankDetails;
    delete obj.otp;
    delete obj.otpExpires;

    return {
        ...obj,
        vendorType: this.vendorType || 'retail',
        // Derived helpers for backward-compat with any existing consumer code
        supportsMarketplace: this.channels?.retail?.status === 'active',
        supportsWholesale: this.channels?.wholesale?.status === 'active',
        supportsQuickCommerce: this.channels?.quickCommerce?.status === 'active',
        ...channelSummary(this),
    };
};

vendorSchema.index({ status: 1, vendorType: 1 });
// Keep channel indexes for catalog/search that still uses sellingChannels internally
vendorSchema.index({ status: 1, 'sellingChannels.wholesale.enabled': 1 });
vendorSchema.index({ 'sellingChannels.wholesale.enabled': 1 });

const Vendor = mongoose.model('Vendor', vendorSchema);
export { Vendor };
export default Vendor;
