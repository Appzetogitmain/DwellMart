import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Settings from '../../../models/Settings.model.js';

/**
 * Get all platform shipping rates configured by the Dwell Mart Admin.
 * Vendors have read-only access to view these rates across Retail, Wholesale, and Quick Commerce.
 */
export const getShippingRates = asyncHandler(async (req, res) => {
    const [shippingDoc, qcDoc] = await Promise.all([
        Settings.findOne({ key: 'shipping' }).lean(),
        Settings.findOne({ key: 'quick_commerce' }).lean(),
    ]);

    const shippingVal = shippingDoc?.value || {};
    const qcVal = qcDoc?.value || {};

    const defaultRate = Number.isFinite(Number(shippingVal.defaultShippingRate))
        ? Number(shippingVal.defaultShippingRate)
        : 65;
    const freeThreshold = Number.isFinite(Number(shippingVal.freeShippingThreshold))
        ? Number(shippingVal.freeShippingThreshold)
        : 1000;
    const methods = Array.isArray(shippingVal.shippingMethods) && shippingVal.shippingMethods.length
        ? shippingVal.shippingMethods
        : ['standard'];

    const qcBaseFee = Number.isFinite(Number(qcVal.baseDeliveryFee)) ? Number(qcVal.baseDeliveryFee) : 30;
    const qcPerKm = Number.isFinite(Number(qcVal.perKmDeliveryFee)) ? Number(qcVal.perKmDeliveryFee) : 10;
    const qcFreeAbove = Number.isFinite(Number(qcVal.freeDeliveryAboveSubtotal)) ? Number(qcVal.freeDeliveryAboveSubtotal) : 500;
    const qcMaxRadius = Number.isFinite(Number(qcVal.maxServiceRadiusKm)) ? Number(qcVal.maxServiceRadiusKm) : 5;

    const rates = [
        {
            _id: 'admin_rate_standard',
            name: 'Standard Delivery (National Courier / DTDC)',
            channel: 'Retail & Wholesale Marketplace',
            scope: 'National / All Serviced Pincodes',
            rate: defaultRate,
            freeShippingThreshold: freeThreshold,
            estimatedDays: '3-5 business days',
            description: 'Flat standard courier shipping for marketplace orders.',
            isConfiguredByAdmin: true,
        },
    ];

    if (methods.includes('express')) {
        rates.push({
            _id: 'admin_rate_express',
            name: 'Express Delivery (Priority Air Courier)',
            channel: 'Retail & Wholesale Marketplace',
            scope: 'National / Priority Routes',
            rate: defaultRate * 2,
            freeShippingThreshold: 0,
            estimatedDays: '1-2 business days',
            description: 'Fast-track courier dispatch for urgent marketplace orders.',
            isConfiguredByAdmin: true,
        });
    }

    rates.push({
        _id: 'admin_rate_qc',
        name: 'Quick Commerce Hyperlocal Delivery',
        channel: 'Quick Commerce Express',
        scope: `Within ${qcMaxRadius} km store service radius (GPS)`,
        rate: qcBaseFee,
        perKmFee: qcPerKm,
        freeShippingThreshold: qcFreeAbove,
        estimatedDays: '15-30 minutes',
        description: `Base fee ₹${qcBaseFee} + ₹${qcPerKm}/km. Hyperlocal delivery eligibility is determined by vendor store GPS location and customer delivery pin.`,
        isConfiguredByAdmin: true,
    });

    res.status(200).json(new ApiResponse(200, {
        rates,
        adminConfig: {
            freeShippingThreshold: freeThreshold,
            defaultShippingRate: defaultRate,
            shippingMethods: methods,
            quickCommerce: {
                baseDeliveryFee: qcBaseFee,
                perKmDeliveryFee: qcPerKm,
                freeDeliveryAboveSubtotal: qcFreeAbove,
                maxServiceRadiusKm: qcMaxRadius,
            },
        },
    }, 'Admin-configured shipping rates fetched successfully.'));
});

/**
 * Shipping zones management is exclusively Admin-side.
 * Returns empty array for read requests and blocks vendor mutations.
 */
export const getShippingZones = asyncHandler(async (req, res) => {
    res.status(200).json(new ApiResponse(200, [], 'Shipping zones are managed exclusively by the Dwell Mart Admin.'));
});

export const createShippingZone = asyncHandler(async (req, res) => {
    throw new ApiError(403, 'Shipping zones and rates are managed exclusively by the Dwell Mart Admin.');
});

export const updateShippingZone = asyncHandler(async (req, res) => {
    throw new ApiError(403, 'Shipping zones and rates are managed exclusively by the Dwell Mart Admin.');
});

export const deleteShippingZone = asyncHandler(async (req, res) => {
    throw new ApiError(403, 'Shipping zones and rates are managed exclusively by the Dwell Mart Admin.');
});

export const createShippingRate = asyncHandler(async (req, res) => {
    throw new ApiError(403, 'Shipping rates are managed exclusively by the Dwell Mart Admin.');
});

export const updateShippingRate = asyncHandler(async (req, res) => {
    throw new ApiError(403, 'Shipping rates are managed exclusively by the Dwell Mart Admin.');
});

export const deleteShippingRate = asyncHandler(async (req, res) => {
    throw new ApiError(403, 'Shipping rates are managed exclusively by the Dwell Mart Admin.');
});
