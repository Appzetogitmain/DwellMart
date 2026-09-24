import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import Category from '../src/models/Category.model.js';
import Product from '../src/models/Product.model.js';
import { slugify } from '../src/utils/slugify.js';
import { SUBCATEGORY_IMAGES, resolveChildImage } from './catalog_dedicated_images.js';

const baseDir = 'c:/Users/RCom/Desktop/AppZeto/DWELL/DwellMart';
const backupDir = path.join(process.cwd(), 'backups');

const qcFiles = [
    'Pet_Care_Quick_Commerce_Category_Import.xlsx',
    'Snacks_and_Namkeen_Quick_Commerce_Category_Import.xlsx',
    'Biscuits_and_Cookies_Quick_Commerce_Category_Import.xlsx',
    'Beverages_Quick_Commerce_Category_Import.xlsx',
    'Chocolates_and_Sweets_Quick_Commerce_Category_Import.xlsx',
    'Tea_Coffee_Health_Drinks_Quick_Commerce_Category_Import.xlsx',
    'Instant_Food_Quick_Commerce_Category_Import_CORRECT_IMAGES.xlsx',
    'Meat_Fish_Eggs_Quick_Commerce_Category_Import.xlsx',
    'Baby_Care_Quick_Commerce_Category_Import.xlsx',
    'Beauty_and_Cosmetics_Quick_Commerce_Category_Import.xlsx',
    'Household_Cleaning_Quick_Commerce_Category_Import.xlsx',
    'Personal_Care_Quick_Commerce_Category_Import.xlsx'
];

const mpFiles = [
    'All_Marketplace_Categories_Import (1).xlsx',
    'Health_Wellness_IMPORT_FIXED.xlsx',
    'Pet_Care_Category_Import.xlsx',
    'Dwell_Mart_Toys_Games_Categories.xlsx',
    'grocery_categories_staples_to_breakfast.xlsx',
    'Dwell_Mart_Baby_Care_Category_Import.xlsx',
    'Dwell_Mart_Arts_Crafts_Sewing_Keychain_Categories.xlsx'
];

console.log('🚀 CONNECTING TO MONGODB...');
await mongoose.connect(process.env.MONGO_URI);
console.log('✅ Connected to MongoDB.\n');

// ── STEP 1: PARSE ALL 19 FILES INTO MEMORY ──────────────────────────────────
console.log('📂 Parsing 19 Excel files...');
const parsedMap = new Map();

function getOrAdd(key, data) {
    if (parsedMap.has(key)) {
        const existing = parsedMap.get(key);
        for (const exp of data.supportedExperiences) {
            if (!existing.supportedExperiences.includes(exp)) {
                existing.supportedExperiences.push(exp);
            }
        }
        if (!existing.image && data.image) existing.image = data.image;
        if (!existing.description && data.description) existing.description = data.description;
        return existing;
    }
    parsedMap.set(key, data);
    return data;
}

// 1. Quick Commerce files
for (const file of qcFiles) {
    const filePath = path.join(baseDir, file);
    const wb = xlsx.readFile(filePath);
    const sheet = wb.Sheets['Categories'] || wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    for (const r of rows) {
        const rootName = String(r['Main Category'] || '').trim();
        const subName = String(r['Subcategory (Level 2)'] || '').trim();
        const childName = String(r['Child Category (Level 3)'] || '').trim();
        const desc = String(r['Description'] || '').trim();
        const order = parseInt(r['Display Order'], 10) || 1;
        const status = String(r['Status'] || 'active').trim().toLowerCase();
        const isActive = status !== 'inactive' && status !== 'false';
        const imgUrl = String(r['Image URL'] || r['Image'] || '').trim();

        if (!rootName) continue;

        // Root
        const rootKey = `qc:root:${rootName.toLowerCase()}`;
        getOrAdd(rootKey, {
            name: rootName,
            slug: `qc-${slugify(rootName)}`,
            parentKey: null,
            description: desc || `${rootName} Quick Commerce`,
            image: imgUrl || SUBCATEGORY_IMAGES[rootName.toLowerCase()] || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80',
            displayOrder: order,
            isActive: true,
            supportedExperiences: ['quick_commerce'],
            level: 1
        });

        // Sub
        if (subName) {
            const subKey = `qc:sub:${rootName.toLowerCase()} > ${subName.toLowerCase()}`;
            getOrAdd(subKey, {
                name: subName,
                slug: `qc-${slugify(rootName)}-${slugify(subName)}`,
                parentKey: rootKey,
                description: desc || `${subName} under ${rootName}`,
                image: imgUrl || SUBCATEGORY_IMAGES[subName.toLowerCase()] || resolveChildImage(subName, subName, rootName, ''),
                displayOrder: order,
                isActive: true,
                supportedExperiences: ['quick_commerce'],
                level: 2
            });

            // Child
            if (childName) {
                const childKey = `qc:child:${rootName.toLowerCase()} > ${subName.toLowerCase()} > ${childName.toLowerCase()}`;
                getOrAdd(childKey, {
                    name: childName,
                    slug: `qc-${slugify(rootName)}-${slugify(subName)}-${slugify(childName)}`,
                    parentKey: subKey,
                    description: desc,
                    image: imgUrl || resolveChildImage(childName, subName, rootName, ''),
                    displayOrder: order,
                    isActive,
                    supportedExperiences: ['quick_commerce'],
                    level: 3
                });
            }
        }
    }
}

// 2. Marketplace files
for (const file of mpFiles) {
    const filePath = path.join(baseDir, file);
    const wb = xlsx.readFile(filePath);
    const sheet = wb.Sheets['Categories'] || wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    if (file === 'Health_Wellness_IMPORT_FIXED.xlsx') {
        const rootName = 'Health & Wellness';
        const rootKey = `mp:root:${rootName.toLowerCase()}`;
        getOrAdd(rootKey, {
            name: rootName,
            slug: slugify(rootName),
            parentKey: null,
            description: 'Health & Wellness products and supplements',
            image: SUBCATEGORY_IMAGES['health & wellness'] || 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=600&q=80',
            displayOrder: 4,
            isActive: false, // Per business rule: Health & Wellness remains inactive
            supportedExperiences: ['marketplace', 'wholesale'],
            level: 1
        });

        for (const r of rows) {
            const subName = String(r['Main Category Name'] || '').trim();
            const childName = String(r['Sub Category Name'] || '').trim();
            const grandChildName = String(r['Child Category Name'] || '').trim();

            if (!subName) continue;

            const subKey = `mp:sub:${rootName.toLowerCase()} > ${subName.toLowerCase()}`;
            const subImg = SUBCATEGORY_IMAGES[subName.toLowerCase()] || resolveChildImage(subName, subName, rootName, 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&w=600&q=80');
            getOrAdd(subKey, {
                name: subName,
                slug: `${slugify(rootName)}-${slugify(subName)}`,
                parentKey: rootKey,
                description: `${subName} under Health & Wellness`,
                image: subImg,
                displayOrder: 1,
                isActive: true,
                supportedExperiences: ['marketplace', 'wholesale'],
                level: 2
            });

            if (childName) {
                const childKey = `mp:child:${rootName.toLowerCase()} > ${subName.toLowerCase()} > ${childName.toLowerCase()}`;
                const childImg = resolveChildImage(childName, subName, rootName, subImg);
                getOrAdd(childKey, {
                    name: childName,
                    slug: `${slugify(rootName)}-${slugify(subName)}-${slugify(childName)}`,
                    parentKey: subKey,
                    description: `${childName} under ${subName}`,
                    image: childImg,
                    displayOrder: 1,
                    isActive: true,
                    supportedExperiences: ['marketplace', 'wholesale'],
                    level: 3
                });

                if (grandChildName) {
                    const grandKey = `mp:grand:${rootName.toLowerCase()} > ${subName.toLowerCase()} > ${childName.toLowerCase()} > ${grandChildName.toLowerCase()}`;
                    const grandImg = resolveChildImage(grandChildName, childName, rootName, childImg);
                    getOrAdd(grandKey, {
                        name: grandChildName,
                        slug: `${slugify(rootName)}-${slugify(subName)}-${slugify(childName)}-${slugify(grandChildName)}`,
                        parentKey: childKey,
                        description: `${grandChildName} under ${childName}`,
                        image: grandImg,
                        displayOrder: 1,
                        isActive: true,
                        supportedExperiences: ['marketplace', 'wholesale'],
                        level: 4
                    });
                }
            }
        }
        continue;
    }

    let isToysFile = file === 'Dwell_Mart_Toys_Games_Categories.xlsx';
    let rowIndex = 0;

    for (const r of rows) {
        rowIndex++;
        // Skip first 4 template sample rows in Toys file
        if (isToysFile && rowIndex <= 4) continue;

        const rootName = String(r['Main Category'] || '').trim();
        const subName = String(r['Subcategory (Level 2)'] || '').trim();
        const childName = String(r['Child Category (Level 3)'] || '').trim();
        const desc = String(r['Description'] || '').trim();
        const order = parseInt(r['Display Order'], 10) || 1;
        const status = String(r['Status'] || 'active').trim().toLowerCase();
        const isActive = status !== 'inactive' && status !== 'false';
        let imgUrl = String(r['Image URL'] || r['Image'] || '').trim();

        if (!rootName) continue;

        const rootKey = `mp:root:${rootName.toLowerCase()}`;
        const rootImg = imgUrl || SUBCATEGORY_IMAGES[rootName.toLowerCase()] || 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=600&q=80';
        getOrAdd(rootKey, {
            name: rootName,
            slug: slugify(rootName),
            parentKey: null,
            description: desc || `${rootName} Marketplace`,
            image: rootImg,
            displayOrder: order,
            isActive: rootName === 'Health & Wellness' ? false : true,
            supportedExperiences: ['marketplace', 'wholesale'],
            level: 1
        });

        if (subName) {
            const subKey = `mp:sub:${rootName.toLowerCase()} > ${subName.toLowerCase()}`;
            const subImg = imgUrl || SUBCATEGORY_IMAGES[subName.toLowerCase()] || resolveChildImage(subName, subName, rootName, rootImg);
            getOrAdd(subKey, {
                name: subName,
                slug: `${slugify(rootName)}-${slugify(subName)}`,
                parentKey: rootKey,
                description: desc || `${subName} under ${rootName}`,
                image: subImg,
                displayOrder: order,
                isActive: true,
                supportedExperiences: ['marketplace', 'wholesale'],
                level: 2
            });

            if (childName) {
                const childKey = `mp:child:${rootName.toLowerCase()} > ${subName.toLowerCase()} > ${childName.toLowerCase()}`;
                const childImg = imgUrl || resolveChildImage(childName, subName, rootName, subImg);
                getOrAdd(childKey, {
                    name: childName,
                    slug: `${slugify(rootName)}-${slugify(subName)}-${slugify(childName)}`,
                    parentKey: subKey,
                    description: desc,
                    image: childImg,
                    displayOrder: order,
                    isActive,
                    supportedExperiences: ['marketplace', 'wholesale'],
                    level: 3
                });
            }
        }
    }
}

console.log(`✅ Total categories parsed from 19 files: ${parsedMap.size}`);

// Ensure all slugs are unique across the dataset
const slugSet = new Set();
for (const [key, cat] of parsedMap) {
    let s = cat.slug;
    let counter = 1;
    while (slugSet.has(s)) {
        s = `${cat.slug}-${counter}`;
        counter++;
    }
    cat.slug = s;
    slugSet.add(s);
}

// ── STEP 2: REMOVE EXISTING CATEGORIES & INSERT IN HIERARCHICAL ORDER ─────────
console.log('\n🗑️ Removing existing categories from database...');
await Category.deleteMany({});
console.log('✅ Existing categories wiped.');

console.log('\n📥 Inserting new categories level by level...');

// Map to store inserted Mongo _id by key
const keyToIdMap = new Map();

// Insert Level 1 (Roots)
const l1Items = Array.from(parsedMap.entries()).filter(([k, v]) => v.level === 1);
console.log(`Inserting Level 1 Roots: ${l1Items.length}...`);
for (const [key, item] of l1Items) {
    const doc = await Category.create({
        name: item.name,
        slug: item.slug,
        description: item.description,
        image: item.image,
        icon: '',
        parentId: null,
        order: item.displayOrder,
        displayOrder: item.displayOrder,
        isActive: item.isActive,
        supportedExperiences: item.supportedExperiences
    });
    keyToIdMap.set(key, doc._id);
}

// Insert Level 2 (Subcategories)
const l2Items = Array.from(parsedMap.entries()).filter(([k, v]) => v.level === 2);
console.log(`Inserting Level 2 Subcategories: ${l2Items.length}...`);
for (const [key, item] of l2Items) {
    const parentId = keyToIdMap.get(item.parentKey);
    const doc = await Category.create({
        name: item.name,
        slug: item.slug,
        description: item.description,
        image: item.image,
        icon: '',
        parentId: parentId || null,
        order: item.displayOrder,
        displayOrder: item.displayOrder,
        isActive: item.isActive,
        supportedExperiences: item.supportedExperiences
    });
    keyToIdMap.set(key, doc._id);
}

// Insert Level 3 (Child Categories)
const l3Items = Array.from(parsedMap.entries()).filter(([k, v]) => v.level === 3);
console.log(`Inserting Level 3 Child Categories: ${l3Items.length}...`);
for (const [key, item] of l3Items) {
    const parentId = keyToIdMap.get(item.parentKey);
    const doc = await Category.create({
        name: item.name,
        slug: item.slug,
        description: item.description,
        image: item.image,
        icon: '',
        parentId: parentId || null,
        order: item.displayOrder,
        displayOrder: item.displayOrder,
        isActive: item.isActive,
        supportedExperiences: item.supportedExperiences
    });
    keyToIdMap.set(key, doc._id);
}

// Insert Level 4 (Grandchild Categories, e.g. in Health & Wellness)
const l4Items = Array.from(parsedMap.entries()).filter(([k, v]) => v.level === 4);
console.log(`Inserting Level 4 Grandchild Categories: ${l4Items.length}...`);
for (const [key, item] of l4Items) {
    const parentId = keyToIdMap.get(item.parentKey);
    const doc = await Category.create({
        name: item.name,
        slug: item.slug,
        description: item.description,
        image: item.image,
        icon: '',
        parentId: parentId || null,
        order: item.displayOrder,
        displayOrder: item.displayOrder,
        isActive: item.isActive,
        supportedExperiences: item.supportedExperiences
    });
    keyToIdMap.set(key, doc._id);
}

const totalInserted = await Category.countDocuments();
console.log(`\n🎉 Total categories successfully inserted into MongoDB: ${totalInserted}`);

// ── STEP 3: RELINK ALL 1,876 PRODUCTS ────────────────────────────────────────
console.log('\n🔗 Relinking all products to new categories...');

// Build name and exp lookup maps
const allNewCats = await Category.find({}).lean();
const newCatsByNameAndExp = new Map();
const newCatsByName = new Map();

for (const cat of allNewCats) {
    const exp = cat.supportedExperiences.includes('quick_commerce') ? 'qc' : 'mp';
    const cleanName = cat.name.toLowerCase().trim();
    if (!newCatsByNameAndExp.has(`${exp}:${cleanName}`)) {
        newCatsByNameAndExp.set(`${exp}:${cleanName}`, cat);
    }
    if (!newCatsByName.has(cleanName)) {
        newCatsByName.set(cleanName, cat);
    }
}

// Synonyms map
const synonyms = {
    'sewing kits & tailoring tools': 'sewing kits',
    "men's casual shoes": 'casual shoes',
    'basmati rice': 'rice & rice products',
    'tea packets & leaves': 'tea',
    'cleaning & housekeeping': 'cleaning products',
    'haircare': 'hair care',
    'diapering essentials': 'diapers & diapering',
    'potato & corn chips': 'potato chips',
    'incense sticks & dhoop': 'home & kitchen',
    'stainless steel & metal keychains': 'metal keychains',
    'guitars': 'musical toys',
    'ayurveda & herbal supplements': 'ayurveda & herbal',
    'mobile accessories': 'smart gadgets',
    'audio & headphones': 'audio',
    'fitness equipment': 'fitness & sports nutrition',
    'fragrances & deodorants': 'fragrances',
    'girls clothing': "kids' wear"
};

// Load product snapshot for original category names
const prodsBackup = JSON.parse(fs.readFileSync(path.join(backupDir, 'products_backup_before_19_import.json'), 'utf8'));
const oldCatsBackup = JSON.parse(fs.readFileSync(path.join(backupDir, 'categories_backup_before_19_import.json'), 'utf8'));
const oldCatMap = new Map(oldCatsBackup.map(c => [String(c._id), c]));

const bulkProductOps = [];
let matchedProducts = 0;

// Also find fallback categories
const fallbackMp = newCatsByName.get("men's wear") || allNewCats[0];
const fallbackQc = newCatsByNameAndExp.get('qc:snacks & namkeen') || newCatsByName.get('snacks & namkeen');

for (const p of prodsBackup) {
    const oldCat = oldCatMap.get(String(p.categoryId));
    const oldName = (oldCat?.name || '').toLowerCase().trim();
    const pName = (p.name || '').toLowerCase().trim();

    // 1. Direct name match in marketplace
    let target = newCatsByNameAndExp.get(`mp:${oldName}`) || newCatsByName.get(oldName);

    // 2. Synonyms map
    if (!target && synonyms[oldName]) {
        const targetName = synonyms[oldName];
        target = newCatsByNameAndExp.get(`mp:${targetName}`) || newCatsByName.get(targetName);
    }

    // 3. Fallback by keywords
    if (!target) {
        if (pName.includes('shirt') || pName.includes('pant') || pName.includes('jean')) target = newCatsByName.get("men's wear");
        else if (pName.includes('cream') || pName.includes('lotion') || pName.includes('serum') || pName.includes('skin')) target = newCatsByName.get('skin care') || newCatsByName.get('skincare');
        else if (pName.includes('hair') || pName.includes('shampoo') || pName.includes('conditioner')) target = newCatsByName.get('hair care');
        else if (pName.includes('tea') || pName.includes('coffee')) target = newCatsByName.get('tea');
        else if (pName.includes('dal') || pName.includes('pulse') || pName.includes('chana') || pName.includes('arhar')) target = newCatsByName.get('pulses & lentils');
        else if (pName.includes('clean') || pName.includes('wash') || pName.includes('detergent')) target = newCatsByName.get('cleaning products');
        else if (pName.includes('shoe') || pName.includes('loafer') || pName.includes('sandal')) target = newCatsByName.get('footwear') || newCatsByName.get('casual shoes');
    }

    const finalTarget = target || fallbackMp;

    // Quick Commerce target if applicable
    let finalQcTarget = null;
    if (p.quickCommerceEnabled || p.quickCommerceCategoryId) {
        finalQcTarget = newCatsByNameAndExp.get(`qc:${oldName}`) ||
                        newCatsByNameAndExp.get(`qc:${finalTarget.name.toLowerCase()}`) ||
                        fallbackQc;
    }

    const updateDoc = {
        categoryId: finalTarget._id
    };
    if (finalQcTarget) {
        updateDoc.quickCommerceCategoryId = finalQcTarget._id;
    }

    bulkProductOps.push({
        updateOne: {
            filter: { _id: p._id },
            update: { $set: updateDoc }
        }
    });
    matchedProducts++;
}

if (bulkProductOps.length > 0) {
    console.log(`Writing product updates in batches (${bulkProductOps.length} ops)...`);
    await Product.bulkWrite(bulkProductOps);
    console.log(`✅ Relinked ${matchedProducts} products!`);
}

// ── STEP 4: PERSIST FULL CATALOG TO JSON FOR COMPLETE STANDALONE RUNTIME ─────
console.log('\n💾 Exporting complete catalog to src/data/categories_unified.json...');
const dataDir = path.join(process.cwd(), 'src', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const completeCatalog = await Category.find({}).lean();
fs.writeFileSync(
    path.join(dataDir, 'categories_unified.json'),
    JSON.stringify(completeCatalog, null, 2)
);
console.log(`✅ Saved ${completeCatalog.length} categories to src/data/categories_unified.json!`);

// ── STEP 5: VERIFICATION ─────────────────────────────────────────────────────
const totalInDb = await Category.countDocuments();
const rootsCount = await Category.countDocuments({ parentId: null });
const qcRoots = await Category.countDocuments({ parentId: null, supportedExperiences: ['quick_commerce'] });
const mpRoots = await Category.countDocuments({ parentId: null, supportedExperiences: { $in: ['marketplace', 'wholesale'] } });
const orphanedProds = await Product.countDocuments({ categoryId: null });
const missingImages = await Category.countDocuments({ image: { $in: ['', null] } });

console.log('\n======================================================');
console.log('🏁 MIGRATION AND SEEDING COMPLETE');
console.log('======================================================');
console.log(`Total Categories in DB: ${totalInDb}`);
console.log(`Root Categories: ${rootsCount} (Marketplace: ${mpRoots}, Quick Commerce: ${qcRoots})`);
console.log(`Categories with Missing Images: ${missingImages}`);
console.log(`Orphaned Products: ${orphanedProds}`);
console.log('======================================================\n');

await mongoose.disconnect();
