import 'dotenv/config';
import mongoose from 'mongoose';
import { Product } from '../models/Product.model.js';
import { Category } from '../models/Category.model.js';

const MALE_REGEX = /\b(men|man|men's|mens|male|gent|gents|kurta for men|menswear)\b/i;
const FEMALE_REGEX = /\b(women|woman|women's|womens|lady|ladies|female|saree|sari|kurti|dress|dresses|lehenga|bra|lingerie|innerwear|gown|skirt|womenswear)\b/i;
const BOYS_REGEX = /\b(boys|boy)\b/i;
const GIRLS_REGEX = /\b(girls|girl)\b/i;
const KIDS_REGEX = /\b(kid|kids|baby|infant|toddler|children|child)\b/i;
const UNISEX_REGEX = /\b(unisex)\b/i;

async function backfill() {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/dwellmart';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected.');

    const categories = await Category.find({}).lean();
    const categoryMap = new Map();
    for (const cat of categories) {
        categoryMap.set(String(cat._id), cat.name.toLowerCase());
    }

    const products = await Product.find({}).select('_id name categoryId tags description gender').lean();
    console.log(`Analyzing ${products.length} products...`);

    const stats = {
        men: 0,
        women: 0,
        boys: 0,
        girls: 0,
        kids: 0,
        unisex: 0,
        all: 0,
        totalUpdated: 0,
    };

    const bulkOps = [];

    for (const p of products) {
        const catName = categoryMap.get(String(p.categoryId)) || '';
        const textToAnalyze = `${p.name || ''} ${catName} ${(p.tags || []).join(' ')}`.toLowerCase();

        let assignedGender = 'all';

        if (UNISEX_REGEX.test(textToAnalyze)) {
            assignedGender = 'unisex';
        } else if (BOYS_REGEX.test(textToAnalyze)) {
            assignedGender = 'boys';
        } else if (GIRLS_REGEX.test(textToAnalyze)) {
            assignedGender = 'girls';
        } else if (KIDS_REGEX.test(textToAnalyze)) {
            assignedGender = 'kids';
        } else if (MALE_REGEX.test(textToAnalyze) && !FEMALE_REGEX.test(textToAnalyze)) {
            assignedGender = 'men';
        } else if (FEMALE_REGEX.test(textToAnalyze) && !MALE_REGEX.test(textToAnalyze)) {
            assignedGender = 'women';
        } else if (MALE_REGEX.test(textToAnalyze) && FEMALE_REGEX.test(textToAnalyze)) {
            assignedGender = 'unisex';
        }

        stats[assignedGender]++;

        bulkOps.push({
            updateOne: {
                filter: { _id: p._id },
                update: { $set: { gender: assignedGender } },
            },
        });

        if (bulkOps.length >= 500) {
            await Product.bulkWrite(bulkOps);
            stats.totalUpdated += bulkOps.length;
            bulkOps.length = 0;
            console.log(`Processed ${stats.totalUpdated} / ${products.length}...`);
        }
    }

    if (bulkOps.length > 0) {
        await Product.bulkWrite(bulkOps);
        stats.totalUpdated += bulkOps.length;
    }

    console.log('Backfill finished successfully! Results:');
    console.log(stats);

    await mongoose.disconnect();
    process.exit(0);
}

backfill().catch((err) => {
    console.error('Backfill error:', err);
    process.exit(1);
});
