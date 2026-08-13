import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL || process.env.MONGODB_URI;
await mongoose.connect(MONGO_URI);

const { default: RiderWithdrawalRequest } = await import('./models/RiderWithdrawalRequest.model.js');
const { withdrawalListQuerySchema, walletAnalyticsQuerySchema } = await import('./modules/admin/validators/riderWallet.validator.js');

console.log('Testing query: { page: "1", limit: "20", status: "pending", search: "" }');
const req1 = { page: '1', limit: '20', status: 'pending', search: '' };
const v1 = withdrawalListQuerySchema.validate(req1, { abortEarly: false, stripUnknown: true });
console.log('withdrawalListQuerySchema result:', v1.error ? v1.error.details : 'SUCCESS', 'value:', v1.value);

console.log('\nTesting query: { days: "30" }');
const req2 = { days: '30' };
const v2 = walletAnalyticsQuerySchema.validate(req2, { abortEarly: false, stripUnknown: true });
console.log('walletAnalyticsQuerySchema result:', v2.error ? v2.error.details : 'SUCCESS', 'value:', v2.value);

// Let's test with empty params or query from browser
console.log('\nTesting query: {}');
const v3 = withdrawalListQuerySchema.validate({}, { abortEarly: false, stripUnknown: true });
console.log('withdrawalListQuerySchema {} result:', v3.error ? v3.error.details : 'SUCCESS', 'value:', v3.value);

await mongoose.disconnect();
