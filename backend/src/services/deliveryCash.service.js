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
 *
 * The net is returned SIGNED. A negative result means more has been settled than
 * was ever collected — an accounting fault that must surface rather than be
 * clamped away, because clamping hides the very over-settlement that the
 * ADJUSTMENT/REVERSAL entries exist to correct.
 *
 * Callers that need the "how much may be settled" figure should use
 * `calculateRiderSettleableCash`, which floors at zero deliberately.
 */
export const calculateRiderCashInHand = async (deliveryBoyId, session = null) => {
    if (!deliveryBoyId || !mongoose.isValidObjectId(deliveryBoyId)) return 0;

    const pipeline = [
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
    ];

    const query = DeliveryCashLedger.aggregate(pipeline);
    if (session) query.session(session);
    const result = await query;

    if (!result || result.length === 0) return 0;

    const netCash = Number(result[0].totalCredit || 0) - Number(result[0].totalDebit || 0);
    return Number(netCash.toFixed(2));
};

/** Cash a rider may actually hand over — never negative. */
export const calculateRiderSettleableCash = async (deliveryBoyId, session = null) =>
    Math.max(0, await calculateRiderCashInHand(deliveryBoyId, session));

/**
 * Batch variant of `calculateRiderCashInHand`.
 *
 * The admin settlement queue previously ran one aggregation per row plus one
 * per rider during cleanup, so opening the screen scaled with the fleet. This
 * resolves every requested rider in a single grouped aggregation.
 *
 * @param {Array<string|ObjectId>} deliveryBoyIds
 * @returns {Promise<Map<string, number>>} riderId → signed net cash
 */
export const calculateRiderCashInHandBulk = async (deliveryBoyIds = []) => {
    const validIds = [...new Set(
        (deliveryBoyIds || [])
            .filter((id) => id && mongoose.isValidObjectId(id))
            .map((id) => String(id))
    )];

    const map = new Map(validIds.map((id) => [id, 0]));
    if (validIds.length === 0) return map;

    const rows = await DeliveryCashLedger.aggregate([
        { $match: { deliveryBoyId: { $in: validIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
        {
            $group: {
                _id: '$deliveryBoyId',
                totalCredit: { $sum: { $cond: [{ $eq: ['$direction', 'CREDIT'] }, '$amount', 0] } },
                totalDebit: { $sum: { $cond: [{ $eq: ['$direction', 'DEBIT'] }, '$amount', 0] } },
            },
        },
    ]);

    rows.forEach((row) => {
        const net = Number(row.totalCredit || 0) - Number(row.totalDebit || 0);
        map.set(String(row._id), Number(net.toFixed(2)));
    });

    return map;
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

    if (riderIds.length === 0) return;

    // One grouped aggregation for the whole batch instead of one per rider.
    const cashByRider = await calculateRiderCashInHandBulk(riderIds);

    const pendingRequests = await DeliveryCashSettlement.find({
        deliveryBoyId: { $in: riderIds },
        status: 'pending',
    })
        .sort({ requestedAt: 1 })
        .lean();

    const staleIds = [];
    const runningByRider = new Map();

    for (const request of pendingRequests) {
        const riderKey = String(request.deliveryBoyId);
        const available = Math.max(0, Number(cashByRider.get(riderKey) ?? 0));
        const running = Number(runningByRider.get(riderKey) || 0) + Number(request.amount || 0);
        runningByRider.set(riderKey, running);

        if (running > available || Number(request.amount || 0) > available) {
            staleIds.push(request._id);
        }
    }

    if (staleIds.length === 0) return;

    await DeliveryCashSettlement.updateMany(
        { _id: { $in: staleIds }, status: 'pending' },
        {
            $set: {
                status: 'cancelled',
                rejectionReason:
                    'Settlement request became invalid because the requested cash amount was already settled or is no longer available.',
                rejectedAt: new Date(),
            },
        }
    );
};

/**
 * Check if a rider can accept a new COD order without exceeding the max cash limit.
 */
export const checkRiderCanAcceptCod = async (deliveryBoyId, additionalAmount = 0) => {
    const cashInHand = await calculateRiderSettleableCash(deliveryBoyId);
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
/**
 * Durable wrapper around `recordCodCollection`.
 *
 * COD capture runs after the order is already saved as delivered, so a failure
 * here used to be swallowed by a bare `.catch()` — the rider kept the cash with
 * no ledger row, no limit enforcement, and nothing to reconcile against. The
 * capture is now handed to the platform's persistent retry queue on failure and
 * escalated to an admin if it exhausts its attempts.
 *
 * Never throws: the delivery itself must not fail because bookkeeping did.
 */
export const recordCodCollectionDurable = async ({ order, deliveryBoyId }) => {
    try {
        return await recordCodCollection({ order, deliveryBoyId });
    } catch (err) {
        console.error(
            `[DeliveryCash] COD capture failed for order ${order?.orderId || order?._id}: ${err?.message}`
        );
        const { enqueue } = await import('./events/RetryQueueService.js');
        await enqueue(COD_CAPTURE_JOB, {
            orderId: String(order?._id || ''),
            deliveryBoyId: String(deliveryBoyId || order?.deliveryBoyId || ''),
        }).catch(() => null);
        return null;
    }
};

/** Job type used by the persistent retry queue for COD capture replays. */
export const COD_CAPTURE_JOB = 'deliveryCash.recordCodCollection';

/**
 * Retry handler for a failed COD capture. Re-reads the order so it always acts
 * on current state, and relies on the unique (orderId, COD_COLLECTION) index for
 * idempotency — a replay after a partially successful attempt is a no-op.
 */
export const handleCodCaptureRetry = async (payload = {}) => {
    const { orderId, deliveryBoyId } = payload;
    if (!orderId || !mongoose.isValidObjectId(orderId)) return;

    const order = await Order.findById(orderId);
    if (!order) return;

    await recordCodCollection({ order, deliveryBoyId: deliveryBoyId || order.deliveryBoyId });
};

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

    const currentCashInHand = await calculateRiderSettleableCash(deliveryBoyId);

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
    const currentCashInHand = await calculateRiderSettleableCash(riderId);

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
    let ledgerEntry = null;

    // ── Atomic write set ──────────────────────────────────────────────────────
    // The settlement transition, the DEBIT that actually reduces Cash In Hand,
    // the order flags, and the lifetime counter must land together. Previously
    // only the transition was atomic: if the ledger insert failed afterwards the
    // settlement read as completed while the cash was never debited, leaving the
    // rider's balance inflated and the same cash settleable a second time.
    const dbSession = await mongoose.startSession();
    try {
        await dbSession.withTransaction(async () => {
            if (settlementDoc) {
                // Only transition if the status is STILL 'pending' — a second
                // admin racing this call gets null and a 409.
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
                    { new: true, session: dbSession }
                );

                if (!updatedSettlement) {
                    throw new ApiError(409, 'Settlement request was already processed by another admin or process.');
                }
            } else {
                const unsettledOrders = await Order.find({
                    deliveryBoyId: riderId,
                    status: 'delivered',
                    paymentMethod: { $in: ['cod', 'cash'] },
                    isCashSettled: { $ne: true },
                    isDeleted: { $ne: true },
                })
                    .select('_id')
                    .session(dbSession);

                const [created] = await DeliveryCashSettlement.create([{
                    settlementNumber: generateSettlementNumber(),
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
                }], { session: dbSession });
                updatedSettlement = created;
            }

            // Immutable ledger DEBIT — this is what reduces Cash In Hand.
            const [entry] = await DeliveryCashLedger.create([{
                deliveryBoyId: riderId,
                amount: Number(settleAmount.toFixed(2)),
                type: ledgerType,
                direction: 'DEBIT',
                settlementId: updatedSettlement._id,
                referenceNumber: refNum || null,
                createdBy: adminId || null,
                createdByType: adminId ? 'admin' : 'system',
                notes: `Cash settlement ${updatedSettlement.settlementNumber} confirmed by Admin`,
            }], { session: dbSession });
            ledgerEntry = entry;

            // Mark orders settled only once the rider's cash is fully cleared.
            if (cashAfter === 0 && Array.isArray(updatedSettlement.orderIds) && updatedSettlement.orderIds.length > 0) {
                await Order.updateMany(
                    { _id: { $in: updatedSettlement.orderIds }, isCashSettled: { $ne: true } },
                    { $set: { isCashSettled: true, settledAt: new Date() } },
                    { session: dbSession }
                );
            }

            await DeliveryBoy.findByIdAndUpdate(
                riderId,
                { $inc: { cashCollected: Number(settleAmount.toFixed(2)) } },
                { session: dbSession }
            );
        });
    } finally {
        await dbSession.endSession();
    }

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
 * Post a manual correction against a rider's COD cash ledger.
 *
 * The ledger is append-only, so a mistaken COD capture is never edited — it is
 * offset by a new signed entry. Without this the `ADJUSTMENT` and `REVERSAL`
 * types declared on the model were unreachable, which meant a wrongly captured
 * collection made the rider permanently liable for cash they never held.
 *
 * @param {object}  params
 * @param {string}  params.deliveryBoyId
 * @param {number}  params.amount     Signed: positive increases the rider's
 *                                    liability, negative reduces it.
 * @param {string}  params.reason     Mandatory — this is the audit record.
 * @param {string}  [params.type]     'ADJUSTMENT' (default) or 'REVERSAL'.
 * @param {string}  [params.orderId]  Optional order the correction relates to.
 * @param {string}  params.adminId
 */
export const postCashAdjustment = async ({
    deliveryBoyId,
    amount,
    reason,
    type = 'ADJUSTMENT',
    orderId = null,
    adminId,
}) => {
    if (!deliveryBoyId || !mongoose.isValidObjectId(deliveryBoyId)) {
        throw new ApiError(400, 'A valid delivery partner is required.');
    }

    const signedAmount = Number(amount);
    if (!Number.isFinite(signedAmount) || signedAmount === 0) {
        throw new ApiError(400, 'Adjustment amount must be a non-zero number.');
    }

    const trimmedReason = String(reason || '').trim();
    if (trimmedReason.length < 5) {
        throw new ApiError(400, 'A reason of at least 5 characters is required for every cash adjustment.');
    }

    const normalizedType = String(type || 'ADJUSTMENT').toUpperCase();
    if (!['ADJUSTMENT', 'REVERSAL'].includes(normalizedType)) {
        throw new ApiError(400, 'Adjustment type must be ADJUSTMENT or REVERSAL.');
    }

    if (orderId && !mongoose.isValidObjectId(orderId)) {
        throw new ApiError(400, 'Invalid order reference for this adjustment.');
    }

    const rider = await DeliveryBoy.findById(deliveryBoyId).select('name');
    if (!rider) throw new ApiError(404, 'Delivery partner not found.');

    // A positive adjustment increases what the rider owes (CREDIT); a negative
    // one writes it off (DEBIT). The ledger stores magnitude plus direction.
    const entry = await DeliveryCashLedger.create({
        deliveryBoyId,
        amount: Number(Math.abs(signedAmount).toFixed(2)),
        type: normalizedType,
        direction: signedAmount > 0 ? 'CREDIT' : 'DEBIT',
        orderId: orderId || null,
        createdBy: adminId || null,
        createdByType: adminId ? 'admin' : 'system',
        notes: trimmedReason,
    });

    const newCashInHand = await calculateRiderCashInHand(deliveryBoyId);

    createNotification({
        recipientId: deliveryBoyId,
        recipientType: 'delivery',
        title: signedAmount > 0 ? 'Cash Adjustment Applied' : 'Cash Adjustment Credited',
        message: `A ${normalizedType.toLowerCase()} of ₹${Math.abs(signedAmount).toFixed(2)} was applied to your cash ledger. Your Cash In Hand is now ₹${newCashInHand.toFixed(2)}. Reason: ${trimmedReason}`,
        type: 'system',
        category: 'SYSTEM',
        data: {
            ledgerEntryId: String(entry._id),
            adjustmentType: normalizedType,
            amount: String(signedAmount),
            newCashInHand: String(newCashInHand),
        },
    }).catch(() => null);

    return { entry, newCashInHand };
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

