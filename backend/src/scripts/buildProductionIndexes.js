/**
 * buildProductionIndexes.js
 *
 * Idempotent script that creates all model indexes in the background.
 * Safe to run against a live production database — it uses createIndex()
 * with { background: true } rather than syncIndexes(), which would drop
 * indexes not defined in the schema.
 *
 * Usage:
 *   node src/scripts/buildProductionIndexes.js
 */

import mongoose from 'mongoose';
import '../models/Order.model.js';
import '../models/Notification.model.js';
import '../models/DeliveryBoy.model.js';
import '../models/Product.model.js';
import '../models/User.model.js';
import '../models/Vendor.model.js';

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error('[Index Build] MONGO_URI environment variable is not set.');
    process.exit(1);
}

async function buildIndexes() {
    console.log('[Index Build] Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('[Index Build] Connected.\n');

    const models = mongoose.modelNames();
    let total = 0;
    let built = 0;
    let skipped = 0;

    for (const modelName of models) {
        const model = mongoose.model(modelName);
        const collection = model.collection;

        // Read the indexes currently in MongoDB for this collection.
        let existingIndexes = [];
        try {
            existingIndexes = await collection.indexes();
        } catch {
            // Collection may not yet exist — createIndex() will create it.
        }
        const existingNames = new Set(existingIndexes.map((i) => i.name));

        // Mongoose exposes the schema's declared indexes via schema.indexes().
        const schemaIndexes = model.schema.indexes();

        for (const [fields, opts = {}] of schemaIndexes) {
            total++;
            const indexName = opts.name || buildIndexName(fields);

            if (existingNames.has(indexName)) {
                skipped++;
                console.log(`  [SKIP]  ${modelName}.${indexName} — already exists`);
                continue;
            }

            try {
                await collection.createIndex(fields, { background: true, ...opts });
                built++;
                console.log(`  [BUILD] ${modelName}.${indexName}`);
            } catch (err) {
                console.error(`  [ERROR] ${modelName}.${indexName}: ${err.message}`);
            }
        }
    }

    console.log(`\n[Index Build] Done. Total=${total}  Built=${built}  Skipped=${skipped}`);
    await mongoose.disconnect();
}

function buildIndexName(fields) {
    return Object.entries(fields)
        .map(([k, v]) => `${k}_${v}`)
        .join('_');
}

buildIndexes().catch((err) => {
    console.error('[Index Build] Fatal error:', err);
    process.exit(1);
});
