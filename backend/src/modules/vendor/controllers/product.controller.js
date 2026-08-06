import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Product from '../../../models/Product.model.js';
import Vendor from '../../../models/Vendor.model.js';
import { slugify } from '../../../utils/slugify.js';
import Category from '../../../models/Category.model.js';
import {
    resolveWholesalePayload,
    resolveQuickCommercePayload,
} from '../../../services/pricingValidation.service.js';

const getVendorChannels = async (vendorId) => {
    const vendor = await Vendor.findById(vendorId).select('sellingChannels').lean();
    return {
        wholesale: vendor?.sellingChannels?.wholesale?.enabled === true,
        quickCommerce: vendor?.sellingChannels?.quickCommerce?.enabled === true,
    };
};

/** Look up which experience a category belongs to, for cross-tree validation. */
const getCategoryExperience = async (categoryId) => {
    if (!categoryId) return null;
    const category = await Category.findById(categoryId).select('supportedExperiences experience').lean();
    if (!category) throw new ApiError(400, 'Selected category does not exist.');
    if (Array.isArray(category.supportedExperiences) && category.supportedExperiences.length > 0) {
        if (category.supportedExperiences.includes('quick_commerce')) {
            return 'quick_commerce';
        }
        return category.supportedExperiences[0];
    }
    return category.experience || 'marketplace';
};

const deriveStockStatus = (stockQuantity = 0, lowStockThreshold = 10) => {
    if (stockQuantity <= 0) return 'out_of_stock';
    if (stockQuantity <= lowStockThreshold) return 'low_stock';
    return 'in_stock';
};

const sanitizeFaqs = (faqs) => {
    if (!Array.isArray(faqs)) return [];
    return faqs
        .map((faq) => ({
            question: String(faq?.question || '').trim(),
            answer: String(faq?.answer || '').trim(),
        }))
        .filter((faq) => faq.question && faq.answer);
};

const normalizeVariantPart = (value) => String(value || '').trim().toLowerCase();

const uniqueAxisValues = (values = []) => {
    const seen = new Set();
    const out = [];
    for (const raw of values) {
        const value = String(raw || '').trim();
        if (!value) continue;
        const key = normalizeVariantPart(value);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
    }
    return out;
};

const createVariantKey = (size = '', color = '') =>
    `${normalizeVariantPart(size)}|${normalizeVariantPart(color)}`;
const normalizeAxisName = (value) =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
const createDynamicVariantKey = (selection = {}) =>
    Object.entries(selection || {})
        .map(([axis, value]) => [normalizeAxisName(axis), normalizeVariantPart(value)])
        .filter(([axis, value]) => axis && value)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([axis, value]) => `${axis}=${value}`)
        .join('|');

const toObjectEntries = (value) => {
    if (!value) return [];
    if (value instanceof Map) return Array.from(value.entries());
    if (typeof value === 'object') return Object.entries(value);
    return [];
};

const toNonNegativeNumber = (raw) => {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const normalizeAttributes = (rawAttributes = []) => {
    const seen = new Set();
    const attributes = [];
    for (const raw of rawAttributes || []) {
        const name = String(raw?.name || '').trim();
        const axisKey = normalizeAxisName(name);
        if (!name || !axisKey || seen.has(axisKey)) continue;
        seen.add(axisKey);
        const values = uniqueAxisValues(raw?.values || []);
        if (!values.length) continue;
        attributes.push({ name, axisKey, values });
    }
    return attributes;
};

const buildCombinationsFromAttributes = (attributes = []) => {
    if (!attributes.length) return [];
    let combos = [{}];
    attributes.forEach((attr) => {
        const next = [];
        combos.forEach((selection) => {
            attr.values.forEach((value) => next.push({ ...selection, [attr.axisKey]: value }));
        });
        combos = next;
    });
    return combos;
};

const normalizeVariantsPayload = (rawVariants = {}, fallbackPrice) => {
    if (!rawVariants || typeof rawVariants !== 'object') {
        return { sizes: [], colors: [], attributes: [], prices: {}, stockMap: {}, imageMap: {}, defaultVariant: {}, defaultSelection: {} };
    }

    const sizes = uniqueAxisValues(rawVariants.sizes || []);
    const colors = uniqueAxisValues(rawVariants.colors || []);
    const attributes = normalizeAttributes(rawVariants.attributes || []);
    const hasSizeAxis = sizes.length > 0;
    const hasColorAxis = colors.length > 0;
    const hasDynamicAxes = attributes.length > 0;
    const hasAnyAxis = hasDynamicAxes || hasSizeAxis || hasColorAxis;

    if (!hasAnyAxis) {
        return { sizes: [], colors: [], attributes: [], prices: {}, stockMap: {}, imageMap: {}, defaultVariant: {}, defaultSelection: {} };
    }

    const combinations = [];
    if (hasDynamicAxes) {
        buildCombinationsFromAttributes(attributes).forEach((selection) => combinations.push({ selection }));
    } else if (hasSizeAxis && hasColorAxis) {
        sizes.forEach((size) => colors.forEach((color) => combinations.push({ selection: { size, color } })));
    } else if (hasSizeAxis) {
        sizes.forEach((size) => combinations.push({ selection: { size } }));
    } else {
        colors.forEach((color) => combinations.push({ selection: { color } }));
    }

    const pricesSource = Object.fromEntries(toObjectEntries(rawVariants.prices));
    const stockSource = Object.fromEntries(toObjectEntries(rawVariants.stockMap));
    const imageSource = Object.fromEntries(toObjectEntries(rawVariants.imageMap));
    const prices = {};
    const stockMap = {};
    const imageMap = {};

    combinations.forEach(({ selection }) => {
        const size = String(selection?.size || '');
        const color = String(selection?.color || '');
        const key = hasDynamicAxes
            ? createDynamicVariantKey(selection)
            : createVariantKey(size, color);
        const rawPrice = pricesSource[key];
        const parsedPrice = Number(rawPrice);
        if (Number.isFinite(parsedPrice) && parsedPrice >= 0) {
            prices[key] = parsedPrice;
        } else {
            const fallback = Number(fallbackPrice);
            if (Number.isFinite(fallback) && fallback >= 0) {
                prices[key] = fallback;
            }
        }

        const parsedStock = toNonNegativeNumber(stockSource[key]);
        if (parsedStock !== null) {
            stockMap[key] = parsedStock;
        }

        const image = String(imageSource[key] || '').trim();
        if (image) {
            imageMap[key] = image;
        }
    });

    const defaultSize = String(rawVariants?.defaultVariant?.size || '').trim();
    const defaultColor = String(rawVariants?.defaultVariant?.color || '').trim();
    const normalizedDefaultSize = hasSizeAxis ? defaultSize : '';
    const normalizedDefaultColor = hasColorAxis ? defaultColor : '';
    const hasValidDefaultSize = !normalizedDefaultSize || sizes.some((s) => normalizeVariantPart(s) === normalizeVariantPart(normalizedDefaultSize));
    const hasValidDefaultColor = !normalizedDefaultColor || colors.some((c) => normalizeVariantPart(c) === normalizeVariantPart(normalizedDefaultColor));

    if (!hasValidDefaultSize || !hasValidDefaultColor) {
        throw new ApiError(400, 'Default variant must exist in provided sizes/colors.');
    }

    const defaultSelection = {};
    if (rawVariants?.defaultSelection && typeof rawVariants.defaultSelection === 'object') {
        Object.entries(rawVariants.defaultSelection).forEach(([axis, value]) => {
            const axisKey = normalizeAxisName(axis);
            const selectedValue = String(value || '').trim();
            if (!axisKey || !selectedValue) return;
            const axisMeta = attributes.find((attr) => attr.axisKey === axisKey);
            if (!axisMeta) return;
            const matched = axisMeta.values.find(
                (candidate) => normalizeVariantPart(candidate) === normalizeVariantPart(selectedValue)
            );
            if (matched) defaultSelection[axisKey] = matched;
        });
    }

    return {
        sizes,
        colors,
        attributes: attributes.map((attr) => ({ name: attr.name, values: attr.values })),
        prices,
        stockMap,
        imageMap,
        defaultVariant: {
            size: normalizedDefaultSize,
            color: normalizedDefaultColor,
        },
        defaultSelection,
    };
};

const calculateVariantAggregateStock = (variants = {}) => {
    const entries = toObjectEntries(variants.stockMap);
    if (!entries.length) return null;
    return entries.reduce((sum, [, value]) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed >= 0 ? sum + parsed : sum;
    }, 0);
};

// GET /api/vendor/products
export const getVendorProducts = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search, stock } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Number(limit) || 20);
    const skip = (numericPage - 1) * numericLimit;
    const filter = { vendorId: req.user.id };
    if (search) filter.$text = { $search: search };
    if (stock) filter.stock = stock;

    const [products, total] = await Promise.all([
        Product.find(filter)
            .select('-faqs -relatedProducts -__v')
            .populate('categoryId', 'name')
            .populate('brandId', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Product.countDocuments(filter),
    ]);
    res.status(200).json(new ApiResponse(200, { products, total, page: numericPage, pages: Math.ceil(total / numericLimit) }, 'Products fetched.'));
});

// GET /api/vendor/products/:id
export const getVendorProductById = asyncHandler(async (req, res) => {
    const product = await Product.findOne({ _id: req.params.id, vendorId: req.user.id })
        .populate('categoryId', 'name parentId')
        .populate('brandId', 'name')
        .lean();
    if (!product) throw new ApiError(404, 'Product not found or access denied.');
    res.status(200).json(new ApiResponse(200, product, 'Product fetched.'));
});

// POST /api/vendor/products
export const createProduct = asyncHandler(async (req, res) => {
    const { name, ...rest } = req.body;
    if (!name) throw new ApiError(400, 'Product name is required.');
    const slug = slugify(name) + '-' + Date.now();
    const stockQuantity = Number(rest.stockQuantity ?? 0);
    const lowStockThreshold = Number(rest.lowStockThreshold ?? 10);
    if (!Number.isFinite(stockQuantity) || stockQuantity < 0) {
        throw new ApiError(400, 'Invalid stock quantity.');
    }
    if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
        throw new ApiError(400, 'Invalid low stock threshold.');
    }
    const price = Number(rest.price);
    if (!Number.isFinite(price) || price < 0) {
        throw new ApiError(400, 'Invalid product price.');
    }
    const normalizedVariants = normalizeVariantsPayload(rest.variants, price);
    const variantAggregateStock = calculateVariantAggregateStock(normalizedVariants);
    const finalStockQuantity = Number.isFinite(variantAggregateStock)
        ? variantAggregateStock
        : stockQuantity;
    const stock = deriveStockStatus(finalStockQuantity, lowStockThreshold);

    const channels = await getVendorChannels(req.user.id);

    const resolvedWholesale = resolveWholesalePayload({
        retailEnabled: rest.retailEnabled,
        wholesaleEnabled: rest.wholesaleEnabled,
        wholesale: rest.wholesale,
        price,
        stockQuantity: finalStockQuantity,
        vendorWholesaleEnabled: rest.wholesaleEnabled === true ? channels.wholesale : false,
        quickCommerceEnabled: rest.quickCommerceEnabled === true,
    });

    const resolvedQuickCommerce = resolveQuickCommercePayload({
        quickCommerceEnabled: rest.quickCommerceEnabled,
        quickCommerce: rest.quickCommerce,
        quickCommerceCategoryId: rest.quickCommerceCategoryId,
        vendorQuickCommerceEnabled: channels.quickCommerce,
        categoryExperience: rest.quickCommerceEnabled === true
            ? await getCategoryExperience(rest.quickCommerceCategoryId)
            : null,
    });

    // A product must sell somewhere. Checked here as well as in the pre-save
    // hook so the failure surfaces as a 400 rather than a 500.
    if (rest.retailEnabled === false && resolvedWholesale.wholesaleEnabled !== true
        && resolvedQuickCommerce.quickCommerceEnabled !== true) {
        throw new ApiError(400, 'At least one selling channel (Retail, Wholesale, or Quick Commerce) must be enabled for this product.');
    }

    // Drop raw channel payloads; the resolvers are the only validated source.
    const {
        wholesale: _rawWholesale,
        quickCommerce: _rawQuickCommerce,
        ...restWithoutChannelPayloads
    } = rest;

    const product = await Product.create({
        name,
        slug,
        vendorId: req.user.id,
        ...restWithoutChannelPayloads,
        price,
        variants: normalizedVariants,
        faqs: sanitizeFaqs(rest.faqs),
        stockQuantity: finalStockQuantity,
        lowStockThreshold,
        stock,
        ...resolvedWholesale,
        ...resolvedQuickCommerce,
    });
    res.status(201).json(new ApiResponse(201, product, 'Product created.'));
});

// PUT /api/vendor/products/:id
export const updateProduct = asyncHandler(async (req, res) => {
    const product = await Product.findOne({ _id: req.params.id, vendorId: req.user.id });
    if (!product) throw new ApiError(404, 'Product not found or access denied.');
    // Snapshot the stored wholesale config before the bulk assign, so incoming
    // tier data is only ever persisted after passing validation below.
    const storedWholesale = product.wholesale?.toObject?.() ?? product.wholesale;
    const storedQuickCommerce = product.quickCommerce?.toObject?.() ?? product.quickCommerce;
    const storedQuickCommerceCategoryId = product.quickCommerceCategoryId;
    Object.assign(product, req.body);
    if (Object.prototype.hasOwnProperty.call(req.body, 'faqs')) {
        product.faqs = sanitizeFaqs(req.body.faqs);
    }
    if (typeof req.body.stockQuantity !== 'undefined' || typeof req.body.lowStockThreshold !== 'undefined') {
        const stockQuantity = Number(product.stockQuantity ?? 0);
        const lowStockThreshold = Number(product.lowStockThreshold ?? 10);
        if (!Number.isFinite(stockQuantity) || stockQuantity < 0) {
            throw new ApiError(400, 'Invalid stock quantity.');
        }
        if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
            throw new ApiError(400, 'Invalid low stock threshold.');
        }
        product.stockQuantity = stockQuantity;
        product.lowStockThreshold = lowStockThreshold;
        product.stock = deriveStockStatus(stockQuantity, lowStockThreshold);
    }
    if (typeof req.body.price !== 'undefined') {
        const price = Number(req.body.price);
        if (!Number.isFinite(price) || price < 0) {
            throw new ApiError(400, 'Invalid product price.');
        }
        product.price = price;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'variants')) {
        product.variants = normalizeVariantsPayload(req.body.variants, product.price);
        const variantAggregateStock = calculateVariantAggregateStock(product.variants);
        if (Number.isFinite(variantAggregateStock)) {
            product.stockQuantity = variantAggregateStock;
        }
    }
    // Keep stock state deterministic from quantity + threshold.
    product.stock = deriveStockStatus(
        Number(product.stockQuantity ?? 0),
        Number(product.lowStockThreshold ?? 10)
    );

    // Only touch selling-channel data when the request explicitly references it,
    // so partial updates never clear existing wholesale configuration.
    const touchesWholesale = ['retailEnabled', 'wholesaleEnabled', 'wholesale']
        .some((key) => Object.prototype.hasOwnProperty.call(req.body, key));
    const touchesQuickCommerce = ['retailEnabled', 'quickCommerceEnabled', 'quickCommerce', 'quickCommerceCategoryId']
        .some((key) => Object.prototype.hasOwnProperty.call(req.body, key));

    const channels = (touchesWholesale || touchesQuickCommerce)
        ? await getVendorChannels(req.user.id)
        : null;

    if (touchesWholesale) {
        const resolvedWholesale = resolveWholesalePayload({
            retailEnabled: product.retailEnabled,
            wholesaleEnabled: product.wholesaleEnabled,
            wholesale: product.wholesale,
            price: product.price,
            stockQuantity: product.stockQuantity,
            vendorWholesaleEnabled: product.wholesaleEnabled === true ? channels.wholesale : false,
            quickCommerceEnabled: product.quickCommerceEnabled === true,
        });
        product.retailEnabled = resolvedWholesale.retailEnabled;
        product.wholesaleEnabled = resolvedWholesale.wholesaleEnabled;
        // When wholesale is off, keep the previously stored configuration rather
        // than persisting unvalidated tier data from the request body.
        product.wholesale = resolvedWholesale.wholesale ?? storedWholesale;
    }

    if (touchesQuickCommerce) {
        const resolvedQuickCommerce = resolveQuickCommercePayload({
            quickCommerceEnabled: product.quickCommerceEnabled,
            quickCommerce: product.quickCommerce,
            quickCommerceCategoryId: product.quickCommerceCategoryId,
            vendorQuickCommerceEnabled: channels.quickCommerce,
            categoryExperience: product.quickCommerceEnabled === true
                ? await getCategoryExperience(product.quickCommerceCategoryId)
                : null,
        });
        product.quickCommerceEnabled = resolvedQuickCommerce.quickCommerceEnabled;
        // Disabling the channel preserves stored configuration rather than
        // persisting unvalidated data from the request body.
        if (resolvedQuickCommerce.quickCommerceEnabled) {
            product.quickCommerceCategoryId = resolvedQuickCommerce.quickCommerceCategoryId;
            product.quickCommerce = resolvedQuickCommerce.quickCommerce;
        } else {
            product.quickCommerceCategoryId = storedQuickCommerceCategoryId;
            product.quickCommerce = storedQuickCommerce;
        }
    }

    if (product.retailEnabled === false && product.wholesaleEnabled !== true && product.quickCommerceEnabled !== true) {
        throw new ApiError(400, 'At least one selling channel (Retail, Wholesale, or Quick Commerce) must be enabled for this product.');
    }

    await product.save();
    res.status(200).json(new ApiResponse(200, product, 'Product updated.'));
});

// DELETE /api/vendor/products/:id
export const deleteProduct = asyncHandler(async (req, res) => {
    const product = await Product.findOneAndDelete({ _id: req.params.id, vendorId: req.user.id });
    if (!product) throw new ApiError(404, 'Product not found or access denied.');
    res.status(200).json(new ApiResponse(200, null, 'Product deleted.'));
});

// PATCH /api/vendor/stock/:productId
export const updateStock = asyncHandler(async (req, res) => {
    const { stockQuantity } = req.body;
    const product = await Product.findOne({ _id: req.params.productId, vendorId: req.user.id });
    if (!product) throw new ApiError(404, 'Product not found.');

    const numericStockQuantity = Number(stockQuantity);
    if (
        !Number.isFinite(numericStockQuantity) ||
        numericStockQuantity < 0 ||
        !Number.isInteger(numericStockQuantity)
    ) {
        throw new ApiError(400, 'Invalid stock quantity.');
    }

    product.stockQuantity = numericStockQuantity;
    product.stock = deriveStockStatus(numericStockQuantity, product.lowStockThreshold);
    await product.save();

    res.status(200).json(new ApiResponse(200, product, 'Stock updated.'));
});
