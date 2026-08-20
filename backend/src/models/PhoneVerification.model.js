import mongoose from 'mongoose';

/**
 * Pre-account phone verification.
 *
 * Replaces the former `EmailVerification` collection. Both vendor registration
 * and delivery-partner registration need to prove a contact detail BEFORE the
 * account document exists, so the record is keyed on the contact itself rather
 * than on an account id.
 *
 * The key is E.164 (`+919876543210`), never the national-only form, because
 * that is what actually addresses a WhatsApp recipient — and because two
 * different countries can share a national number.
 *
 * A verified record is also an authority token: the onboarding routes carry no
 * session, and `assertOnboardingAuthority` accepts a verified record here as
 * proof that the caller controls the number on the account. It therefore has to
 * expire, which the TTL index below enforces.
 */
const phoneVerificationSchema = new mongoose.Schema(
    {
        phoneE164: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        otp: {
            type: String,
            required: true,
            select: false,
        },
        otpExpiry: {
            type: Date,
            required: true,
        },
        isVerified: {
            type: Boolean,
            default: false,
        },
        /** Bounds code-guessing against a record an attacker can name. */
        attempts: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

// Automatically remove the record after 15 minutes. Deliberately longer than
// the 5-minute code window so a user who lets a code lapse can request another
// against the same record rather than racing a deletion.
phoneVerificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 900 });

const PhoneVerification = mongoose.model('PhoneVerification', phoneVerificationSchema);

export default PhoneVerification;
