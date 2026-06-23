import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { normalizeBase64Image } from './productImageAnalysis.js';

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMGLY_DIST_URL = `${pathToFileURL(
  path.join(BACKEND_ROOT, 'node_modules/@imgly/background-removal-node/dist'),
).href}/`;

const BG_REMOVAL_ENABLED = process.env.PRODUCT_BG_REMOVAL_ENABLED !== 'false';
const BG_REMOVAL_MODEL = ['small', 'medium', 'large'].includes(process.env.PRODUCT_BG_REMOVAL_MODEL)
  ? process.env.PRODUCT_BG_REMOVAL_MODEL
  : 'small';

let removeBackgroundLoader = null;

async function getRemoveBackground() {
  if (!removeBackgroundLoader) {
    removeBackgroundLoader = import('@imgly/background-removal-node').then((mod) => mod.removeBackground);
  }
  return removeBackgroundLoader;
}

async function blobToBuffer(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export function isBackgroundRemovalEnabled() {
  return BG_REMOVAL_ENABLED;
}

export async function removeProductBackground(base64Image) {
  if (!BG_REMOVAL_ENABLED) {
    return null;
  }

  const rawBase64 = normalizeBase64Image(base64Image);
  if (!rawBase64) {
    return null;
  }

  const imageBuffer = Buffer.from(rawBase64, 'base64');
  const removeBackground = await getRemoveBackground();

  const resultBlob = await removeBackground(imageBuffer, {
    publicPath: IMGLY_DIST_URL,
    debug: process.env.PRODUCT_BG_REMOVAL_DEBUG === 'true',
    model: BG_REMOVAL_MODEL,
    output: {
      format: 'image/png',
      quality: 1,
    },
  });

  return blobToBuffer(resultBlob);
}
