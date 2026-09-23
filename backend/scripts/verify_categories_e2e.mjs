import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import mongoose from 'mongoose';
import Category from '../src/models/Category.model.js';
import Product from '../src/models/Product.model.js';
import { EXPERIENCES } from '../src/constants/experiences.js';

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB.');

    // 1. Verify Category count
    const totalCats = await Category.countDocuments({});
    const totalProducts = await Product.countDocuments({});
    const nullCatProducts = await Product.countDocuments({ categoryId: null });

    console.log(`📊 Total Categories: ${totalCats}`);
    console.log(`📦 Total Products: ${totalProducts}`);
    console.log(`🚫 Products with null categoryId: ${nullCatProducts}`);

    // 2. Verify "test" category
    const testCat = await Category.findOne({ name: 'test' }).lean();
    console.log(`🔎 Category 'test':`, testCat ? {
        id: testCat._id,
        name: testCat.name,
        slug: testCat.slug,
        supportedExperiences: testCat.supportedExperiences,
        isActive: testCat.isActive
    } : 'NOT FOUND');

    // 3. Test Wholesale Public Categories query logic (same as public.routes.js)
    const wholesaleFilter = {
        isActive: true,
        supportedExperiences: { $in: [EXPERIENCES.WHOLESALE, EXPERIENCES.MARKETPLACE] }
    };
    const wholesaleCategories = await Category.find(wholesaleFilter).lean();
    console.log(`🏬 Wholesale Eligible Categories count: ${wholesaleCategories.length}`);

    // 4. Test Marketplace Public Categories query logic
    const marketplaceFilter = {
        isActive: true,
        supportedExperiences: { $in: [EXPERIENCES.MARKETPLACE, EXPERIENCES.WHOLESALE] }
    };
    const marketplaceCategories = await Category.find(marketplaceFilter).lean();
    console.log(`🛒 Marketplace Eligible Categories count: ${marketplaceCategories.length}`);

    // 5. Check if wholesale and marketplace have identical category lists
    const wsSlugs = new Set(wholesaleCategories.map(c => c.slug));
    const mpSlugs = new Set(marketplaceCategories.map(c => c.slug));
    const sameSlugs = wsSlugs.size === mpSlugs.size && [...wsSlugs].every(s => mpSlugs.has(s));
    console.log(`✨ Wholesale & Marketplace Category Parity: ${sameSlugs ? 'PERFECT 100% IDENTICAL' : 'DIFFERENCE DETECTED'}`);

    // 6. Test Product count aggregation for Wholesale vs Marketplace
    const wsProductCount = await Product.countDocuments({
        categoryId: { $ne: null },
        wholesaleEnabled: true,
        isDeleted: { $ne: true }
    });
    const mpProductCount = await Product.countDocuments({
        categoryId: { $ne: null },
        retailEnabled: { $ne: false },
        isDeleted: { $ne: true }
    });
    console.log(`📊 Products with category in Wholesale: ${wsProductCount}`);
    console.log(`📊 Products with category in Marketplace (Retail): ${mpProductCount}`);

    // 7. Test sample categories (e.g. Cookware, Frying Pans, Loafers, test)
    const checkNames = ['Cookware', 'Frying Pans', 'Loafers', 'Handbags', 'test'];
    for (const name of checkNames) {
        const found = await Category.findOne({ name: new RegExp(`^${name}$`, 'i') }).lean();
        if (found) {
            const prodCount = await Product.countDocuments({ categoryId: found._id });
            console.log(`  - Category "${found.name}" (${found._id}): supportedExperiences = ${JSON.stringify(found.supportedExperiences)}, linked products = ${prodCount}`);
        } else {
            console.log(`  - Category "${name}": NOT FOUND`);
        }
    }

    await mongoose.disconnect();
}

main().catch(console.error);
