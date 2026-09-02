import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import {
    getTrustAssuranceData,
    updateTrustAssuranceData,
} from '../../../services/trustAssurance.service.js';

/**
 * GET /api/admin/trust-assurance
 * Fetch current Trust & Assurance settings for Admin configuration
 */
export const getAdminTrustAssurance = asyncHandler(async (req, res) => {
    const data = await getTrustAssuranceData();
    res.status(200).json(
        new ApiResponse(200, data, 'Trust & Assurance configuration fetched successfully.')
    );
});

/**
 * PUT /api/admin/trust-assurance
 * Update Trust & Assurance cards and settings
 */
export const updateAdminTrustAssurance = asyncHandler(async (req, res) => {
    const updated = await updateTrustAssuranceData(req.body);
    res.status(200).json(
        new ApiResponse(200, updated, 'Trust & Assurance configuration updated successfully.')
    );
});
