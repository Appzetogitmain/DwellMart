import Product from '../models/Product.model.js';

export const normalizeVariantPart = (value) => String(value || '').trim().toLowerCase();

export const normalizeAxisName = (value) =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');

export const createDynamicVariantKey = (selection = {}) =>
    Object.entries(selection || {})
        .map(([axis, value]) => [normalizeAxisName(axis), normalizeVariantPart(value)])
        .filter(([axis, value]) => axis && value)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([axis, value]) => `${axis}=${value}`)
        .join('|');

export const toVariantPriceEntries = (variantPrices) => {
    if (!variantPrices) return [];
    if (variantPrices instanceof Map) return Array.from(variantPrices.entries());
    if (typeof variantPrices === 'object') return Object.entries(variantPrices);
    return [];
};

export const toVariantStockEntries = (stockMap) => {
    if (!stockMap) return [];
    if (stockMap instanceof Map) return Array.from(stockMap.entries());
    if (typeof stockMap === 'object') return Object.entries(stockMap);
    return [];
};

/**
 * Resolve the exact variant key for an order item against a product's variant inventory.
 *
 * @param {Object} product - Product document or lean snapshot
 * @param {Object} orderItem - Order item containing variant / variantKey
 * @returns {string|null}
 */
export const resolveOrderItemVariantKey = (product, orderItem) => {
    const explicitKey = String(orderItem?.variantKey || '').trim();
    if (explicitKey) return explicitKey;

    const stockEntries = toVariantStockEntries(product?.variants?.stockMap).map(([k]) => String(k).trim());
    const priceEntries = toVariantPriceEntries(product?.variants?.prices).map(([k]) => String(k).trim());
    const existingKeys = [...new Set([...stockEntries, ...priceEntries])];
    if (!existingKeys.length) return null;

    const dynamicSelection = Object.entries(orderItem?.variant || {}).reduce((acc, [axis, value]) => {
        const axisKey = normalizeAxisName(axis);
        const selectedValue = String(value || '').trim();
        if (axisKey && selectedValue) acc[axisKey] = selectedValue;
        return acc;
    }, {});
    const dynamicKey = createDynamicVariantKey(dynamicSelection);
    if (dynamicKey) {
        const exactDynamic = existingKeys.find((key) => key === dynamicKey);
        if (exactDynamic) return exactDynamic;
        const normalizedDynamic = existingKeys.find(
            (key) => normalizeVariantPart(key) === normalizeVariantPart(dynamicKey)
        );
        if (normalizedDynamic) return normalizedDynamic;
    }

    const size = normalizeVariantPart(orderItem?.variant?.size);
    const color = normalizeVariantPart(orderItem?.variant?.color);
    if (!size && !color) return null;

    const candidates = [
        `${size}|${color}`,
        `${size}-${color}`,
        `${size}_${color}`,
        `${size}:${color}`,
        size && !color ? size : null,
        color && !size ? color : null,
    ].filter(Boolean);

    for (const candidate of candidates) {
        const exact = existingKeys.find((key) => key === candidate);
        if (exact) return exact;
        const normalized = existingKeys.find((key) => normalizeVariantPart(key) === normalizeVariantPart(candidate));
        if (normalized) return normalized;
    }
    return null;
};

/**
 * Restore product inventory and variant stock levels for cancelled order items.
 *
 * Replaces N+1 sequential database updates (3N in customer flow, 2N in admin flow)
 * with a batched 2-query strategy:
 *   1. Single batched read of unique products: Product.find({ _id: { $in: uniqueProductIds } })
 *   2. In-memory aggregation across multiple line items (including multiple variants of the same product)
 *   3. Single batched atomic write: Product.bulkWrite(bulkOps, { session })
 *
 * @param {Array<Object>} orderItems - Array of order items to restore
 * @param {{ session?: import('mongoose').ClientSession }} [options] - Optional Mongoose session for transaction atomicity
 * @returns {Promise<{ restoredCount: number, modifiedProducts: number }>}
 */
export const restoreOrderInventory = async (orderItems, options = {}) => {
    if (!Array.isArray(orderItems) || orderItems.length === 0) {
        return { restoredCount: 0, modifiedProducts: 0 };
    }

    const session = options.session || null;

    // 1. Filter out invalid items (non-positive quantity or missing productId)
    const validItems = [];
    for (const item of orderItems) {
        const quantity = Number(item?.quantity || 0);
        if (quantity > 0 && item?.productId) {
            validItems.push({
                productId: String(item.productId),
                quantity,
                variant: item.variant,
                variantKey: item.variantKey,
            });
        }
    }

    if (validItems.length === 0) {
        return { restoredCount: 0, modifiedProducts: 0 };
    }

    // 2. Extract unique product IDs and perform a single batched read
    const uniqueProductIds = [...new Set(validItems.map((item) => item.productId))];

    let query = Product.find({ _id: { $in: uniqueProductIds } })
        .select('_id variants.stockMap variants.prices lowStockThreshold stockQuantity');
    if (session) query = query.session(session);
    const products = await query.lean();

    if (!products || products.length === 0) {
        return { restoredCount: 0, modifiedProducts: 0 };
    }

    const productMap = new Map(products.map((p) => [String(p._id), p]));

    // 3. Group valid items by productId to correctly aggregate quantities & variants
    const itemsByProduct = new Map();
    for (const item of validItems) {
        const pid = item.productId;
        if (!itemsByProduct.has(pid)) {
            itemsByProduct.set(pid, []);
        }
        itemsByProduct.get(pid).push(item);
    }

    // 4. Build atomic bulkWrite operations
    const bulkOps = [];

    for (const [pidStr, itemsList] of itemsByProduct.entries()) {
        const product = productMap.get(pidStr);
        if (!product) continue;

        let totalQtyToAdd = 0;
        const variantIncMap = {};

        for (const item of itemsList) {
            const qty = Number(item.quantity || 0);
            totalQtyToAdd += qty;

            const variantKey = resolveOrderItemVariantKey(product, item);
            if (variantKey) {
                const path = `variants.stockMap.${variantKey}`;
                variantIncMap[path] = (variantIncMap[path] || 0) + qty;
            }
        }

        // Calculate resulting stock status enum from current transaction snapshot
        const currentStockQty = Number(product.stockQuantity || 0);
        const finalStockQty = currentStockQty + totalQtyToAdd;
        const lowStockThreshold = Number(product.lowStockThreshold ?? 10);

        let nextStockState = 'in_stock';
        if (finalStockQty <= 0) {
            nextStockState = 'out_of_stock';
        } else if (finalStockQty <= lowStockThreshold) {
            nextStockState = 'low_stock';
        } else {
            nextStockState = 'in_stock';
        }

        bulkOps.push({
            updateOne: {
                filter: { _id: product._id },
                update: {
                    $inc: {
                        stockQuantity: totalQtyToAdd,
                        ...variantIncMap,
                    },
                    $set: {
                        stock: nextStockState,
                    },
                },
            },
        });
    }

    // 5. Execute single batched write inside the transaction session
    if (bulkOps.length > 0) {
        await Product.bulkWrite(bulkOps, session ? { session } : {});
    }

    return {
        restoredCount: validItems.length,
        modifiedProducts: bulkOps.length,
    };
};
