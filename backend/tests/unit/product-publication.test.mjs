import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import Product from '../../src/models/Product.model.js';
import { buildCatalogFilter } from '../../src/services/catalogQuery.service.js';
import { assertAdminPublicationStatus } from '../../src/services/productPublication.service.js';
import {
    PRODUCT_PUBLICATION_STATUS,
    PRODUCT_PUBLICATION_STATUSES,
} from '../../src/constants/productPublication.js';

const source = (path) => readFile(new URL(`../../src/${path}`, import.meta.url), 'utf8');

test('new products default to PENDING_REVIEW', () => {
    const product = new Product({
        name: 'Pending product',
        slug: `pending-${Date.now()}`,
        price: 10,
        categoryId: new mongoose.Types.ObjectId(),
        vendorId: new mongoose.Types.ObjectId(),
    });
    assert.equal(product.publicationStatus, PRODUCT_PUBLICATION_STATUS.PENDING_REVIEW);
    assert.equal(product.validateSync(), undefined);
});

test('publication status exposes the standardized four-state workflow', () => {
    assert.deepEqual(PRODUCT_PUBLICATION_STATUSES, [
        'PENDING_REVIEW', 'LIVE', 'OFFLINE', 'REJECTED',
    ]);
});

test('customer catalog filters require LIVE and exclude deleted products', () => {
    const filter = buildCatalogFilter({ experience: 'marketplace' });
    assert.equal(filter.publicationStatus, 'LIVE');
    assert.deepEqual(filter.isDeleted, { $ne: true });
    assert.equal(filter.isActive, true);
});

test('admin publication API accepts LIVE and OFFLINE only', () => {
    assert.equal(assertAdminPublicationStatus('live'), 'LIVE');
    assert.equal(assertAdminPublicationStatus('OFFLINE'), 'OFFLINE');
    assert.throws(() => assertAdminPublicationStatus('PENDING_REVIEW'), /LIVE or OFFLINE/);
    assert.throws(() => assertAdminPublicationStatus('invalid'), /LIVE or OFFLINE/);
});

test('vendor single upload forces pending review and strips admin-owned fields', async () => {
    const controller = await source('modules/vendor/controllers/product.controller.js');
    assert.match(controller, /stripAdminPublicationFields\(rest\)/);
    assert.match(controller, /publicationStatus:\s*'PENDING_REVIEW'/);
    assert.match(controller, /stripAdminPublicationFields\(req\.body\)/);
});

test('vendor bulk inserts and updates are forced to pending review', async () => {
    const bulk = await source('services/bulkUpload.service.js');
    assert.match(bulk, /uploaderRole === 'vendor'/);
    assert.match(bulk, /publicationStatus:\s*'PENDING_REVIEW'/);
    assert.match(bulk, /notifyAdminsOfVendorProducts/);
});

test('bulk upload emits one aggregated review notification after completion', async () => {
    const bulk = await source('services/bulkUpload.service.js');
    const completion = bulk.indexOf("status: 'completed'");
    const notification = bulk.lastIndexOf('notifyAdminsOfVendorProducts');
    assert.ok(completion >= 0 && notification > completion);
    assert.match(bulk, /bulk:\s*true/);
});

test('single and bulk admin endpoints require products.edit', async () => {
    const routes = await source('modules/admin/routes/admin.routes.js');
    assert.match(routes, /bulk-publication-status'.*PERMISSIONS\.PRODUCTS_EDIT/);
    assert.match(routes, /:id\/publication-status'.*PERMISSIONS\.PRODUCTS_EDIT/);
});

test('public product detail is queried with LIVE status', async () => {
    const routes = await source('routes/public.routes.js');
    assert.match(routes, /_id:\s*req\.params\.id,[\s\S]{0,120}publicationStatus:\s*'LIVE'/);
});

test('migration preserves existing visible products as LIVE', async () => {
    const migration = await source('migrations/0017_product_publication_status.js');
    assert.match(migration, /isActive:\s*\{ \$ne: false \}/);
    assert.match(migration, /isVisible:\s*\{ \$ne: false \}/);
    assert.match(migration, /publicationStatus:\s*'LIVE'/);
});

