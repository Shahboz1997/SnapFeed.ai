import '../env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getFashnModelName, isFashnConfigured, runFashnTryOn } from '../services/fashnTryOn.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const garmentPath = process.argv[2];
const modelUrl = process.argv[3]
  || 'https://raw.githubusercontent.com/yisol/IDM-VTON/main/gradio_demo/example/human/00121_00.jpg';
const category = process.argv[4] || 'one-pieces';

if (!garmentPath) {
  console.error('Usage: node scripts/run-fashn-tryon.js <garment-image-path> [model-url] [category]');
  process.exit(1);
}

if (!isFashnConfigured()) {
  console.error('FASHN_API_KEY is not configured in backend/.env');
  process.exit(1);
}

const absoluteGarment = path.resolve(garmentPath);
if (!fs.existsSync(absoluteGarment)) {
  console.error('Garment file not found:', absoluteGarment);
  process.exit(1);
}

const buffer = fs.readFileSync(absoluteGarment);
const ext = path.extname(absoluteGarment).toLowerCase();
const mime = ext === '.jpg' || ext === '.jpeg'
  ? 'image/jpeg'
  : ext === '.webp'
    ? 'image/webp'
    : 'image/png';
const garmentDataUri = `data:${mime};base64,${buffer.toString('base64')}`;

console.log('[fashn-script] Starting try-on…');
console.log('[fashn-script] Model API:', getFashnModelName());
console.log('[fashn-script] Garment:', absoluteGarment, `(${Math.round(buffer.length / 1024)} KB)`);
console.log('[fashn-script] Person:', modelUrl);
console.log('[fashn-script] Category:', category);

const started = Date.now();
const result = await runFashnTryOn({
  modelImage: modelUrl,
  garmentImage: garmentDataUri,
  category,
  aspectRatio: '3:4',
});

const outDir = path.join(__dirname, '../tmp');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `fashn-tryon-${Date.now()}.png`);

let outBuffer;
if (result.imageData?.startsWith('data:')) {
  const b64 = result.imageData.replace(/^data:[^;]+;base64,/, '');
  outBuffer = Buffer.from(b64, 'base64');
} else if (result.remoteUrl) {
  const response = await fetch(result.remoteUrl);
  if (!response.ok) {
    throw new Error(`Failed to download output: ${response.status}`);
  }
  outBuffer = Buffer.from(await response.arrayBuffer());
} else {
  throw new Error('No output image from FASHN');
}

fs.writeFileSync(outPath, outBuffer);

console.log('[fashn-script] Done in', Math.round((Date.now() - started) / 1000), 's');
console.log('[fashn-script] Prediction:', result.predictionId);
console.log('[fashn-script] Credits used:', result.creditsUsed ?? 'n/a');
console.log('[fashn-script] Remote URL:', result.remoteUrl || '(base64)');
console.log('[fashn-script] Saved:', outPath);
