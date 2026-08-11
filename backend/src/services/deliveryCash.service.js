import mongoose from 'mongoose';
import DeliveryCashLedger from '../models/DeliveryCashLedger.model.js';
import DeliveryCashSettlement from '../models/DeliveryCashSettlement.model.js';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import Order from '../models/Order.model.js';
import Settings from '../models/Settings.model.js';
import { ApiError } from '../utils/ApiError.js';
import { createNotification } from './notification.service.js';

export const DEFAULT_MAX_COD_CASH_LIMIT = 5000;

/**
 * Fetch the admin-configured maximum COD cash limit (default: ₹5,000).
 */
export const getMaxCodCashLimit = async () => {
    try {
        const settingDoc = await Settings.findOne({ key: 'delivery' }).lean();
        const limit = Number(settingDoc?.value?.maxCodCashLimit);
        if (!Number.isNaN(limit) && limit >= 0) {
            return limit;
        }
    } catch (err) {
        console.warn(`[DeliveryCashService] Failed to read delivery settings: ${err.message}`);
    }
    return DEFAULT_MAX_COD_CASH_LIMIT;
};

/**
 * Calculate the authoritative current Cash In Hand for a rider from the ledger.
 * Formula: SUM(CREDIT) - SUM(DEBIT)
 */
export const calculateRiderCashInHand = async (deliveryBoyId) => {
    if (!deliveryBoyId || !mongoose.isValidObjectId(deliveryBoyId)) return 0;

    const result = await DeliveryCashLedger.aggregate([
        { $match: { deliveryBoyId: new mongoose.Types.ObjectId(deliveryBoyId) } },
        {
            $group: {
                _id: null,
                totalCredit: {
                    $sum: { $cond: [{ $eq: ['$direction', 'CREDIT'] }, '$amount', 0] },
                },
                totalDebit: {
                    $sum: { $cond: [{ $eq: ['$direction', 'DEBIT'] }, '$amount', 0] },
                },
            },
        },
    ]);

    if (!result || result.length === 0) return 0;

    const netCash = Number(result[0].totalCredit || 0) - Number(result[0].totalDebit || 0);
    return Math.max(0, Number(netCash.toFixed(2)));
};

/**
 * Calculate the total pending settlement amount for active requests of a rider.
 */
export const calculateRiderPendingSettlementTotal = async (deliveryBoyId) => {
    if (!deliveryBoyId || !mongoose.isValidObjectId(deliveryBoyId)) return 0;

    const result = await DeliveryCashSettlement.aggregate([
        { $match: { deliveryBoyId: new mongoose.Types.ObjectId(deliveryBoyId), status: 'pending' } },
        {
            $group: {
                _id: null,
                totalPending: { $sum: '$amount' },
            },
        },
    ]);

    if (!result || result.length === 0) return 0;
    return Number(result[0].totalPending || 0);
};

/**
 * Auto-cleanup helper: Cancels any pending settlement request whose amount exceeds live available cash.
 * If deliveryBoyId is omitted, performs cleanup across all riders with active pending requests.
 */
export const autoCleanupStalePendingRequests = async (deliveryBoyId = null) => {
    let riderIds = [];
    if (deliveryBoyId && mongoose.isValidObjectId(deliveryBoyId)) {
        riderIds = [deliveryBoyId];
    } else {
        const rawIds = await DeliveryCashSettlement.distinct('deliveryBoyId', { status: 'pending' });
        riderIds = (rawIds || []).filter(Boolean);
    }

    for (const rId of riderIds) {
        const currentCashInHand = await calculateRiderCashInHand(rId);
        const pendingRequests = await DeliveryCashSettlement.find({
            deliveryBoyId: rId,
            status: 'pending',
        }).sort({ requestedAt: 1 });

        let runningTotal = 0;
        for (const req of pendingRequests) {
            runningTotal += Number(req.amount || 0);
            if (runningTotal > currentCashInHand || Number(req.amount || 0) > currentCashInHand) {
                req.status = 'cancelled';
                req.rejectionReason =
                    'Settlement request became invalid because the requested cash amount was already settled or is no longer available.';
                req.rejectedAt = new Date();
                await req.save();
            }
        }
    }
};

/**
 * Check if a rider can accept a new COD order without exceeding the max cash limit.
 */
export const checkRiderCanAcceptCod = async (deliveryBoyId, additionalAmount = 0) => {
    const cashInHand = await calculateRiderCashInHand(deliveryBoyId);
    const limit = await getMaxCodCashLimit();
    const prospectiveCash = Number((cashInHand + Number(additionalAmount || 0)).toFixed(2));

    const allowed = prospectiveCash <= limit;
    return {
        allowed,
        cashInHand,
        limit,
        prospectiveCash,
    };
};

/**
 * Idempotently record a COD collection entry when an order is delivered.
 * Authoritative COD payable amount: `order.total`
 */
export const recordCodCollection = async ({ order, deliveryBoyId }) => {
    if (!order) return null;

    const isCod = ['cod', 'cash'].includes(String(order.paymentMethod || '').toLowerCase());
    if (!isCod) return null;

    const riderId = deliveryBoyId || order.deliveryBoyId;
    if (!riderId) return null;

    const orderId = order._id;

    // 1. Idempotency Check: Don't create duplicate ledger entry
    const existing = await DeliveryCashLedger.findOne({
        orderId,
        type: 'COD_COLLECTION',
    });

    if (existing) {
        return existing;
    }

    const payableAmount = Number(order.total || 0);
    if (payableAmount <= 0) return null;

    try {
        const ledgerEntry = await DeliveryCashLedger.create({
            deliveryBoyId: riderId,
            amount: payableAmount,
            type: 'COD_COLLECTION',
            direction: 'CREDIT',
            orderId,
            createdByType: 'system',
            notes: `COD collection for order ${order.orderId || orderId}`,
        });

        // Check if rider reached/exceeded cash limit & send warning notification
        const { allowed, cashInHand, limit } = await checkRiderCanAcceptCod(riderId);
        if (!allowed) {
            createNotification({
                recipientId: riderId,
                recipientType: 'delivery',
                title: '⚠️ COD Limit Reached',
                message: `Your Cash In Hand (₹${cashInHand}) has reached or exceeded your limit (₹${limit}). Please settle your pending cash with Admin.`,
                type: 'system',
                category: 'SYSTEM',
                data: {
                    cashInHand: String(cashInHand),
                    limit: String(limit),
                },
            }).catch(() => null);
        }

        return ledgerEntry;
    } catch (err) {
        // Mongo duplicate key error on (orderId + COD_COLLECTION) index means another process created it concurrently
        if (err.code === 11000) {
            return DeliveryCashLedger.findOne({ orderId, type: 'COD_COLLECTION' });
        }
        throw err;
    }
};

/**
 * Generate unique settlement receipt number (e.g. DCS-20260811-9A2F).
 */
export const generateSettlementNumber = () => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `DCS-${dateStr}-${rand}`;
};

/**
 * Create a settlement request initiated by a Delivery Partner.
 */
export const requestCashSettlement = async ({
    deliveryBoyId,
    amount,
    settlementMethod = 'cash',
    referenceNumber = '',
    notes = '',
}) => {
    if (!deliveryBoyId || !mongoose.isValidObjectId(deliveryBoyId)) {
        throw new ApiError(400, 'Invalid delivery boy ID.');
    }

    const requestedAmount = Number(amount);
    if (Number.isNaN(requestedAmount) || requestedAmount <= 0) {
        throw new ApiError(400, 'Settlement amount must be a positive number.');
    }

    const method = String(settlementMethod).toLowerCase();
    if (!['cash', 'upi', 'bank_transfer'].includes(method)) {
        throw new ApiError(400, 'Settlement method must be one of: cash, upi, bank_transfer.');
    }

    const refNum = String(referenceNumber || '').trim();
    if (['upi', 'bank_transfer'].includes(method) && (!refNum || refNum.length < 3)) {
        throw new ApiError(400, `Reference / UTR number is required for ${method.replace('_', ' ').toUpperCase()} settlements.`);
    }

    // Auto cleanup any existing stale pending requests first
    await autoCleanupStalePendingRequests(deliveryBoyId);

    // Enforce ONLY ONE active/pending settlement request at a time
    const existingPending = await DeliveryCashSettlement.findOne({
        deliveryBoyId,
        status: 'pending',
    }).select('settlementNumber amount status requestedAt');

    if (existingPending) {
        throw new ApiError(
            400,
            'An active settlement request already exists. Please wait for Admin to review it before creating another request.'
        );
    }

    const currentCashInHand = await calculateRiderCashInHand(deliveryBoyId);

    if (requestedAmount > currentCashInHand) {
        throw new ApiError(
            400,
            `Settlement amount (₹${requestedAmount}) cannot exceed available Cash In Hand (₹${currentCashInHand}).`
        );
    }

    // Find unsettled delivered COD orders to associate with this settlement
    const unsettledOrders = await Order.find({
        deliveryBoyId,
        status: 'delivered',
        paymentMethod: { $in: ['cod', 'cash'] },
        isCashSettled: { $ne: true },
        isDeleted: { $ne: true },
    }).select('_id');

    const orderIds = unsettledOrders.map((o) => o._id);

    try {
        const settlement = await DeliveryCashSettlement.create({
            settlementNumber: generateSettlementNumber(),
            deliveryBoyId,
            amount: Number(requestedAmount.toFixed(2)),
            settlementMethod: method,
            status: 'pending',
            orderIds,
            cashCollectedBeforeSettlement: currentCashInHand,
            cashCollectedAfterSettlement: currentCashInHand, // Does NOT change until Admin confirms!
            referenceNumber: refNum || null,
            notes: String(notes || '').trim(),
            requestedAt: new Date(),
        });

        // Notify Admin of new settlement request
        const rider = await DeliveryBoy.findById(deliveryBoyId).select('name');
        createNotification({
            recipientId: deliveryBoyId,
            recipientType: 'admin',
            title: '💰 COD Settlement Requested',
            message: `${rider?.name || 'Delivery Partner'} requested a ${method.toUpperCase()} settlement of ₹${settlement.amount}.`,
            type: 'system',
            category: 'SYSTEM',
            data: {
                settlementId: String(settlement._id),
                settlementNumber: settlement.settlementNumber,
                amount: String(settlement.amount),
                method: settlement.settlementMethod,
            },
        }).catch(() => null);

        return settlement;
    } catch (err) {
        // Catch MongoDB partial unique index error (code 11000) for race conditions
        if (err.code === 11000) {
            throw new ApiError(
                400,
                'An active settlement request already exists. Please wait for Admin to review it before creating another request.'
            );
        }
        throw err;
    }
};

/**
 * Approve & complete a rider cash settlement (Initiated by Admin).
 * Uses ATOMIC DB-level status transition ({ status: 'pending' } -> { status: 'completed' })
 * to guarantee that only ONE admin/process can confirm a settlement and create exactly ONE DEBIT ledger entry.
 */
export const completeCashSettlement = async ({
    settlementId,
    deliveryBoyId,
    amount,
    settlementMethod = 'cash',
    referenceNumber = '',
    notes = '',
    adminId,
}) => {
    let settlementDoc = null;

    if (!settlementId && deliveryBoyId) {
        // Auto-link: Check if rider already has an active pending settlement request
        const existingPending = await DeliveryCashSettlement.findOne({
            deliveryBoyId,
            status: 'pending',
        });

        if (existingPending) {
            const alreadySettledOrders = await Order.countDocuments({
                _id: { $in: existingPending.orderIds },
                isCashSettled: true,
            });

            if (alreadySettledOrders === 0) {
                settlementId = existingPending._id;
                settlementDoc = existingPending;
            }
        }
    }

    if (settlementId && !settlementDoc) {
        settlementDoc = await DeliveryCashSettlement.findById(settlementId);
        if (!settlementDoc) {
            throw new ApiError(404, 'Settlement request not found.');
        }
        if (settlementDoc.status !== 'pending') {
            throw new ApiError(400, `Cannot complete settlement with status '${settlementDoc.status}'.`);
        }
    }

    const riderId = settlementDoc ? settlementDoc.deliveryBoyId : deliveryBoyId;
    if (!riderId || !mongoose.isValidObjectId(riderId)) {
        throw new ApiError(400, 'Invalid delivery boy ID.');
    }

    const rider = await DeliveryBoy.findById(riderId);
    if (!rider) {
        throw new ApiError(404, 'Delivery boy not found.');
    }

    const settleAmount = Number(settlementDoc ? settlementDoc.amount : (amount || 0));
    if (Number.isNaN(settleAmount) || settleAmount <= 0) {
        throw new ApiError(400, 'Settlement amount must be a positive number.');
    }

    // Pre-Confirmation Validation: Recalculate live Cash In Hand from ledger
    const currentCashInHand = await calculateRiderCashInHand(riderId);

    // If requested amount > available live cash in hand, auto-cancel the stale request
    if (settleAmount > currentCashInHand) {
        if (settlementDoc) {
            await DeliveryCashSettlement.findOneAndUpdate(
                { _id: settlementId, status: 'pending' },
                {
                    $set: {
                        status: 'cancelled',
                        rejectionReason: 'Settlement request became invalid because the requested cash amount was already settled or is no longer available.',
                        receivedBy: adminId || null,
                    },
                }
            );
        }
        throw new ApiError(
            400,
            `Settlement cannot be confirmed because the rider's available Cash In Hand (₹${currentCashInHand}) is insufficient. The requested amount may already have been settled. Request has been cancelled.`
        );
    }

    const method = settlementDoc ? settlementDoc.settlementMethod : String(settlementMethod || 'cash').toLowerCase();
    const refNum = settlementDoc ? (settlementDoc.referenceNumber || referenceNumber) : String(referenceNumber || '').trim();

    if (['upi', 'bank_transfer'].includes(method) && (!refNum || refNum.length < 3)) {
        throw new ApiError(400, `Reference / UTR number is required for ${method.replace('_', ' ').toUpperCase()} settlements.`);
    }

    const ledgerTypeMap = {
        cash: 'CASH_SETTLEMENT',
        upi: 'UPI_SETTLEMENT',
        bank_transfer: 'BANK_SETTLEMENT',
    };
    const ledgerType = ledgerTypeMap[method] || 'CASH_SETTLEMENT';
    const cashAfter = Math.max(0, Number((currentCashInHand - settleAmount).toFixed(2)));

    let updatedSettlement = null;

    if (settlementDoc) {
        // ATOMIC DB TRANSITION: Only transition if status is STILL 'pending'
        updatedSettlement = await DeliveryCashSettlement.findOneAndUpdate(
            { _id: settlementId, status: 'pending' },
            {
                $set: {
                    status: 'completed',
                    receivedBy: adminId || null,
                    receivedAt: new Date(),
                    cashCollectedBeforeSettlement: currentCashInHand,
                    cashCollectedAfterSettlement: cashAfter,
                    ...(refNum ? { referenceNumber: refNum } : {}),
                    ...(notes ? { notes: String(notes).trim() } : {}),
                },
            },
            { new: true }
        );

        if (!updatedSettlement) {
            throw new ApiError(409, 'Settlement request was already processed by another admin or process.');
        }
    } else {
        const finalSettlementNumber = generateSettlementNumber();
        const unsettledOrders = await Order.find({
            deliveryBoyId: riderId,
            status: 'delivered',
            paymentMethod: { $in: ['cod', 'cash'] },
            isCashSettled: { $ne: true },
            isDeleted: { $ne: true },
        }).select('_id');

        updatedSettlement = await DeliveryCashSettlement.create({
            settlementNumber: finalSettlementNumber,
            deliveryBoyId: riderId,
            amount: Number(settleAmount.toFixed(2)),
            settlementMethod: method,
            status: 'completed',
            orderIds: unsettledOrders.map((o) => o._id),
            cashCollectedBeforeSettlement: currentCashInHand,
            cashCollectedAfterSettlement: cashAfter,
            referenceNumber: refNum || null,
            notes: String(notes || '').trim(),
            requestedAt: new Date(),
            receivedBy: adminId || null,
            receivedAt: new Date(),
        });
    }

    // Create Immutable Ledger DEBIT Entry (This is what reduces Cash In Hand!)
    const ledgerEntry = await DeliveryCashLedger.create({
        deliveryBoyId: riderId,
        amount: Number(settleAmount.toFixed(2)),
        type: ledgerType,
        direction: 'DEBIT',
        settlementId: updatedSettlement._id,
        referenceNumber: refNum || null,
        createdBy: adminId || null,
        createdByType: adminId ? 'admin' : 'system',
        notes: `Cash settlement ${updatedSettlement.settlementNumber} confirmed by Admin`,
    });

    // Mark Orders as Settled if full cash cleared or update orders
    if (cashAfter === 0 && Array.isArray(updatedSettlement.orderIds) && updatedSettlement.orderIds.length > 0) {
        await Order.updateMany(
            { _id: { $in: updatedSettlement.orderIds }, isCashSettled: { $ne: true } },
            { $set: { isCashSettled: true, settledAt: new Date() } }
        );
    }

    // Update rider lifetime cash collected counter
    await DeliveryBoy.findByIdAndUpdate(riderId, {
        $inc: { cashCollected: Number(settleAmount.toFixed(2)) },
    });

    // Send push notification to rider
    createNotification({
        recipientId: riderId,
        recipientType: 'delivery',
        title: '✅ Cash Settlement Completed',
        message: `₹${settleAmount} has been received by Admin and your Cash In Hand is now ₹${cashAfter}.`,
        type: 'system',
        category: 'SYSTEM',
        data: {
            settlementId: String(updatedSettlement._id),
            settlementNumber: updatedSettlement.settlementNumber,
            amount: String(settleAmount),
            newCashInHand: String(cashAfter),
        },
    }).catch(() => null);

    return { settlement: updatedSettlement, ledgerEntry, newCashInHand: cashAfter };
};

/**
 * Reject a rider settlement request.
 */
export const rejectCashSettlement = async ({ settlementId, reason, adminId }) => {
    if (!settlementId || !mongoose.isValidObjectId(settlementId)) {
        throw new ApiError(400, 'Invalid settlement ID.');
    }

    const rejectionReason = String(reason || '').trim();
    if (!rejectionReason || rejectionReason.length < 3) {
        throw new ApiError(400, 'Rejection reason is required (at least 3 characters).');
    }

    const updatedSettlement = await DeliveryCashSettlement.findOneAndUpdate(
        { _id: settlementId, status: 'pending' },
        {
            $set: {
                status: 'rejected',
                rejectionReason,
                rejectedAt: new Date(),
                receivedBy: adminId || null,
            },
        },
        { new: true }
    );

    if (!updatedSettlement) {
        throw new ApiError(400, 'Settlement request not found or not in pending status.');
    }

    // Send push notification to rider
    createNotification({
        recipientId: updatedSettlement.deliveryBoyId,
        recipientType: 'delivery',
        title: '⚠️ Cash Settlement Rejected',
        message: `Your settlement request (${updatedSettlement.settlementNumber}) for ₹${updatedSettlement.amount} was rejected. Reason: ${rejectionReason}`,
        type: 'system',
        category: 'SYSTEM',
        data: {
            settlementId: String(updatedSettlement._id),
            settlementNumber: updatedSettlement.settlementNumber,
            reason: rejectionReason,
        },
    }).catch(() => null);

    return updatedSettlement;
};

/**
 * Cancel a rider settlement request (Stale request handling or Admin cancellation).
 */
export const cancelCashSettlement = async ({ settlementId, reason, adminId }) => {
    if (!settlementId || !mongoose.isValidObjectId(settlementId)) {
        throw new ApiError(400, 'Invalid settlement ID.');
    }

    const cancelReason = String(reason || 'Cancelled by Admin').trim();

    const updatedSettlement = await DeliveryCashSettlement.findOneAndUpdate(
        { _id: settlementId, status: 'pending' },
        {
            $set: {
                status: 'cancelled',
                rejectionReason: cancelReason,
                receivedBy: adminId || null,
            },
        },
        { new: true }
    );

    if (!updatedSettlement) {
        throw new ApiError(400, 'Settlement request not found or not in pending status.');
    }

    // Send push notification to rider
    createNotification({
        recipientId: updatedSettlement.deliveryBoyId,
        recipientType: 'delivery',
        title: '🚫 Cash Settlement Cancelled',
        message: `Your settlement request (${updatedSettlement.settlementNumber}) for ₹${updatedSettlement.amount} was cancelled. Reason: ${cancelReason}`,
        type: 'system',
        category: 'SYSTEM',
        data: {
            settlementId: String(updatedSettlement._id),
            settlementNumber: updatedSettlement.settlementNumber,
            reason: cancelReason,
        },
    }).catch(() => null);

    return updatedSettlement;
};

