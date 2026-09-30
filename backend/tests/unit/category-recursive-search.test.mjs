import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogFilter } from '../../src/services/catalogQuery.service.js';

test('buildCatalogFilter: includes multi-tier categoryIds when categoryIds array is provided', () => {
    const rootId = 'cat_root_fashion';
    const l2Ids = ['cat_l2_mens', 'cat_l2_womens'];
    const l3Ids = ['cat_l3_tshirts', 'cat_l3_jeans', 'cat_l3_dresses'];
    const allDescendantIds = [rootId, ...l2Ids, ...l3Ids];

    const filter = buildCatalogFilter({
        experience: 'marketplace',
        categoryIds: allDescendantIds,
    });

    assert.deepEqual(filter.categoryId, { $in: allDescendantIds });
    assert.equal(filter.isActive, true);
    assert.deepEqual(filter.retailEnabled, { $ne: false });
});

test('buildCatalogFilter: single category filter falls back to direct categoryId matching', () => {
    const filter = buildCatalogFilter({
        experience: 'marketplace',
        category: 'cat_l3_tshirts',
    });

    assert.equal(filter.categoryId, 'cat_l3_tshirts');
});

test('buildCatalogFilter: Quick Commerce experience checks both quickCommerceCategoryId and categoryId', () => {
    const allCategoryIds = ['qc_cat_1', 'qc_cat_2', 'qc_cat_3'];
    const filter = buildCatalogFilter({
        experience: 'quick_commerce',
        categoryIds: allCategoryIds,
    });

    assert.equal(filter.quickCommerceEnabled, true);
    assert.ok(Array.isArray(filter.$or));
    assert.deepEqual(filter.$or, [
        { quickCommerceCategoryId: { $in: allCategoryIds } },
        { categoryId: { $in: allCategoryIds } },
    ]);
});
