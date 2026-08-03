import dotenv from 'dotenv';
dotenv.config();

import connectDB from '../src/config/db.js';
import Category from '../src/models/Category.model.js';
import Product from '../src/models/Product.model.js';
import { slugify } from '../src/utils/slugify.js';
import { EXPERIENCES } from '../src/constants/experiences.js';

const MARKETPLACE_EXPERIENCE = EXPERIENCES.MARKETPLACE;
const WHOLESALE_EXPERIENCE = EXPERIENCES.WHOLESALE;
const SUPPORTED_EXPERIENCES = [MARKETPLACE_EXPERIENCE, WHOLESALE_EXPERIENCE];

export const MARKETPLACE_CATEGORIES = [
  {
    name: 'Fashion & Lifestyle',
    icon: '🛍️',
    image: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=600&q=80',
    order: 1,
    subcategories: [
      { name: 'Men’s T-Shirts', image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=400&q=80' },
      { name: 'Men’s Shirts', image: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=400&q=80' },
      { name: 'Men’s Jeans', image: 'https://images.unsplash.com/photo-1542272604-780c96856592?auto=format&fit=crop&w=400&q=80' },
      { name: 'Men’s Trousers', image: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=400&q=80' },
      { name: 'Men’s Ethnic Wear', image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=400&q=80' },
      { name: 'Men’s Jackets', image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=400&q=80' },
      { name: 'Men’s Sports Wear', image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=400&q=80' },
      { name: 'Women’s Sarees', image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=400&q=80' },
      { name: 'Women’s Kurtis', image: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=400&q=80' },
      { name: 'Women’s Dresses', image: 'https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&w=400&q=80' },
      { name: 'Women’s Tops', image: 'https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?auto=format&fit=crop&w=400&q=80' },
      { name: 'Women’s Jeans', image: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=400&q=80' },
      { name: 'Women’s Shorts', image: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?auto=format&fit=crop&w=400&q=80' },
      { name: 'Women’s Leggings', image: 'https://images.unsplash.com/photo-1506629082925-23914a1403f9?auto=format&fit=crop&w=400&q=80' },
      { name: 'Women’s Sports Wear', image: 'https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=400&q=80' },
      { name: 'Boys Clothing', image: 'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?auto=format&fit=crop&w=400&q=80' },
      { name: 'Girls Clothing', image: 'https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?auto=format&fit=crop&w=400&q=80' },
      { name: 'Kids Sports Wear', image: 'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?auto=format&fit=crop&w=400&q=80' },
      { name: 'Infant Wear', image: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=400&q=80' },
      { name: 'Baby Care', image: 'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?auto=format&fit=crop&w=400&q=80' },
      { name: 'Toys & Games', image: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=400&q=80' },
      { name: 'Feeding Products', image: 'https://images.unsplash.com/photo-1584824486509-112e4181ff6b?auto=format&fit=crop&w=400&q=80' },
      { name: 'Footwears Boys', image: 'https://images.unsplash.com/photo-1514989940723-e8e51635b782?auto=format&fit=crop&w=400&q=80' },
      { name: 'Footwears Girls', image: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=400&q=80' },
      { name: 'Accessories', image: 'https://images.unsplash.com/photo-1509319117193-57bab727e09d?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Beauty & Personal Care',
    icon: '💄',
    image: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=600&q=80',
    order: 2,
    subcategories: [
      { name: 'Skincare', image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=400&q=80' },
      { name: 'Haircare', image: 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?auto=format&fit=crop&w=400&q=80' },
      { name: 'Cosmetics', image: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=400&q=80' },
      { name: 'Perfumes', image: 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=400&q=80' },
      { name: 'Personal Hygiene', image: 'https://images.unsplash.com/photo-1607006344380-b6775a0824a7?auto=format&fit=crop&w=400&q=80' },
      { name: 'Ayurvedic Products', image: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Electronics & Mobiles',
    icon: '📱',
    image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80',
    order: 3,
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
      { name: 'Printers', image: 'https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Home & Kitchen',
    icon: '🏠',
    image: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=600&q=80',
    order: 4,
    subcategories: [
      { name: 'Kitchen Appliances', image: 'https://images.unsplash.com/photo-1585659722983-3a675dabf23d?auto=format&fit=crop&w=400&q=80' },
      { name: 'Cookware', image: 'https://images.unsplash.com/photo-1584992236310-6edddc08acff?auto=format&fit=crop&w=400&q=80' },
      { name: 'Furniture', image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=400&q=80' },
      { name: 'Home Decor', image: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=400&q=80' },
      { name: 'Lighting', image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=400&q=80' },
      { name: 'Storage Solutions', image: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Electrical & Appliances',
    icon: '⚡',
    image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80',
    order: 5,
    subcategories: [
      { name: 'Fans', image: 'https://images.unsplash.com/photo-1565151443833-29bf2ba5dd8d?auto=format&fit=crop&w=400&q=80' },
      { name: 'Air Conditioners', image: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=400&q=80' },
      { name: 'Refrigerators', image: 'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?auto=format&fit=crop&w=400&q=80' },
      { name: 'Washing Machines', image: 'https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?auto=format&fit=crop&w=400&q=80' },
      { name: 'Small Home Appliances', image: 'https://images.unsplash.com/photo-1585659722983-3a675dabf23d?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Health & Wellness',
    icon: '💊',
    image: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&w=600&q=80',
    order: 6,
    subcategories: [
      { name: 'Health Supplements', image: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&w=400&q=80' },
      { name: 'Medical Devices', image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=400&q=80' },
      { name: 'Fitness Equipment', image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=400&q=80' },
      { name: 'Personal Care', image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Automotive',
    icon: '🚗',
    image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80',
    order: 7,
    subcategories: [
      { name: 'Car Accessories', image: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=400&q=80' },
      { name: 'Bike Accessories', image: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=400&q=80' },
      { name: 'Tyres', image: 'https://images.unsplash.com/photo-1578844251758-2f71da64c96f?auto=format&fit=crop&w=400&q=80' },
      { name: 'Lubricants', image: 'https://images.unsplash.com/photo-1615906655593-ad0386982a0f?auto=format&fit=crop&w=400&q=80' },
      { name: 'Car Care Products', image: 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Books & Stationery',
    icon: '🏢',
    image: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=600&q=80',
    order: 8,
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
    name: 'Pet Supplies',
    icon: '🐶',
    image: 'https://images.unsplash.com/photo-1450778869186-40d5d5f7768a?auto=format&fit=crop&w=600&q=80',
    order: 9,
    subcategories: [
      { name: 'Pet Food', image: 'https://images.unsplash.com/photo-1589924691995-400dc9ecc119?auto=format&fit=crop&w=400&q=80' },
      { name: 'Pet Accessories', image: 'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?auto=format&fit=crop&w=400&q=80' },
      { name: 'Pet Healthcare', image: 'https://images.unsplash.com/photo-1576201836106-db1758fd1c97?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Garden & Outdoor',
    icon: '🌱',
    image: 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&w=600&q=80',
    order: 10,
    subcategories: [
      { name: 'Plants', image: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=400&q=80' },
      { name: 'Gardening Tools', image: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=400&q=80' },
      { name: 'Outdoor Furniture', image: 'https://images.unsplash.com/photo-1533779283484-8ad4940aa3a8?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Gifts & Handmade',
    icon: '🎁',
    image: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=600&q=80',
    order: 11,
    subcategories: [
      { name: 'Gift Items', image: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=400&q=80' },
      { name: 'Handicrafts', image: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=400&q=80' },
      { name: 'Customized Products', image: 'https://images.unsplash.com/photo-1513885535751-8b9238bd345a?auto=format&fit=crop&w=400&q=80' },
      { name: 'Festival Gifts', image: 'https://images.unsplash.com/photo-1563241527-3004b7be0ffd?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Industrial & B2B',
    icon: '🏗️',
    image: 'https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=600&q=80',
    order: 12,
    subcategories: [
      { name: 'Machinery', image: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80' },
      { name: 'Industrial Tools', image: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=400&q=80' },
      { name: 'Safety Equipment', image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80' },
      { name: 'Packaging Materials', image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=400&q=80' },
      { name: 'Raw Materials', image: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=400&q=80' },
      { name: 'Electrical Components', image: 'https://images.unsplash.com/photo-1555680202-c86f0e12f086?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Manufacturers Hub',
    icon: '🏭',
    image: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80',
    order: 13,
    subcategories: [
      { name: 'Factory Direct Products', image: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80' },
      { name: 'OEM Manufacturers', image: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=400&q=80' },
      { name: 'Bulk Orders', image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=400&q=80' },
      { name: 'Export Products', image: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Wholesale Market',
    icon: '📦',
    image: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=600&q=80',
    order: 14,
    subcategories: [
      { name: 'FMCG Wholesale', image: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=400&q=80' },
      { name: 'Textile Wholesale', image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=400&q=80' },
      { name: 'Electronics Wholesale', image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=400&q=80' },
      { name: 'Packaging Wholesale', image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=400&q=80' },
      { name: 'Building Materials', image: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Books & Education',
    icon: '📚',
    image: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=600&q=80',
    order: 15,
    subcategories: [
      { name: 'Books', image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=400&q=80' },
      { name: 'Educational Toys', image: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=400&q=80' },
      { name: 'Art & Craft', image: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=400&q=80' },
      { name: 'Learning Materials', image: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=400&q=80' },
    ],
  },
  {
    name: 'Jewellery',
    icon: '💎',
    image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=600&q=80',
    order: 16,
    subcategories: [
      { name: 'Gold Jewellery', image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=400&q=80' },
      { name: 'Silver Jewellery', image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=400&q=80' },
      { name: 'Artificial & Fashion Jewellery', image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=400&q=80' },
      { name: 'Precious Gemstones', image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=400&q=80' },
    ],
  },
];

export const seedCategoriesInDb = async () => {
  let createdCount = 0;
  let updatedCount = 0;
  let deletedCount = 0;

  const validCategoryIds = new Set();

  for (const catData of MARKETPLACE_CATEGORIES) {
    const parentSlug = slugify(catData.name);

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
        displayOrder: catData.order,
        parentId: null,
        isActive: true,
        experience: MARKETPLACE_EXPERIENCE,
        supportedExperiences: SUPPORTED_EXPERIENCES,
      });
      createdCount++;
    } else {
      parentCat.name = catData.name;
      parentCat.slug = parentSlug;
      parentCat.icon = catData.icon;
      if (catData.image) parentCat.image = catData.image;
      parentCat.order = catData.order;
      parentCat.displayOrder = catData.order;
      parentCat.parentId = null;
      parentCat.isActive = true;
      parentCat.supportedExperiences = SUPPORTED_EXPERIENCES;
      await parentCat.save();
      updatedCount++;
    }

    validCategoryIds.add(String(parentCat._id));

    let subOrder = 1;
    for (const subItem of catData.subcategories) {
      const subName = typeof subItem === 'object' ? subItem.name : subItem;
      const subImage = typeof subItem === 'object' ? subItem.image : '';
      const baseSubSlug = slugify(subName);

      let subCat = await Category.findOne({
        parentId: parentCat._id,
        name: subName
      });

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
          order: subOrder,
          displayOrder: subOrder,
          isActive: true,
          experience: MARKETPLACE_EXPERIENCE,
          supportedExperiences: SUPPORTED_EXPERIENCES,
        });
        createdCount++;
      } else {
        subCat.name = subName;
        subCat.slug = finalSlug;
        if (subImage) subCat.image = subImage;
        subCat.parentId = parentCat._id;
        subCat.order = subOrder;
        subCat.displayOrder = subOrder;
        subCat.isActive = true;
        subCat.supportedExperiences = SUPPORTED_EXPERIENCES;
        await subCat.save();
        updatedCount++;
      }
      subOrder++;

      validCategoryIds.add(String(subCat._id));
    }
  }

  const allCategories = await Category.find({
    supportedExperiences: { $in: SUPPORTED_EXPERIENCES }
  }).select('_id name parentId');

  const idsToDelete = allCategories
    .filter(c => !validCategoryIds.has(String(c._id)))
    .map(c => c._id);

  if (idsToDelete.length > 0) {
    const defaultFallbackCat =
      await Category.findOne({ supportedExperiences: MARKETPLACE_EXPERIENCE, parentId: { $ne: null } })
      || await Category.findOne({ supportedExperiences: MARKETPLACE_EXPERIENCE });
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
    console.log('🧹 Purging old categories & seeding ALL DwellMart B2B & B2C Marketplace Categories with subcategories & images...');
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
