import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Wishlist from '../../../models/Wishlist.model.js';
import Product from '../../../models/Product.model.js';
import mongoose from 'mongoose';

const wishlistPopulate = 'items.productId';
const wishlistSelect = 'name price image stock unit rating originalPrice isActive publicationStatus isDeleted';

// GET /api/user/wishlist
export const getWishlist = asyncHandler(async (req, res) => {
    const wishlist = await Wishlist.findOne({ userId: req.user.id }).populate(wishlistPopulate, wishlistSelect);
    const items = (wishlist?.items || []).filter((item) =>
        item?.productId
        && item.productId.isActive !== false
        && item.productId.isDeleted !== true
        && item.productId.publicationStatus === 'LIVE'
    );
    res.status(200).json(new ApiResponse(200, items, 'Wishlist fetched.'));
});

// POST /api/user/wishlist
export const addToWishlist = asyncHandler(async (req, res) => {
    const { productId } = req.body;
    const normalizedProductId = String(productId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(normalizedProductId)) {
        throw new ApiError(400, 'Invalid product id.');
    }

    const product = await Product.findOne({
        _id: normalizedProductId,
        isActive: true,
        isDeleted: { $ne: true },
        publicationStatus: 'LIVE',
    }).select('_id');
    if (!product) {
        throw new ApiError(404, 'Product not found.');
    }

    let wishlist = await Wishlist.findOne({ userId: req.user.id });

    if (!wishlist) {
        wishlist = await Wishlist.create({ userId: req.user.id, items: [{ productId: normalizedProductId }] });
    } else {
        const exists = wishlist.items.some((i) => i.productId.toString() === normalizedProductId);
        if (exists) throw new ApiError(409, 'Product already in wishlist.');
        wishlist.items.push({ productId: normalizedProductId });
        await wishlist.save();
    }

    const refreshed = await Wishlist.findOne({ userId: req.user.id }).populate(wishlistPopulate, wishlistSelect);
    const items = (refreshed?.items || []).filter((item) => item?.productId);
    res.status(201).json(new ApiResponse(201, items, 'Added to wishlist.'));
});

// DELETE /api/user/wishlist/:productId
export const removeFromWishlist = asyncHandler(async (req, res) => {
    const normalizedProductId = String(req.params.productId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(normalizedProductId)) {
        throw new ApiError(400, 'Invalid product id.');
    }

    const wishlist = await Wishlist.findOne({ userId: req.user.id });
    if (!wishlist) {
        res.status(200).json(new ApiResponse(200, [], 'Removed from wishlist.'));
        return;
    }

    wishlist.items = wishlist.items.filter((i) => i.productId.toString() !== normalizedProductId);
    await wishlist.save();

    const refreshed = await Wishlist.findOne({ userId: req.user.id }).populate(wishlistPopulate, wishlistSelect);
    const items = (refreshed?.items || []).filter((item) => item?.productId);
    res.status(200).json(new ApiResponse(200, items, 'Removed from wishlist.'));
});
