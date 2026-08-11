import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Settings from '../../../models/Settings.model.js';
import {
    isPubliclyReadableSettingsCategory,
    filterPublicSettings,
} from '../../../constants/publicSettings.js';
import {
    isWritableSettingsCategory,
    getSettingsCategorySchema,
    WRITABLE_SETTINGS_CATEGORIES,
} from '../validators/settings.validator.js';

const GENERAL_SETTINGS_KEY = 'general';

const DEFAULT_GENERAL_SETTINGS = {
    storeName: 'Dwell Mart',
    storeLogo: '',
    storeDescription: 'Your ultimate online shopping destination for premium quality products.',
    contactEmail: 'contact@dwellmart.com',
    contactPhone: '+91 98765 43210',
    address: '123 Commerce Street, Tech Park, New Delhi, India',
    businessHours: 'Mon-Sat 9AM-8PM',
    language: 'en',
    socialMedia: {
        facebook: '',
        instagram: '',
        twitter: '',
        linkedin: '',
    },
    defaultCommissionRate: 10,
};

/**
 * GET /api/admin/settings/general
 * Fetch admin general settings
 */
export const getGeneralSettings = asyncHandler(async (req, res) => {
    let setting = await Settings.findOne({ key: GENERAL_SETTINGS_KEY });
    
    if (!setting) {
        setting = await Settings.create({
            key: GENERAL_SETTINGS_KEY,
            value: DEFAULT_GENERAL_SETTINGS,
        });
    }

    const mergedSettings = {
        ...DEFAULT_GENERAL_SETTINGS,
        ...setting.value,
        socialMedia: {
            ...DEFAULT_GENERAL_SETTINGS.socialMedia,
            ...(setting.value?.socialMedia || {}),
        },
    };

    res.status(200).json(new ApiResponse(200, mergedSettings, 'General settings fetched successfully.'));
});

/**
 * PUT /api/admin/settings/general
 * Update admin general settings
 */
export const updateGeneralSettings = asyncHandler(async (req, res) => {
    const {
        storeName,
        storeLogo,
        storeDescription,
        contactEmail,
        contactPhone,
        address,
        businessHours,
        language,
        socialMedia,
        defaultCommissionRate,
    } = req.body;

    if (!storeName || !String(storeName).trim()) {
        throw new ApiError(400, 'Store name is required.');
    }

    const nextCommissionRate = Number(defaultCommissionRate);
    const validCommissionRate = !Number.isNaN(nextCommissionRate) && nextCommissionRate >= 0 && nextCommissionRate <= 100
        ? nextCommissionRate
        : 10;

    const updatedValue = {
        storeName: String(storeName).trim(),
        storeLogo: String(storeLogo || '').trim(),
        storeDescription: String(storeDescription || '').trim(),
        contactEmail: String(contactEmail || '').trim(),
        contactPhone: String(contactPhone || '').trim(),
        address: String(address || '').trim(),
        businessHours: String(businessHours || '').trim(),
        language: String(language || 'en').trim(),
        socialMedia: {
            facebook: String(socialMedia?.facebook || '').trim(),
            instagram: String(socialMedia?.instagram || '').trim(),
            twitter: String(socialMedia?.twitter || '').trim(),
            linkedin: String(socialMedia?.linkedin || '').trim(),
        },
        defaultCommissionRate: validCommissionRate,
    };

    const setting = await Settings.findOneAndUpdate(
        { key: GENERAL_SETTINGS_KEY },
        { key: GENERAL_SETTINGS_KEY, value: updatedValue },
        { upsert: true, new: true }
    );

    res.status(200).json(new ApiResponse(200, setting.value, 'General settings updated successfully.'));
});

/**
 * GET /api/settings/general (Public Endpoint)
 * Publicly exposed store identity & contact details for storefront
 */
export const getPublicGeneralSettings = asyncHandler(async (req, res) => {
    const setting = await Settings.findOne({ key: GENERAL_SETTINGS_KEY });
    const val = setting?.value || DEFAULT_GENERAL_SETTINGS;

    const publicSettings = {
        storeName: val.storeName || DEFAULT_GENERAL_SETTINGS.storeName,
        storeLogo: val.storeLogo || DEFAULT_GENERAL_SETTINGS.storeLogo,
        storeDescription: val.storeDescription || DEFAULT_GENERAL_SETTINGS.storeDescription,
        contactEmail: val.contactEmail || DEFAULT_GENERAL_SETTINGS.contactEmail,
        contactPhone: val.contactPhone || DEFAULT_GENERAL_SETTINGS.contactPhone,
        address: val.address || DEFAULT_GENERAL_SETTINGS.address,
        businessHours: val.businessHours || DEFAULT_GENERAL_SETTINGS.businessHours,
        language: val.language || DEFAULT_GENERAL_SETTINGS.language,
        socialMedia: {
            ...DEFAULT_GENERAL_SETTINGS.socialMedia,
            ...(val.socialMedia || {}),
        },
    };

    res.status(200).json(new ApiResponse(200, publicSettings, 'Public general settings fetched successfully.'));
});


/**
 * GET /api/settings/:category  (Public Endpoint)
 *
 * The storefront's read path. Deliberately a SEPARATE controller from the admin
 * `getSettingsByCategory`, which returns whole documents to an authorised
 * operator. Sharing one handler between a public route and an admin route is
 * what made every settings category world-readable in the first place.
 *
 * Unknown or non-public categories return 404 rather than 403: whether a
 * category exists is itself information an anonymous caller has no need for.
 */
export const getPublicSettingsByCategory = asyncHandler(async (req, res) => {
    const { category } = req.params;

    if (category === GENERAL_SETTINGS_KEY) {
        return getPublicGeneralSettings(req, res);
    }

    if (!isPubliclyReadableSettingsCategory(category)) {
        throw new ApiError(404, 'Route not found.');
    }

    const setting = await Settings.findOne({ key: category }).lean();
    const publicValue = filterPublicSettings(category, setting?.value || {});

    res.status(200).json(
        new ApiResponse(200, publicValue, `${category} settings fetched successfully.`)
    );
});

/**
 * GET /api/admin/settings/:category
 * Fetch specific category settings.
 * P2-SEC-01 FIX: Payment/gateway secrets are redacted before returning —
 * they are set-only. The UI can show "••••• (set)" without exposing the real value.
 */
export const getSettingsByCategory = asyncHandler(async (req, res) => {
    const { category } = req.params;

    if (category === GENERAL_SETTINGS_KEY) {
        return getGeneralSettings(req, res);
    }

    const setting = await Settings.findOne({ key: category }).lean();
    let value = setting?.value || {};

    // P2-SEC-01: Redact sensitive gateway credentials from admin read responses.
    // These fields must never travel over the wire — even to authenticated admins —
    // because the admin panel JS runs client-side and traffic is logged.
    const SECRET_FIELDS = [
        'cashfreeSecretKey', 'secretKey', 'apiSecret', 'webhookSecret',
        'clientSecret', 'stripeSecretKey', 'razorpayKeySecret',
        'paytmMerchantKey', 'paypalClientSecret',
    ];

    if (category === 'payment' || category === 'gateway' || category === 'integrations') {
        value = { ...value };
        for (const field of SECRET_FIELDS) {
            if (value[field]) {
                value[field] = '••••• (set)';
            }
        }
    }

    res.status(200).json(new ApiResponse(200, value, `${category} settings fetched successfully.`));
});

/**
 * PUT /api/admin/settings/:category
 * Update specific category settings
 */
export const updateSettingsByCategory = asyncHandler(async (req, res) => {
    const { category } = req.params;

    if (category === GENERAL_SETTINGS_KEY) {
        return updateGeneralSettings(req, res);
    }
    
    // Reject invented categories outright: the k/v store's flexibility is for
    // values, not for letting a typo create a permanent orphan document.
    if (!isWritableSettingsCategory(category)) {
        throw new ApiError(
            400,
            `Unknown settings category "${category}". Allowed: ${WRITABLE_SETTINGS_CATEGORIES.join(', ')}.`
        );
    }

    const schema = getSettingsCategorySchema(category);
    const { error, value } = schema.validate(req.body, {
        abortEarly: false,
        // Strip rather than reject: the admin UI posts whole forms whose shape
        // has grown over time, and rejecting extra keys would break existing
        // screens without making the stored document any safer.
        stripUnknown: false,
        convert: true,
    });

    if (error) {
        throw new ApiError(
            400,
            'Invalid settings payload.',
            error.details.map((detail) => ({
                field: detail.path.join('.'),
                message: detail.message,
            }))
        );
    }

    const setting = await Settings.findOneAndUpdate(
        { key: category },
        { key: category, value },
        { upsert: true, new: true }
    );
    
    res.status(200).json(new ApiResponse(200, setting.value, `${category} settings updated successfully.`));
});
