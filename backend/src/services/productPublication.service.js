import mongoose from 'mongoose';
import Product from '../models/Product.model.js';
import ProductPublicationAudit from '../models/ProductPublicationAudit.model.js';
import {
    ADMIN_SETTABLE_PUBLICATION_STATUSES,
    PRODUCT_PUBLICATION_STATUS,
} from '../constants/productPublication.js';

export const assertAdminPublicationStatus = (status) => {
    const normalized = String(status || '').toUpperCase();
    if (!ADMIN_SETTABLE_PUBLICATION_STATUSES.includes(normalized)) {
        const error = new Error('status must be LIVE or OFFLINE.');
        error.statusCode = 400;
        throw error;
    }
    return normalized;
};

const publicationMetadata = (status, adminId, now) => status === PRODUCT_PUBLICATION_STATUS.LIVE
    ? {
        publishedAt: now,
        publishedBy: adminId,
        unpublishedAt: null,
        unpublishedBy: null,
    }
    : {
        unpublishedAt: now,
        unpublishedBy: adminId,
    };

export const changeProductPublicationStatus = async ({ product, status, adminId, source }) => {
    const normalized = assertAdminPublicationStatus(status);
    const previousStatus = product.publicationStatus || PRODUCT_PUBLICATION_STATUS.OFFLINE;
    if (previousStatus === normalized) return { product, changed: false };

    const now = new Date();
    product.set({
        publicationStatus: normalized,
        publicationStatusUpdatedAt: now,
        ...publicationMetadata(normalized, adminId, now),
    });
    await product.save();
    await ProductPublicationAudit.create({
        productId: product._id,
        vendorId: product.vendorId,
        previousStatus,
        newStatus: normalized,
        changedByAdminId: adminId,
        changedAt: now,
        source,
    });
    return { product, changed: true };
};

export const bulkChangeProductPublicationStatus = async ({ productIds, status, adminId }) => {
    const normalized = assertAdminPublicationStatus(status);
    const uniqueIds = [...new Set((productIds || []).map(String))];
    const failed = [];
    const validIds = uniqueIds.filter((productId) => {
        if (mongoose.isValidObjectId(productId)) return true;
        failed.push({ productId, reason: 'Invalid product ID' });
        return false;
    });

    const products = await Product.find({ _id: { $in: validIds }, isDeleted: { $ne: true } });
    const foundIds = new Set(products.map((product) => String(product._id)));
    validIds.forEach((productId) => {
        if (!foundIds.has(productId)) failed.push({ productId, reason: 'Product does not exist or is deleted' });
    });

    let updatedCount = 0;
    for (const product of products) {
        if (product.publicationStatus === normalized) {
            failed.push({ productId: String(product._id), reason: `Product is already ${normalized}` });
            continue;
        }
        try {
            await changeProductPublicationStatus({
                product,
                status: normalized,
                adminId,
                source: 'ADMIN_BULK',
            });
            updatedCount += 1;
        } catch (error) {
            failed.push({ productId: String(product._id), reason: error.message || 'Update failed' });
        }
    }

    return {
        success: updatedCount > 0 || failed.length === 0,
        updatedCount,
        failedCount: failed.length,
        status: normalized,
        failed,
    };
};

