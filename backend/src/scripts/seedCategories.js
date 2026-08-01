import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Category from '../models/Category.model.js';
import Product from '../models/Product.model.js';
import { EXPERIENCES } from '../constants/experiences.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const createSlug = (name) =>
    name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-');

// ── 1. Quick Commerce Categories (20) ─────────────────────────────────────────
const QUICK_COMMERCE_CATEGORIES = [
    { name: 'Fresh Fruits & Vegetables', slug: 'fresh-fruits-vegetables', displayOrder: 1, image: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=400&q=80' },
    { name: 'Dairy, Bread & Eggs', slug: 'dairy-bread-eggs', displayOrder: 2, image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=400&q=80' },
    { name: 'Atta, Rice & Staples', slug: 'atta-rice-staples', displayOrder: 3, image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=400&q=80' },
    { name: 'Oils & Ghee', slug: 'oils-ghee', displayOrder: 4, image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=400&q=80' },
    { name: 'Spices & Masalas', slug: 'spices-masalas', displayOrder: 5, image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=400&q=80' },
    { name: 'Dry Fruits & Nuts', slug: 'dry-fruits-nuts', displayOrder: 6, image: 'https://images.unsplash.com/photo-1509358271058-acd01cc9386a?auto=format&fit=crop&w=400&q=80' },
    { name: 'Snacks & Namkeen', slug: 'snacks-namkeen', displayOrder: 7, image: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?auto=format&fit=crop&w=400&q=80' },
    { name: 'Biscuits & Cookies', slug: 'biscuits-cookies', displayOrder: 8, image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=400&q=80' },
    { name: 'Chocolates & Sweets', slug: 'chocolates-sweets', displayOrder: 9, image: 'https://images.unsplash.com/photo-1511381939415-e44015466834?auto=format&fit=crop&w=400&q=80' },
    { name: 'Beverages', slug: 'beverages', displayOrder: 10, image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=400&q=80' },
    { name: 'Frozen Food', slug: 'frozen-food', displayOrder: 11, image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80' },
    { name: 'Instant Food', slug: 'instant-food', displayOrder: 12, image: 'https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=400&q=80' },
    { name: 'Personal Care', slug: 'personal-care', displayOrder: 13, image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=400&q=80' },
    { name: 'Baby Care', slug: 'baby-care', displayOrder: 14, image: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=400&q=80' },
    { name: 'Pet Care', slug: 'pet-care', displayOrder: 15, image: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&w=400&q=80' },
    { name: 'Cleaning Supplies', slug: 'cleaning-supplies', displayOrder: 16, image: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80' },
    { name: 'Home Essentials', slug: 'home-essentials', displayOrder: 17, image: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=400&q=80' },
    { name: 'Stationery', slug: 'stationery', displayOrder: 18, image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=400&q=80' },
    { name: 'Medicines & Wellness', slug: 'medicines-wellness', displayOrder: 19, image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80' },
    { name: 'Organic Food', slug: 'organic-food', displayOrder: 20, image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80' },
].map((item) => ({ ...item, supportedExperiences: [EXPERIENCES.QUICK_COMMERCE] }));

// ── 2. Marketplace B2C Categories (14) ───────────────────────────────────────
const MARKETPLACE_CATEGORIES = [
    { name: 'Electronics', slug: 'electronics', displayOrder: 1, image: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=400&q=80' },
    { name: 'Mobiles & Accessories', slug: 'mobiles-accessories', displayOrder: 2, image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=400&q=80' },
    { name: 'Computers & Laptops', slug: 'computers-laptops', displayOrder: 3, image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=400&q=80' },
    { name: 'Fashion & Apparel', slug: 'fashion-apparel', displayOrder: 4, image: 'https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=400&q=80' },
    { name: "Men's Fashion", slug: 'mens-fashion', displayOrder: 5, image: 'https://images.unsplash.com/photo-1617137968427-85924c800a22?auto=format&fit=crop&w=400&q=80' },
    { name: "Women's Fashion", slug: 'womens-fashion', displayOrder: 6, image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=400&q=80' },
    { name: 'Kids Fashion', slug: 'kids-fashion', displayOrder: 7, image: 'https://images.unsplash.com/photo-1514090458221-65bb69cf63e6?auto=format&fit=crop&w=400&q=80' },
    { name: 'Home & Kitchen', slug: 'home-kitchen', displayOrder: 8, image: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=400&q=80' },
    { name: 'Furniture', slug: 'furniture', displayOrder: 9, image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=400&q=80' },
    { name: 'Home Appliances', slug: 'home-appliances', displayOrder: 10, image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=400&q=80' },
    { name: 'Beauty & Grooming', slug: 'beauty-grooming', displayOrder: 11, image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=400&q=80' },
    { name: 'Sports & Fitness', slug: 'sports-fitness', displayOrder: 12, image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=400&q=80' },
    { name: 'Books & Media', slug: 'books-media', displayOrder: 13, image: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=400&q=80' },
    { name: 'Automotive Accessories', slug: 'automotive-accessories', displayOrder: 14, image: 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=400&q=80' },
].map((item) => ({ ...item, supportedExperiences: [EXPERIENCES.MARKETPLACE] }));

// ── 3. Wholesale B2B Categories (8) ──────────────────────────────────────────
const WHOLESALE_CATEGORIES = [
    { name: 'Industrial Tools & Equipment', slug: 'industrial-tools', displayOrder: 1, image: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=400&q=80' },
    { name: 'Packaging Materials', slug: 'packaging-materials', displayOrder: 2, image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=400&q=80' },
    { name: 'Construction Supplies', slug: 'construction-supplies', displayOrder: 3, image: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=400&q=80' },
    { name: 'Agriculture & Farming', slug: 'agriculture-farming', displayOrder: 4, image: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=400&q=80' },
    { name: 'Wholesale Groceries', slug: 'wholesale-groceries', displayOrder: 5, image: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=400&q=80', supportedExperiences: [EXPERIENCES.MARKETPLACE, EXPERIENCES.WHOLESALE] },
    { name: 'Heavy Machinery', slug: 'heavy-machinery', displayOrder: 6, image: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80' },
    { name: 'Medical Supplies', slug: 'medical-supplies', displayOrder: 7, image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80' },
    { name: 'Office Supplies & Stationery', slug: 'office-supplies', displayOrder: 8, image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=400&q=80' },
].map((item) => ({ ...item, supportedExperiences: item.supportedExperiences || [EXPERIENCES.WHOLESALE] }));

const ALL_SEED_CATEGORIES = [
    ...QUICK_COMMERCE_CATEGORIES,
    ...MARKETPLACE_CATEGORIES,
    ...WHOLESALE_CATEGORIES,
];

export const seedCategoriesInDb = async () => {
    let createdCount = 0;
    let updatedCount = 0;

    // ── 0. Cleanup Legacy Duplicate Slugs ──────────────────────────────────────
    const duplicateGroups = await Category.aggregate([
        { $group: { _id: '$slug', count: { $sum: 1 }, ids: { $push: '$_id' }, exps: { $push: '$supportedExperiences' }, legacyExps: { $push: '$experience' } } },
        { $match: { count: { $gt: 1 } } },
    ]);

    for (const group of duplicateGroups) {
        const [primaryId, ...duplicateIds] = group.ids;
        const allExperiences = new Set();
        group.exps.forEach((expArr) => {
            if (Array.isArray(expArr)) expArr.forEach((e) => e && allExperiences.add(e));
        });
        group.legacyExps.forEach((e) => e && allExperiences.add(e));

        const mergedExperiences = Array.from(allExperiences);
        if (mergedExperiences.length === 0) mergedExperiences.push(EXPERIENCES.MARKETPLACE);

        await Category.findByIdAndUpdate(primaryId, {
            $set: { supportedExperiences: mergedExperiences },
        });

        if (duplicateIds.length > 0) {
            // Re-point product category references to primary ID
            await mongoose.model('Product').updateMany(
                { categoryId: { $in: duplicateIds } },
                { $set: { categoryId: primaryId } }
            );
            await mongoose.model('Product').updateMany(
                { quickCommerceCategoryId: { $in: duplicateIds } },
                { $set: { quickCommerceCategoryId: primaryId } }
            );
            // Delete secondary duplicates
            await Category.deleteMany({ _id: { $in: duplicateIds } });
        }
    }

    for (const catData of ALL_SEED_CATEGORIES) {
        const existing = await Category.findOne({ slug: catData.slug });
        if (existing) {
            existing.name = catData.name;
            existing.supportedExperiences = Array.from(new Set([...(existing.supportedExperiences || []), ...catData.supportedExperiences]));
            existing.displayOrder = catData.displayOrder;
            if (catData.image) existing.image = catData.image;
            await existing.save();
            updatedCount++;
        } else {
            await Category.create(catData);
            createdCount++;
        }
    }

    return { createdCount, updatedCount, total: ALL_SEED_CATEGORIES.length };
};

async function main() {
    console.log('\n🌱  Seeding experience-based category architecture...\n');

    if (!process.env.MONGO_URI) {
        console.error('MONGO_URI is not set in environment variables.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB.');

    const stats = await seedCategoriesInDb();

    console.log(`✅  Seeding completed: ${stats.createdCount} created, ${stats.updatedCount} updated (${stats.total} total).\n`);

    await mongoose.disconnect();
    process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith('seedCategories.js')) {
    main().catch((err) => {
        console.error('Fatal error during category seeding:', err);
        process.exit(1);
    });
}
