import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import Order from '../src/models/Order.model.js';
import Shipment from '../src/models/Shipment.model.js';
import DeliveryBoy from '../src/models/DeliveryBoy.model.js';
import FulfillmentGroup from '../src/models/FulfillmentGroup.model.js';
import InventoryReservation from '../src/models/InventoryReservation.model.js';

const completeAllOrdersAndDeliveries = async () => {
    console.log('========================================================');
    console.log('  COMPLETING ALL EXISTING ORDERS & DELIVERIES IN SYSTEM  ');
    console.log('========================================================\n');

    await connectDB();

    const now = new Date();

    // 1. UPDATE ALL ORDERS TO DELIVERED / COMPLETED
    console.log('1. Updating Orders...');
    const orders = await Order.find({
        status: { $nin: ['delivered', 'cancelled'] },
        isDeleted: { $ne: true },
    });

    let updatedOrdersCount = 0;
    for (const order of orders) {
        order.status = 'delivered';
        if (order.paymentStatus !== 'failed' && order.paymentStatus !== 'refunded') {
            order.paymentStatus = 'paid';
        }
        order.deliveredAt = order.deliveredAt || now;

        if (Array.isArray(order.vendorItems)) {
            for (const vItem of order.vendorItems) {
                if (vItem.status !== 'cancelled') {
                    vItem.status = 'delivered';
                }
            }
        }

        if (order.quickCommerce) {
            order.quickCommerce.status = 'delivered';
            order.quickCommerce.acceptedAt = order.quickCommerce.acceptedAt || now;
            order.quickCommerce.preparedAt = order.quickCommerce.preparedAt || now;
            order.quickCommerce.pickedUpAt = order.quickCommerce.pickedUpAt || now;
            order.quickCommerce.actualEtaMinutes = order.quickCommerce.actualEtaMinutes || 15;
            if (order.quickCommerce.assignment) {
                order.quickCommerce.assignment.status = 'completed';
                order.quickCommerce.assignment.offeredTo = null;
                order.quickCommerce.assignment.offerExpiresAt = null;
            }
        }

        if (order.integration) {
            order.integration.partnerStatus = 'DELIVERED';
            order.integration.deliveredAt = order.integration.deliveredAt || now;
        }

        await order.save({ validateBeforeSave: false });
        updatedOrdersCount++;
    }
    console.log(`   ✓ Marked ${updatedOrdersCount} active order(s) as 'delivered' (Payment: 'paid', QC: 'delivered').`);

    // 2. UPDATE ALL SHIPMENTS TO DELIVERED
    console.log('\n2. Updating Shipments...');
    const shipmentsResult = await Shipment.updateMany(
        { status: { $nin: ['delivered', 'cancelled'] } },
        {
            $set: {
                status: 'delivered',
                deliveredAt: now,
            },
            $push: {
                trackingHistory: {
                    status: 'delivered',
                    timestamp: now,
                    location: 'Destination',
                    description: 'Shipment marked as delivered for testing',
                },
            },
        }
    );
    console.log(`   ✓ Marked ${shipmentsResult.modifiedCount} shipment(s) as 'delivered'.`);

    // 3. UPDATE FULFILLMENT GROUPS TO COMPLETED
    console.log('\n3. Updating Fulfillment Groups...');
    const fgResult = await FulfillmentGroup.updateMany(
        { status: { $nin: ['completed', 'cancelled', 'failed'] } },
        { $set: { status: 'completed' } }
    );
    console.log(`   ✓ Marked ${fgResult.modifiedCount} fulfillment group(s) as 'completed'.`);

    // 4. RESET ALL DELIVERY BOYS / RIDERS TO AVAILABLE & APPROVED
    console.log('\n4. Resetting Delivery Boys / Riders...');
    const ridersResult = await DeliveryBoy.updateMany(
        {},
        {
            $set: {
                isAvailable: true,
                isActive: true,
                status: 'available',
                applicationStatus: 'approved',
            },
        }
    );
    console.log(`   ✓ Reset ${ridersResult.modifiedCount} delivery boy(s) to 'available' & 'approved'.`);

    // 5. CLEANUP EXPIRED OR STUCK INVENTORY RESERVATIONS
    console.log('\n5. Cleaning up Inventory Reservations...');
    const reservationsResult = await InventoryReservation.updateMany(
        { status: 'held' },
        { $set: { status: 'consumed', consumedAt: now } }
    );
    console.log(`   ✓ Cleared ${reservationsResult.modifiedCount} held inventory reservation(s).`);

    console.log('\n========================================================');
    console.log('✅ ALL ORDERS, SHIPMENTS & RIDERS SUCCESSFULLY COMPLETED!');
    console.log('   System is clean and ready for fresh testing from start.');
    console.log('========================================================\n');

    process.exit(0);
};

completeAllOrdersAndDeliveries().catch((err) => {
    console.error('❌ Error updating orders and deliveries:', err);
    process.exit(1);
});
