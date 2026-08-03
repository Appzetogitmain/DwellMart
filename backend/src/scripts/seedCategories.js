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

// ── 1. Quick Commerce Categories (21 Main Categories & ~100 Subcategories) ────
const EXPRESS_CATEGORIES_TREE = [
    {
        name: 'Fresh Fruits & Vegetables',
        slug: 'fresh-fruits-vegetables',
        displayOrder: 1,
        image: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Fresh Fruits', slug: 'fresh-fruits' },
            { name: 'Fresh Vegetables', slug: 'fresh-vegetables' },
            { name: 'Exotic Fruits', slug: 'exotic-fruits' },
            { name: 'Exotic Vegetables', slug: 'exotic-vegetables' },
            { name: 'Organic Produce', slug: 'organic-produce' },
            { name: 'Fresh Herbs', slug: 'fresh-herbs' },
            { name: 'Cut & Peeled Vegetables', slug: 'cut-peeled-vegetables' },
            { name: 'Salads', slug: 'salads' },
            { name: 'Sprouts', slug: 'sprouts' },
            { name: 'Mushrooms', slug: 'mushrooms' },
        ],
    },
    {
        name: 'Dairy, Bread & Eggs',
        slug: 'dairy-bread-eggs',
        displayOrder: 2,
        image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Milk', slug: 'milk' },
            { name: 'Curd & Yogurt', slug: 'curd-yogurt' },
            { name: 'Butter', slug: 'butter' },
            { name: 'Cheese', slug: 'cheese' },
            { name: 'Paneer', slug: 'paneer' },
            { name: 'Cream', slug: 'cream' },
            { name: 'Ghee', slug: 'ghee' },
            { name: 'Eggs', slug: 'eggs' },
            { name: 'Bread', slug: 'bread' },
            { name: 'Buns', slug: 'buns' },
            { name: 'Pav', slug: 'pav' },
            { name: 'Brown Bread', slug: 'brown-bread' },
            { name: 'Garlic Bread', slug: 'garlic-bread' },
            { name: 'Cakes', slug: 'cakes' },
            { name: 'Muffins', slug: 'muffins' },
            { name: 'Croissants', slug: 'croissants' },
        ],
    },
    {
        name: 'Atta, Rice & Staples',
        slug: 'atta-rice-staples',
        displayOrder: 3,
        image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Wheat Flour', slug: 'wheat-flour' },
            { name: 'Multigrain Flour', slug: 'multigrain-flour' },
            { name: 'Rice', slug: 'rice' },
            { name: 'Basmati Rice', slug: 'basmati-rice' },
            { name: 'Brown Rice', slug: 'brown-rice' },
            { name: 'Pulses', slug: 'pulses' },
            { name: 'Lentils', slug: 'lentils' },
            { name: 'Beans', slug: 'beans' },
            { name: 'Poha', slug: 'poha' },
            { name: 'Suji', slug: 'suji' },
            { name: 'Besan', slug: 'besan' },
            { name: 'Vermicelli', slug: 'vermicelli' },
            { name: 'Soya Chunks', slug: 'soya-chunks' },
        ],
    },
    {
        name: 'Oils & Ghee',
        slug: 'oils-ghee',
        displayOrder: 4,
        image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Mustard Oil', slug: 'mustard-oil' },
            { name: 'Sunflower Oil', slug: 'sunflower-oil' },
            { name: 'Groundnut Oil', slug: 'groundnut-oil' },
            { name: 'Olive Oil', slug: 'olive-oil' },
            { name: 'Coconut Oil', slug: 'coconut-oil' },
            { name: 'Rice Bran Oil', slug: 'rice-bran-oil' },
            { name: 'Desi Ghee', slug: 'desi-ghee' },
            { name: 'Vanaspati', slug: 'vanaspati' },
        ],
    },
    {
        name: 'Spices & Masalas',
        slug: 'spices-masalas',
        displayOrder: 5,
        image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Whole Spices', slug: 'whole-spices' },
            { name: 'Powder Spices', slug: 'powder-spices' },
            { name: 'Garam Masala', slug: 'garam-masala' },
            { name: 'Kitchen King', slug: 'kitchen-king' },
            { name: 'Chaat Masala', slug: 'chaat-masala' },
            { name: 'Ginger Garlic Paste', slug: 'ginger-garlic-paste' },
            { name: 'Pickles', slug: 'pickles' },
            { name: 'Papad', slug: 'papad' },
        ],
    },
    {
        name: 'Dry Fruits & Nuts',
        slug: 'dry-fruits-nuts',
        displayOrder: 6,
        image: 'https://images.unsplash.com/photo-1509358271058-acd01cc9386a?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Almonds', slug: 'almonds' },
            { name: 'Cashews', slug: 'cashews' },
            { name: 'Pistachios', slug: 'pistachios' },
            { name: 'Raisins', slug: 'raisins' },
            { name: 'Walnuts', slug: 'walnuts' },
            { name: 'Dates', slug: 'dates' },
            { name: 'Seeds', slug: 'seeds' },
            { name: 'Trail Mix', slug: 'trail-mix' },
        ],
    },
    {
        name: 'Snacks & Namkeen',
        slug: 'snacks-namkeen',
        displayOrder: 7,
        image: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Chips', slug: 'chips' },
            { name: 'Namkeen', slug: 'namkeen' },
            { name: 'Bhujia', slug: 'bhujia' },
            { name: 'Popcorn', slug: 'popcorn' },
            { name: 'Khakhra', slug: 'khakhra' },
            { name: 'Nachos', slug: 'nachos' },
            { name: 'Roasted Snacks', slug: 'roasted-snacks' },
        ],
    },
    {
        name: 'Biscuits & Cookies',
        slug: 'biscuits-cookies',
        displayOrder: 8,
        image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Glucose Biscuits', slug: 'glucose-biscuits' },
            { name: 'Cream Biscuits', slug: 'cream-biscuits' },
            { name: 'Digestive Biscuits', slug: 'digestive-biscuits' },
            { name: 'Cookies', slug: 'cookies' },
            { name: 'Rusks', slug: 'rusks' },
        ],
    },
    {
        name: 'Chocolates & Sweets',
        slug: 'chocolates-sweets',
        displayOrder: 9,
        image: 'https://images.unsplash.com/photo-1511381939415-e44015466834?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Chocolates', slug: 'chocolates' },
            { name: 'Candy', slug: 'candy' },
            { name: 'Gummies', slug: 'gummies' },
            { name: 'Traditional Sweets', slug: 'traditional-sweets' },
            { name: 'Gift Boxes', slug: 'gift-boxes' },
        ],
    },
    {
        name: 'Beverages',
        slug: 'beverages',
        displayOrder: 10,
        image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Soft Drinks', slug: 'soft-drinks' },
            { name: 'Juices', slug: 'juices' },
            { name: 'Energy Drinks', slug: 'energy-drinks' },
            { name: 'Coconut Water', slug: 'coconut-water' },
            { name: 'Soda', slug: 'soda' },
            { name: 'Flavoured Water', slug: 'flavoured-water' },
        ],
    },
    {
        name: 'Tea, Coffee & Health Drinks',
        slug: 'tea-coffee-health-drinks',
        displayOrder: 11,
        image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Tea', slug: 'tea' },
            { name: 'Green Tea', slug: 'green-tea' },
            { name: 'Coffee', slug: 'coffee' },
            { name: 'Instant Coffee', slug: 'instant-coffee' },
            { name: 'Protein Drinks', slug: 'protein-drinks' },
            { name: 'Malt Drinks', slug: 'malt-drinks' },
            { name: 'Health Supplements', slug: 'health-supplements' },
        ],
    },
    {
        name: 'Instant Food',
        slug: 'instant-food',
        displayOrder: 12,
        image: 'https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Noodles', slug: 'noodles' },
            { name: 'Pasta', slug: 'pasta' },
            { name: 'Soup', slug: 'soup' },
            { name: 'Ready-to-Eat Meals', slug: 'ready-to-eat-meals' },
            { name: 'Frozen Snacks', slug: 'frozen-snacks' },
            { name: 'Frozen Vegetables', slug: 'frozen-vegetables' },
        ],
    },
    {
        name: 'Meat, Fish & Eggs',
        slug: 'meat-fish-eggs',
        displayOrder: 13,
        image: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Chicken', slug: 'chicken' },
            { name: 'Mutton', slug: 'mutton' },
            { name: 'Fish', slug: 'fish' },
            { name: 'Seafood', slug: 'seafood' },
            { name: 'Eggs', slug: 'meat-eggs' },
            { name: 'Frozen Meat', slug: 'frozen-meat' },
        ],
    },
    {
        name: 'Baby Care',
        slug: 'baby-care',
        displayOrder: 14,
        image: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Baby Food', slug: 'baby-food' },
            { name: 'Baby Diapers', slug: 'baby-diapers' },
            { name: 'Baby Wipes', slug: 'baby-wipes' },
            { name: 'Baby Shampoo', slug: 'baby-shampoo' },
            { name: 'Baby Lotion', slug: 'baby-lotion' },
            { name: 'Baby Toys', slug: 'baby-toys' },
            { name: 'Feeding Bottles', slug: 'feeding-bottles' },
        ],
    },
    {
        name: 'Personal Care',
        slug: 'personal-care',
        displayOrder: 15,
        image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Shampoo', slug: 'shampoo' },
            { name: 'Soap', slug: 'soap' },
            { name: 'Face Wash', slug: 'face-wash' },
            { name: 'Toothpaste', slug: 'toothpaste' },
            { name: 'Toothbrush', slug: 'toothbrush' },
            { name: 'Hair Oil', slug: 'hair-oil' },
            { name: 'Deodorants', slug: 'deodorants' },
            { name: 'Perfumes', slug: 'perfumes' },
            { name: 'Sanitary Pads', slug: 'sanitary-pads' },
            { name: 'Men’s Grooming', slug: 'mens-grooming' },
        ],
    },
    {
        name: 'Beauty & Cosmetics',
        slug: 'beauty-cosmetics',
        displayOrder: 16,
        image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Makeup', slug: 'makeup' },
            { name: 'Lipstick', slug: 'lipstick' },
            { name: 'Foundation', slug: 'foundation' },
            { name: 'Face Cream', slug: 'face-cream' },
            { name: 'Sunscreen', slug: 'sunscreen' },
            { name: 'Skin Care', slug: 'skin-care' },
            { name: 'Hair Colour', slug: 'hair-colour' },
            { name: 'Beauty Tools', slug: 'beauty-tools' },
        ],
    },
    {
        name: 'Health & Wellness',
        slug: 'health-wellness',
        displayOrder: 17,
        image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Vitamins', slug: 'vitamins' },
            { name: 'Protein Powder', slug: 'protein-powder' },
            { name: 'Ayurvedic Products', slug: 'ayurvedic-products' },
            { name: 'Medical Devices', slug: 'medical-devices' },
            { name: 'BP Monitor', slug: 'bp-monitor' },
            { name: 'Glucometer', slug: 'glucometer' },
            { name: 'First Aid', slug: 'first-aid' },
            { name: 'OTC Medicines', slug: 'otc-medicines' },
        ],
    },
    {
        name: 'Household Cleaning',
        slug: 'cleaning-supplies',
        displayOrder: 18,
        image: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Detergents', slug: 'detergents' },
            { name: 'Dishwash', slug: 'dishwash' },
            { name: 'Floor Cleaner', slug: 'floor-cleaner' },
            { name: 'Toilet Cleaner', slug: 'toilet-cleaner' },
            { name: 'Glass Cleaner', slug: 'glass-cleaner' },
            { name: 'Cleaning Tools', slug: 'cleaning-tools' },
            { name: 'Garbage Bags', slug: 'garbage-bags' },
        ],
    },
    {
        name: 'Pet Care',
        slug: 'pet-care',
        displayOrder: 19,
        image: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Dog Food', slug: 'dog-food' },
            { name: 'Cat Food', slug: 'cat-food' },
            { name: 'Pet Medicines', slug: 'pet-medicines' },
            { name: 'Pet Toys', slug: 'pet-toys' },
            { name: 'Grooming Products', slug: 'pet-grooming-products' },
        ],
    },
    {
        name: 'Flowers & Gifts',
        slug: 'flowers-gifts',
        displayOrder: 20,
        image: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Fresh Flowers', slug: 'fresh-flowers' },
            { name: 'Bouquets', slug: 'bouquets' },
            { name: 'Cakes', slug: 'gift-cakes' },
            { name: 'Greeting Cards', slug: 'greeting-cards' },
            { name: 'Gift Hampers', slug: 'gift-hampers' },
        ],
    },
    {
        name: 'Paan Corner',
        slug: 'paan-corner',
        displayOrder: 21,
        image: 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Paan', slug: 'paan' },
            { name: 'Mouth Fresheners', slug: 'mouth-fresheners' },
            { name: 'Cigarettes', slug: 'cigarettes' },
            { name: 'Tobacco Products', slug: 'tobacco-products' },
            { name: 'Lighters', slug: 'lighters' },
        ],
    },
];

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

    // ── 1. Seed Quick Commerce Category Tree (Roots + Subcategories) ──────────
    for (const mainCat of EXPRESS_CATEGORIES_TREE) {
        let parentDoc = await Category.findOne({ slug: mainCat.slug });
        if (parentDoc) {
            parentDoc.name = mainCat.name;
            parentDoc.supportedExperiences = Array.from(new Set([...(parentDoc.supportedExperiences || []), EXPERIENCES.QUICK_COMMERCE]));
            parentDoc.displayOrder = mainCat.displayOrder;
            if (mainCat.image) parentDoc.image = mainCat.image;
            parentDoc.parentId = null;
            await parentDoc.save();
            updatedCount++;
        } else {
            parentDoc = await Category.create({
                name: mainCat.name,
                slug: mainCat.slug,
                displayOrder: mainCat.displayOrder,
                image: mainCat.image,
                parentId: null,
                supportedExperiences: [EXPERIENCES.QUICK_COMMERCE],
            });
            createdCount++;
        }

        if (Array.isArray(mainCat.subcategories)) {
            let subOrder = 1;
            for (const subCat of mainCat.subcategories) {
                const subImage = subCat.image || parentDoc.image || '';
                let subDoc = await Category.findOne({ slug: subCat.slug });
                if (subDoc) {
                    subDoc.name = subCat.name;
                    subDoc.parentId = parentDoc._id;
                    subDoc.supportedExperiences = Array.from(new Set([...(subDoc.supportedExperiences || []), EXPERIENCES.QUICK_COMMERCE]));
                    subDoc.displayOrder = subOrder++;
                    if (subImage) subDoc.image = subImage;
                    await subDoc.save();
                    updatedCount++;
                } else {
                    await Category.create({
                        name: subCat.name,
                        slug: subCat.slug,
                        displayOrder: subOrder++,
                        parentId: parentDoc._id,
                        image: subImage,
                        supportedExperiences: [EXPERIENCES.QUICK_COMMERCE],
                    });
                    createdCount++;
                }
            }
        }
    }

    // ── 2. Seed Marketplace & Wholesale Categories ───────────────────────────
    const OTHER_CATEGORIES = [...MARKETPLACE_CATEGORIES, ...WHOLESALE_CATEGORIES];
    for (const catData of OTHER_CATEGORIES) {
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

    return { createdCount, updatedCount };
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
