import mongoose from 'mongoose';
import sharp from 'sharp';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://DwellMart:DwellMart123456@cluster0.fg2wgjg.mongodb.net/DwellMart';
const STORAGE_ROOT = path.resolve(__dirname, '../storage');
const CATEGORIES_DIR = path.join(STORAGE_ROOT, 'categories', '2026', '09');

// Ensure local directory exists
if (!fs.existsSync(CATEGORIES_DIR)) {
  fs.mkdirSync(CATEGORIES_DIR, { recursive: true });
}

/**
 * Curated high-res Unsplash fallbacks for general eCommerce departments
 */
const DOMAIN_FALLBACKS = {
  grocery: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&h=600&q=80',
  food: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=600&h=600&q=80',
  snack: 'https://images.unsplash.com/photo-1599490659213-e2b9527bd087?auto=format&fit=crop&w=600&h=600&q=80',
  beverage: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=600&h=600&q=80',
  fashion: 'https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=600&h=600&q=80',
  clothing: 'https://images.unsplash.com/photo-1523381294911-8d3cead13475?auto=format&fit=crop&w=600&h=600&q=80',
  footwear: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=600&h=600&q=80',
  shoes: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&h=600&q=80',
  electronics: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=600&h=600&q=80',
  mobile: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&h=600&q=80',
  beauty: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=600&h=600&q=80',
  skincare: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&h=600&q=80',
  fitness: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=600&h=600&q=80',
  sports: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=600&h=600&q=80',
  home: 'https://images.unsplash.com/photo-1484101403633-562f891dc89a?auto=format&fit=crop&w=600&h=600&q=80',
  kitchen: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=600&h=600&q=80',
  pets: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&w=600&h=600&q=80',
  toys: 'https://images.unsplash.com/photo-1558060370-d644479cb6f7?auto=format&fit=crop&w=600&h=600&q=80',
  baby: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=600&h=600&q=80',
};

function getDomainFallback(name = '', parentName = '') {
  const combined = `${name} ${parentName}`.toLowerCase();
  for (const [key, url] of Object.entries(DOMAIN_FALLBACKS)) {
    if (combined.includes(key)) return url;
  }
  return DOMAIN_FALLBACKS.grocery;
}

/**
 * Fetch candidate image from Wikimedia generator search or Commons
 */
async function fetchCandidateUrl(query) {
  // 1. Wikipedia search
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1&prop=pageimages&pithumbsize=600&format=json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DwellMartCategoryEnricher/1.0 (ecommerce catalog category imaging)' },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      const pages = data.query?.pages;
      if (pages) {
        const page = Object.values(pages)[0];
        const src = page?.thumbnail?.source;
        if (src) return src;
      }
    }
  } catch {}

  // 2. Wikimedia Commons media search
  try {
    const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1&prop=imageinfo&iiprop=url&iiurlwidth=600&format=json`;
    const res = await fetch(commonsUrl, {
      headers: { 'User-Agent': 'DwellMartCategoryEnricher/1.0' },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      const pages = data.query?.pages;
      if (pages) {
        const page = Object.values(pages)[0];
        const thumbUrl = page?.imageinfo?.[0]?.thumburl;
        if (thumbUrl) return thumbUrl;
      }
    }
  } catch {}

  return null;
}

/**
 * Download, optimize with Sharp to 600x600 WebP, save to local VPS storage
 */
async function processAndSaveImage(sourceUrl) {
  const res = await fetch(sourceUrl, {
    headers: { 'User-Agent': 'DwellMartCategoryEnricher/1.0' },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`Failed to download image from ${sourceUrl}: HTTP ${res.status}`);
  }

  const rawBuffer = Buffer.from(await res.arrayBuffer());
  if (rawBuffer.length < 500) {
    throw new Error(`Downloaded buffer too small (${rawBuffer.length} bytes)`);
  }

  const webpBuffer = await sharp(rawBuffer)
    .rotate()
    .resize({
      width: 600,
      height: 600,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 80, effort: 4 })
    .toBuffer();

  const uuid = crypto.randomUUID();
  const fileName = `${uuid}.webp`;
  const absolutePath = path.join(CATEGORIES_DIR, fileName);

  await fsp.writeFile(absolutePath, webpBuffer);

  return {
    uuid,
    fileName,
    url: `https://dwellmart.in/images/categories/2026/09/${fileName}`,
    size: webpBuffer.length,
  };
}

async function runBulkCategoryEnrichment() {
  console.log('Connecting to MongoDB...');
  const conn = await mongoose.connect(MONGO_URI);
  const db = conn.connection.db;

  console.log('Loading all categories...');
  const allCategories = await db.collection('categories').find({}).toArray();
  const catMap = new Map();
  for (const c of allCategories) {
    catMap.set(String(c._id), c);
  }

  // Find all categories needing images (missing or duplicate of parent)
  const targets = [];

  for (const c of allCategories) {
    const parent = c.parentId ? catMap.get(String(c.parentId)) : null;
    const grandParent = parent?.parentId ? catMap.get(String(parent.parentId)) : null;

    const img = String(c.image || '').trim();
    const pImg = String(parent?.image || '').trim();
    const gpImg = String(grandParent?.image || '').trim();

    const isMissing = !img || img === 'null' || img === 'undefined';
    const isParentDuplicate = Boolean(pImg && img === pImg);
    const isGrandParentDuplicate = Boolean(gpImg && img === gpImg);

    if (isMissing || isParentDuplicate || isGrandParentDuplicate) {
      targets.push({
        _id: c._id,
        name: c.name,
        slug: c.slug,
        parentName: parent?.name || '',
        grandParentName: grandParent?.name || '',
        currentImage: img,
        reason: isMissing ? 'MISSING' : (isParentDuplicate ? 'PARENT_DUPLICATE' : 'GRANDPARENT_DUPLICATE'),
      });
    }
  }

  console.log(`\nIdentified ${targets.length} categories to enrich with distinct images.`);
  console.log(`Starting bulk processing with concurrency limit...\n`);

  let successCount = 0;
  let failCount = 0;
  const startTime = Date.now();

  // Concurrency pool of 6 workers
  const CONCURRENCY = 6;
  let index = 0;

  async function worker(workerId) {
    while (index < targets.length) {
      const currentIdx = index++;
      const item = targets[currentIdx];

      try {
        // Build clean search query
        const cleanName = item.name.replace(/[^a-zA-Z0-9\s&]/g, ' ').replace(/\s+/g, ' ').trim();
        const cleanParent = item.parentName.replace(/[^a-zA-Z0-9\s&]/g, ' ').replace(/\s+/g, ' ').trim();

        // Try exact name first, then with parent
        let foundUrl = await fetchCandidateUrl(cleanName);
        if (!foundUrl && cleanParent && cleanParent.length > 2) {
          foundUrl = await fetchCandidateUrl(`${cleanName} ${cleanParent}`);
        }
        if (!foundUrl) {
          foundUrl = getDomainFallback(item.name, item.parentName);
        }

        const saved = await processAndSaveImage(foundUrl);

        // Atomic MongoDB update: ONLY touch the image field!
        await db.collection('categories').updateOne(
          { _id: item._id },
          { $set: { image: saved.url } }
        );

        successCount++;
      } catch (err) {
        // Fallback to domain fallback if initial processing failed
        try {
          const fallbackUrl = getDomainFallback(item.name, item.parentName);
          const saved = await processAndSaveImage(fallbackUrl);
          await db.collection('categories').updateOne(
            { _id: item._id },
            { $set: { image: saved.url } }
          );
          successCount++;
        } catch (fbErr) {
          failCount++;
        }
      }

      if ((currentIdx + 1) % 50 === 0 || currentIdx + 1 === targets.length) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const percent = (((currentIdx + 1) / targets.length) * 100).toFixed(1);
        console.log(`[Progress] ${currentIdx + 1}/${targets.length} (${percent}%) | Success: ${successCount}, Fail: ${failCount} | ${elapsed}s`);
      }

      // Small delay between requests to be polite
      await new Promise((r) => setTimeout(r, 40));
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i));
  await Promise.all(workers);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n========================================`);
  console.log(`Bulk Category Image Assignment COMPLETED!`);
  console.log(`Total Processed: ${targets.length}`);
  console.log(`Successfully Updated: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Total Time: ${totalTime} seconds`);
  console.log(`Images saved to: ${CATEGORIES_DIR}`);
  console.log(`========================================\n`);

  await mongoose.disconnect();
}

runBulkCategoryEnrichment().catch((err) => {
  console.error('Fatal script error:', err);
  process.exit(1);
});
