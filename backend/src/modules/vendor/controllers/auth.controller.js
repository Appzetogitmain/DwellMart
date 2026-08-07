import fs from 'fs';
import path from 'path';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Vendor from '../../../models/Vendor.model.js';
import Admin from '../../../models/Admin.model.js';
import Settings from '../../../models/Settings.model.js';
import EmailVerification from '../../../models/EmailVerification.model.js';
import crypto from 'crypto';
import { generateTokens } from '../../../utils/generateToken.js';
import { isMockOTP, isOTPMatch, sendOTP } from '../../../services/otp.service.js';
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
        return { onboardingStatus: 'registered', nextStep: 'verify_email', subscription: null };
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
        throw new ApiError(400, 'Please upload either your Trade Licence or GST document.');
    }

    let documentUrl = '';
    let documentFileType = '';

    if (file.mimetype.startsWith('image/')) {
        documentFileType = 'image';
        try {
            const uploaded = await uploadLocalFileToCloudinaryAndCleanup(file.path, 'vendor_documents');
            documentUrl = uploaded.url;
        } catch {
            throw new ApiError(500, `Failed to upload ${documentType === 'gst' ? 'GST' : 'trade licence'} image.`);
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
    const existing = await Vendor.findOne({ email: normalizedEmail }).populate('selectedPlan');

    const verificationRecord = await EmailVerification.findOne({ email: normalizedEmail, isVerified: true });
    if (!verificationRecord) {
        throw new ApiError(400, 'Email not verified. Please verify your email first.');
    }

    if (existing) {
        const onboarding = await getVendorOnboardingState(existing);
        if (
            onboarding.nextStep === 'verify_email'
            || onboarding.nextStep === 'choose_plan'
            || onboarding.nextStep === 'complete_payment'
        ) {
            existing.selectedPlan = plan._id;
            existing.country = String(address?.country || existing.country || '').trim();
            existing.isVerified = true;
            existing.onboardingStatus = 'plan_selected';
            await existing.save({ validateBeforeSave: false });
            await EmailVerification.deleteOne({ email: normalizedEmail });

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
        if (!hasCompleteWholesaleProfile(wholesaleProfile)) {
            throw new ApiError(400, 'Please provide your GST number, business name, business address, wholesale contact, and bulk order support email to enable Wholesale Marketplace.');
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
        isVerified: true, // Already verified inline
        sellingChannels: {
            retail: { enabled: retailRequested },
            wholesale: { enabled: wholesaleRequested },
            quickCommerce: { enabled: quickCommerceRequested },
        },
        wholesaleProfile: wholesaleRequested ? wholesaleProfile : undefined,
    });

    // Clean up verification record
    await EmailVerification.deleteOne({ email: normalizedEmail });

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
            'Registration successful. Email verified.'
        )
    );
});

export const requestRegistrationOTP = asyncHandler(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) throw new ApiError(400, 'Email is required.');

    // Check if vendor already exists and is verified
    const existingVendor = await Vendor.findOne({ email });
    if (existingVendor && existingVendor.isVerified) {
        throw new ApiError(409, 'Email is already registered and verified. Please login.');
    }

    const useMockOTP = process.env.NODE_ENV !== 'production' && ['true', '1'].includes(process.env.USE_MOCK_OTP);
    const otp = useMockOTP ? (process.env.MOCK_OTP || '123456') : crypto.randomInt(100000, 999999).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await EmailVerification.findOneAndUpdate(
        { email },
        { otp, otpExpiry, isVerified: false },
        { upsate: true, new: true, setDefaultsOnInsert: true, upsert: true }
    );

    if (!useMockOTP) {
        try {
            await sendEmail({
                to: email,
                subject: 'Your registration verification code',
                text: `Your verification code is ${otp}. It expires in 10 minutes.`,
                html: `<p>Your verification code is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
            });
        } catch (err) {
            console.warn(`[Registration OTP] Email send failed for ${email}: ${err.message}`);
        }
    } else {
        console.log(`[Registration OTP] Mock OTP ${otp} generated for ${email}`);
    }

    res.status(200).json(new ApiResponse(200, null, 'Verification code sent to your email.'));
});

export const verifyRegistrationOTP = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const record = await EmailVerification.findOne({ email: normalizedEmail });
    if (!record) throw new ApiError(400, 'No verification requested for this email.');

    const useMockOTP = process.env.NODE_ENV !== 'production' && ['true', '1'].includes(process.env.USE_MOCK_OTP);
    const isMatch = useMockOTP && otp === process.env.MOCK_OTP ? true : record.otp === String(otp).trim();

    if (!isMatch) throw new ApiError(400, 'Invalid verification code.');
    if (record.otpExpiry < Date.now()) throw new ApiError(400, 'Verification code has expired.');

    record.isVerified = true;
    await record.save();

    res.status(200).json(new ApiResponse(200, { email: normalizedEmail, isVerified: true }, 'Email verified successfully.'));
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

export const verifyOTP = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    const vendor = await Vendor.findOne({ email }).select('+otp +otpExpiry');
    if (!vendor) throw new ApiError(404, 'Vendor not found.');
    if (!isOTPMatch(vendor.otp, otp)) throw new ApiError(400, 'Invalid OTP.');
    if (!isMockOTP(otp) && vendor.otpExpiry < Date.now()) throw new ApiError(400, 'OTP has expired.');

    vendor.isVerified = true;
    vendor.onboardingStatus = vendor.selectedPlan ? 'plan_selected' : 'email_verified';
    vendor.otp = undefined;
    vendor.otpExpiry = undefined;
    await vendor.save();

    const message = vendor.selectedPlan
        ? 'Email verified. Please complete your subscription payment.'
        : 'Email verified. Please complete your plan selection.';

    res.status(200).json(new ApiResponse(200, { email: vendor.email }, message));
});

export const resendOTP = asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) throw new ApiError(400, 'Email is required.');

    const vendor = await Vendor.findOne({ email });
    if (!vendor) throw new ApiError(404, 'Vendor not found.');
    if (vendor.isVerified) throw new ApiError(400, 'Email is already verified.');

    await sendOTP(vendor, 'vendor_verification');
    res.status(200).json(new ApiResponse(200, null, 'OTP resent successfully. Please check your email.'));
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

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    vendor.resetOtp = otp;
    vendor.resetOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    vendor.resetOtpVerified = false;
    await vendor.save({ validateBeforeSave: false });

    try {
        await sendEmail({
            to: vendor.email,
            subject: 'Vendor password reset OTP',
            text: `Your password reset OTP is ${otp}. It expires in 10 minutes.`,
            html: `<p>Your password reset OTP is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
        });
    } catch (err) {
        console.warn(`[Vendor Forgot Password] Email send failed for ${vendor.email}: ${err.message}`);
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[Vendor Forgot Password] Reset OTP generated for ${vendor.email}`);
        }
    }

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
    if (!vendor.isVerified) throw new ApiError(403, 'Please verify your email first.');

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
                },
            },
            'Login successful.'
        )
    );
});

export const refresh = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    const decoded = decodeRefreshTokenOrThrow(refreshToken);
    const vendor = await Vendor.findById(decoded.id).select('+refreshTokenHash +refreshTokenExpiresAt status isVerified suspensionReason');

    if (!vendor) throw new ApiError(401, 'Invalid refresh token.');
    if (!vendor.isVerified) throw new ApiError(403, 'Please verify your email first.');

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

    if (vendor.sellingChannels?.quickCommerce?.enabled !== true) {
        throw new ApiError(403, 'Enable the Quick Commerce selling channel before configuring its settings.');
    }

    const quickCommerceEnabled = await isQuickCommerceEnabled();
    if (!quickCommerceEnabled) {
        throw new ApiError(403, 'Quick Commerce is not currently available on this platform.');
    }

    const {
        latitude,
        longitude,
        serviceRadiusKm,
        ...rest
    } = req.body;

    const profile = vendor.quickCommerceProfile?.toObject?.() ?? { ...(vendor.quickCommerceProfile || {}) };
    const next = { ...profile, ...rest };

    // Coordinates arrive as lat/lng and are stored as a GeoJSON Point.
    if (latitude !== undefined && longitude !== undefined) {
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
                // Availability is derived server-side and returned so the UI
                // never has to recompute it.
                availability,
                location: pointToLatLng(vendor.quickCommerceProfile?.location),
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
        : vendor.sellingChannels?.quickCommerce?.enabled === true;

    // Validated here rather than in Joi because the effective value depends on
    // stored state that the validator cannot see.
    if (!sellingChannels.retail.enabled && !sellingChannels.wholesale.enabled && !quickCommerceRequested) {
        throw new ApiError(400, 'At least one selling channel (Retail, Wholesale, or Quick Commerce) must remain enabled.');
    }

    if (quickCommerceRequested && vendor.sellingChannels?.quickCommerce?.enabled !== true) {
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
        if (!hasCompleteWholesaleProfile(mergedProfile)) {
            throw new ApiError(400, 'Please provide your GST number, business name, wholesale contact, and bulk order support email to enable Wholesale Marketplace.');
        }
        vendor.wholesaleProfile = mergedProfile;
    } else if (wholesaleProfile) {
        vendor.wholesaleProfile = { ...(vendor.wholesaleProfile?.toObject?.() || {}), ...wholesaleProfile };
    }

    vendor.sellingChannels = {
        retail: { enabled: sellingChannels.retail.enabled },
        wholesale: { enabled: sellingChannels.wholesale.enabled },
        quickCommerce: { enabled: quickCommerceRequested },
    };

    await vendor.save();

    res.status(200).json(new ApiResponse(200, vendor, 'Selling channels updated.'));
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
