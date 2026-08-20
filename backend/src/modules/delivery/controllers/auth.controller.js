import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import Order from '../../../models/Order.model.js';
import Admin from '../../../models/Admin.model.js';
import { generateTokens } from '../../../utils/generateToken.js';
import { createNotification } from '../../../services/notification.service.js';
import { cleanupLocalFiles } from '../../../services/upload.service.js';
import { LATITUDE_BOUNDS, LONGITUDE_BOUNDS } from '../../../constants/quickCommerce.js';
import {
    clearRefreshSession,
    decodeRefreshTokenOrThrow,
    persistRefreshSession,
    rotateRefreshSession,
} from '../../../services/refreshToken.service.js';
import { buildDeletedEmail, FINAL_ORDER_STATUSES } from '../../../utils/accountDeletion.js';
import { OTP_EXPIRY_MINUTES } from '../../../services/otp.service.js';
import {
    sendPhoneVerification,
    confirmPhoneVerification,
    isPhoneVerified,
    clearPhoneVerification,
    requireE164,
} from '../../../services/phoneVerification.service.js';

const getUploadedPath = (file) => {
    if (!file?.filename) return '';
    return `/uploads/delivery-docs/${file.filename}`;
};

/**
 * POST /api/delivery/auth/request-registration-otp
 *
 * Proves the mobile number BEFORE the application is submitted, so a partner
 * cannot register against a number they do not control — that number becomes
 * their only login credential.
 */
export const requestRegistrationOTP = asyncHandler(async (req, res) => {
    const phoneE164 = requireE164(req.body?.phone);

    const existing = await DeliveryBoy.findOne({ phoneE164 });
    if (existing) {
        throw new ApiError(409, 'This mobile number is already registered. Please login instead.');
    }

    const result = await sendPhoneVerification(phoneE164);
    res.status(200).json(new ApiResponse(200, {
        channel: result.channel,
        expiresInMinutes: result.expiresInMinutes,
    }, 'Verification code sent to your WhatsApp.'));
});

/** POST /api/delivery/auth/verify-registration-otp */
export const verifyRegistrationOTP = asyncHandler(async (req, res) => {
    const { phone, otp } = req.body;
    const { phoneE164 } = await confirmPhoneVerification(phone, otp);
    res.status(200).json(new ApiResponse(
        200,
        { phone: phoneE164, isVerified: true },
        'Mobile number verified successfully.',
    ));
});

// POST /api/delivery/auth/register
export const register = asyncHandler(async (req, res) => {
    const { name, email, phone, address, vehicleType, vehicleNumber } = req.body;

    const drivingLicenseFile = req.files?.drivingLicense?.[0];
    const aadharCardFile = req.files?.aadharCard?.[0];

    if (!aadharCardFile) {
        throw new ApiError(400, 'Aadhar card is required.');
    }

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const phoneE164 = requireE164(phone);
    let deliveryBoy = null;

    // The number must already be proven by the WhatsApp code. Registration is
    // the point at which an unverified number would otherwise become a login
    // identity, so the check belongs here and not later.
    if (!(await isPhoneVerified(phoneE164))) {
        throw new ApiError(400, 'Mobile number not verified. Please verify your mobile number first.');
    }

    try {
        // The mobile number is the identity here — it is what a partner logs in
        // with — so it, not the email address, is the uniqueness constraint that
        // matters. Email is still rejected on collision to keep existing
        // admin-side lookups unambiguous.
        const existingPhone = await DeliveryBoy.findOne({ phoneE164 });
        if (existingPhone) throw new ApiError(409, 'This mobile number is already registered.');

        const existing = await DeliveryBoy.findOne({ email: normalizedEmail });
        if (existing) throw new ApiError(409, 'Email already registered.');

        deliveryBoy = await DeliveryBoy.create({
            name: String(name || '').trim(),
            email: normalizedEmail,
            phone: String(phone || '').trim(),
            phoneE164,
            // Proven by the WhatsApp code that gated this registration.
            phoneVerified: true,
            address: String(address || '').trim(),
            vehicleType: String(vehicleType || '').trim(),
            vehicleNumber: String(vehicleNumber || '').trim(),
            documents: {
                drivingLicense: drivingLicenseFile ? getUploadedPath(drivingLicenseFile) : '',
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

        await clearPhoneVerification(phoneE164);

        res.status(201).json(
            new ApiResponse(
                201,
                { phone: deliveryBoy.phoneE164, email: deliveryBoy.email },
                'Registration submitted. Awaiting admin approval.',
            )
        );
    } catch (error) {
        const shouldCleanupLocalDocs = !deliveryBoy;
        if (shouldCleanupLocalDocs) {
            await cleanupLocalFiles([
                drivingLicenseFile?.path,
                aadharCardFile?.path,
            ].filter(Boolean));
        }
        throw error;
    }
});

/**
 * Shared eligibility gate.
 *
 * Applied at BOTH the request-code and the verify steps. Checking only at
 * verification would still send — and bill — a WhatsApp message to a rejected
 * or deactivated applicant; checking only at request would let a partner
 * deactivated between the two steps complete a login.
 */
const assertLoginEligible = (deliveryBoy) => {
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
};

/**
 * POST /api/delivery/auth/request-otp
 *
 * Step one of passwordless login: issue a WhatsApp code to a registered number.
 *
 * Answers identically whether or not the number is registered. An endpoint that
 * distinguished the two would be a free directory of which mobile numbers are
 * delivery partners.
 */
export const requestLoginOTP = asyncHandler(async (req, res) => {
    const phoneE164 = requireE164(req.body?.phone);
    const generic = new ApiResponse(
        200,
        { expiresInMinutes: OTP_EXPIRY_MINUTES },
        'If this number is registered, a verification code has been sent to WhatsApp.',
    );

    const deliveryBoy = await DeliveryBoy.findOne({ phoneE164 });
    if (!deliveryBoy) return res.status(200).json(generic);

    // Status problems ARE disclosed: the partner already knows they applied,
    // and "pending approval" is the answer they need rather than silence.
    assertLoginEligible(deliveryBoy);

    await sendPhoneVerification(phoneE164);
    return res.status(200).json(generic);
});

/**
 * POST /api/delivery/auth/verify-otp
 *
 * Step two: exchange a valid code for a session. This is the only way a
 * delivery partner authenticates — there is no password anywhere in this flow.
 */
export const verifyLoginOTP = asyncHandler(async (req, res) => {
    const { phone, otp } = req.body;
    const { phoneE164 } = await confirmPhoneVerification(phone, otp);

    const deliveryBoy = await DeliveryBoy.findOne({ phoneE164 });
    if (!deliveryBoy) throw new ApiError(401, 'Invalid credentials.');

    assertLoginEligible(deliveryBoy);

    // One code, one session. Leaving the record verified would let the same
    // code be replayed for another login until its TTL expired.
    await clearPhoneVerification(phoneE164);

    if (deliveryBoy.phoneVerified !== true) {
        deliveryBoy.phoneVerified = true;
        await deliveryBoy.save({ validateBeforeSave: false });
    }

    const { accessToken, refreshToken } = generateTokens({
        id: deliveryBoy._id,
        role: 'delivery',
        email: deliveryBoy.email,
    });
    await persistRefreshSession(deliveryBoy, refreshToken);

    return res.status(200).json(new ApiResponse(200, {
        accessToken,
        refreshToken,
        deliveryBoy: {
            id: deliveryBoy._id,
            name: deliveryBoy.name,
            email: deliveryBoy.email,
            phone: deliveryBoy.phone,
            isAvailable: deliveryBoy.isAvailable,
            status: deliveryBoy.status || (deliveryBoy.isAvailable ? 'available' : 'offline'),
        },
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

    if (deliveryBoy?.status === 'available' && !deliveryBoy.activeOrderId) {
        setImmediate(() => {
            import('../../../services/riderAssignment.service.js').then(({ recoverEscalatedOrdersForRider }) => {
                recoverEscalatedOrdersForRider(deliveryBoy._id).catch(() => null);
            });
        });
    }

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
