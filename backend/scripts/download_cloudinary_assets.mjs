import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary for generating signed/private download URLs
cloudinary.config({
  cloud_name: 'rs1pmelm',
  api_key: '986393224745528',
  api_secret: '8npKZ3GwTCEqiM6k8eKIH7ScxSc'
});

// Paths and options
const UPLOADS_ROOT = path.resolve('uploads');
const METADATA_PATH = path.resolve('cloudinary_backup/cloudinary_metadata_all.json');
const MANIFEST_PATH = path.resolve(UPLOADS_ROOT, 'cloudinary_download_manifest.json');
const CONCURRENCY = 28;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 45000;

// Reusable HTTP agents with keepAlive for maximum connection reuse & throughput
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 48 });
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 48 });
const client = axios.create({
  httpAgent,
  httpsAgent,
  timeout: REQUEST_TIMEOUT_MS,
  responseType: 'stream'
});

async function main() {
  console.log('====================================================');
  console.log('     CLOUDINARY TO LOCAL ASSETS DOWNLOADER          ');
  console.log('====================================================');
  console.log(`Destination Directory: ${UPLOADS_ROOT}`);

  if (!fs.existsSync(METADATA_PATH)) {
    throw new Error(`Metadata file not found at ${METADATA_PATH}`);
  }

  const raw = fs.readFileSync(METADATA_PATH, 'utf8');
  const items = JSON.parse(raw);
  const totalItems = items.length;
  console.log(`Total assets to download: ${totalItems}`);

  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });

  // Load existing manifest if resuming
  let manifest = {};
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
      // Remove failed items from manifest so they are retried
      for (const key of Object.keys(manifest)) {
        if (manifest[key].status === 'failed') {
          delete manifest[key];
        }
      }
      console.log(`Loaded existing manifest with ${Object.keys(manifest).length} completed records.`);
    } catch {
      console.log('Starting fresh manifest.');
    }
  }

  let completedCount = 0;
  let skippedCount = 0;
  let downloadedCount = 0;
  let failedCount = 0;
  let totalDownloadedBytes = 0;
  const startTime = Date.now();

  function getLocalRelativePath(item) {
    const ext = (item.format || '').toLowerCase();
    let rel = item.public_id;
    if (ext && !rel.toLowerCase().endsWith(`.${ext}`)) {
      rel = `${rel}.${ext}`;
    }
    return rel.split('/').join(path.sep);
  }

  function getDownloadUrl(item, forcePrivate = false) {
    if (item.format === 'pdf' || forcePrivate) {
      return cloudinary.utils.private_download_url(item.public_id, item.format, {
        resource_type: item.resource_type || 'image',
        type: item.type || 'upload'
      });
    }
    return item.secure_url || item.url;
  }

  async function downloadSingleItem(item, attempt = 1, usePrivateUrl = false) {
    // Fast path: if already in manifest with success status, skip immediately
    if (manifest[item.public_id] && (manifest[item.public_id].status === 'downloaded' || manifest[item.public_id].status === 'verified_existing')) {
      skippedCount++;
      completedCount++;
      return;
    }

    const relPath = getLocalRelativePath(item);
    const fullPath = path.join(UPLOADS_ROOT, relPath);
    const targetDir = path.dirname(fullPath);

    // Verify existing file if present on disk
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      if (stat.size > 0 && (item.bytes === 0 || Math.abs(stat.size - item.bytes) < 100 || stat.size === item.bytes)) {
        skippedCount++;
        completedCount++;
        manifest[item.public_id] = {
          public_id: item.public_id,
          format: item.format,
          relative_path: relPath.split(path.sep).join('/'),
          full_path: fullPath,
          bytes: stat.size,
          expected_bytes: item.bytes,
          status: 'verified_existing',
          url: item.secure_url,
          width: item.width,
          height: item.height,
          created_at: item.created_at
        };
        return;
      }
    }

    fs.mkdirSync(targetDir, { recursive: true });
    const tempPath = `${fullPath}.tmp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const downloadUrl = getDownloadUrl(item, usePrivateUrl || item.format === 'pdf');

    try {
      const response = await client.get(downloadUrl);

      const writer = fs.createWriteStream(tempPath);
      let streamBytes = 0;

      await new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => {
          streamBytes += chunk.length;
        });
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
        response.data.on('error', reject);
      });

      const stat = fs.statSync(tempPath);
      if (stat.size === 0) {
        try { fs.unlinkSync(tempPath); } catch {}
        throw new Error('Downloaded file is 0 bytes');
      }

      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
      fs.renameSync(tempPath, fullPath);

      downloadedCount++;
      completedCount++;
      totalDownloadedBytes += stat.size;

      manifest[item.public_id] = {
        public_id: item.public_id,
        format: item.format,
        relative_path: relPath.split(path.sep).join('/'),
        full_path: fullPath,
        bytes: stat.size,
        expected_bytes: item.bytes,
        status: 'downloaded',
        url: item.secure_url,
        width: item.width,
        height: item.height,
        created_at: item.created_at
      };
    } catch (err) {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {}

      const statusCode = err.response?.status;
      // If 401 or 403, immediately switch to private signed download URL
      const shouldTryPrivate = !usePrivateUrl && (statusCode === 401 || statusCode === 403);

      if (shouldTryPrivate) {
        return downloadSingleItem(item, attempt, true);
      }

      if (attempt < MAX_RETRIES) {
        const delay = attempt * 1200;
        await new Promise((r) => setTimeout(r, delay));
        return downloadSingleItem(item, attempt + 1, usePrivateUrl);
      } else {
        failedCount++;
        completedCount++;
        console.error(`\n[FAILED] ${item.public_id} (${err.message})`);
        manifest[item.public_id] = {
          public_id: item.public_id,
          format: item.format,
          relative_path: relPath.split(path.sep).join('/'),
          status: 'failed',
          error: err.message,
          url: item.secure_url
        };
      }
    }
  }

  // Work queue
  let queueIndex = 0;
  let lastProgressReportTime = Date.now();

  function printProgress() {
    const elapsedSec = (Date.now() - startTime) / 1000;
    const mbDownloaded = (totalDownloadedBytes / (1024 * 1024)).toFixed(1);
    const speedMBs = elapsedSec > 0 ? (totalDownloadedBytes / (1024 * 1024) / elapsedSec).toFixed(2) : 0;
    const percent = ((completedCount / totalItems) * 100).toFixed(1);
    const remaining = totalItems - completedCount;
    const ratePerSec = elapsedSec > 0 ? (completedCount / elapsedSec) : 0;
    const etaSec = ratePerSec > 0 ? Math.round(remaining / ratePerSec) : 0;
    const etaMin = (etaSec / 60).toFixed(1);

    process.stdout.write(
      `\r[${percent}%] ${completedCount}/${totalItems} | Down: ${downloadedCount}, Skip: ${skippedCount}, Fail: ${failedCount} | ${mbDownloaded} MB (${speedMBs} MB/s) | ETA: ~${etaMin}m  `
    );
  }

  // Auto-save manifest every 10 seconds
  const manifestInterval = setInterval(() => {
    try {
      fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
    } catch {}
  }, 10000);

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queueIndex < items.length) {
      const currentIndex = queueIndex++;
      const item = items[currentIndex];
      await downloadSingleItem(item);

      const now = Date.now();
      if (now - lastProgressReportTime > 2000) {
        printProgress();
        lastProgressReportTime = now;
      }
    }
  });

  await Promise.all(workers);
  clearInterval(manifestInterval);

  // Final flush of manifest
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  printProgress();
  console.log('\n\n====================================================');
  console.log('               DOWNLOAD SUMMARY                     ');
  console.log('====================================================');
  console.log(`Total Assets Processed: ${completedCount}`);
  console.log(`Successfully Downloaded This Run: ${downloadedCount}`);
  console.log(`Previously Downloaded / Skipped: ${skippedCount}`);
  console.log(`Failed Downloads: ${failedCount}`);
  console.log(`Total Verified Assets: ${downloadedCount + skippedCount}`);
  console.log(`Total Downloaded Data This Run: ${(totalDownloadedBytes / (1024 * 1024)).toFixed(2)} MB`);
  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Total Elapsed Time: ${totalElapsed} seconds`);
  console.log(`Manifest saved to: ${MANIFEST_PATH}`);

  // Copy full metadata to uploads directory
  const destMetadataPath = path.join(UPLOADS_ROOT, 'cloudinary_metadata_all.json');
  fs.copyFileSync(METADATA_PATH, destMetadataPath);
  console.log(`Master metadata file saved to: ${destMetadataPath}`);

  // Create folder-level metadata files
  const folderBuckets = {};
  for (const item of items) {
    const folder = item.asset_folder || (item.public_id.includes('/') ? item.public_id.substring(0, item.public_id.lastIndexOf('/')) : 'root');
    if (!folderBuckets[folder]) folderBuckets[folder] = [];
    folderBuckets[folder].push(item);
  }

  for (const [folder, folderItems] of Object.entries(folderBuckets)) {
    const folderDir = path.join(UPLOADS_ROOT, folder.split('/').join(path.sep));
    if (fs.existsSync(folderDir)) {
      const folderMetaPath = path.join(folderDir, '_metadata.json');
      fs.writeFileSync(folderMetaPath, JSON.stringify(folderItems, null, 2), 'utf8');
    }
  }
  console.log(`Folder-level _metadata.json generated for all ${Object.keys(folderBuckets).length} folders.`);

  if (failedCount === 0) {
    console.log('\n[SUCCESS] 100% of Cloudinary assets and metadata downloaded successfully!');
  } else {
    console.warn(`\n[WARNING] ${failedCount} assets failed to download.`);
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
