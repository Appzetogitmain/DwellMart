import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://DwellMart:DwellMart123456@cluster0.fg2wgjg.mongodb.net/DwellMart';
const BACKUP_DIR = path.resolve(__dirname, '../backups');

async function restoreCategories() {
  const targetFile = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(BACKUP_DIR, 'categories_backup_latest.json');

  if (!fs.existsSync(targetFile)) {
    throw new Error(`Backup file not found at: ${targetFile}`);
  }

  console.log(`Reading backup from: ${targetFile}...`);
  const rawData = fs.readFileSync(targetFile, 'utf8');
  const categories = JSON.parse(rawData);
  console.log(`Found ${categories.length} categories to restore.`);

  console.log('Connecting to MongoDB...');
  const conn = await mongoose.connect(MONGO_URI);
  const db = conn.connection.db;

  console.log('Restoring categories collection...');
  let restoredCount = 0;

  // Restore document images and metadata
  const bulkOps = categories.map((cat) => ({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(String(cat._id)) },
      update: {
        $set: {
          image: cat.image || '',
          icon: cat.icon || '',
          name: cat.name,
          slug: cat.slug,
          parentId: cat.parentId ? new mongoose.Types.ObjectId(String(cat.parentId)) : null,
          displayOrder: cat.displayOrder ?? 0,
          isActive: cat.isActive ?? true,
          supportedExperiences: cat.supportedExperiences || ['marketplace'],
        },
      },
      upsert: true,
    },
  }));

  if (bulkOps.length > 0) {
    const result = await db.collection('categories').bulkWrite(bulkOps, { ordered: false });
    restoredCount = result.matchedCount || result.modifiedCount || result.upsertedCount;
  }

  console.log(`\nRestore SUCCESSFUL!`);
  console.log(`Categories restored / verified: ${categories.length}`);

  await mongoose.disconnect();
}

restoreCategories().catch((err) => {
  console.error('Restore FAILED:', err);
  process.exit(1);
});
