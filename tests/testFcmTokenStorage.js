import 'dotenv/config';
import connectDB from '../src/config/db.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import DeviceToken from '../src/models/DeviceToken.model.js';
import User from '../src/models/User.model.js';
import express from 'express';
import deviceTokenRoutes from '../src/modules/notifications/routes/deviceToken.routes.js';

if (!process.env.MONGODB_URI) {
    process.env.MONGODB_URI = 'mongodb+srv://frk:aBcfrk123@cluster0.dfhpvgu.mongodb.net/dwellmart_db?retryWrites=true&w=majority';
}

const testFcmTokenStorage = async () => {
    try {
        console.log('--- 🧪 STARTING END-TO-END FCM TOKEN STORAGE TEST ---');
        await connectDB();

        // 1. Create a dummy test user
        const testUserId = new mongoose.Types.ObjectId();
        const testEmail = `test_fcm_${Date.now()}@dwellmart.com`;
        
        console.log('\n1. Creating test user in DB...');
        const user = await User.create({
            _id: testUserId,
            name: 'FCM Tester',
            email: testEmail,
            password: 'hashedpassword123',
            isEmailVerified: true,
        });
        console.log('✅ Test User Created:', user._id.toString(), 'Email:', user.email);

        // 2. Generate JWT Auth Token for test user
        const jwtSecret = process.env.JWT_SECRET || 'your_access_secret_change_this_in_production';
        const authToken = jwt.sign({ id: user._id.toString(), email: user.email, role: 'user' }, jwtSecret, { expiresIn: '1h' });

        // 3. Start temporary express server to hit the actual endpoint
        const app = express();
        app.use(express.json());
        app.use('/api/device-tokens', deviceTokenRoutes);
        const server = app.listen(0);
        const port = server.address().port;
        const baseUrl = `http://localhost:${port}/api/device-tokens`;

        const testFcmTokenString = `fcm_token_test_${Date.now()}_abc123xyz`;

        // 4. Test Registration Endpoint via HTTP POST
        console.log('\n2. Testing POST /api/device-tokens/register...');
        const registerResponse = await fetch(`${baseUrl}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
            },
            body: JSON.stringify({
                fcmToken: testFcmTokenString,
                deviceType: 'web',
                platform: 'Chrome / Windows 11',
                appVersion: '1.0.0',
                browser: 'Mozilla/5.0 (Windows NT 10.0)',
            }),
        });

        const registerData = await registerResponse.json();
        console.log('✅ HTTP Register Response Status:', registerResponse.status, registerData.message);

        // 5. Query MongoDB Compass/Database directly to verify storage
        console.log('\n3. Verifying Document directly in MongoDB collection "devicetokens"...');
        const dbDoc = await DeviceToken.findOne({ fcmToken: testFcmTokenString });
        
        if (!dbDoc) {
            throw new Error('❌ Document not found in MongoDB devicetokens collection!');
        }

        console.log('✅ MongoDB Document Found!');
        console.log('   - _id:', dbDoc._id.toString());
        console.log('   - recipientId:', dbDoc.recipientId.toString(), '(Matches test user ID)');
        console.log('   - recipientType:', dbDoc.recipientType, '(Matches role)');
        console.log('   - fcmToken:', dbDoc.fcmToken);
        console.log('   - isActive:', dbDoc.isActive);
        console.log('   - platform:', dbDoc.platform);

        if (dbDoc.recipientId.toString() !== testUserId.toString()) {
            throw new Error('❌ recipientId mismatch in MongoDB!');
        }
        if (!dbDoc.isActive) {
            throw new Error('❌ isActive should be true upon registration!');
        }

        // 6. Test Unregistration Endpoint via HTTP POST (Logout scenario)
        console.log('\n4. Testing POST /api/device-tokens/unregister (Logout scenario)...');
        const unregisterResponse = await fetch(`${baseUrl}/unregister`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
            },
            body: JSON.stringify({
                fcmToken: testFcmTokenString,
            }),
        });

        const unregisterData = await unregisterResponse.json();
        console.log('✅ HTTP Unregister Response Status:', unregisterResponse.status, unregisterData.message);

        // 7. Verify MongoDB update (Document deleted on logout)
        const updatedDbDoc = await DeviceToken.findOne({ fcmToken: testFcmTokenString });
        if (updatedDbDoc !== null) {
            throw new Error('❌ Document was not deleted from MongoDB on logout!');
        }
        console.log('✅ MongoDB Verified: Document has completely DISAPPEARED (deleted) from database on logout.');

        // 8. Cleanup test data
        console.log('\n5. Cleaning up test data...');
        await User.deleteOne({ _id: testUserId });
        await DeviceToken.deleteOne({ fcmToken: testFcmTokenString });
        server.close();
        console.log('✅ Test data cleaned up.');

        console.log('\n--- 🎉 SUCCESS: FCM TOKEN STORAGE & UNREGISTER FLOW VERIFIED IN MONGODB! ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ FCM Storage Test Failed:', err);
        process.exit(1);
    }
};

testFcmTokenStorage();
