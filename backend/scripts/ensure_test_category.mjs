import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import mongoose from 'mongoose';
import Category from '../src/models/Category.model.js';
import { EXPERIENCES } from '../src/constants/experiences.js';

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    const existing = await Category.findOne({ name: { $regex: /^test$/i } });
    if (!existing) {
        const testCategory = await Category.create({
            _id: new mongoose.Types.ObjectId('6ab37664d423431bfd4aa9af'),
            name: 'test',
            slug: 'test',
            description: 'Test Category',
            isActive: true,
            displayOrder: 999,
            supportedExperiences: [EXPERIENCES.MARKETPLACE, EXPERIENCES.WHOLESALE],
            parentId: null
        });
        console.log('✅ Created test category:', testCategory);
    } else {
        existing.supportedExperiences = [EXPERIENCES.MARKETPLACE, EXPERIENCES.WHOLESALE];
        existing.isActive = true;
        await existing.save();
        console.log('✅ Updated test category:', existing);
    }
    await mongoose.disconnect();
}

main().catch(console.error);
