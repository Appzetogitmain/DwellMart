import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://DwellMart:DwellMart123456@cluster0.fg2wgjg.mongodb.net/DwellMart';
const BACKUP_DIR = path.resolve(__dirname, '../backups');

async function backupCategories() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `categories_backup_${timestamp}.json`);
  const latestBackupFile = path.join(BACKUP_DIR, `categories_backup_latest.json`);

  console.log(`Connecting to MongoDB...`);
  const conn = await mongoose.connect(MONGO_URI);
  const db = conn.connection.db;

  console.log(`Fetching all categories...`);
  const categories = await db.collection('categories').find({}).toArray();
  console.log(`Retrieved ${categories.length} categories.`);

  fs.writeFileSync(backupFile, JSON.stringify(categories, null, 2), 'utf8');
  fs.writeFileSync(latestBackupFile, JSON.stringify(categories, null, 2), 'utf8');

  const stats = fs.statSync(backupFile);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log(`\nBackup SUCCESSFUL!`);
  console.log(`File: ${backupFile}`);
  console.log(`Latest pointer: ${latestBackupFile}`);
  console.log(`Records backed up: ${categories.length}`);
  console.log(`File size: ${sizeMB} MB`);

  await mongoose.disconnect();
}

backupCategories().catch((err) => {
  console.error('Backup FAILED:', err);
  process.exit(1);
});
