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
 * Generate sample Excel or CSV template with headers, instructions, and sample rows
 */
export const generateTemplate = async (format = 'xlsx', isAdmin = false) => {
    const headers = [
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
        'Length',
        'Width',
        'Height',
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
        // Wholesale / bulk pricing. "Bulk Pricing Tiers" uses quantity:price
        // pairs separated by | (e.g. 10:950|25:900|50:850).
        'Retail Enabled',
        'Wholesale Enabled',
        'MOQ Enabled',
        'MOQ',
        'Bulk Pricing Tiers',
    ];

    if (isAdmin) {
        headers.push('Vendor Email');
    }

    const sampleRow1 = [
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
        'Yes',
        'Yes',
        20,
        '10:750|25:700|50:650',
    ];

    if (isAdmin) {
        sampleRow1.push('support.test.vendor@dwell.com');
    }

    const sampleRow2 = [
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
        '',
        '',
    ];

    if (isAdmin) {
        sampleRow2.push('support.test.vendor@dwell.com');
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

    // Default vendor resolution
    let defaultVendor = null;
    if (user.role === 'vendor') {
        defaultVendor = vendorMap.get(String(user.id)) || await Vendor.findById(user.id).lean();
    } else if (targetVendorId) {
        defaultVendor = vendorMap.get(String(targetVendorId));
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

        const errors = [];
        const warnings = [];

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
        if (!retailEnabled && !wholesaleEnabled) {
            errors.push('At least one selling channel (Retail Enabled or Wholesale Enabled) must be Yes.');
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

        // 3. Category Lookup
        let categoryObj = categoryMap.get(categoryInput) || categoryMap.get(categoryInput.toLowerCase());
        if (!categoryObj) {
            errors.push(`Category "${categoryInput}" not found in database. Please create this category first or select an existing category.`);
        }

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
}) => {
    const jobId = `job-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const startTime = Date.now();

    // Create history DB record
    const historyDoc = await BulkImportHistory.create({
        jobId,
        vendorId: user.role === 'vendor' ? user.id : targetVendorId,
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
                // Wholesale fields, shared by every duplicate-mode branch below.
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
                const existingProduct = await Product.findOne({ sku: row.sku.toLowerCase() }).lean();

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
                                        taxRate: row.taxRate,
                                        taxIncluded: row.taxIncluded,
                                        isActive: row.isActive,
                                        tags: row.tags.length > 0 ? row.tags : existingProduct.tags,
                                        images: row.images.length > 0 ? row.images : existingProduct.images,
                                        image: row.image || existingProduct.image,
                                        ...wholesaleFields,
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
                                    ...wholesaleFields,
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
    const query = {};
    if (user.role === 'vendor') {
        query.vendorId = user.id;
    } else if (targetVendorId) {
        query.vendorId = targetVendorId;
    }

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
