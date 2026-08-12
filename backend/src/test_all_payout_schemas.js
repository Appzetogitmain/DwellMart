import {
    withdrawalListQuerySchema,
    walletListQuerySchema,
    rateCardListQuerySchema,
    walletAnalyticsQuerySchema,
    driftQuerySchema,
} from './modules/admin/validators/riderWallet.validator.js';

const testCases = [
    { name: 'withdrawalList 1', schema: withdrawalListQuerySchema, query: { page: '1', limit: '20', status: 'pending', search: '' } },
    { name: 'withdrawalList 2', schema: withdrawalListQuerySchema, query: { page: 1, limit: 20, status: 'pending', search: '' } },
    { name: 'walletList 1', schema: walletListQuerySchema, query: { page: '1', limit: '20', search: '', sort: 'available' } },
    { name: 'rateCardList 1', schema: rateCardListQuerySchema, query: {} },
    { name: 'rateCardList 2', schema: rateCardListQuerySchema, query: { scope: '' } },
    { name: 'walletAnalytics 1', schema: walletAnalyticsQuerySchema, query: { days: '30' } },
    { name: 'drift 1', schema: driftQuerySchema, query: { limit: '200' } },
];

for (const tc of testCases) {
    const res = tc.schema.validate(tc.query, { abortEarly: false, stripUnknown: true });
    if (res.error) {
        console.log(`❌ ERROR in ${tc.name}:`, res.error.details);
    } else {
        console.log(`✅ OK: ${tc.name}`);
    }
}
