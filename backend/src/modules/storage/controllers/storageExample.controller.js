import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import {
    deleteStoredImage,
    deleteStoredDocument,
} from '../../../utils/fileStorage.js';

/**
 * @desc    Upload a single image (WebP converted, compressed, UUID named)
 * @route   POST /api/storage-example/image
 * @access  Public / Protected
 */
export const uploadExampleImage = asyncHandler(async (req, res) => {
    if (!req.processedFile) {
        throw new ApiError(400, 'Image file is required and must be JPG, PNG, or WEBP under 5MB.');
    }

    return res.status(201).json(
        new ApiResponse(
            201,
            {
                url: req.processedFile.url,
                relativePath: req.processedFile.relativePath,
                fileName: req.processedFile.fileName,
                format: req.processedFile.format,
                width: req.processedFile.width,
                height: req.processedFile.height,
                size: req.processedFile.size,
            },
            'Image processed and stored successfully as WebP on VPS storage.'
        )
    );
});

/**
 * @desc    Upload multiple images in batch
 * @route   POST /api/storage-example/images
 * @access  Public / Protected
 */
export const uploadExampleImages = asyncHandler(async (req, res) => {
    const files = req.processedFiles || [];
    if (files.length === 0) {
        throw new ApiError(400, 'At least one image file is required.');
    }

    return res.status(201).json(
        new ApiResponse(
            201,
            {
                count: files.length,
                images: files.map((f) => ({
                    url: f.url,
                    relativePath: f.relativePath,
                    fileName: f.fileName,
                    size: f.size,
                    format: f.format,
                })),
            },
            `${files.length} images processed and stored successfully on VPS.`
        )
    );
});

/**
 * @desc    Upload a document (PDF, Word, or scanned image)
 * @route   POST /api/storage-example/document
 * @access  Public / Protected
 */
export const uploadExampleDocument = asyncHandler(async (req, res) => {
    if (!req.processedDocument) {
        throw new ApiError(400, 'Document file is required (PDF, DOC, DOCX, or Image under 10MB).');
    }

    return res.status(201).json(
        new ApiResponse(
            201,
            {
                url: req.processedDocument.url,
                relativePath: req.processedDocument.relativePath,
                fileName: req.processedDocument.fileName,
                format: req.processedDocument.format,
                size: req.processedDocument.size,
                isImage: req.processedDocument.isImage,
            },
            'Document uploaded and securely stored on VPS.'
        )
    );
});

/**
 * @desc    Delete a stored image or document
 * @route   DELETE /api/storage-example/file
 * @access  Public / Protected
 */
export const deleteExampleFile = asyncHandler(async (req, res) => {
    const fileUrl = req.body?.url || req.query?.url;
    if (!fileUrl) {
        throw new ApiError(400, 'File URL or relative path is required.');
    }

    const result = await deleteStoredImage(fileUrl);
    if (!result.deleted) {
        return res.status(404).json(
            new ApiResponse(404, result, result.reason || 'File not found on storage disk.')
        );
    }

    return res.status(200).json(
        new ApiResponse(200, result, 'File successfully deleted from VPS storage.')
    );
});

export default {
    uploadExampleImage,
    uploadExampleImages,
    uploadExampleDocument,
    deleteExampleFile,
};
