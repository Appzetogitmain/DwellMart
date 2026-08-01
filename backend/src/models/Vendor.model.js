import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {
    QUICK_COMMERCE_STORE_TYPES,
    QUICK_COMMERCE_AVAILABILITY,
    QUICK_COMMERCE_AVAILABILITY_VALUES,
} from '../constants/quickCommerce.js';

const vendorSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, index: true },
        password: { type: String, required: true, select: false },
        phone: { type: String },
        country: { type: String, trim: true, default: '' },
        storeName: { type: String, required: true },
        storeLogo: { type: String },
        storeDescription: { type: String },
        status: {
            type: String,
            enum: ['pending', 'approved', 'suspended', 'rejected'],
            default: 'pending',
            index: true,
        },
        suspensionReason: { type: String },
        commissionRate: { type: Number, default: 10, min: 0, max: 100 },
        isVerified: { type: Boolean, default: false },
        rating: { type: Number, default: 0 },
        reviewCount: { type: Number, default: 0 },
        totalSales: { type: Number, default: 0 },
        totalEarnings: { type: Number, default: 0 },
        shippingEnabled: { type: Boolean, default: true },
        freeShippingThreshold: { type: Number, default: 100, min: 0 },
        defaultShippingRate: { type: Number, default: 5, min: 0 },
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
            pausedUntil: { type: Date },
            minOrderValue: { type: Number, min: 0, default: 0 },
            packagingFee: { type: Number, min: 0, default: 0 },
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
        billing: {
            stripeCustomerId: { type: String, trim: true, default: null },
            razorpayCustomerId: { type: String, trim: true, default: null },
            preferredGateway: {
                type: String,
                enum: ['stripe', 'razorpay', null],
                default: null,
            },
        },
        joinDate: { type: Date, default: Date.now },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

vendorSchema.index({ status: 1, rating: -1, reviewCount: -1, createdAt: -1 });
vendorSchema.index({ status: 1, createdAt: -1 });
// Sparse: only Quick Commerce vendors carry a location, so non-QC vendors are
// excluded from the geo index entirely.
vendorSchema.index({ 'quickCommerceProfile.location': '2dsphere' }, { sparse: true });
vendorSchema.index({ 'sellingChannels.quickCommerce.enabled': 1, status: 1 });

vendorSchema.pre('save', async function (next) {
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

vendorSchema.pre('save', function enforceSellingChannel(next) {
    const retailEnabled = this.sellingChannels?.retail?.enabled !== false;
    const wholesaleEnabled = this.sellingChannels?.wholesale?.enabled === true;
    // A Quick Commerce-only vendor (e.g. a dark store) is valid, so it counts
    // toward the "at least one channel" requirement.
    const quickCommerceEnabled = this.sellingChannels?.quickCommerce?.enabled === true;
    if (!retailEnabled && !wholesaleEnabled && !quickCommerceEnabled) {
        return next(new Error('At least one selling channel (Retail, Wholesale, or Quick Commerce) must be enabled.'));
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

const Vendor = mongoose.model('Vendor', vendorSchema);
export { Vendor };
export default Vendor;
