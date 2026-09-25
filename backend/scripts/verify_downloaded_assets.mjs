import fs from 'fs';
import path from 'path';

const uploadsRoot = path.resolve('uploads');
const manifestPath = path.join(uploadsRoot, 'cloudinary_download_manifest.json');
const masterMetadataPath = path.join(uploadsRoot, 'cloudinary_metadata_all.json');

console.log('--- POST-DOWNLOAD VERIFICATION ---');

if (!fs.existsSync(manifestPath)) {
  console.error('Manifest file missing!');
  process.exit(1);
}

if (!fs.existsSync(masterMetadataPath)) {
  console.error('Master metadata file missing!');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const metadata = JSON.parse(fs.readFileSync(masterMetadataPath, 'utf8'));

console.log(`Manifest records: ${Object.keys(manifest).length}`);
console.log(`Metadata records: ${metadata.length}`);

let missingFiles = 0;
let zeroByteFiles = 0;
let validFiles = 0;
let totalSizeOnDisk = 0;

for (const item of metadata) {
  const ext = (item.format || '').toLowerCase();
  let rel = item.public_id;
  if (ext && !rel.toLowerCase().endsWith(`.${ext}`)) {
    rel = `${rel}.${ext}`;
  }
  const fullPath = path.join(uploadsRoot, rel.split('/').join(path.sep));

  if (!fs.existsSync(fullPath)) {
    missingFiles++;
    console.error(`Missing file: ${rel}`);
  } else {
    const stat = fs.statSync(fullPath);
    if (stat.size === 0) {
      zeroByteFiles++;
      console.error(`Zero-byte file: ${rel}`);
    } else {
      validFiles++;
      totalSizeOnDisk += stat.size;
    }
  }
}

console.log(`\nVerification Results:`);
console.log(`  Valid non-empty files on disk: ${validFiles} / ${metadata.length}`);
console.log(`  Missing files: ${missingFiles}`);
console.log(`  Zero-byte files: ${zeroByteFiles}`);
console.log(`  Total size on disk: ${(totalSizeOnDisk / (1024 * 1024 * 1024)).toFixed(3)} GB (${totalSizeOnDisk} bytes)`);

// Check folder-level metadata files
const folderSet = new Set();
for (const item of metadata) {
  const folder = item.asset_folder || (item.public_id.includes('/') ? item.public_id.substring(0, item.public_id.lastIndexOf('/')) : 'root');
  folderSet.add(folder);
}

console.log(`\nFolder metadata verification (${folderSet.size} folders):`);
for (const folder of folderSet) {
  const folderDir = path.join(uploadsRoot, folder.split('/').join(path.sep));
  const metaFile = path.join(folderDir, '_metadata.json');
  const exists = fs.existsSync(metaFile);
  console.log(`  [${exists ? 'OK' : 'MISSING'}] ${folder} -> ${metaFile}`);
}

console.log('\n--- VERIFICATION FINISHED SUCCESSFULLY ---');
