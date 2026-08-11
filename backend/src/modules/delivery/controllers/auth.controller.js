import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import Order from '../../../models/Order.model.js';
import Admin from '../../../models/Admin.model.js';
import { generateTokens } from '../../../utils/generateToken.js';
import { createNotification } from '../../../services/notification.service.js';
import { sendEmail } from '../../../services/email.service.js';
import { cleanupLocalFiles } from '../../../services/upload.service.js';
import { LATITUDE_BOUNDS, LONGITUDE_BOUNDS } from '../../../constants/quickCommerce.js';
import {
    clearRefreshSession,
    decodeRefreshTokenOrThrow,
    persistRefreshSession,
    rotateRefreshSession,
} from '../../../services/refreshToken.service.js';
import { buildDeletedEmail, FINAL_ORDER_STATUSES } from '../../../utils/accountDeletion.js';

const getUploadedPath = (file) => {
    if (!file?.filename) return '';
    return `/uploads/delivery-docs/${file.filename}`;
};

// POST /api/delivery/auth/register
export const register = asyncHandler(async (req, res) => {
    const { name, email, password, phone, address, vehicleType, vehicleNumber } = req.body;

    const drivingLicenseFile = req.files?.drivingLicense?.[0];
    const aadharCardFile = req.files?.aadharCard?.[0];

    if (!drivingLicenseFile || !aadharCardFile) {
        throw new ApiError(400, 'Driving license and Aadhar card are required.');
    }

    const normalizedEmail = String(email || '').trim().toLowerCase();
    let deliveryBoy = null;

    try {
        const existing = await DeliveryBoy.findOne({ email: normalizedEmail });
        if (existing) throw new ApiError(409, 'Email already registered.');

        deliveryBoy = await DeliveryBoy.create({
            name: String(name || '').trim(),
            email: normalizedEmail,
            password,
            phone: String(phone || '').trim(),
            address: String(address || '').trim(),
            vehicleType: String(vehicleType || '').trim(),
            vehicleNumber: String(vehicleNumber || '').trim(),
            documents: {
                drivingLicense: getUploadedPath(drivingLicenseFile),
                aadharCard: getUploadedPath(aadharCardFile),
            },
            applicationStatus: 'pending',
            isActive: false,
            isAvailable: false,
            status: 'offline',
        });

        const admins = await Admin.find({ isActive: true }).select('_id');
        await Promise.all(
            admins.map((admin) =>
                createNotification({
                    recipientId: admin._id,
                    recipientType: 'admin',
                    title: 'New Delivery Registration',
                    message: `${deliveryBoy.name} has registered as delivery partner and is awaiting approval.`,
                    type: 'system',
                    data: {
                        deliveryBoyId: String(deliveryBoy._id),
                        deliveryEmail: deliveryBoy.email,
                        applicationStatus: deliveryBoy.applicationStatus,
                    },
                })
            )
        );

        res.status(201).json(
            new ApiResponse(201, { email: deliveryBoy.email }, 'Registration submitted. Awaiting admin approval.')
        );
    } catch (error) {
        const shouldCleanupLocalDocs = !deliveryBoy;
        if (shouldCleanupLocalDocs) {
            await cleanupLocalFiles([
                drivingLicenseFile?.path,
                aadharCardFile?.path,
            ]);
        }
        throw error;
    }
});

// POST /api/delivery/auth/forgot-password
export const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const deliveryBoy = await DeliveryBoy.findOne({ email: normalizedEmail }).select('+resetOtp +resetOtpExpiry +resetOtpVerified');

    // Generic response to prevent account enumeration
    if (!deliveryBoy) {
        return res.status(200).json(
            new ApiResponse(200, null, 'If the email exists, a reset OTP has been sent.')
        );
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    deliveryBoy.resetOtp = otp;
    deliveryBoy.resetOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    deliveryBoy.resetOtpVerified = false;
    await deliveryBoy.save({ validateBeforeSave: false });

    try {
        await sendEmail({
            to: deliveryBoy.email,
            subject: 'Delivery password reset OTP',
            text: `Your password reset OTP is ${otp}. It expires in 10 minutes.`,
            html: `<p>Your password reset OTP is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
        });
    } catch (err) {
        console.warn(`[Delivery Forgot Password] Email send failed for ${deliveryBoy.email}: ${err.message}`);
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[Delivery Forgot Password] Reset OTP generated for ${deliveryBoy.email}`);
        }
    }

    return res.status(200).json(
        new ApiResponse(200, null, 'If the email exists, a reset OTP has been sent.')
    );
});

// POST /api/delivery/auth/verify-reset-otp
export const verifyResetOTP = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const deliveryBoy = await DeliveryBoy.findOne({ email: normalizedEmail }).select('+resetOtp +resetOtpExpiry +resetOtpVerified');
    if (!deliveryBoy) throw new ApiError(404, 'Delivery user not found.');
    if (!deliveryBoy.resetOtp || !deliveryBoy.resetOtpExpiry) throw new ApiError(400, 'No reset OTP requested.');
    if (deliveryBoy.resetOtpExpiry < new Date()) throw new ApiError(400, 'Reset OTP has expired.');
    if (deliveryBoy.resetOtp !== String(otp)) throw new ApiError(400, 'Invalid reset OTP.');

    deliveryBoy.resetOtpVerified = true;
    await deliveryBoy.save({ validateBeforeSave: false });

    return res.status(200).json(new ApiResponse(200, null, 'Reset OTP verified.'));
});

// POST /api/delivery/auth/reset-password
export const resetPassword = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const deliveryBoy = await DeliveryBoy.findOne({ email: normalizedEmail }).select('+password +resetOtp +resetOtpExpiry +resetOtpVerified');
    if (!deliveryBoy) throw new ApiError(404, 'Delivery user not found.');
    if (!deliveryBoy.resetOtpVerified) throw new ApiError(400, 'Please verify reset OTP first.');
    if (!deliveryBoy.resetOtp || !deliveryBoy.resetOtpExpiry) throw new ApiError(400, 'No reset OTP requested.');
    if (deliveryBoy.resetOtpExpiry < new Date()) throw new ApiError(400, 'Reset OTP has expired.');

    deliveryBoy.password = password;
    deliveryBoy.resetOtp = undefined;
    deliveryBoy.resetOtpExpiry = undefined;
    deliveryBoy.resetOtpVerified = false;
    deliveryBoy.refreshTokenHash = undefined;
    deliveryBoy.refreshTokenExpiresAt = undefined;
    await deliveryBoy.save();

    return res.status(200).json(new ApiResponse(200, null, 'Password reset successful. Please login.'));
});

// POST /api/delivery/auth/login
export const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const deliveryBoy = await DeliveryBoy.findOne({ email: normalizedEmail }).select('+password');
    if (!deliveryBoy) throw new ApiError(401, 'Invalid credentials.');
    if (deliveryBoy.applicationStatus === 'pending') {
        throw new ApiError(403, 'Your account is pending admin approval.');
    }
    if (deliveryBoy.applicationStatus === 'rejected') {
        throw new ApiError(
            403,
            `Your delivery application was rejected${deliveryBoy.rejectionReason ? `: ${deliveryBoy.rejectionReason}` : '.'}`
        );
    }
    if (!deliveryBoy.isActive) throw new ApiError(403, 'Account is deactivated. Contact admin.');

    const isMatch = await deliveryBoy.comparePassword(password);
    if (!isMatch) throw new ApiError(401, 'Invalid credentials.');

    const { accessToken, refreshToken } = generateTokens({ id: deliveryBoy._id, role: 'delivery', email: deliveryBoy.email });
    await persistRefreshSession(deliveryBoy, refreshToken);
    res.status(200).json(new ApiResponse(200, {
        accessToken,
        refreshToken,
        deliveryBoy: {
            id: deliveryBoy._id,
            name: deliveryBoy.name,
            email: deliveryBoy.email,
            phone: deliveryBoy.phone,
            isAvailable: deliveryBoy.isAvailable,
            status: deliveryBoy.status || (deliveryBoy.isAvailable ? 'available' : 'offline'),
        }
    }, 'Login successful.'));
});

// POST /api/delivery/auth/refresh
export const refresh = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const decoded = decodeRefreshTokenOrThrow(refreshToken);
    const deliveryBoy = await DeliveryBoy.findById(decoded.id).select('+refreshTokenHash +refreshTokenExpiresAt applicationStatus rejectionReason isActive');

    if (!deliveryBoy) throw new ApiError(401, 'Invalid refresh token.');
    if (deliveryBoy.applicationStatus === 'pending') {
        throw new ApiError(403, 'Your account is pending admin approval.');
    }
    if (deliveryBoy.applicationStatus === 'rejected') {
        throw new ApiError(
            403,
            `Your delivery application was rejected${deliveryBoy.rejectionReason ? `: ${deliveryBoy.rejectionReason}` : '.'}`
        );
    }
    if (!deliveryBoy.isActive) throw new ApiError(403, 'Account is deactivated. Contact admin.');

    const tokens = await rotateRefreshSession(
        deliveryBoy,
        { id: deliveryBoy._id, role: 'delivery', email: deliveryBoy.email },
        refreshToken
    );

    return res.status(200).json(new ApiResponse(200, tokens, 'Session refreshed successfully.'));
});

// POST /api/delivery/auth/logout
export const logout = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        try {
            const decoded = decodeRefreshTokenOrThrow(refreshToken);
            const deliveryBoy = await DeliveryBoy.findById(decoded.id).select('+refreshTokenHash +refreshTokenExpiresAt');
            if (deliveryBoy?.refreshTokenHash) {
                await clearRefreshSession(deliveryBoy);
            }
        } catch {
            // Keep logout idempotent.
        }
    }

    return res.status(200).json(new ApiResponse(200, null, 'Logged out successfully.'));
});

// GET /api/delivery/auth/profile
export const getProfile = asyncHandler(async (req, res) => {
    const deliveryBoy = await DeliveryBoy.findById(req.user.id);
    if (!deliveryBoy) throw new ApiError(404, 'Delivery boy not found.');
    res.status(200).json(new ApiResponse(200, deliveryBoy, 'Profile fetched.'));
});

// PUT /api/delivery/auth/profile
export const updateProfile = asyncHandler(async (req, res) => {
    const { name, phone, email, vehicleType, vehicleNumber, currentLocation, isAvailable, status } = req.body;
    const update = {};

    if (typeof name === 'string') {
        const trimmedName = name.trim();
        if (!trimmedName) throw new ApiError(400, 'Name is required.');
        update.name = trimmedName;
    }

    if (typeof phone === 'string') {
        const trimmedPhone = phone.trim();
        if (!trimmedPhone) throw new ApiError(400, 'Phone is required.');
        update.phone = trimmedPhone;
    }

    if (typeof email === 'string') {
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail) throw new ApiError(400, 'Email is required.');
        const existingEmail = await DeliveryBoy.findOne({
            email: normalizedEmail,
            _id: { $ne: req.user.id },
        });
        if (existingEmail) throw new ApiError(409, 'Email is already in use.');
        update.email = normalizedEmail;
    }

    if (typeof vehicleType === 'string') update.vehicleType = vehicleType.trim();
    if (typeof vehicleNumber === 'string') update.vehicleNumber = vehicleNumber.trim();
    if (typeof currentLocation === 'object' && currentLocation !== null) {
        update.currentLocation = currentLocation;

        // Dual-write the GeoJSON shape too. Writing only the legacy field here
        // would leave `location` stale while `currentLocation` moved, and
        // assignment reads `location` — the rider would be matched against a
        // position they have left.
        const lat = Number(currentLocation.lat);
        const lng = Number(currentLocation.lng);
        const isValidLat = Number.isFinite(lat) && lat >= LATITUDE_BOUNDS.min && lat <= LATITUDE_BOUNDS.max;
        const isValidLng = Number.isFinite(lng) && lng >= LONGITUDE_BOUNDS.min && lng <= LONGITUDE_BOUNDS.max;
        if (isValidLat && isValidLng) {
            // GeoJSON is [lng, lat] — reversed relative to the field above.
            update.location = { type: 'Point', coordinates: [lng, lat] };
            update.lastLocationAt = new Date();
        }
    }

    if (typeof status === 'string') {
        const normalized = status.toLowerCase();
        const allowed = ['available', 'busy', 'offline'];
        if (!allowed.includes(normalized)) {
            throw new ApiError(400, `Status must be one of: ${allowed.join(', ')}`);
        }
        update.status = normalized;
        update.isAvailable = normalized !== 'offline';
    } else if (typeof isAvailable === 'boolean') {
        update.isAvailable = isAvailable;
        update.status = isAvailable ? 'available' : 'offline';
    }

    const deliveryBoy = await DeliveryBoy.findByIdAndUpdate(
        req.user.id,
        update,
        { new: true, runValidators: true }
    );
    res.status(200).json(new ApiResponse(200, deliveryBoy, 'Profile updated.'));
});

// DELETE /api/delivery/auth/account
export const deleteAccount = asyncHandler(async (req, res) => {
    const deliveryBoy = await DeliveryBoy.findById(req.user.id).select('+refreshTokenHash +refreshTokenExpiresAt');
    if (!deliveryBoy) throw new ApiError(404, 'Delivery account not found.');

    const activeDelivery = await Order.exists({
        deliveryBoyId: deliveryBoy._id,
        isDeleted: { $ne: true },
        status: { $nin: FINAL_ORDER_STATUSES },
    });
    if (activeDelivery) {
        throw new ApiError(409, 'Finish or have an administrator reassign your active delivery before deleting this account.');
    }

    // Soft delete: anonymize PII and deactivate the account
    const deletedAt = Date.now();
    deliveryBoy.name = `Deleted Rider ${deletedAt}`;
    deliveryBoy.email = buildDeletedEmail('delivery', deliveryBoy._id, deletedAt);
    deliveryBoy.phone = undefined;
    deliveryBoy.address = undefined;
    deliveryBoy.vehicleType = undefined;
    deliveryBoy.vehicleNumber = undefined;
    deliveryBoy.avatar = undefined;
    deliveryBoy.documents = undefined;
    deliveryBoy.isActive = false;
    deliveryBoy.isAvailable = false;
    deliveryBoy.status = 'offline';
    deliveryBoy.activeOrderId = null;
    deliveryBoy.currentLocation = undefined;
    deliveryBoy.location = undefined;
    deliveryBoy.lastLocationAt = undefined;
    deliveryBoy.refreshTokenHash = undefined;
    deliveryBoy.refreshTokenExpiresAt = undefined;
    await deliveryBoy.save({ validateBeforeSave: false });

    return res.status(200).json(new ApiResponse(200, null, 'Account deleted successfully.'));
});
