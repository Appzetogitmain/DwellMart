import mongoose from 'mongoose';

/**
 * Migration ledger.
 *
 * Before this existed, schema changes were ad-hoc scripts in `backend/scripts/`
 * with no ordering, no record of what had run where, and no way to tell an
 * already-applied migration from a pending one. This collection is the record.
 *
 * A single reserved document (`migrationId: '__lock__'`) doubles as an advisory
 * lease so two instances cannot run migrations concurrently — which matters the
 * moment the application runs more than one process.
 */
const schemaMigrationSchema = new mongoose.Schema(
    {
        migrationId: { type: String, required: true, unique: true, index: true },
        description: { type: String, default: '' },
        status: {
            type: String,
            enum: ['applied', 'failed', 'retired', 'lock'],
            default: 'applied',
            index: true,
        },
        appliedAt: { type: Date },
        appliedBy: { type: String, default: '' },
        durationMs: { type: Number },
        error: { type: String },
        /** Free-form result summary from the migration (counts, ids touched). */
        result: { type: mongoose.Schema.Types.Mixed, default: {} },

        // ── Advisory lock fields (only used by the '__lock__' document) ──────
        lockedAt: { type: Date },
        lockedBy: { type: String },
        lockExpiresAt: { type: Date },
    },
    { timestamps: true }
);

const SchemaMigration = mongoose.model('SchemaMigration', schemaMigrationSchema);

export default SchemaMigration;
export { SchemaMigration };
