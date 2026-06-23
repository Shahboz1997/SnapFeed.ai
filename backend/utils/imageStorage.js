import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { upscaleImageBuffer } from '../services/imageUpscaling.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', '.cache', 'images');

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

export async function saveImageBuffer(buffer) {
  await ensureCacheDir();
  const filename = `${crypto.randomUUID()}.png`;
  await fs.writeFile(path.join(CACHE_DIR, filename), buffer);
  return filename;
}

export async function saveBase64Image(b64Data) {
  const rawBuffer = Buffer.from(b64Data, 'base64');
  const upscaledBuffer = await upscaleImageBuffer(rawBuffer);
  return saveImageBuffer(upscaledBuffer);
}

export function getImagePath(filename) {
  return path.join(CACHE_DIR, path.basename(filename));
}

export function isGeneratedImagePath(imageUrl) {
  return typeof imageUrl === 'string' && imageUrl.startsWith('/api/generated-images/');
}

export function getFilenameFromUrl(imageUrl) {
  return path.basename(imageUrl);
}
