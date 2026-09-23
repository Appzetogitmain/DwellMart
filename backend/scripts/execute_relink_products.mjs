import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import mongoose from 'mongoose';
import XLSX from 'xlsx';
import fs from 'fs';

const xlsxRead = XLSX.readFile || XLSX.default?.readFile || (XLSX.read ? (path) => XLSX.read(fs.readFileSync(path), { type: 'buffer' }) : null);
const utils = XLSX.utils || XLSX.default?.utils;

const KEYWORD_MAP = [
    { patterns: [/test/i], catName: 'test' },
    { patterns: [/loofer/i, /loafer/i], catName: 'Loafers' },
    { patterns: [/hand\s*bag/i, /tote\s*bag/i, /shoulder\s*bag/i, /purse/i], catName: 'Handbags' },
    { patterns: [/backpack/i], catName: 'Backpacks' },
    { patterns: [/travel\s*mate/i, /travel\s*bag/i, /luggage/i, /suitcase/i], catName: 'Travel Bags' },
    { patterns: [/chelsea\s*boot/i, /ankle\s*boot/i, /gun\s*boot/i, /boot/i], catName: 'Boots' },
    { patterns: [/sandal/i, /flip\s*flop/i, /slipper/i], catName: 'Sandals & Floaters' },
    { patterns: [/formal\s*shoe/i], catName: 'Formal Shoes' },
    { patterns: [/sneaker/i, /casual\s*sport\s*shoe/i, /running\s*shoe/i, /sport\s*shoe/i], catName: 'Sports Shoes' },
    { patterns: [/shoe/i, /footwear/i], catName: 'Casual Shoes' },
    { patterns: [/yoga\s*pant/i, /track\s*pant/i, /jogger/i], catName: 'Track Pants & Joggers' },
    { patterns: [/legging/i, /tregging/i], catName: 'Leggings & Treggings' },
    { patterns: [/kurti/i, /kurta/i, /anarkali/i], catName: 'Kurtas & Kurtis' },
    { patterns: [/saree/i, /sari/i], catName: 'Sarees' },
    { patterns: [/nighty/i, /night\s*suit/i, /nightwear/i, /loungewear/i], catName: 'Nightwear & Loungewear' },
    { patterns: [/dress/i, /gown/i], catName: 'Dresses' },
    { patterns: [/coatset/i, /coat/i, /blazer/i, /suit/i], catName: 'Suits & Blazers' },
    { patterns: [/jacket/i], catName: 'Jackets & Coats' },
    { patterns: [/plaid\s*shirt/i, /checkered\s*shirt/i, /casual\s*shirt/i, /shirt/i], catName: 'Casual Shirts' },
    { patterns: [/t-shirt/i, /tee/i], catName: 'T-Shirts' },
    { patterns: [/jeans/i, /denim/i], catName: 'Jeans' },
    { patterns: [/trouser/i, /pant/i], catName: 'Trousers' },
    { patterns: [/cap/i, /hat/i], catName: 'Caps & Hats' },
    { patterns: [/jewel/i, /necklace/i, /bangle/i, /ring/i, /earring/i, /pendant/i], catName: 'Fashion Jewellery' },
    { patterns: [/plant/i, /tree/i, /flower/i], catName: 'Artificial Plants & Flowers' },
    { patterns: [/toran/i, /handmade.*decor/i, /paper\s*mache/i], catName: 'Handmade Decor' },
    { patterns: [/wall\s*hanging/i, /wall\s*decor/i], catName: 'Wall Decor' },
    { patterns: [/home\s*decor/i, /decor/i, /idol/i, /statue/i, /diya/i, /candle/i, /pooja/i, /puja/i, /mandir/i], catName: 'Home Decor' },
    { patterns: [/cat\s*food/i], catName: 'Cat Food & Treats' },
    { patterns: [/dog\s*food/i], catName: 'Dog Food & Treats' },
    { patterns: [/pet/i], catName: 'Pet Supplies' },
    { patterns: [/hair\s*mask/i], catName: 'Hair Masks' },
    { patterns: [/hair\s*oil/i], catName: 'Hair Oil' },
    { patterns: [/hair/i, /shampoo/i, /conditioner/i, /hair\s*serum/i], catName: 'Hair Care' },
    { patterns: [/shilajit/i, /shilajeet/i, /aswganda/i, /ashwagandha/i, /jamun/i, /beetroot/i, /moringa/i, /powder/i, /ayurved/i, /herbal/i], catName: 'Ayurvedic Products' },
    { patterns: [/badam\s*shake/i, /shake/i, /health\s*drink/i], catName: 'Health Drinks' },
    { patterns: [/supplement/i], catName: 'Health Supplements' },
    { patterns: [/cover/i, /case/i, /stone\s*cover/i, /mobile.*cover/i], catName: 'Mobile Covers' },
    { patterns: [/tempered/i, /mobile/i, /phone/i, /charger/i, /cable/i, /earphone/i, /headphone/i], catName: 'Mobile Accessories' },
    { patterns: [/farm\s*esence/i, /essence/i, /organic.*oil/i], catName: 'Organic Oils' },
    { patterns: [/organic/i], catName: 'Organic Produce' },
    { patterns: [/oil/i, /serum/i, /cream/i, /lotion/i, /soap/i, /face\s*wash/i, /skincare/i], catName: 'Skin Care' },
    { patterns: [/frying\s*pan/i, /pan/i, /cookware/i, /kadhai/i, /tawa/i], catName: 'Cookware' },
    { patterns: [/kitchen/i, /bottle/i, /container/i, /lunch\s*box/i], catName: 'Kitchen Storage & Containers' },
    { patterns: [/tool/i, /plier/i, /fastener/i, /screw/i, /repair/i, /tape/i], catName: 'Hand Tools' },
    { patterns: [/keychain/i, /bag\s*charm/i], catName: 'Fashion Accessories' },
    { patterns: [/curtain/i, /bedsheet/i, /pillow/i, /blanket/i, /towel/i], catName: 'Home Furnishings' },
    { patterns: [/toy/i, /doll/i, /game/i], catName: 'Toys & Games' },
    { patterns: [/baby/i, /diaper/i, /wipe/i], catName: 'Baby Care' },
    { patterns: [/clean/i, /detergent/i, /wash/i, /mop/i, /broom/i], catName: 'Cleaning Supplies' },
    { patterns: [/tea/i, /coffee/i], catName: 'Tea & Coffee' },
    { patterns: [/snack/i, /biscuit/i, /cookie/i, /namkeen/i, /chips/i], catName: 'Snacks & Namkeen' },
    { patterns: [/rice/i, /flour/i, /atta/i, /dal/i, /pulse/i, /grain/i], catName: 'Atta, Rice & Dal' },
    { patterns: [/spice/i, /masala/i], catName: 'Masalas & Spices' },
    { patterns: [/watch/i, /smartwatch/i], catName: 'Watches' }
];

async function main() {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB.');

    const Product = mongoose.model('Product', new mongoose.Schema({}, { strict: false }));
    const Category = mongoose.model('Category', new mongoose.Schema({}, { strict: false }));

    const allCategories = await Category.find({}).lean();
    console.log(`📊 Total categories available in DB: ${allCategories.length}`);

    const catByName = new Map();
    for (const c of allCategories) {
        catByName.set(c.name.toLowerCase().trim(), c);
    }

    const findCategory = (targetName) => {
        if (!targetName) return null;
        const exact = catByName.get(targetName.toLowerCase().trim());
        if (exact) return exact;
        for (const [name, cat] of catByName.entries()) {
            if (name.includes(targetName.toLowerCase().trim()) || targetName.toLowerCase().trim().includes(name)) {
                return cat;
            }
        }
        return null;
    };

    // Read bulk upload excel
    const excelPath = 'c:/Users/RCom/Desktop/AppZeto/DWELL/DwellMart/new DwellMart_Relops_Bulk_Upload_With_HSN (1).xlsx';
    const wb = xlsxRead(excelPath);
    const bulkRows = utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    const skuMap = new Map();
    for (const r of bulkRows) {
        const sku = String(r['SKU'] || r['sku'] || '').trim();
        if (sku) skuMap.set(sku, r);
    }

    const nullProducts = await Product.find({ categoryId: null }).lean();
    console.log(`📦 Found ${nullProducts.length} products with categoryId: null`);

    if (nullProducts.length === 0) {
        console.log('✨ All products already have valid categoryId. Nothing to re-link.');
        await mongoose.disconnect();
        return;
    }

    const defaultFallbackCat = findCategory('Casual Shoes') || allCategories.find(c => c.parentId) || allCategories[0];

    const bulkOps = [];
    let skuCount = 0;
    let keywordCount = 0;
    let fallbackCount = 0;

    for (const p of nullProducts) {
        let assignedCat = null;

        // 1. SKU Match
        if (p.sku && skuMap.has(p.sku)) {
            const row = skuMap.get(p.sku);
            const sub = (row.Subcategory || '').trim();
            const main = (row.Category || '').trim();
            assignedCat = findCategory(sub) || findCategory(main);
            if (assignedCat) skuCount++;
        }

        // 2. Keyword Match
        if (!assignedCat) {
            const text = `${p.name || ''} ${p.tags ? (Array.isArray(p.tags) ? p.tags.join(' ') : p.tags) : ''} ${p.description || ''}`;
            for (const rule of KEYWORD_MAP) {
                if (rule.patterns.some(regex => regex.test(text))) {
                    const c = findCategory(rule.catName);
                    if (c) {
                        assignedCat = c;
                        keywordCount++;
                        break;
                    }
                }
            }
        }

        // 3. Fallback
        if (!assignedCat) {
            assignedCat = defaultFallbackCat;
            fallbackCount++;
        }

        bulkOps.push({
            updateOne: {
                filter: { _id: p._id },
                update: { $set: { categoryId: assignedCat._id } }
            }
        });
    }

    console.log(`⚡ Executing bulk updates for ${bulkOps.length} products...`);
    console.log(`   - Matched via SKU: ${skuCount}`);
    console.log(`   - Matched via Keywords: ${keywordCount}`);
    console.log(`   - Matched via Fallback: ${fallbackCount}`);

    const res = await Product.bulkWrite(bulkOps);
    console.log(`✅ BulkWrite complete! Matched: ${res.matchedCount}, Modified: ${res.modifiedCount}`);

    const remainingNull = await Product.countDocuments({ categoryId: null });
    console.log(`📊 Products with categoryId null now: ${remainingNull}`);

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('❌ Re-linking failed:', err);
    process.exit(1);
});
