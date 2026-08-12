/**
 * Integration test configuration and database-safety guard.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MOST IMPORTANT FILE IN THE HARNESS.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `MONGO_URI` in this project points at a live Atlas cluster holding real data.
 * An integration suite that seeds and truncates collections MUST NOT be able to
 * reach it, and "must not" here cannot mean "we were careful" — it has to be a
 * structural guarantee, because the failure mode is irreversible data loss.
 *
 * So the rule is enforced twice, in two different shapes:
 *
 *   1. The test database name is DERIVED, never taken as-is. Whatever the
 *      developer's `MONGO_URI` points at, the harness appends a fixed suffix and
 *      talks to that database instead.
 *   2. Every destructive operation re-asserts the suffix immediately before
 *      running (see `database.mjs`). A connection that somehow reached the wrong
 *      database still cannot be truncated.
 *
 * The suffix is not configurable. Making it configurable would give someone a
 * way to point the harness at production by editing an env var, which is exactly
 * the mistake this design exists to make impossible.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '..', '..', '..');

dotenv.config({ path: path.resolve(BACKEND_ROOT, '.env') });

/**
 * The only database-name suffix the harness will ever operate on.
 * Deliberately a hard-coded constant, not an env var.
 */
export const TEST_DB_SUFFIX = '_integration_test';

/** Thrown for configuration problems so the runner can report them distinctly. */
export class HarnessConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'HarnessConfigError';
    }
}

/**
 * Split a MongoDB connection string into the parts we need to rewrite the
 * database name, without disturbing credentials, options or the SRV form.
 *
 * Handled shapes:
 *   mongodb://host/db?opts
 *   mongodb+srv://user:pass@host/db?opts
 *   mongodb://host          (no database segment)
 *   mongodb://a,b,c/db      (replica set seed list)
 */
const parseMongoUri = (uri) => {
    const schemeMatch = /^(mongodb(?:\+srv)?:\/\/)(.*)$/.exec(String(uri || '').trim());
    if (!schemeMatch) {
        throw new HarnessConfigError(
            'MONGO_URI is not a valid MongoDB connection string (expected it to start with mongodb:// or mongodb+srv://).'
        );
    }

    const [, scheme, remainder] = schemeMatch;

    // Credentials may contain '@'; the host section starts after the LAST '@'.
    const atIndex = remainder.lastIndexOf('@');
    const credentials = atIndex === -1 ? '' : remainder.slice(0, atIndex + 1);
    const afterCredentials = atIndex === -1 ? remainder : remainder.slice(atIndex + 1);

    const queryIndex = afterCredentials.indexOf('?');
    const query = queryIndex === -1 ? '' : afterCredentials.slice(queryIndex);
    const beforeQuery = queryIndex === -1 ? afterCredentials : afterCredentials.slice(0, queryIndex);

    const slashIndex = beforeQuery.indexOf('/');
    const hosts = slashIndex === -1 ? beforeQuery : beforeQuery.slice(0, slashIndex);
    const database = slashIndex === -1 ? '' : beforeQuery.slice(slashIndex + 1);

    if (!hosts) {
        throw new HarnessConfigError('MONGO_URI does not contain a host.');
    }

    return { scheme, credentials, hosts, database, query };
};

const buildMongoUri = ({ scheme, credentials, hosts, database, query }) =>
    `${scheme}${credentials}${hosts}/${database}${query}`;

/**
 * Resolve the connection string the harness is allowed to use.
 *
 * The source database name is only ever read, never written to. The returned
 * URI always addresses `<source>${TEST_DB_SUFFIX}`.
 *
 * @returns {{ uri: string, databaseName: string, sourceDatabaseName: string }}
 */
export const resolveTestDatabase = () => {
    const sourceUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!sourceUri) {
        throw new HarnessConfigError(
            'MONGO_URI is not set. The integration harness needs a cluster to derive its isolated test database from.'
        );
    }

    const parts = parseMongoUri(sourceUri);
    const sourceDatabaseName = parts.database || 'dwellmart';

    // Idempotent: re-deriving from an already-suffixed name must not double it.
    const baseName = sourceDatabaseName.endsWith(TEST_DB_SUFFIX)
        ? sourceDatabaseName.slice(0, -TEST_DB_SUFFIX.length)
        : sourceDatabaseName;

    const databaseName = `${baseName}${TEST_DB_SUFFIX}`;

    // Belt and braces: this cannot currently fail, and it must stay that way.
    assertIsTestDatabase(databaseName);

    return {
        uri: buildMongoUri({ ...parts, database: databaseName }),
        databaseName,
        sourceDatabaseName,
    };
};

/**
 * The guard every destructive operation calls.
 *
 * Exported so `database.mjs` can re-assert it at the point of deletion rather
 * than trusting that resolution happened correctly earlier in the process.
 *
 * @throws {HarnessConfigError} when the name is not an integration test database
 */
export const assertIsTestDatabase = (databaseName) => {
    const name = String(databaseName || '');
    if (!name.endsWith(TEST_DB_SUFFIX)) {
        throw new HarnessConfigError(
            `REFUSING TO OPERATE on database "${name}". `
            + `The integration harness may only touch databases ending in "${TEST_DB_SUFFIX}". `
            + 'This guard exists to make it impossible to truncate real data.'
        );
    }
    return name;
};

/**
 * Runtime knobs. Every value has a working default so the suite runs with no
 * configuration at all; each can be overridden for CI.
 */
export const harnessConfig = {
    /**
     * Allow the run to report SKIPPED instead of FAILED when no database is
     * reachable. Off by default: a release gate that silently passes when it
     * could not run is worse than no gate.
     */
    allowSkipWithoutDatabase: process.env.INTEGRATION_ALLOW_SKIP === '1',

    /** Milliseconds to wait for the initial database connection. */
    databaseConnectTimeoutMs: Number(process.env.INTEGRATION_DB_TIMEOUT_MS) || 15000,

    /** Milliseconds any single HTTP request may take before failing. */
    requestTimeoutMs: Number(process.env.INTEGRATION_HTTP_TIMEOUT_MS) || 20000,

    /** Print every request/response pair. Verbose; useful when a suite regresses. */
    verbose: process.env.INTEGRATION_VERBOSE === '1',
};

export const paths = {
    backendRoot: BACKEND_ROOT,
    repoRoot: path.resolve(BACKEND_ROOT, '..'),
    frontendRoot: path.resolve(BACKEND_ROOT, '..', 'frontend'),
};
