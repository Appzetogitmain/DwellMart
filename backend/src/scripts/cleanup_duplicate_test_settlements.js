import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

import DeliveryCashSettlement from '../models/DeliveryCashSettlement.model.js';

async function inspectAndCleanupDuplicates() {
    const isExecuteMode = process.argv.includes('--execute');
    console.log('\n======================================================================');
    console.log(`🧹 DWELLMART COD SETTLEMENT CLEANUP TOOL [Mode: ${isExecuteMode ? 'EXECUTE' : 'DRY-RUN'}]`);
    console.log('======================================================================\n');

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dwellmart';
    await mongoose.connect(mongoUri);

    try {
        // Find all riders with multiple 'pending' settlements
        const duplicateGroups = await DeliveryCashSettlement.aggregate([
            { $match: { status: 'pending' } },
            {
                $group: {
                    _id: '$deliveryBoyId',
                    count: { $sum: 1 },
                    docs: { $push: { id: '$_id', num: '$settlementNumber', amount: '$amount', date: '$requestedAt' } },
                },
            },
            { $match: { count: { $gt: 1 } } },
        ]);

        if (duplicateGroups.length === 0) {
            console.log('✅ No duplicate pending settlement requests found in database.');
            return;
        }

        console.log(`⚠️ Found ${duplicateGroups.length} rider(s) with multiple active PENDING settlement requests:\n`);

        for (const group of duplicateGroups) {
            console.log(`Rider ID: ${group._id} | Total Pending Requests: ${group.count}`);
            // Keep the oldest pending request (first requestedAt)
            group.docs.sort((a, b) => new Date(a.date) - new Date(b.date));
            const keepDoc = group.docs[0];
            const duplicateDocs = group.docs.slice(1);

            console.log(`  ➔ KEEPING Oldest Active Pending Request: ${keepDoc.num} (₹${keepDoc.amount})`);
            console.log(`  ➔ DUPLICATES TO CANCEL (${duplicateDocs.length}):`);

            for (const doc of duplicateDocs) {
                console.log(`     - ${doc.num} (₹${doc.amount}) [ID: ${doc.id}]`);
                if (isExecuteMode) {
                    await DeliveryCashSettlement.findByIdAndUpdate(doc.id, {
                        $set: {
                            status: 'cancelled',
                            rejectionReason: 'Cancelled by cleanup script: duplicate pending request resolved.',
                        },
                    });
                }
            }
            console.log('');
        }

        if (isExecuteMode) {
            const { autoCleanupStalePendingRequests } = await import('../services/deliveryCash.service.js');
            await autoCleanupStalePendingRequests();
            console.log('🎉 Successfully ran stale settlement cleanup!');
        } else {
            console.log('💡 This was a DRY-RUN. To apply changes and cancel stale pending requests, run:');
            console.log('   node src/scripts/cleanup_duplicate_test_settlements.js --execute\n');
        }
    } finally {
        await mongoose.disconnect();
    }
}

inspectAndCleanupDuplicates().catch((err) => {
    console.error('❌ Cleanup failed:', err);
    process.exit(1);
});
