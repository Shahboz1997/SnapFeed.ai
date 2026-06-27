import { VALID_ASPECT_RATIOS } from './image.js';
import { createError } from '../utils/errors.js';
import crypto from 'crypto';

export const BRANCH_A_LOG_PREFIX = '[branch-a/nano-banana]';

function readOptionalModelEnv(primaryKey, legacyKey, defaultValue) {
  if (process.env[primaryKey] !== undefined) {
    const trimmed = process.env[primaryKey].trim();
    return trimmed || null;
  }

  if (legacyKey && process.env[legacyKey] !== undefined) {
    const trimmed = process.env[legacyKey].trim();
    return trimmed || null;
  }

  return defaultValue;
}

export const NANO_BANANA_MODEL =
  process.env.REPLICATE_NANO_BANANA_MODEL?.trim()
  || 'google/nano-banana-2';

export const NANO_BANANA_FALLBACK_MODEL = readOptionalModelEnv(
  'REPLICATE_NANO_BANANA_FALLBACK_MODEL',
  'REPLICATE_PRODUCT_IMAGE_MODEL',
  'black-forest-labs/flux-2-pro',
);

export const NANO_BANANA_TERTIARY_MODEL = readOptionalModelEnv(
  'REPLICATE_PRODUCT_IMAGE_FALLBACK_MODEL',
  null,
  'black-forest-labs/flux-2-max',
);

/** Legacy T2I-only fallback — never receives product image (img2img caused floating products) */
export const BRANCH_A_LEGACY_GROK_MODEL =
  process.env.REPLICATE_BRANCH_A_GROK_MODEL?.trim()
  || 'xai/grok-imagine-image';

export const NANO_BANANA_RESOLUTION =
  process.env.NANO_BANANA_RESOLUTION?.trim() || '2K';

export const NANO_BANANA_OUTPUT_FORMAT =
  process.env.NANO_BANANA_OUTPUT_FORMAT?.trim() || 'png';

export const NANO_BANANA_GOOGLE_SEARCH =
  process.env.NANO_BANANA_GOOGLE_SEARCH === 'true';

export const NANO_BANANA_IMAGE_SEARCH =
  process.env.NANO_BANANA_IMAGE_SEARCH === 'true';

/** native = nano-banana-2 image_input edit (Replicate playground). composite = cutout + Sharp fallback */
export const PRODUCT_PIPELINE_MODE =
  process.env.PRODUCT_PIPELINE_MODE?.trim() || 'native';

export const NANO_BANANA_MAX_REFERENCE_IMAGES = 14;

export const NANO_BANANA_ASPECT_RATIOS = [
  '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', 'match_input_image',
];

export const NANO_BANANA_RESOLUTIONS = ['512px', '1K', '2K', '4K'];

export const REPLICATE_BURST_DELAY_MS = Number(process.env.REPLICATE_BURST_DELAY_MS) || 0;

/** Fallback Y-ratio when elevated-platform auto-detection fails (Grok top-face front edge) */
export const BRANCH_A_SURFACE_FALLBACK_RATIO = {
  square: 0.58,
  story: 0.60,
};

/** Horizon ratio for exhibition platform / podium scenes (plumbing, cosmetics, generic studio) */
export const BRANCH_A_PLATFORM_HORIZON_RATIO = {
  square: 0.63,
  story: 0.58,
};

/** Vanity-table surface sits slightly higher in frame */
export const BRANCH_A_VANITY_HORIZON_RATIO = {
  square: 0.60,
  story: 0.56,
};

/** Horizon ratio for flat-floor scenes (vehicles, large objects on showroom/road) */
export const BRANCH_A_FLAT_FLOOR_HORIZON_RATIO = {
  square: 0.69,
  story: 0.72,
};

/** @deprecated Alias — use BRANCH_A_SURFACE_FALLBACK_RATIO */
export const BRANCH_A_HORIZON_RATIO = BRANCH_A_SURFACE_FALLBACK_RATIO;

/** Pixels to sink product bottom into the detected surface (eliminates anti-alias gap) */
export const BRANCH_A_SURFACE_SINK_PX = 4;

export const BRANCH_A_SHADOW = {
  blur: 6,
  opacity: 0.85,
  verticalSquash: 0.08,
  offsetY: 0,
  contactBandRatio: 0.12,
};

/** Max product height when composited outside through a door/window opening */
export const BRANCH_A_EXTERIOR_OPENING_MAX_HEIGHT_RATIO = {
  square: 0.26,
  story: 0.22,
};

/** Vertical center of the exterior opening band (ratio from top of canvas) */
export const BRANCH_A_EXTERIOR_OPENING_CENTER_Y_RATIO = {
  square: 0.34,
  story: 0.30,
};

export const BRANCH_A_CACHE_VERSION = 'composite-v17-stable-catalog-prompt';

export const VALID_BRANCH_A_FORMATS = new Set(VALID_ASPECT_RATIOS);

export function parseBranchAIncludeText(value) {
  return value === true;
}

export function validateBranchAGenerationParams({
  format,
  includeText,
  userWish = '',
  overlayText = null,
} = {}) {
  if (!format || !VALID_BRANCH_A_FORMATS.has(format)) {
    throw createError(
      `format must be one of: ${[...VALID_BRANCH_A_FORMATS].join(', ')}.`,
      400,
    );
  }

  if (typeof includeText !== 'boolean') {
    throw createError('includeText must be a boolean.', 400);
  }

  if (userWish !== undefined && userWish !== null && typeof userWish !== 'string') {
    throw createError('userWish must be a string when provided.', 400);
  }

  if (includeText && overlayText !== null && overlayText !== undefined) {
    if (typeof overlayText !== 'string' || !overlayText.trim()) {
      throw createError('overlayText must be a non-empty string when includeText is true.', 400);
    }
  }

  return {
    format,
    includeText,
    userWish: typeof userWish === 'string' ? userWish : '',
    overlayText: typeof overlayText === 'string' ? overlayText.trim() : null,
  };
}

export function resolveBranchAHorizonRatio(format) {
  const envOverride = Number(process.env.PODIUM_HORIZON_RATIO);
  if (Number.isFinite(envOverride) && envOverride > 0.4 && envOverride < 0.9) {
    return envOverride;
  }

  return BRANCH_A_SURFACE_FALLBACK_RATIO[format] ?? BRANCH_A_SURFACE_FALLBACK_RATIO.square;
}

export function resolveBranchASurfaceFallbackY(format, canvasHeight) {
  return Math.round(canvasHeight * resolveBranchAHorizonRatio(format));
}

export function resolveBranchAFlatFloorHorizonRatio(format, canvasWidth, canvasHeight) {
  if (canvasHeight > canvasWidth) {
    return BRANCH_A_FLAT_FLOOR_HORIZON_RATIO.story;
  }

  return BRANCH_A_FLAT_FLOOR_HORIZON_RATIO.square;
}

export function resolveBranchAFlatFloorTop(format, canvasWidth, canvasHeight, itemHeight) {
  const horizonRatio = resolveBranchAFlatFloorHorizonRatio(format, canvasWidth, canvasHeight);
  return Math.round(
    (canvasHeight * horizonRatio) - itemHeight + (itemHeight * 0.02),
  );
}

export function resolveBranchAPlatformHorizonRatio(format, surfaceContext) {
  const envOverride = Number(process.env.PLATFORM_HORIZON_RATIO);
  if (Number.isFinite(envOverride) && envOverride > 0.4 && envOverride < 0.9) {
    return envOverride;
  }

  if (surfaceContext === 'vanity_surface') {
    return BRANCH_A_VANITY_HORIZON_RATIO[format] ?? BRANCH_A_VANITY_HORIZON_RATIO.square;
  }

  return BRANCH_A_PLATFORM_HORIZON_RATIO[format] ?? BRANCH_A_PLATFORM_HORIZON_RATIO.square;
}

export function resolveBranchAPlatformSurfaceY(format, canvasHeight, surfaceContext = 'elevated_platform') {
  return Math.round(canvasHeight * resolveBranchAPlatformHorizonRatio(format, surfaceContext));
}

export function resolveBranchASurfaceSinkPx(itemHeight, isFlatFloor) {
  if (isFlatFloor) {
    return Math.round(itemHeight * 0.02);
  }

  return Math.max(BRANCH_A_SURFACE_SINK_PX, Math.round(itemHeight * 0.035));
}

export function resolveBranchAAspectRatio(format) {
  if (format === 'story') {
    return '9:16';
  }

  if (format === 'square') {
    return '1:1';
  }

  throw createError(`Unsupported Branch A format "${format}".`, 400);
}

export function buildNanoBanana2Input({
  prompt,
  aspectRatio,
  imageInputs = [],
  resolution = NANO_BANANA_RESOLUTION,
  outputFormat = NANO_BANANA_OUTPUT_FORMAT,
  googleSearch = NANO_BANANA_GOOGLE_SEARCH,
  imageSearch = NANO_BANANA_IMAGE_SEARCH,
} = {}) {
  const input = {
    prompt,
    aspect_ratio: aspectRatio,
    resolution,
    output_format: outputFormat,
    google_search: googleSearch,
    image_search: imageSearch,
  };

  if (imageInputs.length) {
    input.image_input = imageInputs.slice(0, NANO_BANANA_MAX_REFERENCE_IMAGES);
  }

  return input;
}

export function buildNanoBananaBackgroundInput(originalProductBase64, cleanUserWish, fillPrompt) {
  return buildNanoBanana2Input({
    prompt: `${fillPrompt}. ${cleanUserWish || ''}`.trim(),
    aspectRatio: '1:1',
    imageInputs: [`data:image/png;base64,${originalProductBase64}`],
  });
}

function deriveDeterministicSeed(prompt, productDataUri = null) {
  const hash = crypto
    .createHash('md5')
    .update(`${prompt}${productDataUri?.slice(-256) || ''}`)
    .digest('hex');
  return Number.parseInt(hash.slice(0, 8), 16);
}

function isNanoBananaModel(model) {
  return typeof model === 'string' && model.startsWith('google/nano-banana');
}

function isFlux2Model(model) {
  return typeof model === 'string' && /^black-forest-labs\/flux-2-(pro|max|dev|flex)/.test(model);
}

function isGrokModel(model) {
  return typeof model === 'string' && model.startsWith('xai/grok-imagine');
}

function isFluxSchnellModel(model) {
  return typeof model === 'string' && model.includes('flux-schnell');
}

export function buildBranchABackgroundInput(model, prompt, aspectRatio, productDataUri = null) {
  if (isNanoBananaModel(model)) {
    return buildNanoBanana2Input({
      prompt,
      aspectRatio,
      imageInputs: productDataUri ? [productDataUri] : [],
    });
  }

  if (isFlux2Model(model)) {
    const input = {
      prompt,
      aspect_ratio: aspectRatio,
      resolution: process.env.FLUX_PRODUCT_IMAGE_RESOLUTION?.trim() || '2 MP',
      output_format: 'png',
      output_quality: 95,
      safety_tolerance: 2,
      seed: deriveDeterministicSeed(prompt, productDataUri),
    };

    if (productDataUri) {
      input.input_images = [productDataUri];
    }

    return input;
  }

  if (isFluxSchnellModel(model)) {
    return {
      prompt,
      aspect_ratio: aspectRatio,
      num_outputs: 1,
      output_format: 'png',
      disable_safety_checker: false,
    };
  }

  if (isGrokModel(model)) {
    return {
      prompt,
      aspect_ratio: aspectRatio,
      num_outputs: 1,
    };
  }

  return { prompt, aspect_ratio: aspectRatio };
}

export function resolveBranchABackgroundMode(model, productDataUri) {
  if (isGrokModel(model)) {
    return 'text-to-image';
  }

  if (productDataUri && isNanoBananaModel(model)) {
    return 'nano-banana-native-edit';
  }

  return productDataUri ? 'image-to-image-reference' : 'text-to-image';
}

export function usesNativeNanoBananaEdit(model, productDataUri) {
  return Boolean(productDataUri) && isNanoBananaModel(model);
}

export function resolveBranchAExteriorOpeningCenterY(format, canvasHeight) {
  const ratio = BRANCH_A_EXTERIOR_OPENING_CENTER_Y_RATIO[format]
    ?? BRANCH_A_EXTERIOR_OPENING_CENTER_Y_RATIO.square;
  return Math.round(canvasHeight * ratio);
}

export function resolveBranchAExteriorOpeningTop(format, canvasWidth, canvasHeight, itemHeight) {
  const centerY = resolveBranchAExteriorOpeningCenterY(format, canvasHeight);
  return Math.max(0, Math.min(centerY - Math.round(itemHeight / 2), canvasHeight - itemHeight));
}

export function resolveBranchAModelsToTry() {
  const enableGrok = process.env.REPLICATE_BRANCH_A_ENABLE_GROK === 'true';

  return [
    NANO_BANANA_MODEL,
    NANO_BANANA_FALLBACK_MODEL,
    NANO_BANANA_TERTIARY_MODEL,
    ...(enableGrok ? [BRANCH_A_LEGACY_GROK_MODEL] : []),
  ].filter((model, index, list) => model && list.indexOf(model) === index);
}

export function logBranchA(stage, details = {}) {
  const payload = Object.keys(details).length ? ` ${JSON.stringify(details)}` : '';
  console.log(`${BRANCH_A_LOG_PREFIX} ${stage}${payload}`);
}
