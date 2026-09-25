import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { upscaleImageBuffer } from '../services/imageUpscaling.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', '.cache', 'images');

/** Evict files older than this (default 6h). */
const CACHE_TTL_MS = Number(process.env.IMAGE_CACHE_TTL_MS) || 6 * 60 * 60 * 1000;
/** Max files kept on disk (default 200). */
const CACHE_MAX_FILES = Number(process.env.IMAGE_CACHE_MAX_FILES) || 200;

let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function maybeCleanupCache() {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;

  try {
    const entries = await fs.readdir(CACHE_DIR, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(CACHE_DIR, entry.name);
      try {
        const stat = await fs.stat(fullPath);
        files.push({ name: entry.name, path: fullPath, mtimeMs: stat.mtimeMs, size: stat.size });
      } catch {
        // ignore race
      }
    }

    files.sort((a, b) => a.mtimeMs - b.mtimeMs);

    const expired = files.filter((f) => now - f.mtimeMs > CACHE_TTL_MS);
    const overCap = files.length - expired.length > CACHE_MAX_FILES
      ? files.slice(0, files.length - CACHE_MAX_FILES)
      : [];

    const toDelete = new Map();
    for (const f of [...expired, ...overCap]) {
      toDelete.set(f.path, f);
    }

    await Promise.all(
      [...toDelete.values()].map(async (f) => {
        try {
          await fs.unlink(f.path);
        } catch {
          // ignore
        }
      }),
    );
  } catch (error) {
    console.warn('[imageStorage] cache cleanup skipped:', error?.message || error);
  }
}

export async function saveImageBuffer(buffer) {
  await ensureCacheDir();
  void maybeCleanupCache();
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
