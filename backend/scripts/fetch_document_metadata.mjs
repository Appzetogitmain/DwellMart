import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';

cloudinary.config({
  cloud_name: 'rs1pmelm',
  api_key: '986393224745528',
  api_secret: '8npKZ3GwTCEqiM6k8eKIH7ScxSc'
});

async function main() {
  console.log('--- Fetching Complete Document Catalog & Metadata ---');

  // Query all items in document folders or with document formats
  const searchExpr = 'folder:vendor_documents OR folder:vendors/documents OR folder:documents OR format:pdf OR format:doc OR format:docx OR format:xls OR format:xlsx';
  
  let nextCursor = null;
  const allDocs = [];

  do {
    const query = cloudinary.search
      .expression(searchExpr)
      .max_results(500)
      .with_field('context')
      .with_field('tags')
      .with_field('image_metadata');

    if (nextCursor) {
      query.next_cursor(nextCursor);
    }

    const res = await query.execute();
    if (res.resources) {
      allDocs.push(...res.resources);
    }
    nextCursor = res.next_cursor;
    console.log(`Fetched ${allDocs.length} / ${res.total_count} documents`);
  } while (nextCursor);

  console.log(`\nTotal document items retrieved: ${allDocs.length}`);

  const folderCount = {};
  const formatCount = {};
  let totalBytes = 0;

  for (const doc of allDocs) {
    const folder = doc.asset_folder || (doc.public_id.includes('/') ? doc.public_id.substring(0, doc.public_id.lastIndexOf('/')) : 'root');
    folderCount[folder] = (folderCount[folder] || 0) + 1;
    formatCount[doc.format] = (formatCount[doc.format] || 0) + 1;
    totalBytes += (doc.bytes || 0);
  }

  console.log('\nBreakdown by folder:', folderCount);
  console.log('Breakdown by format:', formatCount);
  console.log(`Total document data size: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB (${totalBytes} bytes)`);

  const uploadsDir = path.resolve('uploads');
  const docMetadataPath = path.join(uploadsDir, 'documents_metadata_detailed.json');
  fs.writeFileSync(docMetadataPath, JSON.stringify(allDocs, null, 2), 'utf8');
  console.log(`\nSaved detailed documents metadata to: ${docMetadataPath}`);

  // Also check if any files are missing from disk in uploads/
  let onDiskCount = 0;
  let missingCount = 0;
  for (const doc of allDocs) {
    const ext = (doc.format || '').toLowerCase();
    let rel = doc.public_id;
    if (ext && !rel.toLowerCase().endsWith(`.${ext}`)) {
      rel = `${rel}.${ext}`;
    }
    const fullPath = path.join(uploadsDir, rel.split('/').join(path.sep));
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).size > 0) {
      onDiskCount++;
    } else {
      missingCount++;
      console.warn(`Missing on disk: ${rel}`);
    }
  }

  console.log(`\nDisk Status for Documents:`);
  console.log(`  Present & non-empty on disk: ${onDiskCount} / ${allDocs.length}`);
  console.log(`  Missing: ${missingCount}`);
}

main().catch(console.error);
