import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { updateVendorEmailSchema } from '../../src/modules/admin/validators/vendor.validator.js';
import { updateProfileSchema as userUpdateProfileSchema } from '../../src/modules/user/validators/auth.validator.js';
import { updateProductSchema } from '../../src/modules/admin/validators/catalog.validator.js';

test('Feature 1 & 2: Admin Product Edit Validation', async (t) => {
    await t.test('accepts valid categoryId and product name', () => {
        const dummyCategoryId = new mongoose.Types.ObjectId().toString();
        const payload = {
            name: 'Updated Cotton T-Shirt',
            categoryId: dummyCategoryId,
        };
        const { error, value } = updateProductSchema.validate(payload);
        assert.equal(error, undefined);
        assert.equal(value.name, 'Updated Cotton T-Shirt');
        assert.equal(String(value.categoryId), dummyCategoryId);
    });

    await t.test('rejects product name shorter than 2 characters', () => {
        const payload = { name: 'A' };
        const { error } = updateProductSchema.validate(payload);
        assert.ok(error);
        assert.match(error.message, /length must be at least 2/i);
    });

    await t.test('rejects invalid categoryId format', () => {
        const payload = { categoryId: 'not-a-valid-object-id' };
        const { error } = updateProductSchema.validate(payload);
        assert.ok(error);
    });
});

test('Feature 3: Admin Vendor Email Update Validation', async (t) => {
    await t.test('accepts valid vendor email and normalizes it', () => {
        const payload = { email: '  Vendor.Support@Example.COM  ' };
        const { error, value } = updateVendorEmailSchema.validate(payload);
        assert.equal(error, undefined);
        assert.equal(value.email, 'vendor.support@example.com');
    });

    await t.test('rejects invalid email format', () => {
        const payload = { email: 'not-an-email' };
        const { error } = updateVendorEmailSchema.validate(payload);
        assert.ok(error);
        assert.match(error.message, /valid email/i);
    });

    await t.test('rejects empty email', () => {
        const payload = { email: '' };
        const { error } = updateVendorEmailSchema.validate(payload);
        assert.ok(error);
    });
});

test('Feature 4: User Profile Email Update Validation', async (t) => {
    await t.test('accepts user profile with name, phone and valid email', () => {
        const payload = {
            name: 'Alice Johnson',
            email: 'Alice.J@example.org',
            phone: '+919876543210',
        };
        const { error, value } = userUpdateProfileSchema.validate(payload);
        assert.equal(error, undefined);
        assert.equal(value.name, 'Alice Johnson');
        assert.equal(value.email, 'alice.j@example.org');
    });

    await t.test('allows profile update without email (optional)', () => {
        const payload = {
            name: 'Alice Johnson',
            phone: '+919876543210',
        };
        const { error, value } = userUpdateProfileSchema.validate(payload);
        assert.equal(error, undefined);
        assert.equal(value.name, 'Alice Johnson');
    });

    await t.test('rejects malformed email in user profile', () => {
        const payload = {
            name: 'Alice Johnson',
            email: 'bad-email-format',
        };
        const { error } = userUpdateProfileSchema.validate(payload);
        assert.ok(error);
    });
});
