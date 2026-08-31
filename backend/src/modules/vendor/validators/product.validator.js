import Joi from 'joi';

const objectId = Joi.string().trim().hex().length(24);

const priceTierSchema = Joi.object({
    minQty: Joi.number().integer().min(1).required(),
    price: Joi.number().min(0).required(),
});

const quickCommerceSchema = Joi.object({
    packSize: Joi.string().trim().max(60).allow('', null).optional(),
    shelfLifeDays: Joi.number().integer().min(0).allow(null, '').optional(),
    isPerishable: Joi.boolean().optional(),
    maxOrderQty: Joi.number().integer().min(1).allow(null, '').optional(),
    handlingNote: Joi.string().trim().max(200).allow('', null).optional(),
}).optional();

const wholesaleSchema = Joi.object({
    moqEnabled: Joi.boolean().optional(),
    moq: Joi.number().integer().min(1).allow(null, '').optional(),
    priceTiers: Joi.array().items(priceTierSchema).optional(),
}).optional();

export const createProductSchema = Joi.object({
    name: Joi.string().trim().min(2).max(200).required(),
    description: Joi.string().allow('').optional(),
    price: Joi.number().min(0).required(),
    originalPrice: Joi.number().min(0).allow(null, '').optional(),
    unit: Joi.string().allow('', null).default('Piece'),
    categoryId: objectId.required(),
    subcategoryId: objectId.allow(null, '').optional(),
    brandId: objectId.allow(null, '').optional(),
    stockQuantity: Joi.number().integer().min(0).default(0),
    lowStockThreshold: Joi.number().integer().min(0).allow(null, '').optional().default(10),
    stock: Joi.string().valid('in_stock', 'low_stock', 'out_of_stock').optional(),
    totalAllowedQuantity: Joi.number().integer().min(0).allow(null, '').optional(),
    minimumOrderQuantity: Joi.number().integer().min(0).allow(null, '').optional(),
    warrantyPeriod: Joi.string().allow('', null).optional(),
    guaranteePeriod: Joi.string().allow('', null).optional(),
    hsnCode: Joi.string().allow('', null).optional(),
    /**
     * Parcel characteristics. Bounds are deliberate: a vendor typing 1500 for
     * 1.5 kg is a real support cost, and DTDC rejects it anyway — better to
     * catch it in the form than at the carrier.
     */
    shipping: Joi.object({
        weight:        Joi.number().min(0).max(100000).allow(null, '').optional(),
        weightUnit:    Joi.string().valid('kg', 'g').allow(null, '').optional(),
        length:        Joi.number().min(0).max(1000).allow(null, '').optional(),
        width:         Joi.number().min(0).max(1000).allow(null, '').optional(),
        height:        Joi.number().min(0).max(1000).allow(null, '').optional(),
        dimensionUnit: Joi.string().valid('cm', 'in').allow(null, '').optional(),
        source: Joi.any().forbidden(),
    }).allow(null, {}).optional(),

    taxRate: Joi.number().min(0).max(100).allow(null, '').optional().default(18),
    flashSale: Joi.boolean().default(false),
    isNewArrival: Joi.boolean().default(false),
    isFeatured: Joi.boolean().optional(),
    isVisible: Joi.boolean().optional(),
    codAllowed: Joi.boolean().optional(),
    returnable: Joi.boolean().optional(),
    cancelable: Joi.boolean().optional(),
    taxIncluded: Joi.boolean().optional(),
    image: Joi.string().allow('').optional(),
    images: Joi.array().items(Joi.string()).optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    seoTitle: Joi.string().allow('', null).optional(),
    seoDescription: Joi.string().allow('', null).optional(),
    relatedProducts: Joi.array().items(objectId).optional(),
    faqs: Joi.array().items(
        Joi.object({
            question: Joi.string().trim().allow('').optional(),
            answer: Joi.string().trim().allow('').optional(),
        })
    ).optional(),
    retailEnabled: Joi.boolean().optional(),
    wholesaleEnabled: Joi.boolean().optional(),
    wholesale: wholesaleSchema,
    quickCommerceEnabled: Joi.boolean().optional(),
    quickCommerceCategoryId: objectId.allow(null, '').optional(),
    quickCommerce: quickCommerceSchema,
    variants: Joi.object({
        sizes: Joi.array().items(Joi.string()),
        colors: Joi.array().items(Joi.string()),
        attributes: Joi.array().items(
            Joi.object({
                name: Joi.string().trim().allow('').optional(),
                values: Joi.array().items(Joi.string().trim()).optional(),
            })
        ).optional(),
        prices: Joi.object().optional(),
        stockMap: Joi.object().optional(),
        imageMap: Joi.object().optional(),
        defaultVariant: Joi.object({
            size: Joi.string().allow('').optional(),
            color: Joi.string().allow('').optional(),
        }).optional(),
        defaultSelection: Joi.object().optional(),
    }).optional(),
}).unknown(true);

export const updateProductSchema = Joi.object({
    name: Joi.string().trim().min(2).max(200).optional(),
    description: Joi.string().allow('').optional(),
    price: Joi.number().min(0).optional(),
    originalPrice: Joi.number().min(0).allow(null, '').optional(),
    unit: Joi.string().allow('', null).optional(),
    categoryId: objectId.optional(),
    subcategoryId: objectId.allow(null, '').optional(),
    brandId: objectId.allow(null, '').optional(),
    stockQuantity: Joi.number().integer().min(0).optional(),
    lowStockThreshold: Joi.number().integer().min(0).allow(null, '').optional(),
    stock: Joi.string().valid('in_stock', 'low_stock', 'out_of_stock').optional(),
    totalAllowedQuantity: Joi.number().integer().min(0).allow(null, '').optional(),
    minimumOrderQuantity: Joi.number().integer().min(0).allow(null, '').optional(),
    warrantyPeriod: Joi.string().allow('', null).optional(),
    guaranteePeriod: Joi.string().allow('', null).optional(),
    hsnCode: Joi.string().allow('', null).optional(),
    /**
     * Parcel characteristics. Bounds are deliberate: a vendor typing 1500 for
     * 1.5 kg is a real support cost, and DTDC rejects it anyway — better to
     * catch it in the form than at the carrier.
     */
    shipping: Joi.object({
        weight:        Joi.number().min(0).max(100000).allow(null, '').optional(),
        weightUnit:    Joi.string().valid('kg', 'g').allow(null, '').optional(),
        length:        Joi.number().min(0).max(1000).allow(null, '').optional(),
        width:         Joi.number().min(0).max(1000).allow(null, '').optional(),
        height:        Joi.number().min(0).max(1000).allow(null, '').optional(),
        dimensionUnit: Joi.string().valid('cm', 'in').allow(null, '').optional(),
        source: Joi.any().forbidden(),
    }).allow(null, {}).optional(),

    taxRate: Joi.number().min(0).max(100).allow(null, '').optional(),
    flashSale: Joi.boolean().optional(),
    isNewArrival: Joi.boolean().optional(),
    isFeatured: Joi.boolean().optional(),
    isVisible: Joi.boolean().optional(),
    codAllowed: Joi.boolean().optional(),
    returnable: Joi.boolean().optional(),
    cancelable: Joi.boolean().optional(),
    taxIncluded: Joi.boolean().optional(),
    image: Joi.string().allow('', null).optional(),
    images: Joi.array().items(Joi.string()).optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    seoTitle: Joi.string().allow('', null).optional(),
    seoDescription: Joi.string().allow('', null).optional(),
    relatedProducts: Joi.array().items(objectId).optional(),
    faqs: Joi.array().items(
        Joi.object({
            question: Joi.string().trim().allow('').optional(),
            answer: Joi.string().trim().allow('').optional(),
        })
    ).optional(),
    retailEnabled: Joi.boolean().optional(),
    wholesaleEnabled: Joi.boolean().optional(),
    wholesale: wholesaleSchema,
    quickCommerceEnabled: Joi.boolean().optional(),
    quickCommerceCategoryId: objectId.allow(null, '').optional(),
    quickCommerce: quickCommerceSchema,
    variants: Joi.object({
        sizes: Joi.array().items(Joi.string()),
        colors: Joi.array().items(Joi.string()),
        attributes: Joi.array().items(
            Joi.object({
                name: Joi.string().trim().allow('').optional(),
                values: Joi.array().items(Joi.string().trim()).optional(),
            })
        ).optional(),
        prices: Joi.object().optional(),
        stockMap: Joi.object().optional(),
        imageMap: Joi.object().optional(),
        defaultVariant: Joi.object({
            size: Joi.string().allow('').optional(),
            color: Joi.string().allow('').optional(),
        }).optional(),
        defaultSelection: Joi.object().optional(),
    }).optional(),
}).unknown(true);

export const productIdParamSchema = Joi.object({
    id: objectId.required(),
});
