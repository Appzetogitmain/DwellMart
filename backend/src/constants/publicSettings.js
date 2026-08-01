/**
 * Which settings the storefront may read without authenticating.
 *
 * Before this existed, `GET /api/settings/:category` was public, took any key,
 * and returned the whole stored value. An anonymous request for `payment`,
 * `features` or `quick_commerce` returned everything an admin had saved there —
 * including anything secret.
 *
 * Two rules close that, and the second is the one that keeps it closed:
 *
 *   1. **Category allowlist.** A category not named here is not public at all.
 *      New categories are private by default, which is the safe direction.
 *
 *   2. **Booleans only, unless a field is explicitly named.** Feature flags and
 *      payment-method availability are booleans; API keys, secrets, webhook
 *      URLs and account identifiers are strings. Publishing only booleans means
 *      a credential added to one of these categories later cannot leak through
 *      this endpoint by omission — the failure mode is a missing toggle, not a
 *      disclosed secret.
 *
 * `general` is absent deliberately: it has its own public handler with a
 * hand-written field allowlist, because storefront identity is legitimately
 * made of strings.
 */

/**
 * @typedef {object} PublicSettingsPolicy
 * @property {boolean} booleansOnly  publish every boolean-valued field
 * @property {string[]} [allowFields] additional non-boolean fields to publish
 */

/** @type {Record<string, PublicSettingsPolicy>} */
export const PUBLIC_SETTINGS_POLICY = {
    /**
     * Storefront feature toggles — wishlist, flash sale, wholesale and Quick
     * Commerce entry points. The client must know these to decide what to
     * render, and every one of them is a boolean.
     */
    features: { booleansOnly: true },

    /**
     * Which payment methods to offer at checkout. Only the availability
     * booleans; gateway credentials stored alongside them are never published.
     */
    payment: { booleansOnly: true },

    /**
     * Review display configuration. `booleansOnly` covers the toggles; the
     * numeric limit is named explicitly because the storefront needs it.
     */
    reviews: { booleansOnly: true, allowFields: ['maxRating', 'minRating'] },
};

/** @param {string} category */
export const isPubliclyReadableSettingsCategory = (category) =>
    Object.hasOwn(PUBLIC_SETTINGS_POLICY, String(category || ''));

/**
 * Reduce a stored settings value to the fields the policy publishes.
 *
 * Nested objects are filtered recursively under the same rule, so a credential
 * nested one level deep is excluded just as a top-level one is.
 *
 * @param {string} category
 * @param {object} value stored settings value
 * @returns {object} the publishable subset
 */
export const filterPublicSettings = (category, value) => {
    const policy = PUBLIC_SETTINGS_POLICY[String(category || '')];
    if (!policy || !value || typeof value !== 'object') return {};

    const allowFields = new Set(policy.allowFields || []);
    const result = {};

    for (const [key, fieldValue] of Object.entries(value)) {
        if (typeof fieldValue === 'boolean') {
            result[key] = fieldValue;
            continue;
        }
        if (allowFields.has(key)) {
            result[key] = fieldValue;
            continue;
        }
        // Recurse into plain objects so nested toggles survive and nested
        // secrets do not. Arrays are never published: they are far more often
        // credential lists or endpoint lists than UI toggles.
        if (
            fieldValue
            && typeof fieldValue === 'object'
            && !Array.isArray(fieldValue)
        ) {
            const nested = filterPublicSettings(category, fieldValue);
            if (Object.keys(nested).length > 0) result[key] = nested;
        }
    }

    return result;
};
