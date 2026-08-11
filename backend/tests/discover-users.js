import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGO_URI);

try {
    const models = [
        '../src/modules/admin/models/Admin.model.js',
        '../src/models/Admin.model.js',
        '../src/modules/admin/Admin.model.js',
    ];
    for (const m of models) {
        try {
            const mod = await import(m);
            const AdminModel = mod.default;
            const admins = await AdminModel.find({}).select('email role name').limit(3).lean();
            console.log(`Found Admin model at ${m}:`, JSON.stringify(admins, null, 2));
            break;
        } catch (e) {
            // try next
        }
    }
} catch (e) {
    console.log('Admin find error:', e.message);
}

await mongoose.disconnect();
process.exit(0);
