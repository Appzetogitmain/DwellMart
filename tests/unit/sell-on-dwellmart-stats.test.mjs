import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_SELL_ON_DWELLMART_STATS,
    ALLOWED_STATS_FIELDS,
    sanitizePublicStats,
    updateSellOnDwellmartStats,
} from '../../src/services/sellOnDwellmartStats.service.js';

test('1. Default stats constants match expected business defaults', () => {
    assert.equal(DEFAULT_SELL_ON_DWELLMART_STATS.activeVendors, '500+');
    assert.equal(DEFAULT_SELL_ON_DWELLMART_STATS.productsSold, '100K+');
    assert.equal(DEFAULT_SELL_ON_DWELLMART_STATS.citiesCovered, '50+');
    assert.equal(DEFAULT_SELL_ON_DWELLMART_STATS.onTimeDeliveryRate, '99.9%');
    assert.equal(DEFAULT_SELL_ON_DWELLMART_STATS.todaysRevenue, '₹4,85,200');
    assert.equal(DEFAULT_SELL_ON_DWELLMART_STATS.ordersToday, '389');
    assert.equal(DEFAULT_SELL_ON_DWELLMART_STATS.expressDeliveries, '142');
    assert.equal(DEFAULT_SELL_ON_DWELLMART_STATS.revenueGrowthPercent, '+28.4%');
    assert.equal(DEFAULT_SELL_ON_DWELLMART_STATS.dailySettlementAmount, '₹1,48,250');
    assert.equal(ALLOWED_STATS_FIELDS.length, 9);
});

test('2. sanitizePublicStats projects only allowlisted fields without internal DB keys', () => {
    const rawDoc = {
        _id: '66a123456789012345678901',
        key: 'sell_on_dwellmart',
        __v: 0,
        secretAdminFlag: true,
        activeVendors: '750+',
        productsSold: '150K+',
        citiesCovered: '75+',
        onTimeDeliveryRate: '99.95%',
        todaysRevenue: '₹6,25,000',
        ordersToday: '475',
        expressDeliveries: '210',
        revenueGrowthPercent: '+31.2%',
        dailySettlementAmount: '₹2,10,000',
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    const sanitized = sanitizePublicStats(rawDoc);

    assert.equal(sanitized._id, undefined);
    assert.equal(sanitized.key, undefined);
    assert.equal(sanitized.__v, undefined);
    assert.equal(sanitized.secretAdminFlag, undefined);
    assert.equal(sanitized.activeVendors, '750+');
    assert.equal(sanitized.productsSold, '150K+');
    assert.equal(sanitized.citiesCovered, '75+');
    assert.equal(sanitized.onTimeDeliveryRate, '99.95%');
    assert.equal(sanitized.todaysRevenue, '₹6,25,000');
    assert.equal(sanitized.ordersToday, '475');
    assert.equal(sanitized.expressDeliveries, '210');
    assert.equal(sanitized.revenueGrowthPercent, '+31.2%');
    assert.equal(sanitized.dailySettlementAmount, '₹2,10,000');
});

test('3. sanitizePublicStats falls back safely to defaults for null/empty docs', () => {
    const sanitized = sanitizePublicStats(null);
    assert.deepEqual(sanitized, {
        ...DEFAULT_SELL_ON_DWELLMART_STATS,
    });
});

test('4. Validation: updateSellOnDwellmartStats rejects non-object or empty payloads', async () => {
    await assert.rejects(
        async () => updateSellOnDwellmartStats(null),
        /Invalid payload/
    );
    await assert.rejects(
        async () => updateSellOnDwellmartStats({}),
        /At least one valid statistics field must be provided/
    );
    await assert.rejects(
        async () => updateSellOnDwellmartStats({ unknownField: '123' }),
        /At least one valid statistics field must be provided/
    );
});

test('5. Validation: updateSellOnDwellmartStats rejects empty and whitespace-only values', async () => {
    await assert.rejects(
        async () => updateSellOnDwellmartStats({ activeVendors: '' }),
        /Field 'activeVendors' cannot be empty/
    );
    await assert.rejects(
        async () => updateSellOnDwellmartStats({ activeVendors: '   ' }),
        /Field 'activeVendors' cannot be empty/
    );
    await assert.rejects(
        async () => updateSellOnDwellmartStats({ todaysRevenue: null }),
        /Field 'todaysRevenue' must be a non-empty string/
    );
    await assert.rejects(
        async () => updateSellOnDwellmartStats({ ordersToday: 1234 }),
        /Field 'ordersToday' must be a non-empty string/
    );
});

test('6. Validation: updateSellOnDwellmartStats rejects excessively long values', async () => {
    const longString = 'A'.repeat(51);
    await assert.rejects(
        async () => updateSellOnDwellmartStats({ activeVendors: longString }),
        /Field 'activeVendors' is too long/
    );
});

test('7. Validation: updateSellOnDwellmartStats rejects HTML/script injection', async () => {
    await assert.rejects(
        async () => updateSellOnDwellmartStats({ activeVendors: '<script>alert(1)</script>' }),
        /contains invalid characters or HTML tags/
    );
    await assert.rejects(
        async () => updateSellOnDwellmartStats({ todaysRevenue: '<img src=x onerror=alert(1)>' }),
        /contains invalid characters or HTML tags/
    );
});
