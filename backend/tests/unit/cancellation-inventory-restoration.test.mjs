import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Product from '../../src/models/Product.model.js';
import Order from '../../src/models/Order.model.js';
import User from '../../src/models/User.model.js';
import Vendor from '../../src/models/Vendor.model.js';
import Category from '../../src/models/Category.model.js';
import { restoreOrderInventory } from '../../src/services/inventoryRestoration.service.js';
import { cancelOrder } from '../../src/modules/user/controllers/order.controller.js';
import { updateOrderStatus } from '../../src/modules/admin/controllers/order.controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/dwellmart_test';

describe('Phase 17 — P2-DB-02 Cancellation Inventory Restoration & N+1 Query Reduction', () => {
    let testUser;
    let testVendor;
    let testCategory;

    const createTestProduct = (overrides = {}) => {
        const ts = Date.now() + Math.floor(Math.random() * 1000000);
        return Product.create({
            name: `TEST_INV_PROD_${ts}`,
            slug: `test-inv-prod-${ts}`,
            price: 100,
            categoryId: testCategory._id,
            vendorId: testVendor._id,
            stockQuantity: 10,
            lowStockThreshold: 5,
            stock: 'in_stock',
            ...overrides,
        });
    };

    before(async () => {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(mongoUri);
        }
        const ts = Date.now();
        testUser = await User.create({
            name: `Inv Test User ${ts}`,
            email: `invtest_${ts}@dwellmart.test`,
            phone: `919998${String(ts).slice(-6)}`,
            password: 'hashed_password_test',
            role: 'customer',
        });
        testVendor = await Vendor.create({
            name: `Inv Test Vendor ${ts}`,
            storeName: `Test Store ${ts}`,
            password: 'test_password_123',
            email: `invvendor_${ts}@dwellmart.test`,
            phone: `919997${String(ts).slice(-6)}`,
            status: 'approved',
        });
        testCategory = await Category.create({
            name: `Test Cat ${ts}`,
            slug: `test-cat-${ts}`,
            isActive: true,
        });
    });

    after(async () => {
        if (testUser?._id) {
            await User.deleteOne({ _id: testUser._id });
        }
        if (testVendor?._id) {
            await Vendor.deleteOne({ _id: testVendor._id });
        }
        if (testCategory?._id) {
            await Category.deleteOne({ _id: testCategory._id });
        }
        await Product.deleteMany({ name: { $regex: /^TEST_INV_/ } });
        await Order.deleteMany({ orderId: { $regex: /^TEST-ORD-INV-/ } });
        await mongoose.connection.close();
    });

    beforeEach(async () => {
        await Product.deleteMany({ name: { $regex: /^TEST_INV_/ } });
        await Order.deleteMany({ orderId: { $regex: /^TEST-ORD-INV-/ } });
    });

    test('Test A: Single product / single variant — stockQuantity, variant stock, and stock enum restored', async () => {
        const product = await createTestProduct({
            stockQuantity: 2,
            lowStockThreshold: 5,
            stock: 'low_stock',
            variants: {
                stockMap: new Map([['color=blue|size=m', 2]]),
                prices: new Map([['color=blue|size=m', 100]]),
            },
        });

        const orderItems = [
            {
                productId: product._id,
                quantity: 4,
                variant: { size: 'M', color: 'Blue' },
            },
        ];

        const result = await restoreOrderInventory(orderItems);
        assert.equal(result.restoredCount, 1);
        assert.equal(result.modifiedProducts, 1);

        const updated = await Product.findById(product._id);
        // 2 + 4 = 6
        assert.equal(updated.stockQuantity, 6);
        // variant 2 + 4 = 6
        assert.equal(updated.variants.stockMap.get('color=blue|size=m'), 6);
        // 6 > lowStockThreshold (5) => in_stock
        assert.equal(updated.stock, 'in_stock');
    });

    test('Test B: Multiple different products — all restored in batched operation', async () => {
        const p1 = await createTestProduct({
            stockQuantity: 1,
            lowStockThreshold: 10,
            stock: 'low_stock',
        });
        const p2 = await createTestProduct({
            stockQuantity: 0,
            lowStockThreshold: 5,
            stock: 'out_of_stock',
        });

        const orderItems = [
            { productId: p1._id, quantity: 2 },
            { productId: p2._id, quantity: 3 },
        ];

        const result = await restoreOrderInventory(orderItems);
        assert.equal(result.restoredCount, 2);
        assert.equal(result.modifiedProducts, 2);

        const u1 = await Product.findById(p1._id);
        const u2 = await Product.findById(p2._id);

        assert.equal(u1.stockQuantity, 3);
        assert.equal(u1.stock, 'low_stock'); // 3 <= 10

        assert.equal(u2.stockQuantity, 3);
        assert.equal(u2.stock, 'low_stock'); // 3 <= 5 and > 0
    });

    test('Test C: Same product with multiple variants — parent aggregated, variant increments isolated', async () => {
        const product = await createTestProduct({
            stockQuantity: 10,
            lowStockThreshold: 5,
            stock: 'in_stock',
            variants: {
                stockMap: new Map([
                    ['size=m', 4],
                    ['size=l', 6],
                ]),
                prices: new Map([
                    ['size=m', 150],
                    ['size=l', 150],
                ]),
            },
        });

        const orderItems = [
            { productId: product._id, quantity: 2, variant: { size: 'M' } },
            { productId: product._id, quantity: 3, variant: { size: 'L' } },
        ];

        const result = await restoreOrderInventory(orderItems);
        assert.equal(result.restoredCount, 2);
        assert.equal(result.modifiedProducts, 1, 'Only 1 updateOne operation should be issued for the product');

        const updated = await Product.findById(product._id);
        // Parent: 10 + 2 + 3 = 15
        assert.equal(updated.stockQuantity, 15);
        // Variant M: 4 + 2 = 6
        assert.equal(updated.variants.stockMap.get('size=m'), 6);
        // Variant L: 6 + 3 = 9
        assert.equal(updated.variants.stockMap.get('size=l'), 9);
        assert.equal(updated.stock, 'in_stock');
    });

    test('Test D: Same product appearing in multiple non-variant lines — quantities accumulated correctly', async () => {
        const product = await createTestProduct({
            stockQuantity: 5,
            lowStockThreshold: 10,
            stock: 'low_stock',
        });

        const orderItems = [
            { productId: product._id, quantity: 3 },
            { productId: product._id, quantity: 4 },
        ];

        const result = await restoreOrderInventory(orderItems);
        assert.equal(result.restoredCount, 2);
        assert.equal(result.modifiedProducts, 1);

        const updated = await Product.findById(product._id);
        // 5 + 3 + 4 = 12
        assert.equal(updated.stockQuantity, 12);
        assert.equal(updated.stock, 'in_stock'); // 12 > 10
    });

    test('Test E: Stock threshold transitions — out_of_stock -> low_stock -> in_stock', async () => {
        // Case 1: out_of_stock -> low_stock
        const p1 = await createTestProduct({
            stockQuantity: 0,
            lowStockThreshold: 10,
            stock: 'out_of_stock',
        });
        await restoreOrderInventory([{ productId: p1._id, quantity: 4 }]);
        const u1 = await Product.findById(p1._id);
        assert.equal(u1.stockQuantity, 4);
        assert.equal(u1.stock, 'low_stock'); // 4 > 0 and <= 10

        // Case 2: low_stock -> in_stock
        const p2 = await createTestProduct({
            stockQuantity: 8,
            lowStockThreshold: 10,
            stock: 'low_stock',
        });
        await restoreOrderInventory([{ productId: p2._id, quantity: 5 }]);
        const u2 = await Product.findById(p2._id);
        assert.equal(u2.stockQuantity, 13);
        assert.equal(u2.stock, 'in_stock'); // 13 > 10
    });

    test('Test F: Missing product — safe no-op without mutating unrelated documents', async () => {
        const validProd = await createTestProduct({
            stockQuantity: 5,
            stock: 'in_stock',
        });

        const nonExistentId = new mongoose.Types.ObjectId();
        const orderItems = [
            { productId: nonExistentId, quantity: 10 },
            { productId: validProd._id, quantity: 2 },
        ];

        const result = await restoreOrderInventory(orderItems);
        assert.equal(result.restoredCount, 2);
        assert.equal(result.modifiedProducts, 1);

        const updated = await Product.findById(validProd._id);
        assert.equal(updated.stockQuantity, 7);
    });

    test('Test G: Invalid/zero quantity items are ignored safely', async () => {
        const validProd = await createTestProduct({
            stockQuantity: 5,
            stock: 'in_stock',
        });

        const orderItems = [
            { productId: validProd._id, quantity: 0 },
            { productId: validProd._id, quantity: -5 },
            { productId: null, quantity: 3 },
            { quantity: 2 },
        ];

        const result = await restoreOrderInventory(orderItems);
        assert.equal(result.restoredCount, 0);
        assert.equal(result.modifiedProducts, 0);

        const unchanged = await Product.findById(validProd._id);
        assert.equal(unchanged.stockQuantity, 5);
    });

    test('Test H: Transaction rollback — abort rolls back inventory restoration completely', async () => {
        const product = await createTestProduct({
            stockQuantity: 5,
            stock: 'low_stock',
            lowStockThreshold: 10,
        });

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await restoreOrderInventory(
                    [{ productId: product._id, quantity: 10 }],
                    { session }
                );

                // Intentionally throw to force transaction abort
                throw new Error('SIMULATED_TRANSACTION_ROLLBACK');
            });
        } catch (err) {
            assert.equal(err.message, 'SIMULATED_TRANSACTION_ROLLBACK');
        } finally {
            await session.endSession();
        }

        const afterRollback = await Product.findById(product._id);
        assert.equal(afterRollback.stockQuantity, 5, 'stockQuantity must remain 5 after transaction abort');
        assert.equal(afterRollback.stock, 'low_stock', 'stock enum must remain low_stock after abort');
    });

    test('Test I: Customer cancellation integration — cancelOrder controller restores inventory', async () => {
        const product = await createTestProduct({
            stockQuantity: 4,
            lowStockThreshold: 5,
            stock: 'low_stock',
        });

        const order = await Order.create({
            orderId: `TEST-ORD-INV-CUST-${Date.now()}`,
            userId: testUser._id,
            status: 'confirmed',
            total: 120,
            items: [
                {
                    productId: product._id,
                    name: product.name,
                    price: 60,
                    quantity: 3,
                },
            ],
        });

        const req = {
            params: { id: String(order._id) },
            user: { id: String(testUser._id) },
            body: { reason: 'Customer changed mind' },
        };
        let responseStatus = null;
        let responseData = null;
        const res = {
            status: (s) => {
                responseStatus = s;
                return res;
            },
            json: (d) => {
                responseData = d;
                return res;
            },
        };

        await cancelOrder(req, res);
        assert.equal(responseStatus, 200);

        const cancelledOrder = await Order.findById(order._id);
        assert.equal(cancelledOrder.status, 'cancelled');

        const restoredProd = await Product.findById(product._id);
        // 4 + 3 = 7
        assert.equal(restoredProd.stockQuantity, 7);
        assert.equal(restoredProd.stock, 'in_stock');
    });

    test('Test J: Admin cancellation integration — updateOrderStatus controller restores inventory', async () => {
        const product = await createTestProduct({
            stockQuantity: 1,
            lowStockThreshold: 5,
            stock: 'low_stock',
        });

        const order = await Order.create({
            orderId: `TEST-ORD-INV-ADM-${Date.now()}`,
            userId: testUser._id,
            status: 'processing',
            total: 180,
            items: [
                {
                    productId: product._id,
                    name: product.name,
                    price: 90,
                    quantity: 4,
                },
            ],
        });

        const req = {
            params: { id: String(order._id) },
            body: { status: 'cancelled' },
        };
        let responseStatus = null;
        const res = {
            status: (s) => {
                responseStatus = s;
                return res;
            },
            json: () => res,
        };

        await updateOrderStatus(req, res);
        assert.equal(responseStatus, 200);

        const cancelledOrder = await Order.findById(order._id);
        assert.equal(cancelledOrder.status, 'cancelled');

        const restoredProd = await Product.findById(product._id);
        // 1 + 4 = 5
        assert.equal(restoredProd.stockQuantity, 5);
        assert.equal(restoredProd.stock, 'low_stock');
    });

    test('Test K: Query reduction verification — exactly 2 database operations for 1, 5, 10 items & multi-variant', async () => {
        // Create 10 products
        const createdProducts = [];
        for (let i = 0; i < 10; i++) {
            const p = await createTestProduct({
                stockQuantity: 10,
                lowStockThreshold: 5,
                stock: 'in_stock',
            });
            createdProducts.push(p);
        }

        // Helper to count Mongoose operations during execution
        const countOperations = async (fn) => {
            let opCount = 0;
            const listener = () => {
                opCount++;
            };
            const originalFind = Product.find;
            const originalBulkWrite = Product.bulkWrite;

            Product.find = function (...args) {
                listener();
                return originalFind.apply(this, args);
            };
            Product.bulkWrite = function (...args) {
                listener();
                return originalBulkWrite.apply(this, args);
            };

            try {
                await fn();
            } finally {
                Product.find = originalFind;
                Product.bulkWrite = originalBulkWrite;
            }
            return opCount;
        };

        // 1-item order
        const count1 = await countOperations(async () => {
            await restoreOrderInventory([{ productId: createdProducts[0]._id, quantity: 1 }]);
        });
        assert.equal(count1, 2, '1-item order must execute exactly 2 queries (1 read + 1 bulkWrite)');

        // 5-item order
        const count5 = await countOperations(async () => {
            const items5 = createdProducts.slice(0, 5).map((p) => ({ productId: p._id, quantity: 1 }));
            await restoreOrderInventory(items5);
        });
        assert.equal(count5, 2, '5-item order must execute exactly 2 queries (1 read + 1 bulkWrite)');

        // 10-item order
        const count10 = await countOperations(async () => {
            const items10 = createdProducts.map((p) => ({ productId: p._id, quantity: 1 }));
            await restoreOrderInventory(items10);
        });
        assert.equal(count10, 2, '10-item order must execute exactly 2 queries (1 read + 1 bulkWrite)');

        // Multi-variant order (same product, 4 different variants)
        const mvProduct = await createTestProduct({
            stockQuantity: 20,
            variants: {
                stockMap: new Map([
                    ['size=s', 5],
                    ['size=m', 5],
                    ['size=l', 5],
                    ['size=xl', 5],
                ]),
                prices: new Map([['size=s', 50]]),
            },
        });
        const countMV = await countOperations(async () => {
            const itemsMV = [
                { productId: mvProduct._id, quantity: 1, variant: { size: 'S' } },
                { productId: mvProduct._id, quantity: 2, variant: { size: 'M' } },
                { productId: mvProduct._id, quantity: 3, variant: { size: 'L' } },
                { productId: mvProduct._id, quantity: 4, variant: { size: 'XL' } },
            ];
            await restoreOrderInventory(itemsMV);
        });
        assert.equal(countMV, 2, 'Multi-variant same-product order must execute exactly 2 queries');
    });
});
