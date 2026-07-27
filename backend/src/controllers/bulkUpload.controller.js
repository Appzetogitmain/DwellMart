import asyncHandler from '../utils/asyncHandler.js';
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
    const buffer = await generateTemplate('xlsx', isAdmin);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=DwellMart_Bulk_Product_Template.xlsx');
    res.status(200).send(buffer);
});

/**
 * GET /api/products/template/csv
 */
export const downloadCsvTemplate = asyncHandler(async (req, res) => {
    const isAdmin = req.user?.role === 'superadmin' || req.user?.role === 'subadmin';
    const buffer = await generateTemplate('csv', isAdmin);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=DwellMart_Bulk_Product_Template.csv');
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

    const validationResult = await validateBulkUpload({
        fileBuffer: excelFileObj.buffer,
        fileType,
        user: req.user,
        targetVendorId,
        autoCreateBrands,
        skuImageMap,
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
    });

    res.status(202).json(new ApiResponse(202, jobData, 'Bulk upload background job started.'));
});

/**
 * GET /api/products/bulk-upload/job/:jobId
 */
export const checkJobStatus = asyncHandler(async (req, res) => {
    const { jobId } = req.params;
    const progress = await getJobProgress(jobId);
    res.status(200).json(new ApiResponse(200, progress, 'Job progress details.'));
});

/**
 * POST /api/products/bulk-upload/job/:jobId/cancel
 */
export const cancelJobHandler = asyncHandler(async (req, res) => {
    const { jobId } = req.params;
    const result = await cancelJob(jobId);
    res.status(200).json(new ApiResponse(200, result, 'Job cancellation requested.'));
});

/**
 * GET /api/products/bulk-upload/history
 */
export const getImportHistory = asyncHandler(async (req, res) => {
    const query = {};
    if (req.user.role === 'vendor') {
        query.vendorId = req.user.id;
    } else if (req.query.vendorId) {
        query.vendorId = req.query.vendorId;
    }

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
