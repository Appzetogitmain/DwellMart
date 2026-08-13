#!/usr/bin/env node
/**
 * Permission coverage gate.
 *
 * Thirteen permission tokens were defined, exposed in the sub-admin UI, granted
 * by preset roles — and enforced by no route at all. An operator assigning
 * "Finance & Wallet" believed they had drawn a boundary that did not exist.
 *
 * This fails the build when:
 *   1. a token in PERMISSIONS is enforced by zero routes, or
 *   2. a retired token has crept back into the codebase.
 *
 * The rule it encodes: a permission is introduced in the same change as the
 * route that enforces it, never before.
 *
 * Run: node scripts/checkPermissionCoverage.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../src');
const CONSTANTS_FILE = path.join(SRC, 'constants', 'permissions.js');

const { PERMISSIONS, RETIRED_PERMISSIONS } = await import(
    `file://${CONSTANTS_FILE.replace(/\\/g, '/')}`
);

/** Recursively collect every .js file under src/, excluding the constants file. */
const collect = (dir, acc = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collect(full, acc);
        else if (entry.isFile() && entry.name.endsWith('.js') && full !== CONSTANTS_FILE) acc.push(full);
    }
    return acc;
};

const sources = collect(SRC).map((f) => ({ file: f, text: fs.readFileSync(f, 'utf8') }));
const failures = [];

// ── 1. Every active token must be enforced somewhere ─────────────────────────
for (const [name, value] of Object.entries(PERMISSIONS)) {
    const referencedByConstant = sources.some((s) => s.text.includes(`PERMISSIONS.${name}`));
    const referencedByLiteral = sources.some((s) => s.text.includes(`'${value}'`) || s.text.includes(`"${value}"`));
    if (!referencedByConstant && !referencedByLiteral) {
        failures.push(
            `PERMISSIONS.${name} ('${value}') is enforced by ZERO routes. `
            + 'Enforce it on a route, or remove it and add it to RETIRED_PERMISSIONS. '
            + 'An unenforced token advertises a boundary the system does not have.'
        );
    }
}

// ── 2. Retired tokens must not return ────────────────────────────────────────
for (const retired of RETIRED_PERMISSIONS || []) {
    const offender = sources.find(
        (s) => s.text.includes(`'${retired}'`) || s.text.includes(`"${retired}"`)
    );
    if (offender) {
        failures.push(
            `Retired permission '${retired}' reappeared in ${path.relative(SRC, offender.file)}. `
            + 'It was removed because no route could enforce it.'
        );
    }
}

if (failures.length > 0) {
    console.error('\n✗ Permission coverage check failed:\n');
    failures.forEach((f) => console.error(`  • ${f}`));
    console.error('');
    process.exit(1);
}

console.log(
    `✓ Permission coverage check passed — all ${Object.keys(PERMISSIONS).length} tokens are enforced.`
);
