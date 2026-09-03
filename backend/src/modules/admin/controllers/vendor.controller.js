import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Vendor from '../../../models/Vendor.model.js';
import VendorDocument from '../../../models/VendorDocument.model.js';
import VendorSubscription from '../../../models/VendorSubscription.model.js';
import VendorShippingZone from '../../../models/VendorShippingZone.model.js';
import VendorShippingRate from '../../../models/VendorShippingRate.model.js';
import PickupLocation from '../../../models/PickupLocation.model.js';
import BulkImportHistory from '../../../models/BulkImportHistory.model.js';
import VendorChatThread from '../../../models/VendorChatThread.model.js';
import VendorChatMessage from '../../../models/VendorChatMessage.model.js';
import InventoryReservation from '../../../models/InventoryReservation.model.js';
import Notification from '../../../models/Notification.model.js';
import Review from '../../../models/Review.model.js';
import Product from '../../../models/Product.model.js';
import Commission from '../../../models/Commission.model.js';
import Order from '../../../models/Order.model.js';
import { sendEmail } from '../../../services/email.service.js';
import { createNotification } from '../../../services/notification.service.js';
import { marketplaceEventBus, MARKETPLACE_EVENTS } from '../../../services/events/marketplaceEventBus.js';
import { VENDOR_TYPE_VALUES } from '../../../constants/vendorCapabilities.js';
import { clampServiceRadius, resolveVendorAvailability } from '../../../services/quickCommerce.service.js';
import { canTransitionVendorChannel, normalizeVendorChannel, VENDOR_CHANNEL_VALUES, vendorChannelPath } from '../../../constants/vendorChannels.js';
import { projectSellingChannels } from '../../../services/vendorChannel.service.js';
import {
    applyChannelTransition,
    assertChannelRevision,
    assertQuickCommerceReady,
    quickCommerceReadiness,
} from '../../../services/vendorChannelTransition.service.js';
import { isQuickCommerceEnabled, isWholesaleMarketplaceEnabled } from '../../../services/featureFlags.service.js';
import AdminActivityLog from '../../../models/AdminActivityLog.model.js';

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const recordVendorAdminAction = async (req, vendorId, action, details) => {
    await AdminActivityLog.create({
        performedBy: req.user.id,
        targetVendor: vendorId,
        action,
        details,
        ipAddress: req.ip || '',
    });
};

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
    const { status, reason, vendorType, approvedChannels } = req.body;
    const allowed = ['approved', 'suspended', 'rejected'];
    if (!allowed.includes(status)) throw new ApiError(400, `Status must be one of: ${allowed.join(', ')}`);

    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    const previousStatus = vendor.status;
    const isReactivation = previousStatus === 'suspended' && status === 'approved';

    // Clients may supply approvedChannels (new contract) or legacy vendorType during initial approval.
    // When omitted during initial approval, automatically resolve requested channels from the vendor document.
    let resolvedApprovedChannels = approvedChannels;
    if (status === 'approved' && !isReactivation) {
        if (!resolvedApprovedChannels?.length && !vendorType) {
            const vendorRequested = [
                vendor.channels?.retail?.status === 'requested' && 'retail',
                vendor.channels?.wholesale?.status === 'requested' && 'wholesale',
                vendor.channels?.quickCommerce?.status === 'requested' && 'quick_commerce',
            ].filter(Boolean);

            if (vendorRequested.length > 0) {
                resolvedApprovedChannels = vendorRequested;
            } else if (vendor.vendorType && VENDOR_TYPE_VALUES.includes(vendor.vendorType)) {
                resolvedApprovedChannels = [vendor.vendorType];
            } else {
                resolvedApprovedChannels = ['retail'];
            }
        }

        if (!resolvedApprovedChannels?.length && !vendorType) {
            throw new ApiError(400, 'Please select at least one sales channel to approve for this vendor.');
        }
        // Validate explicit channel values when provided
        if (resolvedApprovedChannels?.length) {
            const invalidChannels = resolvedApprovedChannels.filter((c) => !VENDOR_CHANNEL_VALUES.includes(normalizeVendorChannel(c)));
            if (invalidChannels.length) {
                throw new ApiError(400, `Invalid channels: ${invalidChannels.join(', ')}. Must be one of: ${VENDOR_CHANNEL_VALUES.join(', ')}`);
            }
        }
        if (vendorType && !VENDOR_TYPE_VALUES.includes(vendorType)) {
            throw new ApiError(400, `Invalid vendorType. Must be one of: ${VENDOR_TYPE_VALUES.join(', ')}`);
        }
    }

    vendor.status = status;
    vendor.suspensionReason = status === 'suspended' ? (reason || '') : '';
    let approvedChannelList = [];
    const rejectedChannelList = [];
    if (status === 'approved') {
        if (!isReactivation || resolvedApprovedChannels?.length || vendorType) {
            const selected = resolvedApprovedChannels?.length ? resolvedApprovedChannels : [vendorType].filter(Boolean);
            if (selected.length > 0) {
                if (selected.includes('wholesale')) {
                    if (!(await isWholesaleMarketplaceEnabled())) throw new ApiError(403, 'Wholesale Marketplace is disabled platform-wide.');
                }

                const normalizedSelected = selected.map((channel) => normalizeVendorChannel(channel));
                const channelsToActivate = [];

                for (const channel of normalizedSelected) {
                    const path = vendorChannelPath(channel);
                    const current = vendor.channels?.[path]?.status;
                    // Approving a channel the vendor never applied for is not an
                    // approval; it is a grant. Require a pending request unless already active during reactivation.
                    if (current !== 'requested') {
                        if (isReactivation && current === 'active') {
                            channelsToActivate.push(channel);
                            continue;
                        }
                        throw new ApiError(409,
                            `Cannot approve ${channel}: the vendor has no pending request for it (current status: ${current || 'disabled'}).`);
                    }

                    if (channel === 'quick_commerce') {
                        if (!(await isQuickCommerceEnabled())) {
                            throw new ApiError(403, 'Quick Commerce is disabled platform-wide.');
                        }
                        const { ready } = quickCommerceReadiness(vendor);
                        if (!ready) {
                            // Quick Commerce operational setup is not yet complete (e.g. from initial registration).
                            // Defer activation: leave channel in 'requested' state so that general vendor
                            // approval succeeds and vendor/admin can configure store setup later.
                            continue;
                        }
                    }

                    channelsToActivate.push(channel);
                }

                for (const channel of channelsToActivate) {
                    applyChannelTransition(vendor, channel, 'active', { actor: 'admin', actorId: req.user.id });
                }

                approvedChannelList = channelsToActivate;

                // Every channel the vendor asked for and the admin did NOT select is
                // explicitly rejected with the supplied reason.
                for (const path of ['retail', 'wholesale', 'quickCommerce']) {
                    const channelValue = { retail: 'retail', wholesale: 'wholesale', quickCommerce: 'quick_commerce' }[path];
                    if (vendor.channels?.[path]?.status === 'requested'
                        && !normalizedSelected.includes(channelValue)) {
                        applyChannelTransition(vendor, channelValue, 'rejected', {
                            actor: 'admin',
                            actorId: req.user.id,
                            reason: reason || 'Not approved during account review.',
                        });
                        rejectedChannelList.push(channelValue);
                    }
                }

                if (vendorType) vendor.vendorType = vendorType;
            }
        } else {
            // Pure reactivation: vendor's existing channels are retained as-is
            approvedChannelList = Object.entries(vendor.channels || {})
                .filter(([_, cfg]) => cfg?.status === 'active')
                .map(([path]) => ({ retail: 'retail', wholesale: 'wholesale', quickCommerce: 'quick_commerce' }[path]))
                .filter(Boolean);
        }
    } else if (status === 'rejected') {
        for (const path of ['retail', 'wholesale', 'quickCommerce']) {
            if (vendor.channels?.[path]?.status === 'requested') {
                const channelValue = { retail: 'retail', wholesale: 'wholesale', quickCommerce: 'quick_commerce' }[path];
                applyChannelTransition(vendor, channelValue, 'rejected', {
                    actor: 'admin',
                    actorId: req.user.id,
                    reason: reason || '',
                });
                rejectedChannelList.push(channelValue);
            }
        }
    }
    await vendor.save();
    await recordVendorAdminAction(req, vendor._id, 'vendor_status_updated', {
        previousStatus,
        status,
        isReactivation,
        reason: reason || '',
        approvedChannels: approvedChannelList,
        rejectedChannels: rejectedChannelList,
        channelsRevision: vendor.channelsRevision,
    });

    // Tell the vendor about channels that were requested but not approved, so
    // a partial approval is a decision they can see and act on rather than a
    // request that silently never resolves.
    for (const channel of rejectedChannelList) {
        await createNotification({
            recipientId: vendor._id,
            recipientType: 'vendor',
            title: `${channel.replace('_', ' ')} channel not approved`,
            message: `Your request for the ${channel.replace('_', ' ')} channel was not approved.${reason ? ` Reason: ${reason}` : ''} You can re-apply from Selling Channels.`,
            type: 'system',
            data: { channel, status: 'rejected', channelsRevision: vendor.channelsRevision },
        }).catch(() => {});
    }

    if (status === 'approved') {
        marketplaceEventBus.emit(MARKETPLACE_EVENTS.VENDOR_APPROVED, { vendor, channels: approvedChannelList, vendorType: vendor.vendorType });
    } else if (status === 'rejected') {
        marketplaceEventBus.emit(MARKETPLACE_EVENTS.VENDOR_REJECTED, { vendor, reason });
    }

    // Build the email message body based on final status
    const approvedChannelLabels = approvedChannelList
        .map((channel) => channel.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
        .join(', ');
    const vendorMessage =
        status === 'approved'
            ? isReactivation
                ? `Your DwellMart Vendor account has been reactivated. You can now log in and continue selling.`
                : `Congratulations! Your DwellMart Vendor account has been approved for: ${approvedChannelLabels}. You can now log in and start selling.`
            : status === 'rejected'
            ? `Your vendor application was not approved.${reason ? ` Reason: ${reason}` : ' Please contact support for details.'}`
            : status === 'suspended'
            ? `Your DwellMart Vendor account has been suspended.${reason ? ` Reason: ${reason}` : ''} Please contact support.`
            : `Your DwellMart Vendor account status has been updated to: ${status}.`;

    try {
        await sendEmail({
            to: vendor.email,
            subject: `DwellMart Vendor Account ${isReactivation ? 'Reactivated' : `${status[0].toUpperCase()}${status.slice(1)}`}`,
            text: vendorMessage,
            html: `<p>${vendorMessage}</p>`,
        });
    } catch (err) {
        console.warn(`Vendor status email failed for ${vendor.email}: ${err.message}`);
    }

    res.status(200).json(new ApiResponse(200, toApiVendor(vendor), isReactivation ? 'Vendor reactivated successfully.' : `Vendor ${status} successfully.`));
});

// DELETE /api/admin/vendors/:id
export const hardDeleteVendor = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const vendor = await Vendor.findById(id);
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    // 1. Safety Guard: Check if vendor has active/completed real customer orders
    const activeOrderCount = await Order.countDocuments({
        'vendorItems.vendorId': vendor._id,
        status: { $nin: ['cancelled', 'canceled'] },
    });

    if (activeOrderCount > 0) {
        throw new ApiError(
            409,
            `Cannot hard-delete vendor with ${activeOrderCount} active or completed order(s). Suspend the vendor instead to preserve financial and customer order history.`
        );
    }

    // 2. Capture immutable vendor snapshot for permanent audit logging
    const vendorSnapshot = {
        vendorId: String(vendor._id),
        name: vendor.name,
        email: vendor.email,
        storeName: vendor.storeName,
        phone: vendor.phone || vendor.phoneE164,
        vendorType: vendor.vendorType,
        isTestAccount: Boolean(vendor.isTestAccount),
        registeredAt: vendor.createdAt,
        deletedAt: new Date().toISOString(),
        deletedByAdmin: req.user.id,
        reason: req.body?.reason || req.query?.reason || 'Permanent hard deletion by admin',
    };

    // 3. Cascade delete vendor-specific assets and operational data
    const productIds = (await Product.find({ vendorId: vendor._id }).select('_id').lean()).map((p) => p._id);

    await Promise.all([
        Vendor.deleteOne({ _id: vendor._id }),
        Product.deleteMany({ vendorId: vendor._id }),
        VendorDocument.deleteMany({ vendorId: vendor._id }),
        VendorSubscription.deleteMany({ vendor: vendor._id }),
        VendorShippingZone.deleteMany({ vendorId: vendor._id }),
        VendorShippingRate.deleteMany({ vendorId: vendor._id }),
        PickupLocation.deleteMany({ vendorId: vendor._id }),
        BulkImportHistory.deleteMany({ vendorId: vendor._id }),
        VendorChatThread.deleteMany({ vendorId: vendor._id }),
        VendorChatMessage.deleteMany({ vendorId: vendor._id }),
        InventoryReservation.deleteMany({ vendorId: vendor._id }),
        Notification.deleteMany({ recipientId: vendor._id, recipientType: 'vendor' }),
        productIds.length ? Review.deleteMany({ productId: { $in: productIds } }) : Promise.resolve(),
    ]);

    // 4. Record permanent destructive action in AdminActivityLog
    await AdminActivityLog.create({
        performedBy: req.user.id,
        targetVendor: vendor._id,
        action: 'vendor_hard_deleted',
        details: vendorSnapshot,
        ipAddress: req.ip || '',
    });

    res.status(200).json(
        new ApiResponse(200, { deletedVendorId: String(vendor._id), snapshot: vendorSnapshot }, 'Vendor and associated data permanently deleted.')
    );
});

// PATCH /api/admin/vendors/:id/channels/:channel/status
export const updateVendorChannelStatus = asyncHandler(async (req, res) => {
    const channel = normalizeVendorChannel(req.params.channel);
    if (!channel) throw new ApiError(400, 'Invalid vendor channel.');

    const { status, reason = '', expectedRevision } = req.body;
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    assertChannelRevision(vendor, expectedRevision);
    if (status === 'active' && vendor.status !== 'approved') {
        throw new ApiError(409, 'Approve the vendor account before activating a channel.');
    }
    if (status === 'active' && channel === 'wholesale') {
        if (!(await isWholesaleMarketplaceEnabled())) {
            throw new ApiError(403, 'Wholesale Marketplace is disabled platform-wide.');
        }
    }
    if (status === 'active' && channel === 'quick_commerce') {
        if (!(await isQuickCommerceEnabled())) {
            throw new ApiError(403, 'Quick Commerce is disabled platform-wide.');
        }
        // A store with no location, radius or preparation time cannot compute
        // serviceability, delivery fee or ETA. Activating it would show the
        // channel as active while every checkout failed at the last step with
        // VENDOR_LOCATION_MISSING.
        assertQuickCommerceReady(vendor);
    }
    if (status === 'disabled') {
        const activeOrders = await Order.countDocuments({
            'vendorItems.vendorId': vendor._id,
            $or: [{ fulfillmentType: channel }, { orderType: channel }],
            status: { $nin: ['delivered', 'completed', 'cancelled', 'refunded'] },
        });
        if (activeOrders > 0) {
            throw new ApiError(409, 'Pause this channel first and complete its active orders before disabling it.');
        }
    }

    const { previousStatus } = applyChannelTransition(vendor, channel, status, {
        actor: 'admin',
        actorId: req.user.id,
        reason,
    });
    vendor.sellingChannels = projectSellingChannels(vendor);
    await vendor.save();
    await recordVendorAdminAction(req, vendor._id, 'vendor_channel_status_updated', {
        channel,
        previousStatus,
        status,
        reason,
        channelsRevision: vendor.channelsRevision,
    });

    await createNotification({
        recipientId: vendor._id,
        recipientType: 'vendor',
        title: `${channel.replace('_', ' ')} channel updated`,
        message: `Your ${channel.replace('_', ' ')} channel is now ${status}.${reason ? ` Reason: ${reason}` : ''}`,
        type: 'system',
        data: { channel, status, channelsRevision: vendor.channelsRevision },
    }).catch(() => {});

    res.status(200).json(new ApiResponse(200, toApiVendor(vendor), 'Vendor channel updated.'));
});

// PATCH /api/admin/vendors/:id/vendor-type
// Legacy business classification only. This endpoint never grants channel access.
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
    await vendor.save();
    await recordVendorAdminAction(req, vendor._id, 'vendor_classification_updated', {
        previousType,
        vendorType,
    });

    await createNotification({
        recipientId: vendor._id,
        recipientType: 'vendor',
        title: 'Vendor Classification Updated',
        message: `Your legacy business classification has been updated to ${vendorType.replace('_', ' ')}. Your approved channels are unchanged.`,
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
    const { enabled, serviceRadiusKm, preparationTimeMins, expectedRevision } = req.body;

    if (typeof enabled !== 'boolean') {
        throw new ApiError(400, 'enabled must be a boolean.');
    }

    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    // Optimistic concurrency is mandatory here too. It used to be skipped
    // whenever the caller omitted `expectedRevision` — which the admin UI did,
    // so two admins could silently clobber each other through this control.
    assertChannelRevision(vendor, expectedRevision);

    // ── Defect 3b: Account-approved validation ─────────────────────────────
    // Admin can only toggle Quick Commerce for vendors whose accounts are
    // already in approved state. Rejected or pending vendors must go through
    // the main approval flow first.
    if (vendor.status !== 'approved') {
        throw new ApiError(400, `Cannot toggle Quick Commerce: vendor account status is '${vendor.status}'. Approve the account first.`);
    }

    if (enabled === true) {
        const quickCommerceEnabled = await isQuickCommerceEnabled();
        if (!quickCommerceEnabled) {
            throw new ApiError(403, 'Quick Commerce is not currently available on this platform.');
        }
    }

    const previousStatus = vendor.channels?.quickCommerce?.status || 'disabled';
    const targetStatus = enabled === true ? 'active' : 'disabled';

    // ── Defect 3d: Revoking must never strand vendor with no channel ────────
    if (enabled === false
        && vendor.channels?.retail?.status !== 'active'
        && vendor.channels?.wholesale?.status !== 'active') {
        throw new ApiError(
            400,
            'Cannot disable Quick Commerce: it is this vendor\'s only selling channel. Enable Retail or Wholesale first.'
        );
    }

    // ── Defect 3e: Active-order protection before disabling ────────────────
    // Disabling Quick Commerce while open orders exist would leave those orders
    // without a valid fulfillment path. Block the transition until orders clear.
    if (enabled === false) {
        const activeQcOrders = await Order.countDocuments({
            'items.vendorId': vendor._id,
            orderType: 'quick_commerce',
            status: { $in: ['pending', 'confirmed', 'processing', 'ready', 'out_for_delivery'] },
        });
        if (activeQcOrders > 0) {
            throw new ApiError(400,
                `Cannot disable Quick Commerce: vendor has ${activeQcOrders} active Quick Commerce order(s) in progress. ` +
                'Wait for them to complete or cancel before disabling.');
        }
    }

    // Same state machine as every other channel mutation.
    applyChannelTransition(vendor, 'quick_commerce', targetStatus, {
        actor: 'admin',
        actorId: req.user.id,
    });
    vendor.sellingChannels = projectSellingChannels(vendor);

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
    await recordVendorAdminAction(req, vendor._id, 'vendor_quick_commerce_updated', {
        previousStatus,
        newStatus: targetStatus,
        serviceRadiusKm,
        preparationTimeMins,
        channelsRevision: vendor.channelsRevision,
    });

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
                channels: vendor.channels,
                channelsRevision: vendor.channelsRevision,
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
