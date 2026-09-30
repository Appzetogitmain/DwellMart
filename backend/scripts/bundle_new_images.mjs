import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

const STORAGE_DIR = path.resolve('storage/categories/2026/09');
const NEW_FILES_LIST = path.resolve('storage/new_cleanup_files_list.json');
const OUTPUT_ZIP = path.resolve('new_production_category_images.zip');

async function bundle() {
  console.log('📦 Starting image bundle creation...');
  const fileList = JSON.parse(fs.readFileSync(NEW_FILES_LIST, 'utf8'));
  console.log(`Found ${fileList.length} newly created files in list.`);

  const zip = new AdmZip();
  let added = 0;

  for (const fn of fileList) {
    const fullPath = path.join(STORAGE_DIR, fn);
    if (fs.existsSync(fullPath)) {
      zip.addLocalFile(fullPath);
      added++;
    }
  }

  console.log(`Adding ${added} files to ${OUTPUT_ZIP}...`);
  zip.writeZip(OUTPUT_ZIP);

  const stats = fs.statSync(OUTPUT_ZIP);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`✅ Bundle created successfully: ${OUTPUT_ZIP} (${sizeMB} MB)`);
}

bundle().catch(err => {
  console.error('Error bundling images:', err);
  process.exit(1);
});
