import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { getReplicate } from '../config/replicate.js';
import {
  IDM_VTON_MODEL,
  IDM_VTON_SEED,
  IDM_VTON_STEPS,
} from '../constants/image.js';
import {
  BRANCH_A_SHADOW,
  BRANCH_A_EXTERIOR_OPENING_MAX_HEIGHT_RATIO,
  resolveBranchAExteriorOpeningTop,
  resolveBranchAFlatFloorHorizonRatio,
  resolveBranchAFlatFloorTop,
  resolveBranchAPlatformSurfaceY,
  resolveBranchASurfaceSinkPx,
  validateBranchAGenerationParams,
  buildBranchABackgroundInput,
  resolveBranchABackgroundMode,
  resolveBranchAModelsToTry,
  logBranchA,
  REPLICATE_BURST_DELAY_MS,
  PRODUCT_PIPELINE_MODE,
} from '../constants/nanoBanana.js';
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
import {
  mapReplicateRateLimitError,
  runWithReplicateRateLimitRetry,
  sleep,
} from '../utils/replicateRateLimit.js';
import {
  normalizeImageToPngBuffer,
  removeProductCutoutForComposite,
} from './backgroundRemoval.js';
import { upscaleImageBuffer } from './imageUpscaling.js';
import { applyTextOverlay } from './textOverlayRender.js';
import {
  DEFAULT_BACKGROUND_SETUP_PROMPT,
  DEFAULT_PRODUCT_FILL_PROMPT,
  normalizeBase64Image,
  PRODUCT_PLACEMENT,
  requiresExteriorOpeningPlacement,
  requiresFlatFloorPlacement,
  resolveGarmentDescription,
  resolveSurfaceContext,
  sanitizeBackgroundSetupPrompt,
  sanitizeUserWish,
  isLifestyleScenePrompt,
  SURFACE_CONTEXT,
  buildCatalogPrompt,
} from './productImageAnalysis.js';

const REPLICATE_TIMEOUT_MS = Number(process.env.REPLICATE_TIMEOUT_MS) || 180_000;
const PRODUCT_REFERENCE_MAX_EDGE = Number(process.env.PRODUCT_REFERENCE_MAX_EDGE) || 768;
const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEBUG_PURE_BACKGROUND_PATH = path.join(BACKEND_ROOT, 'debug_pure_background.png');

/** Default Text-to-Image prompt — empty surface only, never product/fittings. */
export const GROK_EMPTY_SURFACE_PROMPT = DEFAULT_PRODUCT_FILL_PROMPT;

/** @deprecated Alias — use GROK_EMPTY_SURFACE_PROMPT */
export const GROK_EMPTY_PODIUM_PROMPT = GROK_EMPTY_SURFACE_PROMPT;

/** @deprecated Alias — use GROK_EMPTY_SURFACE_PROMPT */
export const GROK_BASE_STUDIO_PRESET = GROK_EMPTY_SURFACE_PROMPT;

const GROK_EMPTY_SURFACE_CORE =
  'High-end premium commercial studio advertising photography. An absolutely empty, clean vacant monochromatic geometric exhibition platform stands in the center, '
  + 'featuring a completely clear and empty top surface ready for product placement';

const GROK_EMPTY_FRAME_SUFFIX = 'Completely empty frame background, no foreign objects.';

const GROK_LIFESTYLE_SCENE_SUFFIX =
  'No hero product, duplicate subject, or large object on the interior floor — only environmental set dressing.';

const GROK_EXTERIOR_OPENING_SUFFIX =
  'The hero product must NOT appear in this background — it will be composited separately. '
  + 'Keep the interior empty of bicycles, vehicles, or large objects on the floor. '
  + 'Show a bright empty exterior through the open entrance only.';

function buildGrokSceneClosingSuffix({ productPlacement, backgroundSetupPrompt } = {}) {
  if (requiresExteriorOpeningPlacement(productPlacement)) {
    return GROK_EXTERIOR_OPENING_SUFFIX;
  }

  if (isLifestyleScenePrompt(backgroundSetupPrompt)) {
    return GROK_LIFESTYLE_SCENE_SUFFIX;
  }

  return GROK_EMPTY_FRAME_SUFFIX;
}

export function isPrebuiltGrokPrompt(text) {
  if (typeof text !== 'string') {
    return false;
  }

  const trimmed = text.trim();
  return trimmed.startsWith('An absolutely empty, vacant clean minimalist')
    || trimmed.startsWith('High-end premium commercial studio');
}

function logBranchABackground(stage, details = {}) {
  logBranchA(stage, details);
}

const PRODUCT_MAX_HEIGHT_RATIO = {
  square: 0.58,
  story: 0.52,
};
const PRODUCT_MAX_WIDTH_RATIO = 0.72;
const ALPHA_CONTACT_THRESHOLD = 20;
const PODIUM_DETECT_SAMPLE_WIDTH = 512;
const PODIUM_DETECT_BG_JUMP = 45;
const PODIUM_DETECT_TOP_FACE_DROP = 25;
const PODIUM_SURFACE_MIN_RATIO = 0.48;
const PODIUM_SURFACE_MAX_RATIO = 0.75;
const PLATFORM_PLATEAU_MIN_ROWS_RATIO = 0.025;
const PLATFORM_PLATEAU_LUM_DELTA = 28;

async function prepareProductReferenceDataUri(imageBuffer) {
  const jpegBuffer = await sharp(imageBuffer)
    .resize(PRODUCT_REFERENCE_MAX_EDGE, PRODUCT_REFERENCE_MAX_EDGE, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 82 })
    .toBuffer();

  return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
}

async function persistImageBuffer(buffer) {
  const upscaledBuffer = await upscaleImageBuffer(buffer);
  const filename = await saveImageBuffer(upscaledBuffer);
  return `/api/generated-images/${filename}`;
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

export function buildStudioBackgroundPrompt(userWish, includeText = false) {
  const manual = sanitizeUserWish(typeof userWish === 'string' ? userWish : '');
  const refinement = manual ? `, ${manual}` : '';
  const textRule = includeText ? ` ${TEXT_OVERLAY_SPACE_RULE}` : ` ${NO_TEXT_IN_IMAGE_RULE}`;

  return `${DEFAULT_PRODUCT_FILL_PROMPT}${refinement}${textRule}`;
}

export function buildGrokBackgroundPrompt({
  backgroundSetupPrompt = null,
  cleanUserWish = '',
  includeText = false,
  productPlacement = PRODUCT_PLACEMENT.INTERIOR_SURFACE,
  useVisionBackground = false,
} = {}) {
  const sanitizedGptStyle = sanitizeBackgroundSetupPrompt(backgroundSetupPrompt);
  const userStyle = sanitizeUserWish(typeof cleanUserWish === 'string' ? cleanUserWish : '');
  const textRule = includeText ? ` ${TEXT_OVERLAY_SPACE_RULE}` : '';
  const sceneSuffix = buildGrokSceneClosingSuffix({
    productPlacement,
    backgroundSetupPrompt: sanitizedGptStyle || userStyle,
  });

  if (sanitizedGptStyle && sanitizedGptStyle !== DEFAULT_BACKGROUND_SETUP_PROMPT) {
    const userSuffix = useVisionBackground || !userStyle ? '' : `. ${userStyle}`;
    return `${sanitizedGptStyle}${userSuffix}. ${sceneSuffix}${textRule}`;
  }

  const userSuffix = userStyle ? `. ${userStyle}` : '';
  const lightingAndBackdrop = userStyle
    ? `${userStyle}. Bright, soft diffused studio light filling the space`
    : 'Bright, soft diffused studio light filling the space, elegant soft gray studio backdrop';

  return `${GROK_EMPTY_SURFACE_CORE}. ${lightingAndBackdrop}. ${sceneSuffix}${textRule}`;
}

/** @deprecated Use buildStudioBackgroundPrompt — kept for backward compatibility */
export function buildProductFillPrompt(userWish, includeText = false) {
  return buildStudioBackgroundPrompt(userWish, includeText);
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
    const cutout = await removeProductCutoutForComposite(originalBuffer);
    if (cutout?.length) {
      return cutout;
    }
  } catch (error) {
    console.warn('[product-composite] Background isolation failed:', error?.message || error);
  }

  throw createError(
    'Product background isolation failed. Could not produce a clean cutout for compositing.',
    500,
  );
}

function resolveAspectRatio(format) {
  if (format === 'story') {
    return '9:16';
  }

  if (format === 'square') {
    return '1:1';
  }

  throw createError(`Unsupported product format "${format}". Expected "square" (1:1) or "story" (9:16).`, 400);
}

function saveDebugPureBackground(buffer) {
  try {
    fs.writeFileSync(DEBUG_PURE_BACKGROUND_PATH, buffer);
    console.log(`[product-composite] Debug: saved ${DEBUG_PURE_BACKGROUND_PATH}`);
  } catch (error) {
    console.warn('[product-composite] Debug background save failed:', error?.message || error);
  }
}

function resolveBackgroundUrl(output) {
  const backgroundUrl = Array.isArray(output)
    ? output[0]
    : (typeof output?.url === 'function' ? output.url() : output);

  if (!backgroundUrl) {
    return null;
  }

  if (backgroundUrl instanceof URL) {
    return backgroundUrl.href;
  }

  if (typeof backgroundUrl === 'string' && backgroundUrl.startsWith('http')) {
    return backgroundUrl;
  }

  return resolveReplicateImageUrl(output);
}

async function fetchBackgroundBuffer(backgroundUrl) {
  const response = await fetch(backgroundUrl);
  if (!response.ok) {
    throw createError(`Failed to fetch generated background: ${response.status}`, 502);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function runBranchABackground(backgroundPrompt, format, productDataUri = null, { requireProductImage = false } = {}) {
  validateBranchAGenerationParams({ format, includeText: false, userWish: '' });

  const aspect_ratio = resolveAspectRatio(format);
  const models = resolveBranchAModelsToTry();

  if (!models.length) {
    throw createError('No Branch A background models configured.', 500);
  }

  if (requireProductImage && !productDataUri) {
    throw createError('Product image reference is required for native edit mode.', 400);
  }

  let lastError;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];

    if (index > 0 && REPLICATE_BURST_DELAY_MS > 0) {
      await sleep(REPLICATE_BURST_DELAY_MS);
    }

    const mode = resolveBranchABackgroundMode(model, productDataUri);
    const input = buildBranchABackgroundInput(model, backgroundPrompt, aspect_ratio, productDataUri);

    logBranchABackground('replicate-input', {
      model,
      mode,
      format,
      aspect_ratio,
      resolution: input.resolution,
      output_format: input.output_format,
      google_search: input.google_search,
      image_search: input.image_search,
      imageInputCount: input.image_input?.length ?? 0,
      hasProductReference: Boolean(productDataUri),
      prompt: `${input.prompt.slice(0, 120)}...`,
    });

    try {
      const output = await withReplicateTimeout(
        runWithReplicateRateLimitRetry(
          () => getReplicate().run(model, { input }),
          { label: `Branch A (${model})` },
        ),
        `Branch A (${model})`,
      );

      const backgroundUrl = resolveBackgroundUrl(output);
      if (!backgroundUrl) {
        throw createError(`Model ${model} did not return an image URL`, 502);
      }

      const backgroundBuffer = await fetchBackgroundBuffer(backgroundUrl);

      logBranchABackground('background-ready', {
        model,
        mode,
        url: backgroundUrl,
        bytes: backgroundBuffer.length,
      });

      return { backgroundBuffer, modelUsed: model, mode };
    } catch (error) {
      lastError = error;
      const message = error?.message || String(error);
      console.warn(`[branch-a/background] Model ${model} failed: ${message}`);

      if (index >= models.length - 1) {
        break;
      }

      logBranchABackground('fallback', {
        failedModel: model,
        nextModel: models[index + 1],
      });
    }
  }

  if (lastError?.statusCode) {
    throw lastError;
  }

  throw mapReplicateError(lastError);
}

async function runSharpCompositePipeline({
  catalogPrompt,
  rawBase64,
  originalBuffer,
  format,
  resolvedSurfaceContext,
  productPlacement,
  overlayText,
  includeText,
}) {
  const emptyScenePrompt = resolveGrokTextToImagePrompt({
    rawWish: '',
    cleanUserWish: '',
    backgroundSetupPrompt: catalogPrompt,
    includeText: false,
    productPlacement,
    useVisionBackground: true,
  });

  const productDataUri = await prepareProductReferenceDataUri(originalBuffer);

  logBranchABackground('parallel-start', { stages: ['imgly-cutout', 'empty-scene-fallback'] });

  const [cutoutBuffer, backgroundResult] = await Promise.all([
    isolateProductCutout(originalBuffer),
    runBranchABackground(emptyScenePrompt, format, productDataUri),
  ]);

  const { backgroundBuffer, modelUsed, mode } = backgroundResult;

  logBranchABackground('composite-fallback-complete', {
    cutoutBytes: cutoutBuffer.length,
    backgroundBytes: backgroundBuffer.length,
    modelUsed,
    mode,
  });

  saveDebugPureBackground(backgroundBuffer);

  const compositeBuffer = await compositeProductToSurface(
    backgroundBuffer,
    cutoutBuffer,
    format,
    resolvedSurfaceContext,
    productPlacement,
  );

  const imageUrl = await persistCompositeImageBuffer(compositeBuffer, {
    overlayText: includeText ? overlayText : null,
    format,
  });

  return { imageUrl, modelUsed, pipeline: 'sharp-composite-fallback' };
}

async function trimProductCutout(cutoutBuffer) {
  const trimmed = await sharp(cutoutBuffer)
    .ensureAlpha()
    .trim({ threshold: ALPHA_CONTACT_THRESHOLD })
    .png()
    .toBuffer();

  const meta = await sharp(trimmed).metadata();
  if (!meta.width || !meta.height) {
    throw createError('Product cutout has invalid dimensions after trim().', 500);
  }

  return trimmed;
}

async function trimAndScaleProductCutout(
  cutoutBuffer,
  canvasWidth,
  canvasHeight,
  format,
  maxHeightRatioOverride = null,
) {
  const cleanItemBuffer = await trimProductCutout(cutoutBuffer);

  const trimmedMeta = await sharp(cleanItemBuffer).metadata();
  const rawWidth = trimmedMeta.width ?? 0;
  const rawHeight = trimmedMeta.height ?? 0;

  if (!rawWidth || !rawHeight) {
    throw createError('Product cutout has invalid dimensions after trim().', 500);
  }

  const defaultMaxHeightRatio = PRODUCT_MAX_HEIGHT_RATIO[format] ?? PRODUCT_MAX_HEIGHT_RATIO.square;
  const maxHeightRatio = maxHeightRatioOverride ?? defaultMaxHeightRatio;
  const maxHeight = Math.round(canvasHeight * maxHeightRatio);
  const maxWidth = Math.round(canvasWidth * PRODUCT_MAX_WIDTH_RATIO);
  const scale = Math.min(maxHeight / rawHeight, maxWidth / rawWidth, 1);

  if (scale >= 1) {
    return cleanItemBuffer;
  }

  return sharp(cleanItemBuffer)
    .resize(Math.round(rawWidth * scale), Math.round(rawHeight * scale), { fit: 'inside' })
    .ensureAlpha()
    .png()
    .toBuffer();
}

async function sampleBackgroundRowLuminance(backgroundBuffer, canvasWidth, canvasHeight) {
  const sampleHeight = Math.max(
    1,
    Math.round(canvasHeight * (PODIUM_DETECT_SAMPLE_WIDTH / canvasWidth)),
  );

  const { data, info } = await sharp(backgroundBuffer)
    .resize(PODIUM_DETECT_SAMPLE_WIDTH, sampleHeight, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const centerX = Math.floor(width * 0.5);
  const rowLuminance = [];

  for (let y = 0; y < height; y += 1) {
    const offset = (y * width + centerX) * channels;
    rowLuminance.push(
      0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2],
    );
  }

  return { rowLuminance, sampleHeight: height, canvasHeight };
}

function detectPlatformTopSurfaceFromLuminance(rowLuminance, scanStart, scanEnd, canvasHeight) {
  const bgSliceEnd = scanStart + Math.max(Math.floor((scanEnd - scanStart) * 0.12), 8);
  const bgSlice = rowLuminance.slice(scanStart, bgSliceEnd);
  const bgLevel = bgSlice.reduce((sum, value) => sum + value, 0) / Math.max(bgSlice.length, 1);
  const threshold = bgLevel + PLATFORM_PLATEAU_LUM_DELTA;
  const minPlateauRows = Math.max(3, Math.floor((scanEnd - scanStart) * PLATFORM_PLATEAU_MIN_ROWS_RATIO));
  const plateaus = [];
  let start = -1;

  for (let y = scanStart; y < scanEnd; y += 1) {
    if (rowLuminance[y] >= threshold) {
      if (start < 0) start = y;
    } else if (start >= 0) {
      plateaus.push({ start, end: y - 1, length: y - start });
      start = -1;
    }
  }

  if (start >= 0) {
    plateaus.push({ start, end: scanEnd - 1, length: scanEnd - start });
  }

  const valid = plateaus.filter((plateau) => plateau.length >= minPlateauRows);
  if (!valid.length) {
    return null;
  }

  const topFaceCandidates = valid.filter((plateau) => {
    const center = (plateau.start + plateau.end) / 2;
    const relativeCenter = center / Math.max(scanEnd, 1);
    return relativeCenter >= 0.42
      && relativeCenter <= 0.74
      && plateau.length <= (scanEnd - scanStart) * 0.24;
  });

  const pickFrom = topFaceCandidates.length ? topFaceCandidates : valid;
  const best = pickFrom.reduce((winner, candidate) => (
    candidate.end > winner.end ? candidate : winner
  ));

  const isLongMass = best.length > (scanEnd - scanStart) * 0.24;
  const surfaceRow = isLongMass
    ? best.start + Math.max(2, Math.round(best.length * 0.06))
    : best.end;

  return {
    surfaceY: Math.round((surfaceRow / scanEnd) * canvasHeight),
    method: isLongMass ? 'platform-cube-top-edge' : 'platform-top-plateau',
    sampleRow: surfaceRow,
    plateauStart: best.start,
    plateauEnd: best.end,
    bgLevel: Math.round(bgLevel),
  };
}

async function detectPodiumSurfaceY(backgroundBuffer, canvasWidth, canvasHeight) {
  const { rowLuminance, sampleHeight } = await sampleBackgroundRowLuminance(
    backgroundBuffer,
    canvasWidth,
    canvasHeight,
  );

  const height = sampleHeight;
  const scanStart = Math.floor(height * 0.35);
  const scanEnd = Math.floor(height * 0.82);
  const bgSliceEnd = scanStart + Math.max(Math.floor((scanEnd - scanStart) * 0.12), 8);
  const bgSlice = rowLuminance.slice(scanStart, bgSliceEnd);
  const bgLevel = bgSlice.reduce((sum, value) => sum + value, 0) / Math.max(bgSlice.length, 1);
  const entryThreshold = bgLevel + PODIUM_DETECT_BG_JUMP;

  let entryRow = -1;
  for (let y = scanStart; y < scanEnd; y += 1) {
    if (rowLuminance[y] >= entryThreshold) {
      entryRow = y;
      break;
    }
  }

  if (entryRow < 0) {
    return detectPodiumSurfaceYLegacy(rowLuminance, scanStart, scanEnd, height, canvasHeight);
  }

  const bandEnd = Math.min(scanEnd, entryRow + Math.max(Math.floor(height * 0.1), 28));
  let peakRow = entryRow;
  let peakLum = rowLuminance[entryRow];

  for (let y = entryRow; y < bandEnd; y += 1) {
    if (rowLuminance[y] > peakLum) {
      peakLum = rowLuminance[y];
      peakRow = y;
    }
  }

  const frontThreshold = peakLum * 0.78;
  let frontRow = peakRow;
  const frontScanEnd = Math.min(scanEnd, peakRow + Math.max(Math.floor(height * 0.08), 20));

  for (let y = peakRow + 1; y < frontScanEnd; y += 1) {
    const lum = rowLuminance[y];
    if (lum < frontThreshold || peakLum - lum >= PODIUM_DETECT_TOP_FACE_DROP) {
      frontRow = y;
      break;
    }
    frontRow = y;
  }

  const surfaceRow = Math.min(frontRow + 1, scanEnd - 1);

  return {
    surfaceY: Math.round((surfaceRow / height) * canvasHeight),
    method: 'top-face-front-edge',
    sampleRow: surfaceRow,
    sampleHeight: height,
    peakGradient: peakLum - bgLevel,
    entryRow,
    peakRow,
    frontRow,
    bgLevel: Math.round(bgLevel),
  };
}

function detectPodiumSurfaceYLegacy(rowLuminance, scanStart, scanEnd, height, canvasHeight) {
  let peakGradient = 0;

  for (let y = scanStart; y < scanEnd - 1; y += 1) {
    const gradient = rowLuminance[y + 1] - rowLuminance[y];
    if (gradient > peakGradient) {
      peakGradient = gradient;
    }
  }

  let bestRow = -1;
  const gradientThreshold = Math.max(PODIUM_DETECT_BG_JUMP * 0.15, peakGradient * 0.85);

  if (peakGradient >= PODIUM_DETECT_BG_JUMP * 0.15) {
    for (let y = scanStart; y < scanEnd - 1; y += 1) {
      const gradient = rowLuminance[y + 1] - rowLuminance[y];
      if (gradient >= gradientThreshold) {
        bestRow = y + 1;
        break;
      }
    }
  }

  if (bestRow < 0) {
    let brightestRow = scanStart;
    let brightestValue = rowLuminance[scanStart] ?? 0;

    for (let y = scanStart; y < scanEnd; y += 1) {
      if ((rowLuminance[y] ?? 0) > brightestValue) {
        brightestValue = rowLuminance[y];
        brightestRow = y;
      }
    }

    bestRow = brightestRow;
  }

  return {
    surfaceY: Math.round((bestRow / height) * canvasHeight),
    method: 'legacy-gradient',
    sampleRow: bestRow,
    sampleHeight: height,
    peakGradient,
  };
}

async function resolveProductSurfaceY(
  backgroundBuffer,
  canvasWidth,
  canvasHeight,
  format,
  surfaceContext = SURFACE_CONTEXT.GENERIC_STUDIO,
) {
  const { rowLuminance, sampleHeight } = await sampleBackgroundRowLuminance(
    backgroundBuffer,
    canvasWidth,
    canvasHeight,
  );

  const scanStart = Math.floor(sampleHeight * 0.35);
  const scanEnd = Math.floor(sampleHeight * 0.82);
  const minY = Math.round(canvasHeight * PODIUM_SURFACE_MIN_RATIO);
  const maxY = Math.round(canvasHeight * PODIUM_SURFACE_MAX_RATIO);

  const detected = await detectPodiumSurfaceY(backgroundBuffer, canvasWidth, canvasHeight);
  const plateau = detectPlatformTopSurfaceFromLuminance(
    rowLuminance,
    scanStart,
    scanEnd,
    canvasHeight,
  );
  const horizonY = resolveBranchAPlatformSurfaceY(format, canvasHeight, surfaceContext);

  const clampY = (value) => Math.max(minY, Math.min(maxY, value));

  const candidates = [
    { y: clampY(detected.surfaceY), method: detected.method },
    ...(plateau ? [{ y: clampY(plateau.surfaceY), method: plateau.method }] : []),
    { y: clampY(horizonY), method: 'platform-horizon' },
  ];

  const best = candidates.reduce((winner, candidate) => (
    candidate.y > winner.y ? candidate : winner
  ));

  return {
    surfaceY: best.y,
    method: `hybrid-${best.method}`,
    detectedY: detected.surfaceY,
    plateauY: plateau?.surfaceY ?? null,
    horizonY,
    detectMethod: detected.method,
  };
}

async function buildContactDropShadow(cleanItemBuffer) {
  const itemMeta = await sharp(cleanItemBuffer).metadata();
  const width = itemMeta.width ?? 0;
  const height = itemMeta.height ?? 0;

  if (!width || !height) {
    throw createError('Product cutout has invalid dimensions for shadow generation.', 500);
  }

  const { data, info } = await sharp(cleanItemBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { channels } = info;
  const shadowData = Buffer.alloc(width * height * 4);
  const contactBandRows = Math.max(
    Math.round(height * (BRANCH_A_SHADOW.contactBandRatio ?? 0.2)),
    8,
  );
  const contactStartRow = height - contactBandRows;

  for (let i = 0; i < width * height; i += 1) {
    const row = Math.floor(i / width);
    const alpha = row >= contactStartRow ? data[i * channels + 3] : 0;
    const offset = i * 4;
    shadowData[offset] = 0;
    shadowData[offset + 1] = 0;
    shadowData[offset + 2] = 0;
    shadowData[offset + 3] = alpha;
  }

  const squashedHeight = Math.max(Math.round(height * BRANCH_A_SHADOW.verticalSquash), 6);

  const shadow = await sharp(shadowData, {
    raw: { width, height, channels: 4 },
  })
    .resize(width, squashedHeight, { fit: 'fill' })
    .blur(BRANCH_A_SHADOW.blur)
    .linear(BRANCH_A_SHADOW.opacity, 0)
    .png()
    .toBuffer();

  return { shadow, shadowWidth: width, shadowHeight: squashedHeight };
}

async function compositeProductToSurface(
  backgroundBuffer,
  cutoutBuffer,
  format,
  surfaceContext = SURFACE_CONTEXT.GENERIC_STUDIO,
  productPlacement = PRODUCT_PLACEMENT.INTERIOR_SURFACE,
) {
  const bgMeta = await sharp(backgroundBuffer).metadata();
  const canvasWidth = bgMeta.width ?? 0;
  const canvasHeight = bgMeta.height ?? 0;

  if (!canvasWidth || !canvasHeight) {
    throw createError('Generated studio background has invalid dimensions.', 502);
  }

  const useExteriorOpeningPlacement = requiresExteriorOpeningPlacement(productPlacement);
  const maxHeightRatio = useExteriorOpeningPlacement
    ? (BRANCH_A_EXTERIOR_OPENING_MAX_HEIGHT_RATIO[format]
      ?? BRANCH_A_EXTERIOR_OPENING_MAX_HEIGHT_RATIO.square)
    : null;

  const cleanItemBuffer = await trimAndScaleProductCutout(
    cutoutBuffer,
    canvasWidth,
    canvasHeight,
    format,
    maxHeightRatio,
  );

  const itemMeta = await sharp(cleanItemBuffer).metadata();
  const itemWidth = itemMeta.width ?? 0;
  const itemHeight = itemMeta.height ?? 0;

  if (!itemWidth || !itemHeight) {
    throw createError('Product cutout has invalid dimensions after scaling.', 500);
  }

  const left = Math.round((canvasWidth - itemWidth) / 2);
  const useFlatFloorPlacement = requiresFlatFloorPlacement(surfaceContext) && !useExteriorOpeningPlacement;

  let top;
  let surfaceY;
  let surfaceMethod;
  let surfaceDiagnostics = null;

  if (useExteriorOpeningPlacement) {
    top = resolveBranchAExteriorOpeningTop(format, canvasWidth, canvasHeight, itemHeight);
    surfaceY = top + itemHeight - Math.round(itemHeight * 0.04);
    surfaceMethod = 'exterior-through-opening';
  } else if (useFlatFloorPlacement) {
    const horizonRatio = resolveBranchAFlatFloorHorizonRatio(format, canvasWidth, canvasHeight);
    top = Math.max(
      0,
      Math.min(
        resolveBranchAFlatFloorTop(format, canvasWidth, canvasHeight, itemHeight),
        canvasHeight - itemHeight,
      ),
    );
    surfaceY = Math.round(canvasHeight * horizonRatio);
    surfaceMethod = 'flat-floor-horizon';
  } else {
    surfaceDiagnostics = await resolveProductSurfaceY(
      backgroundBuffer,
      canvasWidth,
      canvasHeight,
      format,
      surfaceContext,
    );
    surfaceY = surfaceDiagnostics.surfaceY;
    surfaceMethod = surfaceDiagnostics.method;

    const sinkPx = resolveBranchASurfaceSinkPx(itemHeight, false);
    const productBottom = surfaceY + sinkPx;
    top = Math.max(0, Math.min(productBottom - itemHeight, canvasHeight - itemHeight));
  }

  const { shadow, shadowWidth, shadowHeight } = await buildContactDropShadow(cleanItemBuffer);

  const actualProductBottom = top + itemHeight;
  const shadowLeft = Math.round(left + (itemWidth - shadowWidth) / 2);
  const shadowTop = Math.round(
    surfaceY - shadowHeight + BRANCH_A_SHADOW.offsetY,
  );

  logBranchABackground('composite-layers', {
    layers: ['grok-empty-surface', 'sharp-contact-shadow', 'imgly-product-cutout'],
    format,
    surfaceContext,
    productPlacement,
    canvasWidth,
    canvasHeight,
    itemWidth,
    itemHeight,
    left,
    top,
    surfaceY,
    surfaceMethod,
    detectedY: surfaceDiagnostics?.detectedY ?? null,
    plateauY: surfaceDiagnostics?.plateauY ?? null,
    horizonY: surfaceDiagnostics?.horizonY ?? null,
    surfaceSinkPx: useExteriorOpeningPlacement
      ? Math.round(itemHeight * 0.04)
      : useFlatFloorPlacement
        ? Math.round(itemHeight * 0.02)
        : resolveBranchASurfaceSinkPx(itemHeight, false),
    productBottom: actualProductBottom,
    shadowAnchorY: surfaceY,
    shadowBlur: BRANCH_A_SHADOW.blur,
    shadowOpacity: BRANCH_A_SHADOW.opacity,
    shadowVerticalSquash: BRANCH_A_SHADOW.verticalSquash,
    shadowLeft,
    shadowTop,
  });

  return sharp(backgroundBuffer)
    .composite([
      { input: shadow, left: shadowLeft, top: shadowTop },
      { input: cleanItemBuffer, left, top },
    ])
    .png()
    .toBuffer();
}

/** @deprecated Use compositeProductToSurface */
async function compositeProductToPodium(backgroundBuffer, cutoutBuffer, format, surfaceContext, productPlacement) {
  return compositeProductToSurface(backgroundBuffer, cutoutBuffer, format, surfaceContext, productPlacement);
}

function resolveGrokTextToImagePrompt({
  rawWish,
  cleanUserWish,
  backgroundSetupPrompt,
  includeText,
  productPlacement = PRODUCT_PLACEMENT.INTERIOR_SURFACE,
  useVisionBackground = false,
}) {
  if (isPrebuiltGrokPrompt(rawWish)) {
    const suffix = rawWish.trim().endsWith('.') ? '' : '.';
    const base = `${rawWish.trim()}${suffix}`;
    return `${base}${includeText ? ` ${TEXT_OVERLAY_SPACE_RULE}` : ''}`;
  }

  const hasCustomBackground = Boolean(backgroundSetupPrompt)
    && sanitizeBackgroundSetupPrompt(backgroundSetupPrompt) !== DEFAULT_BACKGROUND_SETUP_PROMPT;
  const hasUserStyle = Boolean(cleanUserWish) || hasCustomBackground;

  if (!hasUserStyle) {
    return `${GROK_EMPTY_SURFACE_PROMPT}${includeText ? ` ${TEXT_OVERLAY_SPACE_RULE}` : ''}`;
  }

  return buildGrokBackgroundPrompt({
    backgroundSetupPrompt,
    cleanUserWish,
    includeText,
    productPlacement,
    useVisionBackground: useVisionBackground || hasCustomBackground,
  });
}

async function persistCompositeImageBuffer(buffer, { overlayText = null, format = 'square' } = {}) {
  let outputBuffer = buffer;

  if (overlayText?.trim()) {
    console.log(`Applying Sharp text overlay: "${overlayText.trim()}"`);
    outputBuffer = await applyTextOverlay(outputBuffer, overlayText, format);
  }

  return persistImageBuffer(outputBuffer);
}

function mapReplicateError(error) {
  const rateLimitError = mapReplicateRateLimitError(error);
  if (rateLimitError) {
    return rateLimitError;
  }

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

export async function generateProductImageWithFlux(
  base64Image,
  userWish = '',
  {
    includeText = false,
    overlayText = null,
    format = 'square',
    backgroundSetupPrompt = null,
    surfaceContext = SURFACE_CONTEXT.GENERIC_STUDIO,
    productPlacement = PRODUCT_PLACEMENT.INTERIOR_SURFACE,
    catalogPrompt = null,
    productLabel = '',
  } = {},
) {
  validateBranchAGenerationParams({ format, includeText, userWish, overlayText });

  const rawWish = typeof userWish === 'string' ? userWish.trim() : '';
  const cleanUserWish = isPrebuiltGrokPrompt(rawWish) ? rawWish : sanitizeUserWish(userWish);
  const resolvedSurfaceContext = resolveSurfaceContext(surfaceContext, backgroundSetupPrompt);
  const sanitizedBackgroundSetup = sanitizeBackgroundSetupPrompt(backgroundSetupPrompt);

  const resolvedCatalogPrompt = buildCatalogPrompt({
    imagePrompt: catalogPrompt || '',
    productLabel,
    backgroundSetupPrompt: sanitizedBackgroundSetup,
    surfaceContext: resolvedSurfaceContext,
    userWish: cleanUserWish,
  });

  const useNativePipeline = PRODUCT_PIPELINE_MODE !== 'composite';

  logBranchABackground('generation-start', {
    pipeline: useNativePipeline
      ? 'nano-banana-2-native-edit (Replicate playground)'
      : 'sharp-composite',
    format,
    includeText,
    models: resolveBranchAModelsToTry(),
    promptLength: resolvedCatalogPrompt.length,
    surfaceContext: resolvedSurfaceContext,
    productPlacement,
    productPipelineMode: PRODUCT_PIPELINE_MODE,
  });

  try {
    const rawBase64 = normalizeBase64Image(base64Image);
    const originalBuffer = await normalizeImageToPngBuffer(Buffer.from(rawBase64, 'base64'));
    const productDataUri = await prepareProductReferenceDataUri(originalBuffer);

    if (useNativePipeline) {
      try {
        const { backgroundBuffer, modelUsed, mode } = await runBranchABackground(
          resolvedCatalogPrompt,
          format,
          productDataUri,
          { requireProductImage: true },
        );

        logBranchABackground('native-edit-complete', {
          modelUsed,
          mode,
          bytes: backgroundBuffer.length,
        });

        const imageUrl = await persistCompositeImageBuffer(backgroundBuffer, {
          overlayText: includeText ? overlayText : null,
          format,
        });

        return {
          imageUrl,
          optimizedPrompt: resolvedCatalogPrompt,
          modelUsed,
          pipeline: 'nano-banana-native-edit',
        };
      } catch (nativeError) {
        console.warn(
          '[branch-a] Native nano-banana edit failed, falling back to Sharp composite:',
          nativeError?.message || nativeError,
        );
      }
    }

    const fallback = await runSharpCompositePipeline({
      catalogPrompt: resolvedCatalogPrompt,
      rawBase64,
      originalBuffer,
      format,
      resolvedSurfaceContext,
      productPlacement,
      overlayText,
      includeText,
    });

    return {
      imageUrl: fallback.imageUrl,
      optimizedPrompt: resolvedCatalogPrompt,
      modelUsed: fallback.modelUsed,
      pipeline: fallback.pipeline,
    };
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
