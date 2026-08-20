import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Product from '../../src/models/Product.model.js';
import Vendor from '../../src/models/Vendor.model.js';
import Category from '../../src/models/Category.model.js';
import InventoryReservation from '../../src/models/InventoryReservation.model.js';
import {
    reserveStock,
    releaseReservation,
} from '../../src/services/checkout/InventoryReservationService.js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/dwellmart_test';

describe('Variant Stock Reservation & Indexing Conformance Suite', () => {
    let vendor;
    let category;

    before(async () => {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(mongoUri);
        }
        await InventoryReservation.syncIndexes();
        await Product.syncIndexes();

        const ts = Date.now();
        vendor = await Vendor.create({
            name: `Test Vendor ${ts}`,
            storeName: `Store ${ts}`,
            email: `vendor_res_${ts}@test.com`,
            phone: '9876543210',
            password: 'password123',
            status: 'approved',
        });
        category = await Category.create({
            name: `Test Cat ${ts}`,
            slug: `test-cat-${ts}`,
        });
    });

    after(async () => {
        if (vendor?._id) await Vendor.deleteOne({ _id: vendor._id });
        if (category?._id) await Category.deleteOne({ _id: category._id });
        await mongoose.disconnect();
    });

    beforeEach(async () => {
        await InventoryReservation.deleteMany({ sessionId: { $regex: /^TEST_SESS_/ } });
    });

    test('Test 1 — Single Variant Item: Correct variantKey and reservedMap update', async () => {
        const ts = Date.now();
        const product = await Product.create({
            name: 'Single Variant Shirt',
            slug: `single-shirt-${ts}`,
            categoryId: category._id,
            vendorId: vendor._id,
            price: 500,
            stockQuantity: 10,
            reservedQuantity: 0,
            variants: {
                attributes: [{ name: 'size', values: ['S', 'M', 'XL'] }],
                prices: { 'size=xl': 550, 'size=m': 500, 'size=s': 450 },
                stockMap: { 'size=xl': 5, 'size=m': 3, 'size=s': 2 },
                reservedMap: { 'size=xl': 0, 'size=m': 0, 'size=s': 0 },
            },
            isActive: true,
        });

        const sessionId = `TEST_SESS_1_${ts}`;
        const items = [
            {
                productId: String(product._id),
                variant: { size: 'XL' },
                quantity: 1,
                fulfillmentType: 'retail',
            },
        ];

        const reservations = await reserveStock(items, sessionId);
        assert.equal(reservations.length, 1);
        assert.equal(reservations[0].variantKey, 'size=xl');

        const updatedProduct = await Product.findById(product._id).lean();
        assert.equal(updatedProduct.reservedQuantity, 1);
        assert.equal(Number(updatedProduct.variants.reservedMap['size=xl']), 1);
        assert.equal(Number(updatedProduct.variants.reservedMap['size=m'] || 0), 0);

        const resDoc = await InventoryReservation.findOne({ sessionId }).lean();
        assert.ok(resDoc);
        assert.equal(resDoc.variantKey, 'size=xl');
        assert.equal(resDoc.quantity, 1);

        // Cleanup
        await Product.deleteOne({ _id: product._id });
    });

    test('Test 2 — Two Variant Items: Item 0 and Item 1 both get correct variantKeys', async () => {
        const ts = Date.now();
        const shirt = await Product.create({
            name: 'Two Item Shirt',
            slug: `two-shirt-${ts}`,
            categoryId: category._id,
            vendorId: vendor._id,
            price: 600,
            stockQuantity: 10,
            reservedQuantity: 0,
            variants: {
                attributes: [{ name: 'size', values: ['XL'] }],
                prices: { 'size=xl': 600 },
                stockMap: { 'size=xl': 5 },
                reservedMap: { 'size=xl': 0 },
            },
            isActive: true,
        });

        const shoes = await Product.create({
            name: 'Two Item Shoes',
            slug: `two-shoes-${ts}`,
            categoryId: category._id,
            vendorId: vendor._id,
            price: 1200,
            stockQuantity: 8,
            reservedQuantity: 0,
            variants: {
                attributes: [{ name: 'size', values: ['9'] }],
                prices: { 'size=9': 1200 },
                stockMap: { 'size=9': 4 },
                reservedMap: { 'size=9': 0 },
            },
            isActive: true,
        });

        const sessionId = `TEST_SESS_2_${ts}`;
        const items = [
            {
                productId: String(shirt._id),
                variant: { size: 'XL' },
                quantity: 1,
                fulfillmentType: 'retail',
            },
            {
                productId: String(shoes._id),
                variant: { size: '9' },
                quantity: 1,
                fulfillmentType: 'retail',
            },
        ];

        const reservations = await reserveStock(items, sessionId);
        assert.equal(reservations.length, 2);

        const shirtHold = reservations.find((r) => String(r.productId) === String(shirt._id));
        const shoesHold = reservations.find((r) => String(r.productId) === String(shoes._id));

        assert.ok(shirtHold, 'Shirt reservation must exist');
        assert.ok(shoesHold, 'Shoes reservation must exist');
        assert.equal(shirtHold.variantKey, 'size=xl');
        assert.equal(shoesHold.variantKey, 'size=9');

        const updatedShirt = await Product.findById(shirt._id).lean();
        const updatedShoes = await Product.findById(shoes._id).lean();

        assert.equal(Number(updatedShirt.variants.reservedMap['size=xl']), 1);
        assert.equal(Number(updatedShoes.variants.reservedMap['size=9']), 1);

        // Cleanup
        await Product.deleteMany({ _id: { $in: [shirt._id, shoes._id] } });
    });

    test('Test 3 — Three Variant Items: Correct 0, 1, 2 index mapping', async () => {
        const ts = Date.now();
        const p1 = await Product.create({
            name: 'Item 1',
            slug: `item-1-${ts}`,
            categoryId: category._id,
            vendorId: vendor._id,
            price: 100,
            stockQuantity: 5,
            variants: {
                attributes: [{ name: 'size', values: ['S'] }],
                prices: { 'size=s': 100 },
                stockMap: { 'size=s': 5 },
                reservedMap: { 'size=s': 0 },
            },
            isActive: true,
        });
        const p2 = await Product.create({
            name: 'Item 2',
            slug: `item-2-${ts}`,
            categoryId: category._id,
            vendorId: vendor._id,
            price: 200,
            stockQuantity: 5,
            variants: {
                attributes: [{ name: 'size', values: ['M'] }],
                prices: { 'size=m': 200 },
                stockMap: { 'size=m': 5 },
                reservedMap: { 'size=m': 0 },
            },
            isActive: true,
        });
        const p3 = await Product.create({
            name: 'Item 3',
            slug: `item-3-${ts}`,
            categoryId: category._id,
            vendorId: vendor._id,
            price: 300,
            stockQuantity: 5,
            variants: {
                attributes: [{ name: 'size', values: ['L'] }],
                prices: { 'size=l': 300 },
                stockMap: { 'size=l': 5 },
                reservedMap: { 'size=l': 0 },
            },
            isActive: true,
        });

        const sessionId = `TEST_SESS_3_${ts}`;
        const items = [
            { productId: String(p1._id), variant: { size: 'S' }, quantity: 1, fulfillmentType: 'retail' },
            { productId: String(p2._id), variant: { size: 'M' }, quantity: 1, fulfillmentType: 'retail' },
            { productId: String(p3._id), variant: { size: 'L' }, quantity: 1, fulfillmentType: 'retail' },
        ];

        const reservations = await reserveStock(items, sessionId);
        assert.equal(reservations.length, 3);
        assert.equal(reservations[0].variantKey, 'size=s');
        assert.equal(reservations[1].variantKey, 'size=m');
        assert.equal(reservations[2].variantKey, 'size=l');

        // Cleanup
        await Product.deleteMany({ _id: { $in: [p1._id, p2._id, p3._id] } });
    });

    test('Test 4 — Same Product, Different Variants: No E11000 collision, distinct variant holds', async () => {
        const ts = Date.now();
        const shirt = await Product.create({
            name: 'Multi-Variant Same Shirt',
            slug: `multi-shirt-${ts}`,
            categoryId: category._id,
            vendorId: vendor._id,
            price: 700,
            stockQuantity: 10,
            reservedQuantity: 0,
            variants: {
                attributes: [{ name: 'size', values: ['S', 'XL'] }],
                prices: { 'size=s': 700, 'size=xl': 750 },
                stockMap: { 'size=s': 4, 'size=xl': 6 },
                reservedMap: { 'size=s': 0, 'size=xl': 0 },
            },
            isActive: true,
        });

        const sessionId = `TEST_SESS_4_${ts}`;
        const items = [
            { productId: String(shirt._id), variant: { size: 'S' }, quantity: 1, fulfillmentType: 'retail' },
            { productId: String(shirt._id), variant: { size: 'XL' }, quantity: 2, fulfillmentType: 'retail' },
        ];

        const reservations = await reserveStock(items, sessionId);
        assert.equal(reservations.length, 2);

        const holdS = reservations.find((r) => r.variantKey === 'size=s');
        const holdXL = reservations.find((r) => r.variantKey === 'size=xl');

        assert.ok(holdS);
        assert.ok(holdXL);
        assert.equal(holdS.quantity, 1);
        assert.equal(holdXL.quantity, 2);

        const updated = await Product.findById(shirt._id).lean();
        assert.equal(updated.reservedQuantity, 3);
        assert.equal(Number(updated.variants.reservedMap['size=s']), 1);
        assert.equal(Number(updated.variants.reservedMap['size=xl']), 2);

        // Cleanup
        await Product.deleteOne({ _id: shirt._id });
    });

    test('Test 5 — Variant Stock Exhaustion: Customer A holds last unit, Customer B is rejected', async () => {
        const ts = Date.now();
        const jacket = await Product.create({
            name: 'Leather Jacket',
            slug: `jacket-${ts}`,
            categoryId: category._id,
            vendorId: vendor._id,
            price: 3000,
            stockQuantity: 5,
            reservedQuantity: 0,
            variants: {
                attributes: [{ name: 'size', values: ['S', 'XL'] }],
                prices: { 'size=s': 3000, 'size=xl': 3500 },
                stockMap: { 'size=s': 4, 'size=xl': 1 }, // Only 1 XL!
                reservedMap: { 'size=s': 0, 'size=xl': 0 },
            },
            isActive: true,
        });

        const sessA = `TEST_SESS_5A_${ts}`;
        const sessB = `TEST_SESS_5B_${ts}`;
        const sessC = `TEST_SESS_5C_${ts}`;

        // Customer A reserves the 1 XL
        const resA = await reserveStock(
            [{ productId: String(jacket._id), variant: { size: 'XL' }, quantity: 1, fulfillmentType: 'retail' }],
            sessA
        );
        assert.equal(resA.length, 1);
        assert.equal(resA[0].variantKey, 'size=xl');

        // Customer B tries to reserve XL -> MUST FAIL (insufficient variant stock)
        await assert.rejects(
            async () => {
                await reserveStock(
                    [{ productId: String(jacket._id), variant: { size: 'XL' }, quantity: 1, fulfillmentType: 'retail' }],
                    sessB
                );
            },
            (err) => {
                assert.equal(err.code, 'INVENTORY_RESERVATION_FAILED');
                assert.equal(err.statusCode, 422);
                return true;
            }
        );

        // Customer C reserves Size S (4 available) -> MUST SUCCEED
        const resC = await reserveStock(
            [{ productId: String(jacket._id), variant: { size: 'S' }, quantity: 2, fulfillmentType: 'retail' }],
            sessC
        );
        assert.equal(resC.length, 1);

        const finalJacket = await Product.findById(jacket._id).lean();
        assert.equal(finalJacket.reservedQuantity, 3); // 1 XL + 2 S
        assert.equal(Number(finalJacket.variants.reservedMap['size=xl']), 1);
        assert.equal(Number(finalJacket.variants.reservedMap['size=s']), 2);

        // Cleanup
        await Product.deleteOne({ _id: jacket._id });
    });

    test('Test 6 — Reservation Release: Releasing reservation restores variants.reservedMap', async () => {
        const ts = Date.now();
        const hoodie = await Product.create({
            name: 'Release Test Hoodie',
            slug: `hoodie-${ts}`,
            categoryId: category._id,
            vendorId: vendor._id,
            price: 1500,
            stockQuantity: 10,
            reservedQuantity: 0,
            variants: {
                attributes: [{ name: 'size', values: ['M'] }],
                prices: { 'size=m': 1500 },
                stockMap: { 'size=m': 5 },
                reservedMap: { 'size=m': 0 },
            },
            isActive: true,
        });

        const sessionId = `TEST_SESS_6_${ts}`;
        await reserveStock(
            [{ productId: String(hoodie._id), variant: { size: 'M' }, quantity: 2, fulfillmentType: 'retail' }],
            sessionId
        );

        let p = await Product.findById(hoodie._id).lean();
        assert.equal(p.reservedQuantity, 2);
        assert.equal(Number(p.variants.reservedMap['size=m']), 2);

        // Release reservation
        const count = await releaseReservation(sessionId, 'payment_failed');
        assert.equal(count, 1);

        p = await Product.findById(hoodie._id).lean();
        assert.equal(p.reservedQuantity, 0);
        assert.equal(Number(p.variants.reservedMap['size=m']), 0);

        // Cleanup
        await Product.deleteOne({ _id: hoodie._id });
    });

    test('Test 7 — Non-Variant Product Fallback: Preserves product-level stock behavior', async () => {
        const ts = Date.now();
        const book = await Product.create({
            name: 'Non Variant Book',
            slug: `book-${ts}`,
            categoryId: category._id,
            vendorId: vendor._id,
            price: 250,
            stockQuantity: 10,
            reservedQuantity: 0,
            isActive: true,
        });

        const sessionId = `TEST_SESS_7_${ts}`;
        const res = await reserveStock(
            [{ productId: String(book._id), quantity: 3, fulfillmentType: 'retail' }],
            sessionId
        );

        assert.equal(res.length, 1);
        assert.equal(res[0].variantKey, '');

        const p = await Product.findById(book._id).lean();
        assert.equal(p.reservedQuantity, 3);
        assert.equal(p.stockQuantity, 10);

        await releaseReservation(sessionId, 'session_expired');
        const pAfter = await Product.findById(book._id).lean();
        assert.equal(pAfter.reservedQuantity, 0);

        // Cleanup
        await Product.deleteOne({ _id: book._id });
    });
});
