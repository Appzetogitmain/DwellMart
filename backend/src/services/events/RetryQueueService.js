/**
 * RetryQueueService
 *
 * Persistent retry queue backed by the FailedJob MongoDB collection.
 *
 * Usage:
 *   import { RetryQueueService } from './RetryQueueService.js';
 *
 *   // Enqueue a failed job
 *   await RetryQueueService.enqueue('qc.orderPlaced', { order });
 *
 *   // In server.js after DB connect:
 *   RetryQueueService.startWorker();
 *
 * Handler registration:
 *   RetryQueueService.registerHandler('qc.orderPlaced', async (payload) => { ... });
 *
 * Backoff schedule:
 *   attempt 1 → 1 minute
 *   attempt 2 → 5 minutes
 *   attempt 3 → 15 minutes
 *   attempt 4+ → dead letter
 */

import FailedJob from '../../models/FailedJob.model.js';
import { notifyAdmins } from '../notification.service.js';

// ── Backoff table ─────────────────────────────────────────────────────────────

const BACKOFF_MINUTES = [1, 5, 15]; // attempt 0→1min, 1→5min, 2→15min

const nextRetryDelay = (attempt) => {
    const mins = BACKOFF_MINUTES[attempt] ?? 30;
    return new Date(Date.now() + mins * 60 * 1000);
};

// ── Handler registry ──────────────────────────────────────────────────────────

const handlers = new Map();

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Register a job handler.
 * @param {string}   jobType
 * @param {Function} handler  — async (payload) => void
 */
export const registerHandler = (jobType, handler) => {
    handlers.set(jobType, handler);
};

/**
 * Enqueue a failed job for retry.
 * @param {string} jobType
 * @param {Object} payload
 * @param {number} [maxAttempts=3]
 */
export const enqueue = async (jobType, payload, maxAttempts = 3) => {
    try {
        await FailedJob.create({
            jobType,
            payload,
            attempt:     0,
            maxAttempts,
            nextRetryAt: nextRetryDelay(0),
            status:      'pending',
        });
        console.log(`[RetryQueue] Enqueued job: ${jobType}`);
    } catch (err) {
        // Non-critical — log and move on
        console.error(`[RetryQueue] Failed to enqueue ${jobType}:`, err?.message);
    }
};

/**
 * Process all due pending jobs.
 * Called by the worker interval every 60 seconds.
 */
export const processDueJobs = async () => {
    const now = new Date();

    // Find due jobs and atomically lock them (status: retrying)
    const jobs = await FailedJob.find({
        status:      'pending',
        nextRetryAt: { $lte: now },
    }).limit(20).lean();

    if (jobs.length === 0) return;

    for (const job of jobs) {
        // Optimistic lock — prevent double-processing if multiple instances run
        const locked = await FailedJob.findOneAndUpdate(
            { _id: job._id, status: 'pending' },
            { $set: { status: 'retrying' } },
            { new: true }
        );
        if (!locked) continue; // Already picked up by another process

        const handler = handlers.get(job.jobType);
        if (!handler) {
            console.warn(`[RetryQueue] No handler registered for "${job.jobType}". Marking dead.`);
            await FailedJob.findByIdAndUpdate(job._id, {
                $set: { status: 'dead', deadAt: new Date(), lastError: 'No handler registered' },
            });
            continue;
        }

        try {
            await handler(job.payload);
            await FailedJob.findByIdAndUpdate(job._id, {
                $set: { status: 'succeeded', succeededAt: new Date() },
            });
            console.log(`[RetryQueue] Job succeeded: ${job.jobType} (attempt ${job.attempt + 1})`);
        } catch (err) {
            const nextAttempt = job.attempt + 1;
            const isDead = nextAttempt >= job.maxAttempts;

            if (isDead) {
                await FailedJob.findByIdAndUpdate(job._id, {
                    $set: {
                        status:    'dead',
                        attempt:   nextAttempt,
                        lastError: err?.message || 'Unknown error',
                        deadAt:    new Date(),
                    },
                });
                console.error(`[RetryQueue] Job dead: ${job.jobType} after ${nextAttempt} attempts.`);

                // Notify admin of dead job (fire-and-forget).
                // Previously passed `role`/`type: 'system_alert'`, neither of
                // which the Notification schema accepts, so every dead-job
                // alert failed validation and was swallowed by the catch.
                notifyAdmins({
                    anchorId: job._id,
                    type:     'system',
                    category: 'ERROR',
                    priority: 'CRITICAL',
                    title:    `Dead job: ${job.jobType}`,
                    message:  `Job type "${job.jobType}" exhausted all ${job.maxAttempts} retry attempts. Manual intervention required.`,
                    data:     { jobId: String(job._id), jobType: job.jobType, lastError: String(err?.message || '') },
                }).catch(() => null);
            } else {
                await FailedJob.findByIdAndUpdate(job._id, {
                    $set: {
                        status:      'pending',
                        attempt:     nextAttempt,
                        lastError:   err?.message || 'Unknown error',
                        nextRetryAt: nextRetryDelay(nextAttempt),
                    },
                });
                console.warn(`[RetryQueue] Job failed (attempt ${nextAttempt}), retrying at ${nextRetryDelay(nextAttempt).toISOString()}: ${job.jobType}`);
            }
        }
    }
};

// ── Worker ─────────────────────────────────────────────────────────────────────

let _workerInterval = null;

/**
 * Start the retry queue worker.
 * Polls for due jobs every 60 seconds.
 */
export const startWorker = (intervalMs = 60_000) => {
    if (_workerInterval) return;
    _workerInterval = setInterval(async () => {
        try {
            await processDueJobs();
        } catch (err) {
            console.error('[RetryQueue] Worker error:', err?.message);
        }
    }, intervalMs);
    _workerInterval.unref(); // Don't keep process alive
    console.log(`[RetryQueue] Worker started (polling every ${intervalMs / 1000}s)`);
};

/**
 * Stop the worker (for graceful shutdown / tests).
 */
export const stopWorker = () => {
    if (_workerInterval) {
        clearInterval(_workerInterval);
        _workerInterval = null;
    }
};

export const RetryQueueService = {
    registerHandler,
    enqueue,
    processDueJobs,
    startWorker,
    stopWorker,
};

export default RetryQueueService;
