import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://DwellMart:DwellMart123456@cluster0.fg2wgjg.mongodb.net/DwellMart';

async function backup() {
  console.log('Connecting to MongoDB for snapshot...');
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  const categories = await db.collection('categories').find({}).toArray();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = `backups/categories_backup_${timestamp}.json`;
  fs.writeFileSync(backupFile, JSON.stringify(categories, null, 2));
  fs.writeFileSync('backups/categories_backup_before_targeted_fix.json', JSON.stringify(categories, null, 2));

  console.log(`Snapshot saved: ${categories.length} records to ${backupFile}`);
  process.exit(0);
}
backup();
