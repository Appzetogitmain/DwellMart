/**
 * productCapabilityGuard.js
 *
 * Middleware that enforces vendorType-based field restrictions on product
 * create/update requests. Reads VendorCapabilities.allowedProductFields
 * for the authenticated vendor's type.
 *
 * Behaviour:
 *   PRODUCT_FIELD_STRICT=true  → 400 Bad Request for prohibited fields
 *   unset (default)            → observe-only: logs what would be rejected
 *
 * Observe-only is the default because this guard was inert since it was written
 * (it read an unset `req.vendor`), so no payload has ever been validated against
 * it. Enforcing immediately would reject writes that have always been accepted.
 */

import { getVendorCapabilities } from '../../../constants/vendorCapabilities.js';

/**
 * Top-level field keys that are always permitted regardless of vendorType
 * (internal system fields set by the server, not the client).
 */
const SYSTEM_FIELDS = new Set([
    '_id', '__v', 'vendorId', 'createdAt', 'updatedAt',
    'retailEnabled', 'wholesaleEnabled', 'quickCommerceEnabled',
    'sellingChannels', 'isActive',
]);

export const productCapabilityGuard = (req, res, next) => {
    try {
        const vendor = req.vendor;
        if (!vendor) return next(); // authenticate middleware will handle missing vendor

        const vendorType = vendor.vendorType ?? 'retail';
        const caps = getVendorCapabilities(vendorType);
        const allowedFields = caps.allowedProductFields ?? [];

        // This guard never ran: it reads `req.vendor`, which nothing assigned,
        // so it returned on its first line for every request since it was
        // written. Now that `enforceAccountStatus` populates the vendor, the
        // guard is live — and switching it straight to rejection would start
        // failing product writes that have been accepted all along.
        //
        // Default is therefore observe-only: log what WOULD be rejected without
        // changing behaviour. Set PRODUCT_FIELD_STRICT=true to enforce, once the
        // logs show what real payloads actually contain.
        const strictMode = process.env.PRODUCT_FIELD_STRICT === 'true';

        const prohibited = [];

        for (const field of Object.keys(req.body)) {
            if (SYSTEM_FIELDS.has(field)) continue;
            if (allowedFields.includes(field)) continue;
            prohibited.push(field);
        }

        if (prohibited.length > 0 && !strictMode) {
            console.warn(
                `[ProductCapabilityGuard] observe-only: vendorType=${vendorType} `
                + `would reject fields=[${prohibited.join(', ')}] on ${req.method} ${req.originalUrl}`
            );
            return next();
        }

        if (prohibited.length > 0) {
            const typeLabel = vendorType
                .split('_')
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');

            return res.status(400).json({
                success: false,
                message: `Field "${prohibited[0]}" is not allowed for ${typeLabel} vendors.`,
                prohibitedFields: prohibited,
                vendorType,
            });
        }

        next();
    } catch (err) {
        next(err);
    }
};
