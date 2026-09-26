import mongoose from 'mongoose';
import dotenv from 'dotenv';
import sharp from 'sharp';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://DwellMart:DwellMart123456@cluster0.fg2wgjg.mongodb.net/DwellMart';
const CATEGORIES_DIR = path.resolve('storage/categories/2026/09');

// Ensure storage directory exists
if (!fs.existsSync(CATEGORIES_DIR)) {
  fs.mkdirSync(CATEGORIES_DIR, { recursive: true });
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Keep track of all image URLs used in this session so siblings NEVER get the same image
const usedSourceUrls = new Set();

/**
 * Fetch candidate images from Wikipedia
 */
async function searchWikipedia(query) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=3&prop=pageimages&pithumbsize=600&format=json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const pages = Object.values(data.query?.pages || {});
    for (const page of pages) {
      const src = page?.thumbnail?.source;
      if (src && !usedSourceUrls.has(src) && !src.endsWith('.svg.png') && !src.includes('Disambig') && !src.includes('Icon')) {
        return src;
      }
    }
  } catch {}
  return null;
}

/**
 * Fetch candidate images from Wikimedia Commons
 */
async function searchWikimediaCommons(query) {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(query)}&gsrlimit=3&prop=imageinfo&iiprop=url&iiurlwidth=600&format=json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const pages = Object.values(data.query?.pages || {});
    for (const page of pages) {
      const thumbUrl = page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url;
      if (thumbUrl && !usedSourceUrls.has(thumbUrl) && !thumbUrl.endsWith('.svg.png') && !thumbUrl.includes('Icon')) {
        return thumbUrl;
      }
    }
  } catch {}
  return null;
}

/**
 * Curated list of high-quality fallback images across various retail categories
 */
const HIGH_RES_FALLBACK_POOL = [
  'https://images.unsplash.com/photo-1523381294911-8d3cead13475?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1484101403633-562f891dc89a?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=600&q=80',
];

let fallbackIndex = 0;
function getNextFallback() {
  const url = HIGH_RES_FALLBACK_POOL[fallbackIndex % HIGH_RES_FALLBACK_POOL.length];
  fallbackIndex++;
  return url;
}

/**
 * Find the most relevant candidate image URL
 */
async function findCandidateImageUrl(categoryName, parentName, grandParentName) {
  const cleanCat = categoryName.replace(/[^a-zA-Z0-9\s&]/g, ' ').replace(/\s+/g, ' ').trim();
  const cleanParent = (parentName || '').replace(/[^a-zA-Z0-9\s&]/g, ' ').replace(/\s+/g, ' ').trim();

  // Try exact category name with parent context if helpful
  const queries = [
    cleanCat,
    `${cleanCat} ${cleanParent}`.trim(),
  ];

  // If plural ending with 's', also try singular
  if (cleanCat.endsWith('s') && cleanCat.length > 3) {
    queries.push(cleanCat.slice(0, -1));
  }

  for (const q of queries) {
    // 1. Try Wikipedia
    const wikiUrl = await searchWikipedia(q);
    if (wikiUrl) {
      usedSourceUrls.add(wikiUrl);
      return wikiUrl;
    }

    // 2. Try Wikimedia Commons
    const commonsUrl = await searchWikimediaCommons(q);
    if (commonsUrl) {
      usedSourceUrls.add(commonsUrl);
      return commonsUrl;
    }
  }

  return getNextFallback();
}

/**
 * Download, resize and convert to WebP
 */
async function processAndSaveImage(sourceUrl) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(sourceUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const rawBuffer = Buffer.from(await res.arrayBuffer());
      if (rawBuffer.length < 400) {
        throw new Error(`Buffer too small (${rawBuffer.length} bytes)`);
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
      };
    } catch (err) {
      if (attempt < 3) {
        await sleep(attempt * 800);
      } else {
        throw err;
      }
    }
  }
}

async function runTargetedFix() {
  console.log('Connecting to MongoDB...');
  const conn = await mongoose.connect(MONGO_URI);
  const db = conn.connection.db;

  console.log('Fetching all categories...');
  const allCategories = await db.collection('categories').find({}).toArray();

  const catMap = new Map();
  const urlCount = new Map();

  for (const c of allCategories) {
    catMap.set(String(c._id), c);
    const img = (c.image || '').trim();
    if (img) {
      urlCount.set(img, (urlCount.get(img) || 0) + 1);
    }
  }

  // Identify targets:
  // 1. Exclude root categories (Level 1) so Cloudinary banners are untouched!
  // 2. Missing images (empty, null)
  // 3. Shared images (used by > 1 category across catalog)
  const targets = [];
  for (const c of allCategories) {
    if (!c.parentId) continue; // NEVER TOUCH LEVEL 1

    const img = (c.image || '').trim();
    const isMissing = !img;
    const isShared = Boolean(img && (urlCount.get(img) || 0) > 1);

    if (isMissing || isShared) {
      const parent = c.parentId ? catMap.get(String(c.parentId)) : null;
      const grandParent = parent?.parentId ? catMap.get(String(parent.parentId)) : null;

      targets.push({
        _id: c._id,
        name: c.name,
        slug: c.slug,
        parentName: parent?.name || '',
        grandParentName: grandParent?.name || '',
        currentImage: img,
        reason: isMissing ? 'MISSING' : `SHARED_URL_${urlCount.get(img)}`,
      });
    }
  }

  console.log(`\n========================================`);
  console.log(`Targeted Fix Identification:`);
  console.log(`Total Categories in Database: ${allCategories.length}`);
  console.log(`Categories to Enrich & Differentiate: ${targets.length}`);
  console.log(`Untouched Distinct Categories: ${allCategories.length - targets.length}`);
  console.log(`========================================\n`);

  const newlyCreatedFiles = [];
  let successCount = 0;
  let failCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < targets.length; i++) {
    const item = targets[i];

    try {
      // Find candidate image
      const candidateUrl = await findCandidateImageUrl(item.name, item.parentName, item.grandParentName);
      const saved = await processAndSaveImage(candidateUrl);

      // Atomic update in MongoDB
      await db.collection('categories').updateOne(
        { _id: item._id },
        { $set: { image: saved.url } }
      );

      newlyCreatedFiles.push(saved.fileName);
      successCount++;
    } catch (err) {
      // Fallback
      try {
        const fallbackUrl = getNextFallback();
        const saved = await processAndSaveImage(fallbackUrl);
        await db.collection('categories').updateOne(
          { _id: item._id },
          { $set: { image: saved.url } }
        );
        newlyCreatedFiles.push(saved.fileName);
        successCount++;
      } catch (fbErr) {
        console.error(`Failed category "${item.name}":`, fbErr.message);
        failCount++;
      }
    }

    if ((i + 1) % 25 === 0 || i + 1 === targets.length) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const percent = (((i + 1) / targets.length) * 100).toFixed(1);
      console.log(`[Progress] ${i + 1}/${targets.length} (${percent}%) | Success: ${successCount}, Fail: ${failCount} | ${elapsed}s`);
    }

    // Polite pacing delay
    await sleep(150);
  }

  // Save list of newly created files
  fs.writeFileSync('storage/new_category_images_list.json', JSON.stringify(newlyCreatedFiles, null, 2));

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n========================================`);
  console.log(`Targeted Image Enrichment Complete!`);
  console.log(`Total Targets: ${targets.length}`);
  console.log(`Successfully Updated: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`New Files Saved: ${newlyCreatedFiles.length}`);
  console.log(`Total Time: ${totalTime}s`);
  console.log(`========================================\n`);

  process.exit(0);
}

runTargetedFix();
