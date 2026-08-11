import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import Vendor from '../src/models/Vendor.model.js';
import User from '../src/models/User.model.js';
import Category from '../src/models/Category.model.js';
import Product from '../src/models/Product.model.js';
import SubscriptionPlan from '../src/models/SubscriptionPlan.model.js';
import VendorSubscription from '../src/models/VendorSubscription.model.js';

const seedData = async () => {
    try {
        console.log('Connecting to MongoDB...');
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/dwellmart';
        await mongoose.connect(mongoUri);
        console.log('MongoDB Connected successfully.');

        // 0. Seed Default Active Subscription Plan
        let plan = await SubscriptionPlan.findOne({ slug: 'enterprise-pro' });
        if (!plan) {
            plan = await SubscriptionPlan.create({
                name: 'Enterprise Pro Plan',
                slug: 'enterprise-pro',
                description: 'Full multi-channel marketplace access with unlimited listings',
                price_inr: 4999,
                price_usd: 59,
                interval: 'year',
                interval_count: 1,
                isActive: true,
            });
            console.log('✅ Created Subscription Plan: Enterprise Pro Plan');
        }

        // 1. Create or Find Base Categories
        console.log('\n--- 1. Seeding Categories ---');
        let qcCategory = await Category.findOne({ slug: 'grocery-fresh' });
        if (!qcCategory) {
            qcCategory = await Category.create({
                name: 'Grocery & Fresh',
                slug: 'grocery-fresh',
                description: 'Fresh fruits, vegetables, dairy, and daily essentials',
                isActive: true,
                supportedExperiences: ['quick_commerce', 'marketplace'],
            });
            console.log('✅ Created Category: Grocery & Fresh');
        } else {
            console.log('ℹ️ Found Category: Grocery & Fresh');
        }

        let retailCategory = await Category.findOne({ slug: 'electronics-apparel' });
        if (!retailCategory) {
            retailCategory = await Category.create({
                name: 'Electronics & Apparel',
                slug: 'electronics-apparel',
                description: 'Consumer gadgets, clothing, and fashion accessories',
                isActive: true,
                supportedExperiences: ['marketplace'],
            });
            console.log('✅ Created Category: Electronics & Apparel');
        } else {
            console.log('ℹ️ Found Category: Electronics & Apparel');
        }

        let wholesaleCategory = await Category.findOne({ slug: 'bulk-industrial' });
        if (!wholesaleCategory) {
            wholesaleCategory = await Category.create({
                name: 'Bulk & Industrial Supplies',
                slug: 'bulk-industrial',
                description: 'Bulk raw materials, trade bundles, and commercial goods',
                isActive: true,
                supportedExperiences: ['marketplace'],
            });
            console.log('✅ Created Category: Bulk & Industrial Supplies');
        } else {
            console.log('ℹ️ Found Category: Bulk & Industrial Supplies');
        }

        // 2. Create Vendors (QC, Retail, Wholesale, Hybrid)
        console.log('\n--- 2. Seeding Vendors ---');

        const vendorsToSeed = [
            {
                email: 'qc.vendor@dwellmart.com',
                password: 'Vendor123!',
                name: 'Express Mart Owner',
                storeName: 'Express Daily Store (Quick Commerce)',
                vendorType: 'quick_commerce',
                status: 'approved',
                isVerified: true,
                phone: '9876543210',
                address: { street: 'Station Road', city: 'Mumbai', state: 'Maharashtra', zipCode: '400001', country: 'India' },
                sellingChannels: { quickCommerce: { enabled: true }, retail: { enabled: false }, wholesale: { enabled: false } },
                quickCommerceProfile: {
                    storeType: 'dark_store',
                    location: { type: 'Point', coordinates: [72.8777, 19.0760] }, // Mumbai
                    serviceRadiusKm: 15,
                    preparationTimeMins: 10,
                    availabilityStatus: 'open',
                    minOrderValue: 0,
                    packagingFee: 5,
                },
            },
            {
                email: 'retail.vendor@dwellmart.com',
                password: 'Vendor123!',
                name: 'Trendy Fashion Owner',
                storeName: 'Trendy Life Hub (Retail B2C)',
                vendorType: 'retail',
                status: 'approved',
                isVerified: true,
                phone: '9876543211',
                address: { street: 'MG Road', city: 'Mumbai', state: 'Maharashtra', zipCode: '400002', country: 'India' },
                sellingChannels: { quickCommerce: { enabled: false }, retail: { enabled: true }, wholesale: { enabled: false } },
            },
            {
                email: 'wholesale.vendor@dwellmart.com',
                password: 'Vendor123!',
                name: 'Mega Wholesale Owner',
                storeName: 'Mega Bulk Depot (Wholesale B2B)',
                vendorType: 'wholesale',
                status: 'approved',
                isVerified: true,
                phone: '9876543212',
                address: { street: 'Industrial Estate', city: 'Mumbai', state: 'Maharashtra', zipCode: '400003', country: 'India' },
                sellingChannels: { quickCommerce: { enabled: false }, retail: { enabled: false }, wholesale: { enabled: true } },
                wholesaleProfile: {
                    gstNumber: '27AAAAA0000A1Z5',
                    businessName: 'Mega Bulk Depot Pvt Ltd',
                },
            },
        ];

        const createdVendors = {};

        for (const vData of vendorsToSeed) {
            let vendor = await Vendor.findOne({ email: vData.email });
            if (!vendor) {
                vendor = new Vendor(vData);
                await vendor.save();
                console.log(`✅ Created Vendor: ${vData.storeName} (${vData.email}) [Type: ${vData.vendorType}]`);
            } else {
                // Update properties to ensure they are approved and channels synced
                vendor.status = 'approved';
                vendor.vendorType = vData.vendorType;
                vendor.sellingChannels = vData.sellingChannels;
                if (vData.quickCommerceProfile) vendor.quickCommerceProfile = vData.quickCommerceProfile;
                await vendor.save();
                console.log(`ℹ️ Updated Vendor: ${vData.storeName} (${vData.email})`);
            }
            createdVendors[vData.vendorType] = vendor;

            // Seed active subscription for vendor so they don't show "Subscription Expired" warning
            let sub = await VendorSubscription.findOne({ vendor: vendor._id, status: 'active' });
            if (!sub) {
                sub = await VendorSubscription.create({
                    vendor: vendor._id,
                    plan: plan._id,
                    gateway: 'internal',
                    gateway_subscription_id: `sub_internal_seed_${vendor._id}`,
                    status: 'active',
                    current_period_start: new Date(),
                    current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year active
                    latest_payment_status: 'paid',
                });
                console.log(`  └─ ✅ Created Active Subscription for ${vendor.storeName}`);
            }
        }

        // 3. Create Test Customer User
        console.log('\n--- 3. Seeding Customer User ---');
        let customer = await User.findOne({ email: 'customer@dwellmart.com' });
        if (!customer) {
            customer = new User({
                name: 'Enterprise Test Customer',
                email: 'customer@dwellmart.com',
                password: 'Customer123!',
                role: 'customer',
                isVerified: true,
                phone: '9999988888',
            });
            await customer.save();
            console.log('✅ Created Customer: customer@dwellmart.com');
        } else {
            console.log('ℹ️ Found Customer: customer@dwellmart.com');
        }

        // 4. Create Seed Products
        console.log('\n--- 4. Seeding Channel-Specific Products ---');

        const productsToSeed = [
            // Quick Commerce Products
            {
                name: 'Fresh Organic Cow Milk 1L',
                slug: 'fresh-organic-cow-milk-1l',
                description: 'Farm-fresh 100% organic pasteurized cow milk, delivered in 10-15 mins.',
                price: 65,
                unit: 'Litre',
                image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600',
                images: ['https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600'],
                categoryId: qcCategory._id,
                quickCommerceCategoryId: qcCategory._id,
                vendorId: createdVendors['quick_commerce']._id,
                stock: 'in_stock',
                stockQuantity: 150,
                quickCommerceEnabled: true,
                retailEnabled: false,
                wholesaleEnabled: false,
                quickCommerce: {
                    packSize: '1 Litre',
                    shelfLifeDays: 4,
                    isPerishable: true,
                    maxOrderQty: 6,
                    handlingNote: 'Keep refrigerated at 4°C',
                },
                isActive: true,
                isVisible: true,
            },
            {
                name: 'Artisanal Whole Wheat Bread 400g',
                slug: 'artisanal-whole-wheat-bread-400g',
                description: 'Freshly baked daily whole wheat brown bread with seeds.',
                price: 45,
                unit: 'Pack',
                image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600',
                images: ['https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600'],
                categoryId: qcCategory._id,
                quickCommerceCategoryId: qcCategory._id,
                vendorId: createdVendors['quick_commerce']._id,
                stock: 'in_stock',
                stockQuantity: 80,
                quickCommerceEnabled: true,
                retailEnabled: false,
                wholesaleEnabled: false,
                quickCommerce: {
                    packSize: '400g',
                    shelfLifeDays: 5,
                    isPerishable: true,
                    maxOrderQty: 4,
                },
                isActive: true,
                isVisible: true,
            },

            // Retail (B2C) Products
            {
                name: 'Wireless Active Noise Cancelling Headphones',
                slug: 'wireless-anc-headphones',
                description: 'Premium bluetooth over-ear headphones with 30-hour battery life and bass boost.',
                price: 2499,
                originalPrice: 3999,
                unit: 'Piece',
                image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600',
                images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600'],
                categoryId: retailCategory._id,
                vendorId: createdVendors['retail']._id,
                stock: 'in_stock',
                stockQuantity: 45,
                retailEnabled: true,
                quickCommerceEnabled: false,
                wholesaleEnabled: false,
                isActive: true,
                isVisible: true,
            },
            {
                name: 'Classic Pique Cotton Polo Shirt - Navy Blue',
                slug: 'classic-cotton-polo-navy',
                description: 'Breathable 100% combed cotton pique polo tshirt for casual wear.',
                price: 899,
                originalPrice: 1299,
                unit: 'Piece',
                image: 'https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=600',
                images: ['https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=600'],
                categoryId: retailCategory._id,
                vendorId: createdVendors['retail']._id,
                stock: 'in_stock',
                stockQuantity: 120,
                retailEnabled: true,
                quickCommerceEnabled: false,
                wholesaleEnabled: false,
                isActive: true,
                isVisible: true,
            },

            // Wholesale (B2B) Products
            {
                name: 'Commercial Heavy Denim Jeans (Bulk Pack 50 Pcs)',
                slug: 'commercial-denim-jeans-bulk-50',
                description: 'High-grade 14oz denim jeans bundle for retail resellers and boutiques.',
                price: 450, // base unit price
                unit: 'Bundle (50 Pcs)',
                image: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=600',
                images: ['https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=600'],
                categoryId: wholesaleCategory._id,
                vendorId: createdVendors['wholesale']._id,
                stock: 'in_stock',
                stockQuantity: 500,
                wholesaleEnabled: true,
                retailEnabled: false,
                quickCommerceEnabled: false,
                minimumOrderQuantity: 10,
                wholesale: {
                    moqEnabled: true,
                    moq: 10,
                    priceTiers: [
                        { minQty: 10, price: 450 },
                        { minQty: 25, price: 400 },
                        { minQty: 50, price: 350 },
                    ],
                },
                isActive: true,
                isVisible: true,
            },
            {
                name: 'Stainless Steel Commercial Cookware Set (Trade Lot)',
                slug: 'stainless-steel-cookware-trade-lot',
                description: 'Heavy duty 3-ply stainless steel cookware set designed for hotel & restaurant supply.',
                price: 1200,
                unit: 'Set',
                image: 'https://images.unsplash.com/photo-1584992236310-6edddc08acff?w=600',
                images: ['https://images.unsplash.com/photo-1584992236310-6edddc08acff?w=600'],
                categoryId: wholesaleCategory._id,
                vendorId: createdVendors['wholesale']._id,
                stock: 'in_stock',
                stockQuantity: 200,
                wholesaleEnabled: true,
                retailEnabled: false,
                quickCommerceEnabled: false,
                minimumOrderQuantity: 5,
                wholesale: {
                    moqEnabled: true,
                    moq: 5,
                    priceTiers: [
                        { minQty: 5, price: 1200 },
                        { minQty: 20, price: 980 },
                        { minQty: 50, price: 850 },
                    ],
                },
                isActive: true,
                isVisible: true,
            },

            // Multi-channel Product (QC + Retail)
            {
                name: 'Natural Electrolyte Energy Drink 250ml',
                slug: 'natural-electrolyte-energy-drink-250ml',
                description: 'Instant hydration energy drink with real fruit juice extract.',
                price: 120,
                unit: 'Can',
                image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600',
                images: ['https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600'],
                categoryId: qcCategory._id,
                quickCommerceCategoryId: qcCategory._id,
                vendorId: createdVendors['quick_commerce']._id,
                stock: 'in_stock',
                stockQuantity: 1000,
                quickCommerceEnabled: true,
                retailEnabled: true,
                wholesaleEnabled: false,
                minimumOrderQuantity: 1,
                quickCommerce: {
                    packSize: '250ml',
                    shelfLifeDays: 180,
                    isPerishable: false,
                    maxOrderQty: 24,
                },
                isActive: true,
                isVisible: true,
            },
        ];

        for (const pData of productsToSeed) {
            let prod = await Product.findOne({ slug: pData.slug });
            if (!prod) {
                prod = new Product(pData);
                await prod.save();
                console.log(`✅ Created Product: ${pData.name} [Vendor ID: ${pData.vendorId}]`);
            } else {
                // Update fields
                Object.assign(prod, pData);
                await prod.save();
                console.log(`ℹ️ Updated Product: ${pData.name}`);
            }
        }

        console.log('\n======================================================');
        console.log('🎉 SEEDING COMPLETE! Test Credentials Summary:');
        console.log('======================================================\n');

        console.log('👤 CUSTOMER LOGIN CREDENTIALS:');
        console.log('   Email:    customer@dwellmart.com');
        console.log('   Password: Customer123!\n');

        console.log('🏪 VENDOR LOGIN CREDENTIALS (BY TYPE):');
        console.log('   1. QUICK COMMERCE VENDOR (Express Delivery 10-15 min):');
        console.log('      Email:    qc.vendor@dwellmart.com');
        console.log('      Password: Vendor123!');
        console.log('      Store:    Express Daily Store (Quick Commerce)\n');

        console.log('   2. RETAIL VENDOR (B2C Standard Marketplace):');
        console.log('      Email:    retail.vendor@dwellmart.com');
        console.log('      Password: Vendor123!');
        console.log('      Store:    Trendy Life Hub (Retail B2C)\n');

        console.log('   3. WHOLESALE VENDOR (B2B Bulk & Tiered Pricing):');
        console.log('      Email:    wholesale.vendor@dwellmart.com');
        console.log('      Password: Vendor123!');
        console.log('      Store:    Mega Bulk Depot (Wholesale B2B)\n');

        console.log('======================================================\n');

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ Seeding Error:', err);
        await mongoose.disconnect();
        process.exit(1);
    }
};

seedData();
