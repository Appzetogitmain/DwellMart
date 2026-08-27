import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import {
    getSellOnDwellmartStats,
    updateSellOnDwellmartStats,
} from '../../../services/sellOnDwellmartStats.service.js';

/**
 * GET /api/admin/sell-on-dwellmart/stats
 * Admin fetch current statistics
 */
export const getStats = asyncHandler(async (req, res) => {
    const stats = await getSellOnDwellmartStats();
    return res.status(200).json(
        new ApiResponse(200, stats, 'Sell On Dwell Mart statistics fetched successfully.')
    );
});

/**
 * PUT /api/admin/sell-on-dwellmart/stats
 * Admin update statistics
 */
export const updateStats = asyncHandler(async (req, res) => {
    const updated = await updateSellOnDwellmartStats(req.body);
    return res.status(200).json(
        new ApiResponse(200, updated, 'Sell On Dwell Mart statistics updated successfully.')
    );
});
