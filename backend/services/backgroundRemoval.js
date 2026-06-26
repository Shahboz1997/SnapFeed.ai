import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import sharp from 'sharp';
import { REPLICATE_BG_REMOVAL_MODEL } from '../constants/image.js';
import { getReplicate, isReplicateConfigured } from '../config/replicate.js';
import { resolveReplicateImageUrl } from '../utils/replicateOutput.js';
import { normalizeBase64Image } from './productImageAnalysis.js';

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMGLY_DIST_URL = `${pathToFileURL(
  path.join(BACKEND_ROOT, 'node_modules/@imgly/background-removal-node/dist'),
).href}/`;

const BG_REMOVAL_ENABLED = process.env.PRODUCT_BG_REMOVAL_ENABLED !== 'false';
const BG_REMOVAL_MODEL = ['small', 'medium', 'large'].includes(process.env.PRODUCT_BG_REMOVAL_MODEL)
  ? process.env.PRODUCT_BG_REMOVAL_MODEL
  : 'small';

const TRYON_BG_REMOVAL_MODEL = ['small', 'medium', 'large'].includes(process.env.TRYON_BG_REMOVAL_MODEL)
  ? process.env.TRYON_BG_REMOVAL_MODEL
  : 'medium';

const LIGHT_BG_THRESHOLD = 235;

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

function buildImglyConfig(model) {
  return {
    publicPath: IMGLY_DIST_URL,
    debug: process.env.PRODUCT_BG_REMOVAL_DEBUG === 'true',
    model,
    output: {
      format: 'image/png',
      quality: 1,
    },
  };
}

export async function normalizeImageToPngBuffer(inputBuffer) {
  if (!inputBuffer?.length) {
    throw new Error('Empty image buffer.');
  }

  return sharp(inputBuffer).rotate().png().toBuffer();
}

const STUDIO_BG_TOLERANCE = 45;

function sampleRgbPixel(data, width, channels, x, y) {
  const offset = (y * width + x) * channels;
  return [data[offset], data[offset + 1], data[offset + 2]];
}

function rgbDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export async function removeStudioBackdropFromBuffer(inputBuffer, tolerance = STUDIO_BG_TOLERANCE) {
  const pngBuffer = await normalizeImageToPngBuffer(inputBuffer);
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const corners = [
    sampleRgbPixel(data, width, channels, 0, 0),
    sampleRgbPixel(data, width, channels, width - 1, 0),
    sampleRgbPixel(data, width, channels, 0, height - 1),
    sampleRgbPixel(data, width, channels, width - 1, height - 1),
  ];

  const bgColor = [
    Math.round(corners.reduce((sum, color) => sum + color[0], 0) / corners.length),
    Math.round(corners.reduce((sum, color) => sum + color[1], 0) / corners.length),
    Math.round(corners.reduce((sum, color) => sum + color[2], 0) / corners.length),
  ];

  for (let i = 0; i < width * height; i += 1) {
    const offset = i * channels;
    const pixel = [data[offset], data[offset + 1], data[offset + 2]];

    if (rgbDistance(pixel, bgColor) <= tolerance) {
      data[offset + 3] = 0;
    }
  }

  return sharp(data, {
    raw: {
      width,
      height,
      channels: 4,
    },
  }).png().toBuffer();
}

async function removeLightBackgroundWithSharp(pngBuffer) {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;

  for (let i = 0; i < info.width * info.height; i += 1) {
    const offset = i * channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];

    if (r >= LIGHT_BG_THRESHOLD && g >= LIGHT_BG_THRESHOLD && b >= LIGHT_BG_THRESHOLD) {
      data[offset + 3] = 0;
    }
  }

  return sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  }).png().toBuffer();
}

export async function buildLightBackgroundCutout(inputBuffer) {
  const pngBuffer = await normalizeImageToPngBuffer(inputBuffer);
  return removeLightBackgroundWithSharp(pngBuffer);
}

function bufferToPngDataUri(buffer) {
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

async function removeBackgroundWithImgly(pngBuffer, model) {
  const removeBackground = await getRemoveBackground();
  const imageBlob = new Blob([pngBuffer], { type: 'image/png' });
  const resultBlob = await removeBackground(imageBlob, buildImglyConfig(model));
  const cutoutBuffer = await blobToBuffer(resultBlob);
  return normalizeImageToPngBuffer(cutoutBuffer);
}

async function removeBackgroundViaReplicate(pngBuffer) {
  const output = await getReplicate().run(REPLICATE_BG_REMOVAL_MODEL, {
    input: {
      image: bufferToPngDataUri(pngBuffer),
      threshold: 0,
      background_type: 'rgba',
      format: 'png',
    },
  });

  const remoteUrl = resolveReplicateImageUrl(output);
  if (!remoteUrl) {
    throw new Error('Replicate background removal returned no image URL.');
  }

  const response = await fetch(remoteUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch Replicate cutout: ${response.status}`);
  }

  return normalizeImageToPngBuffer(Buffer.from(await response.arrayBuffer()));
}

async function removeBackgroundWithLocalFallbacks(pngBuffer) {
  try {
    return await removeStudioBackdropFromBuffer(pngBuffer);
  } catch (studioError) {
    console.warn('[bg-removal] Studio backdrop fallback failed, using light-background fallback:', studioError?.message || studioError);
    return removeLightBackgroundWithSharp(pngBuffer);
  }
}

export async function removeImageBackgroundFromBuffer(inputBuffer, options = {}) {
  const model = ['small', 'medium', 'large'].includes(options.model)
    ? options.model
    : BG_REMOVAL_MODEL;

  const pngBuffer = await normalizeImageToPngBuffer(inputBuffer);
  const preferReplicate = process.platform === 'win32' || process.env.PRODUCT_BG_REMOVAL_BACKEND === 'replicate';

  if (preferReplicate && isReplicateConfigured()) {
    try {
      return await removeBackgroundViaReplicate(pngBuffer);
    } catch (error) {
      console.warn('[bg-removal] Replicate removal failed:', error?.message || error);
    }
  } else if (!preferReplicate) {
    try {
      return await removeBackgroundWithImgly(pngBuffer, model);
    } catch (error) {
      console.warn('[bg-removal] IMGLY failed:', error?.message || error);
    }

    if (isReplicateConfigured()) {
      try {
        return await removeBackgroundViaReplicate(pngBuffer);
      } catch (error) {
        console.warn('[bg-removal] Replicate removal failed:', error?.message || error);
      }
    }
  }

  console.warn('[bg-removal] Using studio backdrop fallback.');
  return removeBackgroundWithLocalFallbacks(pngBuffer);
}

export async function removeProductBackground(base64Image, options = {}) {
  if (!BG_REMOVAL_ENABLED) {
    return null;
  }

  const rawBase64 = normalizeBase64Image(base64Image);
  if (!rawBase64) {
    return null;
  }

  try {
    const imageBuffer = Buffer.from(rawBase64, 'base64');
    return await removeImageBackgroundFromBuffer(imageBuffer, options);
  } catch (error) {
    console.warn('[bg-removal] Product background removal failed:', error?.message || error);
    return null;
  }
}

export async function removeTryOnGarmentBackground(base64Image) {
  return removeProductBackground(base64Image, { model: TRYON_BG_REMOVAL_MODEL });
}
