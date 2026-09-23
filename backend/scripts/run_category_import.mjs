import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import mongoose from 'mongoose';
import fs from 'fs';
import { processCategoryImport } from '../src/services/categoryImport.service.js';
import { EXPERIENCES } from '../src/constants/experiences.js';
import Category from '../src/models/Category.model.js';

async function main() {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB.');

    const filePath = 'C:/Users/RCom/Downloads/All_Marketplace_Categories_Import.xlsx';
    if (!fs.existsSync(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        process.exit(1);
    }

    const buffer = fs.readFileSync(filePath);
    console.log(`📦 Read file: ${filePath} (${buffer.length} bytes)`);

    const beforeCount = await Category.countDocuments({});
    console.log(`📊 Categories in DB before import: ${beforeCount}`);

    console.log('🚀 Processing category import...');
    const result = await processCategoryImport({
        buffer,
        defaultExperience: EXPERIENCES.MARKETPLACE
    });

    console.log('✅ Import result:', result);

    const afterCount = await Category.countDocuments({});
    console.log(`📊 Categories in DB after import: ${afterCount}`);

    // Verify "test" category is still there
    const testCat = await Category.findOne({ name: 'test' }).lean();
    console.log(`🔎 Category 'test' status:`, testCat ? {
        _id: testCat._id,
        name: testCat.name,
        supportedExperiences: testCat.supportedExperiences
    } : 'NOT FOUND');

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('❌ Import failed:', err);
    process.exit(1);
});
