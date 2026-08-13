#!/usr/bin/env node
/**
 * Source hygiene gate.
 *
 * `backend/src/` accumulated 26 one-off scripts — diagnostics, data fixes and
 * verification runners — all of which shipped inside the production image.
 * Several mutate real data (`advance_escrow_period.js` back-dates financial
 * records). They were moved to `backend/tools/dev-scripts/`.
 *
 * This check fails the build if they come back, and if a PII-bearing upload is
 * ever staged for commit.
 *
 * Run: node scripts/checkSourceHygiene.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../src');

/** The only top-level modules that belong in src/. */
const ALLOWED_TOP_LEVEL = new Set(['app.js', 'server.js', 'socket.js']);

const failures = [];

// ── 1. No loose scripts at the top level of src/ ─────────────────────────────
const topLevel = fs
    .readdirSync(SRC, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => e.name);

for (const file of topLevel) {
    if (!ALLOWED_TOP_LEVEL.has(file)) {
        failures.push(
            `src/${file} — one-off scripts must live in tools/dev-scripts/, not in the deployed source tree. `
            + `Schema changes belong in src/migrations/.`
        );
    }
}

// ── 2. No tracked uploads ────────────────────────────────────────────────────
try {
    const tracked = execSync('git ls-files public/uploads uploads', {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
    })
        .split('\n')
        .filter(Boolean);

    for (const file of tracked) {
        failures.push(`${file} — uploaded files may contain PII and must never be tracked in git.`);
    }
} catch {
    // Not a git repository, or git unavailable — skip rather than fail.
}

if (failures.length > 0) {
    console.error('\n✗ Source hygiene check failed:\n');
    failures.forEach((f) => console.error(`  • ${f}`));
    console.error('');
    process.exit(1);
}

console.log('✓ Source hygiene check passed.');
