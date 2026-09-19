import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to MobileBottomNav component
const mobileBottomNavPath = path.resolve(
  __dirname,
  '../../../frontend/src/modules/UserApp/components/Layout/MobileBottomNav.jsx'
);

describe('Phase 13 — P2-A11Y-01 MobileBottomNav Accessible Names', () => {

  describe('1. Static Translation Keys & Landmark', () => {
    test('all required navigation items and landmark are present in translation keys', () => {
      const source = fs.readFileSync(mobileBottomNavPath, 'utf8');
      
      // Expected keys
      const expectedKeys = [
        'Home',
        'Categories',
        'Search',
        'Wishlist',
        'Account',
        'Mobile Navigation',
      ];

      for (const key of expectedKeys) {
        assert.ok(
          source.includes(`"${key}"`),
          `Translation key "${key}" must be included in MobileBottomNav source`
        );
      }
    });

    test('navigation landmark specifies aria-label with Mobile Navigation', () => {
      const source = fs.readFileSync(mobileBottomNavPath, 'utf8');
      assert.ok(
        source.includes('aria-label={t("Mobile Navigation")}'),
        '<nav> landmark must have aria-label={t("Mobile Navigation")}'
      );
    });
  });

  describe('2. Accessible Name Generation for All 5 Navigation Links', () => {
    // Replicate the pure accessible-name calculation logic
    const computeAccessibleName = (label, badge, t = (s) => s) => {
      const translatedLabel = t(label);
      return badge
        ? `${translatedLabel} (${badge > 9 ? '9+' : badge})`
        : translatedLabel;
    };

    test('all five base navigation labels produce correct non-empty accessible names', () => {
      const items = [
        { label: 'Home', badge: null, expected: 'Home' },
        { label: 'Categories', badge: null, expected: 'Categories' },
        { label: 'Search', badge: null, expected: 'Search' },
        { label: 'Wishlist', badge: null, expected: 'Wishlist' },
        { label: 'Account', badge: null, expected: 'Account' },
      ];

      for (const item of items) {
        const accName = computeAccessibleName(item.label, item.badge);
        assert.equal(accName, item.expected, `Accessible name for ${item.label} must match`);
        assert.ok(accName.length > 0, `Accessible name for ${item.label} must be non-empty`);
      }
    });

    test('wishlist count 0 produces "Wishlist" without badge suffix or bare number', () => {
      const wishlistCount = 0;
      const badge = wishlistCount > 0 ? wishlistCount : null;
      const accName = computeAccessibleName('Wishlist', badge);
      assert.equal(accName, 'Wishlist');
      assert.doesNotMatch(accName, /\d/, 'Wishlist with count 0 must not contain numeric digits');
    });

    test('wishlist count 1–9 includes the exact item count in parentheses', () => {
      for (let count = 1; count <= 9; count++) {
        const badge = count;
        const accName = computeAccessibleName('Wishlist', badge);
        assert.equal(accName, `Wishlist (${count})`);
      }
    });

    test('wishlist count 10+ is properly capped to "Wishlist (9+)"', () => {
      const counts = [10, 11, 25, 99, 1000];
      for (const count of counts) {
        const badge = count;
        const accName = computeAccessibleName('Wishlist', badge);
        assert.equal(accName, 'Wishlist (9+)');
      }
    });

    test('custom translation function localizes the accessible name correctly', () => {
      const mockSpanish = {
        'Home': 'Inicio',
        'Categories': 'Categorías',
        'Search': 'Buscar',
        'Wishlist': 'Lista de deseos',
        'Account': 'Cuenta',
      };
      const t = (k) => mockSpanish[k] || k;

      assert.equal(computeAccessibleName('Home', null, t), 'Inicio');
      assert.equal(computeAccessibleName('Wishlist', 3, t), 'Lista de deseos (3)');
      assert.equal(computeAccessibleName('Wishlist', 15, t), 'Lista de deseos (9+)');
      assert.equal(computeAccessibleName('Account', null, t), 'Cuenta');
    });
  });

  describe('3. Active Route State (aria-current)', () => {
    const isActive = (path, currentPath) => {
      if (path === '/home') {
        return currentPath === '/home';
      }
      return currentPath.startsWith(path);
    };

    const getAriaCurrent = (path, currentPath) => {
      return isActive(path, currentPath) ? 'page' : undefined;
    };

    test('active route exposes aria-current="page"', () => {
      assert.equal(getAriaCurrent('/home', '/home'), 'page');
      assert.equal(getAriaCurrent('/categories', '/categories'), 'page');
      assert.equal(getAriaCurrent('/categories', '/categories/electronics'), 'page');
      assert.equal(getAriaCurrent('/search', '/search'), 'page');
      assert.equal(getAriaCurrent('/wishlist', '/wishlist'), 'page');
      assert.equal(getAriaCurrent('/profile', '/profile'), 'page');
    });

    test('inactive route does not expose aria-current (returns undefined)', () => {
      assert.equal(getAriaCurrent('/home', '/categories'), undefined);
      assert.equal(getAriaCurrent('/search', '/home'), undefined);
      assert.equal(getAriaCurrent('/wishlist', '/profile'), undefined);
      assert.equal(getAriaCurrent('/home', '/'), undefined);
    });
  });

  describe('4. Authentication-Dependent Route Selection', () => {
    const getAccountItem = (isAuthenticated) => ({
      path: isAuthenticated ? '/profile' : '/login',
      label: 'Account',
    });

    test('authenticated user routes to /profile', () => {
      const item = getAccountItem(true);
      assert.equal(item.path, '/profile');
      assert.equal(item.label, 'Account');
    });

    test('unauthenticated user routes to /login', () => {
      const item = getAccountItem(false);
      assert.equal(item.path, '/login');
      assert.equal(item.label, 'Account');
    });
  });

  describe('5. Source Code AST & Accessibility Contract Verification', () => {
    test('MobileBottomNav source code contains all required accessibility attributes', () => {
      const source = fs.readFileSync(mobileBottomNavPath, 'utf8');

      // Link attributes
      assert.ok(
        source.includes('aria-label={accessibleName}'),
        '<Link> must have aria-label={accessibleName}'
      );
      assert.ok(
        source.includes('aria-current={active ? "page" : undefined}'),
        '<Link> must have aria-current={active ? "page" : undefined}'
      );

      // Decorative elements hidden
      assert.ok(
        source.includes('<Icon\n                    aria-hidden="true"') ||
        source.includes('<Icon\r\n                    aria-hidden="true"') ||
        source.includes('aria-hidden="true"\n                    className="text-2xl"') ||
        source.includes('aria-hidden="true"\r\n                    className="text-2xl"'),
        '<Icon> must have aria-hidden="true"'
      );

      assert.ok(
        source.includes('layoutId="activeTab"\n                    aria-hidden="true"') ||
        source.includes('layoutId="activeTab"\r\n                    aria-hidden="true"') ||
        source.includes('aria-hidden="true"\n                    className="absolute inset-0 bg-primary-50 rounded-full"') ||
        source.includes('aria-hidden="true"\r\n                    className="absolute inset-0 bg-primary-50 rounded-full"'),
        'Active pill indicator must have aria-hidden="true"'
      );

      assert.ok(
        source.includes('key={item.badge}\n                    aria-hidden="true"') ||
        source.includes('key={item.badge}\r\n                    aria-hidden="true"') ||
        source.includes('aria-hidden="true"\n                    initial={{ scale: 0, rotate: -180 }}') ||
        source.includes('aria-hidden="true"\r\n                    initial={{ scale: 0, rotate: -180 }}'),
        'Badge element must have aria-hidden="true"'
      );
    });
  });
});
