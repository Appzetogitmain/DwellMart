import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Category from '../src/models/Category.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const updated = await Category.updateMany(
        { name: { $regex: /test/i } },
        { $addToSet: { supportedExperiences: 'quick_commerce' } }
    );
    console.log('Updated categories:', updated);
    await mongoose.disconnect();
}
run();
