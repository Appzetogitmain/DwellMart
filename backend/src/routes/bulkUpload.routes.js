import express from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import {
    downloadExcelTemplate,
    downloadCsvTemplate,
    uploadMiddleware,
    validateUpload,
    processUpload,
    checkJobStatus,
    cancelJobHandler,
    getImportHistory,
    exportProducts,
} from '../controllers/bulkUpload.controller.js';

const router = express.Router();

// Download templates (authenticated)
router.get('/template/excel', authenticate, downloadExcelTemplate);
router.get('/template/csv', authenticate, downloadCsvTemplate);

// Validate (Dry-run preview)
router.post('/bulk-upload/validate', authenticate, uploadMiddleware, validateUpload);

// Execute background job
router.post('/bulk-upload/process', authenticate, processUpload);

// Job progress & cancellation
router.get('/bulk-upload/job/:jobId', authenticate, checkJobStatus);
router.post('/bulk-upload/job/:jobId/cancel', authenticate, cancelJobHandler);

// History & Export
router.get('/bulk-upload/history', authenticate, getImportHistory);
router.get('/export', authenticate, exportProducts);

export default router;
