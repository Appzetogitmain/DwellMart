import express from 'express';
import {
    uploadExampleImage,
    uploadExampleImages,
    uploadExampleDocument,
    deleteExampleFile,
} from '../controllers/storageExample.controller.js';
import {
    uploadSingleImage,
    uploadMultipleImages,
    uploadSingleDocument,
} from '../../../middlewares/vpsUpload.js';

const router = express.Router();

// Single image upload (auto-converts to WebP, 5MB limit, entityType from body or default 'products')
router.post('/image', uploadSingleImage('image', 'products'), uploadExampleImage);

// Batch images upload (up to 10 images, auto-converts to WebP)
router.post('/images', uploadMultipleImages('images', 'products', 10), uploadExampleImages);

// Document upload (PDF, Word, or Image, 10MB limit)
router.post('/document', uploadSingleDocument('document'), uploadExampleDocument);

// File deletion (by URL or relative path)
router.delete('/file', deleteExampleFile);

export default router;
