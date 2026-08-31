import * as XLSX from 'xlsx';
import Brand from '../models/Brand.model.js';
import { slugify } from '../utils/slugify.js';

/**
 * Generate a pre-styled Excel template workbook for Brand Import
 * @returns {Buffer}
 */
export const generateBrandTemplateBuffer = () => {
    const headers = [
        'Brand Name',
        'Description',
        'Website URL',
        'Status',
        'Logo URL'
    ];

    const sampleRows = [
        {
            'Brand Name': 'Adidas',
            'Description': 'Global sportswear, footwear and athletic apparel',
            'Website URL': 'https://adidas.com',
            'Status': 'active',
            'Logo URL': 'https://images.unsplash.com/photo-1518002171953-a080ee817e1f?auto=format&fit=crop&w=400&q=80'
        },
        {
            'Brand Name': 'Apple',
            'Description': 'Premium consumer electronics, smartphones and computers',
            'Website URL': 'https://apple.com',
            'Status': 'active',
            'Logo URL': 'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?auto=format&fit=crop&w=400&q=80'
        },
        {
            'Brand Name': 'Armani Exchange',
            'Description': 'Contemporary fashion, designer clothing and accessories',
            'Website URL': 'https://armaniexchange.com',
            'Status': 'active',
            'Logo URL': 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=400&q=80'
        },
        {
            'Brand Name': 'Puma',
            'Description': 'Athletic apparel, sneakers and sportswear',
            'Website URL': 'https://puma.com',
            'Status': 'active',
            'Logo URL': 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?auto=format&fit=crop&w=400&q=80'
        }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleRows, { header: headers });

    // Set column widths for clean presentation
    worksheet['!cols'] = [
        { wch: 25 }, // Brand Name
        { wch: 45 }, // Description
        { wch: 30 }, // Website URL
        { wch: 12 }, // Status
        { wch: 50 }, // Logo URL
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Brands');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

/**
 * Generate a unique slug for brand, preventing duplicates
 */
const generateUniqueSlug = async (name) => {
    const baseSlug = slugify(name);
    let slug = baseSlug;
    let counter = 1;

    while (await Brand.findOne({ slug }).lean()) {
        slug = `${baseSlug}-${counter}`;
        counter++;
    }
    return slug;
};

/**
 * Process and import brands from uploaded buffer
 * @param {Buffer} buffer
 * @returns {Promise<{ totalRows: number, createdCount: number, updatedCount: number, errors: Array<{ row: number, message: string }> }>}
 */
export const processBrandImport = async (buffer) => {
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

    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const rowNumber = index + 2; // 1-based index with header

        const name = String(row['Brand Name'] || row['Name'] || row['Brand'] || '').trim();
        const description = String(row['Description'] || '').trim();
        const website = String(row['Website URL'] || row['Website'] || '').trim();
        const logo = String(row['Logo URL'] || row['Logo'] || row['Image URL'] || '').trim();
        const statusRaw = String(row['Status'] || '').trim().toLowerCase();
        const isActive = statusRaw === 'inactive' || statusRaw === 'false' ? false : true;

        if (!name) {
            errors.push({ row: rowNumber, message: 'Brand Name is required.' });
            continue;
        }

        try {
            // Find if brand already exists (case-insensitive name match)
            const existingBrand = await Brand.findOne({
                name: { $regex: new RegExp(`^${name.replace(/[.*+?^$\{}()|[\]\\]/g, '\\$&')}$`, 'i') }
            });

            if (existingBrand) {
                let touched = false;
                if (description && existingBrand.description !== description) {
                    existingBrand.description = description;
                    touched = true;
                }
                if (website && existingBrand.website !== website) {
                    existingBrand.website = website;
                    touched = true;
                }
                if (logo && existingBrand.logo !== logo) {
                    existingBrand.logo = logo;
                    touched = true;
                }
                if (existingBrand.isActive !== isActive) {
                    existingBrand.isActive = isActive;
                    touched = true;
                }

                if (touched) {
                    await existingBrand.save();
                    updatedCount++;
                }
            } else {
                const slug = await generateUniqueSlug(name);
                await Brand.create({
                    name,
                    slug,
                    description,
                    website,
                    logo,
                    isActive
                });
                createdCount++;
            }
        } catch (err) {
            errors.push({
                row: rowNumber,
                message: err?.message || 'Failed to process brand row'
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
    generateBrandTemplateBuffer,
    processBrandImport,
};
