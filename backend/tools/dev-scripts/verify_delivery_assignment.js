import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Order from './models/Order.model.js';
import DeliveryBoy from './models/DeliveryBoy.model.js';
import User from './models/User.model.js';
import Vendor from './models/Vendor.model.js';
import Category from './models/Category.model.js';
import Product from './models/Product.model.js';
import Notification from './models/Notification.model.js';
import { assignDeliveryBoy } from './modules/admin/controllers/order.controller.js';
import { getAssignedOrders } from './modules/delivery/controllers/order.controller.js';

dotenv.config();

const logTest = (title, passed, details = '') => {
    const symbol = passed ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`${symbol} ${title}${details ? ` (${details})` : ''}`);
    if (!passed) {
        process.exitCode = 1;
    }
};

const createMockReqRes = (params = {}, body = {}, user = {}) => {
    const req = { params, body, query: {}, user };
    let responseData = null;
    let statusCode = 200;

    const res = {
        status: (code) => {
            statusCode = code;
            return res;
        },
        json: (data) => {
            responseData = data;
            return res;
        },
    };

    return { req, res, getResult: () => ({ statusCode, responseData }) };
};

async function runTests() {
    console.log('\n====================================================');
    console.log('🧪 DwellMart Delivery Boy Assignment Verification');
    console.log('====================================================\n');

    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB for assignment verification.\n');

        // ── 0. Create Test Fixtures ──────────────────────────────────────────
        const testCategory = await Category.create({
            name: `Test Cat ${Date.now()}`,
            slug: `test-cat-${Date.now()}`,
        });

        const testVendor = await Vendor.create({
            name: 'Test Vendor Assignment',
            storeName: 'Test Assignment Store',
            email: `vendor_assign_${Date.now()}@test.com`,
            phone: '9876543210',
            password: 'Password123!',
            vendorType: 'retail',
            status: 'approved',
            sellingChannels: { retail: { enabled: true } },
        });

        const testUser = await User.create({
            name: 'Customer Assignment Test',
            email: `customer_assign_${Date.now()}@test.com`,
            phone: '9999999999',
            password: 'Password123!',
            role: 'customer',
        });

        const riderActive = await DeliveryBoy.create({
            name: 'Rahul Sharma (Rider A)',
            email: `rider_a_${Date.now()}@test.com`,
            phone: '9888877771',
            password: 'Password123!',
            status: 'available',
            isActive: true,
            applicationStatus: 'approved',
            vehicleType: 'bike',
            vehicleNumber: 'KA-01-AB-1234',
        });

        const riderReassign = await DeliveryBoy.create({
            name: 'Amit Kumar (Rider B)',
            email: `rider_b_${Date.now()}@test.com`,
            phone: '9888877772',
            password: 'Password123!',
            status: 'available',
            isActive: true,
            applicationStatus: 'approved',
            vehicleType: 'scooter',
            vehicleNumber: 'KA-01-CD-5678',
        });

        const riderInactive = await DeliveryBoy.create({
            name: 'Inactive Rider',
            email: `rider_inactive_${Date.now()}@test.com`,
            phone: '9888877773',
            password: 'Password123!',
            status: 'offline',
            isActive: false,
            applicationStatus: 'approved',
        });

        const riderUnapproved = await DeliveryBoy.create({
            name: 'Unapproved Rider',
            email: `rider_unapp_${Date.now()}@test.com`,
            phone: '9888877774',
            password: 'Password123!',
            status: 'available',
            isActive: true,
            applicationStatus: 'pending',
        });

        const initialOrder = await Order.create({
            orderId: `RT-ASSIGN-${Date.now()}`,
            userId: testUser._id,
            vendorId: testVendor._id,
            items: [
                {
                    productId: new mongoose.Types.ObjectId(),
                    vendorId: testVendor._id,
                    name: 'Test Product',
                    price: 500,
                    quantity: 2,
                },
            ],
            vendorItems: [
                {
                    vendorId: testVendor._id,
                    vendorName: testVendor.storeName,
                    items: [],
                    subtotal: 1000,
                    shipping: 50,
                    tax: 50,
                    discount: 0,
                    status: 'pending',
                },
            ],
            shippingAddress: { name: 'Customer Assignment', city: 'Bangalore', country: 'India' },
            paymentMethod: 'card',
            paymentStatus: 'paid',
            status: 'pending',
            subtotal: 1000,
            shipping: 50,
            tax: 50,
            discount: 0,
            total: 1100,
            deliveryBoyId: null,
        });

        const orderTotalBefore = initialOrder.total;

        // ── TEST 1: Successful Assignment API & Status Transition ─────────
        const { req: req1, res: res1, getResult: getRes1 } = createMockReqRes(
            { id: String(initialOrder.orderId) },
            { deliveryBoyId: String(riderActive._id) },
            { id: 'admin123', role: 'admin' }
        );

        await assignDeliveryBoy(req1, res1);
        const { responseData: resData1 } = getRes1();
        const updatedOrderData1 = resData1?.data;

        logTest(
            'TEST 1: Admin Assigns Delivery Boy (PENDING -> PROCESSING)',
            resData1?.success === true &&
                updatedOrderData1?.status === 'processing' &&
                String(updatedOrderData1?.deliveryBoyId?._id || updatedOrderData1?.deliveryBoyId) === String(riderActive._id),
            `Status=${updatedOrderData1?.status}, AssignedTo=${updatedOrderData1?.deliveryBoyId?.name}`
        );

        // ── TEST 2: Database Persistence Verification ─────────────────────
        const dbOrder1 = await Order.findById(initialOrder._id).populate('deliveryBoyId');
        logTest(
            'TEST 2: Database Assignment & Status Persistence',
            dbOrder1.status === 'processing' && String(dbOrder1.deliveryBoyId._id) === String(riderActive._id),
            `DB Status=${dbOrder1.status}, DB Rider=${dbOrder1.deliveryBoyId?.name}`
        );

        // ── TEST 3: Populated Response Structure Integrity ───────────────
        const isPopulated =
            typeof updatedOrderData1?.deliveryBoyId === 'object' &&
            updatedOrderData1?.deliveryBoyId?.name === 'Rahul Sharma (Rider A)';
        logTest(
            'TEST 3: API Returns Complete Populated Delivery Boy Object',
            isPopulated,
            `Name=${updatedOrderData1?.deliveryBoyId?.name}, Phone=${updatedOrderData1?.deliveryBoyId?.phone}`
        );

        // ── TEST 4: Delivery Partner Panel Order Visibility ──────────────
        const { req: reqRider, res: resRider, getResult: getResRider } = createMockReqRes(
            {},
            {},
            { id: String(riderActive._id), role: 'delivery' }
        );

        await getAssignedOrders(reqRider, resRider);
        const { responseData: resDataRider } = getResRider();
        const riderOrders = resDataRider?.data?.orders || resDataRider?.data || [];
        const isOrderAssignedToRider = riderOrders.some((o) => String(o._id) === String(initialOrder._id));

        logTest(
            'TEST 4: Order Appears in Assigned Delivery Partner Panel List',
            isOrderAssignedToRider,
            `Fetched ${riderOrders.length} assigned orders for Rider A`
        );

        // ── TEST 5: Notifications Generation (Delivery, User, Vendor) ─────
        const notifications = await Notification.find({
            'data.orderId': String(initialOrder.orderId),
        });
        const hasDeliveryNotif = notifications.some((n) => String(n.recipientId) === String(riderActive._id));
        const hasUserNotif = notifications.some((n) => String(n.recipientId) === String(testUser._id));

        logTest(
            'TEST 5: System Generates Assignment Notifications',
            hasDeliveryNotif && hasUserNotif,
            `Notifications generated: Delivery=${hasDeliveryNotif}, Customer=${hasUserNotif}`
        );

        // ── TEST 6: Reassignment of Already Assigned Order ────────────────
        const { req: reqReassign, res: resReassign, getResult: getResReassign } = createMockReqRes(
            { id: String(initialOrder.orderId) },
            { deliveryBoyId: String(riderReassign._id) },
            { id: 'admin123', role: 'admin' }
        );

        await assignDeliveryBoy(reqReassign, resReassign);
        const { responseData: resDataReassign } = getResReassign();
        const reassignedOrder = resDataReassign?.data;

        logTest(
            'TEST 6: Reassignment Updates Delivery Partner Gracefully',
            resDataReassign?.success === true &&
                String(reassignedOrder?.deliveryBoyId?._id || reassignedOrder?.deliveryBoyId) === String(riderReassign._id),
            `Reassigned To=${reassignedOrder?.deliveryBoyId?.name}`
        );

        // ── TEST 7: Validation Rejection — Inactive Delivery Boy ─────────
        let inactiveFailed = false;
        try {
            const { req: reqInact, res: resInact } = createMockReqRes(
                { id: String(initialOrder.orderId) },
                { deliveryBoyId: String(riderInactive._id) },
                { id: 'admin123', role: 'admin' }
            );
            await assignDeliveryBoy(reqInact, resInact);
        } catch (err) {
            inactiveFailed = err.statusCode === 400 && err.message.includes('inactive');
        }
        logTest('TEST 7: Inactive Delivery Partner Assignment Rejected', inactiveFailed, 'HTTP 400 Inactive');

        // ── TEST 8: Validation Rejection — Unapproved Delivery Boy ───────
        let unapprovedFailed = false;
        try {
            const { req: reqUnapp, res: resUnapp } = createMockReqRes(
                { id: String(initialOrder.orderId) },
                { deliveryBoyId: String(riderUnapproved._id) },
                { id: 'admin123', role: 'admin' }
            );
            await assignDeliveryBoy(reqUnapp, resUnapp);
        } catch (err) {
            unapprovedFailed = err.statusCode === 400 && err.message.includes('approved');
        }
        logTest('TEST 8: Unapproved Delivery Partner Assignment Rejected', unapprovedFailed, 'HTTP 400 Not approved');

        // ── TEST 9: Validation Rejection — Terminal Order Status ─────────
        const deliveredOrder = await Order.create({
            orderId: `RT-DELIVERED-${Date.now()}`,
            userId: testUser._id,
            status: 'delivered',
            subtotal: 500,
            total: 500,
        });

        let terminalFailed = false;
        try {
            const { req: reqTerm, res: resTerm } = createMockReqRes(
                { id: String(deliveredOrder.orderId) },
                { deliveryBoyId: String(riderActive._id) },
                { id: 'admin123', role: 'admin' }
            );
            await assignDeliveryBoy(reqTerm, resTerm);
        } catch (err) {
            terminalFailed = err.statusCode === 409 && err.message.includes('Cannot assign');
        }
        logTest('TEST 9: Terminal Delivered Order Assignment Rejected', terminalFailed, 'HTTP 409 Conflict');

        // ── TEST 10: Zero Pricing Regression Verification ─────────────────
        const finalDbOrder = await Order.findById(initialOrder._id);
        const orderTotalAfter = finalDbOrder.total;
        const pricingUnchanged = orderTotalBefore === orderTotalAfter;

        logTest(
            'TEST 10: Order Total Price Remains 100% Unchanged',
            pricingUnchanged,
            `Before=₹${orderTotalBefore}, After=₹${orderTotalAfter}`
        );

        // ── TEST 11: Multi-Vendor Order Assignment Scope Isolation ────────
        const testVendor2 = await Vendor.create({
            name: 'Test Vendor Assignment 2',
            storeName: 'Test Assignment Store 2',
            email: `vendor_assign2_${Date.now()}@test.com`,
            phone: '9876543211',
            password: 'Password123!',
            vendorType: 'retail',
            status: 'approved',
        });

        const multiOrder = await Order.create({
            orderId: `RT-MULTI-${Date.now()}`,
            userId: testUser._id,
            vendorItems: [
                { vendorId: testVendor._id, vendorName: 'Vendor A', subtotal: 400, total: 400, status: 'pending' },
                { vendorId: testVendor2._id, vendorName: 'Vendor B', subtotal: 600, total: 600, status: 'pending' },
            ],
            status: 'pending',
            total: 1000,
        });

        const { req: reqMulti, res: resMulti } = createMockReqRes(
            { id: String(multiOrder.orderId) },
            { deliveryBoyId: String(riderActive._id) },
            { id: 'admin123', role: 'admin' }
        );

        await assignDeliveryBoy(reqMulti, resMulti);
        const dbMultiOrder = await Order.findById(multiOrder._id);

        logTest(
            'TEST 11: Multi-Vendor Order Assignment Operates Gracefully',
            String(dbMultiOrder.deliveryBoyId) === String(riderActive._id) && dbMultiOrder.status === 'processing',
            `Status=${dbMultiOrder.status}`
        );

        // ── Clean Up Test Fixtures ─────────────────────────────────────────
        await Order.deleteMany({ _id: { $in: [initialOrder._id, deliveredOrder._id, multiOrder._id] } });
        await DeliveryBoy.deleteMany({
            _id: { $in: [riderActive._id, riderReassign._id, riderInactive._id, riderUnapproved._id] },
        });
        await Vendor.deleteMany({ _id: { $in: [testVendor._id, testVendor2._id] } });
        await User.deleteOne({ _id: testUser._id });
        await Category.deleteOne({ _id: testCategory._id });
        await Notification.deleteMany({
            'data.orderId': { $in: [initialOrder.orderId, deliveredOrder.orderId, multiOrder.orderId] },
        });

        console.log('\n====================================================');
        console.log('RESULTS: ALL ASSIGNMENT TESTS EXECUTED CLEANLY');
        console.log('====================================================\n');
    } catch (err) {
        console.error('\n❌ VERIFICATION EXCEPTION:', err);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

runTests();
