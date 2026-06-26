import sharp from 'sharp';
import { getReplicate } from '../config/replicate.js';
import {
  FLUX_FILL_FALLBACK_MODEL,
  FLUX_FILL_GUIDANCE,
  FLUX_FILL_MODEL,
  FLUX_FILL_STEPS,
  IDM_VTON_MODEL,
  IDM_VTON_SEED,
  IDM_VTON_STEPS,
} from '../constants/image.js';
import {
  normalizeUiTryOnCategory,
  resolveRequiredModelType,
  selectTryOnModel,
} from '../constants/tryOnModels.js';
import { createError } from '../utils/errors.js';
import { saveImageBuffer } from '../utils/imageStorage.js';
import { NO_TEXT_IN_IMAGE_RULE, TEXT_OVERLAY_SPACE_RULE } from '../utils/textOverlay.js';
import { buildIdmVtonInput, clampIdmVtonSteps, normalizeIdmVtonCategory } from '../utils/idmVtonInput.js';
import { resolveReplicateImageUrl } from '../utils/replicateOutput.js';
import { normalizeImageToPngBuffer, buildLightBackgroundCutout, removeStudioBackdropFromBuffer, removeImageBackgroundFromBuffer } from './backgroundRemoval.js';
import { upscaleImageBuffer } from './imageUpscaling.js';
import { applyTextOverlay } from './textOverlayRender.js';
import {
  detectMimeType,
  normalizeBase64Image,
  resolveGarmentDescription,
  sanitizeUserWish,
} from './productImageAnalysis.js';

const REPLICATE_TIMEOUT_MS = Number(process.env.REPLICATE_TIMEOUT_MS) || 180_000;
const MIN_INPAINT_MASK_RATIO = 0.05;

const DEFAULT_PRODUCT_FILL_PROMPT =
  'High-end commercial studio product photography, clean minimalist concrete platform, '
  + 'soft dramatic cinematic lighting, professional studio backdrop, hyper-realistic, '
  + '8k resolution, sharp focus, ray-tracing shadows, lookbook';

async function persistImageBuffer(buffer) {
  const upscaledBuffer = await upscaleImageBuffer(buffer);
  const filename = await saveImageBuffer(upscaledBuffer);
  return `/api/generated-images/${filename}`;
}

async function persistRemoteImageWithOverlay(url, { overlayText = null, format = 'square' } = {}) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch generated image: ${response.status}`);
  }

  let buffer = Buffer.from(await response.arrayBuffer());

  if (overlayText?.trim()) {
    console.log(`Applying Sharp text overlay: "${overlayText.trim()}"`);
    buffer = await applyTextOverlay(buffer, overlayText, format);
  }

  return persistImageBuffer(buffer);
}

async function persistRemoteImage(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch generated image: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return persistImageBuffer(buffer);
}

export async function persistRemoteImageUrl(url) {
  return persistRemoteImage(url);
}

function bufferToPngDataUri(buffer) {
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

function buildImageDataUri(base64Image) {
  const rawBase64 = normalizeBase64Image(base64Image);
  const mimeType = detectMimeType(base64Image);
  return `data:${mimeType};base64,${rawBase64}`;
}

export function buildProductFillPrompt(userWish, includeText = false) {
  const manual = sanitizeUserWish(typeof userWish === 'string' ? userWish : '');
  const stylePart = manual ? `, ${manual}` : '';
  const textRule = includeText ? ` ${TEXT_OVERLAY_SPACE_RULE}` : ` ${NO_TEXT_IN_IMAGE_RULE}`;

  return `${DEFAULT_PRODUCT_FILL_PROMPT}${stylePart}${textRule}`;
}

function withReplicateTimeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(
        () => reject(createError(`${label} timed out after ${REPLICATE_TIMEOUT_MS}ms`, 504)),
        REPLICATE_TIMEOUT_MS,
      );
    }),
  ]);
}

async function isolateProductCutout(originalBuffer) {
  try {
    const cutout = await removeImageBackgroundFromBuffer(originalBuffer, { model: 'medium' });
    if (cutout?.length) {
      return cutout;
    }
  } catch (error) {
    console.warn('[product-fill] Background isolation failed:', error?.message || error);
  }

  try {
    return await removeStudioBackdropFromBuffer(originalBuffer);
  } catch (error) {
    console.warn('[product-fill] Studio backdrop isolation failed:', error?.message || error);
  }

  try {
    return await buildLightBackgroundCutout(originalBuffer);
  } catch (error) {
    throw createError(
      `Product background isolation failed: ${error?.message || 'unknown error'}`,
      500,
    );
  }
}

async function alignCutoutToOriginal(originalBuffer, cutoutBuffer) {
  const { width = 0, height = 0 } = await sharp(originalBuffer).metadata();

  if (!width || !height) {
    throw createError('Could not read product image dimensions for inpaint mask.', 400);
  }

  return sharp(cutoutBuffer)
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .png()
    .toBuffer();
}

async function maskBufferFromCutoutAlpha(cutoutBuffer) {
  return sharp(cutoutBuffer)
    .ensureAlpha()
    .extractChannel('alpha')
    .negate()
    .png()
    .toBuffer();
}

async function measureInpaintMaskRatio(maskBuffer) {
  const { data, info } = await sharp(maskBuffer)
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (!data.length || !info.width || !info.height) {
    return 0;
  }

  let whitePixels = 0;
  for (let i = 0; i < data.length; i += 1) {
    if (data[i] >= 128) {
      whitePixels += 1;
    }
  }

  return whitePixels / data.length;
}

async function buildInpaintMask(originalBuffer, cutoutBuffer) {
  const alignedCutout = await alignCutoutToOriginal(originalBuffer, cutoutBuffer);
  let maskBuffer = await maskBufferFromCutoutAlpha(alignedCutout);
  let inpaintRatio = await measureInpaintMaskRatio(maskBuffer);

  console.log(`[product-fill] Mask inpaint coverage: ${(inpaintRatio * 100).toFixed(1)}%`);

  if (inpaintRatio >= MIN_INPAINT_MASK_RATIO) {
    return maskBuffer;
  }

  console.warn('[product-fill] Mask has insufficient white area; rebuilding from studio backdrop.');

  const studioCutout = await removeStudioBackdropFromBuffer(originalBuffer);
  const alignedStudioCutout = await alignCutoutToOriginal(originalBuffer, studioCutout);
  maskBuffer = await maskBufferFromCutoutAlpha(alignedStudioCutout);
  inpaintRatio = await measureInpaintMaskRatio(maskBuffer);

  console.log(`[product-fill] Studio mask inpaint coverage: ${(inpaintRatio * 100).toFixed(1)}%`);

  if (inpaintRatio < MIN_INPAINT_MASK_RATIO) {
    throw createError(
      'Could not build a valid inpaint mask. The product background could not be separated from the subject.',
      500,
    );
  }

  return maskBuffer;
}

async function prepareProductFillInputs(base64Image) {
  const rawBase64 = normalizeBase64Image(base64Image);
  const originalBuffer = await normalizeImageToPngBuffer(Buffer.from(rawBase64, 'base64'));
  const cutoutBuffer = await isolateProductCutout(originalBuffer);
  const maskBuffer = await buildInpaintMask(originalBuffer, cutoutBuffer);

  return {
    imageDataUri: bufferToPngDataUri(originalBuffer),
    maskDataUri: bufferToPngDataUri(maskBuffer),
  };
}

function mapReplicateError(error) {
  const message = error?.message || 'Replicate request failed.';
  const needsToken = /unauthorized|authentication|api token/i.test(message);
  const needsBilling = /insufficient credit|billing|payment/i.test(message);

  if (needsToken) {
    return createError('Replicate API token is invalid or missing. Check REPLICATE_API_TOKEN in .env.', 401);
  }

  if (needsBilling) {
    return createError('Replicate account has insufficient credits. Add billing at replicate.com/account.', 402);
  }

  return createError(`Image generation failed: ${message}`, 502);
}

function isFluxFillProModel(model = FLUX_FILL_MODEL) {
  return /flux-fill-pro/i.test(model);
}

function buildFluxFillInput(model, imageDataUri, maskDataUri, prompt, steps, guidance) {
  const base = {
    image: imageDataUri,
    mask: maskDataUri,
    prompt,
    guidance,
    output_format: 'png',
  };

  if (isFluxFillProModel(model)) {
    return {
      ...base,
      steps: Math.min(Math.max(steps, 15), 50),
      guidance: Math.min(Math.max(guidance, 15), 100),
      prompt_upsampling: true,
    };
  }

  return {
    ...base,
    num_inference_steps: Math.max(steps, 20),
    num_outputs: 1,
    output_quality: 95,
    megapixels: 'match_input',
  };
}

async function runFluxFill(imageDataUri, maskDataUri, prompt, model = FLUX_FILL_MODEL) {
  const replicate = getReplicate();
  const isPro = isFluxFillProModel(model);
  const guidance = Math.max(
    Number(FLUX_FILL_GUIDANCE) || (isPro ? 60 : 35),
    isPro ? 15 : 30,
  );
  const steps = Math.max(
    Number(FLUX_FILL_STEPS) || (isPro ? 50 : 28),
    isPro ? 15 : 20,
  );

  console.log(
    `Running FLUX Fill (${model}), steps: ${steps}, guidance: ${guidance}`,
  );

  return withReplicateTimeout(
    replicate.run(model, {
      input: buildFluxFillInput(model, imageDataUri, maskDataUri, prompt, steps, guidance),
    }),
    'FLUX Fill',
  );
}

export async function generateProductImageWithFlux(
  base64Image,
  userWish = '',
  { includeText = false, overlayText = null, format = 'square' } = {},
) {
  const prompt = buildProductFillPrompt(userWish, includeText);

  try {
    const { imageDataUri, maskDataUri } = await prepareProductFillInputs(base64Image);
    const modelsToTry = isFluxFillProModel(FLUX_FILL_MODEL)
      ? [FLUX_FILL_MODEL, FLUX_FILL_FALLBACK_MODEL]
      : [FLUX_FILL_MODEL];

    let lastError = null;
    for (const model of modelsToTry) {
      try {
        const output = await runFluxFill(imageDataUri, maskDataUri, prompt, model);
        const remoteUrl = resolveReplicateImageUrl(output);

        if (!remoteUrl) {
          throw createError('Replicate did not return an image URL.', 502);
        }

        console.log(`FLUX Fill output URL: ${remoteUrl}`);

        const imageUrl = await persistRemoteImageWithOverlay(remoteUrl, {
          overlayText: includeText ? overlayText : null,
          format,
        });
        return { imageUrl, optimizedPrompt: prompt, modelUsed: model };
      } catch (error) {
        lastError = error;
        const isLast = model === modelsToTry[modelsToTry.length - 1];
        if (isLast) break;
        console.warn(
          `[product-fill] ${model} failed (${error?.message || error}); trying ${modelsToTry[modelsToTry.length - 1]}.`,
        );
      }
    }

    if (lastError?.statusCode) throw lastError;
    throw mapReplicateError(lastError);
  } catch (error) {
    if (error.statusCode) throw error;
    throw mapReplicateError(error);
  }
}

export function mapGptCategoryToIdmVton(garmentCategory) {
  return normalizeIdmVtonCategory(garmentCategory);
}

function resolveTryOnGender(clothingMeta) {
  const gender = clothingMeta?.gender;
  return gender === 'male' ? 'male' : 'female';
}

function resolveIdmVtonUiCategory(clothingMeta) {
  const candidates = [
    clothingMeta?.category,
    clothingMeta?.visionCategory,
  ].filter((value) => typeof value === 'string' && value.trim());

  for (const raw of candidates) {
    if (normalizeUiTryOnCategory(raw) === 'dress') {
      return 'dress';
    }
  }

  for (const raw of candidates) {
    if (normalizeUiTryOnCategory(raw) === 'bottom') {
      return 'bottom';
    }
  }

  return 'top';
}

function buildGarmentDescription(clothingMeta, uiCategory) {
  const rawDescription = clothingMeta?.description
    ?? clothingMeta?.refinedPrompt
    ?? '';
  const baseDescription = resolveGarmentDescription(rawDescription);

  if (uiCategory === 'dress') {
    return `A full-length long dress, ${baseDescription}`;
  }

  return baseDescription;
}

export async function runIdmVtonTryOn(
  garmImg,
  clothingMeta,
  { humanImg, seed = IDM_VTON_SEED, garmentHash } = {},
) {
  if (!garmImg) {
    throw createError('Try-on requires a garment image.', 400);
  }

  if (!clothingMeta || typeof clothingMeta !== 'object') {
    throw createError('Try-on requires clothing metadata from GPT Vision.', 400);
  }

  if (!clothingMeta.category && !clothingMeta.visionCategory) {
    throw createError('Try-on requires garment category from GPT Vision (top, bottom or dress).', 400);
  }

  const finalGender = resolveTryOnGender(clothingMeta);
  const uiCategory = resolveIdmVtonUiCategory(clothingMeta);
  const modelType = resolveRequiredModelType(uiCategory);
  const replicateCategory = mapGptCategoryToIdmVton(uiCategory);
  const steps = replicateCategory === 'dresses'
    ? clampIdmVtonSteps(Math.max(IDM_VTON_STEPS, 40))
    : clampIdmVtonSteps(IDM_VTON_STEPS);

  let selectedModel;
  try {
    selectedModel = selectTryOnModel({
      gender: finalGender,
      category: uiCategory,
      garmentHash,
      seed,
    });
  } catch (error) {
    const message = error?.message || 'Failed to select try-on model.';
    throw createError(message, 500);
  }

  const resolvedHumanImg = (typeof humanImg === 'string' && humanImg.trim())
    ? humanImg.trim()
    : selectedModel?.url;
  if (!resolvedHumanImg) {
    throw createError('Try-on requires a human model image URL.', 400);
  }

  const finalDescription = buildGarmentDescription(clothingMeta, uiCategory);

  const input = buildIdmVtonInput({
    garmImg,
    humanImg: resolvedHumanImg,
    category: replicateCategory,
    garmentDes: finalDescription,
    seed,
    steps,
  });

  console.log(
    `Running IDM-VTON (${IDM_VTON_MODEL}), uiCategory: ${uiCategory}, modelType: ${modelType}, `
    + `model: ${selectedModel?.id || 'fallback'}, humanSource: ${humanImg?.trim() ? 'resolved' : 'pool'}, `
    + `replicateCategory: ${input.category}, crop: ${input.crop}, force_dc: ${input.force_dc}, `
    + `garment_des length: ${input.garment_des.length}, steps: ${input.steps}, human_img: ${input.human_img}`,
  );

  try {
    const output = await withReplicateTimeout(
      getReplicate().run(IDM_VTON_MODEL, { input }),
      'IDM-VTON',
    );

    const remoteUrl = resolveReplicateImageUrl(output);
    if (!remoteUrl) {
      throw createError('Replicate did not return an image URL.', 502);
    }

    console.log(`IDM-VTON output URL: ${remoteUrl}`);
    return {
      remoteUrl,
      category: input.category,
      garmentCategory: uiCategory,
      modelUsed: IDM_VTON_MODEL,
      selectedModelId: selectedModel?.id,
      modelType,
      crop: input.crop,
      forceDc: input.force_dc,
    };
  } catch (error) {
    if (error.statusCode) throw error;
    const message = error?.message || 'Replicate IDM-VTON request failed.';
    console.error('IDM-VTON failed:', message);
    throw createError(`Virtual try-on failed: ${message}`, 502);
  }
}
