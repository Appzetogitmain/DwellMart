import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import { Order } from '../../../models/Order.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { sendEmail } from '../../../services/email.service.js';
import { createNotification } from '../../../services/notification.service.js';
import crypto from 'crypto';

const DOC_TOKEN_TTL_MS = 10 * 60 * 1000;
const DOC_TOKEN_QUERY_KEY = 'docToken';

const buildDocToken = (relativePath) => {
    // No literal fallback: the verifier in app.js denies when JWT_SECRET is
    // absent, so signing with a guessable default would only mint tokens that
    // are rejected — while making the signing key public.
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new ApiError(500, 'Delivery document access is unavailable: signing key is not configured.');
    }
    const exp = Date.now() + DOC_TOKEN_TTL_MS;
    const payload = `${relativePath}|${exp}`;
    const signature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
    return `${exp}.${signature}`;
};

const buildDocUrl = (req, relativePath = '') => {
    if (!relativePath) return '';
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) return relativePath;
    const baseUrl = `${req.protocol}://${req.get('host')}${relativePath}`;
    if (relativePath.startsWith('/uploads/delivery-docs/')) {
        const token = buildDocToken(relativePath);
        return `${baseUrl}?${DOC_TOKEN_QUERY_KEY}=${encodeURIComponent(token)}`;
    }
    return baseUrl;
};

import {
    calculateRiderCashInHand,
    calculateRiderSettleableCash,
    calculateRiderCashInHandBulk,
    completeCashSettlement,
    rejectCashSettlement,
    cancelCashSettlement,
    postCashAdjustment,
    autoCleanupStalePendingRequests,
    getMaxCodCashLimit,
} from '../../../services/deliveryCash.service.js';
import DeliveryCashSettlement from '../../../models/DeliveryCashSettlement.model.js';
import DeliveryCashLedger from '../../../models/DeliveryCashLedger.model.js';

/**
 * @desc    Get all delivery boys with filtering and pagination
 * @route   GET /api/admin/delivery-boys
 * @access  Private (Admin)
 */
export const getAllDeliveryBoys = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, search = '', status, applicationStatus } = req.query;
    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 10;

    const filter = {};

    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
            { address: { $regex: search, $options: 'i' } },
        ];
    }

    if (status) {
        filter.isActive = status === 'active';
    }

    if (applicationStatus) {
        filter.applicationStatus = applicationStatus;
    }

    const deliveryBoys = await DeliveryBoy.find(filter)
        .select('-password -payoutDetails.accountNumber -payoutDetails.upiId')
        .sort({ createdAt: -1 })
        .skip((numericPage - 1) * numericLimit)
        .limit(numericLimit);

    const total = await DeliveryBoy.countDocuments(filter);
    const maxCodCashLimit = await getMaxCodCashLimit();

    // Aggregate stats for each delivery boy
    const boysWithStats = await Promise.all(deliveryBoys.map(async (boy) => {
        const [stats, cashInHand] = await Promise.all([
            Order.aggregate([
                { $match: { deliveryBoyId: boy._id } },
                {
                    $group: {
                        _id: null,
                        totalDeliveries: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
                        pendingDeliveries: { $sum: { $cond: [{ $in: ['$status', ['pending', 'processing', 'shipped']] }, 1, 0] } },
                    }
                }
            ]),
            calculateRiderCashInHand(boy._id),
        ]);

        const boyStats = stats.length > 0 ? stats[0] : { totalDeliveries: 0, pendingDeliveries: 0 };
        return {
            ...boy._doc,
            id: boy._id,
            status: boy.isActive ? 'active' : 'inactive',
            applicationStatus: boy.applicationStatus || 'approved',
            documents: {
                drivingLicense: boy.documents?.drivingLicense || '',
                aadharCard: boy.documents?.aadharCard || '',
            },
            documentUrls: {
                drivingLicense: buildDocUrl(req, boy.documents?.drivingLicense || ''),
                aadharCard: buildDocUrl(req, boy.documents?.aadharCard || ''),
            },
            cashInHand,
            maxCodCashLimit,
            isBlockedByLimit: cashInHand >= maxCodCashLimit,
            stats: {
                totalDeliveries: boyStats.totalDeliveries,
                pendingDeliveries: boyStats.pendingDeliveries,
                cashInHand,
            }
        };
    }));

    res.status(200).json(
        new ApiResponse(200, {
            deliveryBoys: boysWithStats,
            pagination: {
                total,
                page: numericPage,
                limit: numericLimit,
                pages: Math.ceil(total / numericLimit)
            }
        }, 'Delivery boys fetched successfully')
    );
});

/**
 * @desc    Get delivery boy detail with order history
 * @route   GET /api/admin/delivery-boys/:id
 * @access  Private (Admin)
 */
export const getDeliveryBoyById = asyncHandler(async (req, res) => {
    const boy = await DeliveryBoy.findById(req.params.id).select('-password -payoutDetails.accountNumber -payoutDetails.upiId');

    if (!boy) {
        throw new ApiError(404, 'Delivery boy not found');
    }

    const orders = await Order.find({ deliveryBoyId: boy._id }).sort({ createdAt: -1 }).limit(50);

    const [stats, cashInHand, maxCodCashLimit] = await Promise.all([
        Order.aggregate([
            { $match: { deliveryBoyId: boy._id } },
            {
                $group: {
                    _id: null,
                    totalDeliveries: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
                }
            }
        ]),
        calculateRiderSettleableCash(boy._id),
        getMaxCodCashLimit(),
    ]);

    // Rider earnings are what the wallet ledger says they are. The previous
    // `SUM(order.shipping)` reported the customer's shipping fee, which belongs
    // to the vendor or the platform and was never owed to the rider.
    const { getRiderLedgerEarnings } = await import('../../../services/wallet/riderEarnings.service.js');
    const ledgerEarnings = await getRiderLedgerEarnings(boy._id);

    const boyStats = stats.length > 0
        ? { ...stats[0], totalEarnings: ledgerEarnings.totalEarned }
        : { totalDeliveries: 0, totalEarnings: ledgerEarnings.totalEarned };

    res.status(200).json(
        new ApiResponse(200, {
            ...boy._doc,
            id: boy._id,
            status: boy.isActive ? 'active' : 'inactive',
            applicationStatus: boy.applicationStatus || 'approved',
            documentUrls: {
                drivingLicense: buildDocUrl(req, boy.documents?.drivingLicense || ''),
                aadharCard: buildDocUrl(req, boy.documents?.aadharCard || ''),
            },
            cashInHand,
            maxCodCashLimit,
            isBlockedByLimit: cashInHand >= maxCodCashLimit,
            stats: {
                ...boyStats,
                cashInHand,
            },
            recentOrders: orders
        }, 'Delivery boy details fetched successfully')
    );
});

/**
 * @desc    Create a new delivery boy
 * @route   POST /api/admin/delivery-boys
 * @access  Private (Admin)
 */
export const createDeliveryBoy = asyncHandler(async (req, res) => {
    const { name, email, password, phone, address, vehicleType, vehicleNumber, isActive } = req.body;

    const existedUser = await DeliveryBoy.findOne({
        $or: [{ email }, { phone }]
    });

    if (existedUser) {
        throw new ApiError(409, 'User with email or phone already exists');
    }

    const boy = await DeliveryBoy.create({
        name,
        email,
        password,
        phone,
        address,
        vehicleType,
        vehicleNumber,
        isActive: typeof isActive === 'boolean' ? isActive : true,
        applicationStatus: 'approved',
    });

    const createdBoy = await DeliveryBoy.findById(boy._id).select('-password -payoutDetails.accountNumber -payoutDetails.upiId');

    if (!createdBoy) {
        throw new ApiError(500, 'Something went wrong while creating the delivery boy');
    }

    res.status(201).json(
        new ApiResponse(201, createdBoy, 'Delivery boy created successfully')
    );
});

/**
 * @desc    Update delivery boy status
 * @route   PATCH /api/admin/delivery-boys/:id/status
 * @access  Private (Admin)
 */
export const updateDeliveryBoyStatus = asyncHandler(async (req, res) => {
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
        throw new ApiError(400, 'isActive status must be a boolean');
    }

    const boy = await DeliveryBoy.findByIdAndUpdate(
        req.params.id,
        { isActive },
        { new: true }
    ).select('-password -payoutDetails.accountNumber -payoutDetails.upiId');

    if (!boy) {
        throw new ApiError(404, 'Delivery boy not found');
    }

    res.status(200).json(
        new ApiResponse(200, boy, `Delivery boy status updated to ${isActive ? 'active' : 'inactive'}`)
    );
});

/**
 * @desc    Approve or reject delivery registration
 * @route   PATCH /api/admin/delivery-boys/:id/application-status
 * @access  Private (Admin)
 */
export const updateDeliveryBoyApplicationStatus = asyncHandler(async (req, res) => {
    const { applicationStatus, reason = '' } = req.body;

    if (!['approved', 'rejected'].includes(applicationStatus)) {
        throw new ApiError(400, 'applicationStatus must be approved or rejected');
    }

    const boy = await DeliveryBoy.findById(req.params.id);
    if (!boy) {
        throw new ApiError(404, 'Delivery boy not found');
    }

    boy.applicationStatus = applicationStatus;
    boy.rejectionReason = applicationStatus === 'rejected' ? String(reason || '').trim() : '';
    boy.isActive = applicationStatus === 'approved';
    if (applicationStatus === 'rejected') {
        boy.isAvailable = false;
        boy.status = 'offline';
    }
    await boy.save();

    try {
        if (applicationStatus === 'approved') {
            await sendEmail({
                to: boy.email,
                subject: 'Delivery account approved',
                text: 'Your delivery account has been approved. You can now log in.',
                html: '<p>Your delivery account has been <strong>approved</strong>. You can now log in.</p>',
            });
        } else {
            await sendEmail({
                to: boy.email,
                subject: 'Delivery account rejected',
                text: `Your delivery account was rejected.${boy.rejectionReason ? ` Reason: ${boy.rejectionReason}` : ''}`,
                html: `<p>Your delivery account was <strong>rejected</strong>.${boy.rejectionReason ? ` Reason: ${boy.rejectionReason}` : ''}</p>`,
            });
        }
    } catch (err) {
        console.warn(`[Delivery Approval Email] Failed for ${boy.email}: ${err.message}`);
    }

    await createNotification({
        recipientId: boy._id,
        recipientType: 'delivery',
        title: `Application ${applicationStatus}`,
        message:
            applicationStatus === 'approved'
                ? 'Your delivery account has been approved by admin.'
                : `Your delivery account was rejected${boy.rejectionReason ? `: ${boy.rejectionReason}` : '.'}`,
        type: 'system',
        data: {
            applicationStatus,
            reason: boy.rejectionReason || '',
        },
    });

    const refreshed = await DeliveryBoy.findById(boy._id).select('-password -payoutDetails.accountNumber -payoutDetails.upiId');
    res.status(200).json(
        new ApiResponse(200, refreshed, `Delivery registration ${applicationStatus} successfully`)
    );
});

/**
 * @desc    Update delivery boy details
 * @route   PUT /api/admin/delivery-boys/:id
 * @access  Private (Admin)
 */
export const updateDeliveryBoy = asyncHandler(async (req, res) => {
    const { name, email, phone, address, vehicleType, vehicleNumber, isActive } = req.body;

    const existing = await DeliveryBoy.findOne({
        _id: { $ne: req.params.id },
        $or: [{ email }, { phone }]
    });
    if (existing) {
        throw new ApiError(409, 'User with email or phone already exists');
    }

    const payload = {
        name,
        email,
        phone,
        address,
        vehicleType,
        vehicleNumber,
    };
    if (typeof isActive === 'boolean') payload.isActive = isActive;

    const boy = await DeliveryBoy.findByIdAndUpdate(
        req.params.id,
        payload,
        { new: true, runValidators: true }
    ).select('-password -payoutDetails.accountNumber -payoutDetails.upiId');

    if (!boy) {
        throw new ApiError(404, 'Delivery boy not found');
    }

    res.status(200).json(
        new ApiResponse(200, boy, 'Delivery boy updated successfully')
    );
});

/**
 * @desc    Delete a delivery boy
 * @route   DELETE /api/admin/delivery-boys/:id
 * @access  Private (Admin)
 */
export const deleteDeliveryBoy = asyncHandler(async (req, res) => {
    const boy = await DeliveryBoy.findById(req.params.id);
    if (!boy) {
        throw new ApiError(404, 'Delivery boy not found');
    }

    const activeAssignments = await Order.countDocuments({
        deliveryBoyId: boy._id,
        status: { $in: ['pending', 'processing', 'shipped'] },
        isDeleted: { $ne: true },
    });

    if (activeAssignments > 0) {
        throw new ApiError(409, 'Cannot delete delivery boy with active assigned orders');
    }

    await DeliveryBoy.findByIdAndDelete(req.params.id);

    res.status(200).json(
        new ApiResponse(200, null, 'Delivery boy deleted successfully')
    );
});

/**
 * @desc    Settle cash in hand for a delivery boy (Initiated by Admin)
 * @route   POST /api/admin/delivery-boys/:id/settle-cash
 * @access  Private (Admin)
 */
export const settleCash = asyncHandler(async (req, res) => {
    const { settlementId, amount, settlementMethod = 'cash', referenceNumber = '', notes = '' } = req.body;
    const deliveryBoyId = req.params.id;

    const result = await completeCashSettlement({
        settlementId,
        deliveryBoyId,
        amount,
        settlementMethod,
        referenceNumber,
        notes,
        adminId: req.user?.id,
    });

    res.status(200).json(
        new ApiResponse(
            200,
            {
                settlement: result.settlement,
                settledAmount: result.settlement.amount,
                newCashInHand: result.newCashInHand,
            },
            `Cash settlement of ₹${result.settlement.amount} completed successfully.`
        )
    );
});



/**
 * @desc    Get all rider cash settlement requests for Admin
 * @route   GET /api/admin/delivery-settlements
 * @access  Private (Admin)
 */
export const getDeliverySettlements = asyncHandler(async (req, res) => {
    // Run stale pending request cleanup across all riders first
    await autoCleanupStalePendingRequests();

    const { page = 1, limit = 20, status = 'all', search = '' } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
    const skip = (numericPage - 1) * numericLimit;

    const filter = {};
    if (status && status !== 'all') {
        filter.status = status;
    }

    if (search) {
        const matchingBoys = await DeliveryBoy.find({
            $or: [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
            ],
        }).select('_id');
        filter.deliveryBoyId = { $in: matchingBoys.map((b) => b._id) };
    }

    const [rawSettlements, total] = await Promise.all([
        DeliveryCashSettlement.find(filter)
            .populate('deliveryBoyId', 'name email phone vehicleType vehicleNumber')
            .populate('receivedBy', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        DeliveryCashSettlement.countDocuments(filter),
    ]);

    // Enrich settlements with live Cash In Hand and invalid/stale status flag.
    // Resolved in ONE grouped aggregation for the whole page rather than one
    // aggregation per row, which made this endpoint scale with the fleet size.
    const pageRiderIds = rawSettlements
        .map((item) => item.deliveryBoyId?._id || item.deliveryBoyId)
        .filter(Boolean);
    const cashByRider = await calculateRiderCashInHandBulk(pageRiderIds);

    const settlements = rawSettlements.map((item) => {
        const riderId = item.deliveryBoyId?._id || item.deliveryBoyId;
        const currentCashInHand = Math.max(0, Number(cashByRider.get(String(riderId)) ?? 0));
        const isInvalid = item.status === 'pending' && item.amount > currentCashInHand;

        if (item.deliveryBoyId && typeof item.deliveryBoyId === 'object') {
            item.deliveryBoyId.cashInHand = currentCashInHand;
        }

        return {
            ...item,
            riderCashInHand: currentCashInHand,
            isInvalid,
            invalidReason: isInvalid
                ? `Requested amount (₹${item.amount}) exceeds rider's current available Cash In Hand (₹${currentCashInHand}).`
                : null,
        };
    });

    res.status(200).json(
        new ApiResponse(
            200,
            {
                settlements,
                pagination: {
                    total,
                    page: numericPage,
                    limit: numericLimit,
                    pages: Math.ceil(total / numericLimit) || 1,
                },
            },
            'Delivery settlements fetched successfully.'
        )
    );
});

/**
 * @desc    Reject a rider settlement request (Admin)
 * @route   POST /api/admin/delivery-settlements/:id/reject
 * @access  Private (Admin)
 */
export const rejectDeliveryCashSettlementHandler = asyncHandler(async (req, res) => {
    const { reason } = req.body;
    const settlement = await rejectCashSettlement({
        settlementId: req.params.id,
        reason,
        adminId: req.user?.id,
    });

    res.status(200).json(
        new ApiResponse(200, settlement, 'Settlement request rejected successfully.')
    );
});

/**
 * @desc    Cancel a rider settlement request (Admin)
 * @route   POST /api/admin/delivery-settlements/:id/cancel
 * @access  Private (Admin)
 */
export const cancelDeliveryCashSettlementHandler = asyncHandler(async (req, res) => {
    const { reason } = req.body;
    const settlement = await cancelCashSettlement({
        settlementId: req.params.id,
        reason: reason || 'Cancelled by Admin: Stale request or insufficient rider cash in hand.',
        adminId: req.user?.id,
    });

    res.status(200).json(
        new ApiResponse(200, settlement, 'Settlement request cancelled successfully.')
    );
});

/**
 * @desc    Update delivery boy experience enrolment (e.g. marketplace, quick_commerce)
 * @route   PUT /api/admin/delivery-boys/:id/experiences
 * @access  Private (Admin)
 */
export const updateDeliveryBoyExperiences = asyncHandler(async (req, res) => {
    const { experiences } = req.body;
    const { id } = req.params;

    const boy = await DeliveryBoy.findById(id);
    if (!boy) {
        throw new ApiError(404, 'Delivery boy not found.');
    }

    const currentExperiences = Array.isArray(boy.experiences) ? boy.experiences : ['marketplace'];
    const removingQuickCommerce = currentExperiences.includes('quick_commerce') && !experiences.includes('quick_commerce');

    if (removingQuickCommerce) {
        // Guard: Rider cannot be unenrolled from Quick Commerce if they hold an active QC order
        const activeQcOrder = await Order.findOne({
            deliveryBoyId: id,
            experience: 'quick_commerce',
            status: { $in: ['accepted', 'preparing', 'ready', 'picked_up', 'arriving'] },
        });

        if (activeQcOrder || boy.activeOrderId) {
            throw new ApiError(400, 'Cannot remove Quick Commerce enrolment from a rider who holds an active Quick Commerce order.');
        }
    }

    boy.experiences = experiences;
    await boy.save();

    res.status(200).json(new ApiResponse(200, boy, 'Rider experience enrolment updated.'));
});

/**
 * @desc    Bulk update delivery boys experience enrolment
 * @route   PUT /api/admin/delivery-boys/bulk-experiences
 * @access  Private (Admin)
 */
export const bulkUpdateDeliveryBoyExperiences = asyncHandler(async (req, res) => {
    const { deliveryBoyIds, experiences } = req.body;

    const boys = await DeliveryBoy.find({ _id: { $in: deliveryBoyIds } });
    if (!boys.length) {
        throw new ApiError(404, 'No delivery boys found.');
    }

    const updatedIds = [];
    const skippedIds = [];

    for (const boy of boys) {
        const currentExperiences = Array.isArray(boy.experiences) ? boy.experiences : ['marketplace'];
        const removingQuickCommerce = currentExperiences.includes('quick_commerce') && !experiences.includes('quick_commerce');

        if (removingQuickCommerce) {
            const activeQcOrder = await Order.findOne({
                deliveryBoyId: boy._id,
                experience: 'quick_commerce',
                status: { $in: ['accepted', 'preparing', 'ready', 'picked_up', 'arriving'] },
            });
            if (activeQcOrder || boy.activeOrderId) {
                skippedIds.push(String(boy._id));
                continue;
            }
        }

        boy.experiences = experiences;
        await boy.save();
        updatedIds.push(String(boy._id));
    }

    res.status(200).json(new ApiResponse(200, { updatedIds, skippedIds }, `Enrolled ${updatedIds.length} riders.`));
});
