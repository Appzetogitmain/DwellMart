import mongoose from 'mongoose';

/**
 * Escapes regex special characters safely.
 *
 * @param {string} string
 * @returns {string}
 */
export const escapeRegex = (string) =>
    String(string || '').replace(/[-.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Builds a robust Mongo search filter for product queries across Admin,
 * Vendor, and Reports.
 *
 * Solves:
 * 1. Partial/incomplete word matching (e.g. 'seamle' -> matches 'seamless').
 * 2. Multi-word AND logic (all typed words must appear across name/sku/tags,
 *    eliminating false-positive noise from description word splinters).
 * 3. Exact MongoDB ObjectId lookup if query is a 24-character hex string.
 * 4. Safe escaping of special characters (+, -, (), etc.) so they are
 *    treated as literal text rather than Mongo operators.
 *
 * @param {string} search - Raw search query from client
 * @returns {object|null} Mongo filter condition fragment, or null if empty
 */
export const buildCatalogSearchFilter = (search) => {
    const trimmed = String(search || '').trim();
    if (!trimmed) return null;

    // Direct ObjectId match if query is a valid 24-hex ObjectId
    if (mongoose.Types.ObjectId.isValid(trimmed) && String(new mongoose.Types.ObjectId(trimmed)) === trimmed) {
        const escaped = escapeRegex(trimmed);
        return {
            $or: [
                { _id: new mongoose.Types.ObjectId(trimmed) },
                { name: new RegExp(escaped, 'i') },
                { sku: new RegExp(escaped, 'i') },
            ],
        };
    }

    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (!tokens.length) return null;

    if (tokens.length === 1) {
        const regex = new RegExp(escapeRegex(tokens[0]), 'i');
        return {
            $or: [{ name: regex }, { sku: regex }, { tags: regex }],
        };
    }

    return {
        $and: tokens.map((token) => {
            const regex = new RegExp(escapeRegex(token), 'i');
            return {
                $or: [{ name: regex }, { sku: regex }, { tags: regex }],
            };
        }),
    };
};

/**
 * Safely merges a search condition into an existing Mongo filter object.
 * Preserves any existing $and / $or keys without clobbering them.
 *
 * @param {object} filter - Target Mongo filter object (modified in place and returned)
 * @param {string} search - Search query string
 * @returns {object} The mutated filter
 */
export const applyCatalogSearchFilter = (filter, search) => {
    const searchFilter = buildCatalogSearchFilter(search);
    if (!searchFilter) return filter;

    if (filter.$and && Array.isArray(filter.$and)) {
        filter.$and.push(searchFilter);
        return filter;
    }

    if (searchFilter.$and) {
        filter.$and = searchFilter.$and;
        return filter;
    }

    if (searchFilter.$or) {
        if (filter.$or) {
            filter.$and = [{ $or: filter.$or }, { $or: searchFilter.$or }];
            delete filter.$or;
        } else {
            filter.$or = searchFilter.$or;
        }
        return filter;
    }

    return filter;
};
