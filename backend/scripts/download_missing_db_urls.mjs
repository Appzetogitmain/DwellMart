import mongoose from 'mongoose';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, '../uploads');

async function downloadMissingUrls() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const allUrls = new Set();

  // Scan products
  const products = await db.collection('products').find({
    $or: [{ image: /cloudinary\.com/ }, { images: /cloudinary\.com/ }]
  }).toArray();
  for (const p of products) {
    if (p.image?.includes('cloudinary.com')) allUrls.add(p.image);
    if (Array.isArray(p.images)) {
      p.images.forEach(img => { if (img?.includes('cloudinary.com')) allUrls.add(img); });
    }
  }

  // Scan brands
  const brands = await db.collection('brands').find({ logo: /cloudinary\.com/ }).toArray();
  brands.forEach(b => { if (b.logo?.includes('cloudinary.com')) allUrls.add(b.logo); });

  // Scan banners
  const banners = await db.collection('banners').find({ image: /cloudinary\.com/ }).toArray();
  banners.forEach(b => { if (b.image?.includes('cloudinary.com')) allUrls.add(b.image); });

  // Scan users
  const users = await db.collection('users').find({ avatar: /cloudinary\.com/ }).toArray();
  users.forEach(u => { if (u.avatar?.includes('cloudinary.com')) allUrls.add(u.avatar); });

  // Scan vendors
  const vendors = await db.collection('vendors').find({
    $or: [{ logo: /cloudinary\.com/ }, { 'documents.gst': /cloudinary\.com/ }, { 'documents.pan': /cloudinary\.com/ }, { 'documents.tradeLicense.url': /cloudinary\.com/ }]
  }).toArray();
  for (const v of vendors) {
    if (v.logo?.includes('cloudinary.com')) allUrls.add(v.logo);
    if (v.documents) {
      Object.values(v.documents).forEach(d => {
        if (typeof d === 'string' && d.includes('cloudinary.com')) allUrls.add(d);
        if (d?.url?.includes('cloudinary.com')) allUrls.add(d.url);
      });
    }
  }

  console.log(`Total unique Cloudinary URLs referenced in MongoDB: ${allUrls.size}`);

  let missing = [];
  for (const url of allUrls) {
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)$/);
    if (match) {
      const relPath = match[1].split('?')[0];
      const targetPath = path.join(UPLOADS_DIR, relPath.split('/').join(path.sep));
      if (!fs.existsSync(targetPath)) {
        missing.push({ url, relPath, targetPath });
      }
    }
  }

  console.log(`Missing from local uploads: ${missing.length}`);

  let downloaded = 0;
  let failed = 0;

  for (const item of missing) {
    try {
      console.log(`Downloading missing: ${item.url}`);
      const res = await axios.get(item.url, { responseType: 'arraybuffer', timeout: 15000 });
      await fsp.mkdir(path.dirname(item.targetPath), { recursive: true });
      await fsp.writeFile(item.targetPath, res.data);
      downloaded++;
    } catch (e) {
      console.warn(`Could not download ${item.url}: ${e.response?.status || e.message}`);
      failed++;
    }
  }

  console.log(`\nDownload summary: ${downloaded} downloaded, ${failed} failed.`);
  await mongoose.disconnect();
}

downloadMissingUrls().catch(console.error);
