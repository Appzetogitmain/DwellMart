/**
 * Settings write validation.
 *
 * `PUT /api/admin/settings/:category` previously stored `req.body` verbatim:
 * any category name, any shape, any value. A negative delivery fee, a string
 * where a number belongs, or an entirely invented category were all accepted
 * and persisted, and the resulting corruption surfaced later as broken
 * arithmetic somewhere else entirely.
 *
 * The blueprint called for Joi validation at the controller (§23) — this is it.
 *
 * Two deliberate choices:
 *
 *   • **Unknown categories are rejected.** The k/v store's flexibility is for
 *     values, not for letting a typo create a permanent orphan document.
 *
 *   • **Unknown keys within a known category are stripped, not rejected.**
 *     The admin UI posts whole forms and the stored shape has grown over time;
 *     rejecting extra keys would break existing screens. Stripping keeps the
 *     stored document clean without a coordinated frontend change.
 */

import Joi from 'joi';
import {
    LATITUDE_BOUNDS,
    LONGITUDE_BOUNDS,
    MAX_SERVICE_RADIUS_KM,
} from '../../../constants/quickCommerce.js';

const booleanFlag = Joi.boolean();

/**
 * Platform feature flags.
 * `unknown(true)` because storefront toggles are added regularly and each
 * addition should not require a validator change; the value type is what
 * matters, and every flag is a boolean.
 */
const featuresSchema = Joi.object()
    .pattern(Joi.string(), booleanFlag)
    .min(0);

/**
 * Payment configuration.
 * Availability toggles are constrained; credential fields are permitted as
 * strings but never published (see `constants/publicSettings.js`).
 */
const paymentSchema = Joi.object({
    codEnabled: booleanFlag,
    cardEnabled: booleanFlag,
    upiEnabled: booleanFlag,
    walletEnabled: booleanFlag,
    bankEnabled: booleanFlag,
}).unknown(true);

/**
 * Quick Commerce economics.
 *
 * Every bound here is a real-world constraint, not defensive noise: a negative
 * fee would credit the customer, a zero speed divides by zero in the ETA
 * engine, and a radius beyond the platform ceiling would promise deliveries the
 * dispatch system will not make.
 */
const quickCommerceSchema = Joi.object({
    baseDeliveryFee: Joi.number().min(0).max(10000),
    perKmDeliveryFee: Joi.number().min(0).max(10000),
    freeDeliveryAboveSubtotal: Joi.number().min(0),
    averageSpeedKmph: Joi.number().greater(0).max(200),
    maxServiceRadiusKm: Joi.number().greater(0).max(MAX_SERVICE_RADIUS_KM),
    vendorAckTimeoutSecs: Joi.number().integer().greater(0).max(3600),
    defaultPreparationMins: Joi.number().integer().min(0).max(240),
    defaultLatitude: Joi.number().min(LATITUDE_BOUNDS.min).max(LATITUDE_BOUNDS.max),
    defaultLongitude: Joi.number().min(LONGITUDE_BOUNDS.min).max(LONGITUDE_BOUNDS.max),
}).unknown(true);

/** Review display configuration. */
const reviewsSchema = Joi.object({
    enabled: booleanFlag,
    requirePurchase: booleanFlag,
    autoPublish: booleanFlag,
    maxRating: Joi.number().integer().min(1).max(10),
    minRating: Joi.number().integer().min(0).max(10),
}).unknown(true);

/**
 * Categories that may be written through the generic endpoint, and the schema
 * each is validated against. `general` is absent: it has a dedicated route and
 * controller with its own validation.
 */
export const SETTINGS_CATEGORY_SCHEMAS = {
    features: featuresSchema,
    payment: paymentSchema,
    quick_commerce: quickCommerceSchema,
    reviews: reviewsSchema,
    shipping: Joi.object().unknown(true),
    seo: Joi.object().unknown(true),
    notifications: Joi.object().unknown(true),
};

/** @param {string} category */
export const isWritableSettingsCategory = (category) =>
    Object.hasOwn(SETTINGS_CATEGORY_SCHEMAS, String(category || ''));

export const getSettingsCategorySchema = (category) =>
    SETTINGS_CATEGORY_SCHEMAS[String(category || '')] ?? null;

export const WRITABLE_SETTINGS_CATEGORIES = Object.keys(SETTINGS_CATEGORY_SCHEMAS);
