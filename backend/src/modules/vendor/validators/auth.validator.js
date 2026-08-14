import Joi from 'joi';
import {
    QUICK_COMMERCE_STORE_TYPES,
    QUICK_COMMERCE_AVAILABILITY_VALUES,
    LATITUDE_BOUNDS,
    LONGITUDE_BOUNDS,
    MAX_SERVICE_RADIUS_KM,
} from '../../../constants/quickCommerce.js';

const wholesaleProfileSchema = Joi.object({
    gstNumber: Joi.string().trim().max(30).required(),
    businessName: Joi.string().trim().max(150).required(),
    businessAddress: Joi.object({
        street: Joi.string().trim().allow('').optional(),
        city: Joi.string().trim().allow('').optional(),
        state: Joi.string().trim().allow('').optional(),
        zipCode: Joi.string().trim().allow('').optional(),
        country: Joi.string().trim().allow('').optional(),
    }).required(),
    wholesaleContactName: Joi.string().trim().max(100).required(),
    wholesaleContactPhone: Joi.string().trim().max(30).required(),
    bulkOrderSupportEmail: Joi.string().trim().email().required(),
}).messages({
    'any.required': 'This field is required when Wholesale Marketplace is enabled.',
});

export const registerSchema = Joi.object({
    name: Joi.string().trim().min(2).max(50).required(),
    email: Joi.string().email().lowercase().required(),
    password: Joi.string().min(6).required(),
    phone: Joi.string().trim().required(),
    storeName: Joi.string().trim().min(2).max(100).required(),
    storeDescription: Joi.string().trim().max(500).allow('').optional(),
    selectionToken: Joi.string().trim().optional(),
    selectedPlanId: Joi.string().trim().optional(),
    documentType: Joi.string().valid('tradeLicense', 'gst').required().messages({
        'any.only': 'Please choose Trade License or GST.',
        'any.required': 'Please choose Trade License or GST.',
    }),
    address: Joi.object({
        street: Joi.string().allow('').optional(),
        city: Joi.string().allow('').optional(),
        state: Joi.string().allow('').optional(),
        zipCode: Joi.string().allow('').optional(),
        country: Joi.string().allow('').optional(),
    }).optional(),
    agreedToTerms: Joi.boolean().valid(true).required().messages({
        'any.only': 'You must agree to the Terms & Conditions.',
        'any.required': 'You must agree to the Terms & Conditions.',
    }),
    sellingChannels: Joi.object({
        retail: Joi.object({ enabled: Joi.boolean().optional() }).optional(),
        wholesale: Joi.object({ enabled: Joi.boolean().optional() }).optional(),
        quickCommerce: Joi.object({ enabled: Joi.boolean().optional() }).optional(),
    }).optional(),
    wholesaleProfile: Joi.object().optional(),
}).or('selectionToken', 'selectedPlanId').custom((value, helpers) => {
    const retail = value.sellingChannels?.retail?.enabled;
    const wholesale = value.sellingChannels?.wholesale?.enabled;
    const quickCommerce = value.sellingChannels?.quickCommerce?.enabled;
    if (retail === false && wholesale !== true && quickCommerce !== true) {
        return helpers.error('any.invalid');
    }
    return value;
}).messages({
    'any.invalid': 'At least one selling channel (Retail, Wholesale, or Quick Commerce) must be enabled.',
});

export const updateSellingChannelsSchema = Joi.object({
    sellingChannels: Joi.object({
        retail: Joi.object({ enabled: Joi.boolean().required() }).required(),
        wholesale: Joi.object({ enabled: Joi.boolean().required() }).required(),
        // Optional so existing clients that send only retail+wholesale keep
        // working; when omitted the controller preserves the stored value.
        quickCommerce: Joi.object({ enabled: Joi.boolean().required() }).optional(),
    }).required(),
    wholesaleProfile: Joi.when('sellingChannels.wholesale.enabled', {
        is: true,
        then: wholesaleProfileSchema.optional(),
        otherwise: Joi.object().optional(),
    }),
}).messages({
    'any.invalid': 'At least one selling channel (Retail, Wholesale, or Quick Commerce) must remain enabled.',
});

const businessHourSchema = Joi.object({
    day: Joi.number().integer().min(0).max(6).required(),
    open: Joi.string().trim().pattern(/^\d{1,2}:\d{2}$/).allow('').optional(),
    close: Joi.string().trim().pattern(/^\d{1,2}:\d{2}$/).allow('').optional(),
    isClosed: Joi.boolean().optional(),
}).messages({
    'string.pattern.base': 'Business hours must use 24-hour HH:mm format.',
});

export const updateQuickCommerceSettingsSchema = Joi.object({
    storeType: Joi.string().valid(...QUICK_COMMERCE_STORE_TYPES).optional(),
    // Supplied as human-readable lat/lng; converted to GeoJSON server-side.
    latitude: Joi.number().min(LATITUDE_BOUNDS.min).max(LATITUDE_BOUNDS.max).optional(),
    longitude: Joi.number().min(LONGITUDE_BOUNDS.min).max(LONGITUDE_BOUNDS.max).optional(),
    locationAddress: Joi.string().trim().allow('', null).max(500).optional(),
    formattedAddress: Joi.string().trim().allow('', null).max(500).optional(),
    serviceRadiusKm: Joi.number().min(0.5).max(MAX_SERVICE_RADIUS_KM).optional(),
    maxDeliveryDistanceKm: Joi.number().min(0.5).max(MAX_SERVICE_RADIUS_KM).optional(),
    servicedPincodes: Joi.array().items(Joi.string().trim().max(12)).max(200).optional(),
    preparationTimeMins: Joi.number().integer().min(0).max(240).optional(),
    businessHours: Joi.array().items(businessHourSchema).max(7).optional(),
    availabilityStatus: Joi.string().valid(...QUICK_COMMERCE_AVAILABILITY_VALUES).optional(),
    busyExtraMins: Joi.number().integer().min(0).max(240).optional(),
    pausedUntil: Joi.date().allow(null).optional(),
    minOrderValue: Joi.number().min(0).optional(),
    packagingFee: Joi.number().min(0).optional(),
    baseFee: Joi.number().min(0).optional(),
    perKmFee: Joi.number().min(0).optional(),
    freeAboveSubtotal: Joi.number().min(0).optional(),
    freeDeliveryEnabled: Joi.boolean().optional(),
})
    .min(1)
    // Coordinates are only meaningful as a pair — one without the other would
    // produce an invalid GeoJSON Point.
    .and('latitude', 'longitude')
    .messages({
        'object.and': 'Latitude and longitude must be provided together.',
        'object.min': 'Provide at least one Quick Commerce setting to update.',
    });

export const initiateOnboardingSubscriptionSchema = Joi.object({
    email: Joi.string().email().lowercase().required(),
    selectionToken: Joi.string().trim().allow('').optional(),
    selectedPlanId: Joi.string().optional(),
});

export const confirmOnboardingPaymentSchema = Joi.object({
    email: Joi.string().email().lowercase().required(),
    subscriptionId: Joi.string().trim().allow('').optional(),
    paymentId: Joi.string().trim().allow('').optional(),
    signature: Joi.string().trim().allow('').optional(),
});

export const onboardingStatusSchema = Joi.object({
    email: Joi.string().email().lowercase().required(),
});

export const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
});

export const verifyOtpSchema = Joi.object({
    email: Joi.string().email().lowercase().required(),
    otp: Joi.string().pattern(/^\d{6}$/).required(),
});

export const resendOtpSchema = Joi.object({
    email: Joi.string().email().lowercase().required(),
});

export const requestRegistrationOtpSchema = Joi.object({
    email: Joi.string().email().lowercase().required(),
});

export const verifyRegistrationOtpSchema = Joi.object({
    email: Joi.string().email().lowercase().required(),
    otp: Joi.string().pattern(/^\d{6}$/).required(),
});

export const refreshTokenSchema = Joi.object({
    refreshToken: Joi.string().required(),
});

export const logoutSchema = Joi.object({
    refreshToken: Joi.string().allow('').optional(),
});

export const forgotPasswordSchema = Joi.object({
    email: Joi.string().email().lowercase().required(),
});

export const verifyResetOtpSchema = Joi.object({
    email: Joi.string().email().lowercase().required(),
    otp: Joi.string().pattern(/^\d{6}$/).required(),
});

export const resetPasswordSchema = Joi.object({
    email: Joi.string().email().lowercase().required(),
    password: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
        'any.only': 'Confirm password must match password.',
    }),
});
