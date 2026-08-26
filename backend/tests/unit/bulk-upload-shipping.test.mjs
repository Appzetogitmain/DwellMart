/**
 * Bulk upload — shipping columns.
 *
 * These columns were already in the template and already read into the
 * validated row, but were NEVER written to the product: every weight a vendor
 * typed into a spreadsheet was silently discarded. Now that they persist, a
 * malformed value has to be reported on its row rather than dropped.
 *
 * The most important assertion in this file is the backward-compatibility one:
 * every spreadsheet currently in circulation has these columns blank, and none
 * of them may start failing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseShippingColumns } from '../../src/services/bulkUpload.service.js';

const parse = (overrides = {}) => parseShippingColumns({
    weight: '', weightUnitRaw: '', length: '', width: '', height: '',
    dimensionUnitRaw: '', combinedDims: '', ...overrides,
});

// ─── Backward compatibility ────────────────────────────────────────────────

test('An old spreadsheet with blank shipping columns imports cleanly', () => {
    const result = parse();
    assert.deepEqual(result.errors, [], 'a blank column is not an error');
    assert.equal(result.shipping, null, 'and produces no shipping block to write');
});

test('Blank columns never overwrite existing product measurements', () => {
    // `null` is what the write sites branch on: no block, no write, so a
    // re-import of an old sheet cannot erase a weight entered in the form.
    assert.equal(parse().shipping, null);
});

// ─── Happy paths ───────────────────────────────────────────────────────────

test('Kilograms and centimetres are stored as entered', () => {
    const { shipping, errors } = parse({
        weight: '2.4', weightUnitRaw: 'kg',
        length: '30', width: '20', height: '15', dimensionUnitRaw: 'cm',
    });
    assert.deepEqual(errors, []);
    assert.equal(shipping.weight, 2.4);
    assert.equal(shipping.weightUnit, 'kg');
    assert.equal(shipping.length, 30);
    assert.equal(shipping.dimensionUnit, 'cm');
});

test('Grams are preserved as grams, not silently converted', () => {
    // Normalisation happens once, at consumption. Storing what the vendor typed
    // means the form and the export show them their own number back.
    const { shipping } = parse({ weight: '250', weightUnitRaw: 'g' });
    assert.equal(shipping.weight, 250);
    assert.equal(shipping.weightUnit, 'g');
});

test('Inches are preserved as inches', () => {
    const { shipping } = parse({
        length: '10', width: '20', height: '30', dimensionUnitRaw: 'in',
    });
    assert.equal(shipping.length, 10);
    assert.equal(shipping.dimensionUnit, 'in');
});

test('Units default sensibly when the column is left blank', () => {
    const { shipping } = parse({ weight: '2', length: '10', width: '10', height: '10' });
    assert.equal(shipping.weightUnit, 'kg');
    assert.equal(shipping.dimensionUnit, 'cm');
});

test('A single LxWxH cell is accepted, as carriers print it', () => {
    const { shipping, errors } = parse({ weight: '1', combinedDims: '30x20x15' });
    assert.deepEqual(errors, []);
    assert.equal(shipping.length, 30);
    assert.equal(shipping.width, 20);
    assert.equal(shipping.height, 15);
});

test('The combined cell tolerates the multiplication sign and spacing', () => {
    for (const value of ['30 x 20 x 15', '30X20X15', '30×20×15']) {
        const { shipping, errors } = parse({ combinedDims: value });
        assert.deepEqual(errors, [], value);
        assert.equal(shipping.length, 30, value);
        assert.equal(shipping.height, 15, value);
    }
});

test('Weight alone is enough — dimensions are optional', () => {
    const { shipping, errors } = parse({ weight: '3', weightUnitRaw: 'kg' });
    assert.deepEqual(errors, []);
    assert.equal(shipping.weight, 3);
    assert.equal(shipping.length, undefined);
});

test('Imported measurements are marked as vendor-supplied', () => {
    // Distinguishes a real spreadsheet entry from a backfilled estimate.
    const { shipping } = parse({ weight: '2', weightUnitRaw: 'kg' });
    assert.equal(shipping.source, 'vendor');
});

// ─── Rejections — reported, never discarded ────────────────────────────────

test('An invalid weight unit is a row error', () => {
    const { shipping, errors } = parse({ weight: '1', weightUnitRaw: 'lbs' });
    assert.equal(shipping, null);
    assert.match(errors[0], /kg or g/i);
});

test('An invalid dimension unit is a row error', () => {
    const { errors } = parse({ length: '1', width: '1', height: '1', dimensionUnitRaw: 'ft' });
    assert.match(errors[0], /cm or in/i);
});

test('A negative value is a row error', () => {
    assert.match(parse({ weight: '-2' }).errors[0], /negative/i);
    assert.match(parse({ length: '-1', width: '1', height: '1' }).errors[0], /negative/i);
});

test('An oversized value is a row error, with the bound named', () => {
    assert.match(parse({ weight: '999999' }).errors[0], /100000/);
    assert.match(parse({ length: '5000', width: '10', height: '10' }).errors[0], /1000/);
});

test('A non-numeric value is a row error, not a silent zero', () => {
    assert.match(parse({ weight: 'heavy' }).errors[0], /must be a number/i);
});

test('A malformed combined dimension cell is a row error', () => {
    assert.match(parse({ combinedDims: '30-20-15' }).errors[0], /LxWxH/i);
    assert.match(parse({ combinedDims: '30x20' }).errors[0], /LxWxH/i);
});

test('A partial dimension set is a row error', () => {
    const { errors } = parse({ length: '30', width: '20' });
    assert.match(errors[0], /all three/i);
});

test('Any error suppresses the whole shipping block', () => {
    // Half-writing a parcel is worse than not writing one: the payload builder
    // would treat the surviving half as a real measurement.
    const { shipping } = parse({ weight: '2', weightUnitRaw: 'lbs', length: '10', width: '10', height: '10' });
    assert.equal(shipping, null);
});

test('Zero is treated as unmeasured rather than as a measurement of nothing', () => {
    const { shipping, errors } = parse({ weight: '0', length: '0', width: '0', height: '0' });
    assert.deepEqual(errors, []);
    assert.equal(shipping, null);
});

test('A partially-filled row keeps whichever half is valid', () => {
    const { shipping, errors } = parse({ weight: '2.5', weightUnitRaw: 'kg' });
    assert.deepEqual(errors, []);
    assert.equal(shipping.weight, 2.5);
    assert.equal(shipping.dimensionUnit, undefined, 'no dimensions were given, so none are invented');
});
