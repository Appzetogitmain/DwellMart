import asyncHandler from '../utils/asyncHandler.js';
import { resolveCatalogScope, catalogScopeFilter, assertJobAccess } from '../utils/catalogScope.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import multer from 'multer';
import BulkImportHistory from '../models/BulkImportHistory.model.js';
import {
    generateTemplate,
    extractImagesFromZip,
    validateBulkUpload,
    startBulkUploadJob,
    getJobProgress,
    cancelJob,
    exportProductsCatalog,
} from '../services/bulkUpload.service.js';

// Multer memory storage configuration for file parsing (up to 20MB)
const storage = multer.memoryStorage();
export const uploadMiddleware = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
    fileFilter: (req, file, cb) => {
        const fieldName = file.fieldname;
        const filename = file.originalname.toLowerCase();

        if (fieldName === 'file' || fieldName === 'excelFile') {
            if (filename.endsWith('.xlsx') || filename.endsWith('.csv') || filename.endsWith('.xls')) {
                return cb(null, true);
            }
            return cb(new ApiError(400, 'Invalid file format. Only .xlsx and .csv files are supported.'));
        }

        if (fieldName === 'imagesZip' || fieldName === 'zipFile') {
            if (filename.endsWith('.zip')) {
                return cb(null, true);
            }
            return cb(new ApiError(400, 'Invalid archive format. Only .zip files are supported for images.'));
        }

        cb(null, true);
    },
}).fields([
    { name: 'file', maxCount: 1 },
    { name: 'excelFile', maxCount: 1 },
    { name: 'imagesZip', maxCount: 1 },
    { name: 'zipFile', maxCount: 1 },
]);

/**
 * GET /api/products/template/excel
 */
export const downloadExcelTemplate = asyncHandler(async (req, res) => {
    const isAdmin = req.user?.role === 'superadmin' || req.user?.role === 'subadmin';
    const workspace = req.vendorWorkspace || req.query?.workspace || 'retail';
    const buffer = await generateTemplate('xlsx', isAdmin, workspace);

    const filename = workspace === 'quick_commerce'
        ? 'DwellMart_Quick_Commerce_Bulk_Template.xlsx'
        : workspace === 'wholesale'
            ? 'DwellMart_Wholesale_Bulk_Template.xlsx'
            : 'DwellMart_Retail_Bulk_Template.xlsx';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.status(200).send(buffer);
});

/**
 * GET /api/products/template/csv
 */
export const downloadCsvTemplate = asyncHandler(async (req, res) => {
    const isAdmin = req.user?.role === 'superadmin' || req.user?.role === 'subadmin';
    const workspace = req.vendorWorkspace || req.query?.workspace || 'retail';
    const buffer = await generateTemplate('csv', isAdmin, workspace);

    const filename = workspace === 'quick_commerce'
        ? 'DwellMart_Quick_Commerce_Bulk_Template.csv'
        : workspace === 'wholesale'
            ? 'DwellMart_Wholesale_Bulk_Template.csv'
            : 'DwellMart_Retail_Bulk_Template.csv';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.status(200).send(buffer);
});

/**
 * POST /api/products/bulk-upload/validate (DRY RUN VALIDATION)
 */
export const validateUpload = asyncHandler(async (req, res) => {
    const excelFileObj = req.files?.file?.[0] || req.files?.excelFile?.[0];
    if (!excelFileObj) {
        throw new ApiError(400, 'Please upload a CSV or Excel file.');
    }

    const zipFileObj = req.files?.imagesZip?.[0] || req.files?.zipFile?.[0];
    let skuImageMap = {};
    if (zipFileObj) {
        skuImageMap = await extractImagesFromZip(zipFileObj.buffer);
    }

    const fileType = excelFileObj.originalname.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx';
    const targetVendorId = req.body?.targetVendorId || req.body?.vendorId || null;
    const autoCreateBrands = req.body?.autoCreateBrands === 'true' || req.body?.autoCreateBrands === true;
    const workspace = req.vendorWorkspace || req.body?.workspace || null;

    const validationResult = await validateBulkUpload({
        fileBuffer: excelFileObj.buffer,
        fileType,
        user: req.user,
        targetVendorId,
        autoCreateBrands,
        skuImageMap,
        workspace,
    });

    res.status(200).json(new ApiResponse(200, validationResult, 'Validation complete (Dry Run).'));
});

/**
 * POST /api/products/bulk-upload/process (EXECUTE BACKGROUND JOB)
 */
export const processUpload = asyncHandler(async (req, res) => {
    const { rows, duplicateMode, targetVendorId, autoCreateBrands, fileName, fileSize } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
        throw new ApiError(400, 'No product rows provided for import.');
    }

    const jobData = await startBulkUploadJob({
        validatedRows: rows,
        duplicateMode: duplicateMode || 'skip',
        user: req.user,
        targetVendorId: targetVendorId || null,
        autoCreateBrands: Boolean(autoCreateBrands),
        fileName: fileName || 'bulk_products_import.xlsx',
        fileSize: fileSize || 0,
        workspace: req.vendorWorkspace || req.body?.workspace || null,
    });

    res.status(202).json(new ApiResponse(202, jobData, 'Bulk upload background job started.'));
});

/**
 * GET /api/products/bulk-upload/job/:jobId
 */
export const checkJobStatus = asyncHandler(async (req, res) => {
    const { jobId } = req.params;
    const jobRecord = await BulkImportHistory.findOne({ jobId }).select('vendorId uploadedBy workspace').lean();
    assertJobAccess(req.user, jobRecord);

    // Defect 9: Validate workspace ownership — prevent cross-workspace job access.
    // A vendor should not be able to read a Retail import job while holding a
    // Wholesale workspace. Jobs without a workspace (legacy/admin imports) are
    // accessible from any workspace for backward compatibility.
    if (req.vendorWorkspace && jobRecord?.workspace && jobRecord.workspace !== req.vendorWorkspace) {
        throw new ApiError(403, `Job ${jobId} belongs to workspace '${jobRecord.workspace}', not '${req.vendorWorkspace}'.`);
    }

    const progress = await getJobProgress(jobId);
    res.status(200).json(new ApiResponse(200, progress, 'Job progress details.'));
});

/**
 * POST /api/products/bulk-upload/job/:jobId/cancel
 */
export const cancelJobHandler = asyncHandler(async (req, res) => {
    const { jobId } = req.params;
    const jobRecord = await BulkImportHistory.findOne({ jobId }).select('vendorId uploadedBy workspace').lean();
    assertJobAccess(req.user, jobRecord);

    // Defect 9: Validate workspace ownership before allowing destructive cancel.
    // A vendor must not cancel another workspace's import (e.g., Retail job
    // visible from a Wholesale workspace would be a cross-workspace mutation).
    if (req.vendorWorkspace && jobRecord?.workspace && jobRecord.workspace !== req.vendorWorkspace) {
        throw new ApiError(403, `Job ${jobId} belongs to workspace '${jobRecord.workspace}', not '${req.vendorWorkspace}'. Cannot cancel.`);
    }

    const result = await cancelJob(jobId);
    res.status(200).json(new ApiResponse(200, result, 'Job cancellation requested.'));
});

/**
 * GET /api/products/bulk-upload/history
 */
export const getImportHistory = asyncHandler(async (req, res) => {
    // Fails closed for any role that is neither vendor nor admin. Previously a
    // customer or rider fell through to an unfiltered query and received every
    // vendor's import history with populated email addresses.
    const scope = resolveCatalogScope(req.user, req.query.vendorId);
    const query = catalogScopeFilter(scope);

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const total = await BulkImportHistory.countDocuments(query);
    const history = await BulkImportHistory.find(query)
        .populate('vendorId', 'storeName name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    res.status(200).json(
        new ApiResponse(
            200,
            {
                history,
                page,
                pages: Math.ceil(total / limit),
                total,
            },
            'Import history list.'
        )
    );
});

/**
 * GET /api/products/export
 */
export const exportProducts = asyncHandler(async (req, res) => {
    const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
    const targetVendorId = req.query.vendorId || null;

    const buffer = await exportProductsCatalog({
        user: req.user,
        targetVendorId,
        format,
    });

    if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=DwellMart_Products_Export.csv');
    } else {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=DwellMart_Products_Export.xlsx');
    }

    res.status(200).send(buffer);
});
