import fs from 'fs';
import path from 'path';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Vendor from '../../../models/Vendor.model.js';
import Product from '../../../models/Product.model.js';
import Order from '../../../models/Order.model.js';
import Admin from '../../../models/Admin.model.js';
import Settings from '../../../models/Settings.model.js';
import PhoneVerification from '../../../models/PhoneVerification.model.js';
import {
    sendPhoneVerification,
    confirmPhoneVerification,
    isPhoneVerified,
    clearPhoneVerification,
    requireE164,
} from '../../../services/phoneVerification.service.js';
import crypto from 'crypto';
import { generateTokens } from '../../../utils/generateToken.js';
import { isMockOTP, isOTPMatch, sendOTP, sendResetOTP, OTP_EXPIRY_MS, OTP_EXPIRY_MINUTES } from '../../../services/otp.service.js';
import { toE164 } from '../../../utils/phone.js';
import { sendEmail } from '../../../services/email.service.js';
import { createNotification } from '../../../services/notification.service.js';
import {
    clearRefreshSession,
    decodeRefreshTokenOrThrow,
    persistRefreshSession,
    rotateRefreshSession,
} from '../../../services/refreshToken.service.js';
import { uploadLocalFileToCloudinaryAndCleanup } from '../../../services/upload.service.js';
import { resolvePlanSelection } from '../../../services/billing/planSelection.service.js';
import { serializePlan } from '../../../services/billing/plan.service.js';
import { getCurrentVendorSubscription, serializeSubscription } from '../../../services/billing/subscriptionState.service.js';
import { isWholesaleMarketplaceEnabled, isQuickCommerceEnabled } from '../../../services/featureFlags.service.js';
import {
    buildLocationPoint,
    clampServiceRadius,
    pointToLatLng,
    resolveVendorAvailability,
} from '../../../services/quickCommerce.service.js';
import { buildDeletedEmail, FINAL_ORDER_STATUSES } from '../../../utils/accountDeletion.js';
import { requestedChannelsFromSellingChannels, channelSummary } from '../../../services/vendorChannel.service.js';
import { applyChannelTransition } from '../../../services/vendorChannelTransition.service.js';
import { getVendorChannelState, normalizeVendorChannel, vendorChannelPath } from '../../../constants/vendorChannels.js';

const hasCompleteWholesaleProfile = (profile) => Boolean(
    profile?.gstNumber
    && profile?.businessName
    && profile?.wholesaleContactName
    && profile?.wholesaleContactPhone
    && profile?.bulkOrderSupportEmail
);

const getVendorOnboardingState = async (vendorDoc) => {
    if (!vendorDoc) {
        return { onboardingStatus: 'not_found', nextStep: 'register', subscription: null };
    }

    const vendor = typeof vendorDoc.populate === 'function'
        ? await vendorDoc.populate('selectedPlan')
        : vendorDoc;

    if (!vendor.isVerified) {
        // Unreachable for new vendors — registration cannot complete without a
        // proven mobile number. Legacy rows can still sit here, and the resume
        // branch in `register` is their recovery path.
        return { onboardingStatus: 'registered', nextStep: 'verify_phone', subscription: null };
    }

    if (vendor.status === 'approved') {
        return { onboardingStatus: 'subscription_active', nextStep: 'approved', subscription: null };
    }

    if (vendor.status === 'rejected') {
        return { onboardingStatus: 'subscription_active', nextStep: 'rejected', subscription: null };
    }

    if (vendor.status === 'suspended') {
        return { onboardingStatus: 'subscription_active', nextStep: 'suspended', subscription: null };
    }

    if (!vendor.selectedPlan) {
        return { onboardingStatus: 'email_verified', nextStep: 'choose_plan', subscription: null };
    }

    const currentSubscription = await getCurrentVendorSubscription(vendor._id);
    if (!currentSubscription) {
        return { onboardingStatus: 'plan_selected', nextStep: 'complete_payment', subscription: null };
    }

    if (currentSubscription.status === 'active') {
        return {
            onboardingStatus: 'subscription_active',
            nextStep: 'awaiting_admin_approval',
            subscription: await serializeSubscription(currentSubscription),
        };
    }

    return {
        onboardingStatus: 'payment_pending',
        nextStep: 'complete_payment',
        subscription: await serializeSubscription(currentSubscription),
    };
};

const uploadVendorDocument = async ({ file, documentType }) => {
    if (!file) {
        throw new ApiError(400, 'Please upload your business verification document (Trade License, GST, MSME, or Enrolment ID/UIN).');
    }

    let documentUrl = '';
    let documentFileType = '';

    if (file.mimetype.startsWith('image/')) {
        documentFileType = 'image';
        try {
            const uploaded = await uploadLocalFileToCloudinaryAndCleanup(file.path, 'vendor_documents');
            documentUrl = uploaded.url;
        } catch {
            throw new ApiError(500, 'Failed to upload document image.');
        }
    } else {
        documentFileType = file.mimetype === 'application/pdf' ? 'pdf' : 'word';
        const docDir = path.resolve(process.cwd(), 'uploads/vendor_documents');
        if (!fs.existsSync(docDir)) {
            fs.mkdirSync(docDir, { recursive: true });
        }
        const fileName = file.filename;
        const destPath = path.join(docDir, fileName);
        fs.renameSync(file.path, destPath);
        documentUrl = `/uploads/vendor_documents/${fileName}`;
    }

    if (documentType === 'gst') {
        return { gst: documentUrl };
    }
    if (documentType === 'msme') {
        return { msme: documentUrl };
    }
    if (documentType === 'uin' || documentType === 'enrolmentId') {
        return { uin: documentUrl, enrolmentId: documentUrl };
    }

    return {
        tradeLicense: {
            url: documentUrl,
            fileType: documentFileType,
        },
    };
};

export const register = asyncHandler(async (req, res) => {
    const {
        name,
        email,
        password,
        phone,
        storeName,
        storeDescription,
        address,
        agreedToTerms,
        selectedPlanId,
        selectionToken,
        documentType,
        sellingChannels,
        wholesaleProfile,
    } = req.body;

    if (!agreedToTerms) {
        throw new ApiError(400, 'You must agree to the Terms & Conditions to register.');
    }

    const { plan } = await resolvePlanSelection({ selectionToken, selectedPlanId });
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const phoneE164 = requireE164(phone);
    const existing = await Vendor.findOne({ email: normalizedEmail }).populate('selectedPlan');

    // The MOBILE NUMBER is the proven contact. The email address is collected
    // for correspondence but is never verified — a vendor is identified by a
    // number they demonstrably control.
    if (!(await isPhoneVerified(phoneE164))) {
        throw new ApiError(400, 'Mobile number not verified. Please verify your mobile number first.');
    }

    if (existing) {
        const onboarding = await getVendorOnboardingState(existing);
        if (
            onboarding.nextStep === 'verify_phone'
            || onboarding.nextStep === 'choose_plan'
            || onboarding.nextStep === 'complete_payment'
        ) {
            existing.selectedPlan = plan._id;
            existing.country = String(address?.country || existing.country || '').trim();
            existing.isVerified = true;
            existing.phoneE164 = phoneE164;
            existing.phoneVerified = true;
            existing.onboardingStatus = 'plan_selected';
            await existing.save({ validateBeforeSave: false });
            await clearPhoneVerification(phoneE164);

            return res.status(200).json(
                new ApiResponse(
                    200,
                    {
                        email: existing.email,
                        resume: true,
                        onboardingStatus: 'plan_selected',
                        nextStep: 'complete_payment',
                    },
                    'Account recovered. Email verified.'
                )
            );
        }
        throw new ApiError(409, 'Email already registered.');
    }

    const generalSetting = await Settings.findOne({ key: 'general' });
    const defaultCommRate = Number(generalSetting?.value?.defaultCommissionRate);
    const initialCommissionRate = (!Number.isNaN(defaultCommRate) && defaultCommRate >= 0) ? defaultCommRate : 10;

    const documents = await uploadVendorDocument({ file: req.file, documentType });

    const wholesaleRequested = sellingChannels?.wholesale?.enabled === true;
    if (wholesaleRequested) {
        const wholesaleMarketplaceEnabled = await isWholesaleMarketplaceEnabled();
        if (!wholesaleMarketplaceEnabled) {
            throw new ApiError(403, 'Wholesale Marketplace is not currently available on this platform.');
        }
    }

    const quickCommerceRequested = sellingChannels?.quickCommerce?.enabled === true;
    if (quickCommerceRequested) {
        const quickCommerceEnabled = await isQuickCommerceEnabled();
        if (!quickCommerceEnabled) {
            throw new ApiError(403, 'Quick Commerce is not currently available on this platform.');
        }
    }

    // A vendor may opt out of retail entirely when selling only wholesale or
    // only via Quick Commerce.
    const retailRequested = sellingChannels?.retail?.enabled !== false;
    if (!retailRequested && !wholesaleRequested && !quickCommerceRequested) {
        throw new ApiError(400, 'At least one selling channel (Retail, Wholesale, or Quick Commerce) must be enabled.');
    }

    const initialVendorType = quickCommerceRequested
        ? 'quick_commerce'
        : (wholesaleRequested && !retailRequested)
            ? 'wholesale'
            : 'retail';

    const vendor = await Vendor.create({
        name: String(name || '').trim(),
        email: normalizedEmail,
        password,
        phone: String(phone || '').trim(),
        phoneE164,
        // Proven by the WhatsApp code that gated this registration.
        phoneVerified: true,
        country: String(address?.country || '').trim(),
        storeName: String(storeName || '').trim(),
        storeDescription: String(storeDescription || '').trim(),
        address,
        status: 'pending',
        vendorType: initialVendorType,
        commissionRate: initialCommissionRate,
        agreedToTerms: true,
        agreedToTermsAt: new Date(),
        onboardingStatus: 'plan_selected',
        selectedPlan: plan._id,
        documents,
        isVerified: true, // Mobile number proven before this point
        sellingChannels: {
            retail: { enabled: retailRequested },
            wholesale: { enabled: wholesaleRequested },
            quickCommerce: { enabled: quickCommerceRequested },
        },
        channels: requestedChannelsFromSellingChannels({
            retail: { enabled: retailRequested },
            wholesale: { enabled: wholesaleRequested },
            quickCommerce: { enabled: quickCommerceRequested },
        }),
        channelsRevision: 1,
        wholesaleProfile: wholesaleRequested ? wholesaleProfile : undefined,
    });

    // Consume the verification record now that it has done its job.
    await clearPhoneVerification(phoneE164);

    // Notify all active admins of new vendor registration
    try {
        const admins = await Admin.find({ isActive: true }).select('_id').lean();
        await Promise.all(
            admins.map((admin) =>
                createNotification({
                    recipientId: admin._id,
                    recipientType: 'admin',
                    title: 'New Vendor Registration',
                    message: `${vendor.storeName} (${vendor.name}) has registered as a vendor and is awaiting approval.`,
                    type: 'system',
                    data: {
                        vendorId: String(vendor._id),
                        vendorEmail: vendor.email,
                        storeName: vendor.storeName,
                    },
                })
            )
        );
    } catch (notificationErr) {
        console.warn(`[Vendor Registration Notification] Failed: ${notificationErr.message}`);
    }

    res.status(201).json(
        new ApiResponse(
            201,
            {
                email: vendor.email,
                selectedPlan: serializePlan(plan, vendor.country),
                onboardingStatus: 'plan_selected',
                nextStep: 'complete_payment',
            },
            'Registration successful. Mobile number verified.'
        )
    );
});

/**
 * POST /auth/request-registration-otp
 *
 * Issues a WhatsApp code to the MOBILE NUMBER a prospective vendor is
 * registering with. There is no email step: the address is collected for
 * correspondence and never verified.
 */
export const requestRegistrationOTP = asyncHandler(async (req, res) => {
    const phoneE164 = requireE164(req.body?.phone);

    // An existing, fully-registered vendor on this number should log in rather
    // than start again.
    const existingVendor = await Vendor.findOne({ phoneE164 });
    if (existingVendor && existingVendor.isVerified) {
        throw new ApiError(409, 'This mobile number is already registered. Please login.');
    }

    const result = await sendPhoneVerification(phoneE164);

    res.status(200).json(new ApiResponse(200, {
        channel: result.channel,
        expiresInMinutes: result.expiresInMinutes,
    }, 'Verification code sent to your WhatsApp.'));
});

/**
 * POST /auth/verify-registration-otp
 *
 * Marks the number proven. The resulting record is also the authority token
 * the session-less onboarding routes accept — see billing.controller.js.
 */
export const verifyRegistrationOTP = asyncHandler(async (req, res) => {
    const { phone, otp } = req.body;
    const { phoneE164 } = await confirmPhoneVerification(phone, otp);

    res.status(200).json(new ApiResponse(
        200,
        { phone: phoneE164, isVerified: true },
        'Mobile number verified successfully.',
    ));
});

export const getOnboardingStatus = asyncHandler(async (req, res) => {
    const normalizedEmail = String(req.body?.email || '').trim().toLowerCase();
    const vendor = await Vendor.findOne({ email: normalizedEmail }).populate('selectedPlan');

    if (!vendor) {
        return res.status(200).json(
            new ApiResponse(
                200,
                { email: normalizedEmail, onboardingStatus: 'not_found', nextStep: 'register' },
                'No onboarding found.'
            )
        );
    }

    const onboarding = await getVendorOnboardingState(vendor);
    const plan = vendor.selectedPlan ? serializePlan(vendor.selectedPlan, vendor.country) : null;

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                email: vendor.email,
                onboardingStatus: onboarding.onboardingStatus,
                nextStep: onboarding.nextStep,
                isVerified: vendor.isVerified,
                status: vendor.status,
                selectedPlanId: vendor.selectedPlan ? String(vendor.selectedPlan._id || vendor.selectedPlan) : null,
                selectedPlan: plan,
                subscription: onboarding.subscription,
            },
            'Onboarding status fetched.'
        )
    );
});

export const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const vendor = await Vendor.findOne({ email: normalizedEmail }).select('+resetOtp +resetOtpExpiry +resetOtpVerified');

    if (!vendor) {
        return res.status(200).json(
            new ApiResponse(200, null, 'If the email exists, a reset OTP has been sent.')
        );
    }

    // Unified OTP service: cryptographic code, 5-minute window, and
    // WhatsApp-only-when-the-number-is-proven channel policy.
    await sendResetOTP(vendor, 'password_reset');

    return res.status(200).json(
        new ApiResponse(200, null, 'If the email exists, a reset OTP has been sent.')
    );
});

export const verifyResetOTP = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const vendor = await Vendor.findOne({ email: normalizedEmail }).select('+resetOtp +resetOtpExpiry +resetOtpVerified');
    if (!vendor) throw new ApiError(404, 'Vendor not found.');
    if (!vendor.resetOtp || !vendor.resetOtpExpiry) throw new ApiError(400, 'No reset OTP requested.');
    if (vendor.resetOtpExpiry < new Date()) throw new ApiError(400, 'Reset OTP has expired.');
    if (vendor.resetOtp !== String(otp)) throw new ApiError(400, 'Invalid reset OTP.');

    vendor.resetOtpVerified = true;
    await vendor.save({ validateBeforeSave: false });

    return res.status(200).json(new ApiResponse(200, null, 'Reset OTP verified.'));
});

export const resetPassword = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const vendor = await Vendor.findOne({ email: normalizedEmail }).select('+password +resetOtp +resetOtpExpiry +resetOtpVerified');
    if (!vendor) throw new ApiError(404, 'Vendor not found.');
    if (!vendor.resetOtpVerified) throw new ApiError(400, 'Please verify reset OTP first.');
    if (!vendor.resetOtp || !vendor.resetOtpExpiry) throw new ApiError(400, 'No reset OTP requested.');
    if (vendor.resetOtpExpiry < new Date()) throw new ApiError(400, 'Reset OTP has expired.');

    vendor.password = password;
    vendor.resetOtp = undefined;
    vendor.resetOtpExpiry = undefined;
    vendor.resetOtpVerified = false;
    vendor.refreshTokenHash = undefined;
    vendor.refreshTokenExpiresAt = undefined;
    await vendor.save();

    return res.status(200).json(new ApiResponse(200, null, 'Password reset successful. Please login.'));
});

export const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const vendor = await Vendor.findOne({ email: normalizedEmail }).select('+password');
    if (!vendor) throw new ApiError(401, 'Invalid credentials.');
    if (vendor.isActive === false) throw new ApiError(403, 'Vendor account is deactivated. Contact support.');
    // Registration cannot complete without a proven mobile number, so this is
    // a defensive gate for legacy rows rather than a step a vendor can action.
    if (!vendor.isVerified) throw new ApiError(403, 'Your account is not verified. Please contact support.');

    const onboarding = await getVendorOnboardingState(vendor);
    if (onboarding.nextStep === 'choose_plan') {
        throw new ApiError(403, 'Please complete your vendor onboarding by choosing a subscription plan.');
    }
    if (onboarding.nextStep === 'complete_payment') {
        throw new ApiError(403, 'Please complete your vendor subscription payment first.');
    }
    if (vendor.status === 'pending') throw new ApiError(403, 'Your account is pending admin approval.');
    if (vendor.status === 'suspended') throw new ApiError(403, `Your account has been suspended. Reason: ${vendor.suspensionReason || 'Contact support.'}`);
    if (vendor.status === 'rejected') throw new ApiError(403, 'Your vendor application was rejected.');

    const isMatch = await vendor.comparePassword(password);
    if (!isMatch) throw new ApiError(401, 'Invalid credentials.');

    const { accessToken, refreshToken } = generateTokens({ id: vendor._id, role: 'vendor', email: vendor.email });
    await persistRefreshSession(vendor, refreshToken);
    res.status(200).json(
        new ApiResponse(
            200,
            {
                accessToken,
                refreshToken,
                vendor: {
                    id: vendor._id,
                    name: vendor.name,
                    storeName: vendor.storeName,
                    email: vendor.email,
                    storeLogo: vendor.storeLogo,
                    commissionRate: vendor.commissionRate,
                    vendorType: vendor.vendorType,
                    ...channelSummary(vendor),
                },
            },
            'Login successful.'
        )
    );
});

export const refresh = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const decoded = decodeRefreshTokenOrThrow(refreshToken);
    const vendor = await Vendor.findById(decoded.id).select('+refreshTokenHash +refreshTokenExpiresAt status isVerified isActive suspensionReason');

    if (!vendor) throw new ApiError(401, 'Invalid refresh token.');
    if (vendor.isActive === false) throw new ApiError(403, 'Vendor account is deactivated. Contact support.');
    if (!vendor.isVerified) throw new ApiError(403, 'Your account is not verified. Please contact support.');

    const onboarding = await getVendorOnboardingState(vendor);
    if (onboarding.nextStep === 'choose_plan') {
        throw new ApiError(403, 'Please complete your vendor onboarding by choosing a subscription plan.');
    }
    if (onboarding.nextStep === 'complete_payment') {
        throw new ApiError(403, 'Please complete your vendor subscription payment first.');
    }
    if (vendor.status === 'pending') throw new ApiError(403, 'Your account is pending admin approval.');
    if (vendor.status === 'suspended') throw new ApiError(403, `Your account has been suspended. Reason: ${vendor.suspensionReason || 'Contact support.'}`);
    if (vendor.status === 'rejected') throw new ApiError(403, 'Your vendor application was rejected.');

    const tokens = await rotateRefreshSession(
        vendor,
        { id: vendor._id, role: 'vendor', email: vendor.email },
        refreshToken
    );

    return res.status(200).json(new ApiResponse(200, tokens, 'Session refreshed successfully.'));
});

export const logout = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        try {
            const decoded = decodeRefreshTokenOrThrow(refreshToken);
            const vendor = await Vendor.findById(decoded.id).select('+refreshTokenHash +refreshTokenExpiresAt');
            if (vendor?.refreshTokenHash) {
                await clearRefreshSession(vendor);
            }
        } catch {
            // Keep logout idempotent.
        }
    }

    return res.status(200).json(new ApiResponse(200, null, 'Logged out successfully.'));
});

export const getProfile = asyncHandler(async (req, res) => {
    const vendor = await Vendor.findById(req.user.id)
        .select('-password -otp -otpExpiry')
        .populate('selectedPlan');
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    const currentSubscription = await getCurrentVendorSubscription(vendor._id);
    res.status(200).json(
        new ApiResponse(
            200,
            {
                ...vendor.toObject({ virtuals: true }),
                ...channelSummary(vendor),
                selectedPlan: vendor.selectedPlan ? serializePlan(vendor.selectedPlan, vendor.country) : null,
                subscription: await serializeSubscription(currentSubscription),
            },
            'Profile fetched.'
        )
    );
});

export const updateProfile = asyncHandler(async (req, res) => {
    const allowed = [
        'name',
        'phone',
        'country',
        'storeName',
        'storeDescription',
        'storeLogo',
        'address',
        'shippingEnabled',
        'freeShippingThreshold',
        'defaultShippingRate',
        'shippingMethods',
        'handlingTime',
        'processingTime',
        'wholesaleProfile',
    ];
    const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));

    if (updates.address?.country && !updates.country) {
        updates.country = updates.address.country;
    }

    const vendor = await Vendor.findByIdAndUpdate(req.user.id, updates, { new: true, runValidators: true })
        .select('-password -otp -otpExpiry')
        .populate('selectedPlan');
    res.status(200).json(new ApiResponse(200, vendor, 'Profile updated.'));
});

// PUT /api/vendor/quick-commerce/settings
export const updateQuickCommerceSettings = asyncHandler(async (req, res) => {
    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    if (!['active', 'paused'].includes(vendor.channels?.quickCommerce?.status)) {
        throw new ApiError(403, 'Enable the Quick Commerce selling channel before configuring its settings.');
    }

    const quickCommerceEnabled = await isQuickCommerceEnabled();
    if (!quickCommerceEnabled) {
        throw new ApiError(403, 'Quick Commerce is not currently available on this platform.');
    }

    const {
        latitude,
        longitude,
        locationAddress,
        formattedAddress,
        serviceRadiusKm,
        ...rest
    } = req.body;

    const profile = vendor.quickCommerceProfile?.toObject?.() ?? { ...(vendor.quickCommerceProfile || {}) };
    const next = { ...profile, ...rest };

    const resolvedAddress = String(locationAddress || formattedAddress || rest.locationAddress || profile.locationAddress || '').trim();
    if (resolvedAddress) {
        next.locationAddress = resolvedAddress;
    }

    // Coordinates arrive as lat/lng and are stored as a GeoJSON Point.
    if (latitude !== undefined && longitude !== undefined && latitude !== null && longitude !== null) {
        try {
            next.location = buildLocationPoint({ latitude, longitude });
        } catch (err) {
            throw new ApiError(400, err.message);
        }
    }

    if (serviceRadiusKm !== undefined) {
        const clamped = clampServiceRadius(serviceRadiusKm);
        if (clamped === null) throw new ApiError(400, 'Invalid service radius.');
        next.serviceRadiusKm = clamped;
    }

    // Clearing a pause is expressed as pausedUntil: null.
    if (Object.prototype.hasOwnProperty.call(rest, 'pausedUntil') && !rest.pausedUntil) {
        next.pausedUntil = undefined;
    }

    vendor.quickCommerceProfile = next;
    await vendor.save();

    const availability = resolveVendorAvailability(vendor);
    res.status(200).json(
        new ApiResponse(
            200,
            {
                quickCommerceProfile: vendor.quickCommerceProfile,
                availability,
                location: pointToLatLng(vendor.quickCommerceProfile?.location),
                locationAddress: vendor.quickCommerceProfile?.locationAddress || null,
            },
            'Quick Commerce settings updated.'
        )
    );
});

export const updateSellingChannels = asyncHandler(async (req, res) => {
    const { sellingChannels, wholesaleProfile } = req.body;

    const vendor = await Vendor.findById(req.user.id).populate('selectedPlan');
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    // `quickCommerce` is optional in the payload; when omitted, preserve what is
    // already stored so older clients cannot silently disable the channel.
    const quickCommerceRequested = Object.prototype.hasOwnProperty.call(sellingChannels, 'quickCommerce')
        ? sellingChannels.quickCommerce.enabled === true
        : ['active', 'paused', 'requested'].includes(vendor.channels?.quickCommerce?.status);

    // Validated here rather than in Joi because the effective value depends on
    // stored state that the validator cannot see.
    if (!sellingChannels.retail.enabled && !sellingChannels.wholesale.enabled && !quickCommerceRequested) {
        throw new ApiError(400, 'At least one selling channel (Retail, Wholesale, or Quick Commerce) must remain enabled.');
    }

    if (quickCommerceRequested && !['active', 'paused', 'requested'].includes(vendor.channels?.quickCommerce?.status)) {
        const quickCommerceEnabled = await isQuickCommerceEnabled();
        if (!quickCommerceEnabled) {
            throw new ApiError(403, 'Quick Commerce is not currently available on this platform.');
        }
    }

    if (sellingChannels.wholesale.enabled) {
        const wholesaleMarketplaceEnabled = await isWholesaleMarketplaceEnabled();
        if (!wholesaleMarketplaceEnabled) {
            throw new ApiError(403, 'Wholesale Marketplace is not currently available on this platform.');
        }

        const mergedProfile = { ...(vendor.wholesaleProfile?.toObject?.() || {}), ...(wholesaleProfile || {}) };
        vendor.wholesaleProfile = mergedProfile;
    } else if (wholesaleProfile) {
        vendor.wholesaleProfile = { ...(vendor.wholesaleProfile?.toObject?.() || {}), ...wholesaleProfile };
    }

    const requested = {
        retail: sellingChannels.retail.enabled,
        wholesale: sellingChannels.wholesale.enabled,
        quick_commerce: quickCommerceRequested,
    };
    // This deprecated endpoint writes the same canonical state as
    // apply/withdraw, so it must use the same state machine. It previously
    // wrote statuses directly, giving a second, unvalidated path into channel
    // authorization.
    const newlyRequestedChannels = [];
    for (const [channel, enabled] of Object.entries(requested)) {
        const path = vendorChannelPath(channel);
        const current = vendor.channels?.[path]?.status;
        if (enabled && !['active', 'paused', 'requested'].includes(current)) {
            applyChannelTransition(vendor, channel, 'requested', { actor: 'vendor' });
            newlyRequestedChannels.push(channel);
        } else if (!enabled && ['requested'].includes(current)) {
            applyChannelTransition(vendor, channel, 'disabled', {
                actor: 'vendor',
                reason: 'Request withdrawn by vendor',
            });
        }
    }

    await vendor.save();

    if (newlyRequestedChannels.length > 0) {
        try {
            const channelLabels = newlyRequestedChannels
                .map((ch) => ({
                    retail: 'Retail Marketplace',
                    wholesale: 'Wholesale Marketplace',
                    quick_commerce: 'Quick Commerce',
                }[ch] || ch))
                .join(', ');

            const admins = await Admin.find({ isActive: true }).select('_id').lean();
            const actionUrl = `/admin/vendors/${vendor._id}?tab=channels`;
            await Promise.all(
                admins.map((admin) =>
                    createNotification({
                        recipientId: admin._id,
                        recipientType: 'admin',
                        title: 'New Channel Application',
                        message: `${vendor.storeName || vendor.name} has applied for selling channels: ${channelLabels}.`,
                        type: 'system',
                        category: 'SYSTEM',
                        actionUrl,
                        data: {
                            vendorId: String(vendor._id),
                            channels: newlyRequestedChannels,
                            storeName: vendor.storeName || vendor.name,
                            actionUrl,
                        },
                    })
                )
            );
        } catch (notificationErr) {
            console.warn(`[Selling Channels Notification] Failed: ${notificationErr.message}`);
        }
    }

    res.status(200).json(new ApiResponse(200, vendor, 'Selling channels updated.'));
});

export const getChannels = asyncHandler(async (req, res) => {
    const vendor = await Vendor.findById(req.user.id).select('channels channelsRevision vendorType sellingChannels').lean();
    if (!vendor) throw new ApiError(404, 'Vendor not found.');
    res.status(200).json(new ApiResponse(200, channelSummary(vendor), 'Vendor channels fetched.'));
});

export const applyForChannel = asyncHandler(async (req, res) => {
    const channel = normalizeVendorChannel(req.params.channel);
    if (!channel) throw new ApiError(400, 'Invalid vendor channel.');
    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) throw new ApiError(404, 'Vendor not found.');
    const current = getVendorChannelState(vendor, channel)?.status;
    if (['active', 'paused', 'requested'].includes(current)) {
        throw new ApiError(409, `Channel is already ${current}.`);
    }
    if (channel === 'wholesale') {
        const merged = { ...(vendor.wholesaleProfile?.toObject?.() || {}), ...(req.body?.wholesaleProfile || {}) };
        if (!(await isWholesaleMarketplaceEnabled())) throw new ApiError(403, 'Wholesale Marketplace is not currently available.');
        vendor.wholesaleProfile = merged;
    }
    if (channel === 'quick_commerce' && !(await isQuickCommerceEnabled())) {
        throw new ApiError(403, 'Quick Commerce is not currently available.');
    }
    // Routed through the single state machine: a vendor may only ever reach
    // `requested`, and reopening a disabled/rejected channel is an explicit,
    // validated transition rather than an unchecked write.
    applyChannelTransition(vendor, channel, 'requested', { actor: 'vendor' });
    await vendor.save();

    // Notify all active admins of the new channel request
    try {
        const channelLabel = {
            retail: 'Retail Marketplace',
            wholesale: 'Wholesale Marketplace',
            quick_commerce: 'Quick Commerce',
        }[channel] || channel;

        const admins = await Admin.find({ isActive: true }).select('_id').lean();
        const actionUrl = `/admin/vendors/${vendor._id}?tab=channels`;
        await Promise.all(
            admins.map((admin) =>
                createNotification({
                    recipientId: admin._id,
                    recipientType: 'admin',
                    title: 'New Channel Application',
                    message: `${vendor.storeName || vendor.name} has applied for the ${channelLabel} channel and is awaiting approval.`,
                    type: 'system',
                    category: 'SYSTEM',
                    actionUrl,
                    data: {
                        vendorId: String(vendor._id),
                        channel,
                        storeName: vendor.storeName || vendor.name,
                        actionUrl,
                    },
                })
            )
        );
    } catch (notificationErr) {
        console.warn(`[Channel Application Notification] Failed: ${notificationErr.message}`);
    }

    res.status(202).json(new ApiResponse(202, channelSummary(vendor), 'Channel application submitted.'));
});

export const withdrawChannelRequest = asyncHandler(async (req, res) => {
    const channel = normalizeVendorChannel(req.params.channel);
    if (!channel) throw new ApiError(400, 'Invalid vendor channel.');
    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) throw new ApiError(404, 'Vendor not found.');
    const path = vendorChannelPath(channel);
    if (vendor.channels?.[path]?.status !== 'requested') throw new ApiError(409, 'Only a requested channel can be withdrawn.');
    applyChannelTransition(vendor, channel, 'disabled', {
        actor: 'vendor',
        reason: 'Request withdrawn by vendor',
    });
    await vendor.save();
    res.status(200).json(new ApiResponse(200, channelSummary(vendor), 'Channel application withdrawn.'));
});

export const changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        throw new ApiError(400, 'Current and new password are required.');
    }

    const vendor = await Vendor.findById(req.user.id).select('+password');
    if (!vendor) {
        throw new ApiError(404, 'Vendor not found.');
    }

    const isMatch = await vendor.comparePassword(currentPassword);
    if (!isMatch) {
        throw new ApiError(401, 'Incorrect current password.');
    }

    vendor.password = newPassword;
    await vendor.save({ validateBeforeSave: false });

    res.status(200).json(new ApiResponse(200, null, 'Password changed successfully.'));
});

export const updateBankDetails = asyncHandler(async (req, res) => {
    const { accountName, accountNumber, bankName, ifscCode, upiId } = req.body;
    if (!accountName && !accountNumber && !bankName && !ifscCode && !upiId) {
        throw new ApiError(400, 'At least one bank detail field is required.');
    }

    const updates = {};
    if (accountName) updates['bankDetails.accountName'] = accountName;
    if (accountNumber) updates['bankDetails.accountNumber'] = accountNumber;
    if (bankName) updates['bankDetails.bankName'] = bankName;
    if (ifscCode) updates['bankDetails.ifscCode'] = ifscCode;
    if (upiId) updates['bankDetails.upiId'] = upiId;

    const vendor = await Vendor.findByIdAndUpdate(
        req.user.id,
        { $set: updates },
        { new: true, runValidators: true }
    ).select('-password -otp -otpExpiry');

    res.status(200).json(new ApiResponse(200, vendor, 'Bank details updated.'));
});

// DELETE /api/vendor/auth/account
export const deleteAccount = asyncHandler(async (req, res) => {
    const vendor = await Vendor.findById(req.user.id).select('+refreshTokenHash +refreshTokenExpiresAt');
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    const activeOrder = await Order.exists({
        isDeleted: { $ne: true },
        status: { $nin: FINAL_ORDER_STATUSES },
        $or: [
            { vendorId: vendor._id },
            { 'vendorItems.vendorId': vendor._id },
            { 'items.vendorId': vendor._id },
        ],
    });
    if (activeOrder) {
        throw new ApiError(409, 'Complete or resolve your active orders before deleting this vendor account.');
    }

    // Soft delete: anonymize PII and deactivate the account
    const deletedAt = Date.now();
    vendor.name = `Deleted Vendor ${deletedAt}`;
    vendor.storeName = 'Closed Store ' + deletedAt;
    vendor.email = buildDeletedEmail('vendor', vendor._id, deletedAt);
    vendor.phone = undefined;
    vendor.country = undefined;
    vendor.address = undefined;
    vendor.storeLogo = undefined;
    vendor.storeDescription = undefined;
    vendor.bankDetails = undefined;
    vendor.documents = undefined;
    vendor.wholesaleProfile = undefined;
    vendor.quickCommerceProfile = undefined;
    vendor.isActive = false;
    vendor.refreshTokenHash = undefined;
    vendor.refreshTokenExpiresAt = undefined;
    const session = await Vendor.db.startSession();
    try {
        await session.withTransaction(async () => {
            await vendor.save({ session, validateBeforeSave: false });
            await Product.updateMany(
                { vendorId: vendor._id },
                { $set: { isActive: false, isVisible: false, retailEnabled: false, wholesaleEnabled: false, quickCommerceEnabled: false } },
                { session }
            );
            // Drop any lingering phone-verification record so a deleted
            // account cannot leave behind a token that still authorises
            // session-less onboarding for that number.
            if (vendor.phoneE164) {
                await PhoneVerification.deleteOne({ phoneE164: vendor.phoneE164 }, { session });
            }
        });
    } finally {
        await session.endSession();
    }

    return res.status(200).json(new ApiResponse(200, null, 'Account deleted successfully.'));
});
