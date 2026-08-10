import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import {
    uploadLocalFileToCloudinaryAndCleanup,
    deleteFromCloudinary,
    cleanupLocalFiles,
} from '../../../services/upload.service.js';

// POST /api/vendor/uploads/image
export const uploadImage = asyncHandler(async (req, res) => {
    if (!req.file?.path) {
        throw new ApiError(400, 'Image file is required');
    }

    const folder = (req.body?.folder || 'vendors/products').toString().trim() || 'vendors/products';
    const publicId = req.body?.publicId ? String(req.body.publicId).trim() : undefined;

    try {
        const uploaded = await uploadLocalFileToCloudinaryAndCleanup(req.file.path, folder, publicId);
        return res
            .status(201)
            .json(new ApiResponse(201, uploaded, 'Image uploaded successfully'));
    } catch (error) {
        await cleanupLocalFiles([req.file.path]);
        throw error;
    }
});

// POST /api/vendor/uploads/images
export const uploadImages = asyncHandler(async (req, res) => {
    const files = req.files || [];
    if (!Array.isArray(files) || files.length === 0) {
        throw new ApiError(400, 'At least one image file is required');
    }

    const folder = (req.body?.folder || 'vendors/products').toString().trim() || 'vendors/products';
    const settledUploads = await Promise.allSettled(
        files.map((file) => uploadLocalFileToCloudinaryAndCleanup(file.path, folder))
    );

    const successfulUploads = settledUploads
        .filter((item) => item.status === 'fulfilled')
        .map((item) => item.value);
    const failedCount = settledUploads.filter((item) => item.status === 'rejected').length;

    // Best-effort cleanup for any temp files that may still exist after failures.
    const failedFiles = files.filter((_, i) => settledUploads[i]?.status === 'rejected');
    if (failedFiles.length > 0) {
        await cleanupLocalFiles(failedFiles.map((file) => file?.path));
    }

    if (successfulUploads.length === 0) {
        throw new ApiError(500, 'Failed to upload images. Please try again.');
    }

    // Partial success — return what was uploaded, warn about failures
    const message = failedCount > 0
        ? `${successfulUploads.length} image(s) uploaded. ${failedCount} failed.`
        : 'Images uploaded successfully';

    return res
        .status(201)
        .json(new ApiResponse(201, successfulUploads, message));
});

