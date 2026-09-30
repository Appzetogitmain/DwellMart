import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://DwellMart:DwellMart123456@cluster0.fg2wgjg.mongodb.net/DwellMart';
const STORAGE_DIR = path.resolve('storage/categories/2026/09');

async function verify() {
  console.log('Connecting to MongoDB Atlas...');
  const conn = await mongoose.connect(MONGO_URI);
  const db = conn.connection.db;

  const currentCategories = await db.collection('categories').find({}).toArray();
  const preSnapshot = JSON.parse(fs.readFileSync('backups/production_categories_snapshot_before_cleanup.json', 'utf8'));

  console.log('\n======================================================');
  console.log('FINAL AUDIT: PRODUCTION CATEGORY IMAGE CLEANUP');
  console.log('======================================================');

  // 1. Total Category Count
  console.log(`1. Total Categories: ${currentCategories.length} (Pre: ${preSnapshot.length}) -> ${currentCategories.length === preSnapshot.length ? 'PASS ✅' : 'FAIL ❌'}`);

  // 2. Category Structure Integrity (IDs, Names, Slugs, ParentIds)
  const preMap = new Map(preSnapshot.map(c => [String(c._id), c]));
  let idMismatches = 0;
  let nameMismatches = 0;
  let slugMismatches = 0;
  let parentMismatches = 0;

  for (const cur of currentCategories) {
    const pre = preMap.get(String(cur._id));
    if (!pre) {
      idMismatches++;
      continue;
    }
    if (cur.name !== pre.name) nameMismatches++;
    if (cur.slug !== pre.slug) slugMismatches++;
    if (String(cur.parentId || '') !== String(pre.parentId || '')) parentMismatches++;
  }

  console.log(`2. Category IDs Integrity:       ${idMismatches === 0 ? 'PASS (0 ID changes) ✅' : `FAIL (${idMismatches} mismatches) ❌`}`);
  console.log(`3. Category Names Integrity:     ${nameMismatches === 0 ? 'PASS (0 name changes) ✅' : `FAIL (${nameMismatches} mismatches) ❌`}`);
  console.log(`4. Category Slugs Integrity:     ${slugMismatches === 0 ? 'PASS (0 slug changes) ✅' : `FAIL (${slugMismatches} mismatches) ❌`}`);
  console.log(`5. Hierarchy (parentId):        ${parentMismatches === 0 ? 'PASS (0 parent changes) ✅' : `FAIL (${parentMismatches} mismatches) ❌`}`);

  // 3. Level 1 Categories Preservation
  let l1Preserved = 0;
  let l1Altered = 0;
  for (const cur of currentCategories) {
    if (!cur.parentId) {
      const pre = preMap.get(String(cur._id));
      if (cur.image === pre.image) {
        l1Preserved++;
      } else {
        l1Altered++;
      }
    }
  }
  console.log(`6. Level 1 Preservation:       ${l1Preserved}/41 preserved, ${l1Altered} altered -> ${l1Altered === 0 ? 'PASS (100% PRESERVED) ✅' : 'FAIL ❌'}`);

  // 4. Missing / Empty Images
  let missingImages = 0;
  const urlCountMap = new Map();
  for (const cur of currentCategories) {
    const img = (cur.image || '').trim();
    if (!img) {
      missingImages++;
    } else {
      urlCountMap.set(img, (urlCountMap.get(img) || 0) + 1);
    }
  }
  console.log(`7. Missing Images Count:         ${missingImages} -> ${missingImages === 0 ? 'PASS (0 missing) ✅' : 'FAIL ❌'}`);

  // 5. Unique URLs
  const duplicateUrls = [...urlCountMap.entries()].filter(([url, count]) => count > 1);
  console.log(`8. Duplicate Image URLs:         ${duplicateUrls.length} -> ${duplicateUrls.length === 0 ? 'PASS (0 duplicates) ✅' : 'FAIL ❌'}`);

  // 6. Content Hash Uniqueness across all local storage WebP files
  const hashCountMap = new Map();
  let localFilesChecked = 0;

  for (const cur of currentCategories) {
    const img = (cur.image || '').trim();
    if (img.includes('/images/categories/2026/09/')) {
      const fn = path.basename(img);
      const filePath = path.join(STORAGE_DIR, fn);
      if (fs.existsSync(filePath)) {
        localFilesChecked++;
        const buf = fs.readFileSync(filePath);
        const hash = crypto.createHash('sha256').update(buf).digest('hex');
        hashCountMap.set(hash, (hashCountMap.get(hash) || 0) + 1);
      }
    }
  }

  const duplicateHashes = [...hashCountMap.entries()].filter(([h, count]) => count > 1);
  console.log(`9. Local WebP Files Verified:    ${localFilesChecked}`);
  console.log(`10. Duplicate Content Hashes:    ${duplicateHashes.length} -> ${duplicateHashes.length === 0 ? 'PASS (0 duplicate hashes) ✅' : 'FAIL ❌'}`);
  console.log('======================================================\n');

  process.exit(0);
}

verify().catch(err => {
  console.error(err);
  process.exit(1);
});
