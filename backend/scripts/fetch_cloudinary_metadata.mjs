import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs/promises';
import path from 'path';

cloudinary.config({
  cloud_name: 'rs1pmelm',
  api_key: '986393224745528',
  api_secret: '8npKZ3GwTCEqiM6k8eKIH7ScxSc'
});

async function fetchAllResources() {
  console.log('--- Fetching Cloudinary Resources Metadata ---');

  const resourceTypes = ['image', 'video', 'raw'];
  const allResources = [];

  for (const rType of resourceTypes) {
    let nextCursor = null;
    let page = 1;
    let typeTotal = 0;

    console.log(`\nFetching resource_type: ${rType}...`);

    do {
      try {
        const options = {
          resource_type: rType,
          type: 'upload',
          max_results: 500,
          tags: true,
          context: true,
          metadata: true
        };
        if (nextCursor) {
          options.next_cursor = nextCursor;
        }

        const res = await cloudinary.api.resources(options);
        const count = res.resources ? res.resources.length : 0;
        typeTotal += count;
        if (res.resources) {
          allResources.push(...res.resources);
        }
        console.log(`Page ${page}: received ${count} ${rType}s (cumulative for type: ${typeTotal}) | rate_limit_remaining: ${res.rate_limit_remaining}`);

        nextCursor = res.next_cursor;
        page++;
      } catch (err) {
        console.error(`Error fetching ${rType} page ${page}:`, err.message);
        break;
      }
    } while (nextCursor);

    console.log(`Total ${rType} resources: ${typeTotal}`);
  }

  console.log(`\nTotal resources fetched across all types: ${allResources.length}`);

  // Summary by folder
  const folderCounts = {};
  let totalBytes = 0;
  for (const item of allResources) {
    const folder = item.asset_folder || (item.public_id.includes('/') ? item.public_id.substring(0, item.public_id.lastIndexOf('/')) : 'root');
    folderCounts[folder] = (folderCounts[folder] || 0) + 1;
    totalBytes += (item.bytes || 0);
  }

  console.log('\n--- Breakdown by folder ---');
  for (const [f, c] of Object.entries(folderCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${f}: ${c}`);
  }
  console.log(`Total storage size: ${(totalBytes / (1024 * 1024 * 1024)).toFixed(3)} GB (${totalBytes} bytes)`);

  const outputDir = path.resolve('./cloudinary_backup');
  await fs.mkdir(outputDir, { recursive: true });

  const metadataPath = path.join(outputDir, 'cloudinary_metadata_all.json');
  await fs.writeFile(metadataPath, JSON.stringify(allResources, null, 2), 'utf-8');
  console.log(`\nMetadata saved to: ${metadataPath}`);

  const summary = {
    totalResources: allResources.length,
    totalBytes,
    totalGigabytes: (totalBytes / (1024 * 1024 * 1024)).toFixed(3),
    folderCounts,
    fetchedAt: new Date().toISOString()
  };
  const summaryPath = path.join(outputDir, 'cloudinary_summary.json');
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`Summary saved to: ${summaryPath}`);
}

fetchAllResources().catch(err => {
  console.error('Fatal fetch error:', err);
  process.exit(1);
});
