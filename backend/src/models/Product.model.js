import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, index: true },
        slug: { type: String, required: true, unique: true },
        description: { type: String },
        price: { type: Number, required: true, min: 0 },
        originalPrice: { type: Number },
        unit: { type: String, default: 'Piece' },
        images: [{ type: String }],
        image: { type: String }, // primary image
        categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
        brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', index: true },
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
        stock: {
            type: String,
            enum: ['in_stock', 'low_stock', 'out_of_stock'],
            default: 'in_stock',
            index: true,
        },
        stockQuantity: { type: Number, default: 0, min: 0 },
        // Stock held in active checkout sessions (not yet committed or released).
        // Available stock = stockQuantity - reservedQuantity
        reservedQuantity: { type: Number, default: 0, min: 0 },
        totalAllowedQuantity: { type: Number, min: 0 },
        minimumOrderQuantity: { type: Number, min: 1, default: 1 },
        lowStockThreshold: { type: Number, default: 10 },
        variants: {
            sizes: [String],
            colors: [String],
            materials: [String],
            attributes: [{
                name: String,
                values: [String],
            }],
            prices: { type: Map, of: Number },
            stockMap: { type: Map, of: Number },
            imageMap: { type: Map, of: String },
            defaultVariant: {
                size: String,
                color: String,
            },
            defaultSelection: {
                type: Map,
                of: String,
            },
        },
        retailEnabled: { type: Boolean, default: true },
        wholesaleEnabled: { type: Boolean, default: false },
        wholesale: {
            moqEnabled: { type: Boolean, default: false },
            moq: { type: Number, min: 1 },
            priceTiers: {
                type: [
                    {
                        _id: false,
                        minQty: { type: Number, required: true, min: 1 },
                        price: { type: Number, required: true, min: 0 },
                    },
                ],
                default: [],
            },
        },
        // Quick Commerce is a separate experience with its own category tree, so
        // a dual-experience product carries a second category reference.
        quickCommerceEnabled: { type: Boolean, default: false },
        quickCommerceCategoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
            default: null,
        },
        quickCommerce: {
            packSize: { type: String, trim: true },
            shelfLifeDays: { type: Number, min: 0 },
            isPerishable: { type: Boolean, default: false },
            // Per-order cap; bounds how much a single order can drain a
            // QC-critical SKU from the shared stock pool.
            maxOrderQty: { type: Number, min: 1 },
            handlingNote: { type: String, trim: true },
        },
        flashSale: { type: Boolean, default: false, index: true },
        isNewArrival: { type: Boolean, default: false, index: true },
        isFeatured: { type: Boolean, default: false, index: true },
        isActive: { type: Boolean, default: true, index: true },
        isVisible: { type: Boolean, default: true },
        codAllowed: { type: Boolean, default: true },
        returnable: { type: Boolean, default: true },
        cancelable: { type: Boolean, default: true },
        taxIncluded: { type: Boolean, default: false },
        warrantyPeriod: { type: String },
        guaranteePeriod: { type: String },
        hsnCode: { type: String },
        rating: { type: Number, default: 0, min: 0, max: 5 },
        reviewCount: { type: Number, default: 0 },
        taxRate: { type: Number, default: 18 },
        seoTitle: { type: String },
        seoDescription: { type: String },
        relatedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
        faqs: [{ question: String, answer: String }],
        tags: [String],
    },
    { timestamps: true }
);

productSchema.index({ vendorId: 1, isActive: 1 });
productSchema.index({ categoryId: 1, isActive: 1 });
productSchema.index({ isActive: 1, createdAt: -1 });
productSchema.index({ isActive: 1, price: 1 });
productSchema.index({ isActive: 1, reviewCount: -1, rating: -1 });
productSchema.index({ isActive: 1, flashSale: 1, createdAt: -1 });
productSchema.index({ isActive: 1, isNewArrival: 1, createdAt: -1 });
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ vendorId: 1, wholesaleEnabled: 1 });
productSchema.index({ isActive: 1, wholesaleEnabled: 1 });
productSchema.index({ wholesaleEnabled: 1, isActive: 1, isDeleted: 1 });
productSchema.index({ isActive: 1, quickCommerceEnabled: 1 });
productSchema.index({ vendorId: 1, quickCommerceEnabled: 1 });
productSchema.index({ quickCommerceCategoryId: 1, isActive: 1 });

/**
 * Product channel flags (quickCommerceEnabled, retailEnabled, wholesaleEnabled)
 * are auto-synchronized at save time by the product controller based on
 * vendor.vendorType via VendorCapabilities.
 * Vendors never control these directly from the UI.
 */

const Product = mongoose.model('Product', productSchema);
export { Product };
export default Product;
