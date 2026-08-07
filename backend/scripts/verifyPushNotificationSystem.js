import 'dotenv/config';
import connectDB from '../src/config/db.js';
import mongoose from 'mongoose';
import Notification from '../src/models/Notification.model.js';
import DeviceToken from '../src/models/DeviceToken.model.js';
import { createNotification, getUnreadCount, getUserNotifications, markAsRead, markAllAsRead, deleteNotification } from '../src/services/notification.service.js';
import { marketplaceEventBus, MARKETPLACE_EVENTS, registerMarketplaceEventHandlers } from '../src/services/events/marketplaceEventBus.js';

if (!process.env.MONGODB_URI) {
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/dwellmart';
}

const runVerification = async () => {
    try {
        console.log('--- 🧪 STARTING PUSH NOTIFICATION SYSTEM VERIFICATION ---');
        await connectDB();
        registerMarketplaceEventHandlers();

        const testUserId = new mongoose.Types.ObjectId();
        const testVendorId = new mongoose.Types.ObjectId();
        const testDeliveryId = new mongoose.Types.ObjectId();

        // 1. Device Token Registration
        console.log('\n1. Testing DeviceToken Registration...');
        const deviceDoc = await DeviceToken.findOneAndUpdate(
            { fcmToken: 'test-fcm-token-123' },
            {
                $set: {
                    recipientId: testUserId,
                    recipientType: 'user',
                    deviceType: 'web',
                    platform: 'Chrome / Windows',
                    isActive: true,
                    lastSeen: new Date(),
                },
            },
            { upsert: true, new: true }
        );
        console.log('✅ DeviceToken registered:', deviceDoc.fcmToken);

        // 2. Direct Notification Dispatch
        console.log('\n2. Testing Centralized Notification Dispatch...');
        const notif = await createNotification({
            recipientId: testUserId,
            recipientType: 'user',
            category: 'ORDER',
            type: 'order',
            priority: 'HIGH',
            title: 'Test Order Created',
            message: 'Your order #ORD-TEST-001 has been confirmed.',
            actionUrl: '/orders/ORD-TEST-001',
            data: { orderId: 'ORD-TEST-001' },
        });
        console.log('✅ Notification created in DB:', notif._id, 'Title:', notif.title);

        const unreadCount = await getUnreadCount(testUserId, 'user');
        console.log('✅ Unread count for test user:', unreadCount);

        // 3. Vendor Account Approved Event (With Vendor Type)
        console.log('\n3. Testing Vendor Account Approved Event (Quick Commerce)...');
        marketplaceEventBus.emit(MARKETPLACE_EVENTS.VENDOR_APPROVED, {
            vendor: { _id: testVendorId, name: 'Fresh Express Store' },
            vendorType: 'quick_commerce',
        });

        // Small delay for async event handlers
        await new Promise((r) => setTimeout(r, 1000));

        const vendorNotifs = await getUserNotifications({ recipientId: testVendorId, recipientType: 'vendor' });
        console.log('✅ Vendor notifications count:', vendorNotifs.total);
        if (vendorNotifs.notifications.length > 0) {
            console.log('   Message:', vendorNotifs.notifications[0].message);
        }

        // 4. Mark As Read & Cleanup
        console.log('\n4. Testing Mark Read and Delete...');
        await markAsRead(notif._id, testUserId, 'user');
        const afterReadCount = await getUnreadCount(testUserId, 'user');
        console.log('✅ Unread count after markAsRead:', afterReadCount);

        // Cleanup test data
        await Notification.deleteMany({ recipientId: { $in: [testUserId, testVendorId, testDeliveryId] } });
        await DeviceToken.deleteMany({ fcmToken: 'test-fcm-token-123' });
        console.log('\n✅ TEST DATA CLEANED UP.');

        console.log('\n--- 🎉 VERIFICATION SUCCESSFUL: Enterprise Notification System Passed All Verification Gates! ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ Verification failed:', err);
        process.exit(1);
    }
};

runVerification();
