/**
 * productCapabilityGuard.js
 *
 * Enforces product-field ownership on vendor product writes, using the
 * server-validated workspace (`req.vendorWorkspace`) — never a client-supplied
 * vendor type.
 *
 * What it blocks:
 *   - CROSS-CHANNEL fields: writing another channel's owned data (e.g. setting
 *     `wholesale.priceTiers` from the Retail workspace). Always rejected —
 *     this is the authorization boundary the multi-channel spec requires.
 *   - UNKNOWN fields: keys belonging to no known class. Rejected in strict
 *     mode; logged in observe-only mode.
 *
 * What it deliberately allows:
 *   - The SHARED CORE (name, images, price, stock, category, variants, SEO...)
 *     from every workspace the vendor holds. One product document, one shared
 *     core — see constants/productFieldOwnership.js.
 *
 * Modes:
 *   PRODUCT_FIELD_STRICT unset | 'true'  → strict (default): 400 on violations
 *   PRODUCT_FIELD_STRICT = 'false'       → observe-only for UNKNOWN fields;
 *                                          cross-channel writes are STILL
 *                                          rejected, because that is a
 *                                          security boundary, not a schema
 *                                          strictness preference.
 */

import { classifyProductFields } from '../../../constants/productFieldOwnership.js';

const workspaceLabel = (workspace) => String(workspace || '')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export const productCapabilityGuard = (req, res, next) => {
    try {
        // `enforceAccountStatus` populates req.vendor; `resolveVendorWorkspace`
        // populates req.vendorWorkspace. Both run before this guard on every
        // route that mounts it. Missing either means the request never passed
        // authorization, so defer to those middlewares rather than guessing.
        if (!req.vendor || !req.vendorWorkspace) return next();

        const workspace = req.vendorWorkspace;
        const { crossChannel, unknown } = classifyProductFields(req.body, workspace);

        if (crossChannel.length > 0) {
            return res.status(403).json({
                success: false,
                message: `"${crossChannel[0]}" belongs to another selling channel. `
                    + `Switch to that workspace to change it.`,
                errorCode: 'CROSS_CHANNEL_FIELD_DENIED',
                prohibitedFields: crossChannel,
                workspace,
            });
        }

        if (unknown.length > 0) {
            const strictMode = String(process.env.PRODUCT_FIELD_STRICT || 'true').toLowerCase() !== 'false';
            if (!strictMode) {
                console.warn(
                    `[ProductCapabilityGuard] observe-only: workspace=${workspace} `
                    + `unknown fields=[${unknown.join(', ')}] on ${req.method} ${req.originalUrl}`
                );
                return next();
            }
            return res.status(400).json({
                success: false,
                message: `Field "${unknown[0]}" is not a recognised product field for ${workspaceLabel(workspace)}.`,
                errorCode: 'UNKNOWN_PRODUCT_FIELD',
                prohibitedFields: unknown,
                workspace,
            });
        }

        return next();
    } catch (err) {
        return next(err);
    }
};
