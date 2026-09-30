import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import Settings from '../../../models/Settings.model.js';
import Product from '../../../models/Product.model.js';
import { getHomepageSections, HOMEPAGE_SECTIONS_KEY } from '../../../services/homepageSections.service.js';

export const getAdminHomepageSections = asyncHandler(async (_req, res) => {
    res.json(new ApiResponse(200, await getHomepageSections(), 'Homepage sections fetched.'));
});

export const updateAdminHomepageSections = asyncHandler(async (req, res) => {
    const sections = req.body.sections.map((section) => ({ ...section, limit: 6 }));
    await Settings.findOneAndUpdate(
        { key: HOMEPAGE_SECTIONS_KEY },
        { $set: { value: { sections } } },
        { upsert: true, new: true, runValidators: true }
    );
    res.json(new ApiResponse(200, { sections }, 'Homepage sections published.'));
});

// Pinning is an explicit merchandising decision. It intentionally checks only
// that a product is active; automatic rows keep the normal public eligibility.
export const searchHomepageProducts = asyncHandler(async (req, res) => {
    const query = String(req.query.search || '').trim();
    const requestedIds = String(req.query.ids || '').split(',')
        .map((id) => id.trim())
        .filter((id) => /^[a-f\d]{24}$/i.test(id));
    const filter = { isActive: true };
    if (requestedIds.length) {
        filter._id = { $in: requestedIds };
    } else if (query) {
        const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [{ name: new RegExp(safe, 'i') }, { sku: new RegExp(safe, 'i') }];
    }
    const products = await Product.find(filter)
        .select('_id name image mainImage images sku price originalPrice')
        .sort({ createdAt: -1, _id: -1 })
        .limit(requestedIds.length ? 36 : 24)
        .lean();
    res.json(new ApiResponse(200, { products }, 'Active products fetched.'));
});
