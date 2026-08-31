import * as XLSX from 'xlsx';
import Category from '../models/Category.model.js';
import { slugify } from '../utils/slugify.js';
import { EXPERIENCES, normalizeExperience } from '../constants/experiences.js';

/**
 * Generate a pre-styled Excel template workbook for Category Import
 * @returns {Buffer}
 */
export const generateCategoryTemplateBuffer = () => {
    const headers = [
        'Main Category',
        'Subcategory (Level 2)',
        'Child Category (Level 3)',
        'Supported Experience',
        'Description',
        'Display Order',
        'Status',
        'Image URL'
    ];

    const sampleRows = [
        {
            'Main Category': 'Fashion & Lifestyle',
            'Subcategory (Level 2)': "Men's Wear",
            'Child Category (Level 3)': 'Casual Shirts',
            'Supported Experience': 'marketplace',
            'Description': "Premium quality cotton shirts for men",
            'Display Order': 1,
            'Status': 'active',
            'Image URL': 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=400&q=80'
        },
        {
            'Main Category': 'Fashion & Lifestyle',
            'Subcategory (Level 2)': "Men's Wear",
            'Child Category (Level 3)': 'Jeans & Trousers',
            'Supported Experience': 'marketplace',
            'Description': 'Denim jeans and formal trousers',
            'Display Order': 2,
            'Status': 'active',
            'Image URL': 'https://images.unsplash.com/photo-1542272604-780c96856592?auto=format&fit=crop&w=400&q=80'
        },
        {
            'Main Category': 'Electronics & Mobiles',
            'Subcategory (Level 2)': 'Smart Gadgets',
            'Child Category (Level 3)': 'Smartwatches',
            'Supported Experience': 'marketplace',
            'Description': 'Fitness trackers and smartwatches',
            'Display Order': 1,
            'Status': 'active',
            'Image URL': 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=400&q=80'
        },
        {
            'Main Category': 'Dairy, Bread & Eggs',
            'Subcategory (Level 2)': 'Milk & Dairy',
            'Child Category (Level 3)': 'Fresh Cow Milk',
            'Supported Experience': 'quick_commerce',
            'Description': 'Fresh dairy products delivered in 10 mins',
            'Display Order': 1,
            'Status': 'active',
            'Image URL': 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=400&q=80'
        }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleRows, { header: headers });

    // Set column widths for readability
    worksheet['!cols'] = [
        { wch: 25 }, // Main Category
        { wch: 25 }, // Subcategory
        { wch: 25 }, // Child Category
        { wch: 22 }, // Supported Experience
        { wch: 40 }, // Description
        { wch: 14 }, // Display Order
        { wch: 12 }, // Status
        { wch: 50 }, // Image URL
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Categories');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

/**
 * Generate a unique slug for category, preventing duplicates
 */
const generateUniqueSlug = async (name, parentSlug = null) => {
    let baseSlug = slugify(name);
    if (parentSlug) {
        baseSlug = `${parentSlug}-${baseSlug}`;
    }
    let slug = baseSlug;
    let counter = 1;

    while (await Category.findOne({ slug }).lean()) {
        slug = `${baseSlug}-${counter}`;
        counter++;
    }
    return slug;
};

/**
 * Process and import categories from uploaded buffer
 * @param {object} params
 * @param {Buffer} params.buffer
 * @param {string} [params.defaultExperience]
 * @returns {Promise<{ totalRows: number, createdCount: number, updatedCount: number, errors: Array<{ row: number, message: string }> }>}
 */
export const processCategoryImport = async ({ buffer, defaultExperience = EXPERIENCES.MARKETPLACE }) => {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
        throw new Error('The uploaded spreadsheet contains no sheets.');
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (!rows || rows.length === 0) {
        throw new Error('The uploaded sheet contains no data rows.');
    }

    const errors = [];
    let createdCount = 0;
    let updatedCount = 0;

    // Cache existing categories to minimize DB queries
    const categoryCache = new Map();

    const getCachedCategory = async (name, parentId, exp) => {
        const cleanName = String(name || '').trim();
        const cacheKey = `${exp}:${parentId || 'root'}:${cleanName.toLowerCase()}`;
        if (categoryCache.has(cacheKey)) {
            return categoryCache.get(cacheKey);
        }

        const found = await Category.findOne({
            name: { $regex: new RegExp(`^${cleanName.replace(/[.*+?^$\{}()|[\]\\]/g, '\\$&')}$`, 'i') },
            parentId: parentId || null,
            supportedExperiences: exp
        });

        if (found) {
            categoryCache.set(cacheKey, found);
        }
        return found;
    };

    const saveCategoryToCache = (category, exp) => {
        const cacheKey = `${exp}:${category.parentId || 'root'}:${category.name.toLowerCase()}`;
        categoryCache.set(cacheKey, category);
    };

    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const rowNumber = index + 2; // Account for 1-based index and header row

        // Flexible column mapping
        const mainCatName = String(row['Main Category'] || row['Category Level 1'] || row['Category'] || '').trim();
        const subCatName = String(row['Subcategory (Level 2)'] || row['Subcategory'] || row['Category Level 2'] || '').trim();
        const childCatName = String(row['Child Category (Level 3)'] || row['Child Category'] || row['Category Level 3'] || '').trim();
        
        const rawExperience = String(row['Supported Experience'] || row['Experience'] || defaultExperience || '').trim();
        const experience = normalizeExperience(rawExperience) || EXPERIENCES.MARKETPLACE;

        const description = String(row['Description'] || '').trim();
        const displayOrder = parseInt(row['Display Order'] || row['Order'], 10) || 0;
        const statusRaw = String(row['Status'] || '').trim().toLowerCase();
        const isActive = statusRaw === 'inactive' || statusRaw === 'false' ? false : true;
        const imageUrl = String(row['Image URL'] || row['Image'] || '').trim();

        if (!mainCatName) {
            errors.push({ row: rowNumber, message: 'Main Category name is missing.' });
            continue;
        }

        try {
            // ── 1. Resolve / Create Main Category ──────────────────────────────
            let mainCat = await getCachedCategory(mainCatName, null, experience);
            if (!mainCat) {
                const slug = await generateUniqueSlug(mainCatName);
                mainCat = await Category.create({
                    name: mainCatName,
                    slug,
                    parentId: null,
                    description: subCatName ? '' : description,
                    displayOrder: subCatName ? 0 : displayOrder,
                    isActive,
                    image: subCatName ? '' : imageUrl,
                    supportedExperiences: [experience]
                });
                saveCategoryToCache(mainCat, experience);
                createdCount++;
            } else if (!subCatName && !childCatName) {
                // Update leaf main category details if specified
                let touched = false;
                if (description && mainCat.description !== description) { mainCat.description = description; touched = true; }
                if (imageUrl && mainCat.image !== imageUrl) { mainCat.image = imageUrl; touched = true; }
                if (displayOrder && mainCat.displayOrder !== displayOrder) { mainCat.displayOrder = displayOrder; touched = true; }
                if (touched) {
                    await mainCat.save();
                    updatedCount++;
                }
            }

            // ── 2. Resolve / Create Subcategory (Level 2) ──────────────────────
            let subCat = null;
            if (subCatName) {
                subCat = await getCachedCategory(subCatName, mainCat._id, experience);
                if (!subCat) {
                    const slug = await generateUniqueSlug(subCatName, mainCat.slug);
                    subCat = await Category.create({
                        name: subCatName,
                        slug,
                        parentId: mainCat._id,
                        description: childCatName ? '' : description,
                        displayOrder: childCatName ? 0 : displayOrder,
                        isActive,
                        image: childCatName ? '' : imageUrl,
                        supportedExperiences: [experience]
                    });
                    saveCategoryToCache(subCat, experience);
                    createdCount++;
                } else if (!childCatName) {
                    // Update leaf subcategory details
                    let touched = false;
                    if (description && subCat.description !== description) { subCat.description = description; touched = true; }
                    if (imageUrl && subCat.image !== imageUrl) { subCat.image = imageUrl; touched = true; }
                    if (displayOrder && subCat.displayOrder !== displayOrder) { subCat.displayOrder = displayOrder; touched = true; }
                    if (touched) {
                        await subCat.save();
                        updatedCount++;
                    }
                }
            }

            // ── 3. Resolve / Create Child Category (Level 3) ───────────────────
            if (subCat && childCatName) {
                let childCat = await getCachedCategory(childCatName, subCat._id, experience);
                if (!childCat) {
                    const slug = await generateUniqueSlug(childCatName, subCat.slug);
                    childCat = await Category.create({
                        name: childCatName,
                        slug,
                        parentId: subCat._id,
                        description,
                        displayOrder,
                        isActive,
                        image: imageUrl,
                        supportedExperiences: [experience]
                    });
                    saveCategoryToCache(childCat, experience);
                    createdCount++;
                } else {
                    let touched = false;
                    if (description && childCat.description !== description) { childCat.description = description; touched = true; }
                    if (imageUrl && childCat.image !== imageUrl) { childCat.image = imageUrl; touched = true; }
                    if (displayOrder && childCat.displayOrder !== displayOrder) { childCat.displayOrder = displayOrder; touched = true; }
                    if (touched) {
                        await childCat.save();
                        updatedCount++;
                    }
                }
            }
        } catch (err) {
            errors.push({
                row: rowNumber,
                message: err?.message || 'Failed to process category row'
            });
        }
    }

    return {
        totalRows: rows.length,
        createdCount,
        updatedCount,
        errors
    };
};

export default {
    generateCategoryTemplateBuffer,
    processCategoryImport,
};
