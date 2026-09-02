import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { changePasswordSchema } from '../../src/modules/admin/validators/auth.validator.js';

describe('Admin Change Password Schema Validation', () => {
  it('validates a correct current and new password payload', () => {
    const { error, value } = changePasswordSchema.validate({
      currentPassword: 'oldPassword123',
      newPassword: 'newSecurePassword456',
    });
    assert.equal(error, undefined);
    assert.equal(value.currentPassword, 'oldPassword123');
    assert.equal(value.newPassword, 'newSecurePassword456');
  });

  it('rejects missing current password', () => {
    const { error } = changePasswordSchema.validate({
      newPassword: 'newSecurePassword456',
    });
    assert.ok(error);
    assert.match(error.message, /Current password is required/);
  });

  it('rejects missing new password', () => {
    const { error } = changePasswordSchema.validate({
      currentPassword: 'oldPassword123',
    });
    assert.ok(error);
    assert.match(error.message, /New password is required/);
  });

  it('rejects short new password (< 6 characters)', () => {
    const { error } = changePasswordSchema.validate({
      currentPassword: 'oldPassword123',
      newPassword: '12345',
    });
    assert.ok(error);
    assert.match(error.message, /at least 6 characters/);
  });

  it('rejects empty strings', () => {
    const { error } = changePasswordSchema.validate({
      currentPassword: '',
      newPassword: '',
    });
    assert.ok(error);
  });
});
