import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import mongoose from 'mongoose';
import Category from '../src/models/Category.model.js';
import Product from '../src/models/Product.model.js';

await mongoose.connect(process.env.MONGO_URI);
console.log('🔍 RUNNING COMPREHENSIVE FINAL VERIFICATION AUDIT...\n');

// 1. Total counts
const totalCategories = await Category.countDocuments();
const totalProducts = await Product.countDocuments();

console.log(`📊 Total Categories in DB: ${totalCategories}`);
console.log(`📊 Total Products in DB: ${totalProducts}`);

// 2. Experience breakdown
const mpRoots = await Category.find({ parentId: null, supportedExperiences: { $in: ['marketplace', 'wholesale'] } }).lean();
const qcRoots = await Category.find({ parentId: null, supportedExperiences: ['quick_commerce'] }).lean();

console.log(`\n🏛️ Marketplace Roots (${mpRoots.length}):`);
for (const r of mpRoots) {
    const l2 = await Category.find({ parentId: r._id }).lean();
    console.log(`  - ${r.name} (isActive: ${r.isActive}) -> ${l2.length} L2 subcategories`);
}

console.log(`\n⚡ Quick Commerce Roots (${qcRoots.length}):`);
for (const r of qcRoots) {
    const l2 = await Category.find({ parentId: r._id }).lean();
    console.log(`  - ${r.name} (isActive: ${r.isActive}) -> ${l2.length} L2 subcategories`);
}

// 3. Image audit
const missingImgs = await Category.find({
    $or: [{ image: null }, { image: '' }]
}).lean();
console.log(`\n🖼️ Categories with MISSING images: ${missingImgs.length}`);

// 4. Product Linkage Audit
const allCatIds = new Set((await Category.find({}, { _id: 1 }).lean()).map(c => String(c._id)));

const prods = await Product.find({}, { name: 1, categoryId: 1, quickCommerceCategoryId: 1 }).lean();
let unlinkedMarketplace = 0;
let invalidMarketplaceIds = 0;
let invalidQcIds = 0;
let onRootMarketplace = 0;

const mpRootIdSet = new Set(mpRoots.map(r => String(r._id)));

for (const p of prods) {
    if (!p.categoryId) {
        unlinkedMarketplace++;
    } else if (!allCatIds.has(String(p.categoryId))) {
        invalidMarketplaceIds++;
    } else if (mpRootIdSet.has(String(p.categoryId))) {
        onRootMarketplace++;
    }

    if (p.quickCommerceCategoryId && !allCatIds.has(String(p.quickCommerceCategoryId))) {
        invalidQcIds++;
    }
}

console.log(`\n📦 Product Audit:`);
console.log(`  - Orphaned Marketplace (null): ${unlinkedMarketplace}`);
console.log(`  - Invalid Category ID Pointers: ${invalidMarketplaceIds}`);
console.log(`  - Invalid QC Category ID Pointers: ${invalidQcIds}`);
console.log(`  - Products on Root Marketplace Category: ${onRootMarketplace}`);

// 5. Health & Wellness check
const hw = await Category.findOne({ name: 'Health & Wellness', parentId: null }).lean();
console.log(`\n🏥 Health & Wellness Root Status:`);
console.log(`  - Found: ${!!hw}`);
console.log(`  - isActive: ${hw?.isActive} (Should be false: ${hw?.isActive === false ? '✅ PASS' : '❌ FAIL'})`);

await mongoose.disconnect();
console.log('\n🏁 Audit complete.');
