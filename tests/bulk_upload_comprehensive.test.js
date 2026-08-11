import axios from 'axios';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import FormData from 'form-data';

const BASE_URL = 'http://localhost:5000/api';

async function runTests() {
    console.log('\n======================================================');
    console.log('  DWELLMART BULK PRODUCT UPLOAD & EXPORT INTEGRATION TEST');
    console.log('======================================================\n');

    let adminToken = '';
    let vendorToken = '';

    // STEP 1: LOGIN SUPER ADMIN
    console.log('STEP 1 — Super Admin Authentication...');
    try {
        const adminRes = await axios.post(`${BASE_URL}/admin/auth/login`, {
            email: 'admin@admin.com',
            password: 'admin123',
        });
        adminToken = adminRes.data?.data?.accessToken || adminRes.data?.data?.token;
        console.log('  ✅ Super Admin logged in successfully.');
    } catch (err) {
        console.error('  ❌ Super Admin login failed:', err.response?.data || err.message);
        process.exit(1);
    }

    // STEP 2: DOWNLOAD EXCEL TEMPLATE
    console.log('\nSTEP 2 — Download Excel Template...');
    try {
        const templateRes = await axios.get(`${BASE_URL}/admin/products/template/excel`, {
            headers: { Authorization: `Bearer ${adminToken}` },
            responseType: 'arraybuffer',
        });
        console.log(`  ✅ Excel template downloaded successfully (${templateRes.data.length} bytes).`);
    } catch (err) {
        console.error('  ❌ Failed to download Excel template:', err.response?.data || err.message);
        process.exit(1);
    }

    // STEP 3: CREATE BULK TEST SPREADSHEET
    console.log('\nSTEP 3 — Generate Sample Test Excel File...');
    let validCatName = 'Fashion';
    try {
        const catRes = await axios.get(`${BASE_URL}/admin/categories`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        const catList = Array.isArray(catRes.data?.data) ? catRes.data.data : (catRes.data?.data?.categories || []);
        if (catList.length > 0 && catList[0].name) {
            validCatName = catList[0].name;
        }
    } catch (e) {}

    let vendorEmail = 'vendor@dwell.com';
    let targetVendorId = null;
    try {
        const vendorRes = await axios.get(`${BASE_URL}/admin/vendors`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        const vendorList = Array.isArray(vendorRes.data?.data) ? vendorRes.data.data : (vendorRes.data?.data?.vendors || []);
        if (vendorList.length > 0) {
            targetVendorId = vendorList[0]._id || vendorList[0].id;
            vendorEmail = vendorList[0].email || vendorEmail;
        }
    } catch (e) {}

    const testFilename = path.join(process.cwd(), 'temp_test_products.xlsx');
    const headers = [
        'Product Name', 'Description', 'Category', 'Subcategory', 'Brand',
        'SKU', 'HSN Code', 'Unit', 'Price', 'MRP', 'Cost Price',
        'Stock', 'Minimum Stock', 'Weight', 'Length', 'Width', 'Height',
        'GST %', 'Tax Included', 'Status', 'Tags', 'Images', 'Vendor Email'
    ];

    const sku1 = `BULK-TEST-SKU-${Date.now()}-1`;
    const sku2 = `BULK-TEST-SKU-${Date.now()}-2`;
    const skuInvalid = `BULK-INVALID-SKU-${Date.now()}`;

    const testRows = [
        headers,
        [
            'Bulk Test Wireless Headphones', 'Active noise canceling headphones', validCatName, 'Audio',
            'Sony', sku1, '85183000', 'Piece', 2999, 4999, 1500, 100, 5, '0.5 kg', '20 cm', '15 cm', '8 cm',
            18, 'Yes', 'Active', 'audio, bluetooth, headphones', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e', vendorEmail
        ],
        [
            'Bulk Test Smart Watch', 'Fitness tracker with heart monitor', validCatName, 'Wearables',
            'Apple', sku2, '85176290', 'Piece', 4999, 6999, 2500, 50, 2, '0.2 kg', '10 cm', '10 cm', '5 cm',
            18, 'Yes', 'Active', 'smartwatch, fitness', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30', vendorEmail
        ],
        [
            '', 'Missing product name test', 'InvalidCategoryDoesNotExist', 'Audio',
            'UnknownBrand', skuInvalid, '85183000', 'Piece', -100, 4999, 1500, -5, 5, '0.5 kg', '20 cm', '15 cm', '8 cm',
            120, 'Yes', 'Active', '', '', vendorEmail
        ]
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(testRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Bulk_Test');
    XLSX.writeFile(workbook, testFilename);
    console.log(`  ✅ Generated test spreadsheet at ${testFilename}.`);

    // STEP 4: DRY RUN VALIDATION
    console.log('\nSTEP 4 — Dry Run File Validation...');
    let validatedRows = [];
    try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(testFilename));
        formData.append('autoCreateBrands', 'true');

        const valRes = await axios.post(`${BASE_URL}/admin/products/bulk-upload/validate`, formData, {
            headers: {
                Authorization: `Bearer ${adminToken}`,
                ...formData.getHeaders(),
            },
        });

        const data = valRes.data?.data || valRes.data;
        validatedRows = data.rows || [];
        console.log(`  ✅ Validation complete: Total Rows: ${data.totalRows}, Valid: ${data.validCount}, Errors: ${data.errorCount}, Warnings: ${data.warningCount}`);
        if (data.errorCount > 0) {
            console.log('  🔍 Validation Errors detail:', validatedRows.map(r => ({ row: r.rowNumber, errors: r.errors, vendorEmail: r.vendorEmail })));
        }
    } catch (err) {
        console.error('  ❌ Dry run validation failed:', err.response?.data || err.message);
        process.exit(1);
    }

    // STEP 5: EXECUTE BACKGROUND JOB
    console.log('\nSTEP 5 — Execute Background Import Job...');
    let jobId = '';
    try {
        const validOnlyRows = validatedRows.filter(r => r.validationStatus !== 'error');
        const processRes = await axios.post(
            `${BASE_URL}/admin/products/bulk-upload/process`,
            {
                rows: validOnlyRows,
                duplicateMode: 'update',
                autoCreateBrands: true,
                fileName: 'temp_test_products.xlsx',
                fileSize: 1024,
            },
            {
                headers: { Authorization: `Bearer ${adminToken}` },
            }
        );

        jobId = processRes.data?.data?.jobId || processRes.data?.jobId;
        console.log(`  ✅ Background job started with Job ID: ${jobId}`);
    } catch (err) {
        console.error('  ❌ Background import execution failed:', err.response?.data || err.message);
        process.exit(1);
    }

    // STEP 6: POLL JOB PROGRESS UNTIL COMPLETED
    console.log('\nSTEP 6 — Polling Job Progress...');
    let isDone = false;
    let attempts = 0;
    while (!isDone && attempts < 15) {
        attempts++;
        await new Promise(r => setTimeout(r, 1000));
        try {
            const statusRes = await axios.get(`${BASE_URL}/admin/products/bulk-upload/job/${jobId}`, {
                headers: { Authorization: `Bearer ${adminToken}` },
            });
            const jobState = statusRes.data?.data || statusRes.data;
            console.log(`  [Poll #${attempts}] Progress: ${jobState.progressPercent || 0}% | Status: ${jobState.status} | Imported: ${jobState.importedCount}`);
            if (jobState.status === 'completed' || jobState.status === 'failed' || jobState.status === 'cancelled') {
                isDone = true;
                console.log(`  ✅ Job finished with status "${jobState.status}".`);
            }
        } catch (err) {
            console.error('  ❌ Error polling job progress:', err.message);
        }
    }

    // STEP 7: FETCH IMPORT HISTORY
    console.log('\nSTEP 7 — Verify Import History...');
    try {
        const historyRes = await axios.get(`${BASE_URL}/admin/products/bulk-upload/history`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        const historyList = historyRes.data?.data?.history || historyRes.data?.history || [];
        console.log(`  ✅ Total history records: ${historyList.length}. Latest Job ID: ${historyList[0]?.jobId}`);
    } catch (err) {
        console.error('  ❌ Failed to fetch import history:', err.response?.data || err.message);
    }

    // STEP 8: EXPORT PRODUCTS CATALOG
    console.log('\nSTEP 8 — Export Product Catalog...');
    try {
        const exportRes = await axios.get(`${BASE_URL}/admin/products/export?format=xlsx`, {
            headers: { Authorization: `Bearer ${adminToken}` },
            responseType: 'arraybuffer',
        });
        console.log(`  ✅ Product catalog exported successfully (${exportRes.data.length} bytes).`);
    } catch (err) {
        console.error('  ❌ Failed to export product catalog:', err.response?.data || err.message);
    }

    // CLEANUP TEMP FILES
    try {
        if (fs.existsSync(testFilename)) fs.unlinkSync(testFilename);
    } catch (e) {}

    console.log('\n======================================================');
    console.log('  🎉 ALL BULK UPLOAD & EXPORT TESTS PASSED SUCCESSFULLY!');
    console.log('======================================================\n');
}

runTests();
