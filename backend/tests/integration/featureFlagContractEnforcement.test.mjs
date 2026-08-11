import mongoose from 'mongoose';
import connectDB from '../../src/config/db.js';
import Settings from '../../src/models/Settings.model.js';
import Product from '../../src/models/Product.model.js';
import Vendor from '../../src/models/Vendor.model.js';
import Category from '../../src/models/Category.model.js';
import User from '../../src/models/User.model.js';
import Order from '../../src/models/Order.model.js';
import { buildCatalogFilter } from '../../src/services/catalogQuery.service.js';
import { isWholesaleMarketplaceEnabled, isQuickCommerceEnabled } from '../../src/services/featureFlags.service.js';
import { resolvePriceForQuantity } from '../../src/services/pricingEngine.service.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://frk:aBcfrk123@cluster0.dfhpvgu.mongodb.net/dwellmart_db?retryWrites=true&w=majority';
process.env.MONGO_URI = MONGO_URI;

async function runFeatureFlagTests() {
    console.log('🧪 Starting Phase 2 — Feature Flag Contract Enforcement Suite...');
    await connectDB();

    const results = {
        total: 0,
        passed: 0,
        failed: 0,
        failures: [],
    };

    const assert = (condition, description) => {
        results.total++;
        if (condition) {
            results.passed++;
            console.log(`  ✅ PASS: ${description}`);
        } else {
            results.failed++;
            console.error(`  ❌ FAIL: ${description}`);
            results.failures.push(description);
        }
    };

    try {
        // Save existing features setting to restore after test
        const originalSetting = await Settings.findOne({ key: 'features' }).lean();

        // Helper to update platform flags
        const setPlatformFlags = async ({ wholesaleMarketplaceEnabled, quickCommerceEnabled }) => {
            await Settings.findOneAndUpdate(
                { key: 'features' },
                {
                    key: 'features',
                    value: {
                        ...(originalSetting?.value || {}),
                        wholesaleMarketplaceEnabled,
                        quickCommerceEnabled,
                    },
                },
                { upsert: true, new: true }
            );
        };

        // --- TEST SUITE 1: Feature Flag Readers ---
        console.log('\n--- Test Suite 1: Feature Flag Service Readers ---');
        await setPlatformFlags({ wholesaleMarketplaceEnabled: false, quickCommerceEnabled: false });
        assert((await isWholesaleMarketplaceEnabled()) === false, 'isWholesaleMarketplaceEnabled() returns false when flag is OFF');
        assert((await isQuickCommerceEnabled()) === false, 'isQuickCommerceEnabled() returns false when flag is OFF');

        await setPlatformFlags({ wholesaleMarketplaceEnabled: true, quickCommerceEnabled: true });
        assert((await isWholesaleMarketplaceEnabled()) === true, 'isWholesaleMarketplaceEnabled() returns true when flag is ON');
        assert((await isQuickCommerceEnabled()) === true, 'isQuickCommerceEnabled() returns true when flag is ON');

        // --- TEST SUITE 2: Catalog Query Builder Gating ---
        console.log('\n--- Test Suite 2: Catalog Query Filter Gating ---');
        
        // With wholesale OFF
        const filterWholesaleOff = buildCatalogFilter({
            experience: 'marketplace',
            wholesaleMarketplaceEnabled: false,
            extra: { wholesaleEnabled: true },
        });
        assert(filterWholesaleOff.retailEnabled?.$ne === false, 'Wholesale OFF filter enforces retailEnabled: { $ne: false }');
        assert(Array.isArray(filterWholesaleOff._id?.$in) && filterWholesaleOff._id.$in.length === 0, 'Wholesale OFF filter returns empty match when wholesale is explicitly requested');

        // With wholesale ON
        const filterWholesaleOn = buildCatalogFilter({
            experience: 'marketplace',
            wholesaleMarketplaceEnabled: true,
            extra: { wholesaleEnabled: true },
        });
        assert(filterWholesaleOn.wholesaleEnabled === true, 'Wholesale ON filter preserves wholesaleEnabled condition');

        // --- TEST SUITE 3: Call-Site Pricing Engine Gating ---
        console.log('\n--- Test Suite 3: Pricing Engine Call-Site Gating ---');
        const testProduct = {
            retailEnabled: true,
            wholesaleEnabled: true,
            price: 100,
            wholesale: {
                moqEnabled: true,
                moq: 10,
                priceTiers: [{ minQty: 10, price: 80 }],
            },
        };

        // With wholesale OFF: tier pricing must NOT apply even if quantity >= 10
        const pricingWholesaleOff = resolvePriceForQuantity(testProduct, 100, 15, {
            vendorWholesaleEnabled: false,
        });
        assert(pricingWholesaleOff.unitPrice === 100, 'With wholesale OFF, quantity 15 resolves to retail base price (100)');
        assert(pricingWholesaleOff.pricingType === 'retail', 'With wholesale OFF, pricingType resolves to retail');
        assert(pricingWholesaleOff.savings === 0, 'With wholesale OFF, savings resolves to 0');

        // With wholesale ON: tier pricing applies
        const pricingWholesaleOn = resolvePriceForQuantity(testProduct, 100, 15, {
            vendorWholesaleEnabled: true,
        });
        assert(pricingWholesaleOn.unitPrice === 80, 'With wholesale ON, quantity 15 resolves to tier price (80)');
        assert(pricingWholesaleOn.pricingType === 'wholesale', 'With wholesale ON, pricingType resolves to wholesale');
        assert(pricingWholesaleOn.savings === 300, 'With wholesale ON, savings resolves to 300 (20 * 15)');

        // --- TEST SUITE 4: Retail Isolation across All 4 Flag Combinations ---
        console.log('\n--- Test Suite 4: Retail Flow Isolation Matrix ---');
        const matrix = [
            { wholesale: false, qc: false },
            { wholesale: false, qc: true },
            { wholesale: true, qc: false },
            { wholesale: true, qc: true },
        ];

        const retailProduct = {
            retailEnabled: true,
            wholesaleEnabled: false,
            price: 150,
        };

        for (const combo of matrix) {
            await setPlatformFlags({
                wholesaleMarketplaceEnabled: combo.wholesale,
                quickCommerceEnabled: combo.qc,
            });

            const retailFilter = buildCatalogFilter({
                experience: 'marketplace',
                wholesaleMarketplaceEnabled: combo.wholesale,
            });

            const retailPricing = resolvePriceForQuantity(retailProduct, 150, 2, {
                vendorWholesaleEnabled: combo.wholesale,
            });

            assert(
                retailFilter.retailEnabled?.$ne === false && retailPricing.unitPrice === 150,
                `Retail flow unaffected under flags: Wholesale=${combo.wholesale}, QC=${combo.qc}`
            );
        }

        // --- TEST SUITE 5: In-Flight Order Completion Protection ---
        console.log('\n--- Test Suite 5: In-Flight Order Completion Guard ---');
        // Turning wholesale flag OFF must not mutate or block existing order status transitions
        await setPlatformFlags({ wholesaleMarketplaceEnabled: false, quickCommerceEnabled: false });

        const mockOrder = new Order({
            orderId: 'TEST-WS-' + Date.now(),
            user: new mongoose.Types.ObjectId(),
            experience: 'marketplace',
            orderType: 'wholesale',
            items: [
                {
                    productId: new mongoose.Types.ObjectId(),
                    vendorId: new mongoose.Types.ObjectId(),
                    name: 'Bulk Wheat Flour',
                    price: 80,
                    quantity: 50,
                    pricingType: 'wholesale',
                },
            ],
            vendorItems: [
                {
                    vendorId: new mongoose.Types.ObjectId(),
                    status: 'processing',
                },
            ],
            shippingAddress: {
                fullName: 'Test Buyer',
                addressLine1: '123 Market St',
                city: 'City',
                state: 'State',
                pincode: '123456',
                phone: '9999999999',
            },
            paymentMethod: 'cod',
            paymentStatus: 'pending',
            totalAmount: 4000,
        });

        await mockOrder.save();
        assert(mockOrder.orderType === 'wholesale', 'In-flight wholesale order created and saved');

        // Simulate vendor transitioning order to shipped
        mockOrder.vendorItems[0].status = 'shipped';
        mockOrder.status = 'shipped';
        await mockOrder.save();

        const updatedOrder = await Order.findById(mockOrder._id);
        assert(updatedOrder.status === 'shipped', 'In-flight wholesale order successfully updated to shipped with wholesale flag OFF');

        // Clean up test order
        await Order.findByIdAndDelete(mockOrder._id);

        // Restore original platform flags
        if (originalSetting) {
            await Settings.findOneAndUpdate({ key: 'features' }, originalSetting);
        }

    } catch (err) {
        console.error('Fatal error during test run:', err);
        results.failed++;
        results.failures.push(err.message);
    } finally {
        await mongoose.disconnect();
    }

    console.log('\n========================================');
    console.log(`TOTAL TESTS: ${results.total}`);
    console.log(`PASSED:      ${results.passed}`);
    console.log(`FAILED:      ${results.failed}`);
    console.log('========================================');

    if (results.failed > 0) {
        console.error('Failures:', results.failures);
        process.exit(1);
    } else {
        console.log('🎉 ALL PHASE 2 FEATURE FLAG TESTS PASSED 100%!');
        process.exit(0);
    }
}

runFeatureFlagTests();
