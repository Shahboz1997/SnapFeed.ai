import sharp from 'sharp';
import { normalizeBase64Image } from './productImageAnalysis.js';
import { isBackgroundRemovalEnabled, removeProductBackground } from './backgroundRemoval.js';

const TRYON_WIDTH = 768;
const TRYON_HEIGHT = 1024;
const VISION_MAX_EDGE = 1024;
const TRYON_BG_REMOVAL_ENABLED = process.env.TRYON_BG_REMOVAL_ENABLED === 'true';

async function loadGarmentBuffer(base64Image) {
  const rawBase64 = normalizeBase64Image(base64Image);
  let inputBuffer = Buffer.from(rawBase64, 'base64');

  if (TRYON_BG_REMOVAL_ENABLED && isBackgroundRemovalEnabled()) {
    try {
      const isolatedBuffer = await removeProductBackground(base64Image);
      if (isolatedBuffer?.length) {
        inputBuffer = isolatedBuffer;
      }
    } catch {
      // Keep the original photo when background removal fails.
    }
  }

  return inputBuffer;
}

async function flattenToRgbBuffer(inputBuffer) {
  return sharp(inputBuffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .toBuffer();
}

async function trimAndFitGarment(inputBuffer) {
  const flattened = await flattenToRgbBuffer(inputBuffer);

  let trimmed = flattened;
  try {
    trimmed = await sharp(flattened).trim({ threshold: 12 }).toBuffer();
  } catch {
    trimmed = flattened;
  }

  return sharp(trimmed)
    .resize(TRYON_WIDTH, TRYON_HEIGHT, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
      position: 'centre',
    })
    .jpeg({ quality: 95 })
    .toBuffer();
}

export async function prepareTryOnGarmentImage(base64Image) {
  const inputBuffer = await loadGarmentBuffer(base64Image);
  const outputBuffer = await trimAndFitGarment(inputBuffer);
  return `data:image/jpeg;base64,${outputBuffer.toString('base64')}`;
}

export async function isTallGarmentPhoto(base64Image) {
  const rawBase64 = normalizeBase64Image(base64Image);
  const metadata = await sharp(Buffer.from(rawBase64, 'base64')).metadata();
  const { width = 0, height = 0 } = metadata;

  if (!width || !height) {
    return false;
  }

  return height / width >= 1.2;
}

export async function compressImageForVision(base64Image) {
  const rawBase64 = normalizeBase64Image(base64Image);
  const inputBuffer = Buffer.from(rawBase64, 'base64');
  const metadata = await sharp(inputBuffer).metadata();
  const { width = 0, height = 0 } = metadata;
  const maxEdge = Math.max(width, height);

  let pipeline = sharp(inputBuffer);

  if (maxEdge > VISION_MAX_EDGE) {
    pipeline = pipeline.resize({
      width: width >= height ? VISION_MAX_EDGE : undefined,
      height: height > width ? VISION_MAX_EDGE : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  const outputBuffer = await pipeline.jpeg({ quality: 82 }).toBuffer();

  return `data:image/jpeg;base64,${outputBuffer.toString('base64')}`;
}
