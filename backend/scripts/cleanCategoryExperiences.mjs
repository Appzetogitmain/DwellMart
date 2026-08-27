import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const validExp = ['marketplace', 'quick_commerce', 'wholesale'];

async function cleanCategories() {
    const uri = process.env.MONGO_URI || 'mongodb+srv://DwellMart:DwellMart123456@cluster0.fg2wgjg.mongodb.net/DwellMart';
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    const collection = mongoose.connection.collection('categories');
    const cats = await collection.find({}).toArray();

    let updatedCount = 0;
    for (const cat of cats) {
        const exps = Array.isArray(cat.supportedExperiences) ? cat.supportedExperiences : [];
        const cleaned = [...new Set(exps.filter((e) => typeof e === 'string' && validExp.includes(e)))];
        if (cleaned.length === 0) {
            cleaned.push('marketplace');
        }

        if (JSON.stringify(exps) !== JSON.stringify(cleaned)) {
            await collection.updateOne(
                { _id: cat._id },
                { $set: { supportedExperiences: cleaned } }
            );
            updatedCount++;
        }
    }

    console.log(`Successfully cleaned up ${updatedCount} categories in database.`);
    await mongoose.disconnect();
}

cleanCategories().catch((err) => {
    console.error('Failed to clean categories:', err);
    process.exit(1);
});
