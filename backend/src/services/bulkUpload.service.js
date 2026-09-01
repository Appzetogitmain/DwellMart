import XLSX from 'xlsx';
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import Product from '../models/Product.model.js';
import Category from '../models/Category.model.js';
import Brand from '../models/Brand.model.js';
import Vendor from '../models/Vendor.model.js';
import BulkImportHistory from '../models/BulkImportHistory.model.js';
import { resolveCatalogScope, catalogScopeFilter } from '../utils/catalogScope.js';
import {
    parsePriceTiersCell,
    serializePriceTiers,
    validatePriceTiers,
} from './pricingValidation.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const BULK_IMAGES_DIR = path.join(UPLOADS_DIR, 'bulk-images');
const BULK_REPORTS_DIR = path.join(UPLOADS_DIR, 'bulk-reports');

// Ensure directories exist
[UPLOADS_DIR, BULK_IMAGES_DIR, BULK_REPORTS_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// In-memory job state store for real-time progress & cancellation
const activeJobs = new Map();


/**
 * Parse the shipping columns from one spreadsheet row.
 *
 * These columns have existed in the template for some time and were read into
 * the validated row — but never written to the product, so every weight a
 * vendor typed was silently discarded. They are now validated and persisted,
 * which means a bad value must be REPORTED on its row rather than dropped.
 *
 * Accepts dimensions either as three columns or as one "30x20x15" cell, which
 * is how carriers print them and how a vendor expects to type them.
 *
 * @returns {{shipping: object|null, errors: string[]}}
 */
export const parseShippingColumns = ({
    weight, weightUnitRaw, length, width, height, dimensionUnitRaw, combinedDims,
}) => {
    const errors = [];

    const weightUnit = weightUnitRaw || 'kg';
    if (weightUnitRaw && !['kg', 'g'].includes(weightUnit)) {
        errors.push(`Weight Unit must be kg or g (got "${weightUnitRaw}").`);
    }

    const dimensionUnit = dimensionUnitRaw || 'cm';
    if (dimensionUnitRaw && !['cm', 'in'].includes(dimensionUnit)) {
        errors.push(`Dimension Unit must be cm or in (got "${dimensionUnitRaw}").`);
    }

    let l = length;
    let w = width;
    let h = height;

    if (combinedDims) {
        const parts = combinedDims.toLowerCase().split(/[x*×]/).map((v) => v.trim());
        if (parts.length !== 3) {
            errors.push(`Dimensions must be in LxWxH form, e.g. 30x20x15 (got "${combinedDims}").`);
        } else {
            [l, w, h] = parts;
        }
    }

    const numeric = (raw, label, max) => {
        if (raw === '' || raw === undefined || raw === null) return null;
        const n = Number(raw);
        if (!Number.isFinite(n)) { errors.push(`${label} must be a number (got "${raw}").`); return null; }
        if (n < 0) { errors.push(`${label} cannot be negative.`); return null; }
        if (n === 0) return null;
        if (n > max) { errors.push(`${label} must not exceed ${max}.`); return null; }
        return n;
    };

    const weightValue = numeric(weight, 'Weight', 100000);
    const lengthValue = numeric(l, 'Length', 1000);
    const widthValue  = numeric(w, 'Width', 1000);
    const heightValue = numeric(h, 'Height', 1000);

    const dimsGiven = [lengthValue, widthValue, heightValue].filter((v) => v !== null).length;
    if (dimsGiven > 0 && dimsGiven < 3) {
        errors.push('Give all three of Length, Width and Height, or none — a partial set cannot describe a parcel.');
    }

    if (errors.length > 0) return { shipping: null, errors };
    if (weightValue === null && dimsGiven === 0) return { shipping: null, errors };

    const shipping = { source: 'vendor' };
    if (weightValue !== null) { shipping.weight = weightValue; shipping.weightUnit = weightUnit; }
    if (dimsGiven === 3) {
        shipping.length = lengthValue;
        shipping.width = widthValue;
        shipping.height = heightValue;
        shipping.dimensionUnit = dimensionUnit;
    }
    return { shipping, errors };
};

/**
 * Generate sample Excel or CSV template with headers, instructions, and sample rows
 */
export const generateTemplate = async (format = 'xlsx', isAdmin = false, workspace = 'retail') => {
    let headers;
    let sampleRow1;
    let sampleRow2;

    if (workspace === 'quick_commerce') {
        headers = [
            'Product Name',
            'Description',
            'Category',
            'Subcategory',
            'Brand',
            'SKU',
            'HSN Code',
            'Unit',
            'Pack Size',
            'Price',
            'MRP',
            'Cost Price',
            'Stock',
            'Minimum Stock',
            'Is Perishable',
            'Shelf Life (Days)',
            'Max Order Qty',
            'Handling Note',
            'GST %',
            'Tax Included',
            'Status',
            'Tags',
            'Images',
            'Image1',
            'Image2',
            'Image3',
            'Image4',
            'Image5',
        ];
        if (isAdmin) headers.push('Vendor Email');

        sampleRow1 = [
            'Farm Fresh Cow Milk 1L',
            'Pasteurized full cream fresh cow milk',
            'Dairy & Bread',
            'Milk & Cream',
            'Amul',
            'MILK-COW-1L',
            '04012000',
            'Bottle',
            '1 L',
            68,
            72,
            55,
            100,
            10,
            'Yes',
            3,
            6,
            'Store refrigerated at 2-4°C',
            5,
            'Yes',
            'Active',
            'milk, dairy, fresh, breakfast',
            'https://images.unsplash.com/photo-1550583724-b2692b85b150',
            'https://images.unsplash.com/photo-1550583724-b2692b85b150',
            '',
            '',
            '',
            '',
        ];
        if (isAdmin) sampleRow1.push('support.test.vendor@dwell.com');

        sampleRow2 = [
            'Organic Whole Wheat Bread',
            'Freshly baked 100% whole wheat bread loaf',
            'Dairy & Bread',
            'Fresh Bread',
            'Britannia',
            'BREAD-WHEAT-400G',
            '19059010',
            'Pack',
            '400 g',
            45,
            50,
            35,
            80,
            5,
            'Yes',
            5,
            4,
            'Store in a cool dry place',
            0,
            'Yes',
            'Active',
            'bread, wheat, bakery, breakfast',
            'https://images.unsplash.com/photo-1509440159596-0249088772ff',
            'https://images.unsplash.com/photo-1509440159596-0249088772ff',
            '',
            '',
            '',
            '',
        ];
        if (isAdmin) sampleRow2.push('support.test.vendor@dwell.com');
    } else if (workspace === 'wholesale') {
        headers = [
            'Product Name',
            'Description',
            'Category',
            'Subcategory',
            'Brand',
            'SKU',
            'HSN Code',
            'Unit',
            'Price',
            'MRP',
            'Cost Price',
            'Stock',
            'Minimum Stock',
            'Weight',
            'Weight Unit',
            'Length',
            'Width',
            'Height',
            'Dimension Unit',
            'GST %',
            'Tax Included',
            'Status',
            'Tags',
            'Images',
            'Image1',
            'Image2',
            'Image3',
            'Image4',
            'Image5',
            'Wholesale Enabled',
            'MOQ Enabled',
            'MOQ',
            'Bulk Pricing Tiers',
        ];
        if (isAdmin) headers.push('Vendor Email');

        sampleRow1 = [
            'Wholesale Premium Cotton T-Shirts (Bundle)',
            'Bulk lot high quality 100% cotton t-shirts',
            'Fashion',
            'Men Clothing',
            'DwellMart Essentials',
            'TSHIRT-BULK-001',
            '61091000',
            'Piece',
            799,
            1299,
            450,
            500,
            20,
            '0.25 kg',
            '30 cm',
            '20 cm',
            '2 cm',
            18,
            'Yes',
            'Active',
            'tshirt, wholesale, bulk, cotton',
            'https://images.unsplash.com/photo-1521572267360-ee0c2909d518',
            'https://images.unsplash.com/photo-1521572267360-ee0c2909d518',
            '',
            '',
            '',
            '',
            'Yes',
            'Yes',
            20,
            '10:750|25:700|50:650',
        ];
        if (isAdmin) sampleRow1.push('support.test.vendor@dwell.com');

        sampleRow2 = [
            'Wholesale Denim Jeans (Bundle)',
            'Bulk denim jeans 100% cotton durable',
            'Fashion',
            'Men Clothing',
            'DwellMart Essentials',
            'JEANS-BULK-001',
            '62034200',
            'Piece',
            1199,
            1999,
            750,
            300,
            10,
            '0.6 kg',
            '35 cm',
            '25 cm',
            '4 cm',
            18,
            'Yes',
            'Active',
            'jeans, denim, wholesale',
            'https://images.unsplash.com/photo-1542272604-780c96856592',
            'https://images.unsplash.com/photo-1542272604-780c96856592',
            '',
            '',
            '',
            '',
            'Yes',
            'Yes',
            10,
            '10:1100|20:1000|50:900',
        ];
        if (isAdmin) sampleRow2.push('support.test.vendor@dwell.com');
    } else {
        // Standard Retail / Default template
        headers = [
            'Product Name',
            'Description',
            'Category',
            'Subcategory',
            'Brand',
            'SKU',
            'HSN Code',
            'Unit',
            'Price',
            'MRP',
            'Cost Price',
            'Stock',
            'Minimum Stock',
            'Weight',
            'Weight Unit',
            'Length',
            'Width',
            'Height',
            'Dimension Unit',
            'GST %',
            'Tax Included',
            'Status',
            'Tags',
            'Images',
            'Image1',
            'Image2',
            'Image3',
            'Image4',
            'Image5',
            'Is Variant',
            'Parent SKU',
            'Variant Name',
            'Variant SKU',
            'Variant Price',
            'Variant Stock',
            'Variant Attributes',
            'Retail Enabled',
            'Wholesale Enabled',
            'Quick Commerce Enabled',
            'MOQ Enabled',
            'MOQ',
            'Bulk Pricing Tiers',
            'Is Perishable',
            'Pack Size',
            'Shelf Life (Days)',
            'Max Order Qty',
            'Handling Note',
        ];
        if (isAdmin) headers.push('Vendor Email');

        sampleRow1 = [
            'Premium Cotton T-Shirt',
            'High quality breathable 100% cotton t-shirt',
            'Fashion',
            'Men Clothing',
            'DwellMart Essentials',
            'TSHIRT-COTTON-001',
            '61091000',
            'Piece',
            799,
            1299,
            450,
            150,
            10,
            '0.25 kg',
            '30 cm',
            '20 cm',
            '2 cm',
            18,
            'Yes',
            'Active',
            'tshirt, cotton, fashion, summer',
            'https://images.unsplash.com/photo-1521572267360-ee0c2909d518',
            'https://images.unsplash.com/photo-1521572267360-ee0c2909d518',
            '',
            '',
            '',
            '',
            'No',
            '',
            '',
            '',
            '',
            '',
            '',
            'Yes',
            'No',
            'No',
            'No',
            '',
            '',
            'No',
            '',
            '',
            '',
            '',
        ];
        if (isAdmin) sampleRow1.push('support.test.vendor@dwell.com');

        sampleRow2 = [
            'Premium Cotton T-Shirt - Red Large',
            'Red color large size variant',
            'Fashion',
            'Men Clothing',
            'DwellMart Essentials',
            'TSHIRT-COTTON-001-RED-L',
            '61091000',
            'Piece',
            849,
            1299,
            470,
            50,
            5,
            '0.25 kg',
            '30 cm',
            '20 cm',
            '2 cm',
            18,
            'Yes',
            'Active',
            'tshirt, red, large',
            '',
            '',
            '',
            '',
            '',
            '',
            'Yes',
            'TSHIRT-COTTON-001',
            'Size: L / Color: Red',
            'TSHIRT-COTTON-001-RED-L',
            849,
            50,
            'Size=L;Color=Red;Material=Cotton',
            'Yes',
            'No',
            'No',
            'No',
            '',
            '',
            'No',
            '',
            '',
            '',
            '',
        ];
        if (isAdmin) sampleRow2.push('support.test.vendor@dwell.com');
    }

    const data = [headers, sampleRow1, sampleRow2];
    const worksheet = XLSX.utils.aoa_to_sheet(data);

    // Set column widths
    worksheet['!cols'] = headers.map(() => ({ wch: 22 }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Bulk_Product_Template');

    if (format === 'csv') {
        const csvString = XLSX.utils.sheet_to_csv(worksheet);
        return Buffer.from(csvString, 'utf-8');
    }

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

/**
 * Extract image files from uploaded ZIP buffer matching SKU.jpg / SKU.png
 */
export const extractImagesFromZip = async (zipBuffer) => {
    const skuImageMap = {};
    if (!zipBuffer || zipBuffer.length === 0) return skuImageMap;

    try {
        const zip = new AdmZip(zipBuffer);
        const zipEntries = zip.getEntries();

        for (const entry of zipEntries) {
            if (entry.isDirectory) continue;
            const ext = path.extname(entry.entryName).toLowerCase();
            if (!['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'].includes(ext)) continue;

            const filename = path.basename(entry.entryName);
            const skuName = path.basename(filename, ext).trim().toLowerCase();

            const targetFilename = `bulk-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
            const targetPath = path.join(BULK_IMAGES_DIR, targetFilename);

            const fileData = entry.getData();
            fs.writeFileSync(targetPath, fileData);

            const relativeUrl = `/uploads/bulk-images/${targetFilename}`;
            skuImageMap[skuName] = relativeUrl;
        }
    } catch (err) {
        console.error('Error extracting images.zip:', err.message);
    }

    return skuImageMap;
};

/**
 * Helper to slugify product names
 */
const slugify = (text) => {
    return String(text || '')
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
};

/**
 * DRY-RUN VALIDATION: Parse file and validate rows without modifying DB
 */
export const validateBulkUpload = async ({
    fileBuffer,
    fileType = 'xlsx',
    user,
    targetVendorId = null,
    autoCreateBrands = false,
    skuImageMap = {},
    workspace = null,
}) => {
    let workbook;
    if (fileType === 'csv') {
        const csvText = fileBuffer.toString('utf-8');
        workbook = XLSX.read(csvText, { type: 'string' });
    } else {
        workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (!rawRows || rawRows.length === 0) {
        throw new Error('The uploaded file is empty or contains no product rows.');
    }

    // Cache database entities for fast lookup
    const categoriesList = await Category.find({}).lean();
    const brandsList = await Brand.find({}).lean();
    const vendorsList = await Vendor.find({}).lean();

    const categoryMap = new Map();
    categoriesList.forEach((c) => {
        categoryMap.set(String(c._id), c);
        categoryMap.set(c.name.toLowerCase().trim(), c);
    });

    const brandMap = new Map();
    brandsList.forEach((b) => {
        brandMap.set(String(b._id), b);
        brandMap.set(b.name.toLowerCase().trim(), b);
    });

    const vendorMap = new Map();
    vendorsList.forEach((v) => {
        vendorMap.set(String(v._id), v);
        if (v.email) vendorMap.set(v.email.toLowerCase().trim(), v);
    });

    // Default vendor resolution. Scope resolution rejects any role that is
    // neither vendor nor admin, so a customer can no longer start an import
    // attributing products to an arbitrary vendor via `targetVendorId`.
    const scope = resolveCatalogScope(user, targetVendorId);
    let defaultVendor = null;
    if (scope.vendorId) {
        defaultVendor = vendorMap.get(String(scope.vendorId))
            || await Vendor.findById(scope.vendorId).lean();
    }

    // P1-11 FIX: Don't load ALL products from DB — this crashes on large catalogs.
    // Instead, collect the SKUs from the import file first, then fetch only those records.
    // Cap import rows at 10,000 to prevent single-request resource exhaustion.
    const MAX_IMPORT_ROWS = 10_000;
    if (rawRows.length > MAX_IMPORT_ROWS) {
        throw new Error(`Import file exceeds maximum allowed rows (${MAX_IMPORT_ROWS}). Please split into smaller files.`);
    }

    // Collect all SKUs from file for targeted DB lookup
    const fileSkus = rawRows
        .map((r) => String(r['SKU'] || '').trim().toLowerCase())
        .filter(Boolean);

    // Fetch only products whose SKU appears in this import file
    const existingProducts = fileSkus.length > 0
        ? await Product.find(
            { sku: { $in: fileSkus } },
            { sku: 1, name: 1, price: 1, stockQuantity: 1, vendorId: 1 }
          ).lean()
        : [];

    const existingSkuMap = new Map();
    existingProducts.forEach((p) => {
        if (p.sku) existingSkuMap.set(String(p.sku).toLowerCase().trim(), p);
    });

    const fileSkusSeen = new Set();
    const validatedRows = [];
    let validCount = 0;
    let errorCount = 0;
    let warningCount = 0;

    for (let i = 0; i < rawRows.length; i++) {
        const raw = rawRows[i];
        const rowNumber = i + 2; // Row 1 is header

        const name = String(raw['Product Name'] || raw['Name'] || '').trim();
        const description = String(raw['Description'] || '').trim();
        const categoryInput = String(raw['Category'] || '').trim();
        const subcategory = String(raw['Subcategory'] || '').trim();
        const brandInput = String(raw['Brand'] || '').trim();
        let sku = String(raw['SKU'] || '').trim();
        const hsnCode = String(raw['HSN Code'] || '').trim();
        const unit = String(raw['Unit'] || 'Piece').trim();
        const priceNum = parseFloat(raw['Price']);
        const mrpNum = raw['MRP'] !== '' ? parseFloat(raw['MRP']) : null;
        const costPriceNum = raw['Cost Price'] !== '' ? parseFloat(raw['Cost Price']) : null;
        const stockNum = raw['Stock'] !== '' ? parseInt(raw['Stock'], 10) : 0;
        const minStockNum = raw['Minimum Stock'] !== '' ? parseInt(raw['Minimum Stock'], 10) : 1;
        const weight = String(raw['Weight'] || '').trim();
        const length = String(raw['Length'] || '').trim();
        const width = String(raw['Width'] || '').trim();
        const height = String(raw['Height'] || '').trim();
        const weightUnitRaw = String(raw['Weight Unit'] || '').trim().toLowerCase();
        const dimensionUnitRaw = String(raw['Dimension Unit'] || '').trim().toLowerCase();
        // Also accept a single "30x20x15" cell, which is how carriers print
        // dimensions and how a vendor filling a spreadsheet expects to type them.
        const combinedDims = String(raw['Dimensions (LxWxH)'] || raw['Dimensions'] || '').trim();
        const shippingParse = parseShippingColumns({
            weight, weightUnitRaw, length, width, height, dimensionUnitRaw, combinedDims,
        });
        const gstNum = raw['GST %'] !== '' ? parseFloat(raw['GST %']) : 18;
        const taxIncludedStr = String(raw['Tax Included'] || 'Yes').trim().toLowerCase();
        const statusStr = String(raw['Status'] || 'Active').trim().toLowerCase();
        const tagsStr = String(raw['Tags'] || '').trim();
        const imagesStr = String(raw['Images'] || '').trim();
        const img1 = String(raw['Image1'] || '').trim();
        const img2 = String(raw['Image2'] || '').trim();
        const img3 = String(raw['Image3'] || '').trim();
        const img4 = String(raw['Image4'] || '').trim();
        const img5 = String(raw['Image5'] || '').trim();
        const isVariantStr = String(raw['Is Variant'] || 'No').trim().toLowerCase();
        const parentSku = String(raw['Parent SKU'] || '').trim();
        const variantName = String(raw['Variant Name'] || '').trim();
        const variantSku = String(raw['Variant SKU'] || '').trim();
        const variantPrice = raw['Variant Price'] !== '' ? parseFloat(raw['Variant Price']) : null;
        const variantStock = raw['Variant Stock'] !== '' ? parseInt(raw['Variant Stock'], 10) : null;
        const variantAttributes = String(raw['Variant Attributes'] || '').trim();
        const rowVendorEmail = String(raw['Vendor Email'] || '').trim().toLowerCase();

        // Wholesale columns. Absent columns keep the legacy retail-only default,
        // so pre-wholesale spreadsheets import exactly as before.
        const retailEnabledStr = String(raw['Retail Enabled'] ?? '').trim().toLowerCase();
        const wholesaleEnabledStr = String(raw['Wholesale Enabled'] ?? '').trim().toLowerCase();
        const moqEnabledStr = String(raw['MOQ Enabled'] ?? '').trim().toLowerCase();
        const rawMoq = raw['MOQ'];
        const bulkTiersCell = raw['Bulk Pricing Tiers'];
        const isTruthyCell = (value) => ['yes', 'true', '1', 'y'].includes(value);
        const retailEnabled = retailEnabledStr === '' ? true : isTruthyCell(retailEnabledStr);
        const wholesaleEnabled = wholesaleEnabledStr === '' ? false : isTruthyCell(wholesaleEnabledStr);
        const moqEnabled = moqEnabledStr === '' ? false : isTruthyCell(moqEnabledStr);
        const isVariantRow = isVariantStr === 'yes' || isVariantStr === 'true' || Boolean(parentSku);

        // Quick Commerce columns
        const qcEnabledStr = String(raw['Quick Commerce Enabled'] ?? '').trim().toLowerCase();
        const isPerishableStr = String(raw['Is Perishable'] ?? raw['Perishable'] ?? '').trim().toLowerCase();
        const packSize = String(raw['Pack Size'] ?? '').trim();
        const shelfLifeDays = raw['Shelf Life (Days)'] !== '' && raw['Shelf Life (Days)'] !== undefined ? parseInt(raw['Shelf Life (Days)'], 10) : null;
        const maxOrderQty = raw['Max Order Qty'] !== '' && raw['Max Order Qty'] !== undefined ? parseInt(raw['Max Order Qty'], 10) : null;
        const handlingNote = String(raw['Handling Note'] ?? '').trim();

        const quickCommerceEnabled = workspace === 'quick_commerce'
            ? true
            : (qcEnabledStr !== '' ? isTruthyCell(qcEnabledStr) : false);
        const isPerishable = isTruthyCell(isPerishableStr);

        const errors = [];
        const warnings = [];

        // Shipping columns are parsed above but reported here, once the row's
        // own error list exists. A bad weight is a row-level error, not a
        // silent discard — which is what happened to every weight a vendor
        // typed before these columns were persisted at all.
        errors.push(...shippingParse.errors);

        // 1. Required Fields
        if (!name) errors.push('Product Name is required.');
        if (!categoryInput) errors.push('Category is required.');
        if (isNaN(priceNum) || priceNum < 0) errors.push('Price must be a non-negative number.');
        if (isNaN(stockNum) || stockNum < 0) errors.push('Stock must be a non-negative number.');

        // 2. Pricing & GST Rules
        if (mrpNum !== null && !isNaN(mrpNum) && mrpNum < priceNum) {
            warnings.push(`MRP (₹${mrpNum}) is lower than Selling Price (₹${priceNum}).`);
        }
        if (costPriceNum === null || isNaN(costPriceNum)) {
            warnings.push('Missing Cost Price.');
        }
        if (!hsnCode) {
            warnings.push('Missing HSN Code.');
        }
        if (isNaN(gstNum) || gstNum < 0 || gstNum > 28) {
            errors.push('GST % must be between 0 and 28.');
        } else if (raw['GST %'] === '') {
            warnings.push('Default GST 18% applied.');
        }

        // 2b. Wholesale / Bulk Pricing Rules
        let wholesaleTiers = [];
        let wholesaleMoq = null;
        if (!retailEnabled && !wholesaleEnabled && !quickCommerceEnabled) {
            errors.push('At least one selling channel (Retail, Wholesale, or Quick Commerce) must be enabled.');
        }
        if (wholesaleEnabled) {
            // V1 scope: wholesale bulk-import is limited to non-variant products.
            if (isVariantRow) {
                errors.push('Wholesale bulk pricing is not supported on variant rows in this version. Import variants without wholesale, then configure bulk pricing from the product form.');
            }

            const parsedTiers = parsePriceTiersCell(bulkTiersCell);
            parsedTiers.errors.forEach((message) => errors.push(message));
            wholesaleTiers = parsedTiers.tiers;

            if (parsedTiers.errors.length === 0) {
                try {
                    // Same validator the product APIs use — one rule set, two entry points.
                    wholesaleTiers = validatePriceTiers(priceNum, wholesaleTiers);
                } catch (err) {
                    errors.push(err?.message || 'Invalid bulk pricing tiers.');
                }
            }

            if (moqEnabled) {
                wholesaleMoq = rawMoq === '' || rawMoq === undefined || rawMoq === null
                    ? NaN
                    : parseInt(rawMoq, 10);
                if (!Number.isInteger(wholesaleMoq) || wholesaleMoq < 1) {
                    errors.push('MOQ must be a whole number of 1 or more when MOQ Enabled is Yes.');
                } else if (!isNaN(stockNum) && wholesaleMoq > stockNum) {
                    errors.push(`MOQ (${wholesaleMoq}) cannot exceed Stock (${stockNum}).`);
                }
            }
        } else if (String(bulkTiersCell ?? '').trim()) {
            warnings.push('Bulk Pricing Tiers provided but Wholesale Enabled is not Yes — tiers will be ignored.');
        }

        // 2c. Quick Commerce Validation Rules
        if (quickCommerceEnabled) {
            if (maxOrderQty !== null && (!Number.isInteger(maxOrderQty) || maxOrderQty < 1)) {
                errors.push('Max Order Qty must be a positive integer (1 or more).');
            }
            if (shelfLifeDays !== null && (!Number.isInteger(shelfLifeDays) || shelfLifeDays < 0)) {
                errors.push('Shelf Life (Days) must be 0 or greater.');
            }
        }

        // 3. Category Lookup
        let categoryObj = categoryMap.get(categoryInput) || categoryMap.get(categoryInput.toLowerCase());
        if (!categoryObj) {
            errors.push(`Category "${categoryInput}" not found in database. Please create this category first or select an existing category.`);
        }
        const quickCommerceCategoryId = (quickCommerceEnabled && categoryObj) ? categoryObj._id : null;

        // 4. Brand Lookup & Auto-Creation
        let brandObj = brandInput ? (brandMap.get(brandInput) || brandMap.get(brandInput.toLowerCase())) : null;
        if (brandInput && !brandObj) {
            if (autoCreateBrands) {
                warnings.push(`Brand "${brandInput}" does not exist. It will be created automatically.`);
            } else {
                warnings.push(`Brand "${brandInput}" not found (will be imported without brand assignment).`);
            }
        }

        // 5. Vendor Resolution
        let rowVendor = defaultVendor;
        if (user.role !== 'vendor') {
            if (rowVendorEmail) {
                rowVendor = vendorMap.get(rowVendorEmail);
                if (!rowVendor) {
                    errors.push(`Vendor email "${rowVendorEmail}" not found.`);
                }
            } else if (!defaultVendor) {
                errors.push('Vendor Email is required for Admin upload when no target vendor is selected.');
            }
        }

        // 6. SKU Generation & Duplicate Check
        if (!sku) {
            sku = `SKU-${slugify(name).toUpperCase()}-${Date.now().toString(36).slice(-4)}`;
        }
        const skuLower = sku.toLowerCase();
        let isDuplicateInDb = false;
        let isDuplicateInFile = false;

        if (fileSkusSeen.has(skuLower)) {
            isDuplicateInFile = true;
            warnings.push(`Duplicate SKU "${sku}" found multiple times in this file.`);
        } else {
            fileSkusSeen.add(skuLower);
        }

        if (existingSkuMap.has(skuLower)) {
            isDuplicateInDb = true;
            warnings.push(`SKU "${sku}" already exists in store catalog.`);
        }

        // 7. Images Collection
        const imagesList = [];
        if (imagesStr) {
            imagesStr.split(',').map((u) => u.trim()).filter(Boolean).forEach((u) => imagesList.push(u));
        }
        [img1, img2, img3, img4, img5].forEach((u) => {
            if (u && !imagesList.includes(u)) imagesList.push(u);
        });

        // Check if SKU image exists in ZIP archive
        if (skuImageMap[skuLower] && !imagesList.includes(skuImageMap[skuLower])) {
            imagesList.unshift(skuImageMap[skuLower]);
        }

        const isVariant = isVariantStr === 'yes' || isVariantStr === 'true' || Boolean(parentSku);

        // Validation Status
        let validationStatus = 'valid';
        if (errors.length > 0) {
            validationStatus = 'error';
            errorCount++;
        } else if (warnings.length > 0) {
            validationStatus = 'warning';
            warningCount++;
            validCount++;
        } else {
            validCount++;
        }

        validatedRows.push({
            rowNumber,
            name,
            description,
            categoryInput,
            categoryId: categoryObj?._id || null,
            categoryName: categoryObj?.name || categoryInput,
            subcategory,
            brandInput,
            brandId: brandObj?._id || null,
            brandName: brandObj?.name || brandInput,
            vendorId: rowVendor?._id || null,
            vendorName: rowVendor?.storeName || rowVendor?.name || rowVendorEmail || 'Store Vendor',
            vendorEmail: rowVendor?.email || rowVendorEmail,
            sku,
            hsnCode,
            unit,
            price: priceNum || 0,
            mrp: mrpNum !== null && !isNaN(mrpNum) ? mrpNum : priceNum,
            costPrice: costPriceNum,
            stockQuantity: stockNum,
            minimumStock: minStockNum,
            weight,
            length,
            width,
            height,
            shipping: shippingParse.shipping,
            taxRate: gstNum,
            taxIncluded: taxIncludedStr === 'yes' || taxIncludedStr === 'true',
            isActive: statusStr === 'active' || statusStr === 'in_stock',
            tags: tagsStr ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean) : [],
            images: imagesList,
            image: imagesList[0] || '',
            isVariant,
            parentSku,
            variantName,
            variantSku,
            variantPrice,
            variantStock,
            variantAttributes,
            retailEnabled,
            wholesaleEnabled,
            wholesaleMoqEnabled: wholesaleEnabled ? moqEnabled : false,
            wholesaleMoq: wholesaleEnabled && moqEnabled ? wholesaleMoq : null,
            wholesalePriceTiers: wholesaleEnabled ? wholesaleTiers : [],
            quickCommerceEnabled,
            isPerishable,
            packSize,
            shelfLifeDays,
            maxOrderQty,
            handlingNote,
            quickCommerceCategoryId,
            errors,
            warnings,
            validationStatus,
            isDuplicateInDb,
            isDuplicateInFile,
        });
    }

    return {
        totalRows: rawRows.length,
        validCount,
        errorCount,
        warningCount,
        rows: validatedRows,
    };
};

/**
 * ASYNCHRONOUS BACKGROUND IMPORT JOB
 */
export const startBulkUploadJob = async ({
    validatedRows = [],
    duplicateMode = 'skip',
    user,
    targetVendorId = null,
    autoCreateBrands = false,
    fileName = 'products_import.xlsx',
    fileSize = 0,
    workspace = null,
}) => {
    const jobId = `job-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const startTime = Date.now();

    // Create history DB record
    const jobScope = resolveCatalogScope(user, targetVendorId);
    const historyDoc = await BulkImportHistory.create({
        jobId,
        vendorId: jobScope.vendorId,
        uploadedBy: {
            id: user.id,
            name: user.name || 'User',
            email: user.email || '',
            role: user.role,
        },
        fileName,
        fileSize,
        duplicateMode,
        status: 'processing',
        totalRows: validatedRows.length,
        importedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        progressPercent: 0,
    });

    const jobState = {
        jobId,
        historyId: historyDoc._id,
        status: 'processing',
        cancelled: false,
        totalRows: validatedRows.length,
        processedRows: 0,
        importedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        failedCount: 0,
        progressPercent: 0,
        errors: [],
        validRowsSaved: [],
        workspace,
    };

    activeJobs.set(jobId, jobState);

    // Asynchronously process in background
    setImmediate(() => {
        executeJobInBatches(jobState, validatedRows, duplicateMode, autoCreateBrands, startTime).catch((err) => {
            console.error(`Background job ${jobId} failed:`, err.message);
            jobState.status = 'failed';
            activeJobs.set(jobId, jobState);
            BulkImportHistory.updateOne({ jobId }, { $set: { status: 'failed' } }).catch(() => {});
        });
    });

    return { jobId, status: 'processing', totalRows: validatedRows.length };
};

/**
 * Execute batch operations using MongoDB bulkWrite()
 */
const executeJobInBatches = async (jobState, validatedRows, duplicateMode, autoCreateBrands, startTime) => {
    const BATCH_SIZE = 100;
    const createdBrandCache = new Map();

    // Process rows into non-variant products and variant products
    const validRowsToProcess = validatedRows.filter((r) => r.validationStatus !== 'error');
    const failedRowsList = validatedRows.filter((r) => r.validationStatus === 'error').map((r) => ({
        row: r.rowNumber,
        sku: r.sku,
        productName: r.name,
        reason: r.errors.join('; '),
    }));

    jobState.failedCount += failedRowsList.length;

    for (let i = 0; i < validRowsToProcess.length; i += BATCH_SIZE) {
        if (jobState.cancelled) {
            jobState.status = 'cancelled';
            await BulkImportHistory.updateOne({ jobId: jobState.jobId }, { $set: { status: 'cancelled' } });
            activeJobs.set(jobState.jobId, jobState);
            return;
        }

        const batch = validRowsToProcess.slice(i, i + BATCH_SIZE);
        const bulkOperations = [];

        for (const row of batch) {
            try {
                // Wholesale & Quick Commerce fields, shared by every duplicate-mode branch below.
                // Built once so insert and update paths cannot diverge.
                const wholesaleFields = {
                    retailEnabled: row.retailEnabled !== false,
                    wholesaleEnabled: row.wholesaleEnabled === true,
                    wholesale: {
                        moqEnabled: row.wholesaleMoqEnabled === true,
                        ...(row.wholesaleMoqEnabled === true && Number.isInteger(row.wholesaleMoq)
                            ? { moq: row.wholesaleMoq }
                            : {}),
                        priceTiers: Array.isArray(row.wholesalePriceTiers) ? row.wholesalePriceTiers : [],
                    },
                };

                const qcData = {
                    isPerishable: row.isPerishable === true,
                    ...(row.packSize ? { packSize: row.packSize } : {}),
                    ...(Number.isInteger(row.shelfLifeDays) && row.shelfLifeDays >= 0 ? { shelfLifeDays: row.shelfLifeDays } : {}),
                    ...(Number.isInteger(row.maxOrderQty) && row.maxOrderQty >= 1 ? { maxOrderQty: row.maxOrderQty } : {}),
                    ...(row.handlingNote ? { handlingNote: row.handlingNote } : {}),
                };

                const isQcActive = jobState.workspace === 'quick_commerce' || row.quickCommerceEnabled === true;
                const qcCategoryId = isQcActive ? (row.quickCommerceCategoryId || row.categoryId) : null;

                const updateChannelFields = jobState.workspace === 'retail'
                    ? { retailEnabled: true }
                    : jobState.workspace === 'wholesale'
                        ? { wholesaleEnabled: true, wholesale: wholesaleFields.wholesale }
                        : jobState.workspace === 'quick_commerce'
                            ? { quickCommerceEnabled: true, ...(qcCategoryId ? { quickCommerceCategoryId: qcCategoryId } : {}), quickCommerce: qcData }
                            : {
                                ...wholesaleFields,
                                ...(isQcActive ? { quickCommerceEnabled: true, ...(qcCategoryId ? { quickCommerceCategoryId: qcCategoryId } : {}), quickCommerce: qcData } : {}),
                            };

                const insertChannelFields = jobState.workspace === 'retail'
                    ? { retailEnabled: true, wholesaleEnabled: false, quickCommerceEnabled: false }
                    : jobState.workspace === 'wholesale'
                        ? { retailEnabled: false, wholesaleEnabled: true, quickCommerceEnabled: false, wholesale: wholesaleFields.wholesale }
                        : jobState.workspace === 'quick_commerce'
                            ? { retailEnabled: false, wholesaleEnabled: false, quickCommerceEnabled: true, ...(qcCategoryId ? { quickCommerceCategoryId: qcCategoryId } : {}), quickCommerce: qcData }
                            : {
                                ...wholesaleFields,
                                quickCommerceEnabled: isQcActive,
                                ...(isQcActive ? { ...(qcCategoryId ? { quickCommerceCategoryId: qcCategoryId } : {}), quickCommerce: qcData } : {}),
                            };

                // Auto create brand if requested
                let finalBrandId = row.brandId;
                if (!finalBrandId && row.brandInput && autoCreateBrands) {
                    const brandKey = row.brandInput.toLowerCase();
                    if (createdBrandCache.has(brandKey)) {
                        finalBrandId = createdBrandCache.get(brandKey);
                    } else {
                        const newBrand = await Brand.create({
                            name: row.brandInput,
                            slug: slugify(row.brandInput),
                            isActive: true,
                        });
                        finalBrandId = newBrand._id;
                        createdBrandCache.set(brandKey, finalBrandId);
                    }
                }

                // Check existing product in DB
                const existingProduct = await Product.findOne({ vendorId: row.vendorId, sku: row.sku.toLowerCase() }).lean();

                if (existingProduct) {
                    if (duplicateMode === 'skip') {
                        jobState.skippedCount++;
                        continue;
                    } else if (duplicateMode === 'update') {
                        bulkOperations.push({
                            updateOne: {
                                filter: { _id: existingProduct._id },
                                update: {
                                    $set: {
                                        name: row.name,
                                        description: row.description || existingProduct.description,
                                        price: row.price,
                                        originalPrice: row.mrp,
                                        stockQuantity: row.stockQuantity,
                                        stock: row.stockQuantity > 5 ? 'in_stock' : row.stockQuantity > 0 ? 'low_stock' : 'out_of_stock',
                                        categoryId: row.categoryId || existingProduct.categoryId,
                                        brandId: finalBrandId || existingProduct.brandId,
                                        unit: row.unit,
                                        hsnCode: row.hsnCode,
                                        // Only overwrite when the sheet supplied
                                        // figures — a blank column must not erase
                                        // measurements entered in the product form.
                                        ...(row.shipping ? { shipping: row.shipping } : {}),
                                        taxRate: row.taxRate,
                                        taxIncluded: row.taxIncluded,
                                        isActive: row.isActive,
                                        tags: row.tags.length > 0 ? row.tags : existingProduct.tags,
                                        images: row.images.length > 0 ? row.images : existingProduct.images,
                                        image: row.image || existingProduct.image,
                                        ...updateChannelFields,
                                    },
                                },
                            },
                        });
                        jobState.updatedCount++;
                    } else if (duplicateMode === 'create') {
                        const newSku = `${row.sku}-DUP-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
                        const slug = `${slugify(row.name)}-${crypto.randomBytes(3).toString('hex')}`;
                        bulkOperations.push({
                            insertOne: {
                                document: {
                                    name: `${row.name} (Copy)`,
                                    slug,
                                    description: row.description,
                                    sku: newSku,
                                    price: row.price,
                                    originalPrice: row.mrp,
                                    costPrice: row.costPrice,
                                    unit: row.unit,
                                    hsnCode: row.hsnCode,
                                    stockQuantity: row.stockQuantity,
                                    stock: row.stockQuantity > 5 ? 'in_stock' : row.stockQuantity > 0 ? 'low_stock' : 'out_of_stock',
                                    minimumOrderQuantity: row.minimumStock,
                                    categoryId: row.categoryId,
                                    brandId: finalBrandId,
                                    vendorId: row.vendorId,
                                    taxRate: row.taxRate,
                                    taxIncluded: row.taxIncluded,
                                    isActive: row.isActive,
                                    tags: row.tags,
                                    images: row.images,
                                    image: row.image,
                                    ...insertChannelFields,
                                },
                            },
                        });
                        jobState.importedCount++;
                    }
                } else {
                    const slug = `${slugify(row.name)}-${crypto.randomBytes(3).toString('hex')}`;
                    bulkOperations.push({
                        insertOne: {
                            document: {
                                name: row.name,
                                slug,
                                description: row.description,
                                sku: row.sku,
                                price: row.price,
                                originalPrice: row.mrp,
                                costPrice: row.costPrice,
                                unit: row.unit,
                                hsnCode: row.hsnCode,
                                ...(row.shipping ? { shipping: row.shipping } : {}),
                                stockQuantity: row.stockQuantity,
                                stock: row.stockQuantity > 5 ? 'in_stock' : row.stockQuantity > 0 ? 'low_stock' : 'out_of_stock',
                                minimumOrderQuantity: row.minimumStock,
                                categoryId: row.categoryId,
                                brandId: finalBrandId,
                                vendorId: row.vendorId,
                                taxRate: row.taxRate,
                                taxIncluded: row.taxIncluded,
                                isActive: row.isActive,
                                tags: row.tags,
                                images: row.images,
                                image: row.image,
                                ...insertChannelFields,
                            },
                        },
                    });
                    jobState.importedCount++;
                }

                jobState.validRowsSaved.push(row);
            } catch (err) {
                jobState.failedCount++;
                failedRowsList.push({
                    row: row.rowNumber,
                    sku: row.sku,
                    productName: row.name,
                    reason: err.message,
                });
            }
        }

        if (bulkOperations.length > 0) {
            await Product.bulkWrite(bulkOperations);
        }

        jobState.processedRows += batch.length;
        jobState.progressPercent = Math.min(100, Math.round((jobState.processedRows / jobState.totalRows) * 100));
        activeJobs.set(jobState.jobId, jobState);

        await BulkImportHistory.updateOne(
            { jobId: jobState.jobId },
            {
                $set: {
                    importedCount: jobState.importedCount,
                    updatedCount: jobState.updatedCount,
                    skippedCount: jobState.skippedCount,
                    failedCount: jobState.failedCount,
                    progressPercent: jobState.progressPercent,
                    status: jobState.progressPercent === 100 ? 'completed' : 'processing',
                },
            }
        );
    }

    // Generate error report excel file if rows failed
    let errorFileUrl = null;
    if (failedRowsList.length > 0) {
        errorFileUrl = await generateErrorReportFile(jobState.jobId, failedRowsList);
    }

    let validFileUrl = null;
    if (jobState.validRowsSaved.length > 0) {
        validFileUrl = await generateValidRowsFile(jobState.jobId, jobState.validRowsSaved);
    }

    const durationMs = Date.now() - startTime;
    jobState.status = 'completed';
    jobState.durationMs = durationMs;
    jobState.errorFileUrl = errorFileUrl;
    jobState.validFileUrl = validFileUrl;

    await BulkImportHistory.updateOne(
        { jobId: jobState.jobId },
        {
            $set: {
                status: 'completed',
                progressPercent: 100,
                importedCount: jobState.importedCount,
                updatedCount: jobState.updatedCount,
                skippedCount: jobState.skippedCount,
                failedCount: jobState.failedCount,
                durationMs,
                errors: failedRowsList,
                errorFileUrl,
                validFileUrl,
            },
        }
    );

    activeJobs.set(jobState.jobId, jobState);
};

/**
 * Generate Import_Errors.xlsx report file
 */
const generateErrorReportFile = async (jobId, failedRows) => {
    const headers = ['Row Number', 'SKU', 'Product Name', 'Reason for Failure'];
    const rows = failedRows.map((f) => [f.row, f.sku || 'N/A', f.productName || 'N/A', f.reason]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    worksheet['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 30 }, { wch: 50 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Import_Errors');

    const filename = `Import_Errors_${jobId}.xlsx`;
    const filepath = path.join(BULK_REPORTS_DIR, filename);
    XLSX.writeFile(workbook, filepath);

    return `/uploads/bulk-reports/${filename}`;
};

/**
 * Generate Valid_Rows.xlsx clean export file
 */
const generateValidRowsFile = async (jobId, validRows) => {
    const headers = [
        'Product Name',
        'Category',
        'SKU',
        'Price',
        'Stock',
        'Status',
        'Retail Enabled',
        'Wholesale Enabled',
        'MOQ Enabled',
        'MOQ',
        'Bulk Pricing Tiers',
    ];
    const rows = validRows.map((r) => [
        r.name,
        r.categoryName,
        r.sku,
        r.price,
        r.stockQuantity,
        r.isActive ? 'Active' : 'Inactive',
        r.retailEnabled !== false ? 'Yes' : 'No',
        r.wholesaleEnabled === true ? 'Yes' : 'No',
        r.wholesale?.moqEnabled ? 'Yes' : 'No',
        r.wholesale?.moq || '',
        serializePriceTiers(r.wholesale?.priceTiers),
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    worksheet['!cols'] = [
        { wch: 30 },
        { wch: 20 },
        { wch: 20 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 15 },
        { wch: 18 },
        { wch: 15 },
        { wch: 10 },
        { wch: 30 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Valid_Products');

    const filename = `Valid_Rows_${jobId}.xlsx`;
    const filepath = path.join(BULK_REPORTS_DIR, filename);
    XLSX.writeFile(workbook, filepath);

    return `/uploads/bulk-reports/${filename}`;
};

/**
 * Get job progress status
 */
export const getJobProgress = async (jobId) => {
    if (activeJobs.has(jobId)) {
        return activeJobs.get(jobId);
    }
    const history = await BulkImportHistory.findOne({ jobId }).lean();
    if (!history) throw new Error('Job not found.');
    return history;
};

/**
 * Cancel running job
 */
export const cancelJob = async (jobId) => {
    if (activeJobs.has(jobId)) {
        const job = activeJobs.get(jobId);
        job.cancelled = true;
        job.status = 'cancelled';
        activeJobs.set(jobId, job);
    }
    await BulkImportHistory.updateOne({ jobId }, { $set: { status: 'cancelled' } });
    return { success: true, message: 'Job cancelled.' };
};

/**
 * Export product catalog into Excel or CSV template format
 */
export const exportProductsCatalog = async ({ user, targetVendorId = null, format = 'xlsx' }) => {
    // Fails closed. The previous `else if` fell through to `{}` for any
    // non-vendor role, exporting the entire platform catalogue — including every
    // vendor's email and cost price — to any authenticated user.
    const scope = resolveCatalogScope(user, targetVendorId);
    const query = catalogScopeFilter(scope);

    const products = await Product.find(query)
        .populate('categoryId', 'name')
        .populate('brandId', 'name')
        .populate('vendorId', 'email storeName name')
        .lean();

    const headers = [
        'Product Name',
        'Description',
        'Category',
        'Brand',
        'SKU',
        'HSN Code',
        'Unit',
        'Price',
        'MRP',
        'Cost Price',
        'Stock',
        'Minimum Stock',
        'Weight',
        'Weight Unit',
        'Length',
        'Width',
        'Height',
        'Dimension Unit',
        'GST %',
        'Tax Included',
        'Status',
        'Tags',
        'Images',
        'Retail Enabled',
        'Wholesale Enabled',
        'MOQ Enabled',
        'MOQ',
        'Bulk Pricing Tiers',
        'Vendor Email',
    ];

    const rows = products.map((p) => [
        p.name || '',
        p.description || '',
        p.categoryId?.name || '',
        p.brandId?.name || '',
        p.sku || '',
        p.hsnCode || '',
        p.unit || 'Piece',
        p.price || 0,
        p.originalPrice || p.price || 0,
        p.costPrice || 0,
        p.stockQuantity || 0,
        p.minimumOrderQuantity || 1,
        // Blank rather than 0 when unmeasured — a 0 would round-trip back as a
        // measurement of nothing, and re-importing must not fabricate one.
        p.shipping?.weight ?? '',
        p.shipping?.weight ? (p.shipping.weightUnit || 'kg') : '',
        p.shipping?.length ?? '',
        p.shipping?.width ?? '',
        p.shipping?.height ?? '',
        p.shipping?.length ? (p.shipping.dimensionUnit || 'cm') : '',
        p.taxRate || 18,
        p.taxIncluded ? 'Yes' : 'No',
        p.isActive ? 'Active' : 'Inactive',
        Array.isArray(p.tags) ? p.tags.join(', ') : '',
        Array.isArray(p.images) ? p.images.join(', ') : p.image || '',
        p.retailEnabled === false ? 'No' : 'Yes',
        p.wholesaleEnabled === true ? 'Yes' : 'No',
        p.wholesale?.moqEnabled === true ? 'Yes' : 'No',
        p.wholesale?.moqEnabled === true && p.wholesale?.moq ? p.wholesale.moq : '',
        serializePriceTiers(p.wholesale?.priceTiers),
        p.vendorId?.email || '',
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    worksheet['!cols'] = headers.map(() => ({ wch: 22 }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Product_Catalog');

    if (format === 'csv') {
        const csvString = XLSX.utils.sheet_to_csv(worksheet);
        return Buffer.from(csvString, 'utf-8');
    }

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};
