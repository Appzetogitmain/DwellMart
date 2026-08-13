import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Review from '../../../models/Review.model.js';
import ReviewHelpfulVote from '../../../models/ReviewHelpfulVote.model.js';
import Product from '../../../models/Product.model.js';
import Order from '../../../models/Order.model.js';

// GET /api/user/reviews/product/:productId
export const getProductReviews = asyncHandler(async (req, res) => {
    const { sort = 'newest', page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const sortMap = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        'highest-rating': { rating: -1 },
        'lowest-rating': { rating: 1 },
        'most-helpful': { helpfulCount: -1 },
    };

    const reviews = await Review.find({ productId: req.params.productId, isApproved: true })
        .populate('userId', 'name avatar')
        .sort(sortMap[sort] || { createdAt: -1 })
        .skip(skip)
        .limit(Number(limit));

    const total = await Review.countDocuments({ productId: req.params.productId, isApproved: true });
    res.status(200).json(new ApiResponse(200, { reviews, total, page: Number(page), pages: Math.ceil(total / limit) }, 'Reviews fetched.'));
});

// POST /api/user/reviews
export const addReview = asyncHandler(async (req, res) => {
    const { productId, orderId, rating, comment, images } = req.body;

    // Verify purchase
    const order = await Order.findOne({ _id: orderId, userId: req.user.id, 'items.productId': productId, status: 'delivered' });
    if (!order) throw new ApiError(403, 'You can only review products you have purchased and received.');

    const existing = await Review.findOne({ productId, userId: req.user.id });
    if (existing) throw new ApiError(409, 'You have already reviewed this product.');

    const review = await Review.create({ productId, userId: req.user.id, orderId, rating, comment, images, isVerifiedPurchase: true });
    res.status(201).json(new ApiResponse(201, review, 'Review submitted and pending approval.'));
});

// POST /api/user/reviews/:id/helpful
export const voteHelpful = asyncHandler(async (req, res) => {
    const reviewId = req.params.id;
    const userId = req.user.id;

    const review = await Review.findById(reviewId).select('_id');
    if (!review) throw new ApiError(404, 'Review not found.');

    // The unique (reviewId, userId) index makes this idempotent: a repeated
    // vote is absorbed rather than incrementing the counter again.
    try {
        await ReviewHelpfulVote.create({ reviewId, userId });
    } catch (err) {
        if (err?.code === 11000) {
            const current = await Review.findById(reviewId).select('helpfulCount').lean();
            return res.status(200).json(
                new ApiResponse(
                    200,
                    { _id: reviewId, helpfulCount: current?.helpfulCount || 0, alreadyVoted: true },
                    'You have already marked this review as helpful.'
                )
            );
        }
        throw err;
    }

    const updated = await Review.findByIdAndUpdate(
        reviewId,
        { $inc: { helpfulCount: 1 } },
        { new: true }
    );

    res.status(200).json(
        new ApiResponse(
            200,
            { _id: reviewId, helpfulCount: updated?.helpfulCount || 0, alreadyVoted: false },
            'Vote recorded.'
        )
    );
});
