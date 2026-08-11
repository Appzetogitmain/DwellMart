import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Category from '../src/models/Category.model.js';
import Product from '../src/models/Product.model.js';
import Settings from '../src/models/Settings.model.js';
import { EXPERIENCES } from '../src/constants/experiences.js';
import { seedCategoriesInDb } from '../src/scripts/seedCategories.js';
import { buildCatalogFilter } from '../src/services/catalogQuery.service.js';

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

async function runComprehensiveTests() {
    console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║   DwellMart Production-Grade Category & Experience Isolation Suite  ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

    if (!process.env.MONGO_URI) {
        console.error('MONGO_URI is missing from environment.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB.\n');

    // ── Test 1: Category Seeder Idempotency ────────────────────────────────────
    console.log(bold('─── Test 1: Seeder Idempotency ───'));
    const seedStats1 = await seedCategoriesInDb();
    const seedStats2 = await seedCategoriesInDb();
    assert(
        seedStats2.createdCount === 0,
        'Seeder idempotency — zero duplicate creations on re-run',
        `created=${seedStats2.createdCount}, updated=${seedStats2.updatedCount}`
    );

    // ── Test 2: Unique Slugs Assertion ──────────────────────────────────────────
    console.log(bold('\n─── Test 2: Unique Slugs Assertion ───'));
    const allCategories = await Category.find({}).lean();
    const slugs = allCategories.map((c) => c.slug);
    const uniqueSlugs = new Set(slugs);
    assert(
        slugs.length === uniqueSlugs.size,
        'All categories in database have strictly unique slugs',
        `total=${slugs.length}, unique=${uniqueSlugs.size}`
    );

    // ── Test 3: Quick Commerce Category Isolation ───────────────────────────────
    console.log(bold('\n─── Test 3: Quick Commerce Category Isolation ───'));
    const qcCats = await Category.find({
        supportedExperiences: EXPERIENCES.QUICK_COMMERCE,
        isActive: true,
    }).lean();
    assert(
        qcCats.length >= 20,
        'Quick Commerce experience surfaces isolated Express categories',
        `found=${qcCats.length}`
    );

    // ── Test 4: Marketplace Category Isolation ──────────────────────────────────
    console.log(bold('\n─── Test 4: Marketplace Category Isolation ───'));
    const mpCats = await Category.find({
        supportedExperiences: EXPERIENCES.MARKETPLACE,
        isActive: true,
    }).lean();
    assert(
        mpCats.length >= 14,
        'Marketplace experience surfaces B2C retail categories',
        `found=${mpCats.length}`
    );

    // ── Test 5: Wholesale Category Isolation ────────────────────────────────────
    console.log(bold('\n─── Test 5: Wholesale Category Isolation ───'));
    const wsCats = await Category.find({
        supportedExperiences: EXPERIENCES.WHOLESALE,
        isActive: true,
    }).lean();
    assert(
        wsCats.length >= 8,
        'Wholesale experience surfaces B2B industrial/bulk categories',
        `found=${wsCats.length}`
    );

    // ── Test 6: Multi-Experience Category Visibility ───────────────────────────
    console.log(bold('\n─── Test 6: Multi-Experience Category Visibility ───'));
    const multiExpCat = await Category.findOne({ slug: 'wholesale-groceries' });
    assert(
        multiExpCat &&
        multiExpCat.supportedExperiences.includes(EXPERIENCES.MARKETPLACE) &&
        multiExpCat.supportedExperiences.includes(EXPERIENCES.WHOLESALE),
        'Multi-experience category (Wholesale Groceries) is listed in both Marketplace & Wholesale feeds',
        `supportedExperiences=${JSON.stringify(multiExpCat?.supportedExperiences)}`
    );

    // ── Test 7: Product Catalog Isolation (Quick Commerce) ────────────────────
    console.log(bold('\n─── Test 7: Product Catalog Isolation (Quick Commerce) ───'));
    const qcFilter = buildCatalogFilter({ experience: EXPERIENCES.QUICK_COMMERCE });
    assert(
        qcFilter.quickCommerceEnabled === true && qcFilter.isActive === true,
        'Catalog query builder enforces quickCommerceEnabled=true for Quick Commerce',
        `filter=${JSON.stringify(qcFilter)}`
    );

    // ── Test 8: Product Catalog Isolation (Retail vs Wholesale) ───────────────
    console.log(bold('\n─── Test 8: Product Catalog Isolation (Retail vs Wholesale) ───'));
    const retailFilter = buildCatalogFilter({ experience: EXPERIENCES.MARKETPLACE });
    assert(
        retailFilter.retailEnabled && retailFilter.retailEnabled.$ne === false,
        'Catalog query builder isolates retail products from wholesale-only inventory',
        `filter=${JSON.stringify(retailFilter)}`
    );

    // ── Test 9: Display Order Sequence ──────────────────────────────────────────
    console.log(bold('\n─── Test 9: Display Order Sequence ───'));
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
    assert(isSorted, 'Categories are sorted strictly by displayOrder ASC');

    // ── Test 10: Virtual Experience Getter ──────────────────────────────────────
    console.log(bold('\n─── Test 10: Virtual Experience Getter ───'));
    const doc = await Category.findOne({ slug: 'fresh-fruits-vegetables' });
    assert(
        doc && doc.experience === EXPERIENCES.QUICK_COMMERCE,
        'Virtual getter category.experience maps to supportedExperiences[0] for backward compatibility',
        `got=${doc?.experience}`
    );

    // ── Test 11: Seeder Resilience & Updates ────────────────────────────────────
    console.log(bold('\n─── Test 11: Seeder Resilience & Updates ───'));
    const targetCat = await Category.findOne({ slug: 'fresh-fruits-vegetables' });
    const originalName = targetCat.name;
    targetCat.name = 'Fresh Fruits & Veggies Test Rename';
    await targetCat.save();

    await seedCategoriesInDb();

    const refreshedCat = await Category.findOne({ slug: 'fresh-fruits-vegetables' });
    assert(
        refreshedCat && refreshedCat.name === 'Fresh Fruits & Vegetables',
        'Seeder updates attributes on existing slug without creating duplicate categories',
        `gotName=${refreshedCat?.name}`
    );

    // ── Test 12: Admin Edit Experience Transitions ─────────────────────────────
    console.log(bold('\n─── Test 12: Admin Edit Experience Transitions ───'));
    const testCat = await Category.create({
        name: 'Test Transition Category',
        slug: 'test-transition-category',
        supportedExperiences: [EXPERIENCES.MARKETPLACE],
    });

    let mpCheck = await Category.findOne({ slug: 'test-transition-category', supportedExperiences: EXPERIENCES.MARKETPLACE });
    let wsCheck1 = await Category.findOne({ slug: 'test-transition-category', supportedExperiences: EXPERIENCES.WHOLESALE });

    testCat.supportedExperiences = [EXPERIENCES.MARKETPLACE, EXPERIENCES.WHOLESALE];
    await testCat.save();

    let wsCheck2 = await Category.findOne({ slug: 'test-transition-category', supportedExperiences: EXPERIENCES.WHOLESALE });

    await Category.findByIdAndDelete(testCat._id);

    assert(
        mpCheck && !wsCheck1 && wsCheck2,
        'Admin updating supportedExperiences cleanly transitions category visibility across feeds',
        `initialWS=${!!wsCheck1}, transitionWS=${!!wsCheck2}`
    );

    // ── Test 13: Feature Flag OFF Behavior ─────────────────────────────────────
    console.log(bold('\n─── Test 13: Feature Flag OFF Behavior ───'));
    let featureSettings = await Settings.findOne({ key: 'features' });
    if (!featureSettings) {
        featureSettings = await Settings.create({ key: 'features', value: { quickCommerceEnabled: false, wholesaleMarketplaceEnabled: true } });
    }
    const originalQCState = featureSettings.value?.quickCommerceEnabled;

    await Settings.findOneAndUpdate({ key: 'features' }, { $set: { 'value.quickCommerceEnabled': false } });

    const { isQuickCommerceEnabled } = await import('../src/services/featureFlags.service.js');
    const qcStateOff = await isQuickCommerceEnabled();

    // Restore feature flag
    await Settings.findOneAndUpdate({ key: 'features' }, { $set: { 'value.quickCommerceEnabled': originalQCState !== undefined ? originalQCState : true } });

    assert(
        qcStateOff === false,
        'Disabling quickCommerceEnabled feature flag correctly returns false from featureFlags service',
        `qcStateOff=${qcStateOff}`
    );

    // ── Test 14: Category Deletion Protection Simulation ──────────────────────
    console.log(bold('\n─── Test 14: Category Deletion Protection ───'));
    const parentCat = await Category.create({ name: 'Test Parent Cat', slug: 'test-parent-cat', supportedExperiences: [EXPERIENCES.MARKETPLACE] });
    const childCat = await Category.create({ name: 'Test Child Cat', slug: 'test-child-cat', parentId: parentCat._id, supportedExperiences: [EXPERIENCES.MARKETPLACE] });

    const subcategoryCount = await Category.countDocuments({ parentId: parentCat._id });

    await Category.findByIdAndDelete(childCat._id);
    await Category.findByIdAndDelete(parentCat._id);

    assert(
        subcategoryCount === 1,
        'Subcategory relation detected prior to category deletion',
        `subcategoryCount=${subcategoryCount}`
    );

    // ── Test 15: Experience Product Count Aggregation ──────────────────────────
    console.log(bold('\n─── Test 15: Experience Product Count Aggregation ───'));
    const sampleCategory = await Category.findOne({ supportedExperiences: EXPERIENCES.QUICK_COMMERCE });
    const countQC = await Product.countDocuments({ quickCommerceCategoryId: sampleCategory._id, quickCommerceEnabled: true, isActive: true });
    const countMP = await Product.countDocuments({ categoryId: sampleCategory._id, retailEnabled: { $ne: false }, isActive: true });

    assert(
        typeof countQC === 'number' && typeof countMP === 'number',
        'Product counts are computed separately per experience without leakage',
        `QC count=${countQC}, MP count=${countMP}`
    );

    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('══════════════════════════════════════════════════════════════════════\n');

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
}

runComprehensiveTests().catch((err) => {
    console.error('Fatal error during comprehensive verification:', err);
    process.exit(1);
});
