import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Vendor from '../../../models/Vendor.model.js';
import VendorDocument from '../../../models/VendorDocument.model.js';
import Commission from '../../../models/Commission.model.js';
import Order from '../../../models/Order.model.js';
import { sendEmail } from '../../../services/email.service.js';
import { createNotification } from '../../../services/notification.service.js';
import { marketplaceEventBus, MARKETPLACE_EVENTS } from '../../../services/events/marketplaceEventBus.js';
import { VENDOR_TYPE_VALUES, VendorCapabilities } from '../../../constants/vendorCapabilities.js';
import { clampServiceRadius, resolveVendorAvailability } from '../../../services/quickCommerce.service.js';

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toApiVendor = (vendorDoc) => {
    const vendor = typeof vendorDoc?.toObject === 'function'
        ? vendorDoc.toObject()
        : (vendorDoc || {});

    const normalizedId = vendor?._id ? String(vendor._id) : String(vendor?.id || '');
    const normalizedCommissionRate = Number(vendor.commissionRate);
    return {
        ...vendor,
        id: normalizedId,
        commissionRate: Number.isFinite(normalizedCommissionRate)
            ? normalizedCommissionRate / 100
            : 0
    };
};

// GET /api/admin/vendors
export const getAllVendors = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 20, search } = req.query;
    const numericPage = Math.max(parseInt(page, 10) || 1, 1);
    const numericLimit = Math.max(parseInt(limit, 10) || 20, 1);
    const skip = (numericPage - 1) * numericLimit;
    const filter = {};

    const allowedStatuses = new Set(['pending', 'approved', 'suspended', 'rejected']);
    if (typeof status === 'string' && status !== 'all' && allowedStatuses.has(status)) {
        filter.status = status;
    }

    const trimmedSearch = String(search || '').trim();
    if (trimmedSearch) {
        const safeRegex = new RegExp(escapeRegex(trimmedSearch), 'i');
        filter.$or = [{ name: safeRegex }, { email: safeRegex }, { storeName: safeRegex }];
    }

    const [vendors, total] = await Promise.all([
        Vendor.find(filter)
            .select('-password -otp -otpExpiry')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Vendor.countDocuments(filter),
    ]);

    const vendorIds = vendors.map(v => v._id);

    const statsByVendor = await Order.aggregate([
        { $unwind: "$vendorItems" },
        { $match: { "vendorItems.vendorId": { $in: vendorIds } } },
        {
            $group: {
                _id: "$vendorItems.vendorId",
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: "$vendorItems.subtotal" }
            }
        }
    ]);

    const statsMap = new Map(
        statsByVendor.map(stat => [String(stat._id), stat])
    );

    const vendorsWithStats = vendors.map(vendor => {
        const stats = statsMap.get(String(vendor._id)) || { totalOrders: 0, totalRevenue: 0 };
        return {
            ...toApiVendor(vendor),
            totalOrders: stats.totalOrders,
            totalRevenue: stats.totalRevenue,
            totalEarnings: stats.totalRevenue, // Following the frontend logic for VendorAnalytics
            pendingEarnings: 0, // Placeholder mapping to avoid breaking frontend immediately if used
            paidEarnings: 0
        };
    });

    res.status(200).json(
        new ApiResponse(200, {
            vendors: vendorsWithStats,
            total,
            page: numericPage,
            pages: Math.ceil(total / numericLimit)
        }, 'Vendors fetched.')
    );
});

// GET /api/admin/vendors/:id
export const getVendorDetail = asyncHandler(async (req, res) => {
    const vendor = await Vendor.findById(req.params.id)
        .select('-password -otp -otpExpiry +bankDetails.accountName +bankDetails.accountNumber +bankDetails.ifscCode +bankDetails.bankName')
        .lean();
    if (!vendor) throw new ApiError(404, 'Vendor not found.');
    res.status(200).json(new ApiResponse(200, toApiVendor(vendor), 'Vendor detail fetched.'));
});

// PATCH /api/admin/vendors/:id/status
export const updateVendorStatus = asyncHandler(async (req, res) => {
    const { status, reason, vendorType } = req.body;
    const allowed = ['approved', 'suspended', 'rejected'];
    if (!allowed.includes(status)) throw new ApiError(400, `Status must be one of: ${allowed.join(', ')}`);

    // vendorType is mandatory when approving a vendor
    if (status === 'approved') {
        if (!vendorType) {
            throw new ApiError(400, 'vendorType is required when approving a vendor. Must be one of: quick_commerce, retail, wholesale.');
        }
        if (!VENDOR_TYPE_VALUES.includes(vendorType)) {
            throw new ApiError(400, `Invalid vendorType. Must be one of: ${VENDOR_TYPE_VALUES.join(', ')}`);
        }
    }

    const updateData = { status, suspensionReason: reason || '' };
    if (status === 'approved' && vendorType) {
        updateData.vendorType = vendorType;
    }

    const vendor = await Vendor.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    if (status === 'approved') {
        marketplaceEventBus.emit(MARKETPLACE_EVENTS.VENDOR_APPROVED, { vendor, vendorType: vendor.vendorType });
    } else if (status === 'rejected') {
        marketplaceEventBus.emit(MARKETPLACE_EVENTS.VENDOR_REJECTED, { vendor, reason });
    }

    try {
        await sendEmail({
            to: vendor.email,
            subject: `Vendor Account ${status[0].toUpperCase()}${status.slice(1)}`,
            text: vendorMessage,
            html: `<p>${vendorMessage}</p>`,
        });
    } catch (err) {
        console.warn(`Vendor status email failed for ${vendor.email}: ${err.message}`);
    }

    res.status(200).json(new ApiResponse(200, toApiVendor(vendor), `Vendor ${status} successfully.`));
});

// PATCH /api/admin/vendors/:id/vendor-type
// Only Super Admin can call this. Changes vendor type and auto-syncs sellingChannels.
export const updateVendorType = asyncHandler(async (req, res) => {
    const { vendorType } = req.body;
    if (!vendorType) throw new ApiError(400, 'vendorType is required.');
    if (!VENDOR_TYPE_VALUES.includes(vendorType)) {
        throw new ApiError(400, `Invalid vendorType. Must be one of: ${VENDOR_TYPE_VALUES.join(', ')}`);
    }

    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    const previousType = vendor.vendorType;
    vendor.vendorType = vendorType;
    // sellingChannels will auto-sync via the pre-save hook
    await vendor.save();

    await createNotification({
        recipientId: vendor._id,
        recipientType: 'vendor',
        title: 'Vendor Type Updated',
        message: `Your vendor account type has been updated to ${vendorType.replace('_', ' ')}.`,
        type: 'system',
        data: { previousType, vendorType },
    }).catch(() => {});

    res.status(200).json(
        new ApiResponse(200,
            { ...toApiVendor(vendor), vendorType: vendor.vendorType },
            `Vendor type updated to ${vendorType}.`
        )
    );
});

// PATCH /api/admin/vendors/:id/commission
// PATCH /api/admin/vendors/:id/quick-commerce
export const updateVendorQuickCommerce = asyncHandler(async (req, res) => {
    const { enabled, serviceRadiusKm, preparationTimeMins } = req.body;

    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    if (enabled === true) {
        const quickCommerceEnabled = await isQuickCommerceEnabled();
        if (!quickCommerceEnabled) {
            throw new ApiError(403, 'Quick Commerce is not currently available on this platform.');
        }
    }

    // Revoking Quick Commerce must never strand the vendor with no channel.
    if (enabled === false
        && vendor.sellingChannels?.retail?.enabled === false
        && vendor.sellingChannels?.wholesale?.enabled !== true) {
        throw new ApiError(
            400,
            'Cannot disable Quick Commerce: it is this vendor\'s only selling channel. Enable Retail or Wholesale first.'
        );
    }

    vendor.sellingChannels = {
        retail: { enabled: vendor.sellingChannels?.retail?.enabled !== false },
        wholesale: { enabled: vendor.sellingChannels?.wholesale?.enabled === true },
        quickCommerce: { enabled: enabled === true },
    };

    // Optional admin overrides for operationally unrealistic vendor settings.
    if (serviceRadiusKm !== undefined || preparationTimeMins !== undefined) {
        const profile = vendor.quickCommerceProfile?.toObject?.() ?? { ...(vendor.quickCommerceProfile || {}) };
        if (serviceRadiusKm !== undefined) {
            const clamped = clampServiceRadius(serviceRadiusKm);
            if (clamped === null) throw new ApiError(400, 'Invalid service radius.');
            profile.serviceRadiusKm = clamped;
        }
        if (preparationTimeMins !== undefined) profile.preparationTimeMins = preparationTimeMins;
        vendor.quickCommerceProfile = profile;
    }

    await vendor.save();

    await createNotification({
        recipientId: vendor._id,
        recipientType: 'vendor',
        title: enabled ? 'Quick Commerce Enabled' : 'Quick Commerce Disabled',
        message: enabled
            ? 'Your store has been approved for Quick Commerce. Configure your location, radius, and hours to start receiving orders.'
            : 'Quick Commerce has been disabled for your store by the platform team.',
        type: 'system',
    }).catch(() => {});

    res.status(200).json(
        new ApiResponse(
            200,
            {
                sellingChannels: vendor.sellingChannels,
                quickCommerceProfile: vendor.quickCommerceProfile,
                availability: resolveVendorAvailability(vendor),
            },
            enabled ? 'Quick Commerce enabled for vendor.' : 'Quick Commerce disabled for vendor.'
        )
    );
});

export const updateCommissionRate = asyncHandler(async (req, res) => {
    const { commissionRate } = req.body;
    const parsedRate = Number(commissionRate);
    if (Number.isNaN(parsedRate) || parsedRate < 0) {
        throw new ApiError(400, 'Commission rate must be a valid non-negative number.');
    }
    const dbCommissionRate = parsedRate <= 1 ? parsedRate * 100 : parsedRate;
    if (dbCommissionRate > 100) throw new ApiError(400, 'Commission rate must be between 0 and 100.');

    const vendor = await Vendor.findByIdAndUpdate(req.params.id, { commissionRate: dbCommissionRate }, { new: true });
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    const message = `Your commission rate has been updated to ${dbCommissionRate.toFixed(1)}%.`;

    await createNotification({
        recipientId: vendor._id,
        recipientType: 'vendor',
        title: 'Commission Rate Updated',
        message,
        type: 'system',
    });

    try {
        await sendEmail({
            to: vendor.email,
            subject: 'Commission Rate Updated',
            text: message,
            html: `<p>${message}</p>`,
        });
    } catch (err) {
        console.warn(`Vendor commission email failed for ${vendor.email}: ${err.message}`);
    }

    res.status(200).json(new ApiResponse(200, toApiVendor(vendor), 'Commission rate updated.'));
});

// GET /api/admin/vendors/:id/commissions
export const getVendorCommissions = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { page = 1, limit = 20, status = 'all' } = req.query;

    const vendor = await Vendor.findById(id).select('_id');
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    const numericPage = Math.max(parseInt(page, 10) || 1, 1);
    const numericLimit = Math.max(parseInt(limit, 10) || 20, 1);
    const skip = (numericPage - 1) * numericLimit;

    const filter = { vendorId: vendor._id };
    if (status && status !== 'all') {
        filter.status = status;
    }

    const [commissions, total] = await Promise.all([
        Commission.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Commission.countDocuments(filter),
    ]);

    res.status(200).json(
        new ApiResponse(
            200,
            {
                commissions,
                total,
                page: numericPage,
                pages: Math.ceil(total / numericLimit),
            },
            'Vendor commissions fetched.'
        )
    );
});

// GET /api/admin/vendors/:id/documents
export const getVendorDocuments = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const vendor = await Vendor.findById(id).select('_id');
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    const documents = await VendorDocument.find({ vendorId: id }).sort({ createdAt: -1 });
    res.status(200).json(new ApiResponse(200, documents, 'Vendor documents fetched.'));
});
