import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_TRUST_ASSURANCE_DATA,
    ALLOWED_FEATURE_ICONS,
    ALLOWED_STAT_ICONS,
    ALLOWED_COLOR_SCHEMES,
    sanitizePublicTrustAssurance,
    sanitizeString,
    updateTrustAssuranceData,
} from '../../src/services/trustAssurance.service.js';

test('1. Default Trust & Assurance constants have expected structure', () => {
    assert.equal(DEFAULT_TRUST_ASSURANCE_DATA.badge, 'MARKETPLACE TRUST & ASSURANCE');
    assert.equal(DEFAULT_TRUST_ASSURANCE_DATA.title, 'Why Shop With Dwell Mart?');
    assert.equal(DEFAULT_TRUST_ASSURANCE_DATA.isEnabled, true);
    assert.equal(DEFAULT_TRUST_ASSURANCE_DATA.featureCards.length, 4);
    assert.equal(DEFAULT_TRUST_ASSURANCE_DATA.statCards.length, 4);

    assert.equal(DEFAULT_TRUST_ASSURANCE_DATA.featureCards[0].title, 'Free Express Shipping');
    assert.equal(DEFAULT_TRUST_ASSURANCE_DATA.featureCards[0].icon, 'truck');
    assert.equal(DEFAULT_TRUST_ASSURANCE_DATA.featureCards[1].title, '7-Day Easy Returns');
    assert.equal(DEFAULT_TRUST_ASSURANCE_DATA.featureCards[1].icon, 'rotate');
    assert.equal(DEFAULT_TRUST_ASSURANCE_DATA.featureCards[2].title, '100% Secure Payments');
    assert.equal(DEFAULT_TRUST_ASSURANCE_DATA.featureCards[2].icon, 'shield');
    assert.equal(DEFAULT_TRUST_ASSURANCE_DATA.featureCards[3].title, 'Verified Marketplace Sellers');
    assert.equal(DEFAULT_TRUST_ASSURANCE_DATA.featureCards[3].icon, 'check');

    assert.equal(DEFAULT_TRUST_ASSURANCE_DATA.statCards[0].label, 'VERIFIED STORES');
    assert.equal(DEFAULT_TRUST_ASSURANCE_DATA.statCards[0].value, '8+');
    assert.equal(DEFAULT_TRUST_ASSURANCE_DATA.statCards[1].label, 'CURATED PRODUCTS');
    assert.equal(DEFAULT_TRUST_ASSURANCE_DATA.statCards[1].value, '6+');
    assert.equal(DEFAULT_TRUST_ASSURANCE_DATA.statCards[2].label, 'CATEGORIES');
    assert.equal(DEFAULT_TRUST_ASSURANCE_DATA.statCards[2].value, '10+');
    assert.equal(DEFAULT_TRUST_ASSURANCE_DATA.statCards[3].label, 'SECURE PAYMENTS');
    assert.equal(DEFAULT_TRUST_ASSURANCE_DATA.statCards[3].value, '100%');
});

test('2. sanitizePublicTrustAssurance projects only allowlisted safe values without internal DB keys', () => {
    const rawDoc = {
        _id: '66a123456789012345678901',
        key: 'trust_assurance',
        __v: 0,
        secretInternalData: 'xyz',
        value: {
            badge: 'TEST BADGE',
            title: 'Test Title',
            subtitle: 'Test Subtitle',
            isEnabled: true,
            featureCards: [
                {
                    id: 'feat-1',
                    title: 'Fast Dispatch',
                    description: 'Ships in 2 hours',
                    icon: 'truck',
                    colorScheme: 'info',
                    isActive: true,
                },
            ],
            statCards: [
                {
                    id: 'st-1',
                    value: '25+',
                    label: 'PARTNER HUBS',
                    icon: 'box',
                    isActive: true,
                },
            ],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const sanitized = sanitizePublicTrustAssurance(rawDoc);

    assert.equal(sanitized._id, undefined);
    assert.equal(sanitized.key, undefined);
    assert.equal(sanitized.secretInternalData, undefined);
    assert.equal(sanitized.badge, 'TEST BADGE');
    assert.equal(sanitized.title, 'Test Title');
    assert.equal(sanitized.subtitle, 'Test Subtitle');
    assert.equal(sanitized.isEnabled, true);
    assert.equal(sanitized.featureCards.length, 1);
    assert.equal(sanitized.featureCards[0].title, 'Fast Dispatch');
    assert.equal(sanitized.statCards.length, 1);
    assert.equal(sanitized.statCards[0].value, '25+');
});

test('3. sanitizePublicTrustAssurance safely falls back to defaults for null/empty docs', () => {
    const sanitized = sanitizePublicTrustAssurance(null);
    assert.equal(sanitized.title, DEFAULT_TRUST_ASSURANCE_DATA.title);
    assert.equal(sanitized.featureCards.length, 4);
    assert.equal(sanitized.statCards.length, 4);
});

test('4. Validation: sanitizeString handles constraints and rejects malicious input', () => {
    assert.equal(sanitizeString('  Clean Text  '), 'Clean Text');
    assert.throws(() => sanitizeString('A'.repeat(150), 100, 'TestField'), /exceeds maximum length/);
    assert.throws(() => sanitizeString('<script>alert(1)</script>', 100, 'TestField'), /disallowed characters or HTML tags/);
    assert.throws(() => sanitizeString('<div onclick=evil()>', 100, 'TestField'), /disallowed characters or HTML tags/);
});

test('5. Validation: updateTrustAssuranceData rejects invalid card arrays and bad payloads', async () => {
    await assert.rejects(
        async () => updateTrustAssuranceData(null),
        /Invalid payload/
    );
    await assert.rejects(
        async () => updateTrustAssuranceData({ title: '' }),
        /Section Title cannot be empty/
    );
    await assert.rejects(
        async () => updateTrustAssuranceData({ title: 'Valid', featureCards: [] }),
        /At least 1 feature card must be provided/
    );
    await assert.rejects(
        async () => updateTrustAssuranceData({
            title: 'Valid',
            featureCards: [{ title: 'Feat 1' }],
            statCards: [],
        }),
        /At least 1 stat card must be provided/
    );
    await assert.rejects(
        async () => updateTrustAssuranceData({
            title: 'Valid',
            featureCards: [{ title: '' }],
            statCards: [{ value: '1', label: 'L' }],
        }),
        /Feature Card #1 title cannot be empty/
    );
});
