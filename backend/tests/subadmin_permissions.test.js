/**
 * Integration Test Suite for Sub Admin Management & Permission System
 *
 * Execution:
 *   node tests/subadmin_permissions.test.js
 */

import axios from 'axios';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000/api';

let passedCount = 0;
let failedCount = 0;
const failureMessages = [];

const logSection = (title) => {
    console.log('\n' + '─'.repeat(65));
    console.log(`  ${title}`);
    console.log('─'.repeat(65));
};

const assert = (condition, testName, details = '') => {
    if (condition) {
        passedCount++;
        console.log(`  ✅ ${testName}`);
    } else {
        failedCount++;
        const msg = `❌ ${testName}${details ? ` → ${details}` : ''}`;
        failureMessages.push(msg);
        console.log(`  ${msg}`);
    }
};

const api = axios.create({
    baseURL: API_BASE_URL,
    validateStatus: () => true, // Don't throw on HTTP error status codes
});

async function runSubAdminPermissionTests() {
    console.log('═════════════════════════════════════════════════════════════════');
    console.log('  DWELLMART — SUB ADMIN MANAGEMENT & PERMISSION SYSTEM TEST SUITE');
    console.log('═════════════════════════════════════════════════════════════════');

    // ─── STEP 0: SERVER CONNECTIVITY ──────────────────────────────────────────
    logSection('STEP 0 — SERVER CONNECTIVITY');
    try {
        const res = await api.get('/admin/auth/profile');
        assert(res.status === 401, 'Backend server is running at ' + API_BASE_URL, `Status: ${res.status}`);
    } catch (e) {
        assert(false, 'Backend server is reachable', e.message);
        console.log('\n⚠️  Backend server must be running. Exiting test.');
        process.exit(1);
    }

    // ─── STEP 1: SUPER ADMIN LOGIN ────────────────────────────────────────────
    logSection('STEP 1 — SUPER ADMIN AUTHENTICATION');
    const superAdminCredentials = {
        email: 'admin@admin.com',
        password: 'admin123',
    };

    let superAdminToken = null;
    let superAdminId = null;

    const superLoginRes = await api.post('/admin/auth/login', superAdminCredentials);
    if (superLoginRes.status === 200 && superLoginRes.data?.data?.accessToken) {
        superAdminToken = superLoginRes.data.data.accessToken;
        superAdminId = superLoginRes.data.data.admin.id || superLoginRes.data.data.admin._id;
        assert(true, 'Super Admin login successful at /admin/login');
        assert(
            superLoginRes.data.data.admin.role === 'superadmin' || superLoginRes.data.data.admin.role === 'admin',
            'Super Admin role present in response payload'
        );
        assert(
            Array.isArray(superLoginRes.data.data.sidebarModules),
            'sidebarModules array present in login response payload'
        );
    } else {
        assert(false, 'Super Admin login', `Status ${superLoginRes.status}: ${JSON.stringify(superLoginRes.data)}`);
        console.log('\n⚠️  Ensure test user support.test.admin@dwell.com exists (run node tests/seed-test-users.js).');
        process.exit(1);
    }

    const superHeaders = { Authorization: `Bearer ${superAdminToken}` };

    // Update superAdmin role to 'superadmin' directly if not already set
    await mongoose.connect(process.env.MONGO_URI);
    const AdminModel = (await import('../src/models/Admin.model.js')).default;
    await AdminModel.updateOne({ _id: superAdminId }, { $set: { role: 'superadmin', status: 'active', isActive: true } });
    await mongoose.disconnect();

    // ─── STEP 2: CREATE SUB ADMIN ─────────────────────────────────────────────
    logSection('STEP 2 — CREATE SUB ADMIN (Super Admin Only)');

    const testSubAdminEmail = `test.subadmin.${Date.now()}@dwell.com`;
    const testSubAdminPassword = 'SubAdmin@123';
    let createdSubAdminId = null;

    const createPayload = {
        name: 'Order & Support Executive',
        email: testSubAdminEmail,
        phone: '9876543210',
        password: testSubAdminPassword,
        confirmPassword: testSubAdminPassword,
        role: 'subadmin',
        status: 'active',
        permissions: ['dashboard.view', 'orders.view', 'orders.update', 'support.view', 'support.reply'],
    };

    const createRes = await api.post('/admin/subadmins', createPayload, { headers: superHeaders });
    assert(createRes.status === 201, 'Super Admin creates Sub Admin → 201 Created', `Status: ${createRes.status}`);

    if (createRes.status === 201) {
        createdSubAdminId = createRes.data?.data?._id || createRes.data?.data?.id;
        assert(createRes.data?.data?.email === testSubAdminEmail, 'Created Sub Admin email matches');
        assert(createRes.data?.data?.role === 'subadmin', 'Role is set to subadmin');
        assert(
            Array.isArray(createRes.data?.data?.permissions) &&
                createRes.data.data.permissions.includes('orders.view'),
            'Assigned permissions include orders.view'
        );
    }

    // ─── STEP 3: SUB ADMIN LOGIN ──────────────────────────────────────────────
    logSection('STEP 3 — SUB ADMIN LOGIN (Single /admin/login Page)');

    let subAdminToken = null;
    const subLoginRes = await api.post('/admin/auth/login', {
        email: testSubAdminEmail,
        password: testSubAdminPassword,
    });

    assert(subLoginRes.status === 200, 'Sub Admin login at /admin/login → 200 OK');
    if (subLoginRes.status === 200) {
        subAdminToken = subLoginRes.data?.data?.accessToken;
        const adminData = subLoginRes.data?.data?.admin || {};
        assert(adminData.role === 'subadmin', 'Sub Admin role in response');
        assert(Array.isArray(adminData.permissions), 'Permissions array returned');
        assert(Array.isArray(adminData.sidebarModules), 'sidebarModules list returned');
        assert(
            adminData.sidebarModules.includes('orders') && adminData.sidebarModules.includes('support'),
            'sidebarModules correctly includes permitted modules (orders, support)'
        );
        assert(
            !adminData.sidebarModules.includes('subadmins'),
            'sidebarModules strictly excludes subadmins management'
        );
    }

    const subHeaders = { Authorization: `Bearer ${subAdminToken}` };

    // ─── STEP 4: ROUTE & API PERMISSION ENFORCEMENT ───────────────────────────
    logSection('STEP 4 — ROUTE & API PERMISSION ENFORCEMENT');

    // Authorized API call (orders.view is assigned)
    const ordersRes = await api.get('/admin/orders', { headers: subHeaders });
    assert(ordersRes.status === 200, 'Sub Admin calls authorized GET /api/admin/orders → 200 OK');

    // Authorized API call (support.view is assigned)
    const supportRes = await api.get('/admin/support/tickets', { headers: subHeaders });
    assert(supportRes.status === 200, 'Sub Admin calls authorized GET /api/admin/support/tickets → 200 OK');

    // Unauthorized API call (products.view is NOT assigned)
    const productsRes = await api.get('/admin/products', { headers: subHeaders });
    assert(
        productsRes.status === 403,
        'Sub Admin calls unauthorized GET /api/admin/products → 403 Forbidden',
        `Status: ${productsRes.status}`
    );

    // Unauthorized API call (subadmin management endpoint)
    const subadminsApiRes = await api.get('/admin/subadmins', { headers: subHeaders });
    assert(
        subadminsApiRes.status === 403,
        'Sub Admin attempts GET /api/admin/subadmins → 403 Forbidden (Super Admin Only)',
        `Status: ${subadminsApiRes.status}`
    );

    // ─── STEP 5: EDIT SUB ADMIN & DYNAMIC PERMISSIONS ─────────────────────────
    logSection('STEP 5 — EDIT SUB ADMIN & DYNAMIC PERMISSIONS');

    // Super Admin updates Sub Admin permissions (removes orders.view, adds products.view)
    const updatePermsRes = await api.put(
        `/admin/subadmins/${createdSubAdminId}`,
        {
            name: 'Updated Order & Product Executive',
            status: 'active',
            permissions: ['dashboard.view', 'products.view', 'products.add'],
        },
        { headers: superHeaders }
    );
    assert(updatePermsRes.status === 200, 'Super Admin updates Sub Admin permissions → 200 OK');

    // Re-verify permission checks with updated permissions
    const reProductsRes = await api.get('/admin/products', { headers: subHeaders });
    assert(
        reProductsRes.status === 200,
        'Sub Admin with new products.view permission calls GET /api/admin/products → 200 OK'
    );

    const reOrdersRes = await api.get('/admin/orders', { headers: subHeaders });
    assert(
        reOrdersRes.status === 403,
        'Sub Admin with revoked orders.view permission calls GET /api/admin/orders → 403 Forbidden'
    );

    // ─── STEP 6: ACCOUNT STATUS TOGGLE (ACTIVE / INACTIVE) ────────────────────
    logSection('STEP 6 — ACCOUNT STATUS TOGGLE (ACTIVE / INACTIVE)');

    // Super Admin disables Sub Admin account
    const toggleOffRes = await api.patch(
        `/admin/subadmins/${createdSubAdminId}/status`,
        { status: 'inactive' },
        { headers: superHeaders }
    );
    assert(toggleOffRes.status === 200, 'Super Admin toggles Sub Admin status to inactive → 200 OK');

    // Inactive Sub Admin attempts login
    const disabledLoginRes = await api.post('/admin/auth/login', {
        email: testSubAdminEmail,
        password: testSubAdminPassword,
    });
    assert(
        disabledLoginRes.status === 403,
        'Inactive Sub Admin login → 403 Forbidden ("Your account has been disabled")',
        `Status: ${disabledLoginRes.status}`
    );

    // Super Admin re-enables Sub Admin account
    const toggleOnRes = await api.patch(
        `/admin/subadmins/${createdSubAdminId}/status`,
        { status: 'active' },
        { headers: superHeaders }
    );
    assert(toggleOnRes.status === 200, 'Super Admin toggles Sub Admin status to active → 200 OK');

    // ─── STEP 7: RESET PASSWORD ───────────────────────────────────────────────
    logSection('STEP 7 — RESET PASSWORD');

    const newSubPassword = 'NewSecretPassword@123';
    const resetRes = await api.post(
        `/admin/subadmins/${createdSubAdminId}/reset-password`,
        { password: newSubPassword, confirmPassword: newSubPassword },
        { headers: superHeaders }
    );
    assert(resetRes.status === 200, 'Super Admin resets Sub Admin password → 200 OK');

    // Login with new password
    const newPassLoginRes = await api.post('/admin/auth/login', {
        email: testSubAdminEmail,
        password: newSubPassword,
    });
    assert(newPassLoginRes.status === 200, 'Sub Admin login with new password → 200 OK');

    // ─── STEP 8: SELF-ACTION & SUPER ADMIN PROTECTION ────────────────────────
    logSection('STEP 8 — SELF-ACTION & SUPER ADMIN PROTECTION');

    // Attempt to create a second Super Admin
    const secondSuperRes = await api.post(
        '/admin/subadmins',
        {
            name: 'Imposter Super Admin',
            email: 'imposter.super@dwell.com',
            password: 'Password@123',
            confirmPassword: 'Password@123',
            role: 'superadmin',
        },
        { headers: superHeaders }
    );
    assert(
        secondSuperRes.status === 400,
        'Attempt to create second Super Admin → 400 Bad Request ("Only one Super Admin account is allowed")',
        `Status: ${secondSuperRes.status}`
    );

    // Attempt to reset Super Admin password via subadmin endpoint
    const resetSuperPassRes = await api.post(
        `/admin/subadmins/${superAdminId}/reset-password`,
        { password: 'HackPassword@123', confirmPassword: 'HackPassword@123' },
        { headers: superHeaders }
    );
    assert(
        resetSuperPassRes.status === 400 || resetSuperPassRes.status === 403,
        'Attempt to reset Super Admin password via subadmin endpoint → Rejected',
        `Status: ${resetSuperPassRes.status}`
    );

    // Super Admin attempts to disable self
    const selfDisableRes = await api.patch(
        `/admin/subadmins/${superAdminId}/status`,
        { status: 'inactive' },
        { headers: superHeaders }
    );
    assert(
        selfDisableRes.status === 400 || selfDisableRes.status === 403,
        'Super Admin self-disable attempt → Rejected',
        `Status: ${selfDisableRes.status}`
    );

    // Super Admin attempts to delete self
    const selfDeleteRes = await api.delete(`/admin/subadmins/${superAdminId}`, { headers: superHeaders });
    assert(
        selfDeleteRes.status === 400 || selfDeleteRes.status === 403,
        'Super Admin self-delete attempt → Rejected',
        `Status: ${selfDeleteRes.status}`
    );

    // ─── STEP 9: DELETE SUB ADMIN ─────────────────────────────────────────────
    logSection('STEP 9 — DELETE SUB ADMIN');

    const deleteSubRes = await api.delete(`/admin/subadmins/${createdSubAdminId}`, { headers: superHeaders });
    assert(deleteSubRes.status === 200, 'Super Admin deletes Sub Admin → 200 OK');

    // Deleted Sub Admin attempts login
    const deletedLoginRes = await api.post('/admin/auth/login', {
        email: testSubAdminEmail,
        password: newSubPassword,
    });
    assert(
        deletedLoginRes.status === 401,
        'Deleted Sub Admin login attempt → 401 Unauthorized',
        `Status: ${deletedLoginRes.status}`
    );

    // ─── FINAL REPORT ─────────────────────────────────────────────────────────
    console.log('\n═════════════════════════════════════════════════════════════════');
    console.log('  SUB ADMIN MANAGEMENT & PERMISSIONS — TEST REPORT');
    console.log('═════════════════════════════════════════════════════════════════');
    console.log(`  ✅  Passed : ${passedCount}`);
    console.log(`  ❌  Failed : ${failedCount}`);
    console.log(`  📋  Total  : ${passedCount + failedCount}`);

    if (failedCount > 0) {
        console.log('\n  FAILURES:');
        failureMessages.forEach((m) => console.log(`  ${m}`));
        process.exit(1);
    } else {
        console.log('\n  🎉  ALL SUB ADMIN & PERMISSION TESTS PASSED SUCCESSFULLY!');
        process.exit(0);
    }
}

runSubAdminPermissionTests();
