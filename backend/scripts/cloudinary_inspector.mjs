import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: 'rs1pmelm',
  api_key: '986393224745528',
  api_secret: '8npKZ3GwTCEqiM6k8eKIH7ScxSc'
});

async function run() {
  try {
    const ping = await cloudinary.api.ping();
    console.log('Ping result:', ping);

    const usage = await cloudinary.api.usage();
    console.log('Usage:', JSON.stringify(usage, null, 2));

    for (const rType of ['image', 'raw', 'video']) {
      try {
        const res = await cloudinary.api.resources({
          resource_type: rType,
          type: 'upload',
          max_results: 10
        });
        console.log(`Resource type ${rType} sample count: ${res.resources.length}, total_count/next_cursor: ${res.next_cursor || 'none'}`);
        if (res.resources.length > 0) {
          console.log(`Sample item in ${rType}:`, JSON.stringify(res.resources[0], null, 2));
        }
      } catch (e) {
        console.error(`Error checking ${rType}:`, e.message);
      }
    }

    const folders = await cloudinary.api.root_folders();
    console.log('Root folders:', JSON.stringify(folders, null, 2));

  } catch (err) {
    console.error('Fatal error:', err);
  }
}

run();
