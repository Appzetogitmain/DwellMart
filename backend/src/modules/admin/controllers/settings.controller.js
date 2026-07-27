import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Settings from '../../../models/Settings.model.js';

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
