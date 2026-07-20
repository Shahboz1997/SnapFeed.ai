import sharp from 'sharp';
import { createError } from '../utils/errors.js';
import { normalizeBase64Image } from './productImageAnalysis.js';
import {
  normalizeImageToPngBuffer,
  removeImageBackgroundFromBuffer,
  removeStudioBackdropFromBuffer,
  buildLightBackgroundCutout,
} from './backgroundRemoval.js';

/** Clean catalog backdrop — reduces busy retail clutter (shelves, suitcases). */
const STUDIO_BG = { r: 242, g: 242, b: 240, alpha: 255 };
const PAD_RATIO = 0.08;
const MAX_EDGE = 1600;

function envEnabled(name, fallback = true) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  return !['0', 'false', 'no', 'off'].includes(String(raw).trim().toLowerCase());
}

async function isolateProductSubject(inputBuffer) {
  try {
    const cutout = await removeImageBackgroundFromBuffer(inputBuffer, {
      model: process.env.TRYON_BG_REMOVAL_MODEL || 'medium',
    });
    if (cutout?.length) {
      return cutout;
    }
  } catch (error) {
    console.warn('[fashn-garment] BG removal failed:', error?.message || error);
  }

  try {
    return await removeStudioBackdropFromBuffer(inputBuffer);
  } catch {
    // fall through
  }

  try {
    return await buildLightBackgroundCutout(inputBuffer);
  } catch {
    return normalizeImageToPngBuffer(inputBuffer);
  }
}

/**
 * Crop busy product photos to the garment and place on a clean studio backdrop.
 * Improves FASHN fidelity for retail / market stall shots.
 */
export async function prepareFashnProductImage(base64Image) {
  if (!envEnabled('FASHN_GARMENT_CLEANUP', true)) {
    return base64Image;
  }

  const rawBase64 = normalizeBase64Image(base64Image);
  if (!rawBase64) {
    throw createError('Try-on requires a valid garment image.', 400);
  }

  const inputBuffer = Buffer.from(rawBase64, 'base64');
  if (!inputBuffer.length) {
    throw createError('Empty garment image.', 400);
  }

  try {
    const cutout = await isolateProductSubject(inputBuffer);
    const trimmed = await sharp(cutout)
      .ensureAlpha()
      .trim({ threshold: 12 })
      .toBuffer();

    const meta = await sharp(trimmed).metadata();
    const width = meta.width || 1;
    const height = meta.height || 1;
    const padX = Math.max(16, Math.round(width * PAD_RATIO));
    const padY = Math.max(16, Math.round(height * PAD_RATIO));
    const canvasW = width + padX * 2;
    const canvasH = height + padY * 2;

    const composited = await sharp({
      create: {
        width: canvasW,
        height: canvasH,
        channels: 4,
        background: STUDIO_BG,
      },
    })
      .composite([{ input: trimmed, left: padX, top: padY }])
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
        kernel: sharp.kernel.lanczos3,
      })
      .flatten({ background: STUDIO_BG })
      .jpeg({ quality: 95, mozjpeg: true })
      .toBuffer();

    console.log(
      `[fashn-garment] Cleaned product ${width}x${height} → studio canvas for FASHN`,
    );

    return `data:image/jpeg;base64,${composited.toString('base64')}`;
  } catch (error) {
    console.warn(
      '[fashn-garment] Cleanup failed, using original garment:',
      error?.message || error,
    );
    return base64Image;
  }
}
