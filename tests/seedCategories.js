import dotenv from 'dotenv';
dotenv.config();

import connectDB from '../src/config/db.js';
import Category from '../src/models/Category.model.js';
import Product from '../src/models/Product.model.js';
import { slugify } from '../src/utils/slugify.js';

export const MARKETPLACE_CATEGORIES = [
  {
    name: 'Daily Essentials',
    icon: '🛒',
    order: 1,
    subcategories: [
      'Grocery',
      'Fruits & Vegetables',
      'Dairy & Bakery',
      'Snacks & Beverages',
      'Organic Foods',
      'Frozen Foods',
    ],
  },
  {
    name: 'Fashion & Lifestyle',
    icon: '👕',
    order: 2,
    subcategories: [
      'Men’s Fashion',
      'Women’s Fashion',
      'Kids Wear',
      'Footwear',
      'Bags & Luggage',
      'Watches',
      'Fashion Accessories',
    ],
  },
  {
    name: 'Beauty & Personal Care',
    icon: '💄',
    order: 3,
    subcategories: [
      'Skincare',
      'Haircare',
      'Cosmetics',
      'Perfumes',
      'Personal Hygiene',
      'Ayurvedic Products',
    ],
  },
  {
    name: 'Electronics & Mobiles',
    icon: '📱',
    order: 4,
    subcategories: [
      'Smartphones',
      'Laptops',
      'Tablets',
      'Smart Watches',
      'Mobile Accessories',
      'Computer Accessories',
    ],
  },
  {
    name: 'Home & Kitchen',
    icon: '🏠',
    order: 5,
    subcategories: [
      'Kitchen Appliances',
      'Cookware',
      'Furniture',
      'Home Decor',
      'Lighting',
      'Storage Solutions',
    ],
  },
  {
    name: 'Electrical & Appliances',
    icon: '⚡',
    order: 6,
    subcategories: [
      'Fans',
      'Air Conditioners',
      'Refrigerators',
      'Washing Machines',
      'Small Home Appliances',
    ],
  },
  {
    name: 'Baby & Kids',
    icon: '🧒',
    order: 7,
    subcategories: [
      'Baby Care',
      'Toys & Games',
      'School Supplies',
      'Baby Clothing',
      'Feeding Products',
    ],
  },
  {
    name: 'Health & Wellness',
    icon: '💊',
    order: 8,
    subcategories: [
      'Health Supplements',
      'Medical Devices',
      'Fitness Equipment',
      'Personal Care',
    ],
  },
  {
    name: 'Automotive',
    icon: '🚗',
    order: 9,
    subcategories: [
      'Car Accessories',
      'Bike Accessories',
      'Tyres',
      'Lubricants',
      'Car Care Products',
    ],
  },
  {
    name: 'Office & Stationery',
    icon: '🏢',
    order: 10,
    subcategories: [
      'Office Furniture',
      'Stationery',
      'Printers',
      'Office Electronics',
    ],
  },
  {
    name: 'Pet Supplies',
    icon: '🐶',
    order: 11,
    subcategories: [
      'Pet Food',
      'Pet Accessories',
      'Pet Healthcare',
    ],
  },
  {
    name: 'Garden & Outdoor',
    icon: '🌱',
    order: 12,
    subcategories: [
      'Plants',
      'Gardening Tools',
      'Outdoor Furniture',
    ],
  },
  {
    name: 'Gifts & Handmade',
    icon: '🎁',
    order: 13,
    subcategories: [
      'Gift Items',
      'Handicrafts',
      'Customized Products',
      'Festival Gifts',
    ],
  },
  {
    name: 'Industrial & B2B',
    icon: '🏗️',
    order: 14,
    subcategories: [
      'Machinery',
      'Industrial Tools',
      'Safety Equipment',
      'Packaging Materials',
      'Raw Materials',
      'Electrical Components',
    ],
  },
  {
    name: 'Manufacturers Hub',
    icon: '🏭',
    order: 15,
    subcategories: [
      'Factory Direct Products',
      'OEM Manufacturers',
      'Bulk Orders',
      'Export Products',
    ],
  },
  {
    name: 'Wholesale Market',
    icon: '📦',
    order: 16,
    subcategories: [
      'FMCG Wholesale',
      'Textile Wholesale',
      'Electronics Wholesale',
      'Packaging Wholesale',
      'Building Materials',
    ],
  },
  {
    name: 'Books & Education',
    icon: '📚',
    order: 17,
    subcategories: [
      'Books',
      'Educational Toys',
      'Art & Craft',
      'Learning Materials',
    ],
  },
  {
    name: 'Jewellery',
    icon: '💎',
    order: 18,
    subcategories: [
      'Gold Jewellery',
      'Silver Jewellery',
      'Artificial Jewellery',
      'Gemstones',
    ],
  },
  {
    name: 'Festival Store',
    icon: '🎉',
    order: 19,
    subcategories: [
      'Diwali',
      'Holi',
      'Rakhi',
      'Christmas',
      'Wedding Collection',
    ],
  },
  {
    name: 'Dwell Mart Express',
    icon: '🚚',
    order: 20,
    subcategories: [
      '10–30 Minute Grocery Delivery',
      'Medicines',
      'Bakery',
      'Dairy',
      'Flowers',
      'Daily Essentials',
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
        order: catData.order,
        parentId: null,
        isActive: true,
      });
      createdCount++;
    } else {
      parentCat.name = catData.name;
      parentCat.slug = parentSlug;
      parentCat.icon = catData.icon;
      parentCat.order = catData.order;
      parentCat.parentId = null;
      parentCat.isActive = true;
      await parentCat.save();
      updatedCount++;
    }

    validCategoryIds.add(String(parentCat._id));

    // Upsert Subcategories
    let subOrder = 1;
    for (const subName of catData.subcategories) {
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
          parentId: parentCat._id,
          order: subOrder++,
          isActive: true,
        });
        createdCount++;
      } else {
        subCat.name = subName;
        subCat.slug = finalSlug;
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
    console.log('🧹 Purging old categories & seeding ONLY new DwellMart Marketplace Categories...');
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
