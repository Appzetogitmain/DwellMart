/**
 * Migration runner.
 *
 * Forward-only, ordered, idempotent, and safe to run concurrently — the second
 * runner blocks on an advisory lease rather than racing.
 *
 * Migrations are NOT applied automatically at boot in production. Boot only
 * *verifies* that none are pending (see `assertNoPendingMigrations`); applying
 * them is an explicit deploy step, so a schema change never happens as a side
 * effect of a restart.
 *
 * Each migration module exports:
 *   id          — stable, ordered identifier ('0001_...')
 *   description — one line
 *   up()        — the change; MUST be idempotent (safe to run twice)
 *   verify()    — optional; returns { ok: boolean, detail?: string }
 */

import os from 'node:os';
import SchemaMigration from '../models/SchemaMigration.model.js';
import { MIGRATIONS } from './index.js';

const LOCK_ID = '__lock__';
const LOCK_TTL_MS = 15 * 60 * 1000;

const actor = () => `${os.hostname()}:${process.pid}`;

/** Migrations in deterministic id order. */
const orderedMigrations = () => [...MIGRATIONS].sort((a, b) => a.id.localeCompare(b.id));

/**
 * Acquire the advisory lease. Returns false when another runner holds it.
 * An expired lease is reclaimable, so a crashed runner cannot deadlock the next.
 */
const acquireLock = async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);
    const holder = actor();

    const result = await SchemaMigration.findOneAndUpdate(
        {
            migrationId: LOCK_ID,
            $or: [
                { lockExpiresAt: { $lte: now } },
                { lockExpiresAt: { $exists: false } },
                { lockExpiresAt: null },
            ],
        },
        {
            $set: {
                migrationId: LOCK_ID,
                status: 'lock',
                lockedAt: now,
                lockedBy: holder,
                lockExpiresAt: expiresAt,
            },
        },
        { upsert: true, new: true }
    ).catch((err) => {
        // Duplicate key means another runner created the lock first.
        if (err?.code === 11000) return null;
        throw err;
    });

    return Boolean(result && result.lockedBy === holder);
};

const releaseLock = async () => {
    await SchemaMigration.updateOne(
        { migrationId: LOCK_ID, lockedBy: actor() },
        { $set: { lockExpiresAt: new Date(0), lockedBy: '' } }
    ).catch(() => null);
};

/** Ids already recorded as applied or deliberately retired. */
export const getCompletedIds = async () => {
    const rows = await SchemaMigration.find({
        migrationId: { $ne: LOCK_ID },
        status: { $in: ['applied', 'retired'] },
    })
        .select('migrationId')
        .lean();
    return new Set(rows.map((r) => r.migrationId));
};

export const getPendingMigrations = async () => {
    const completed = await getCompletedIds();
    return orderedMigrations().filter((m) => !completed.has(m.id));
};

/**
 * Boot-time guard. Refuses to serve traffic when the code expects a schema the
 * database has not been migrated to.
 */
export const assertNoPendingMigrations = async () => {
    const pending = await getPendingMigrations();
    if (pending.length === 0) return { pending: [] };

    const ids = pending.map((m) => m.id).join(', ');
    const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    const message = `${pending.length} pending migration(s): ${ids}. Run "npm run migrate" before starting.`;

    if (isProduction) throw new Error(message);
    console.warn(`⚠️  ${message} (allowed outside production)`);
    return { pending: pending.map((m) => m.id) };
};

/**
 * Apply pending migrations.
 *
 * @param {{ dryRun?: boolean, to?: string }} [options]
 */
export const runPendingMigrations = async ({ dryRun = false, to = null } = {}) => {
    const pending = await getPendingMigrations();
    const scoped = to ? pending.filter((m) => m.id.localeCompare(to) <= 0) : pending;

    if (scoped.length === 0) {
        console.log('[migrate] Nothing to apply — schema is up to date.');
        return { applied: [], skipped: [], dryRun };
    }

    if (dryRun) {
        console.log(`[migrate] DRY RUN — ${scoped.length} migration(s) would be applied:`);
        scoped.forEach((m) => console.log(`  • ${m.id} — ${m.description}`));
        return { applied: [], skipped: scoped.map((m) => m.id), dryRun: true };
    }

    const locked = await acquireLock();
    if (!locked) {
        throw new Error('[migrate] Another migration runner holds the lock. Aborting.');
    }

    const applied = [];
    try {
        for (const migration of scoped) {
            const startedAt = Date.now();
            console.log(`[migrate] Applying ${migration.id} — ${migration.description}`);
            try {
                const result = (await migration.up()) || {};
                const durationMs = Date.now() - startedAt;

                if (typeof migration.verify === 'function') {
                    const check = await migration.verify();
                    if (check && check.ok === false) {
                        throw new Error(`verify() failed: ${check.detail || 'no detail'}`);
                    }
                }

                await SchemaMigration.findOneAndUpdate(
                    { migrationId: migration.id },
                    {
                        $set: {
                            migrationId: migration.id,
                            description: migration.description,
                            status: 'applied',
                            appliedAt: new Date(),
                            appliedBy: actor(),
                            durationMs,
                            result,
                            error: null,
                        },
                    },
                    { upsert: true }
                );

                applied.push(migration.id);
                console.log(`[migrate] ✅ ${migration.id} (${durationMs}ms)`, result);
            } catch (err) {
                await SchemaMigration.findOneAndUpdate(
                    { migrationId: migration.id },
                    {
                        $set: {
                            migrationId: migration.id,
                            description: migration.description,
                            status: 'failed',
                            appliedBy: actor(),
                            error: String(err?.message || err),
                        },
                    },
                    { upsert: true }
                );
                console.error(`[migrate] ❌ ${migration.id} failed: ${err?.message}`);
                // Forward-only and ordered: a later migration may depend on this
                // one, so stop rather than skip.
                throw err;
            }
        }
    } finally {
        await releaseLock();
    }

    return { applied, skipped: [], dryRun: false };
};

/** Run every migration's verify() without applying anything. */
export const verifyMigrations = async () => {
    const completed = await getCompletedIds();
    const results = [];
    for (const migration of orderedMigrations()) {
        if (!completed.has(migration.id)) {
            results.push({ id: migration.id, ok: null, detail: 'not applied' });
            continue;
        }
        if (typeof migration.verify !== 'function') {
            results.push({ id: migration.id, ok: null, detail: 'no verify()' });
            continue;
        }
        try {
            const check = await migration.verify();
            results.push({ id: migration.id, ok: check?.ok !== false, detail: check?.detail || '' });
        } catch (err) {
            results.push({ id: migration.id, ok: false, detail: String(err?.message || err) });
        }
    }
    return results;
};
