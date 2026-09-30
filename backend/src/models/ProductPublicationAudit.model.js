import mongoose from 'mongoose';
import { PRODUCT_PUBLICATION_STATUSES } from '../constants/productPublication.js';

const productPublicationAuditSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    previousStatus: { type: String, enum: PRODUCT_PUBLICATION_STATUSES, required: true },
    newStatus: { type: String, enum: PRODUCT_PUBLICATION_STATUSES, required: true },
    changedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
    changedAt: { type: Date, default: Date.now, required: true },
    source: { type: String, enum: ['ADMIN_SINGLE', 'ADMIN_BULK'], required: true },
}, { timestamps: true });

productPublicationAuditSchema.index({ productId: 1, changedAt: -1 });
productPublicationAuditSchema.index({ changedByAdminId: 1, changedAt: -1 });

export default mongoose.model('ProductPublicationAudit', productPublicationAuditSchema);

