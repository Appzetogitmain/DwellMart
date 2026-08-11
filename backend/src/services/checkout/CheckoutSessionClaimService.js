import mongoose from 'mongoose';
import CheckoutSession from '../../models/CheckoutSession.model.js';
import Order from '../../models/Order.model.js';

const STALE_PROCESSING_TIMEOUT_MS = 60000; // 60 seconds

const findOrdersForSession = async (sessionIdObj) => {
    if (!sessionIdObj) return [];
    const queryIds = [sessionIdObj];
    if (typeof sessionIdObj === 'string' && mongoose.isValidObjectId(sessionIdObj)) {
        queryIds.push(new mongoose.Types.ObjectId(sessionIdObj));
    } else if (sessionIdObj instanceof mongoose.Types.ObjectId) {
        queryIds.push(String(sessionIdObj));
    }
    return Order.find({ checkoutSessionId: { $in: queryIds } }).lean();
};

/**
 * Claim exclusive processing rights for a CheckoutSession.
 * Single source of truth for verifyPayment, handleWebhook, and OrderRecoveryWorker.
 *
 * @param {string} sessionId
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=60000] - Stale processing timeout threshold
 * @returns {Promise<{ claimed: boolean, isCompleted?: boolean, isProcessing?: boolean, session: CheckoutSession, orders?: Order[], error?: string }>}
 */
export const claimCheckoutSessionForProcessing = async (
    sessionId,
    { timeoutMs = STALE_PROCESSING_TIMEOUT_MS, paymentDetails = {} } = {}
) => {
    const targetSession = await CheckoutSession.findOne({
        $or: [
            { sessionId },
            ...(mongoose.isValidObjectId(sessionId) ? [{ _id: sessionId }] : []),
            { gatewayOrderId: sessionId },
        ],
    });

    if (!targetSession) {
        return { claimed: false, error: 'SESSION_NOT_FOUND', session: null, orders: [] };
    }

    // 1. If already completed, return existing orders idempotently
    if (targetSession.status === 'completed') {
        const existingOrders = await findOrdersForSession(targetSession._id);
        return { claimed: false, isCompleted: true, session: targetSession, orders: existingOrders };
    }

    const now = new Date();
    const staleThreshold = new Date(now.getTime() - timeoutMs);

    let claimedSession = null;
    const isWriteConflict = (err) =>
        err?.code === 112 ||
        err?.codeName === 'WriteConflict' ||
        err?.errorResponse?.code === 112 ||
        err?.errorResponse?.codeName === 'WriteConflict' ||
        err?.hasErrorLabel?.('TransientTransactionError') ||
        err?.hasErrorLabel?.('UnknownTransactionCommitResult') ||
        String(err?.message || '').includes('Write conflict');

    const updateFields = {
        status: 'processing',
        processingStartedAt: now,
    };
    if (paymentDetails.paymentStatus) updateFields.paymentStatus = paymentDetails.paymentStatus;
    if (paymentDetails.gatewayReference) updateFields.gatewayReference = paymentDetails.gatewayReference;

    for (let retry = 0; retry < 10; retry++) {
        try {
            claimedSession = await CheckoutSession.findOneAndUpdate(
                {
                    _id: targetSession._id,
                    $or: [
                        { status: { $nin: ['processing', 'completed'] } },
                        { status: 'processing', $or: [{ processingStartedAt: { $lte: staleThreshold } }, { processingStartedAt: { $exists: false } }] },
                    ],
                },
                {
                    $set: updateFields,
                },
                { new: true }
            );
            break;
        } catch (err) {
            if (isWriteConflict(err) && retry < 9) {
                await new Promise((resolve) => setTimeout(resolve, 30 + Math.random() * 70));
                continue;
            }
            throw err;
        }
    }

    // 3. If atomic claim succeeded: Check if orders were ALREADY created (e.g. prior crash before completed status)
    if (claimedSession) {
        const existingOrders = await findOrdersForSession(claimedSession._id);
        if (existingOrders.length > 0) {
            // Crash recovery: Orders already exist! Mark completed idempotently without re-running splitter.
            await CheckoutSession.updateOne(
                { _id: claimedSession._id },
                {
                    $set: {
                        status: 'completed',
                        completedAt: new Date(),
                        orderIds: existingOrders.map(o => o._id),
                    },
                }
            );
            const updatedCompletedSession = await CheckoutSession.findById(claimedSession._id);
            return { claimed: false, isCompleted: true, session: updatedCompletedSession, orders: existingOrders };
        }

        return { claimed: true, session: claimedSession, orders: [] };
    }

    // 4. Atomic claim failed because another handler is actively processing.
    // Poll/wait up to 6 seconds (40 x 150ms) for completion
    for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 150));
        const polledSession = await CheckoutSession.findById(targetSession._id).lean();
        if (polledSession?.status === 'completed') {
            const existingOrders = await findOrdersForSession(targetSession._id);
            return { claimed: false, isCompleted: true, session: polledSession, orders: existingOrders };
        }
    }

    // Still processing after poll window
    const currentOrders = await findOrdersForSession(targetSession._id);
    return {
        claimed: false,
        isProcessing: true,
        session: await CheckoutSession.findById(targetSession._id).lean(),
        orders: currentOrders,
    };
};

/**
 * Safely release processing claim on error.
 * Resets status to 'pending' (or 'failed') if no orders exist, permitting clean retry.
 *
 * @param {string} sessionId
 * @param {string} failureReason
 */
export const releaseClaimOnError = async (sessionId, failureReason = 'Order creation error') => {
    const session = await CheckoutSession.findOne({
        $or: [
            { sessionId },
            ...(mongoose.isValidObjectId(sessionId) ? [{ _id: sessionId }] : []),
        ],
    });

    if (!session) return;

    const existingOrders = await findOrdersForSession(session._id);

    if (existingOrders.length > 0) {
        // Orders exist -> complete session idempotently
        await CheckoutSession.updateOne(
            { _id: session._id },
            {
                $set: {
                    status: 'completed',
                    completedAt: new Date(),
                    orderIds: existingOrders.map(o => o._id),
                },
            }
        );
    } else {
        // No orders exist -> reset to retryable status
        await CheckoutSession.updateOne(
            { _id: session._id },
            {
                $set: {
                    status: 'pending',
                    failedAt: new Date(),
                    failureReason: String(failureReason).slice(0, 500),
                },
                $unset: { processingStartedAt: 1 },
            }
        );
    }
};
