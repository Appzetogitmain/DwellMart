import dotenv from 'dotenv';
dotenv.config();

import connectDB from '../src/config/db.js';
import Category from '../src/models/Category.model.js';
import Product from '../src/models/Product.model.js';
import { slugify } from '../src/utils/slugify.js';

export const MARKETPLACE_CATEGORIES = [
  {
    name: 'Fresh Fruits & Vegetables',
    icon: '🍎',
    image: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=600&q=80',
    order: 1,
    subcategories: [
      { name: 'Fresh Fruits', image: 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=400&q=80' },
      { name: 'Fresh Vegetables', image: 'https://images.unsplash.com/photo-1597362925123-77861d3fbac7?auto=format&fit=crop&w=400&q=80' },
      { name: 'Exotic Fruits', image: 'https://images.unsplash.com/photo-1528825871115-3581a5387919?auto=format&fit=crop&w=400&q=80' },
      { name: 'Exotic Vegetables', image: 'https://images.unsplash.com/photo-1566385101042-1a0aa0c1268c?auto=format&fit=crop&w=400&q=80' },
      { name: 'Organic Produce', image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=400&q=80' },
      { name: 'Fresh Herbs', image: 'https://images.unsplash.com/photo-1608683134044-2227d8118029?auto=format&fit=crop&w=400&q=80' },
      { name: 'Cut & Peeled Vegetables', image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=400&q=80' },
      { name: 'Salads', image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=400&q=80' },
      { name: 'Sprouts', image: 'https://images.unsplash.com/photo-1509358271058-acd02cc93898?auto=format&fit=crop&w=400&q=80' },
      { name: 'Mushrooms', image: 'https://images.unsplash.com/photo-1504470695779-75300268aa0e?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Dairy, Bread & Eggs',
    icon: '🥛',
    image: 'https://images.unsplash.com/photo-1528750997573-59b89d66df4f?auto=format&fit=crop&w=600&q=80',
    order: 2,
    subcategories: [
      { name: 'Milk', image: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=400&q=80' },
      { name: 'Curd & Yogurt', image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=400&q=80' },
      { name: 'Butter', image: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&fit=crop&w=400&q=80' },
      { name: 'Cheese', image: 'https://images.unsplash.com/photo-1452195100486-9cc805987862?auto=format&fit=crop&w=400&q=80' },
      { name: 'Paneer', image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=400&q=80' },
      { name: 'Cream', image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=400&q=80' },
      { name: 'Ghee', image: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=400&q=80' },
      { name: 'Eggs', image: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=400&q=80' },
      { name: 'Bread', image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=400&q=80' },
      { name: 'Buns', image: 'https://images.unsplash.com/photo-1586444248902-2f64eddc13df?auto=format&fit=crop&w=400&q=80' },
      { name: 'Pav', image: 'https://images.unsplash.com/photo-1606131731446-5568d87113aa?auto=format&fit=crop&w=400&q=80' },
      { name: 'Brown Bread', image: 'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?auto=format&fit=crop&w=400&q=80' },
      { name: 'Garlic Bread', image: 'https://images.unsplash.com/photo-1619535860434-ba1d8fa12536?auto=format&fit=crop&w=400&q=80' },
      { name: 'Cakes', image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=400&q=80' },
      { name: 'Muffins', image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=400&q=80' },
      { name: 'Croissants', image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Atta, Rice & Staples',
    icon: '🌾',
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e8ac?auto=format&fit=crop&w=600&q=80',
    order: 3,
    subcategories: [
      { name: 'Wheat Flour', image: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=400&q=80' },
      { name: 'Multigrain Flour', image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=400&q=80' },
      { name: 'Rice', image: 'https://images.unsplash.com/photo-1586201375761-83865001e8ac?auto=format&fit=crop&w=400&q=80' },
      { name: 'Basmati Rice', image: 'https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?auto=format&fit=crop&w=400&q=80' },
      { name: 'Brown Rice', image: 'https://images.unsplash.com/photo-1596560548464-f010549b84d7?auto=format&fit=crop&w=400&q=80' },
      { name: 'Pulses', image: 'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?auto=format&fit=crop&w=400&q=80' },
      { name: 'Lentils', image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80' },
      { name: 'Beans', image: 'https://images.unsplash.com/photo-1551462147-ff29053bfc14?auto=format&fit=crop&w=400&q=80' },
      { name: 'Poha', image: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=400&q=80' },
      { name: 'Suji', image: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=400&q=80' },
      { name: 'Besan', image: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=400&q=80' },
      { name: 'Vermicelli', image: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?auto=format&fit=crop&w=400&q=80' },
      { name: 'Soya Chunks', image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Oils & Ghee',
    icon: '🛢️',
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80',
    order: 4,
    subcategories: [
      { name: 'Mustard Oil', image: 'https://images.unsplash.com/photo-1618160702438-9b02ab6515c9?auto=format&fit=crop&w=400&q=80' },
      { name: 'Sunflower Oil', image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=400&q=80' },
      { name: 'Groundnut Oil', image: 'https://images.unsplash.com/photo-1618160702438-9b02ab6515c9?auto=format&fit=crop&w=400&q=80' },
      { name: 'Olive Oil', image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=400&q=80' },
      { name: 'Coconut Oil', image: 'https://images.unsplash.com/photo-1526947425960-945c6e72858f?auto=format&fit=crop&w=400&q=80' },
      { name: 'Rice Bran Oil', image: 'https://images.unsplash.com/photo-1618160702438-9b02ab6515c9?auto=format&fit=crop&w=400&q=80' },
      { name: 'Desi Ghee', image: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=400&q=80' },
      { name: 'Vanaspati', image: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Spices & Masalas',
    icon: '🌶️',
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=600&q=80',
    order: 5,
    subcategories: [
      { name: 'Whole Spices', image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=400&q=80' },
      { name: 'Powder Spices', image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=400&q=80' },
      { name: 'Garam Masala', image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=400&q=80' },
      { name: 'Kitchen King', image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=400&q=80' },
      { name: 'Chaat Masala', image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=400&q=80' },
      { name: 'Ginger Garlic Paste', image: 'https://images.unsplash.com/photo-1618160702438-9b02ab6515c9?auto=format&fit=crop&w=400&q=80' },
      { name: 'Pickles', image: 'https://images.unsplash.com/photo-1589135233689-d58b64c78204?auto=format&fit=crop&w=400&q=80' },
      { name: 'Papad', image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Dry Fruits & Nuts',
    icon: '🥜',
    image: 'https://images.unsplash.com/photo-1508061252220-db985fb4a496?auto=format&fit=crop&w=600&q=80',
    order: 6,
    subcategories: [
      { name: 'Almonds', image: 'https://images.unsplash.com/photo-1508061252220-db985fb4a496?auto=format&fit=crop&w=400&q=80' },
      { name: 'Cashews', image: 'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?auto=format&fit=crop&w=400&q=80' },
      { name: 'Pistachios', image: 'https://images.unsplash.com/photo-1525385133512-2f3bdd039054?auto=format&fit=crop&w=400&q=80' },
      { name: 'Raisins', image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=400&q=80' },
      { name: 'Walnuts', image: 'https://images.unsplash.com/photo-1568285816997-75e11df3c088?auto=format&fit=crop&w=400&q=80' },
      { name: 'Dates', image: 'https://images.unsplash.com/photo-1596162602758-c2901306b3e7?auto=format&fit=crop&w=400&q=80' },
      { name: 'Seeds', image: 'https://images.unsplash.com/photo-1515543237350-b3eea1ec8082?auto=format&fit=crop&w=400&q=80' },
      { name: 'Trail Mix', image: 'https://images.unsplash.com/photo-1508061252220-db985fb4a496?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Snacks & Namkeen',
    icon: '🍿',
    image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=600&q=80',
    order: 7,
    subcategories: [
      { name: 'Chips', image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=400&q=80' },
      { name: 'Namkeen', image: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?auto=format&fit=crop&w=400&q=80' },
      { name: 'Bhujia', image: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?auto=format&fit=crop&w=400&q=80' },
      { name: 'Popcorn', image: 'https://images.unsplash.com/photo-1578849278619-e73505e9610f?auto=format&fit=crop&w=400&q=80' },
      { name: 'Khakhra', image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=400&q=80' },
      { name: 'Nachos', image: 'https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?auto=format&fit=crop&w=400&q=80' },
      { name: 'Roasted Snacks', image: 'https://images.unsplash.com/photo-1508061252220-db985fb4a496?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Biscuits & Cookies',
    icon: '🍪',
    image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=600&q=80',
    order: 8,
    subcategories: [
      { name: 'Glucose Biscuits', image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=400&q=80' },
      { name: 'Cream Biscuits', image: 'https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?auto=format&fit=crop&w=400&q=80' },
      { name: 'Digestive Biscuits', image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=400&q=80' },
      { name: 'Cookies', image: 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=400&q=80' },
      { name: 'Rusks', image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Chocolates & Sweets',
    icon: '🍫',
    image: 'https://images.unsplash.com/photo-1511381939415-e44015466834?auto=format&fit=crop&w=600&q=80',
    order: 9,
    subcategories: [
      { name: 'Chocolates', image: 'https://images.unsplash.com/photo-1511381939415-e44015466834?auto=format&fit=crop&w=400&q=80' },
      { name: 'Candy', image: 'https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?auto=format&fit=crop&w=400&q=80' },
      { name: 'Gummies', image: 'https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?auto=format&fit=crop&w=400&q=80' },
      { name: 'Traditional Sweets', image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=400&q=80' },
      { name: 'Gift Boxes', image: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Beverages',
    icon: '🥤',
    image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=600&q=80',
    order: 10,
    subcategories: [
      { name: 'Soft Drinks', image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=400&q=80' },
      { name: 'Juices', image: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?auto=format&fit=crop&w=400&q=80' },
      { name: 'Energy Drinks', image: 'https://images.unsplash.com/photo-1622543925917-763c34d1a86e?auto=format&fit=crop&w=400&q=80' },
      { name: 'Coconut Water', image: 'https://images.unsplash.com/photo-1525385133512-2f3bdd039054?auto=format&fit=crop&w=400&q=80' },
      { name: 'Soda', image: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=400&q=80' },
      { name: 'Flavoured Water', image: 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Tea, Coffee & Health Drinks',
    icon: '☕',
    image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80',
    order: 11,
    subcategories: [
      { name: 'Tea', image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=400&q=80' },
      { name: 'Green Tea', image: 'https://images.unsplash.com/photo-1627435601361-ec25f5b1d0e5?auto=format&fit=crop&w=400&q=80' },
      { name: 'Coffee', image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=400&q=80' },
      { name: 'Instant Coffee', image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=400&q=80' },
      { name: 'Protein Drinks', image: 'https://images.unsplash.com/photo-1577401239170-897942555fb3?auto=format&fit=crop&w=400&q=80' },
      { name: 'Malt Drinks', image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=400&q=80' },
      { name: 'Health Supplements', image: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Instant Food',
    icon: '🍜',
    image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=600&q=80',
    order: 12,
    subcategories: [
      { name: 'Noodles', image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=400&q=80' },
      { name: 'Pasta', image: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=400&q=80' },
      { name: 'Soup', image: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=400&q=80' },
      { name: 'Ready-to-Eat Meals', image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80' },
      { name: 'Frozen Snacks', image: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=400&q=80' },
      { name: 'Frozen Vegetables', image: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Meat, Fish & Eggs',
    icon: '🍗',
    image: 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&w=600&q=80',
    order: 13,
    subcategories: [
      { name: 'Chicken', image: 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&w=400&q=80' },
      { name: 'Mutton', image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=400&q=80' },
      { name: 'Fish', image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=400&q=80' },
      { name: 'Seafood', image: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=400&q=80' },
      { name: 'Eggs', image: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=400&q=80' },
      { name: 'Frozen Meat', image: 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Baby Care',
    icon: '🍼',
    image: 'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?auto=format&fit=crop&w=600&q=80',
    order: 14,
    subcategories: [
      { name: 'Baby Food', image: 'https://images.unsplash.com/photo-1584824486509-112e4181ff6b?auto=format&fit=crop&w=400&q=80' },
      { name: 'Baby Diapers', image: 'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?auto=format&fit=crop&w=400&q=80' },
      { name: 'Baby Wipes', image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80' },
      { name: 'Baby Shampoo', image: 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?auto=format&fit=crop&w=400&q=80' },
      { name: 'Baby Lotion', image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=400&q=80' },
      { name: 'Baby Toys', image: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=400&q=80' },
      { name: 'Feeding Bottles', image: 'https://images.unsplash.com/photo-1584824486509-112e4181ff6b?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Personal Care',
    icon: '🧴',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80',
    order: 15,
    subcategories: [
      { name: 'Shampoo', image: 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?auto=format&fit=crop&w=400&q=80' },
      { name: 'Soap', image: 'https://images.unsplash.com/photo-1607006344380-b6775a0824a7?auto=format&fit=crop&w=400&q=80' },
      { name: 'Face Wash', image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=400&q=80' },
      { name: 'Toothpaste', image: 'https://images.unsplash.com/photo-1559598467-f8b76c8155d0?auto=format&fit=crop&w=400&q=80' },
      { name: 'Toothbrush', image: 'https://images.unsplash.com/photo-1559598467-f8b76c8155d0?auto=format&fit=crop&w=400&q=80' },
      { name: 'Hair Oil', image: 'https://images.unsplash.com/photo-1526947425960-945c6e72858f?auto=format&fit=crop&w=400&q=80' },
      { name: 'Deodorants', image: 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=400&q=80' },
      { name: 'Perfumes', image: 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=400&q=80' },
      { name: 'Sanitary Pads', image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80' },
      { name: 'Men’s Grooming', image: 'https://images.unsplash.com/photo-1621607512214-68297480165e?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Beauty & Cosmetics',
    icon: '💄',
    image: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=600&q=80',
    order: 16,
    subcategories: [
      { name: 'Makeup', image: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=400&q=80' },
      { name: 'Lipstick', image: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=400&q=80' },
      { name: 'Foundation', image: 'https://images.unsplash.com/photo-1590156206657-b08e2f01f016?auto=format&fit=crop&w=400&q=80' },
      { name: 'Face Cream', image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=400&q=80' },
      { name: 'Sunscreen', image: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&w=400&q=80' },
      { name: 'Skin Care', image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=400&q=80' },
      { name: 'Hair Colour', image: 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?auto=format&fit=crop&w=400&q=80' },
      { name: 'Beauty Tools', image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Health & Wellness',
    icon: '🩺',
    image: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&w=600&q=80',
    order: 17,
    subcategories: [
      { name: 'Vitamins', image: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&w=400&q=80' },
      { name: 'Protein Powder', image: 'https://images.unsplash.com/photo-1577401239170-897942555fb3?auto=format&fit=crop&w=400&q=80' },
      { name: 'Ayurvedic Products', image: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=400&q=80' },
      { name: 'Medical Devices', image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=400&q=80' },
      { name: 'BP Monitor', image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=400&q=80' },
      { name: 'Glucometer', image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=400&q=80' },
      { name: 'First Aid', image: 'https://images.unsplash.com/photo-1603398938378-e54eab446dde?auto=format&fit=crop&w=400&q=80' },
      { name: 'OTC Medicines', image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Household Cleaning',
    icon: '🧹',
    image: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=600&q=80',
    order: 18,
    subcategories: [
      { name: 'Detergents', image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?auto=format&fit=crop&w=400&q=80' },
      { name: 'Dishwash', image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?auto=format&fit=crop&w=400&q=80' },
      { name: 'Floor Cleaner', image: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=400&q=80' },
      { name: 'Toilet Cleaner', image: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=400&q=80' },
      { name: 'Glass Cleaner', image: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=400&q=80' },
      { name: 'Cleaning Tools', image: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=400&q=80' },
      { name: 'Garbage Bags', image: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Home & Kitchen',
    icon: '🏠',
    image: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=600&q=80',
    order: 19,
    subcategories: [
      { name: 'Kitchen Storage', image: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=400&q=80' },
      { name: 'Cookware', image: 'https://images.unsplash.com/photo-1584992236310-6edddc08acff?auto=format&fit=crop&w=400&q=80' },
      { name: 'Gas Stoves', image: 'https://images.unsplash.com/photo-1585659722983-3a675dabf23d?auto=format&fit=crop&w=400&q=80' },
      { name: 'Water Bottles', image: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=400&q=80' },
      { name: 'Lunch Boxes', image: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=400&q=80' },
      { name: 'Dinner Sets', image: 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=400&q=80' },
      { name: 'Home Decor', image: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=400&q=80' },
      { name: 'Curtains', image: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=400&q=80' },
      { name: 'Bedsheets', image: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Electronics',
    icon: '📱',
    image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80',
    order: 20,
    subcategories: [
      { name: 'Mobile Phones', image: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=400&q=80' },
      { name: 'Chargers', image: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=400&q=80' },
      { name: 'Earphones', image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=400&q=80' },
      { name: 'Smart Watches', image: 'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?auto=format&fit=crop&w=400&q=80' },
      { name: 'Power Banks', image: 'https://images.unsplash.com/photo-1609592424074-1262d08a5099?auto=format&fit=crop&w=400&q=80' },
      { name: 'Bluetooth Speakers', image: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=400&q=80' },
      { name: 'Cables', image: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=400&q=80' },
      { name: 'Laptop Accessories', image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=400&q=80' },
      { name: 'Computer Accessories', image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Fashion',
    icon: '👕',
    image: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=600&q=80',
    order: 21,
    subcategories: [
      { name: 'Men’s T-Shirts', image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=400&q=80' },
      { name: 'Men’s Shirts', image: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=400&q=80' },
      { name: 'Men’s Jeans', image: 'https://images.unsplash.com/photo-1542272604-780c96856592?auto=format&fit=crop&w=400&q=80' },
      { name: 'Men’s Trousers', image: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=400&q=80' },
      { name: 'Men’s Ethnic Wear', image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=400&q=80' },
      { name: 'Men’s Jackets', image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=400&q=80' },
      { name: 'Women’s Sarees', image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=400&q=80' },
      { name: 'Women’s Kurtis', image: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=400&q=80' },
      { name: 'Women’s Dresses', image: 'https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&w=400&q=80' },
      { name: 'Women’s Tops', image: 'https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?auto=format&fit=crop&w=400&q=80' },
      { name: 'Women’s Jeans', image: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=400&q=80' },
      { name: 'Women’s Leggings', image: 'https://images.unsplash.com/photo-1506629082925-23914a1403f9?auto=format&fit=crop&w=400&q=80' },
      { name: 'Boys Clothing', image: 'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?auto=format&fit=crop&w=400&q=80' },
      { name: 'Girls Clothing', image: 'https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?auto=format&fit=crop&w=400&q=80' },
      { name: 'Infant Wear', image: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Footwear',
    icon: '👟',
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80',
    order: 22,
    subcategories: [
      { name: 'Men’s Shoes', image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=80' },
      { name: 'Women’s Shoes', image: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=400&q=80' },
      { name: 'Kids Shoes', image: 'https://images.unsplash.com/photo-1514989940723-e8e51635b782?auto=format&fit=crop&w=400&q=80' },
      { name: 'Sports Shoes', image: 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?auto=format&fit=crop&w=400&q=80' },
      { name: 'Slippers', image: 'https://images.unsplash.com/photo-1603808033192-082d6919d3e1?auto=format&fit=crop&w=400&q=80' },
      { name: 'Sandals', image: 'https://images.unsplash.com/photo-1603808033192-082d6919d3e1?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Jewellery & Watches',
    icon: '💎',
    image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=600&q=80',
    order: 23,
    subcategories: [
      { name: 'Artificial Jewellery', image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=400&q=80' },
      { name: 'Silver Jewellery', image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=400&q=80' },
      { name: 'Gold Jewellery', image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=400&q=80' },
      { name: 'Watches', image: 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=400&q=80' },
      { name: 'Fashion Accessories', image: 'https://images.unsplash.com/photo-1509319117193-57bab727e09d?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Furniture',
    icon: '🛋️',
    image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=600&q=80',
    order: 24,
    subcategories: [
      { name: 'Sofa', image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=400&q=80' },
      { name: 'Chairs', image: 'https://images.unsplash.com/photo-1580481072645-022f9a6d8310?auto=format&fit=crop&w=400&q=80' },
      { name: 'Tables', image: 'https://images.unsplash.com/photo-1530018607912-eff2daa1bac4?auto=format&fit=crop&w=400&q=80' },
      { name: 'Beds', image: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=400&q=80' },
      { name: 'Wardrobes', image: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=400&q=80' },
      { name: 'Office Furniture', image: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Books & Stationery',
    icon: '📚',
    image: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=600&q=80',
    order: 25,
    subcategories: [
      { name: 'School Supplies', image: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=400&q=80' },
      { name: 'Office Supplies', image: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=400&q=80' },
      { name: 'Notebooks', image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80' },
      { name: 'Pens', image: 'https://images.unsplash.com/photo-1585336261026-6757c5bca69d?auto=format&fit=crop&w=400&q=80' },
      { name: 'Art Supplies', image: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=400&q=80' },
      { name: 'Competitive Exam Books', image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Toys & Baby Products',
    icon: '🧸',
    image: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=600&q=80',
    order: 26,
    subcategories: [
      { name: 'Educational Toys', image: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=400&q=80' },
      { name: 'Remote Control Toys', image: 'https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&w=400&q=80' },
      { name: 'Dolls', image: 'https://images.unsplash.com/photo-1558060370-d644479be6e7?auto=format&fit=crop&w=400&q=80' },
      { name: 'Board Games', image: 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&w=400&q=80' },
      { name: 'Outdoor Toys', image: 'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?auto=format&fit=crop&w=400&q=80' },
      { name: 'School Bags', image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Sports & Fitness',
    icon: '🏋️',
    image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=600&q=80',
    order: 27,
    subcategories: [
      { name: 'Gym Equipment', image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=400&q=80' },
      { name: 'Yoga Mats', image: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?auto=format&fit=crop&w=400&q=80' },
      { name: 'Cricket', image: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?auto=format&fit=crop&w=400&q=80' },
      { name: 'Football', image: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=400&q=80' },
      { name: 'Badminton', image: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=400&q=80' },
      { name: 'Cycling Accessories', image: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=400&q=80' },
      { name: 'Nutrition', image: 'https://images.unsplash.com/photo-1577401239170-897942555fb3?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Automotive',
    icon: '🚗',
    image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80',
    order: 28,
    subcategories: [
      { name: 'Engine Oil', image: 'https://images.unsplash.com/photo-1615906655593-ad0386982a0f?auto=format&fit=crop&w=400&q=80' },
      { name: 'Car Accessories', image: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=400&q=80' },
      { name: 'Bike Accessories', image: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=400&q=80' },
      { name: 'Cleaning Products', image: 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=400&q=80' },
      { name: 'Helmets', image: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Hardware & Electrical',
    icon: '🛠️',
    image: 'https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=600&q=80',
    order: 29,
    subcategories: [
      { name: 'Paints', image: 'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=400&q=80' },
      { name: 'Plumbing', image: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?auto=format&fit=crop&w=400&q=80' },
      { name: 'Tools', image: 'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=400&q=80' },
      { name: 'Electrical Fittings', image: 'https://images.unsplash.com/photo-1555680202-c86f0e12f086?auto=format&fit=crop&w=400&q=80' },
      { name: 'Switches', image: 'https://images.unsplash.com/photo-1555680202-c86f0e12f086?auto=format&fit=crop&w=400&q=80' },
      { name: 'Cables', image: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=400&q=80' },
      { name: 'Lighting', image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Pet Care',
    icon: '🐶',
    image: 'https://images.unsplash.com/photo-1450778869186-40d5d5f7768a?auto=format&fit=crop&w=600&q=80',
    order: 30,
    subcategories: [
      { name: 'Dog Food', image: 'https://images.unsplash.com/photo-1589924691995-400dc9ecc119?auto=format&fit=crop&w=400&q=80' },
      { name: 'Cat Food', image: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=400&q=80' },
      { name: 'Pet Medicines', image: 'https://images.unsplash.com/photo-1576201836106-db1758fd1c97?auto=format&fit=crop&w=400&q=80' },
      { name: 'Pet Toys', image: 'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?auto=format&fit=crop&w=400&q=80' },
      { name: 'Grooming Products', image: 'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Flowers & Gifts',
    icon: '💐',
    image: 'https://images.unsplash.com/photo-1563241527-3004b7be0ffd?auto=format&fit=crop&w=600&q=80',
    order: 31,
    subcategories: [
      { name: 'Fresh Flowers', image: 'https://images.unsplash.com/photo-1563241527-3004b7be0ffd?auto=format&fit=crop&w=400&q=80' },
      { name: 'Bouquets', image: 'https://images.unsplash.com/photo-1561181286-d3fee7d55364?auto=format&fit=crop&w=400&q=80' },
      { name: 'Cakes', image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=400&q=80' },
      { name: 'Greeting Cards', image: 'https://images.unsplash.com/photo-1513885535751-8b9238bd345a?auto=format&fit=crop&w=400&q=80' },
      { name: 'Gift Hampers', image: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Paan Corner',
    icon: '🍃',
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80',
    order: 32,
    subcategories: [
      { name: 'Paan', image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=400&q=80' },
      { name: 'Mouth Fresheners', image: 'https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?auto=format&fit=crop&w=400&q=80' },
      { name: 'Cigarettes', image: 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&w=400&q=80' },
      { name: 'Tobacco Products', image: 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&w=400&q=80' },
      { name: 'Lighters', image: 'https://images.unsplash.com/photo-1527061011665-3652c757a4d4?auto=format&fit=crop&w=400&q=80' },
    ],
  },
];

export const seedCategoriesInDb = async () => {
  let createdCount = 0;
  let updatedCount = 0;
  let deletedCount = 0;

  // Process main categories and subcategories
  const validCategoryIds = new Set();

  for (const catData of MARKETPLACE_CATEGORIES) {
    const parentSlug = slugify(catData.name);

    // Upsert Root Category
    let parentCat = await Category.findOne({
      $or: [
        { slug: parentSlug },
        { name: catData.name, parentId: null }
      ]
    });

    if (!parentCat) {
      parentCat = await Category.create({
        name: catData.name,
        slug: parentSlug,
        icon: catData.icon,
        image: catData.image || '',
        order: catData.order,
        parentId: null,
        isActive: true,
      });
      createdCount++;
    } else {
      parentCat.name = catData.name;
      parentCat.slug = parentSlug;
      parentCat.icon = catData.icon;
      if (catData.image) parentCat.image = catData.image;
      parentCat.order = catData.order;
      parentCat.parentId = null;
      parentCat.isActive = true;
      await parentCat.save();
      updatedCount++;
    }

    validCategoryIds.add(String(parentCat._id));

    // Upsert Subcategories
    let subOrder = 1;
    for (const subItem of catData.subcategories) {
      const subName = typeof subItem === 'object' ? subItem.name : subItem;
      const subImage = typeof subItem === 'object' ? subItem.image : '';
      const baseSubSlug = slugify(subName);

      let subCat = await Category.findOne({
        parentId: parentCat._id,
        name: subName
      });

      // Calculate unique slug
      let finalSlug = baseSubSlug;
      const existingSlugMatch = await Category.findOne({
        slug: finalSlug,
        _id: { $ne: subCat?._id },
      });
      if (existingSlugMatch) {
        finalSlug = `${parentSlug}-${baseSubSlug}`;
      }

      if (!subCat) {
        subCat = await Category.create({
          name: subName,
          slug: finalSlug,
          image: subImage,
          parentId: parentCat._id,
          order: subOrder++,
          isActive: true,
        });
        createdCount++;
      } else {
        subCat.name = subName;
        subCat.slug = finalSlug;
        if (subImage) subCat.image = subImage;
        subCat.parentId = parentCat._id;
        subCat.order = subOrder++;
        subCat.isActive = true;
        await subCat.save();
        updatedCount++;
      }

      validCategoryIds.add(String(subCat._id));
    }
  }

  // Remove any old category or subcategory that is NOT in validCategoryIds
  const allCategories = await Category.find().select('_id name parentId');
  const idsToDelete = allCategories
    .filter(c => !validCategoryIds.has(String(c._id)))
    .map(c => c._id);

  if (idsToDelete.length > 0) {
    // Find a fallback new category for any products referencing deleted categories
    const defaultFallbackCat = await Category.findOne({ parentId: { $ne: null } }) || await Category.findOne();
    if (defaultFallbackCat) {
      await Product.updateMany(
        { categoryId: { $in: idsToDelete } },
        { categoryId: defaultFallbackCat._id }
      );
    }

    const deleteResult = await Category.deleteMany({ _id: { $in: idsToDelete } });
    deletedCount = deleteResult.deletedCount || idsToDelete.length;
  }

  return { createdCount, updatedCount, deletedCount };
};

const runScript = async () => {
  try {
    console.log('🧹 Purging old categories & seeding ALL 32 DwellMart Marketplace Categories with subcategories & images...');
    await connectDB();
    const stats = await seedCategoriesInDb();
    console.log(`✅ Complete! Categories created: ${stats.createdCount}, updated: ${stats.updatedCount}, deleted old: ${stats.deletedCount}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error purging and seeding categories:', error);
    process.exit(1);
  }
};

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('seedCategories.js')) {
  runScript();
}
