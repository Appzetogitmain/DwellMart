import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import DeliveryCashSettlement from '../../../models/DeliveryCashSettlement.model.js';
import DeliveryCashLedger from '../../../models/DeliveryCashLedger.model.js';
import mongoose from 'mongoose';
import {
    calculateRiderCashInHand,
    getMaxCodCashLimit,
    requestCashSettlement,
    autoCleanupStalePendingRequests,
} from '../../../services/deliveryCash.service.js';

/**
 * GET /api/delivery/cash-settlements/summary
 * Fetch rider's live financial summary (Cash In Hand, Pending Request, Collections, Limit)
 */
export const getCashSettlementSummary = asyncHandler(async (req, res) => {
    const deliveryBoyId = req.user.id;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const riderObjectId = new mongoose.Types.ObjectId(deliveryBoyId);

    // Auto-cleanup any stale pending requests first
    await autoCleanupStalePendingRequests(deliveryBoyId);

    const [cashInHand, maxCodCashLimit, pendingSettlement, ledgerStats, collectedTodayStats] = await Promise.all([
        calculateRiderCashInHand(deliveryBoyId),
        getMaxCodCashLimit(),
        DeliveryCashSettlement.findOne({ deliveryBoyId: riderObjectId, status: 'pending' }).lean(),
        DeliveryCashLedger.aggregate([
            { $match: { deliveryBoyId: riderObjectId } },
            {
                $group: {
                    _id: null,
                    totalCollected: {
                        $sum: { $cond: [{ $eq: ['$type', 'COD_COLLECTION'] }, '$amount', 0] },
                    },
                    totalSettled: {
                        $sum: { $cond: [{ $eq: ['$direction', 'DEBIT'] }, '$amount', 0] },
                    },
                    pendingCodOrdersCount: {
                        $sum: { $cond: [{ $eq: ['$type', 'COD_COLLECTION'] }, 1, 0] },
                    },
                },
            },
        ]),
        DeliveryCashLedger.aggregate([
            {
                $match: {
                    deliveryBoyId: riderObjectId,
                    type: 'COD_COLLECTION',
                    createdAt: { $gte: todayStart },
                },
            },
            {
                $group: {
                    _id: null,
                    totalToday: { $sum: '$amount' },
                },
            },
        ]),
    ]);

    const stats = ledgerStats?.[0] || {};
    const totalCollected = Number(stats.totalCollected || 0);
    const totalSettled = Number(stats.totalSettled || 0);
    const codCollectedToday = Number(collectedTodayStats?.[0]?.totalToday || 0);

    const summary = {
        cashInHand,
        maxCodCashLimit,
        isBlockedByLimit: cashInHand >= maxCodCashLimit,
        pendingSettlementAmount: pendingSettlement ? Number(pendingSettlement.amount || 0) : 0,
        pendingSettlement: pendingSettlement || null,
        codCollectedToday,
        totalCodCollected: totalCollected,
        totalSettled,
    };

    return res.status(200).json(new ApiResponse(200, summary, 'Cash settlement summary fetched.'));
});

/**
 * POST /api/delivery/cash-settlements/request
 * Rider requests a settlement for pending COD cash
 */
export const createCashSettlementRequest = asyncHandler(async (req, res) => {
    const { amount, settlementMethod = 'cash', referenceNumber = '', notes = '' } = req.body;

    const settlement = await requestCashSettlement({
        deliveryBoyId: req.user.id,
        amount,
        settlementMethod,
        referenceNumber,
        notes,
    });

    return res.status(201).json(new ApiResponse(201, settlement, 'Settlement request submitted successfully.'));
});

/**
 * GET /api/delivery/cash-settlements/history
 * Fetch paginated settlement history for the logged-in rider
 */
export const getCashSettlementHistory = asyncHandler(async (req, res) => {
    // Run stale pending request cleanup for this rider first
    await autoCleanupStalePendingRequests(req.user.id);

    const { page = 1, limit = 20, status } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
    const skip = (numericPage - 1) * numericLimit;

    const filter = { deliveryBoyId: req.user.id };
    if (status && status !== 'all') {
        filter.status = status;
    }

    const [settlements, total] = await Promise.all([
        DeliveryCashSettlement.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        DeliveryCashSettlement.countDocuments(filter),
    ]);

    return res.status(200).json(
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
            'Settlement history fetched successfully.'
        )
    );
});
