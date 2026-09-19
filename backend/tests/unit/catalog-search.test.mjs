import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
    escapeRegex,
    buildCatalogSearchFilter,
    applyCatalogSearchFilter,
} from '../../src/utils/catalogSearch.js';

test('escapeRegex: escapes special regex characters', () => {
    assert.equal(escapeRegex('hello (world)+test'), 'hello \\(world\\)\\+test');
    assert.equal(escapeRegex('price [10-20]*'), 'price \\[10\\-20\\]\\*');
    assert.equal(escapeRegex(''), '');
    assert.equal(escapeRegex(null), '');
});

test('buildCatalogSearchFilter: returns null for empty or whitespace-only search', () => {
    assert.equal(buildCatalogSearchFilter(''), null);
    assert.equal(buildCatalogSearchFilter('   '), null);
    assert.equal(buildCatalogSearchFilter(null), null);
    assert.equal(buildCatalogSearchFilter(undefined), null);
});

test('buildCatalogSearchFilter: recognizes 24-character hex ObjectId', () => {
    const objectIdStr = '6aa92a7ad56b0a0836324728';
    const filter = buildCatalogSearchFilter(objectIdStr);
    assert.ok(filter.$or, 'Expected $or array for ObjectId search');
    assert.equal(filter.$or.length, 3);
    assert.deepEqual(filter.$or[0]._id, new mongoose.Types.ObjectId(objectIdStr));
});

test('buildCatalogSearchFilter: single token search', () => {
    const filter = buildCatalogSearchFilter('foundation');
    assert.ok(filter.$or, 'Expected $or array for single token search');
    assert.equal(filter.$or.length, 3);
    assert.ok(filter.$or[0].name instanceof RegExp);
    assert.ok(filter.$or[0].name.test('Liquid Foundation'));
    assert.ok(filter.$or[1].sku instanceof RegExp);
    assert.ok(filter.$or[2].tags instanceof RegExp);
});

test('buildCatalogSearchFilter: multi-token search with partial words and punctuation', () => {
    const filter = buildCatalogSearchFilter(
        'Perfecting Hydero glow seamless skin base foundation+concealer (shade- Fresh Beige)'
    );
    assert.ok(filter.$and, 'Expected $and array for multi-token search');
    assert.ok(filter.$and.length > 5);

    // Verify each condition matches against the target string
    const sampleTitle = 'Perfecting Hydero glow seamless skin base foundation+concealer (shade- Fresh Beige)';
    for (const condition of filter.$and) {
        const nameRegex = condition.$or[0].name;
        assert.ok(nameRegex.test(sampleTitle), `Expected regex ${nameRegex} to match "${sampleTitle}"`);
    }
});

test('applyCatalogSearchFilter: merges into empty filter', () => {
    const filter = {};
    applyCatalogSearchFilter(filter, 'foundation');
    assert.ok(filter.$or);
});

test('applyCatalogSearchFilter: merges with existing category and status conditions', () => {
    const filter = { categoryId: 'cat123', stock: 'in_stock', isActive: { $ne: false } };
    applyCatalogSearchFilter(filter, 'foundation');
    assert.equal(filter.categoryId, 'cat123');
    assert.equal(filter.stock, 'in_stock');
    assert.deepEqual(filter.isActive, { $ne: false });
    assert.ok(filter.$or);
});

test('applyCatalogSearchFilter: safely handles existing $or in filter', () => {
    const filter = { $or: [{ status: 'active' }, { isFeatured: true }] };
    applyCatalogSearchFilter(filter, 'foundation');
    assert.ok(filter.$and);
    assert.equal(filter.$or, undefined);
    assert.equal(filter.$and.length, 2);
});

test('applyCatalogSearchFilter: safely appends to existing $and in filter', () => {
    const filter = { $and: [{ isDeleted: false }] };
    applyCatalogSearchFilter(filter, 'foundation concealer');
    assert.equal(filter.$and.length, 2);
});
