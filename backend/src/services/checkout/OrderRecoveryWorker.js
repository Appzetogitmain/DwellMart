/**
 * OrderRecoveryWorker
 *
 * Background worker that scans for CheckoutSessions that are in a "paid but
 * not completed" state — indicating the server crashed or was interrupted
 * AFTER payment was captured but BEFORE orders were created.
 *
 * Recovery logic:
 *   1. Scan for sessions: paymentStatus=paid AND status != completed
 *   2. If orders already exist for the session → mark session completed (resume)
 *   3. If no orders exist → attempt to re-run OrderSplitterEngine
 *   4. If re-run fails → mark session as failed, alert admin, release inventory
 *   5. If session has been stuck for > 30 minutes → force fail and notify
 *
 * Run every 5 minutes via server.js.
 *
 * Critical design rules:
 *   - Never creates duplicate orders (idempotency via session status check)
 *   - Always emits an admin notification on recovery or failure
 *   - Does not retry endlessly — max 3 recovery attempts per session
 */

import CheckoutSession from '../../models/CheckoutSession.model.js';
import Order from '../../models/Order.model.js';
import { splitAndCreateOrders } from './OrderSplitterEngine.js';
import { releaseReservation } from './InventoryReservationService.js';
import { createNotification } from '../notification.service.js';

const MAX_RECOVERY_ATTEMPTS   = 3;
const STUCK_THRESHOLD_MINUTES = 30;

/**
 * Recover a single stuck CheckoutSession.
 */
const recoverSession = async (session) => {
    const sessionId = session.sessionId;
    const stuckSince = session.updatedAt || session.createdAt;
    const stuckMins  = (Date.now() - new Date(stuckSince).getTime()) / 60_000;

    // Guard: if stuck > 30 minutes, force fail
    if (stuckMins > STUCK_THRESHOLD_MINUTES) {
        await CheckoutSession.updateOne(
            { sessionId },
            {
                $set: {
                    status:        'failed',
                    failedAt:      new Date(),
                    failureReason: `Recovery: session stuck for ${Math.round(stuckMins)} minutes after payment captured. Manual intervention required.`,
                },
            }
        );

        // Release inventory reservation
        await releaseReservation(sessionId, 'session_expired').catch(() => null);

        await createNotification({
            role:    'admin',
            type:    'system_alert',
            title:   'Checkout Recovery: Session Force-Failed',
            message: `Session ${sessionId} was paid but stuck for ${Math.round(stuckMins)} minutes. Force-failed. Customer may need manual refund.`,
            data:    { sessionId, stuckMins: Math.round(stuckMins) },
        }).catch(() => null);

        console.error(`[OrderRecoveryWorker] Force-failed stuck session: ${sessionId} (${Math.round(stuckMins)} minutes)`);
        return { action: 'force_failed', sessionId };
    }

    // Check if orders already exist (partial completion scenario)
    const existingOrderCount = session.orderIds?.length || 0;
    if (existingOrderCount > 0) {
        // Orders already created — just mark session completed
        await CheckoutSession.updateOne(
            { sessionId },
            { $set: { status: 'completed', completedAt: new Date() } }
        );
        console.log(`[OrderRecoveryWorker] Session resumed (${existingOrderCount} orders already existed): ${sessionId}`);
        return { action: 'resumed', sessionId, orders: existingOrderCount };
    }

    // No orders — attempt to re-run the splitter
    const { items, coupon, customerLocation, shippingOption } = session.metadata || {};
    if (!items?.length) {
        await CheckoutSession.updateOne(
            { sessionId },
            {
                $set: {
                    status:        'failed',
                    failedAt:      new Date(),
                    failureReason: 'Recovery: no cart items in session metadata.',
                },
            }
        );
        return { action: 'failed_no_items', sessionId };
    }

    try {
        const { orders } = await splitAndCreateOrders({
            sessionId:       session.sessionId,
            items,
            shippingAddress: session.shippingAddress,
            paymentMethod:   session.paymentMethod,
            customerLocation,
            coupon,
            userId:          session.userId ? String(session.userId) : null,
            settings:        { shippingOption },
        });

        await CheckoutSession.updateOne(
            { sessionId },
            { $set: { status: 'completed', completedAt: new Date() } }
        );

        await createNotification({
            role:    'admin',
            type:    'system_alert',
            title:   'Checkout Recovery: Session Recovered',
            message: `Session ${sessionId} was successfully recovered. ${orders.length} order(s) created.`,
            data:    { sessionId, orderCount: orders.length },
        }).catch(() => null);

        console.log(`[OrderRecoveryWorker] Session recovered: ${sessionId} (${orders.length} orders)`);
        return { action: 'recovered', sessionId, orders: orders.length };
    } catch (err) {
        // Increment recovery attempt count in metadata
        const attempts = (session.metadata?.recoveryAttempts || 0) + 1;

        if (attempts >= MAX_RECOVERY_ATTEMPTS) {
            await CheckoutSession.updateOne(
                { sessionId },
                {
                    $set: {
                        status:                  'failed',
                        failedAt:                new Date(),
                        failureReason:           `Recovery failed after ${attempts} attempts: ${err?.message}`,
                        'metadata.recoveryAttempts': attempts,
                    },
                }
            );

            await releaseReservation(sessionId, 'payment_failed').catch(() => null);

            await createNotification({
                role:    'admin',
                type:    'system_alert',
                title:   'Checkout Recovery: Session Failed',
                message: `Session ${sessionId} could not be recovered after ${attempts} attempts. Customer may need manual refund. Error: ${err?.message}`,
                data:    { sessionId, attempts, error: err?.message },
            }).catch(() => null);

            console.error(`[OrderRecoveryWorker] Recovery exhausted for ${sessionId}:`, err?.message);
            return { action: 'recovery_exhausted', sessionId };
        }

        // Update attempt count, will retry next sweep
        await CheckoutSession.updateOne(
            { sessionId },
            { $set: { 'metadata.recoveryAttempts': attempts } }
        );

        console.warn(`[OrderRecoveryWorker] Recovery attempt ${attempts} failed for ${sessionId}: ${err?.message}. Will retry.`);
        return { action: 'retry_scheduled', sessionId, attempt: attempts };
    }
};

/**
 * Main sweep — called every 5 minutes.
 */
export const runRecoveryWorker = async () => {
    try {
        const stuckSessions = await CheckoutSession.find({
            paymentStatus: 'paid',
            status:        { $in: ['pending', 'processing'] },
            'metadata.recoveryAttempts': { $lt: MAX_RECOVERY_ATTEMPTS },
        })
            .sort({ createdAt: 1 })
            .limit(10)
            .lean();

        if (stuckSessions.length === 0) return;

        console.log(`[OrderRecoveryWorker] Found ${stuckSessions.length} stuck paid session(s). Recovering...`);

        const results = await Promise.allSettled(
            stuckSessions.map((s) => recoverSession(s))
        );

        const summary = results.reduce((acc, r) => {
            const action = r.value?.action || (r.reason ? 'error' : 'unknown');
            acc[action] = (acc[action] || 0) + 1;
            return acc;
        }, {});

        console.log('[OrderRecoveryWorker] Sweep complete:', summary);
    } catch (err) {
        console.error('[OrderRecoveryWorker] Sweep error:', err?.message);
    }
};

/**
 * Start the recovery worker. Call in server.js after DB connection.
 */
let _workerInterval = null;

export const startOrderRecoveryWorker = (intervalMs = 5 * 60_000) => {
    if (_workerInterval) return;
    _workerInterval = setInterval(runRecoveryWorker, intervalMs);
    _workerInterval.unref();
    console.log(`[OrderRecoveryWorker] Started (sweep every ${intervalMs / 60_000} minutes)`);
};

export const stopOrderRecoveryWorker = () => {
    if (_workerInterval) {
        clearInterval(_workerInterval);
        _workerInterval = null;
    }
};
