import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Category from '../models/Category.model.js';
import Product from '../models/Product.model.js';
import Vendor from '../models/Vendor.model.js';
import Brand from '../models/Brand.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const EXPRESS_PRODUCTS_SEED_DATA = {
  "dry-fruits-nuts": [
    {
      name: "California Almonds / Badam (Premium)",
      price: 349,
      originalPrice: 499,
      unit: "500 g",
      image: "https://images.unsplash.com/photo-1508061252966-177bfd07e60b?w=500&auto=format&fit=crop&q=60",
    },
    {
      name: "Whole Cashew Nuts / Kaju (W240 Grade)",
      price: 429,
      originalPrice: 599,
      unit: "500 g",
      image: "https://images.unsplash.com/photo-1543208541-0961a29a8c3d?w=500&auto=format&fit=crop&q=60",
    },
    {
      name: "Organic Afghan Anjeer / Figs",
      price: 299,
      originalPrice: 399,
      unit: "250 g",
      image: "https://images.unsplash.com/photo-1606923829579-0cb981a82434?w=500&auto=format&fit=crop&q=60",
    },
    {
      name: "Salted Pistachios / Pista",
      price: 389,
      originalPrice: 499,
      unit: "250 g",
      image: "https://images.unsplash.com/photo-1590005354167-6da97870c757?w=500&auto=format&fit=crop&q=60",
    },
  ],
  "fresh-fruits-vegetables": [
    {
      name: "Fresh Farm Bananas (Robusta)",
      price: 45,
      originalPrice: 60,
      unit: "1 kg (approx. 6 pcs)",
      image: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=500&auto=format&fit=crop&q=60",
    },
    {
      name: "Fresh Shimla Red Apples",
      price: 139,
      originalPrice: 180,
      unit: "1 kg (approx. 4-5 pcs)",
      image: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=500&auto=format&fit=crop&q=60",
    },
    {
      name: "Farm Fresh Hybrid Tomatoes",
      price: 32,
      originalPrice: 45,
      unit: "1 kg",
      image: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=500&auto=format&fit=crop&q=60",
    },
    {
      name: "Fresh Hydroponic Spinach (Palak)",
      price: 24,
      originalPrice: 35,
      unit: "250 g bunch",
      image: "https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=500&auto=format&fit=crop&q=60",
    },
  ],
  "dairy-bread-eggs": [
    {
      name: "Amul Taaza Toned Fresh Milk",
      price: 27,
      originalPrice: 28,
      unit: "500 ml pouch",
      image: "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500&auto=format&fit=crop&q=60",
    },
    {
      name: "Amul Fresh Malai Paneer",
      price: 92,
      originalPrice: 105,
      unit: "200 g pack",
      image: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=500&auto=format&fit=crop&q=60",
    },
    {
      name: "Brown Multigrain Bread (100% Whole Wheat)",
      price: 45,
      originalPrice: 50,
      unit: "400 g pack",
      image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&auto=format&fit=crop&q=60",
    },
    {
      name: "Farm Fresh White Eggs (Table Grade A)",
      price: 52,
      originalPrice: 65,
      unit: "Pack of 6 pcs",
      image: "https://images.unsplash.com/photo-1516448620398-c5f44bf9f441?w=500&auto=format&fit=crop&q=60",
    },
  ],
  "atta-rice-staples": [
    {
      name: "Aashirvaad Shuddh Chakki Atta",
      price: 235,
      originalPrice: 275,
      unit: "5 kg bag",
      image: "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=500&auto=format&fit=crop&q=60",
    },
    {
      name: "Fortune Everyday Basmati Rice",
      price: 189,
      originalPrice: 220,
      unit: "1 kg pack",
      image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&auto=format&fit=crop&q=60",
    },
  ],
  "chocolates-sweets": [
    {
      name: "Cadbury Dairy Milk Silk Chocolate Bar",
      price: 165,
      originalPrice: 175,
      unit: "150 g bar",
      image: "https://images.unsplash.com/photo-1549007994-cb92caebd54b?w=500&auto=format&fit=crop&q=60",
    },
    {
      name: "Ferrero Rocher Premium Hazelnut Chocolates",
      price: 449,
      originalPrice: 525,
      unit: "Pack of 16 pcs",
      image: "https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=500&auto=format&fit=crop&q=60",
    },
  ],
  "biscuits-cookies": [
    {
      name: "Oreo Original Chocolate Cream Biscuits",
      price: 35,
      originalPrice: 40,
      unit: "120 g pack",
      image: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500&auto=format&fit=crop&q=60",
    },
  ],
  "drinks-beverages": [
    {
      name: "Coca-Cola Original Taste Chilled Can",
      price: 40,
      originalPrice: 45,
      unit: "300 ml can",
      image: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=500&auto=format&fit=crop&q=60",
    },
    {
      name: "Real Fruit Power 100% Orange Juice",
      price: 110,
      originalPrice: 130,
      unit: "1 L tetrapack",
      image: "https://images.unsplash.com/photo-1613478223719-2ab802602423?w=500&auto=format&fit=crop&q=60",
    },
  ],
  "frozen-food": [
    {
      name: "McCain Crispy French Fries",
      price: 115,
      originalPrice: 135,
      unit: "420 g pack",
      image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=500&auto=format&fit=crop&q=60",
    },
  ],
  "instant-food": [
    {
      name: "Maggi 2-Minute Masala Instant Noodles",
      price: 56,
      originalPrice: 60,
      unit: "Pack of 4 (280 g)",
      image: "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?w=500&auto=format&fit=crop&q=60",
    },
  ],
  "baby-care": [
    {
      name: "Pampers All-in-one Baby Diaper Pants (M)",
      price: 649,
      originalPrice: 799,
      unit: "Pack of 34 pcs",
      image: "https://images.unsplash.com/photo-1519689680058-324335c77eba?w=500&auto=format&fit=crop&q=60",
    },
  ],
  "pharmacy": [
    {
      name: "Dettol Antiseptic Liquid Disinfectant",
      price: 195,
      originalPrice: 215,
      unit: "500 ml bottle",
      image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500&auto=format&fit=crop&q=60",
    },
  ],
  "pet-care": [
    {
      name: "Pedigree Adult Chicken & Vegetables Dry Dog Food",
      price: 380,
      originalPrice: 420,
      unit: "1.2 kg bag",
      image: "https://images.unsplash.com/photo-1589924691995-400dc9ecc119?w=500&auto=format&fit=crop&q=60",
    },
  ],
};

export async function seedQuickCommerceProducts() {
  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGO_URI);
    }

    console.log("🌱 Seeding Quick Commerce Products...");

    // Find or create default Express Vendor
    let vendor = await Vendor.findOne({ isVerified: true });
    if (!vendor) {
      vendor = await Vendor.create({
        storeName: "DwellMart Express Central Hub",
        email: "express.store@dwellmart.com",
        phone: "9876543210",
        address: "Central Dark Store, Sector 14",
        city: "Indore",
        pincode: "452015",
        isVerified: true,
        status: "approved",
      });
    }

    // Find or create default Express Brand
    let brand = await Brand.findOne({ name: "DwellMart Fresh" });
    if (!brand) {
      brand = await Brand.create({
        name: "DwellMart Fresh",
        slug: "dwellmart-fresh",
        description: "Official DwellMart Express Brand",
      });
    }

    // Get all Quick Commerce categories
    const qcCats = await Category.find({ supportedExperiences: "quick_commerce" });
    console.log(`Found ${qcCats.length} Quick Commerce categories.`);

    let insertedCount = 0;
    let updatedCount = 0;

    for (const cat of qcCats) {
      const slug = cat.slug;
      const seedItems = EXPRESS_PRODUCTS_SEED_DATA[slug] || [
        {
          name: `${cat.name} Premium Item 1`,
          price: 199,
          originalPrice: 249,
          unit: "500 g pack",
          image: cat.image || "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop&q=60",
        },
        {
          name: `${cat.name} Express Special 2`,
          price: 299,
          originalPrice: 399,
          unit: "1 kg pack",
          image: cat.image || "https://images.unsplash.com/photo-1506617420156-8e4536971650?w=500&auto=format&fit=crop&q=60",
        },
      ];

      for (const item of seedItems) {
        const itemSlug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

        const existing = await Product.findOne({ slug: itemSlug });
        if (!existing) {
          await Product.create({
            name: item.name,
            slug: itemSlug,
            description: `${item.name} delivered in 10-15 minutes via DwellMart Express.`,
            price: item.price,
            originalPrice: item.originalPrice,
            unit: item.unit,
            image: item.image,
            images: [item.image],
            categoryId: cat._id,
            quickCommerceCategoryId: cat._id,
            brandId: brand._id,
            vendorId: vendor._id,
            stock: "in_stock",
            stockQuantity: 150,
            retailEnabled: true,
            quickCommerceEnabled: true,
            quickCommerce: {
              packSize: item.unit,
              isPerishable: false,
              maxOrderQty: 10,
            },
            isActive: true,
            isVisible: true,
          });
          insertedCount++;
        } else {
          existing.quickCommerceEnabled = true;
          existing.quickCommerceCategoryId = cat._id;
          existing.categoryId = cat._id;
          existing.image = item.image;
          existing.unit = item.unit;
          await existing.save();
          updatedCount++;
        }
      }
    }

    console.log(`✅ Quick Commerce Products Seed Complete! Created: ${insertedCount}, Updated: ${updatedCount}`);
    return { insertedCount, updatedCount };
  } catch (error) {
    console.error("❌ Error seeding Quick Commerce products:", error);
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  seedQuickCommerceProducts().then(() => mongoose.disconnect());
}
