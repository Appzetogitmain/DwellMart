/**
 * productCapabilityGuard.js
 *
 * Middleware that enforces vendorType-based field restrictions on product
 * create/update requests. Reads VendorCapabilities.allowedProductFields
 * for the authenticated vendor's type.
 *
 * Behaviour:
 *   STRICT_MODE=true  (production default) → 400 Bad Request for prohibited fields
 *   STRICT_MODE=false (development)        → silently strips prohibited fields
 *
 * Set PRODUCT_FIELD_STRICT=false in .env to enable sanitize-only mode.
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

        const strictMode = process.env.PRODUCT_FIELD_STRICT !== 'false';

        const prohibited = [];

        for (const field of Object.keys(req.body)) {
            if (SYSTEM_FIELDS.has(field)) continue;
            if (allowedFields.includes(field)) continue;

            if (strictMode) {
                prohibited.push(field);
            } else {
                // Dev mode: sanitize — remove the disallowed field silently
                delete req.body[field];
            }
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
