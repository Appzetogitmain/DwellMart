import mongoose from 'mongoose';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Product from '../../../models/Product.model.js';
import Category from '../../../models/Category.model.js';
import Brand from '../../../models/Brand.model.js';
import Settings from '../../../models/Settings.model.js';
import Vendor from '../../../models/Vendor.model.js';
import { slugify } from '../../../utils/slugify.js';
import { seedCategoriesInDb } from '../../../../scripts/seedCategories.js';
import {
    resolveWholesalePayload,
    resolveQuickCommercePayload,
} from '../../../services/pricingValidation.service.js';
import { assertShippingPolicy } from '../../../services/shipping/shippingPolicy.service.js';
import {
    generateCategoryTemplateBuffer,
    processCategoryImport,
} from '../../../services/categoryImport.service.js';
import { EXPERIENCES, normalizeExperience } from '../../../constants/experiences.js';

const isVendorWholesaleEnabled = async (vendorId) => {
    if (!vendorId) return false;
    const vendor = await Vendor.findById(vendorId).select('channels.wholesale.status').lean();
    return vendor?.channels?.wholesale?.status === 'active';
};

const isVendorQuickCommerceEnabled = async (vendorId) => {
    if (!vendorId) return false;
    const vendor = await Vendor.findById(vendorId).select('channels.quickCommerce.status').lean();
    return vendor?.channels?.quickCommerce?.status === 'active';
};

/** Which experience a category belongs to, for cross-tree validation. */
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
    return normalizeExperience(category.experience);
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
        return { sizes: [], colors: [], prices: {}, stockMap: {}, imageMap: {}, defaultVariant: {} };
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
        const parsedPrice = toNonNegativeNumber(pricesSource[key]);
        if (parsedPrice !== null) {
            prices[key] = parsedPrice;
        } else {
            const fallback = toNonNegativeNumber(fallbackPrice);
            if (fallback !== null) prices[key] = fallback;
        }

        const parsedStock = toNonNegativeNumber(stockSource[key]);
        if (parsedStock !== null) stockMap[key] = parsedStock;

        const image = String(imageSource[key] || '').trim();
        if (image) imageMap[key] = image;
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



const sanitizeBrandPayload = (payload = {}) => {
    const allowed = ['name', 'logo', 'description', 'website', 'isActive'];
    const sanitized = {};
    for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
            sanitized[key] = payload[key];
        }
    }
    return sanitized;
};

// GET /api/admin/products
export const getAllProducts = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search, vendorId, categoryId, status, includeInactive = 'false' } = req.query;
    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 20;
    const skip = (numericPage - 1) * numericLimit;
    const filter = {};
    if (search) filter.$text = { $search: search };
    if (vendorId) filter.vendorId = vendorId;
    if (categoryId) filter.categoryId = categoryId;
    if (status) filter.stock = status;
    if (String(includeInactive) !== 'true') {
        filter.isActive = { $ne: false };
    }

    const [products, total] = await Promise.all([
        Product.find(filter)
            .select('-faqs -relatedProducts -__v')
            .populate('vendorId', 'storeName')
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

// GET /api/admin/products/:id
export const getProductById = asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id)
        .populate('vendorId', 'storeName')
        .populate('categoryId', 'name')
        .populate('brandId', 'name')
        .lean();

    if (!product) throw new ApiError(404, 'Product not found.');
    res.status(200).json(new ApiResponse(200, product, 'Product fetched.'));
});

// POST /api/admin/products
export const createProduct = asyncHandler(async (req, res) => {
    const { name, stockQuantity = 0, stock, ...rest } = req.body;
    const slug = slugify(name) + '-' + Date.now();
    const normalizedVariants = normalizeVariantsPayload(rest.variants, rest.price);

    const numericStockQuantity = Number(stockQuantity) || 0;
    const variantAggregateStock = calculateVariantAggregateStock(normalizedVariants);
    const finalStockQuantity = Number.isFinite(variantAggregateStock)
        ? variantAggregateStock
        : numericStockQuantity;
    const normalizedStock = stock || (finalStockQuantity <= 0
        ? 'out_of_stock'
        : finalStockQuantity <= 10
            ? 'low_stock'
            : 'in_stock');

    const resolvedWholesale = resolveWholesalePayload({
        retailEnabled: rest.retailEnabled,
        wholesaleEnabled: rest.wholesaleEnabled,
        wholesale: rest.wholesale,
        price: rest.price,
        stockQuantity: finalStockQuantity,
        vendorWholesaleEnabled: rest.wholesaleEnabled === true
            ? await isVendorWholesaleEnabled(rest.vendorId)
            : false,
        quickCommerceEnabled: rest.quickCommerceEnabled === true,
    });

    const resolvedQuickCommerce = resolveQuickCommercePayload({
        quickCommerceEnabled: rest.quickCommerceEnabled,
        quickCommerce: rest.quickCommerce,
        quickCommerceCategoryId: rest.quickCommerceCategoryId,
        vendorQuickCommerceEnabled: rest.quickCommerceEnabled === true
            ? await isVendorQuickCommerceEnabled(rest.vendorId)
            : false,
        categoryExperience: rest.quickCommerceEnabled === true
            ? await getCategoryExperience(rest.quickCommerceCategoryId)
            : null,
    });

    if (rest.retailEnabled === false && resolvedWholesale.wholesaleEnabled !== true
        && resolvedQuickCommerce.quickCommerceEnabled !== true) {
        throw new ApiError(400, 'At least one selling channel (Retail, Wholesale, or Quick Commerce) must be enabled for this product.');
    }

    if (rest.retailEnabled !== false || resolvedWholesale.wholesaleEnabled === true) {
        await assertShippingPolicy(rest, 'retail');
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
        stock: normalizedStock,
        stockQuantity: finalStockQuantity,
        ...restWithoutChannelPayloads,
        variants: normalizedVariants,
        faqs: sanitizeFaqs(rest.faqs),
        ...resolvedWholesale,
        ...resolvedQuickCommerce,
    });
    res.status(201).json(new ApiResponse(201, product, 'Product created.'));
});



// PUT /api/admin/products/:id
export const updateProduct = asyncHandler(async (req, res) => {
    const payload = { ...req.body };
    if (payload.name) {
        payload.slug = slugify(payload.name) + '-' + Date.now();
    }

    if (payload.stockQuantity !== undefined) {
        const numericStockQuantity = Number(payload.stockQuantity) || 0;
        payload.stockQuantity = numericStockQuantity;
        if (!payload.stock) {
            payload.stock = numericStockQuantity <= 0
                ? 'out_of_stock'
                : numericStockQuantity <= 10
                    ? 'low_stock'
                    : 'in_stock';
        }
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'faqs')) {
        payload.faqs = sanitizeFaqs(payload.faqs);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'variants')) {
        const fallbackPrice =
            Object.prototype.hasOwnProperty.call(payload, 'price')
                ? payload.price
                : (await Product.findById(req.params.id).select('price').lean())?.price;
        payload.variants = normalizeVariantsPayload(payload.variants, fallbackPrice);
        const variantAggregateStock = calculateVariantAggregateStock(payload.variants);
        if (Number.isFinite(variantAggregateStock)) {
            payload.stockQuantity = variantAggregateStock;
            if (!payload.stock) {
                payload.stock = variantAggregateStock <= 0
                    ? 'out_of_stock'
                    : variantAggregateStock <= 10
                        ? 'low_stock'
                        : 'in_stock';
            }
        }
    }

    // Only touch selling-channel data when the request explicitly references it,
    // so partial updates never clear existing wholesale configuration.
    // findByIdAndUpdate skips pre('save') hooks, so these rules are enforced here.
    const touchesWholesale = ['retailEnabled', 'wholesaleEnabled', 'wholesale']
        .some((key) => Object.prototype.hasOwnProperty.call(payload, key));
    if (touchesWholesale) {
        const existing = await Product.findById(req.params.id)
            .select('retailEnabled wholesaleEnabled wholesale price stockQuantity vendorId')
            .lean();
        if (!existing) throw new ApiError(404, 'Product not found.');

        const effectiveRetail = Object.prototype.hasOwnProperty.call(payload, 'retailEnabled')
            ? payload.retailEnabled
            : existing.retailEnabled;
        const effectiveWholesale = Object.prototype.hasOwnProperty.call(payload, 'wholesaleEnabled')
            ? payload.wholesaleEnabled
            : existing.wholesaleEnabled;
        const effectivePrice = Object.prototype.hasOwnProperty.call(payload, 'price')
            ? payload.price
            : existing.price;
        const effectiveStock = Object.prototype.hasOwnProperty.call(payload, 'stockQuantity')
            ? payload.stockQuantity
            : existing.stockQuantity;
        const effectiveVendorId = Object.prototype.hasOwnProperty.call(payload, 'vendorId')
            ? payload.vendorId
            : existing.vendorId;

        const resolvedWholesale = resolveWholesalePayload({
            retailEnabled: effectiveRetail,
            wholesaleEnabled: effectiveWholesale,
            wholesale: Object.prototype.hasOwnProperty.call(payload, 'wholesale')
                ? payload.wholesale
                : existing.wholesale,
            price: effectivePrice,
            stockQuantity: effectiveStock,
            vendorWholesaleEnabled: effectiveWholesale === true
                ? await isVendorWholesaleEnabled(effectiveVendorId)
                : false,
            quickCommerceEnabled: (Object.prototype.hasOwnProperty.call(payload, 'quickCommerceEnabled')
                ? payload.quickCommerceEnabled
                : existing.quickCommerceEnabled) === true,
        });

        payload.retailEnabled = resolvedWholesale.retailEnabled;
        payload.wholesaleEnabled = resolvedWholesale.wholesaleEnabled;
        if (resolvedWholesale.wholesale) {
            payload.wholesale = resolvedWholesale.wholesale;
        } else {
            delete payload.wholesale;
        }
    }

    const touchesQuickCommerce = ['retailEnabled', 'quickCommerceEnabled', 'quickCommerce', 'quickCommerceCategoryId']
        .some((key) => Object.prototype.hasOwnProperty.call(payload, key));
    if (touchesQuickCommerce) {
        const existing = await Product.findById(req.params.id)
            .select('retailEnabled wholesaleEnabled quickCommerceEnabled quickCommerce quickCommerceCategoryId vendorId')
            .lean();
        if (!existing) throw new ApiError(404, 'Product not found.');

        const pick = (key) => (Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] : existing[key]);
        const effectiveQuickCommerce = pick('quickCommerceEnabled');
        const effectiveCategoryId = pick('quickCommerceCategoryId');
        const effectiveVendorId = pick('vendorId');

        const resolvedQuickCommerce = resolveQuickCommercePayload({
            quickCommerceEnabled: effectiveQuickCommerce,
            quickCommerce: pick('quickCommerce'),
            quickCommerceCategoryId: effectiveCategoryId,
            vendorQuickCommerceEnabled: effectiveQuickCommerce === true
                ? await isVendorQuickCommerceEnabled(effectiveVendorId)
                : false,
            categoryExperience: effectiveQuickCommerce === true
                ? await getCategoryExperience(effectiveCategoryId)
                : null,
        });

        payload.quickCommerceEnabled = resolvedQuickCommerce.quickCommerceEnabled;
        if (resolvedQuickCommerce.quickCommerceEnabled) {
            payload.quickCommerceCategoryId = resolvedQuickCommerce.quickCommerceCategoryId;
            payload.quickCommerce = resolvedQuickCommerce.quickCommerce;
        } else {
            // Preserve stored configuration rather than writing unvalidated data.
            delete payload.quickCommerce;
            delete payload.quickCommerceCategoryId;
        }

        const effectiveRetail = pick('retailEnabled');
        const effectiveWholesale = Object.prototype.hasOwnProperty.call(payload, 'wholesaleEnabled')
            ? payload.wholesaleEnabled
            : existing.wholesaleEnabled;
        if (effectiveRetail === false && effectiveWholesale !== true
            && resolvedQuickCommerce.quickCommerceEnabled !== true) {
            throw new ApiError(400, 'At least one selling channel (Retail, Wholesale, or Quick Commerce) must be enabled for this product.');
        }
    }

    if (payload.shipping) {
        const existing = await Product.findById(req.params.id).select('retailEnabled wholesaleEnabled').lean();
        const isRetailOrWholesale = (payload.retailEnabled !== false && existing?.retailEnabled !== false) ||
                                   payload.wholesaleEnabled === true || existing?.wholesaleEnabled === true;
        if (isRetailOrWholesale) {
            await assertShippingPolicy(payload, 'retail');
        }
    }

    const product = await Product.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!product) throw new ApiError(404, 'Product not found.');
    res.status(200).json(new ApiResponse(200, product, 'Product updated.'));
});

// DELETE /api/admin/products/:id
export const deleteProduct = asyncHandler(async (req, res) => {
    const product = await Product.findByIdAndUpdate(
        req.params.id,
        { isActive: false },
        { new: true, runValidators: true }
    );
    if (!product) throw new ApiError(404, 'Product not found.');
    res.status(200).json(new ApiResponse(200, null, 'Product disabled.'));
});

// GET /api/admin/products/tax-pricing-rules
export const getTaxPricingRules = asyncHandler(async (req, res) => {
    const settings = await Settings.findOne({ key: 'product_tax_pricing_rules' }).lean();
    const value = settings?.value || {};
    const taxRules = Array.isArray(value.taxRules) ? value.taxRules : [];
    const pricingRules = Array.isArray(value.pricingRules) ? value.pricingRules : [];

    res.status(200).json(
        new ApiResponse(200, { taxRules, pricingRules }, 'Tax and pricing rules fetched.')
    );
});

// PUT /api/admin/products/tax-pricing-rules
export const updateTaxPricingRules = asyncHandler(async (req, res) => {
    const { taxRules = [], pricingRules = [] } = req.body;

    await Settings.findOneAndUpdate(
        { key: 'product_tax_pricing_rules' },
        { key: 'product_tax_pricing_rules', value: { taxRules, pricingRules } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json(
        new ApiResponse(200, { taxRules, pricingRules }, 'Tax and pricing rules updated.')
    );
});

const sanitizeCategoryPayload = (payload = {}) => {
    const allowed = ['name', 'description', 'image', 'icon', 'parentId', 'order', 'displayOrder', 'isActive', 'experience', 'supportedExperiences'];
    const sanitized = {};
    for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
            sanitized[key] = payload[key];
        }
    }
    if (Object.prototype.hasOwnProperty.call(sanitized, 'parentId')) {
        sanitized.parentId = sanitized.parentId || null;
    }

    // Convert legacy single experience to supportedExperiences array if provided, filtering out non-strings/nulls
    if (Array.isArray(sanitized.supportedExperiences)) {
        const cleaned = sanitized.supportedExperiences
            .filter((e) => typeof e === 'string' && e.trim().length > 0)
            .map(normalizeExperience);
        sanitized.supportedExperiences = cleaned.length > 0
            ? [...new Set(cleaned)]
            : [normalizeExperience(sanitized.experience || EXPERIENCES.MARKETPLACE)];
    } else if (sanitized.experience) {
        sanitized.supportedExperiences = [normalizeExperience(sanitized.experience)];
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, 'displayOrder')) {
        sanitized.displayOrder = Number(sanitized.displayOrder) || 0;
    }

    return sanitized;
};

const assertValidCategoryParent = async ({ categoryId = null, parentId, supportedExperiences = [] }) => {
    if (!parentId) return;

    if (categoryId && String(categoryId) === String(parentId)) {
        throw new ApiError(400, 'Category cannot be parent of itself.');
    }

    const parent = await Category.findById(parentId).select('_id parentId supportedExperiences');
    if (!parent) {
        throw new ApiError(400, 'Selected parent category does not exist.');
    }
};

// GET /api/admin/categories
export const getAllCategories = asyncHandler(async (req, res) => {
    const requestedExp = req.query?.experience ? normalizeExperience(req.query.experience) : null;
    const filter = {};
    if (requestedExp) {
        filter.supportedExperiences = requestedExp;
    }
    const categories = await Category.find(filter).sort({ displayOrder: 1, order: 1, name: 1 });
    res.status(200).json(new ApiResponse(200, categories, 'Categories fetched.'));
});

// POST /api/admin/categories
export const createCategory = asyncHandler(async (req, res) => {
    const payload = sanitizeCategoryPayload(req.body);
    const { name, ...rest } = payload;

    const slug = slugify(name);
    const existingSlug = await Category.findOne({ slug });
    if (existingSlug) {
        throw new ApiError(400, `Category slug '${slug}' already exists.`);
    }

    const supportedExperiences = rest.supportedExperiences || [normalizeExperience(req.experience || EXPERIENCES.MARKETPLACE)];
    await assertValidCategoryParent({ parentId: rest.parentId, supportedExperiences });

    const category = await Category.create({ name, slug, supportedExperiences, ...rest });
    res.status(201).json(new ApiResponse(201, category, 'Category created.'));
});

// PUT /api/admin/categories/:id
export const updateCategory = asyncHandler(async (req, res) => {
    const existingCategory = await Category.findById(req.params.id);
    if (!existingCategory) throw new ApiError(404, 'Category not found.');

    const payload = sanitizeCategoryPayload(req.body);

    if (payload.name) {
        const slug = slugify(payload.name);
        const duplicateSlug = await Category.findOne({ slug, _id: { $ne: req.params.id } });
        if (duplicateSlug) {
            throw new ApiError(400, `Category slug '${slug}' already exists.`);
        }
        payload.slug = slug;
    }

    const supportedExperiences = payload.supportedExperiences || existingCategory.supportedExperiences;
    await assertValidCategoryParent({
        categoryId: existingCategory._id,
        parentId: payload.parentId,
        supportedExperiences,
    });

    const category = await Category.findByIdAndUpdate(req.params.id, payload, {
        new: true,
        runValidators: true,
    });
    if (!category) throw new ApiError(404, 'Category not found.');
    res.status(200).json(new ApiResponse(200, category, 'Category updated.'));
});

// DELETE /api/admin/categories/:id
export const deleteCategory = asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id).select('_id');
    if (!category) {
        throw new ApiError(404, 'Category not found.');
    }

    // A category may be referenced from either experience's category field.
    const [subcategoriesCount, productsCount] = await Promise.all([
        Category.countDocuments({ parentId: req.params.id }),
        Product.countDocuments({
            $or: [
                { categoryId: req.params.id },
                { quickCommerceCategoryId: req.params.id },
            ],
        }),
    ]);

    if (subcategoriesCount > 0) {
        throw new ApiError(409, 'Cannot delete category with existing subcategories.');
    }
    if (productsCount > 0) {
        throw new ApiError(409, 'Cannot delete category with existing products.');
    }

    await Category.findByIdAndDelete(req.params.id);
    res.status(200).json(new ApiResponse(200, null, 'Category deleted.'));
});

// PATCH /api/admin/categories/reorder
export const reorderCategories = asyncHandler(async (req, res) => {
    const uniqueIds = Array.from(new Set(req.body.categoryIds.map((id) => String(id))));

    const rootCategories = await Category.find({
        _id: { $in: uniqueIds },
        parentId: null,
    }).select('_id supportedExperiences');

    if (rootCategories.length !== uniqueIds.length) {
        throw new ApiError(400, 'Only root categories can be reordered.');
    }

    const bulkUpdates = uniqueIds.map((id, index) => ({
        updateOne: {
            filter: { _id: id },
            update: { $set: { displayOrder: index + 1, order: index + 1 } },
        },
    }));

    if (bulkUpdates.length > 0) {
        await Category.bulkWrite(bulkUpdates);
    }

// GET /api/admin/categories/bulk/template
export const downloadCategoryTemplate = asyncHandler(async (req, res) => {
    const buffer = generateCategoryTemplateBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="category_import_template.xlsx"');
    res.status(200).send(buffer);
});

// POST /api/admin/categories/bulk/import
export const importCategories = asyncHandler(async (req, res) => {
    if (!req.file || !req.file.buffer) {
        throw new ApiError(400, 'Please upload a valid Excel (.xlsx) or CSV file.');
    }

    const defaultExperience = req.body?.experience || EXPERIENCES.MARKETPLACE;
    const result = await processCategoryImport({
        buffer: req.file.buffer,
        defaultExperience
    });

    res.status(200).json(
        new ApiResponse(200, result, `Category import complete: ${result.createdCount} created, ${result.updatedCount} updated.`)
    );
});

// POST /api/admin/categories/seed
export const seedMarketplaceCategories = asyncHandler(async (req, res) => {
    const stats = await seedCategoriesInDb();
    // Seeded categories are Marketplace-only; return that tree explicitly so the
    // response cannot surface Quick Commerce categories.
    const categories = await Category.find({ supportedExperiences: EXPERIENCES.MARKETPLACE })
        .sort({ order: 1, name: 1 });
    res.status(200).json(new ApiResponse(200, { stats, categories }, 'Marketplace categories seeded successfully.'));
});

// GET /api/admin/brands
export const getAllBrands = asyncHandler(async (req, res) => {
    const brands = await Brand.find().sort({ name: 1 });
    res.status(200).json(new ApiResponse(200, brands, 'Brands fetched.'));
});

// POST /api/admin/brands
export const createBrand = asyncHandler(async (req, res) => {
    const payload = sanitizeBrandPayload(req.body);
    const { name, ...rest } = payload;
    const slug = slugify(name);
    const brand = await Brand.create({ name, slug, ...rest });
    res.status(201).json(new ApiResponse(201, brand, 'Brand created.'));
});

// PUT /api/admin/brands/:id
export const updateBrand = asyncHandler(async (req, res) => {
    const payload = sanitizeBrandPayload(req.body);
    if (payload.name) {
        payload.slug = slugify(payload.name);
    }

    const brand = await Brand.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!brand) throw new ApiError(404, 'Brand not found.');
    res.status(200).json(new ApiResponse(200, brand, 'Brand updated.'));
});

// DELETE /api/admin/brands/:id
export const deleteBrand = asyncHandler(async (req, res) => {
    const brand = await Brand.findById(req.params.id).select('_id');
    if (!brand) throw new ApiError(404, 'Brand not found.');

    const linkedProductsCount = await Product.countDocuments({ brandId: req.params.id });
    if (linkedProductsCount > 0) {
        throw new ApiError(409, 'Cannot delete brand with existing products.');
    }

    await Brand.findByIdAndDelete(req.params.id);
    res.status(200).json(new ApiResponse(200, null, 'Brand deleted.'));
});

/**
 * GET /products/missing-shipping
 *
 * Courier-eligible products whose parcel data is an ESTIMATE rather than a
 * measurement — either never entered, or seeded by migration 0014.
 *
 * Drives the catalogue banner that tells an operator how much of the catalogue
 * is booking at a guess. Quick Commerce-only products are excluded: they never
 * reach a courier, so an estimate on them costs nothing.
 */
export const listProductsMissingShipping = asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100));
    const { vendorId, channel } = req.query;

    const filter = {
        isDeleted: { $ne: true },
        // Estimated OR absent. Both mean "nobody has measured this".
        $and: [
            {
                $or: [
                    { 'shipping.source': 'estimated' },
                    { 'shipping.weight': { $exists: false } },
                    { 'shipping.weight': { $lte: 0 } },
                ],
            },
            { $or: [{ retailEnabled: { $ne: false } }, { wholesaleEnabled: true }] },
        ],
    };

    if (vendorId) {
        if (!mongoose.Types.ObjectId.isValid(vendorId)) throw new ApiError(400, 'Invalid vendorId.');
        filter.vendorId = vendorId;
    }
    if (channel === 'wholesale') filter.wholesaleEnabled = true;
    else if (channel === 'retail') filter.retailEnabled = { $ne: false };
    else if (channel) throw new ApiError(400, 'Channel must be retail or wholesale.');

    const [products, total, totalCourierEligible] = await Promise.all([
        Product.find(filter)
            .select('name sku shipping retailEnabled wholesaleEnabled vendorId createdAt')
            .populate('vendorId', 'storeName')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        Product.countDocuments(filter),
        Product.countDocuments({
            isDeleted: { $ne: true },
            $or: [{ retailEnabled: { $ne: false } }, { wholesaleEnabled: true }],
        }),
    ]);

    res.status(200).json(new ApiResponse(200, {
        products: products.map((p) => ({
            _id: p._id,
            name: p.name,
            sku: p.sku || null,
            vendorId: p.vendorId?._id || p.vendorId || null,
            vendorName: p.vendorId?.storeName || null,
            channels: [
                p.retailEnabled !== false ? 'retail' : null,
                p.wholesaleEnabled === true ? 'wholesale' : null,
            ].filter(Boolean),
            shippingSource: p.shipping?.source || null,
            estimatedWeight: p.shipping?.weight ?? null,
        })),
        total,
        totalCourierEligible,
        page,
        pages: Math.ceil(total / limit) || 1,
    }, 'Products missing shipping details'));
});
