/**
 * Phase 5 — Bulk Upload/Export Wholesale Verification
 *
 * Exercises the real `validateBulkUpload` service against in-memory XLSX
 * buffers to confirm wholesale column parsing, validation, backward
 * compatibility with pre-wholesale spreadsheets, and export round-tripping.
 *
 * Usage: node backend/scripts/verifyBulkWholesaleImport.mjs
 */

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import XLSX from 'xlsx';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const load = (rel) => import(pathToFileURL(path.resolve(__dirname, rel)).href);

const { validateBulkUpload } = await load('../src/services/bulkUpload.service.js');
const { serializePriceTiers } = await load('../src/services/pricingValidation.service.js');
const Category = (await load('../src/models/Category.model.js')).default;
const Brand = (await load('../src/models/Brand.model.js')).default;
const Vendor = (await load('../src/models/Vendor.model.js')).default;
const Product = (await load('../src/models/Product.model.js')).default;

let pass = 0;
let fail = 0;
const check = (label, cond, detail = '') => {
    cond ? pass++ : fail++;
    console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}${cond ? '' : ` ${detail}`}`);
};

// ── Stub the DB lookups validateBulkUpload performs ──────────────────────────
const vendorId = new mongoose.Types.ObjectId();
const categoryId = new mongoose.Types.ObjectId();
Category.find = () => ({ lean: async () => [{ _id: categoryId, name: 'Fashion' }] });
Brand.find = () => ({ lean: async () => [{ _id: new mongoose.Types.ObjectId(), name: 'Acme' }] });
Vendor.find = () => ({ lean: async () => [{ _id: vendorId, email: 'v@x.com', storeName: 'V', name: 'V' }] });
Vendor.findById = () => ({ lean: async () => ({ _id: vendorId, email: 'v@x.com', storeName: 'V' }) });
Product.find = () => ({ lean: async () => [], select: () => ({ lean: async () => [] }) });

const BASE_HEADERS = [
    'Product Name', 'Description', 'Category', 'Brand', 'SKU', 'Unit',
    'Price', 'MRP', 'Stock', 'GST %', 'Status',
];
const WHOLESALE_HEADERS = ['Retail Enabled', 'Wholesale Enabled', 'MOQ Enabled', 'MOQ', 'Bulk Pricing Tiers'];

const buildBuffer = (headers, rows) => {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

const run = async (headers, rows) =>
    validateBulkUpload({
        fileBuffer: buildBuffer(headers, rows),
        fileType: 'xlsx',
        user: { role: 'vendor', id: String(vendorId) },
        targetVendorId: String(vendorId),
    });

const baseRow = ['Widget', 'A widget', 'Fashion', 'Acme', 'SKU-1', 'Piece', 1000, 1200, 100, 18, 'Active'];

console.log('=== A. Backward compatibility: legacy sheet with no wholesale columns ===');
{
    const res = await run(BASE_HEADERS, [baseRow]);
    const row = res.rows[0];
    check('legacy row imports without error', row.errors.length === 0, JSON.stringify(row.errors));
    check('defaults to retail enabled', row.retailEnabled === true);
    check('defaults to wholesale disabled', row.wholesaleEnabled === false);
    check('no tiers persisted', Array.isArray(row.wholesalePriceTiers) && row.wholesalePriceTiers.length === 0);
    check('MOQ not enabled', row.wholesaleMoqEnabled === false);
}

console.log('\n=== B. Valid wholesale row ===');
{
    const res = await run([...BASE_HEADERS, ...WHOLESALE_HEADERS],
        [[...baseRow, 'Yes', 'Yes', 'Yes', 20, '10:950|25:900|50:850']]);
    const row = res.rows[0];
    check('no errors', row.errors.length === 0, JSON.stringify(row.errors));
    check('wholesale enabled', row.wholesaleEnabled === true);
    check('MOQ parsed', row.wholesaleMoq === 20 && row.wholesaleMoqEnabled === true);
    check('3 tiers parsed', row.wholesalePriceTiers.length === 3);
    check('tiers sorted ascending', row.wholesalePriceTiers.map((t) => t.minQty).join(',') === '10,25,50');
    check('tier prices correct', row.wholesalePriceTiers.map((t) => t.price).join(',') === '950,900,850');
}

console.log('\n=== C. Business-rule validation (shared validatePriceTiers) ===');
{
    const wholesaleOnlyNoTiers = await run([...BASE_HEADERS, ...WHOLESALE_HEADERS],
        [[...baseRow, 'Yes', 'Yes', 'No', '', '']]);
    check('wholesale without tiers rejected', wholesaleOnlyNoTiers.rows[0].errors.length > 0);

    const tierAboveRetail = await run([...BASE_HEADERS, ...WHOLESALE_HEADERS],
        [[...baseRow, 'Yes', 'Yes', 'No', '', '10:1200']]);
    check('tier price >= retail rejected', tierAboveRetail.rows[0].errors.some((e) => /lower than the retail price/i.test(e)));

    const dupTier = await run([...BASE_HEADERS, ...WHOLESALE_HEADERS],
        [[...baseRow, 'Yes', 'Yes', 'No', '', '10:950|10:900']]);
    check('duplicate tier quantity rejected', dupTier.rows[0].errors.some((e) => /Duplicate/i.test(e)));

    const moqOverStock = await run([...BASE_HEADERS, ...WHOLESALE_HEADERS],
        [[...baseRow, 'Yes', 'Yes', 'Yes', 500, '10:950']]);
    check('MOQ > stock rejected', moqOverStock.rows[0].errors.some((e) => /cannot exceed Stock/i.test(e)));

    const noChannel = await run([...BASE_HEADERS, ...WHOLESALE_HEADERS],
        [[...baseRow, 'No', 'No', 'No', '', '']]);
    check('both channels disabled rejected', noChannel.rows[0].errors.some((e) => /At least one selling channel/i.test(e)));

    const malformed = await run([...BASE_HEADERS, ...WHOLESALE_HEADERS],
        [[...baseRow, 'Yes', 'Yes', 'No', '', '10-950']]);
    check('malformed tier cell rejected', malformed.rows[0].errors.some((e) => /quantity:price/i.test(e)));
}

console.log('\n=== D. Wholesale-only product (retail disabled) ===');
{
    const res = await run([...BASE_HEADERS, ...WHOLESALE_HEADERS],
        [[...baseRow, 'No', 'Yes', 'Yes', 20, '20:900']]);
    const row = res.rows[0];
    check('accepted', row.errors.length === 0, JSON.stringify(row.errors));
    check('retail disabled', row.retailEnabled === false);
    check('wholesale enabled', row.wholesaleEnabled === true);
}

console.log('\n=== E. Variant rows are out of scope for wholesale (V1) ===');
{
    const headers = [...BASE_HEADERS, 'Is Variant', 'Parent SKU', ...WHOLESALE_HEADERS];
    const res = await run(headers, [[...baseRow, 'Yes', 'SKU-PARENT', 'Yes', 'Yes', 'No', '', '10:950']]);
    check('variant + wholesale rejected with clear message',
        res.rows[0].errors.some((e) => /not supported on variant rows/i.test(e)));

    const retailVariant = await run(headers, [[...baseRow, 'Yes', 'SKU-PARENT', 'Yes', 'No', 'No', '', '']]);
    check('variant without wholesale still imports', retailVariant.rows[0].errors.length === 0,
        JSON.stringify(retailVariant.rows[0].errors));
}

console.log('\n=== F. Tiers supplied while wholesale disabled → warning, not error ===');
{
    const res = await run([...BASE_HEADERS, ...WHOLESALE_HEADERS],
        [[...baseRow, 'Yes', 'No', 'No', '', '10:950']]);
    const row = res.rows[0];
    check('not an error', row.errors.length === 0, JSON.stringify(row.errors));
    check('warns tiers ignored', row.warnings.some((w) => /will be ignored/i.test(w)));
    check('tiers not persisted', row.wholesalePriceTiers.length === 0);
}

console.log('\n=== G. Boolean cell tolerance ===');
{
    for (const truthy of ['Yes', 'yes', 'TRUE', 'true', '1', 'y']) {
        const res = await run([...BASE_HEADERS, ...WHOLESALE_HEADERS],
            [[...baseRow, 'Yes', truthy, 'No', '', '10:950']]);
        check(`"${truthy}" parsed as wholesale enabled`, res.rows[0].wholesaleEnabled === true);
    }
    for (const falsy of ['No', 'no', 'FALSE', '0']) {
        const res = await run([...BASE_HEADERS, ...WHOLESALE_HEADERS],
            [[...baseRow, 'Yes', falsy, 'No', '', '']]);
        check(`"${falsy}" parsed as wholesale disabled`, res.rows[0].wholesaleEnabled === false);
    }
}

console.log('\n=== H. Export round-trip fidelity ===');
{
    const tiers = [{ minQty: 10, price: 950 }, { minQty: 25, price: 900 }];
    const cell = serializePriceTiers(tiers);
    const res = await run([...BASE_HEADERS, ...WHOLESALE_HEADERS],
        [[...baseRow, 'Yes', 'Yes', 'Yes', 20, cell]]);
    const row = res.rows[0];
    check('exported cell re-imports identically',
        JSON.stringify(row.wholesalePriceTiers) === JSON.stringify(tiers),
        JSON.stringify(row.wholesalePriceTiers));
    check('MOQ survives round-trip', row.wholesaleMoq === 20);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
