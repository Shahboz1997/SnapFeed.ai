import sharp from 'sharp';
import { createError } from '../utils/errors.js';

/**
 * FASHN image preprocessing best practices:
 * https://docs.fashn.ai/guides/image-preprocessing-best-practices
 * - 1k / tryon-v1.6: max 2000px on longest edge
 * - 4k: max 6000px on longest edge
 * - JPEG quality ~95
 */

const JPEG_QUALITY = 95;

function resolveMaxEdge(resolution) {
  const tier = String(resolution || '1k').toLowerCase();
  if (tier === '4k' || tier === '2k') {
    return 6000;
  }
  return 2000;
}

function stripDataUri(value) {
  const trimmed = value.trim();
  const match = trimmed.match(/^data:([^;]+);base64,(.+)$/is);
  if (match) {
    return { mime: match[1].trim().toLowerCase(), base64: match[2].replace(/\s/g, '') };
  }
  return { mime: null, base64: trimmed.replace(/\s/g, '') };
}

/**
 * Prepare a local/base64 image for FASHN (resize + JPEG).
 * Remote http(s) URLs are returned unchanged (CDN preferred by FASHN).
 */
export async function prepareFashnImageInput(value, { fieldName = 'image', resolution = '1k' } = {}) {
  if (typeof value !== 'string' || !value.trim()) {
    throw createError(`Try-on requires ${fieldName}.`, 400);
  }

  const trimmed = value.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  const { base64 } = stripDataUri(trimmed);
  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    throw createError(`Invalid base64 for ${fieldName}.`, 400);
  }

  if (!buffer.length) {
    throw createError(`Empty image for ${fieldName}.`, 400);
  }

  const maxEdge = resolveMaxEdge(resolution);

  try {
    const prepared = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: 'inside',
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos3,
      })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();

    return `data:image/jpeg;base64,${prepared.toString('base64')}`;
  } catch (error) {
    throw createError(
      `Could not preprocess ${fieldName}: ${error?.message || 'invalid image'}.`,
      400,
    );
  }
}
