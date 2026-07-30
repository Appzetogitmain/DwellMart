import Feedback from '../../../models/Feedback.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

/**
 * @desc    Get all feedback requests
 * @route   GET /api/admin/feedbacks
 * @access  Private (Admin)
 */
export const getAllFeedbacks = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, status, category, sort = 'newest' } = req.query;
    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 10;
    
    const filter = {};
    if (status && status !== 'all') {
        filter.status = status;
    }
    if (category && category !== 'all') {
        filter.category = category;
    }

    const sortMap = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        highest_rating: { rating: -1, createdAt: -1 },
        lowest_rating: { rating: 1, createdAt: -1 }
    };

    const feedbacks = await Feedback.find(filter)
        .populate('userId', 'name email')
        .sort(sortMap[sort] || sortMap.newest)
        .skip((numericPage - 1) * numericLimit)
        .limit(numericLimit)
        .lean();

    const total = await Feedback.countDocuments(filter);

    res.status(200).json(
        new ApiResponse(200, {
            feedbacks,
            pagination: {
                total,
                page: numericPage,
                limit: numericLimit,
                pages: Math.ceil(total / numericLimit)
            }
        }, 'Feedbacks fetched successfully')
    );
});

/**
 * @desc    Update feedback status
 * @route   PATCH /api/admin/feedbacks/:id/status
 * @access  Private (Admin)
 */
export const updateFeedbackStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    
    if (!['new', 'reviewed', 'resolved'].includes(status)) {
        throw new ApiError(400, 'Invalid status. Must be one of: new, reviewed, resolved.');
    }

    const feedback = await Feedback.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
    );

    if (!feedback) {
        throw new ApiError(404, 'Feedback not found');
    }

    res.status(200).json(new ApiResponse(200, feedback, 'Feedback status updated successfully'));
});
