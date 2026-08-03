import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Category from '../models/Category.model.js';
import Product from '../models/Product.model.js';
import { EXPERIENCES } from '../constants/experiences.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const createSlug = (name) =>
    name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-');

// ── 1. Quick Commerce Categories (21 Main Categories & ~100 Subcategories) ────
const EXPRESS_CATEGORIES_TREE = [
    {
        name: 'Fresh Fruits & Vegetables',
        slug: 'fresh-fruits-vegetables',
        displayOrder: 1,
        image: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Fresh Fruits', slug: 'fresh-fruits', image: 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=400&q=80' },
            { name: 'Fresh Vegetables', slug: 'fresh-vegetables', image: 'https://images.unsplash.com/photo-1597362925123-77861d3fbac7?auto=format&fit=crop&w=400&q=80' },
            { name: 'Exotic Fruits', slug: 'exotic-fruits', image: 'https://images.unsplash.com/photo-1528825871115-3581a5387919?auto=format&fit=crop&w=400&q=80' },
            { name: 'Exotic Vegetables', slug: 'exotic-vegetables', image: 'https://images.unsplash.com/photo-1566385101042-1a0aa0c1268c?auto=format&fit=crop&w=400&q=80' },
            { name: 'Organic Produce', slug: 'organic-produce', image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80' },
            { name: 'Fresh Herbs', slug: 'fresh-herbs', image: 'https://images.unsplash.com/photo-1515586000433-45406d8e6662?auto=format&fit=crop&w=400&q=80' },
            { name: 'Cut & Peeled Vegetables', slug: 'cut-peeled-vegetables', image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=400&q=80' },
            { name: 'Salads', slug: 'salads', image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=400&q=80' },
            { name: 'Sprouts', slug: 'sprouts', image: 'https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&w=400&q=80' },
            { name: 'Mushrooms', slug: 'mushrooms', image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Dairy, Bread & Eggs',
        slug: 'dairy-bread-eggs',
        displayOrder: 2,
        image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Milk', slug: 'milk', image: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=400&q=80' },
            { name: 'Curd & Yogurt', slug: 'curd-yogurt', image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=400&q=80' },
            { name: 'Butter', slug: 'butter', image: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&fit=crop&w=400&q=80' },
            { name: 'Cheese', slug: 'cheese', image: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=400&q=80' },
            { name: 'Paneer', slug: 'paneer', image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=400&q=80' },
            { name: 'Cream', slug: 'cream', image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=400&q=80' },
            { name: 'Ghee', slug: 'ghee', image: 'https://images.unsplash.com/photo-1627485937980-221c88ab04f9?auto=format&fit=crop&w=400&q=80' },
            { name: 'Eggs', slug: 'eggs', image: 'https://images.unsplash.com/photo-1506976785307-8732e854ad03?auto=format&fit=crop&w=400&q=80' },
            { name: 'Bread', slug: 'bread', image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=400&q=80' },
            { name: 'Buns', slug: 'buns', image: 'https://images.unsplash.com/photo-1586444248902-2f64eddc13df?auto=format&fit=crop&w=400&q=80' },
            { name: 'Pav', slug: 'pav', image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=400&q=80' },
            { name: 'Brown Bread', slug: 'brown-bread', image: 'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?auto=format&fit=crop&w=400&q=80' },
            { name: 'Garlic Bread', slug: 'garlic-bread', image: 'https://images.unsplash.com/photo-1573140247614-23947477619a?auto=format&fit=crop&w=400&q=80' },
            { name: 'Cakes', slug: 'cakes', image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=400&q=80' },
            { name: 'Muffins', slug: 'muffins', image: 'https://images.unsplash.com/photo-1586985289688-ca3cf47d3e6e?auto=format&fit=crop&w=400&q=80' },
            { name: 'Croissants', slug: 'croissants', image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Atta, Rice & Staples',
        slug: 'atta-rice-staples',
        displayOrder: 3,
        image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Wheat Flour', slug: 'wheat-flour', image: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=400&q=80' },
            { name: 'Multigrain Flour', slug: 'multigrain-flour', image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=400&q=80' },
            { name: 'Rice', slug: 'rice', image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=400&q=80' },
            { name: 'Basmati Rice', slug: 'basmati-rice', image: 'https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?auto=format&fit=crop&w=400&q=80' },
            { name: 'Brown Rice', slug: 'brown-rice', image: 'https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?auto=format&fit=crop&w=400&q=80' },
            { name: 'Pulses', slug: 'pulses', image: 'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?auto=format&fit=crop&w=400&q=80' },
            { name: 'Lentils', slug: 'lentils', image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80' },
            { name: 'Beans', slug: 'beans', image: 'https://images.unsplash.com/photo-1551462147-37885abb36f1?auto=format&fit=crop&w=400&q=80' },
            { name: 'Poha', slug: 'poha', image: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=400&q=80' },
            { name: 'Suji', slug: 'suji', image: 'https://images.unsplash.com/photo-1608686207856-001b95cf60ca?auto=format&fit=crop&w=400&q=80' },
            { name: 'Besan', slug: 'besan', image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=400&q=80' },
            { name: 'Vermicelli', slug: 'vermicelli', image: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?auto=format&fit=crop&w=400&q=80' },
            { name: 'Soya Chunks', slug: 'soya-chunks', image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Oils & Ghee',
        slug: 'oils-ghee',
        displayOrder: 4,
        image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Mustard Oil', slug: 'mustard-oil', image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=400&q=80' },
            { name: 'Sunflower Oil', slug: 'sunflower-oil', image: 'https://images.unsplash.com/photo-1618160702438-9b02ab6515c9?auto=format&fit=crop&w=400&q=80' },
            { name: 'Groundnut Oil', slug: 'groundnut-oil', image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=400&q=80' },
            { name: 'Olive Oil', slug: 'olive-oil', image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=400&q=80' },
            { name: 'Coconut Oil', slug: 'coconut-oil', image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=400&q=80' },
            { name: 'Rice Bran Oil', slug: 'rice-bran-oil', image: 'https://images.unsplash.com/photo-1618160702438-9b02ab6515c9?auto=format&fit=crop&w=400&q=80' },
            { name: 'Desi Ghee', slug: 'desi-ghee', image: 'https://images.unsplash.com/photo-1627485937980-221c88ab04f9?auto=format&fit=crop&w=400&q=80' },
            { name: 'Vanaspati', slug: 'vanaspati', image: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Spices & Masalas',
        slug: 'spices-masalas',
        displayOrder: 5,
        image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Whole Spices', slug: 'whole-spices', image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=400&q=80' },
            { name: 'Powder Spices', slug: 'powder-spices', image: 'https://images.unsplash.com/photo-1532336414038-cf19250c5757?auto=format&fit=crop&w=400&q=80' },
            { name: 'Garam Masala', slug: 'garam-masala', image: 'https://images.unsplash.com/photo-1608686207856-001b95cf60ca?auto=format&fit=crop&w=400&q=80' },
            { name: 'Kitchen King', slug: 'kitchen-king', image: 'https://images.unsplash.com/photo-1509358271058-acd01cc9386a?auto=format&fit=crop&w=400&q=80' },
            { name: 'Chaat Masala', slug: 'chaat-masala', image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=400&q=80' },
            { name: 'Ginger Garlic Paste', slug: 'ginger-garlic-paste', image: 'https://images.unsplash.com/photo-1618160702438-9b02ab6515c9?auto=format&fit=crop&w=400&q=80' },
            { name: 'Pickles', slug: 'pickles', image: 'https://images.unsplash.com/photo-1589135233689-d5363297a7a5?auto=format&fit=crop&w=400&q=80' },
            { name: 'Papad', slug: 'papad', image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Dry Fruits & Nuts',
        slug: 'dry-fruits-nuts',
        displayOrder: 6,
        image: 'https://images.unsplash.com/photo-1509358271058-acd01cc9386a?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Almonds', slug: 'almonds', image: 'https://images.unsplash.com/photo-1508061253366-f7da158b6d46?auto=format&fit=crop&w=400&q=80' },
            { name: 'Cashews', slug: 'cashews', image: 'https://images.unsplash.com/photo-1536591375315-1b849209d6a0?auto=format&fit=crop&w=400&q=80' },
            { name: 'Pistachios', slug: 'pistachios', image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80' },
            { name: 'Raisins', slug: 'raisins', image: 'https://images.unsplash.com/photo-1595411425732-e68c8a121ef7?auto=format&fit=crop&w=400&q=80' },
            { name: 'Walnuts', slug: 'walnuts', image: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=400&q=80' },
            { name: 'Dates', slug: 'dates', image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=400&q=80' },
            { name: 'Seeds', slug: 'seeds', image: 'https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&w=400&q=80' },
            { name: 'Trail Mix', slug: 'trail-mix', image: 'https://images.unsplash.com/photo-1509358271058-acd01cc9386a?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Snacks & Namkeen',
        slug: 'snacks-namkeen',
        displayOrder: 7,
        image: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Chips', slug: 'chips', image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=400&q=80' },
            { name: 'Namkeen', slug: 'namkeen', image: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?auto=format&fit=crop&w=400&q=80' },
            { name: 'Bhujia', slug: 'bhujia', image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=400&q=80' },
            { name: 'Popcorn', slug: 'popcorn', image: 'https://images.unsplash.com/photo-1578849278619-e73505e9610f?auto=format&fit=crop&w=400&q=80' },
            { name: 'Khakhra', slug: 'khakhra', image: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=400&q=80' },
            { name: 'Nachos', slug: 'nachos', image: 'https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?auto=format&fit=crop&w=400&q=80' },
            { name: 'Roasted Snacks', slug: 'roasted-snacks', image: 'https://images.unsplash.com/photo-1509358271058-acd01cc9386a?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Biscuits & Cookies',
        slug: 'biscuits-cookies',
        displayOrder: 8,
        image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Glucose Biscuits', slug: 'glucose-biscuits', image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=400&q=80' },
            { name: 'Cream Biscuits', slug: 'cream-biscuits', image: 'https://images.unsplash.com/photo-1548365328-8c6db3220e4c?auto=format&fit=crop&w=400&q=80' },
            { name: 'Digestive Biscuits', slug: 'digestive-biscuits', image: 'https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?auto=format&fit=crop&w=400&q=80' },
            { name: 'Cookies', slug: 'cookies', image: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=400&q=80' },
            { name: 'Rusks', slug: 'rusks', image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Chocolates & Sweets',
        slug: 'chocolates-sweets',
        displayOrder: 9,
        image: 'https://images.unsplash.com/photo-1511381939415-e44015466834?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Chocolates', slug: 'chocolates' },
            { name: 'Candy', slug: 'candy' },
            { name: 'Gummies', slug: 'gummies' },
            { name: 'Traditional Sweets', slug: 'traditional-sweets' },
            { name: 'Gift Boxes', slug: 'gift-boxes' },
        ],
    },
    {
        name: 'Beverages',
        slug: 'beverages',
        displayOrder: 10,
        image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Soft Drinks', slug: 'soft-drinks' },
            { name: 'Juices', slug: 'juices' },
            { name: 'Energy Drinks', slug: 'energy-drinks' },
            { name: 'Coconut Water', slug: 'coconut-water' },
            { name: 'Soda', slug: 'soda' },
            { name: 'Flavoured Water', slug: 'flavoured-water' },
        ],
    },
    {
        name: 'Tea, Coffee & Health Drinks',
        slug: 'tea-coffee-health-drinks',
        displayOrder: 11,
        image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Tea', slug: 'tea' },
            { name: 'Green Tea', slug: 'green-tea' },
            { name: 'Coffee', slug: 'coffee' },
            { name: 'Instant Coffee', slug: 'instant-coffee' },
            { name: 'Protein Drinks', slug: 'protein-drinks' },
            { name: 'Malt Drinks', slug: 'malt-drinks' },
            { name: 'Health Supplements', slug: 'health-supplements' },
        ],
    },
    {
        name: 'Instant Food',
        slug: 'instant-food',
        displayOrder: 12,
        image: 'https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Noodles', slug: 'noodles' },
            { name: 'Pasta', slug: 'pasta' },
            { name: 'Soup', slug: 'soup' },
            { name: 'Ready-to-Eat Meals', slug: 'ready-to-eat-meals' },
            { name: 'Frozen Snacks', slug: 'frozen-snacks' },
            { name: 'Frozen Vegetables', slug: 'frozen-vegetables' },
        ],
    },
    {
        name: 'Meat, Fish & Eggs',
        slug: 'meat-fish-eggs',
        displayOrder: 13,
        image: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Chicken', slug: 'chicken' },
            { name: 'Mutton', slug: 'mutton' },
            { name: 'Fish', slug: 'fish' },
            { name: 'Seafood', slug: 'seafood' },
            { name: 'Eggs', slug: 'meat-eggs' },
            { name: 'Frozen Meat', slug: 'frozen-meat' },
        ],
    },
    {
        name: 'Baby Care',
        slug: 'baby-care',
        displayOrder: 14,
        image: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Baby Food', slug: 'baby-food' },
            { name: 'Baby Diapers', slug: 'baby-diapers' },
            { name: 'Baby Wipes', slug: 'baby-wipes' },
            { name: 'Baby Shampoo', slug: 'baby-shampoo' },
            { name: 'Baby Lotion', slug: 'baby-lotion' },
            { name: 'Baby Toys', slug: 'baby-toys' },
            { name: 'Feeding Bottles', slug: 'feeding-bottles' },
        ],
    },
    {
        name: 'Personal Care',
        slug: 'personal-care',
        displayOrder: 15,
        image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Shampoo', slug: 'shampoo' },
            { name: 'Soap', slug: 'soap' },
            { name: 'Face Wash', slug: 'face-wash' },
            { name: 'Toothpaste', slug: 'toothpaste' },
            { name: 'Toothbrush', slug: 'toothbrush' },
            { name: 'Hair Oil', slug: 'hair-oil' },
            { name: 'Deodorants', slug: 'deodorants' },
            { name: 'Perfumes', slug: 'perfumes' },
            { name: 'Sanitary Pads', slug: 'sanitary-pads' },
            { name: 'Men’s Grooming', slug: 'mens-grooming' },
        ],
    },
    {
        name: 'Beauty & Cosmetics',
        slug: 'beauty-cosmetics',
        displayOrder: 16,
        image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Makeup', slug: 'makeup' },
            { name: 'Lipstick', slug: 'lipstick' },
            { name: 'Foundation', slug: 'foundation' },
            { name: 'Face Cream', slug: 'face-cream' },
            { name: 'Sunscreen', slug: 'sunscreen' },
            { name: 'Skin Care', slug: 'skin-care' },
            { name: 'Hair Colour', slug: 'hair-colour' },
            { name: 'Beauty Tools', slug: 'beauty-tools' },
        ],
    },
    {
        name: 'Health & Wellness',
        slug: 'health-wellness',
        displayOrder: 17,
        image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Vitamins', slug: 'vitamins' },
            { name: 'Protein Powder', slug: 'protein-powder' },
            { name: 'Ayurvedic Products', slug: 'ayurvedic-products' },
            { name: 'Medical Devices', slug: 'medical-devices' },
            { name: 'BP Monitor', slug: 'bp-monitor' },
            { name: 'Glucometer', slug: 'glucometer' },
            { name: 'First Aid', slug: 'first-aid' },
            { name: 'OTC Medicines', slug: 'otc-medicines' },
        ],
    },
    {
        name: 'Household Cleaning',
        slug: 'cleaning-supplies',
        displayOrder: 18,
        image: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Detergents', slug: 'detergents' },
            { name: 'Dishwash', slug: 'dishwash' },
            { name: 'Floor Cleaner', slug: 'floor-cleaner' },
            { name: 'Toilet Cleaner', slug: 'toilet-cleaner' },
            { name: 'Glass Cleaner', slug: 'glass-cleaner' },
            { name: 'Cleaning Tools', slug: 'cleaning-tools' },
            { name: 'Garbage Bags', slug: 'garbage-bags' },
        ],
    },
    {
        name: 'Pet Care',
        slug: 'pet-care',
        displayOrder: 19,
        image: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Dog Food', slug: 'dog-food' },
            { name: 'Cat Food', slug: 'cat-food' },
            { name: 'Pet Medicines', slug: 'pet-medicines' },
            { name: 'Pet Toys', slug: 'pet-toys' },
            { name: 'Grooming Products', slug: 'pet-grooming-products' },
        ],
    },
    {
        name: 'Flowers & Gifts',
        slug: 'flowers-gifts',
        displayOrder: 20,
        image: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Fresh Flowers', slug: 'fresh-flowers' },
            { name: 'Bouquets', slug: 'bouquets' },
            { name: 'Cakes', slug: 'gift-cakes' },
            { name: 'Greeting Cards', slug: 'greeting-cards' },
            { name: 'Gift Hampers', slug: 'gift-hampers' },
        ],
    },
    {
        name: 'Paan Corner',
        slug: 'paan-corner',
        displayOrder: 21,
        image: 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Paan', slug: 'paan' },
            { name: 'Mouth Fresheners', slug: 'mouth-fresheners' },
            { name: 'Cigarettes', slug: 'cigarettes' },
            { name: 'Tobacco Products', slug: 'tobacco-products' },
            { name: 'Lighters', slug: 'lighters' },
        ],
    },
];

// ── 2. Marketplace B2C Categories (14) ───────────────────────────────────────
const MARKETPLACE_CATEGORIES = [
    { name: 'Electronics', slug: 'electronics', displayOrder: 1, image: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=400&q=80' },
    { name: 'Mobiles & Accessories', slug: 'mobiles-accessories', displayOrder: 2, image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=400&q=80' },
    { name: 'Computers & Laptops', slug: 'computers-laptops', displayOrder: 3, image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=400&q=80' },
    { name: 'Fashion & Apparel', slug: 'fashion-apparel', displayOrder: 4, image: 'https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=400&q=80' },
    { name: "Men's Fashion", slug: 'mens-fashion', displayOrder: 5, image: 'https://images.unsplash.com/photo-1617137968427-85924c800a22?auto=format&fit=crop&w=400&q=80' },
    { name: "Women's Fashion", slug: 'womens-fashion', displayOrder: 6, image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=400&q=80' },
    { name: 'Kids Fashion', slug: 'kids-fashion', displayOrder: 7, image: 'https://images.unsplash.com/photo-1514090458221-65bb69cf63e6?auto=format&fit=crop&w=400&q=80' },
    { name: 'Home & Kitchen', slug: 'home-kitchen', displayOrder: 8, image: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=400&q=80' },
    { name: 'Furniture', slug: 'furniture', displayOrder: 9, image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=400&q=80' },
    { name: 'Home Appliances', slug: 'home-appliances', displayOrder: 10, image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=400&q=80' },
    { name: 'Beauty & Grooming', slug: 'beauty-grooming', displayOrder: 11, image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=400&q=80' },
    { name: 'Sports & Fitness', slug: 'sports-fitness', displayOrder: 12, image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=400&q=80' },
    { name: 'Books & Media', slug: 'books-media', displayOrder: 13, image: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=400&q=80' },
    { name: 'Automotive Accessories', slug: 'automotive-accessories', displayOrder: 14, image: 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=400&q=80' },
].map((item) => ({ ...item, supportedExperiences: [EXPERIENCES.MARKETPLACE] }));

// ── 3. Wholesale B2B Categories (8) ──────────────────────────────────────────
const WHOLESALE_CATEGORIES = [
    { name: 'Industrial Tools & Equipment', slug: 'industrial-tools', displayOrder: 1, image: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=400&q=80' },
    { name: 'Packaging Materials', slug: 'packaging-materials', displayOrder: 2, image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=400&q=80' },
    { name: 'Construction Supplies', slug: 'construction-supplies', displayOrder: 3, image: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=400&q=80' },
    { name: 'Agriculture & Farming', slug: 'agriculture-farming', displayOrder: 4, image: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=400&q=80' },
    { name: 'Wholesale Groceries', slug: 'wholesale-groceries', displayOrder: 5, image: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=400&q=80', supportedExperiences: [EXPERIENCES.MARKETPLACE, EXPERIENCES.WHOLESALE] },
    { name: 'Heavy Machinery', slug: 'heavy-machinery', displayOrder: 6, image: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80' },
    { name: 'Medical Supplies', slug: 'medical-supplies', displayOrder: 7, image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80' },
    { name: 'Office Supplies & Stationery', slug: 'office-supplies', displayOrder: 8, image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=400&q=80' },
].map((item) => ({ ...item, supportedExperiences: item.supportedExperiences || [EXPERIENCES.WHOLESALE] }));

const ALL_SEED_CATEGORIES = [
    ...MARKETPLACE_CATEGORIES,
    ...WHOLESALE_CATEGORIES,
];

export const seedCategoriesInDb = async () => {
    let createdCount = 0;
    let updatedCount = 0;

    // ── 0. Cleanup Legacy Duplicate Slugs ──────────────────────────────────────
    const duplicateGroups = await Category.aggregate([
        { $group: { _id: '$slug', count: { $sum: 1 }, ids: { $push: '$_id' }, exps: { $push: '$supportedExperiences' }, legacyExps: { $push: '$experience' } } },
        { $match: { count: { $gt: 1 } } },
    ]);

    for (const group of duplicateGroups) {
        const [primaryId, ...duplicateIds] = group.ids;
        const allExperiences = new Set();
        group.exps.forEach((expArr) => {
            if (Array.isArray(expArr)) expArr.forEach((e) => e && allExperiences.add(e));
        });
        group.legacyExps.forEach((e) => e && allExperiences.add(e));

        const mergedExperiences = Array.from(allExperiences);
        if (mergedExperiences.length === 0) mergedExperiences.push(EXPERIENCES.MARKETPLACE);

        await Category.findByIdAndUpdate(primaryId, {
            $set: { supportedExperiences: mergedExperiences },
        });

        if (duplicateIds.length > 0) {
            // Re-point product category references to primary ID
            await mongoose.model('Product').updateMany(
                { categoryId: { $in: duplicateIds } },
                { $set: { categoryId: primaryId } }
            );
            await mongoose.model('Product').updateMany(
                { quickCommerceCategoryId: { $in: duplicateIds } },
                { $set: { quickCommerceCategoryId: primaryId } }
            );
            // Delete secondary duplicates
            await Category.deleteMany({ _id: { $in: duplicateIds } });
        }
    }

    // ── 1. Seed Quick Commerce Category Tree (Roots + Subcategories) ──────────
    for (const mainCat of EXPRESS_CATEGORIES_TREE) {
        let parentDoc = await Category.findOne({ slug: mainCat.slug });
        if (parentDoc) {
            parentDoc.name = mainCat.name;
            parentDoc.supportedExperiences = Array.from(new Set([...(parentDoc.supportedExperiences || []), EXPERIENCES.QUICK_COMMERCE]));
            parentDoc.displayOrder = mainCat.displayOrder;
            if (mainCat.image) parentDoc.image = mainCat.image;
            parentDoc.parentId = null;
            await parentDoc.save();
            updatedCount++;
        } else {
            parentDoc = await Category.create({
                name: mainCat.name,
                slug: mainCat.slug,
                displayOrder: mainCat.displayOrder,
                image: mainCat.image,
                parentId: null,
                supportedExperiences: [EXPERIENCES.QUICK_COMMERCE],
            });
            createdCount++;
        }

        if (Array.isArray(mainCat.subcategories)) {
            let subOrder = 1;
            for (const subCat of mainCat.subcategories) {
                const subImage = subCat.image || parentDoc.image || '';
                let subDoc = await Category.findOne({ slug: subCat.slug });
                if (subDoc) {
                    subDoc.name = subCat.name;
                    subDoc.parentId = parentDoc._id;
                    subDoc.supportedExperiences = Array.from(new Set([...(subDoc.supportedExperiences || []), EXPERIENCES.QUICK_COMMERCE]));
                    subDoc.displayOrder = subOrder++;
                    if (subImage) subDoc.image = subImage;
                    await subDoc.save();
                    updatedCount++;
                } else {
                    await Category.create({
                        name: subCat.name,
                        slug: subCat.slug,
                        displayOrder: subOrder++,
                        parentId: parentDoc._id,
                        image: subImage,
                        supportedExperiences: [EXPERIENCES.QUICK_COMMERCE],
                    });
                    createdCount++;
                }
            }
        }
    }

    // ── 2. Seed Marketplace & Wholesale Categories ───────────────────────────
    const OTHER_CATEGORIES = [...MARKETPLACE_CATEGORIES, ...WHOLESALE_CATEGORIES];
    for (const catData of OTHER_CATEGORIES) {
        const existing = await Category.findOne({ slug: catData.slug });
        if (existing) {
            existing.name = catData.name;
            existing.supportedExperiences = Array.from(new Set([...(existing.supportedExperiences || []), ...catData.supportedExperiences]));
            existing.displayOrder = catData.displayOrder;
            if (catData.image) existing.image = catData.image;
            await existing.save();
            updatedCount++;
        } else {
            await Category.create(catData);
            createdCount++;
        }
    }

    return { createdCount, updatedCount };
};

async function main() {
    console.log('\n🌱  Seeding experience-based category architecture...\n');

    if (!process.env.MONGO_URI) {
        console.error('MONGO_URI is not set in environment variables.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB.');

    const stats = await seedCategoriesInDb();

    console.log(`✅  Seeding completed: ${stats.createdCount} created, ${stats.updatedCount} updated (${stats.total} total).\n`);

    await mongoose.disconnect();
    process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith('seedCategories.js')) {
    main().catch((err) => {
        console.error('Fatal error during category seeding:', err);
        process.exit(1);
    });
}
