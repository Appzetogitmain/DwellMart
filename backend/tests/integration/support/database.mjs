/**
 * Test database lifecycle.
 *
 * Connects to the isolated database resolved by `config.mjs`, and truncates it
 * between suites. Every destructive call re-asserts the name guard immediately
 * before deleting, rather than trusting that resolution was correct earlier —
 * the check is cheap and the failure it prevents is unrecoverable.
 *
 * Collections are truncated rather than the database dropped. Dropping would
 * also destroy the indexes Mongoose built on first connect, and several
 * behaviours under test (the 2dsphere rider search, unique order ids, the
 * compound category slug index) depend on those indexes existing.
 */

import mongoose from 'mongoose';
import {
    resolveTestDatabase,
    assertIsTestDatabase,
    harnessConfig,
    HarnessConfigError,
} from './config.mjs';

let connection = null;
let resolvedDatabase = null;

/** Raised when the cluster cannot be reached, so the runner can report SKIP vs FAIL. */
export class DatabaseUnreachableError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = 'DatabaseUnreachableError';
        this.cause = cause;
    }
}

/**
 * Open the connection. Safe to call repeatedly; later calls reuse the first.
 * @returns {Promise<{ databaseName: string }>}
 */
export const connectTestDatabase = async () => {
    if (connection) return { databaseName: resolvedDatabase.databaseName };

    resolvedDatabase = resolveTestDatabase();
    assertIsTestDatabase(resolvedDatabase.databaseName);

    try {
        await mongoose.connect(resolvedDatabase.uri, {
            serverSelectionTimeoutMS: harnessConfig.databaseConnectTimeoutMs,
            // Keep the pool small: the harness is sequential and a large pool
            // only slows down teardown.
            maxPoolSize: 5,
        });
    } catch (err) {
        throw new DatabaseUnreachableError(
            `Could not connect to the integration test database "${resolvedDatabase.databaseName}": ${err.message}`,
            err
        );
    }

    // The connection is the last place we can still catch a misdirected URI.
    const liveName = mongoose.connection.name;
    try {
        assertIsTestDatabase(liveName);
    } catch (err) {
        await mongoose.disconnect().catch(() => null);
        throw err;
    }

    connection = mongoose.connection;
    return { databaseName: liveName };
};

/**
 * Remove all documents from every collection in the test database.
 *
 * Re-asserts the guard against the LIVE connection name — not the name we
 * resolved earlier — so a connection that drifted cannot be truncated.
 */
export const resetTestDatabase = async () => {
    if (!connection) {
        throw new HarnessConfigError('resetTestDatabase() called before connectTestDatabase().');
    }

    assertIsTestDatabase(mongoose.connection.name);

    const collections = await mongoose.connection.db.collections();
    // deleteMany rather than drop: preserves indexes built at model registration.
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
};

/**
 * Ensure every registered model's indexes exist.
 *
 * NOT part of the default bootstrap. Mongoose's `autoIndex` already builds each
 * model's indexes on first use, which was verified against the real
 * `$geoNear` rider search — it returns correct distances without any explicit
 * sync. Running a blanket `syncIndexes()` across every model adds minutes to a
 * remote-cluster run for no behavioural gain, and it was the original cause of
 * the harness hanging.
 *
 * Retained as an opt-in diagnostic: call it when investigating suspected index
 * drift, or after a model's index definitions change.
 *
 * @returns {Promise<string[]>} per-model failures, empty when all synced
 */
export const syncTestIndexes = async () => {
    assertIsTestDatabase(mongoose.connection.name);

    const modelNames = mongoose.modelNames();
    const failures = [];

    for (const name of modelNames) {
        try {
            await mongoose.model(name).syncIndexes();
        } catch (err) {
            // A conflicting legacy index should surface as a report line, not
            // abort the whole run — the suite may not depend on that model.
            failures.push(`${name}: ${err.message}`);
        }
    }

    return failures;
};

export const disconnectTestDatabase = async () => {
    if (!connection) return;
    await mongoose.disconnect();
    connection = null;
    resolvedDatabase = null;
};

export const getTestDatabaseName = () => mongoose.connection?.name || null;
