import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const userLoginPath = path.resolve(
  __dirname,
  '../../../frontend/src/modules/UserApp/pages/Login.jsx'
);

describe('Phase 18 — P3-UI-01 UserApp Login Forgot Password Typo Remediation', () => {

  test('UserApp Login.jsx contains no occurrences of "Forget password"', () => {
    const source = fs.readFileSync(userLoginPath, 'utf8');
    const hasTypo = /forget\s+password/i.test(source);
    assert.strictEqual(
      hasTypo,
      false,
      'UserApp Login.jsx must not contain the typo "Forget password"'
    );
  });

  test('UserApp Login.jsx has "Forgot password?" in static translation keys', () => {
    const source = fs.readFileSync(userLoginPath, 'utf8');
    assert.ok(
      source.includes("'Forgot password?'"),
      "Static translation array must include 'Forgot password?'"
    );
  });

  test('UserApp Login.jsx renders {t(\'Forgot password?\')} inside link to /forgot-password', () => {
    const source = fs.readFileSync(userLoginPath, 'utf8');
    assert.ok(
      source.includes("to=\"/forgot-password\""),
      'Link destination must remain to="/forgot-password"'
    );
    assert.ok(
      source.includes("{t('Forgot password?')}"),
      "Link must render {t('Forgot password?')}"
    );
  });

  test('UserApp Login.jsx maintains intact styling and accessibility attributes for the link', () => {
    const source = fs.readFileSync(userLoginPath, 'utf8');
    const linkMatch = source.match(
      /<Link\s+to="\/forgot-password"[^>]*>([\s\S]*?)<\/Link>/
    );
    assert.ok(linkMatch, '<Link to="/forgot-password"> element must exist');
    assert.ok(
      linkMatch[1].includes("{t('Forgot password?')}"),
      'Link text inside Link element must contain {t(\'Forgot password?\')}'
    );
    assert.ok(
      linkMatch[0].includes('text-amber-400'),
      'Link styling class must be preserved'
    );
  });
});
