import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Test language utility rules and normalization
const RTL_LANGUAGES = ['ar', 'he', 'ur'];

const isRTL = (lang) => {
    if (!lang) return false;
    return RTL_LANGUAGES.includes(String(lang).toLowerCase());
};

const normalizeLanguageCode = (code) => {
    if (!code) return 'en';
    const clean = String(code).trim().toLowerCase();
    if (clean.startsWith('zh')) return 'zh-CN';
    return clean.split('-')[0] || 'en';
};

describe('Phase 10 — Language Context Logic & RTL Tests', () => {

    test('RTL languages are accurately detected', () => {
        assert.equal(isRTL('ar'), true, 'Arabic must be RTL');
        assert.equal(isRTL('he'), true, 'Hebrew must be RTL');
        assert.equal(isRTL('ur'), true, 'Urdu must be RTL');
        assert.equal(isRTL('AR'), true, 'Case-insensitive Arabic must be RTL');
    });

    test('LTR languages are accurately detected', () => {
        assert.equal(isRTL('en'), false, 'English must be LTR');
        assert.equal(isRTL('hi'), false, 'Hindi must be LTR');
        assert.equal(isRTL('es'), false, 'Spanish must be LTR');
        assert.equal(isRTL('fr'), false, 'French must be LTR');
        assert.equal(isRTL('de'), false, 'German must be LTR');
    });

    test('Language code normalization operates consistently', () => {
        assert.equal(normalizeLanguageCode('en-US'), 'en');
        assert.equal(normalizeLanguageCode('EN'), 'en');
        assert.equal(normalizeLanguageCode('hi-IN'), 'hi');
        assert.equal(normalizeLanguageCode('zh-CN'), 'zh-CN');
        assert.equal(normalizeLanguageCode('zh-TW'), 'zh-CN');
        assert.equal(normalizeLanguageCode(''), 'en');
        assert.equal(normalizeLanguageCode(null), 'en');
    });

    test('Simulated useMemo maintains referential stability when dependencies are unchanged', () => {
        let prevDeps = null;
        let prevResult = null;

        const memoize = (factory, deps) => {
            if (prevDeps && deps.every((d, i) => Object.is(d, prevDeps[i]))) {
                return prevResult;
            }
            prevDeps = deps;
            prevResult = factory();
            return prevResult;
        };

        const changeLanguage = () => {};
        const availableLanguages = { en: { label: 'English' } };

        // Render 1
        const value1 = memoize(
            () => ({
                language: 'en',
                languages: availableLanguages,
                changeLanguage,
                isChangingLanguage: false,
                isRTL: isRTL('en'),
            }),
            ['en', false, changeLanguage]
        );

        // Render 2: Unrelated parent re-render (state unchanged)
        const value2 = memoize(
            () => ({
                language: 'en',
                languages: availableLanguages,
                changeLanguage,
                isChangingLanguage: false,
                isRTL: isRTL('en'),
            }),
            ['en', false, changeLanguage]
        );

        assert.equal(value1, value2, 'Context value reference must be identical across renders when deps do not change');

        // Render 3: Language change triggers new reference
        const value3 = memoize(
            () => ({
                language: 'ar',
                languages: availableLanguages,
                changeLanguage,
                isChangingLanguage: false,
                isRTL: isRTL('ar'),
            }),
            ['ar', false, changeLanguage]
        );

        assert.notEqual(value1, value3, 'Language change must produce new context value');
        assert.equal(value3.isRTL, true, 'Arabic must have isRTL: true');
    });
});
