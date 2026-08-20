import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, index: true },
        password: { type: String, required: true, select: false },
        phone: { type: String, trim: true },

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
        avatar: { type: String }, // Cloudinary URL
        role: { type: String, enum: ['customer', 'delivery'], default: 'customer' },
        isVerified: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },
        otp: { type: String, select: false },
        otpExpiry: { type: Date, select: false },
        resetOtp: { type: String, select: false },
        resetOtpExpiry: { type: Date, select: false },
        resetOtpVerified: { type: Boolean, default: false, select: false },
        refreshTokenHash: { type: String, select: false },
        refreshTokenExpiresAt: { type: Date, select: false },
        passwordResetToken: { type: String, select: false },
        passwordResetExpiry: { type: Date, select: false },
    },
    { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);
export { User };
export default User;
