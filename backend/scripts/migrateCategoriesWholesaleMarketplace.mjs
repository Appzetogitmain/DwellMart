import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import mongoose from 'mongoose';
import Category from '../src/models/Category.model.js';
import { EXPERIENCES } from '../src/constants/experiences.js';

async function migrate() {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB.');

    // 1. Add 'wholesale' to categories that have 'marketplace' but not 'wholesale'
    const mpWithoutWs = await Category.updateMany(
        {
            supportedExperiences: EXPERIENCES.MARKETPLACE,
            $nor: [{ supportedExperiences: EXPERIENCES.WHOLESALE }],
        },
        {
            $addToSet: { supportedExperiences: EXPERIENCES.WHOLESALE },
        }
    );
    console.log(`📦 Added 'wholesale' to ${mpWithoutWs.modifiedCount} marketplace categories.`);

    // 2. Add 'marketplace' to categories that have 'wholesale' but not 'marketplace'
    const wsWithoutMp = await Category.updateMany(
        {
            supportedExperiences: EXPERIENCES.WHOLESALE,
            $nor: [{ supportedExperiences: EXPERIENCES.MARKETPLACE }],
        },
        {
            $addToSet: { supportedExperiences: EXPERIENCES.MARKETPLACE },
        }
    );
    console.log(`🏬 Added 'marketplace' to ${wsWithoutMp.modifiedCount} wholesale categories (including 'test').`);

    // Verify "test" category specifically
    const testCat = await Category.findOne({ name: 'test' }).lean();
    if (testCat) {
        console.log(`🔎 Category 'test' updated:`, {
            name: testCat.name,
            slug: testCat.slug,
            supportedExperiences: testCat.supportedExperiences,
            isActive: testCat.isActive,
        });
    }

    // Print summary aggregation
    const summary = await Category.aggregate([
        { $group: { _id: '$supportedExperiences', count: { $sum: 1 } } }
    ]);
    console.log('📊 Current Category Distribution by supportedExperiences:');
    console.log(JSON.stringify(summary, null, 2));

    process.exit(0);
}

migrate().catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
