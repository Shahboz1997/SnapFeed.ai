import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imagePath = process.argv[2]
  || path.resolve(__dirname, '../../.cursor/projects/c-Users-Lenovo-Desktop-SnapFeed-ai/assets/c__Users_Lenovo_AppData_Roaming_Cursor_User_workspaceStorage_cd52d59e7da461895d209fd47ad8ecdc_images_photo_2026-06-24_02-48-58-e158b98b-1b25-4bf5-88bd-73623ed55e95.png');

const format = process.argv[3] || 'story';
const outputPath = path.resolve(__dirname, `../test-output-product-${format}.png`);

async function main() {
  if (!fs.existsSync(imagePath)) {
    console.error('Image not found:', imagePath);
    process.exit(1);
  }

  const buffer = fs.readFileSync(imagePath);
  const base64Image = buffer.toString('base64');

  console.log(`Testing product generation (${format}) with image: ${imagePath}`);
  console.log(`Image size: ${(buffer.length / 1024).toFixed(1)} KB`);

  const start = Date.now();
  const response = await fetch('http://localhost:5000/api/generate-product-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base64Image,
      image: base64Image,
      platform: 'instagram',
      format,
      mode: 'product',
      includeText: false,
      lang: 'ru',
    }),
  });

  const data = await response.json();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  if (!response.ok) {
    console.error(`Failed (${response.status}) after ${elapsed}s:`, data.error || data);
    process.exit(1);
  }

  console.log(`Success in ${elapsed}s`);
  console.log('Branch:', data.branchUsed);
  console.log('Hashtags:', data.hashtags?.join(' '));
  console.log('Prompt preview:', data.optimizedPrompt?.slice(0, 120) + '...');

  if (data.imageUrl?.startsWith('data:image')) {
    const b64 = data.imageUrl.split(',')[1];
    fs.writeFileSync(outputPath, Buffer.from(b64, 'base64'));
    console.log('Saved:', outputPath);
  } else if (data.imageUrl?.startsWith('/api/')) {
    const imgRes = await fetch(`http://localhost:5000${data.imageUrl}`);
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());
    fs.writeFileSync(outputPath, imgBuf);
    console.log('Saved:', outputPath);
  } else {
    console.log('Image URL:', data.imageUrl);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
