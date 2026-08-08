import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function fixUserAddressToIndore() {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

    // Dynamic model loading
    const User = (await import('./models/User.model.js')).default;

    // Find all users with addresses
    const users = await User.find({
        'addresses.0': { $exists: true }
    }).lean();

    console.log(`Found ${users.length} users with addresses`);

    for (const user of users) {
        console.log(`\nUser: ${user.email} (${user._id})`);
        console.log(`  Addresses (${user.addresses?.length || 0}):`);
        user.addresses?.forEach((addr, i) => {
            console.log(`    [${i}] ${addr.label || 'unlabeled'}: ${addr.street || ''} ${addr.city || ''} - lat: ${addr.latitude}, lng: ${addr.longitude}`);
        });

        // Update all addresses to Indore coordinates for testing
        const updatedAddresses = user.addresses.map(addr => ({
            ...addr,
            city: 'Indore',
            state: 'Madhya Pradesh',
            latitude: 22.7196,
            longitude: 75.8577,
            pincode: addr.pincode || '452001',
        }));

        await User.findByIdAndUpdate(user._id, {
            $set: { addresses: updatedAddresses }
        });

        console.log(`  ✓ Updated ${updatedAddresses.length} addresses to Indore (22.7196, 75.8577)`);
    }

    console.log('\n✅ All user addresses updated to Indore coordinates for Quick Commerce testing!');
    await mongoose.disconnect();
}

fixUserAddressToIndore().catch(console.error);
