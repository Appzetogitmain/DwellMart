import {
    withdrawalListQuerySchema,
    walletAnalyticsQuerySchema,
} from './modules/admin/validators/riderWallet.validator.js';

console.log('--- Test withdrawalListQuerySchema ---');
const res1 = withdrawalListQuerySchema.validate({ page: '1', limit: '20', status: 'pending', search: '' });
console.log('res1 error:', res1.error?.details || 'NO ERROR');

console.log('--- Test walletAnalyticsQuerySchema ---');
const res2 = walletAnalyticsQuerySchema.validate({ days: '30' });
console.log('res2 error:', res2.error?.details || 'NO ERROR');
