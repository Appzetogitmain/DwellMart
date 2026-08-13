#!/usr/bin/env node
/**
 * Migration CLI.
 *
 *   npm run migrate                 apply all pending
 *   npm run migrate -- --dry-run    list what would be applied, write nothing
 *   npm run migrate -- --to 0004_x  apply up to and including an id
 *   npm run migrate -- --status     show applied vs pending
 *   npm run migrate -- --verify     run verify() on applied migrations
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import {
    runPendingMigrations,
    getPendingMigrations,
    getCompletedIds,
    verifyMigrations,
} from './runner.js';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
};

const main = async () => {
    await connectDB();

    if (has('--status')) {
        const completed = await getCompletedIds();
        const pending = await getPendingMigrations();
        console.log(`Applied/retired: ${completed.size}`);
        [...completed].sort().forEach((id) => console.log(`  ✓ ${id}`));
        console.log(`Pending: ${pending.length}`);
        pending.forEach((m) => console.log(`  • ${m.id} — ${m.description}`));
        return;
    }

    if (has('--verify')) {
        const results = await verifyMigrations();
        let failures = 0;
        for (const r of results) {
            const mark = r.ok === true ? '✓' : r.ok === false ? '✗' : '–';
            if (r.ok === false) failures += 1;
            console.log(`  ${mark} ${r.id} ${r.detail ? `(${r.detail})` : ''}`);
        }
        if (failures > 0) process.exitCode = 1;
        return;
    }

    const result = await runPendingMigrations({
        dryRun: has('--dry-run'),
        to: valueOf('--to'),
    });
    console.log('[migrate] Done.', result);
};

main()
    .catch((err) => {
        console.error('[migrate] Failed:', err?.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.connection.close().catch(() => null);
    });
