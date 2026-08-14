import mongoose from 'mongoose';

const bulkImportHistorySchema = new mongoose.Schema(
    {
        jobId: { type: String, required: true, unique: true, index: true },
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
        uploadedBy: {
            id: { type: mongoose.Schema.Types.ObjectId },
            name: { type: String },
            email: { type: String },
            role: { type: String, enum: ['superadmin', 'subadmin', 'vendor'] },
        },
        // Channel workspace this import was initiated under. Null = legacy/admin import
        // without workspace context (pre-migration jobs remain readable from any workspace).
        workspace: { type: String, enum: ['retail', 'wholesale', 'quick_commerce', null], default: null, index: true },
        fileName: { type: String, required: true },
        fileType: { type: String, enum: ['xlsx', 'csv'], default: 'xlsx' },
        fileSize: { type: Number, default: 0 },
        duplicateMode: { type: String, enum: ['skip', 'update', 'create'], default: 'skip' },
        status: {
            type: String,
            enum: ['pending', 'validating', 'processing', 'completed', 'failed', 'cancelled'],
            default: 'pending',
            index: true,
        },
        totalRows: { type: Number, default: 0 },
        importedCount: { type: Number, default: 0 },
        updatedCount: { type: Number, default: 0 },
        skippedCount: { type: Number, default: 0 },
        failedCount: { type: Number, default: 0 },
        progressPercent: { type: Number, default: 0 },
        durationMs: { type: Number, default: 0 },
        errors: [
            {
                row: { type: Number },
                sku: { type: String },
                productName: { type: String },
                reason: { type: String },
            },
        ],
        errorFileUrl: { type: String },
        validFileUrl: { type: String },
    },
    { timestamps: true }
);

bulkImportHistorySchema.index({ vendorId: 1, createdAt: -1 });
bulkImportHistorySchema.index({ 'uploadedBy.role': 1, createdAt: -1 });

const BulkImportHistory = mongoose.model('BulkImportHistory', bulkImportHistorySchema);
export default BulkImportHistory;
