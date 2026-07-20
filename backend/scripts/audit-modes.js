import '../env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imgPath = path.resolve(__dirname, '../../frontend/public/studio-examples/product-to-model-before.png');
const dataUri = `data:image/png;base64,${fs.readFileSync(imgPath).toString('base64')}`;

async function hit(mode) {
  const res = await fetch('http://localhost:5000/api/generate-product-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Guest-Fingerprint': `audit-${mode}-${Date.now()}`,
    },
    body: JSON.stringify({
      image: dataUri,
      base64Image: dataUri,
      mode,
      platform: 'instagram',
      format: 'story',
      lang: 'ru',
      userWish: '',
    }),
  });
  const j = await res.json().catch(() => ({}));
  return {
    modeSent: mode,
    status: res.status,
    branchUsed: j.branchUsed ?? null,
    requestedMode: j.requestedMode ?? null,
    error: j.error ?? null,
    hasImage: Boolean(j.imageUrl),
  };
}

for (const mode of ['packshot', 'product-to-model']) {
  const result = await hit(mode);
  console.log(JSON.stringify(result));
}
