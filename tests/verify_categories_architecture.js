import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Category from '../src/models/Category.model.js';
import { EXPERIENCES } from '../src/constants/experiences.js';
import { seedCategoriesInDb } from '../src/scripts/seedCategories.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

let passed = 0;
let failed = 0;

function assert(condition, name, details = '') {
    if (condition) {
        console.log(`  ${green('✅')}  ${name}`);
        passed++;
    } else {
        console.log(`  ${red('❌')}  ${name} — ${details}`);
        failed++;
    }
}

async function runVerification() {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║   Experience-Based Category Architecture Test Suite     ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    if (!process.env.MONGO_URI) {
        console.error('MONGO_URI is missing from environment.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB.\n');

    // ── Test 1: Category Seeder Idempotency & Slug Uniqueness ───────────────
    console.log(bold('─── Test 1: Category Seeder Idempotency ───'));
    const seedStats1 = await seedCategoriesInDb();
    const seedStats2 = await seedCategoriesInDb(); // Run again to test idempotency
    assert(
        seedStats2.createdCount === 0 && seedStats2.updatedCount === seedStats1.total,
        'Seeder idempotency — zero duplicate creations on re-run',
        `created=${seedStats2.createdCount}, updated=${seedStats2.updatedCount}`
    );

    // ── Test 2: Unique Slugs Assertion ────────────────────────────────────────
    console.log(bold('\n─── Test 2: Unique Slugs Assertion ───'));
    const allCategories = await Category.find({}).lean();
    const slugs = allCategories.map((c) => c.slug);
    const uniqueSlugs = new Set(slugs);
    assert(
        slugs.length === uniqueSlugs.size,
        'All categories have unique slugs',
        `total=${slugs.length}, unique=${uniqueSlugs.size}`
    );

    // ── Test 3: Quick Commerce Category Isolation ─────────────────────────────
    console.log(bold('\n─── Test 3: Quick Commerce Category Isolation ───'));
    const qcCategories = await Category.find({
        supportedExperiences: EXPERIENCES.QUICK_COMMERCE,
        isActive: true,
    }).lean();
    assert(
        qcCategories.length === 20,
        'Quick Commerce experience exposes exactly 20 categories',
        `found=${qcCategories.length}`
    );

    // ── Test 4: Marketplace Category Isolation ────────────────────────────────
    console.log(bold('\n─── Test 4: Marketplace Category Isolation ───'));
    const mpCategories = await Category.find({
        supportedExperiences: EXPERIENCES.MARKETPLACE,
        isActive: true,
    }).lean();
    assert(
        mpCategories.length >= 14,
        'Marketplace experience exposes Marketplace categories',
        `found=${mpCategories.length}`
    );

    // ── Test 5: Wholesale Category Isolation ──────────────────────────────────
    console.log(bold('\n─── Test 5: Wholesale Category Isolation ───'));
    const wsCategories = await Category.find({
        supportedExperiences: EXPERIENCES.WHOLESALE,
        isActive: true,
    }).lean();
    assert(
        wsCategories.length >= 8,
        'Wholesale experience exposes Wholesale categories',
        `found=${wsCategories.length}`
    );

    // ── Test 6: Display Order Sequence ────────────────────────────────────────
    console.log(bold('\n─── Test 6: Display Order Sequence ───'));
    const sortedCategories = await Category.find({ supportedExperiences: EXPERIENCES.QUICK_COMMERCE })
        .sort({ displayOrder: 1, name: 1 })
        .lean();
    let isSorted = true;
    for (let i = 0; i < sortedCategories.length - 1; i++) {
        if ((sortedCategories[i].displayOrder || 0) > (sortedCategories[i + 1].displayOrder || 0)) {
            isSorted = false;
            break;
        }
    }
    assert(isSorted, 'Categories are sorted by displayOrder ASC');

    // ── Test 7: Virtual Experience Backward Compatibility ────────────────────
    console.log(bold('\n─── Test 7: Virtual Experience Getter ───'));
    const doc = await Category.findOne({ slug: 'fresh-fruits-vegetables' });
    assert(
        doc && doc.experience === EXPERIENCES.QUICK_COMMERCE,
        'Virtual experience getter maps to supportedExperiences[0]',
        `got=${doc?.experience}`
    );

    console.log('\n══════════════════════════════════════════════════════════');
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('══════════════════════════════════════════════════════════\n');

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
}

runVerification().catch((err) => {
    console.error('Fatal error during verification:', err);
    process.exit(1);
});
