import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Review from '../../../models/Review.model.js';
import Product from '../../../models/Product.model.js';
import { syncProductAndVendorReviewStats } from '../../../services/reviewAggregate.service.js';
import { parsePagination } from '../../../utils/pagination.js';

const normalizeReview = (reviewDoc) => {
    const review = reviewDoc.toObject ? reviewDoc.toObject() : reviewDoc;
    const status = review.isHidden ? 'hidden' : review.isApproved ? 'approved' : 'pending';

    return {
        ...review,
        id: String(review._id),
        productId: String(review.productId?._id ?? review.productId ?? ''),
        productName: review.productId?.name ?? 'Unknown Product',
        customerName: review.userId?.name ?? 'Unknown',
        customerEmail: review.userId?.email ?? 'N/A',
        status,
    };
};

// GET /api/vendor/reviews
export const getVendorReviews = asyncHandler(async (req, res) => {
    const { rating, productId } = req.query;
    const { page, limit, skip, calculatePages } = parsePagination(req.query, {
        defaultLimit: 20,
        maxLimit: 1000,
    });

    const vendorProducts = await Product.find({ vendorId: req.user.id }).select('_id').lean();
    const vendorProductIds = vendorProducts.map((p) => p._id);
    if (vendorProductIds.length === 0) {
        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    reviews: [],
                    pagination: { total: 0, page, limit, pages: 0 },
                },
                'Reviews fetched.'
            )
        );
    }

    const filter = { productId: { $in: vendorProductIds } };
    if (rating) {
        const parsedRating = Number(rating);
        if (Number.isFinite(parsedRating) && parsedRating >= 1 && parsedRating <= 5) {
            filter.rating = parsedRating;
        }
    }
    if (productId) {
        filter.productId = { $in: vendorProductIds.filter((id) => String(id) === String(productId)) };
    }

    const [reviews, total] = await Promise.all([
        Review.find(filter)
            .populate('userId', 'name email')
            .populate('productId', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        Review.countDocuments(filter),
    ]);

    const normalized = reviews.map(normalizeReview);
    res.status(200).json(
        new ApiResponse(
            200,
            {
                reviews: normalized,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: calculatePages(total),
                },
            },
            'Reviews fetched.'
        )
    );
});

// PATCH /api/vendor/reviews/:id/status
export const updateVendorReviewStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const allowed = ['approved', 'pending', 'hidden'];
    if (!allowed.includes(status)) {
        throw new ApiError(400, `Status must be one of: ${allowed.join(', ')}`);
    }

    const review = await Review.findById(req.params.id).populate('productId', 'vendorId name');
    if (!review) throw new ApiError(404, 'Review not found.');
    if (String(review.productId?.vendorId) !== String(req.user.id)) {
        throw new ApiError(404, 'Review not found.');
    }

    if (status === 'approved') {
        review.isApproved = true;
        review.isHidden = false;
    } else if (status === 'hidden') {
        review.isApproved = false;
        review.isHidden = true;
    } else {
        review.isApproved = false;
        review.isHidden = false;
    }

    await review.save();
    await review.populate('userId', 'name email');
    await syncProductAndVendorReviewStats(review.productId?._id || review.productId);

    res.status(200).json(new ApiResponse(200, normalizeReview(review), 'Review status updated.'));
});

// PATCH /api/vendor/reviews/:id/response
export const addVendorReviewResponse = asyncHandler(async (req, res) => {
    const { response } = req.body;
    const cleanResponse = String(response ?? '').trim();
    if (!cleanResponse) throw new ApiError(400, 'Response is required.');

    const review = await Review.findById(req.params.id).populate('productId', 'vendorId name');
    if (!review) throw new ApiError(404, 'Review not found.');
    if (String(review.productId?.vendorId) !== String(req.user.id)) {
        throw new ApiError(404, 'Review not found.');
    }

    review.vendorResponse = cleanResponse;
    review.responseDate = new Date();
    await review.save();
    await review.populate('userId', 'name email');

    res.status(200).json(new ApiResponse(200, normalizeReview(review), 'Response added.'));
});
