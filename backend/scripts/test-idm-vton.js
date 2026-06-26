/**
 * Quick IDM-VTON smoke test against Replicate.
 *
 * Run from backend folder:
 *   npm run test:tryon
 * Or from project root:
 *   npm run test:tryon
 */
import '../env.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getReplicate } from '../config/replicate.js';
import { IDM_VTON_MODEL } from '../constants/image.js';
import { buildIdmVtonInput } from '../utils/idmVtonInput.js';
import { resolveReplicateImageUrl } from '../utils/replicateOutput.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EXAMPLE_GARM_IMG =
  'https://replicate.delivery/pbxt/Kgw70YCoLWAYv6eQ7fcWf3g2wxPiHvo34DiVMVmTTcvHf4Mh/1651226390029b54a1a3916944b9691fc3e9122d4e_wk_shein_thumbnail_900x.webp';

const EXAMPLE_HUMAN_IMG =
  'https://replicate.delivery/pbxt/Kgw71Am207JpZ6XXLtFeFNyHQhUEPtRiHuGXb7ZP8JgzyNOK/KakaoTalk_Photo_2024-04-04-21-20-19.png';

const input = buildIdmVtonInput({
  garmImg: EXAMPLE_GARM_IMG,
  humanImg: EXAMPLE_HUMAN_IMG,
  category: 'upper_body',
  garmentDes: 'Short sleeve round neck top',
});

console.log(`Running IDM-VTON (${IDM_VTON_MODEL}) via Replicate API...`);
console.log('Input:', JSON.stringify(input, null, 2));

const output = await getReplicate().run(IDM_VTON_MODEL, { input });

const imageUrl = resolveReplicateImageUrl(output);
if (!imageUrl) {
  console.error('Unexpected output shape:', output);
  process.exit(1);
}

console.log('Output URL:', imageUrl);

const outPath = path.join(__dirname, '..', '.cache', 'idm-vton-test.png');
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const response = await fetch(imageUrl);
if (!response.ok) {
  throw new Error(`Failed to fetch output: ${response.status}`);
}

fs.writeFileSync(outPath, Buffer.from(await response.arrayBuffer()));
console.log('Saved to:', outPath);
