import sharp from 'sharp';
import { normalizeBase64Image } from './productImageAnalysis.js';
import {
  buildLightBackgroundCutout,
  normalizeImageToPngBuffer,
  removeImageBackgroundFromBuffer,
  removeStudioBackdropFromBuffer,
} from './backgroundRemoval.js';
import { normalizeUiTryOnCategory } from '../constants/tryOnModels.js';

/** IDM-VTON expects garment images on a 3:4 portrait canvas (768×1024). */
export const TRYON_WIDTH = 768;
export const TRYON_HEIGHT = 1024;
const FULL_LENGTH_GARMENT_HEIGHT_RATIO = 0.96;

const TRYON_BG_REMOVAL_MODEL = ['small', 'medium', 'large'].includes(process.env.TRYON_BG_REMOVAL_MODEL)
  ? process.env.TRYON_BG_REMOVAL_MODEL
  : 'medium';

function shouldAnchorFullLengthGarment(category) {
  const uiCategory = normalizeUiTryOnCategory(category);
  return uiCategory === 'dress' || uiCategory === 'bottom';
}

async function isolateGarmentBuffer(inputBuffer, category) {
  const anchorFullLength = shouldAnchorFullLengthGarment(category);
  const preferLocalFirst = process.env.TRYON_BG_REMOVAL_LOCAL_FIRST !== 'false';

  if (preferLocalFirst) {
    try {
      const localCutout = anchorFullLength
        ? await removeStudioBackdropFromBuffer(inputBuffer)
        : await buildLightBackgroundCutout(inputBuffer);
      if (localCutout?.length) {
        console.log('[try-on] Garment isolated locally (no Replicate bg-removal call).');
        return localCutout;
      }
    } catch (error) {
      console.warn('[try-on] Local garment isolation failed:', error?.message || error);
    }
  }

  try {
    return await removeImageBackgroundFromBuffer(inputBuffer, { model: TRYON_BG_REMOVAL_MODEL });
  } catch (error) {
    console.warn('[try-on] Replicate background removal failed:', error?.message || error);
  }

  if (anchorFullLength) {
    try {
      return removeStudioBackdropFromBuffer(inputBuffer);
    } catch (error) {
      console.warn('[try-on] Studio backdrop removal failed:', error?.message || error);
    }
  }

  return normalizeImageToPngBuffer(inputBuffer);
}

async function fitTopGarmentToCanvas(inputBuffer) {
  const finalGarment = await sharp(inputBuffer)
    .ensureAlpha()
    .trim({ threshold: 10 })
    .resize({
      width: TRYON_WIDTH,
      height: TRYON_HEIGHT,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      position: 'centre',
    })
    .png()
    .toBuffer();

  return finalGarment;
}

async function fitFullLengthGarmentToCanvas(inputBuffer) {
  const trimmed = await sharp(inputBuffer)
    .ensureAlpha()
    .trim({ threshold: 10 })
    .toBuffer();

  const { width = 1, height = 1 } = await sharp(trimmed).metadata();
  const targetHeight = Math.round(TRYON_HEIGHT * FULL_LENGTH_GARMENT_HEIGHT_RATIO);
  const targetWidth = Math.min(
    TRYON_WIDTH,
    Math.max(1, Math.round(width * (targetHeight / height))),
  );

  const scaledGarment = await sharp(trimmed)
    .resize({
      width: targetWidth,
      height: targetHeight,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: TRYON_WIDTH,
      height: TRYON_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: scaledGarment, gravity: 'north' }])
    .png()
    .toBuffer();
}

async function fitDressGarmentToCanvas(inputBuffer) {
  const trimmed = await sharp(inputBuffer)
    .ensureAlpha()
    .trim({ threshold: 10 })
    .toBuffer();

  const { width = 1, height = 1 } = await sharp(trimmed).metadata();
  const aspect = height / width;

  // Only upscale to near-full canvas when the product photo is already a tall full-length dress.
  // Mini/cocktail dress shots must keep natural proportions — otherwise IDM-VTON lengthens the hem.
  if (aspect >= 1.35) {
    return fitFullLengthGarmentToCanvas(inputBuffer);
  }

  return sharp(trimmed)
    .resize({
      width: TRYON_WIDTH,
      height: TRYON_HEIGHT,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      position: 'north',
    })
    .png()
    .toBuffer();
}

async function trimAndFitToTryOnCanvas(inputBuffer, category) {
  const uiCategory = normalizeUiTryOnCategory(category);
  let finalGarment;

  if (uiCategory === 'dress') {
    finalGarment = await fitDressGarmentToCanvas(inputBuffer);
  } else if (uiCategory === 'bottom') {
    finalGarment = await fitFullLengthGarmentToCanvas(inputBuffer);
  } else {
    finalGarment = await fitTopGarmentToCanvas(inputBuffer);
  }

  const outputMeta = await sharp(finalGarment).metadata();
  if (outputMeta.width !== TRYON_WIDTH || outputMeta.height !== TRYON_HEIGHT) {
    throw new Error(
      `Try-on garment must be ${TRYON_WIDTH}x${TRYON_HEIGHT} (3:4), got ${outputMeta.width}x${outputMeta.height}`,
    );
  }

  return finalGarment;
}

export async function prepareGarmentImage(inputBuffer, category = null) {
  try {
    const noBgBuffer = await isolateGarmentBuffer(inputBuffer, category);
    return trimAndFitToTryOnCanvas(noBgBuffer, category);
  } catch (error) {
    console.error('Ошибка в tryOnImagePrep:', error);
    throw new Error('Не удалось подготовить изображение одежды.');
  }
}

export async function prepareTryOnGarmentImage(base64Image, category = null) {
  const rawBase64 = normalizeBase64Image(base64Image);
  const inputBuffer = Buffer.from(rawBase64, 'base64');
  const finalGarment = await prepareGarmentImage(inputBuffer, category);
  return `data:image/png;base64,${finalGarment.toString('base64')}`;
}

export async function isVerticalGarmentPhoto(base64Image) {
  const rawBase64 = normalizeBase64Image(base64Image);
  const metadata = await sharp(Buffer.from(rawBase64, 'base64')).metadata();
  const { width = 0, height = 0 } = metadata;

  if (!width || !height) {
    return false;
  }

  return height > width;
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
