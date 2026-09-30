import Product from '../models/Product.model.js';

export default {
    id: '0017_product_publication_status',
    description: 'Backfill existing visible products as LIVE without taking the production catalogue offline',

    async up() {
        const live = await Product.updateMany(
            {
                publicationStatus: { $exists: false },
                isActive: { $ne: false },
                isVisible: { $ne: false },
                isDeleted: { $ne: true },
            },
            { $set: { publicationStatus: 'LIVE', publicationStatusUpdatedAt: new Date() } }
        );
        const offline = await Product.updateMany(
            { publicationStatus: { $exists: false } },
            { $set: { publicationStatus: 'OFFLINE', publicationStatusUpdatedAt: new Date() } }
        );
        await Product.collection.createIndex(
            { publicationStatus: 1, isActive: 1, isDeleted: 1, createdAt: -1 },
            { name: 'publicationStatus_1_isActive_1_isDeleted_1_createdAt_-1' }
        );
        return { live: live.modifiedCount, offline: offline.modifiedCount };
    },

    async verify() {
        const missing = await Product.countDocuments({ publicationStatus: { $exists: false } });
        return { ok: missing === 0, detail: `${missing} products missing publicationStatus` };
    },
};
