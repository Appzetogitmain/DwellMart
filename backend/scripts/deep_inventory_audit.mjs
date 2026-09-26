import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://DwellMart:DwellMart123456@cluster0.fg2wgjg.mongodb.net/DwellMart';
const STORAGE_DIR = path.resolve('storage/categories/2026/09');

async function runInventoryAudit() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  console.log('Fetching all 3,486 categories...');
  const allCategories = await db.collection('categories').find({}).toArray();

  const catMap = new Map();
  for (const c of allCategories) {
    catMap.set(String(c._id), c);
  }

  // Pre-calculate file hashes for all files in local storage
  console.log('Computing hashes for local storage files...');
  const fileHashMap = new Map(); // fileName -> sha256
  const hashToFiles = new Map(); // sha256 -> [fileName...]
  if (fs.existsSync(STORAGE_DIR)) {
    const files = fs.readdirSync(STORAGE_DIR);
    for (const f of files) {
      if (f.endsWith('.webp') || f.endsWith('.png') || f.endsWith('.jpg')) {
        const fullPath = path.join(STORAGE_DIR, f);
        try {
          const buf = fs.readFileSync(fullPath);
          const hash = crypto.createHash('sha256').update(buf).digest('hex');
          fileHashMap.set(f, hash);
          if (!hashToFiles.has(hash)) hashToFiles.set(hash, []);
          hashToFiles.get(hash).push(f);
        } catch {}
      }
    }
  }
  console.log(`Indexed ${fileHashMap.size} local storage files (${hashToFiles.size} unique hashes).`);

  // Build hierarchy paths and levels
  function getCategoryHierarchy(c) {
    const ancestors = [];
    let curr = c;
    while (curr && curr.parentId) {
      const parent = catMap.get(String(curr.parentId));
      if (parent) {
        ancestors.unshift(parent);
        curr = parent;
      } else {
        break;
      }
    }
    const level = ancestors.length + 1;
    const pathNames = [...ancestors.map(a => a.name), c.name].join(' > ');
    return {
      level,
      parentName: ancestors[ancestors.length - 1]?.name || null,
      grandParentName: ancestors[ancestors.length - 2]?.name || null,
      pathNames,
    };
  }

  // Count URL occurrences
  const urlCountMap = new Map();
  for (const c of allCategories) {
    const img = (c.image || '').trim();
    if (img) {
      urlCountMap.set(img, (urlCountMap.get(img) || 0) + 1);
    }
  }

  // Build complete inventory
  console.log('Building complete inventory...');
  const inventory = [];
  const contentDuplicates = [];
  const urlDuplicates = [];
  const missingImages = [];
  const brokenLocalImages = [];

  const hashOccurrenceMap = new Map(); // hash -> count of categories using it

  for (const c of allCategories) {
    const h = getCategoryHierarchy(c);
    const img = (c.image || '').trim();

    let status = 'VALID';
    let fileHash = null;
    let localFileExists = null;

    if (!img) {
      status = 'MISSING';
      missingImages.push({ id: c._id, name: c.name, path: h.pathNames, level: h.level });
    } else {
      // Check if it's a local storage URL
      if (img.includes('/images/categories/2026/09/')) {
        const fileName = path.basename(img);
        localFileExists = fs.existsSync(path.join(STORAGE_DIR, fileName));
        if (!localFileExists) {
          status = 'BROKEN_LOCAL_FILE';
          brokenLocalImages.push({ id: c._id, name: c.name, path: h.pathNames, img });
        } else {
          fileHash = fileHashMap.get(fileName);
          if (fileHash) {
            hashOccurrenceMap.set(fileHash, (hashOccurrenceMap.get(fileHash) || 0) + 1);
          }
        }
      }
    }

    const isUrlShared = Boolean(img && (urlCountMap.get(img) || 0) > 1);
    if (isUrlShared) {
      urlDuplicates.push({ id: c._id, name: c.name, path: h.pathNames, img, count: urlCountMap.get(img) });
    }

    inventory.push({
      id: String(c._id),
      name: c.name,
      slug: c.slug,
      parentId: c.parentId ? String(c.parentId) : null,
      parentName: h.parentName,
      grandParentName: h.grandParentName,
      level: h.level,
      path: h.pathNames,
      image: img,
      status,
      fileHash,
      localFileExists,
      isUrlShared,
      urlDuplicateCount: img ? urlCountMap.get(img) || 0 : 0,
      supportedExperiences: c.supportedExperiences || [],
    });
  }

  // Now check content duplicates (where hash is used by > 1 category)
  for (const item of inventory) {
    if (item.fileHash && (hashOccurrenceMap.get(item.fileHash) || 0) > 1) {
      item.isContentDuplicate = true;
      item.contentDuplicateCount = hashOccurrenceMap.get(item.fileHash);
      contentDuplicates.push(item);
    } else {
      item.isContentDuplicate = false;
      item.contentDuplicateCount = item.fileHash ? 1 : 0;
    }
  }

  console.log('\n========================================');
  console.log('--- PRODUCTION CATEGORY INVENTORY SUMMARY ---');
  console.log(`Total Categories: ${inventory.length}`);
  console.log(`Level 1 Categories: ${inventory.filter(i => i.level === 1).length}`);
  console.log(`Level 2 Categories: ${inventory.filter(i => i.level === 2).length}`);
  console.log(`Level 3 Categories: ${inventory.filter(i => i.level === 3).length}`);
  console.log(`Level 4+ Categories: ${inventory.filter(i => i.level >= 4).length}`);
  console.log('----------------------------------------');
  console.log(`Missing / Empty Images: ${missingImages.length}`);
  console.log(`Broken Local Files (URL exists in DB but file missing on disk): ${brokenLocalImages.length}`);
  console.log(`Categories with Shared Image URLs: ${urlDuplicates.length} (across ${new Set(urlDuplicates.map(u => u.img)).size} unique URLs)`);
  console.log(`Categories with Shared Content Hash (Same image bytes under different filenames): ${contentDuplicates.length} (across ${new Set(contentDuplicates.map(c => c.fileHash)).size} unique hashes)`);
  console.log('========================================\n');

  // Save audit data
  fs.writeFileSync('backups/category_inventory_audit.json', JSON.stringify({
    totalCategories: inventory.length,
    missingImagesCount: missingImages.length,
    brokenLocalImagesCount: brokenLocalImages.length,
    urlDuplicatesCount: urlDuplicates.length,
    contentDuplicatesCount: contentDuplicates.length,
    missingImages,
    brokenLocalImages,
    sampleContentDuplicates: contentDuplicates.slice(0, 30),
    sampleUrlDuplicates: urlDuplicates.slice(0, 30),
    inventory,
  }, null, 2));

  console.log('Full audit saved to backups/category_inventory_audit.json');

  process.exit(0);
}

runInventoryAudit();
