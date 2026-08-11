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

// ── 2. Marketplace B2C & B2B Categories Tree (Hybrid 2-Level & 3-Level) ────────
const MARKETPLACE_CATEGORIES_TREE = [
    {
        name: 'Fashion & Lifestyle',
        slug: 'fashion-lifestyle',
        displayOrder: 1,
        image: 'https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=400&q=80',
        departments: [
            {
                name: "Men's",
                slug: 'mens',
                image: 'https://images.unsplash.com/photo-1617137968427-85924c800a22?auto=format&fit=crop&w=400&q=80',
                subcategories: [
                    { name: 'T-Shirts', slug: 'mens-tshirts', image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=400&q=80' },
                    { name: 'Shirts', slug: 'mens-shirts', image: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=400&q=80' },
                    { name: 'Jeans', slug: 'mens-jeans', image: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=400&q=80' },
                    { name: 'Trousers', slug: 'mens-trousers', image: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&w=400&q=80' },
                    { name: 'Ethnic Wear', slug: 'mens-ethnic-wear', image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=400&q=80' },
                    { name: 'Jackets', slug: 'mens-jackets', image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=400&q=80' },
                    { name: 'Sports Wear', slug: 'mens-sports-wear', image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=400&q=80' },
                ],
            },
            {
                name: "Women's",
                slug: 'womens',
                image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=400&q=80',
                subcategories: [
                    { name: 'Sarees', slug: 'womens-sarees', image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=400&q=80' },
                    { name: 'Kurtis', slug: 'womens-kurtis', image: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=400&q=80' },
                    { name: 'Dresses', slug: 'womens-dresses', image: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=400&q=80' },
                    { name: 'Tops', slug: 'womens-tops', image: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=400&q=80' },
                    { name: 'Jeans', slug: 'womens-jeans', image: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=400&q=80' },
                    { name: 'Shorts', slug: 'womens-shorts', image: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&w=400&q=80' },
                    { name: 'Leggings', slug: 'womens-leggings', image: 'https://images.unsplash.com/photo-1506629082925-2368c4676df1?auto=format&fit=crop&w=400&q=80' },
                    { name: 'Sports Wear', slug: 'womens-sports-wear', image: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=400&q=80' },
                ],
            },
            {
                name: 'Baby & Kids',
                slug: 'baby-kids',
                image: 'https://images.unsplash.com/photo-1514090458221-65bb69cf63e6?auto=format&fit=crop&w=400&q=80',
                subcategories: [
                    { name: 'Boys Clothing', slug: 'boys-clothing', image: 'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?auto=format&fit=crop&w=400&q=80' },
                    { name: 'Girls Clothing', slug: 'girls-clothing', image: 'https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?auto=format&fit=crop&w=400&q=80' },
                    { name: 'Sports Wear', slug: 'kids-sports-wear', image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=400&q=80' },
                    { name: 'Infant Wear', slug: 'infant-wear', image: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=400&q=80' },
                    { name: 'Baby Care', slug: 'baby-care-kids', image: 'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?auto=format&fit=crop&w=400&q=80' },
                    { name: 'Toys & Games', slug: 'toys-games', image: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=400&q=80' },
                    { name: 'Feeding Products', slug: 'feeding-products', image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80' },
                    { name: 'Footwear Boys', slug: 'footwear-boys', image: 'https://images.unsplash.com/photo-1514989940723-e8e51635b782?auto=format&fit=crop&w=400&q=80' },
                    { name: 'Footwear Girls', slug: 'footwear-girls', image: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=400&q=80' },
                    { name: 'Accessories', slug: 'kids-accessories', image: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=400&q=80' },
                ],
            },
        ],
    },
    {
        name: 'Beauty & Personal Care',
        slug: 'beauty-personal-care',
        displayOrder: 2,
        image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Skincare', slug: 'skincare', image: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=400&q=80' },
            { name: 'Haircare', slug: 'haircare', image: 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?auto=format&fit=crop&w=400&q=80' },
            { name: 'Cosmetics', slug: 'cosmetics', image: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=400&q=80' },
            { name: 'Perfumes', slug: 'perfumes', image: 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=400&q=80' },
            { name: 'Personal Hygiene', slug: 'personal-hygiene', image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80' },
            { name: 'Ayurvedic Products', slug: 'ayurvedic-products', image: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Electronics & Mobiles',
        slug: 'electronics-mobiles',
        displayOrder: 3,
        image: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Mobile Phones', slug: 'mobile-phones', image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=400&q=80' },
            { name: 'Chargers', slug: 'chargers', image: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=400&q=80' },
            { name: 'Earphones', slug: 'earphones', image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=400&q=80' },
            { name: 'Smart Watches', slug: 'smart-watches', image: 'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?auto=format&fit=crop&w=400&q=80' },
            { name: 'Power Banks', slug: 'power-banks', image: 'https://images.unsplash.com/photo-1609592424009-5437a3c30bc1?auto=format&fit=crop&w=400&q=80' },
            { name: 'Bluetooth Speakers', slug: 'bluetooth-speakers', image: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=400&q=80' },
            { name: 'Cables', slug: 'cables', image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80' },
            { name: 'Laptop Accessories', slug: 'laptop-accessories', image: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=400&q=80' },
            { name: 'Computer Accessories', slug: 'computer-accessories', image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=400&q=80' },
            { name: 'Printers', slug: 'printers', image: 'https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Home & Kitchen',
        slug: 'home-kitchen',
        displayOrder: 4,
        image: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Kitchen Appliances', slug: 'kitchen-appliances', image: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=400&q=80' },
            { name: 'Cookware', slug: 'cookware', image: 'https://images.unsplash.com/photo-1584992236310-6edddc08acff?auto=format&fit=crop&w=400&q=80' },
            { name: 'Furniture', slug: 'furniture', image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=400&q=80' },
            { name: 'Home Decor', slug: 'home-decor', image: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=400&q=80' },
            { name: 'Lighting', slug: 'lighting', image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=400&q=80' },
            { name: 'Storage Solutions', slug: 'storage-solutions', image: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Electrical & Appliances',
        slug: 'electrical-appliances',
        displayOrder: 5,
        image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Fans', slug: 'fans', image: 'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=400&q=80' },
            { name: 'Air Conditioners', slug: 'air-conditioners', image: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=400&q=80' },
            { name: 'Refrigerators', slug: 'refrigerators', image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=400&q=80' },
            { name: 'Washing Machines', slug: 'washing-machines', image: 'https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?auto=format&fit=crop&w=400&q=80' },
            { name: 'Small Home Appliances', slug: 'small-home-appliances', image: 'https://images.unsplash.com/photo-1574269909862-7e1d70bb8078?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Health & Wellness',
        slug: 'health-wellness',
        displayOrder: 6,
        image: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Health Supplements', slug: 'health-supplements', image: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&w=400&q=80' },
            { name: 'Medical Devices', slug: 'medical-devices', image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80' },
            { name: 'Fitness Equipment', slug: 'fitness-equipment', image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=400&q=80' },
            { name: 'Personal Care', slug: 'personal-care-health', image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Automotive',
        slug: 'automotive',
        displayOrder: 7,
        image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Car Accessories', slug: 'car-accessories', image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=400&q=80' },
            { name: 'Bike Accessories', slug: 'bike-accessories', image: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=400&q=80' },
            { name: 'Tyres', slug: 'tyres', image: 'https://images.unsplash.com/photo-1578844251758-2f71da64c96f?auto=format&fit=crop&w=400&q=80' },
            { name: 'Lubricants', slug: 'lubricants', image: 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=400&q=80' },
            { name: 'Car Care Products', slug: 'car-care-products', image: 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Books & Stationery',
        slug: 'books-stationery',
        displayOrder: 8,
        image: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'School Supplies', slug: 'school-supplies', image: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=400&q=80' },
            { name: 'Office Supplies', slug: 'office-supplies-stationery', image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=400&q=80' },
            { name: 'Notebooks', slug: 'notebooks', image: 'https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&w=400&q=80' },
            { name: 'Pens', slug: 'pens', image: 'https://images.unsplash.com/photo-1585336261026-8f5785782ed6?auto=format&fit=crop&w=400&q=80' },
            { name: 'Art Supplies', slug: 'art-supplies', image: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=400&q=80' },
            { name: 'Competitive Exam Books', slug: 'competitive-exam-books', image: 'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Pet Supplies',
        slug: 'pet-supplies',
        displayOrder: 9,
        image: 'https://images.unsplash.com/photo-1450778869186-40d5d5f7768a?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Pet Food', slug: 'pet-food', image: 'https://images.unsplash.com/photo-1589924691995-400dc9ecc119?auto=format&fit=crop&w=400&q=80' },
            { name: 'Pet Accessories', slug: 'pet-accessories', image: 'https://images.unsplash.com/photo-1450778869186-40d5d5f7768a?auto=format&fit=crop&w=400&q=80' },
            { name: 'Pet Healthcare', slug: 'pet-healthcare', image: 'https://images.unsplash.com/photo-1576201836106-db1758fd1c97?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Garden & Outdoor',
        slug: 'garden-outdoor',
        displayOrder: 10,
        image: 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Plants', slug: 'plants', image: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=400&q=80' },
            { name: 'Gardening Tools', slug: 'gardening-tools', image: 'https://images.unsplash.com/photo-1617576683096-00fc8eecb3af?auto=format&fit=crop&w=400&q=80' },
            { name: 'Outdoor Furniture', slug: 'outdoor-furniture', image: 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Gifts & Handmade',
        slug: 'gifts-handmade',
        displayOrder: 11,
        image: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Gift Items', slug: 'gift-items', image: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=400&q=80' },
            { name: 'Handicrafts', slug: 'handicrafts', image: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=400&q=80' },
            { name: 'Customized Products', slug: 'customized-products', image: 'https://images.unsplash.com/photo-1513885535751-8b9238bd345a?auto=format&fit=crop&w=400&q=80' },
            { name: 'Festival Gifts', slug: 'festival-gifts', image: 'https://images.unsplash.com/photo-1512909006721-3d6018887383?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Industrial & B2B',
        slug: 'industrial-b2b',
        displayOrder: 12,
        image: 'https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=400&q=80',
        supportedExperiences: [EXPERIENCES.WHOLESALE],
        subcategories: [
            { name: 'Machinery', slug: 'machinery', supportedExperiences: [EXPERIENCES.WHOLESALE], image: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80' },
            { name: 'Industrial Tools', slug: 'industrial-tools-b2b', supportedExperiences: [EXPERIENCES.WHOLESALE], image: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=400&q=80' },
            { name: 'Safety Equipment', slug: 'safety-equipment', supportedExperiences: [EXPERIENCES.WHOLESALE], image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80' },
            { name: 'Packaging Materials', slug: 'packaging-materials-b2b', supportedExperiences: [EXPERIENCES.WHOLESALE], image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=400&q=80' },
            { name: 'Raw Materials', slug: 'raw-materials', supportedExperiences: [EXPERIENCES.WHOLESALE], image: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=400&q=80' },
            { name: 'Electrical Components', slug: 'electrical-components', supportedExperiences: [EXPERIENCES.WHOLESALE], image: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Manufacturers Hub',
        slug: 'manufacturers-hub',
        displayOrder: 13,
        image: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80',
        supportedExperiences: [EXPERIENCES.WHOLESALE],
        subcategories: [
            { name: 'Factory Direct Products', slug: 'factory-direct-products', supportedExperiences: [EXPERIENCES.WHOLESALE], image: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80' },
            { name: 'OEM Manufacturers', slug: 'oem-manufacturers', supportedExperiences: [EXPERIENCES.WHOLESALE], image: 'https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=400&q=80' },
            { name: 'Bulk Orders', slug: 'bulk-orders', supportedExperiences: [EXPERIENCES.WHOLESALE], image: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=400&q=80' },
            { name: 'Export Products', slug: 'export-products', supportedExperiences: [EXPERIENCES.WHOLESALE], image: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Wholesale Market',
        slug: 'wholesale-market',
        displayOrder: 14,
        image: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=400&q=80',
        supportedExperiences: [EXPERIENCES.WHOLESALE],
        subcategories: [
            { name: 'FMCG Wholesale', slug: 'fmcg-wholesale', supportedExperiences: [EXPERIENCES.WHOLESALE], image: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=400&q=80' },
            { name: 'Textile Wholesale', slug: 'textile-wholesale', supportedExperiences: [EXPERIENCES.WHOLESALE], image: 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=400&q=80' },
            { name: 'Electronics Wholesale', slug: 'electronics-wholesale', supportedExperiences: [EXPERIENCES.WHOLESALE], image: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=400&q=80' },
            { name: 'Packaging Wholesale', slug: 'packaging-wholesale', supportedExperiences: [EXPERIENCES.WHOLESALE], image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=400&q=80' },
            { name: 'Building Materials', slug: 'building-materials-wholesale', supportedExperiences: [EXPERIENCES.WHOLESALE], image: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Wholesale Groceries',
        slug: 'wholesale-groceries',
        displayOrder: 15,
        image: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=400&q=80',
        supportedExperiences: [EXPERIENCES.MARKETPLACE, EXPERIENCES.WHOLESALE],
        subcategories: [
            { name: 'Bulk Staples', slug: 'bulk-staples', supportedExperiences: [EXPERIENCES.MARKETPLACE, EXPERIENCES.WHOLESALE], image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Books & Education',
        slug: 'books-education',
        displayOrder: 16,
        image: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Books', slug: 'books-education-books', image: 'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=400&q=80' },
            { name: 'Educational Toys', slug: 'educational-toys', image: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=400&q=80' },
            { name: 'Art & Craft', slug: 'art-craft-education', image: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=400&q=80' },
            { name: 'Learning Materials', slug: 'learning-materials', image: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=400&q=80' },
        ],
    },
    {
        name: 'Jewellery',
        slug: 'jewellery',
        displayOrder: 17,
        image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=400&q=80',
        subcategories: [
            { name: 'Gold Jewellery', slug: 'gold-jewellery', image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=400&q=80' },
            { name: 'Silver Jewellery', slug: 'silver-jewellery', image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=400&q=80' },
            { name: 'Artificial Jewellery', slug: 'artificial-jewellery', image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=400&q=80' },
            { name: 'Gemstones', slug: 'gemstones', image: 'https://images.unsplash.com/photo-1615655406736-b37c4fabf923?auto=format&fit=crop&w=400&q=80' },
        ],
    },
];

// ── 3. Valid Slugs Set ────────────────────────────────────────────────────────
const getValidSlugsSet = () => {
    const validSlugs = new Set();
    EXPRESS_CATEGORIES_TREE.forEach(c => {
        if (c.slug) validSlugs.add(c.slug);
        (c.subcategories || []).forEach(s => s.slug && validSlugs.add(s.slug));
    });
    MARKETPLACE_CATEGORIES_TREE.forEach(c => {
        if (c.slug) validSlugs.add(c.slug);
        const l2Items = c.departments || c.subcategories || [];
        l2Items.forEach(d => {
            if (d.slug) validSlugs.add(d.slug);
            (d.subcategories || []).forEach(s => s.slug && validSlugs.add(s.slug));
        });
    });
    return validSlugs;
};

export const seedCategoriesInDb = async () => {
    let createdCount = 0;
    let updatedCount = 0;

    // ── 0. Purge Obsolete Category Documents ──────────────────────────────────
    const validSlugs = getValidSlugsSet();
    const obsoleteDocs = await Category.find({ slug: { $nin: Array.from(validSlugs) } });
    if (obsoleteDocs.length > 0) {
        const obsoleteIds = obsoleteDocs.map(d => d._id);
        console.log(`🧹 Purging ${obsoleteDocs.length} obsolete legacy categories...`);
        await mongoose.model('Product').updateMany(
            { categoryId: { $in: obsoleteIds } },
            { $set: { categoryId: null } }
        );
        await mongoose.model('Product').updateMany(
            { quickCommerceCategoryId: { $in: obsoleteIds } },
            { $set: { quickCommerceCategoryId: null } }
        );
        await Category.deleteMany({ _id: { $in: obsoleteIds } });
    }

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

    // ── 2. Seed Marketplace & Wholesale Category Tree (Hybrid 2-Level & 3-Level) ────
    for (const mainCat of MARKETPLACE_CATEGORIES_TREE) {
        const defaultExp = mainCat.supportedExperiences || [EXPERIENCES.MARKETPLACE];
        let level1Doc = await Category.findOne({ slug: mainCat.slug });
        if (level1Doc) {
            level1Doc.name = mainCat.name;
            level1Doc.supportedExperiences = Array.from(new Set([...(level1Doc.supportedExperiences || []), ...defaultExp]));
            level1Doc.displayOrder = mainCat.displayOrder;
            if (mainCat.image) level1Doc.image = mainCat.image;
            level1Doc.parentId = null;
            await level1Doc.save();
            updatedCount++;
        } else {
            level1Doc = await Category.create({
                name: mainCat.name,
                slug: mainCat.slug,
                displayOrder: mainCat.displayOrder,
                image: mainCat.image,
                parentId: null,
                supportedExperiences: defaultExp,
            });
            createdCount++;
        }

        // Handle Level 2 items (Departments or direct Subcategories)
        const level2Items = mainCat.departments || mainCat.subcategories || [];
        let l2Order = 1;
        for (const l2Item of level2Items) {
            const l2Exp = l2Item.supportedExperiences || defaultExp;
            const l2Image = l2Item.image || level1Doc.image || '';
            let level2Doc = await Category.findOne({ slug: l2Item.slug });
            if (level2Doc) {
                level2Doc.name = l2Item.name;
                level2Doc.parentId = level1Doc._id;
                level2Doc.supportedExperiences = Array.from(new Set([...(level2Doc.supportedExperiences || []), ...l2Exp]));
                level2Doc.displayOrder = l2Order++;
                if (l2Image) level2Doc.image = l2Image;
                await level2Doc.save();
                updatedCount++;
            } else {
                level2Doc = await Category.create({
                    name: l2Item.name,
                    slug: l2Item.slug,
                    displayOrder: l2Order++,
                    parentId: level1Doc._id,
                    image: l2Image,
                    supportedExperiences: l2Exp,
                });
                createdCount++;
            }

            // Handle Level 3 items (Leaf Subcategories under Department)
            if (Array.isArray(l2Item.subcategories)) {
                let l3Order = 1;
                for (const l3Item of l2Item.subcategories) {
                    const l3Exp = l3Item.supportedExperiences || l2Exp;
                    const l3Image = l3Item.image || level2Doc.image || '';
                    let level3Doc = await Category.findOne({ slug: l3Item.slug });
                    if (level3Doc) {
                        level3Doc.name = l3Item.name;
                        level3Doc.parentId = level2Doc._id;
                        level3Doc.supportedExperiences = Array.from(new Set([...(level3Doc.supportedExperiences || []), ...l3Exp]));
                        level3Doc.displayOrder = l3Order++;
                        if (l3Image) level3Doc.image = l3Image;
                        await level3Doc.save();
                        updatedCount++;
                    } else {
                        await Category.create({
                            name: l3Item.name,
                            slug: l3Item.slug,
                            displayOrder: l3Order++,
                            parentId: level2Doc._id,
                            image: l3Image,
                            supportedExperiences: l3Exp,
                        });
                        createdCount++;
                    }
                }
            }
        }
    }

    const total = await Category.countDocuments({});
    return { createdCount, updatedCount, total };
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
