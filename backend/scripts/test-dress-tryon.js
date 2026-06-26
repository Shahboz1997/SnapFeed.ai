import '../env.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareTryOnGarmentImage } from '../services/tryOnImagePrep.js';
import { runIdmVtonTryOn } from '../services/imageGeneration.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dressPath = process.argv[2]
  || path.resolve(
    __dirname,
    '../../.cursor/projects/c-Users-Lenovo-Desktop-SnapFeed-ai/assets/c__Users_Lenovo_AppData_Roaming_Cursor_User_workspaceStorage_cd52d59e7da461895d209fd47ad8ecdc_images_bf26b59e10a70770312fb18c2d905722-be751cc5-6cd9-4898-abaa-5d756eb5f6e5.png',
  );

if (!fs.existsSync(dressPath)) {
  console.error('Dress image not found:', dressPath);
  process.exit(1);
}

const buffer = fs.readFileSync(dressPath);
const base64Image = `data:image/png;base64,${buffer.toString('base64')}`;

const clothingMeta = {
  gender: 'female',
  category: 'dress',
  visionCategory: 'dress',
  description:
    'Black midi dress with square ruffled neckline, short puff sleeves, lace-up corset bodice, high-waisted flared A-line skirt',
  refinedPrompt:
    'Black midi dress with square ruffled neckline, short puff sleeves, lace-up corset bodice, high-waisted flared A-line skirt',
};

console.log('Preparing garment image...');
const garmImg = await prepareTryOnGarmentImage(base64Image);

console.log('Running IDM-VTON try-on for dress (full_body, crop: false)...');
const result = await runIdmVtonTryOn(garmImg, clothingMeta, { seed: 42 });

console.log('Success!');
console.log('Model:', result.selectedModelId, '| type:', result.modelType, '| crop:', result.crop);
console.log('Output URL:', result.remoteUrl);

const outPath = path.join(__dirname, '..', '.cache', 'dress-tryon-test.png');
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const response = await fetch(result.remoteUrl);
if (!response.ok) {
  throw new Error(`Failed to download result: ${response.status}`);
}

fs.writeFileSync(outPath, Buffer.from(await response.arrayBuffer()));
console.log('Saved to:', outPath);
