import '../env.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Replicate from 'replicate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const IDM_VTON_MODEL =
  'cuuupid/idm-vton:0513734a452173b8173e907e3a59d19a36266e55b48528559432bd21c7d7e985';

const auth = process.env.REPLICATE_API_TOKEN?.trim();
if (!auth || auth === 'your_replicate_api_token_here') {
  console.error('REPLICATE_API_TOKEN is not configured in backend/.env');
  process.exit(1);
}

const replicate = new Replicate({ auth });

console.log('Running IDM-VTON via Replicate API...');

const output = await replicate.run(IDM_VTON_MODEL, {
  input: {
    seed: 42,
    steps: 40,
    category: 'upper_body',
    crop: false,
    force_dc: false,
    mask_only: false,
    garm_img:
      'https://replicate.delivery/pbxt/Kgw70YCoLWAYv6eQ7fcWf3g2wxPiHvo34DiVMVmTTcvHf4Mh/1651226390029b54a1a3916944b9691fc3e9122d4e_wk_shein_thumbnail_900x.webp',
    human_img:
      'https://replicate.delivery/pbxt/Kgw71Am207JpZ6XXLtFeFNyHQhUEPtRiHuGXb7ZP8JgzyNOK/KakaoTalk_Photo_2024-04-04-21-20-19.png',
    garment_des: 'top',
  },
});

const item = Array.isArray(output) ? output[0] : output;

let imageUrl = null;
if (item && typeof item.url === 'function') {
  const url = item.url();
  imageUrl = url instanceof URL ? url.href : String(url);
  console.log('Output URL:', imageUrl);
}

const outPath = path.join(__dirname, '..', '.cache', 'idm-vton-test.png');
fs.mkdirSync(path.dirname(outPath), { recursive: true });

if (item && typeof item.blob === 'function') {
  try {
    const blob = await item.blob();
    const buffer = Buffer.from(await blob.arrayBuffer());
    fs.writeFileSync(outPath, buffer);
  } catch {
    if (!imageUrl) throw new Error('Could not download output image.');
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Failed to fetch output: ${response.status}`);
    fs.writeFileSync(outPath, Buffer.from(await response.arrayBuffer()));
  }
} else if (imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to fetch output: ${response.status}`);
  fs.writeFileSync(outPath, Buffer.from(await response.arrayBuffer()));
} else if (item) {
  fs.writeFileSync(outPath, item);
} else {
  console.error('Unexpected output shape:', output);
  process.exit(1);
}

console.log('Saved to:', outPath);
