/**
 * FailedJob
 *
 * Persistent retry queue for marketplace event handlers.
 * Replaces in-memory retries with a durable Mongo-backed queue.
 *
 * Lifecycle:
 *   pending   → due for processing (nextRetryAt <= now)
 *   retrying  → currently being processed (lock-out window)
 *   succeeded → handler completed successfully
 *   dead      → maxAttempts exhausted, needs manual intervention
 *
 * Future extensibility:
 *   Replace the polling loop with BullMQ / RabbitMQ / Kafka without
 *   changing any business logic — only swap the transport layer.
 *
 * Backoff schedule (configurable per jobType):
 *   Attempt 1 → retry after 1 minute
 *   Attempt 2 → retry after 5 minutes
 *   Attempt 3 → retry after 15 minutes
 *   Attempt 4+ → dead
 */

import mongoose from 'mongoose';

const failedJobSchema = new mongoose.Schema(
    {
        jobType: {
            type:     String,
            required: true,
            index:    true,
            // e.g. 'qc.orderPlaced', 'rider.assignment', 'notification.send'
        },

        payload: {
            type:     mongoose.Schema.Types.Mixed,
            required: true,
        },

        // Retry accounting
        attempt:     { type: Number, default: 0, min: 0 },
        maxAttempts: { type: Number, default: 3 },

        lastError: { type: String, default: null, trim: true },

        // When should the worker next process this job?
        nextRetryAt: { type: Date, required: true, index: true },

        status: {
            type:    String,
            enum:    ['pending', 'retrying', 'succeeded', 'dead'],
            default: 'pending',
            index:   true,
        },

        // For auditing — when did the original event fire?
        originatedAt: { type: Date, default: () => new Date() },
        succeededAt:  { type: Date, default: null },
        deadAt:       { type: Date, default: null },
    },
    { timestamps: true }
);

// Worker polling query: find all due pending jobs
failedJobSchema.index({ status: 1, nextRetryAt: 1 });

// Auto-delete succeeded/dead jobs after 7 days to keep collection lean
failedJobSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export const FailedJob = mongoose.model('FailedJob', failedJobSchema);
export default FailedJob;
