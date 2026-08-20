import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import User from '../../../models/User.model.js';
import { generateTokens } from '../../../utils/generateToken.js';
import { isMockOTP, isOTPMatch, sendOTP, sendResetOTP, OTP_EXPIRY_MINUTES } from '../../../services/otp.service.js';
import { sendEmail } from '../../../services/email.service.js';
import {
    uploadLocalFileToCloudinaryAndCleanup,
    deleteFromCloudinary,
    cleanupLocalFiles,
} from '../../../services/upload.service.js';
import {
    clearRefreshSession,
    decodeRefreshTokenOrThrow,
    persistRefreshSession,
    rotateRefreshSession,
} from '../../../services/refreshToken.service.js';
import { buildDeletedEmail } from '../../../utils/accountDeletion.js';
import { buildPhoneFields } from '../../../utils/phone.js';

const extractCloudinaryPublicId = (url = '') => {
    const raw = String(url || '').trim();
    if (!raw || !raw.includes('/upload/')) return null;
    try {
        const afterUpload = raw.split('/upload/')[1] || '';
        const withoutTransform = afterUpload.includes('/') ? afterUpload.substring(afterUpload.indexOf('/') + 1) : afterUpload;
        const cleaned = withoutTransform.replace(/^v\d+\//, '');
        const withoutExtension = cleaned.replace(/\.[^/.]+$/, '');
        return withoutExtension || null;
    } catch {
        return null;
    }
};

// POST /api/user/auth/register
export const register = asyncHandler(async (req, res) => {
    const { name, email, password, phone } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    // `phone` keeps its national-only shape for downstream consumers; the E.164
    // form is derived from the raw input so the country code is not lost.
    const { phone: normalizedPhone, phoneE164 } = buildPhoneFields(phone);

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) throw new ApiError(409, 'Email already registered.');

    const user = await User.create({
        name: String(name || '').trim(),
        email: normalizedEmail,
        password,
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
        ...(phoneE164 ? { phoneE164 } : {}),
    });
    const delivery = await sendOTP(user, 'email_verification');

    res.status(201).json(new ApiResponse(201, {
        email: user.email,
        // Delivery metadata only — the code itself never leaves the server.
        otpChannel: delivery.channel,
        otpExpiresInMinutes: OTP_EXPIRY_MINUTES,
    }, 'Registration successful. Please verify your account.'));
});

// POST /api/user/auth/verify-otp
export const verifyOTP = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail }).select('+otp +otpExpiry +otpDeliveredVia');
    if (!user) throw new ApiError(404, 'User not found.');
    if (!isOTPMatch(user.otp, otp)) throw new ApiError(400, 'Invalid OTP.');
    if (!isMockOTP(otp) && user.otpExpiry < Date.now()) throw new ApiError(400, 'OTP has expired. Please request a new one.');

    user.isVerified = true;

    // The phone is proven ONLY when WhatsApp was the sole carrier of this code.
    // Under the rollout's dual delivery the same code also reaches the inbox,
    // so verifying it says nothing about who holds the handset.
    if (user.otpDeliveredVia === 'whatsapp') {
        user.phoneVerified = true;
    }

    user.otp = undefined;
    user.otpExpiry = undefined;
    user.otpDeliveredVia = undefined;
    await user.save();

    const { accessToken, refreshToken } = generateTokens({ id: user._id, role: 'customer', email: user.email });
    await persistRefreshSession(user, refreshToken);
    res.status(200).json(new ApiResponse(200, { accessToken, refreshToken, user: { id: user._id, name: user.name, email: user.email } }, 'Email verified successfully.'));
});

// POST /api/user/auth/login
export const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user) throw new ApiError(401, 'Invalid email or password.');
    if (!user.isActive) throw new ApiError(403, 'Your account has been deactivated.');
    if (!user.isVerified) {
        await sendOTP(user, 'email_verification');
        throw new ApiError(403, 'Email not verified. A new OTP has been sent to your email.');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) throw new ApiError(401, 'Invalid email or password.');

    const { accessToken, refreshToken } = generateTokens({ id: user._id, role: 'customer', email: user.email });
    await persistRefreshSession(user, refreshToken);
    res.status(200).json(new ApiResponse(200, { accessToken, refreshToken, user: { id: user._id, name: user.name, email: user.email, avatar: user.avatar } }, 'Login successful.'));
});

// POST /api/user/auth/refresh
export const refresh = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const decoded = decodeRefreshTokenOrThrow(refreshToken);
    const user = await User.findById(decoded.id).select('+refreshTokenHash +refreshTokenExpiresAt isActive isVerified');

    if (!user) throw new ApiError(401, 'Invalid refresh token.');
    if (!user.isActive) throw new ApiError(403, 'Your account has been deactivated.');
    if (!user.isVerified) throw new ApiError(403, 'Please verify your email first.');

    const tokens = await rotateRefreshSession(
        user,
        { id: user._id, role: 'customer', email: user.email },
        refreshToken
    );

    return res.status(200).json(
        new ApiResponse(200, tokens, 'Session refreshed successfully.')
    );
});

// POST /api/user/auth/logout
export const logout = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        try {
            const decoded = decodeRefreshTokenOrThrow(refreshToken);
            const user = await User.findById(decoded.id).select('+refreshTokenHash +refreshTokenExpiresAt');
            if (user?.refreshTokenHash) {
                await clearRefreshSession(user);
            }
        } catch {
            // Keep logout idempotent.
        }
    }
    return res.status(200).json(new ApiResponse(200, null, 'Logged out successfully.'));
});

// POST /api/user/auth/resend-otp
export const resendOTP = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) throw new ApiError(404, 'User not found.');
    if (user.isVerified) throw new ApiError(400, 'Email already verified.');

    const delivery = await sendOTP(user, 'email_verification');
    res.status(200).json(new ApiResponse(200, {
        otpChannel: delivery.channel,
        otpExpiresInMinutes: OTP_EXPIRY_MINUTES,
    }, 'OTP resent successfully.'));
});

// POST /api/user/auth/forgot-password
export const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail }).select('+resetOtp +resetOtpExpiry +resetOtpVerified');

    // Generic response to avoid account enumeration.
    if (!user) {
        return res.status(200).json(new ApiResponse(200, null, 'If the email exists, a reset OTP has been sent.'));
    }
    if (!user.isVerified) {
        await sendOTP(user, 'email_verification');
        throw new ApiError(403, 'Please verify your email first. A new verification OTP has been sent.');
    }

    // Unified OTP service: cryptographic code, 5-minute window, and
    // WhatsApp-only-when-the-number-is-proven channel policy.
    await sendResetOTP(user, 'password_reset');

    // The delivery channel is deliberately NOT reported here. This endpoint
    // answers identically for an unknown email to avoid account enumeration,
    // and "sent via WhatsApp" would confirm both that the account exists and
    // that it carries a verified phone.
    return res.status(200).json(new ApiResponse(200, null, 'If the email exists, a reset OTP has been sent.'));
});

// POST /api/user/auth/verify-reset-otp
export const verifyResetOTP = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail }).select('+resetOtp +resetOtpExpiry +resetOtpVerified');
    if (!user) throw new ApiError(404, 'User not found.');
    if (!user.resetOtp || !user.resetOtpExpiry) throw new ApiError(400, 'No reset OTP requested.');
    if (user.resetOtpExpiry < new Date()) throw new ApiError(400, 'Reset OTP has expired.');
    if (user.resetOtp !== String(otp)) throw new ApiError(400, 'Invalid reset OTP.');

    user.resetOtpVerified = true;
    await user.save({ validateBeforeSave: false });

    return res.status(200).json(new ApiResponse(200, null, 'Reset OTP verified.'));
});

// POST /api/user/auth/reset-password
export const resetPassword = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail }).select('+password +resetOtp +resetOtpExpiry +resetOtpVerified');
    if (!user) throw new ApiError(404, 'User not found.');
    if (!user.resetOtpVerified) throw new ApiError(400, 'Please verify reset OTP first.');
    if (!user.resetOtp || !user.resetOtpExpiry) throw new ApiError(400, 'No reset OTP requested.');
    if (user.resetOtpExpiry < new Date()) throw new ApiError(400, 'Reset OTP has expired.');

    user.password = password;
    user.resetOtp = undefined;
    user.resetOtpExpiry = undefined;
    user.resetOtpVerified = false;
    user.refreshTokenHash = undefined;
    user.refreshTokenExpiresAt = undefined;
    await user.save();

    return res.status(200).json(new ApiResponse(200, null, 'Password reset successful. Please login.'));
});

// GET /api/user/auth/profile
export const getProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) throw new ApiError(404, 'User not found.');
    res.status(200).json(new ApiResponse(200, user, 'Profile fetched.'));
});

// PUT /api/user/auth/profile
export const updateProfile = asyncHandler(async (req, res) => {
    const { name, phone } = req.body;
    const normalizedName = String(name || '').trim();
    const { phone: normalizedPhone, phoneE164 } = buildPhoneFields(phone);

    const current = await User.findById(req.user.id).select('phoneE164');
    if (!current) throw new ApiError(404, 'User not found.');

    const updatePayload = {
        name: normalizedName,
        phone: normalizedPhone || undefined,
    };

    // Changing the number invalidates any prior proof of ownership: the new
    // number has not been verified, and password reset trusts that flag.
    if (phoneE164 && phoneE164 !== current.phoneE164) {
        updatePayload.phoneE164 = phoneE164;
        updatePayload.phoneVerified = false;
        updatePayload.whatsappOptInAt = null;
    }

    const user = await User.findByIdAndUpdate(
        req.user.id,
        updatePayload,
        { new: true, runValidators: true }
    );
    if (!user) throw new ApiError(404, 'User not found.');
    res.status(200).json(new ApiResponse(200, user, 'Profile updated.'));
});

// POST /api/user/auth/change-password
export const changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        throw new ApiError(400, 'Current password and new password are required.');
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user) throw new ApiError(404, 'User not found.');

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) throw new ApiError(400, 'Current password is incorrect.');
    if (String(currentPassword) === String(newPassword)) {
        throw new ApiError(400, 'New password must be different from current password.');
    }
    if (String(newPassword).length < 6) {
        throw new ApiError(400, 'New password must be at least 6 characters.');
    }

    user.password = newPassword;
    user.refreshTokenHash = undefined;
    user.refreshTokenExpiresAt = undefined;
    await user.save();

    res.status(200).json(new ApiResponse(200, null, 'Password changed successfully.'));
});

// POST /api/user/auth/profile/avatar
export const uploadProfileAvatar = asyncHandler(async (req, res) => {
    if (!req.file?.path) {
        throw new ApiError(400, 'Avatar image file is required.');
    }

    let uploaded = null;
    try {
        uploaded = await uploadLocalFileToCloudinaryAndCleanup(
            req.file.path,
            'users/avatars'
        );

        const existingUser = await User.findById(req.user.id).select('avatar');
        if (!existingUser) throw new ApiError(404, 'User not found.');
        const previousAvatar = String(existingUser.avatar || '').trim();

        const user = await User.findByIdAndUpdate(
            req.user.id,
            { avatar: uploaded.url },
            { new: true, runValidators: true }
        );
        if (!user) throw new ApiError(404, 'User not found.');

        const previousPublicId = extractCloudinaryPublicId(previousAvatar);
        if (previousPublicId && previousPublicId !== uploaded.publicId) {
            await deleteFromCloudinary(previousPublicId).catch(() => null);
        }

        return res.status(200).json(
            new ApiResponse(
                200,
                { user, avatar: uploaded.url, publicId: uploaded.publicId },
                'Profile picture updated successfully.'
            )
        );
    } catch (error) {
        if (!uploaded) {
            await cleanupLocalFiles([req.file?.path]);
        }
        if (uploaded?.publicId) {
            await deleteFromCloudinary(uploaded.publicId).catch(() => null);
        }
        throw error;
    }
});

// DELETE /api/user/auth/account
export const deleteAccount = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select('+refreshTokenHash +refreshTokenExpiresAt avatar');
    if (!user) throw new ApiError(404, 'User not found.');

    // Delete avatar from Cloudinary if it exists
    const avatarPublicId = extractCloudinaryPublicId(String(user.avatar || ''));
    if (avatarPublicId) {
        await deleteFromCloudinary(avatarPublicId).catch(() => null);
    }

    // Soft delete: anonymize PII and deactivate the account
    const deletedAt = Date.now();
    user.name = `Deleted User ${deletedAt}`;
    user.email = buildDeletedEmail('customer', user._id, deletedAt);
    user.phone = undefined;
    user.avatar = undefined;
    user.isActive = false;
    user.refreshTokenHash = undefined;
    user.refreshTokenExpiresAt = undefined;
    await user.save({ validateBeforeSave: false });

    return res.status(200).json(new ApiResponse(200, null, 'Account deleted successfully.'));
});
