import Fashn from 'fashn';
import { createError } from '../utils/errors.js';
import { prepareFashnImageInput } from './fashnImagePrep.js';

/** @see https://docs.fashn.ai — Try-On Max (recommended) + Try-On v1.6 */
const DEFAULT_MODEL = 'tryon-max';
const POLL_TIMEOUT_MS = Number(process.env.FASHN_POLL_TIMEOUT_MS) || 180000;

const CATEGORY_MAP = {
  top: 'tops',
  tops: 'tops',
  upper_body: 'tops',
  upperbody: 'tops',
  bottom: 'bottoms',
  bottoms: 'bottoms',
  lower_body: 'bottoms',
  lowerbody: 'bottoms',
  dress: 'one-pieces',
  dresses: 'one-pieces',
  'one-pieces': 'one-pieces',
  one_pieces: 'one-pieces',
  auto: 'auto',
};

const ASPECT_RATIOS = new Set([
  '21:9', '1:1', '4:3', '3:2', '2:3', '5:4', '4:5', '3:4', '16:9', '9:16',
]);

/** Map SnapFeed UI format → FASHN aspect_ratio */
export function resolveFashnAspectRatio(formatOrRatio) {
  if (!formatOrRatio || typeof formatOrRatio !== 'string') {
    return null;
  }
  const normalized = formatOrRatio.trim().toLowerCase();
  if (normalized === 'story') {
    return '9:16';
  }
  if (normalized === 'square') {
    return '1:1';
  }
  return ASPECT_RATIOS.has(normalized) ? normalized : null;
}

let clientSingleton = null;

export function isFashnConfigured() {
  return Boolean(process.env.FASHN_API_KEY?.trim());
}

function getApiKey() {
  const key = process.env.FASHN_API_KEY?.trim();
  if (!key) {
    throw createError('FASHN API key is not configured.', 500);
  }
  return key;
}

function getClient() {
  if (!clientSingleton) {
    clientSingleton = new Fashn({
      apiKey: getApiKey(),
      // subscribe polls until done — allow long-running try-on jobs
      timeout: POLL_TIMEOUT_MS,
      maxRetries: 2,
    });
  }
  return clientSingleton;
}

export function getFashnModelName() {
  const raw = (process.env.FASHN_TRYON_MODEL || DEFAULT_MODEL).trim().toLowerCase();
  if (raw === 'tryon-v1.6' || raw === 'tryon-v1' || raw === 'v1.6') {
    return 'tryon-v1.6';
  }
  return 'tryon-max';
}

function mapCategory(category) {
  if (!category || typeof category !== 'string') {
    return 'auto';
  }
  return CATEGORY_MAP[category.trim().toLowerCase()] || 'auto';
}

function envBool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  return !['0', 'false', 'no', 'off'].includes(String(raw).trim().toLowerCase());
}

function mapApiError(error) {
  if (error?.statusCode && error.message) {
    return error;
  }

  if (error instanceof Fashn.APIError || error?.status) {
    const status = error.status || 502;
    const message = error.message || 'FASHN API request failed.';

    if (status === 401 || status === 403) {
      return createError('Invalid FASHN API key. Check FASHN_API_KEY in backend/.env.', 502);
    }
    if (status === 429) {
      const lower = message.toLowerCase();
      if (lower.includes('credit') || lower.includes('outofcredits')) {
        return createError('FASHN API credits exhausted. Top up at https://app.fashn.ai/billing', 402);
      }
      return createError('FASHN rate limit exceeded. Please try again shortly.', 429);
    }
    if (status === 400 || status === 422) {
      return createError(message, 400);
    }
    return createError(message, status >= 400 && status < 600 ? status : 502);
  }

  if (error instanceof Fashn.APIConnectionTimeoutError) {
    return createError('FASHN try-on timed out. Please try again.', 504);
  }

  if (error instanceof Fashn.APIConnectionError) {
    return createError('Could not reach FASHN API. Check network / VPN.', 502);
  }

  return createError(error?.message || 'FASHN try-on failed.', 502);
}

function mapRuntimeError(error) {
  if (!error) {
    return createError('FASHN try-on failed.', 502);
  }
  if (typeof error === 'string') {
    return createError(error, 502);
  }

  const name = error.name || '';
  const message = error.message || 'FASHN try-on failed.';

  if (name === 'PoseError') {
    return createError(
      'Could not detect a clear body pose. Use a full-body photo with the person standing clearly visible.',
      400,
    );
  }
  if (name === 'ContentModerationError') {
    return createError('Image blocked by content moderation. Try a different photo.', 400);
  }
  if (name === 'ImageLoadError') {
    return createError(`Could not load image for try-on: ${message}`, 400);
  }
  if (name === 'InputValidationError') {
    return createError(message, 400);
  }

  return createError(name ? `${name}: ${message}` : message, 502);
}

function pickOutputs(output) {
  if (!Array.isArray(output)) {
    return [];
  }
  return output
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim());
}

function pickOutput(output) {
  return pickOutputs(output)[0] ?? null;
}

function buildOutputPayload(outputs, extra = {}) {
  const first = outputs[0];
  return {
    outputs,
    remoteUrl: first && !first.startsWith('data:') ? first : null,
    imageData: first && first.startsWith('data:') ? first : null,
    ...extra,
  };
}

function buildV16Inputs({
  modelImage,
  garmentImage,
  category,
  mode,
  seed,
  returnBase64,
}) {
  const resolvedMode = ['performance', 'balanced', 'quality'].includes(mode)
    ? mode
    : (process.env.FASHN_TRYON_MODE || 'quality');

  const finalMode = ['performance', 'balanced', 'quality'].includes(resolvedMode)
    ? resolvedMode
    : 'quality';

  // Mannequin / on-body product shots → "model". Flat-lay / ghost → set FASHN_GARMENT_PHOTO_TYPE=flat-lay.
  const garmentPhotoType = (process.env.FASHN_GARMENT_PHOTO_TYPE || 'model').trim().toLowerCase();
  const moderationLevel = (process.env.FASHN_MODERATION_LEVEL || 'permissive').trim().toLowerCase();

  return {
    model_image: modelImage,
    garment_image: garmentImage,
    category: mapCategory(category),
    mode: finalMode,
    garment_photo_type: ['auto', 'flat-lay', 'model'].includes(garmentPhotoType)
      ? garmentPhotoType
      : 'model',
    moderation_level: ['conservative', 'permissive', 'none'].includes(moderationLevel)
      ? moderationLevel
      : 'permissive',
    // false = stronger garment swap when original clothes linger on the model
    segmentation_free: envBool('FASHN_SEGMENTATION_FREE', false),
    output_format: (process.env.FASHN_OUTPUT_FORMAT || 'png').toLowerCase() === 'jpeg'
      ? 'jpeg'
      : 'png',
    num_samples: Math.min(4, Math.max(1, Number(process.env.FASHN_NUM_SAMPLES) || 1)),
    return_base64: returnBase64,
    ...(Number.isFinite(seed) ? { seed } : {}),
  };
}

function buildMaxInputs({
  modelImage,
  garmentImage,
  prompt,
  aspectRatio,
  resolution,
  generationMode,
  numImages,
  seed,
  returnBase64,
}) {
  const resolvedResolution = resolution === 'auto' || !resolution
    ? null
    : (['1k', '2k', '4k'].includes(resolution) ? resolution : '1k');

  let resolvedMode = generationMode == null || generationMode === '' || generationMode === 'auto'
    ? null
    : String(generationMode).toLowerCase();
  if (resolvedMode === 'performance') {
    resolvedMode = 'fast';
  }
  if (resolvedMode && !['fast', 'balanced', 'quality'].includes(resolvedMode)) {
    resolvedMode = 'balanced';
  }

  const inputs = {
    model_image: modelImage,
    product_image: garmentImage,
    output_format: (process.env.FASHN_OUTPUT_FORMAT || 'png').toLowerCase() === 'jpeg'
      ? 'jpeg'
      : 'png',
    num_images: Math.min(4, Math.max(1, Number(numImages) || Number(process.env.FASHN_NUM_IMAGES) || 1)),
    return_base64: returnBase64,
  };

  if (resolvedResolution) {
    inputs.resolution = resolvedResolution;
  } else {
    inputs.resolution = '1k';
  }

  if (resolvedMode) {
    inputs.generation_mode = resolvedMode;
  }

  if (prompt && typeof prompt === 'string' && prompt.trim()) {
    inputs.prompt = prompt.trim().slice(0, 500);
  }

  const resolvedAspect = resolveFashnAspectRatio(aspectRatio);
  if (resolvedAspect) {
    inputs.aspect_ratio = resolvedAspect;
  }

  if (Number.isFinite(seed)) {
    inputs.seed = seed;
  }

  return inputs;
}

/**
 * Run FASHN virtual try-on via official SDK (`predictions.subscribe`).
 * Docs: https://docs.fashn.ai/api-reference/tryon-max | https://docs.fashn.ai/api-reference/tryon-v1-6
 */
export async function runFashnTryOn({
  modelImage,
  garmentImage,
  category = 'auto',
  mode,
  prompt = '',
  aspectRatio = null,
  resolution = null,
  generationMode = null,
  numImages = null,
} = {}) {
  const modelName = getFashnModelName();
  const resolvedResolution = (
    resolution
    || process.env.FASHN_TRYON_RESOLUTION
    || '1k'
  ).trim().toLowerCase();
  const returnBase64 = envBool('FASHN_RETURN_BASE64', false);
  const seedRaw = process.env.FASHN_SEED;
  const seed = seedRaw !== undefined && seedRaw !== ''
    ? Number(seedRaw)
    : undefined;

  const prepResolution = modelName === 'tryon-max'
    ? (['1k', '2k', '4k'].includes(resolvedResolution) ? resolvedResolution : '1k')
    : '1k';

  const [preparedModel, preparedGarment] = await Promise.all([
    prepareFashnImageInput(modelImage, { fieldName: 'model_image', resolution: prepResolution }),
    prepareFashnImageInput(garmentImage, { fieldName: 'garment_image', resolution: prepResolution }),
  ]);

  let requestBody;

  if (modelName === 'tryon-v1.6') {
    const v16Mode = mode
      || (generationMode && generationMode !== 'auto' ? generationMode : null)
      || process.env.FASHN_TRYON_MODE
      || 'quality';
    const mappedV16 = v16Mode === 'fast' ? 'performance' : v16Mode;
    const inputs = buildV16Inputs({
      modelImage: preparedModel,
      garmentImage: preparedGarment,
      category,
      mode: mappedV16,
      seed,
      returnBase64,
    });
    requestBody = { model_name: 'tryon-v1.6', inputs };
    console.log(
      `[fashn] Starting tryon-v1.6 category=${inputs.category} mode=${inputs.mode}`
      + ` garment_photo_type=${inputs.garment_photo_type}`,
    );
  } else {
    const resolvedGenerationMode = generationMode
      || mode
      || process.env.FASHN_TRYON_GENERATION_MODE
      || process.env.FASHN_TRYON_MODE
      || 'quality';
    const inputs = buildMaxInputs({
      modelImage: preparedModel,
      garmentImage: preparedGarment,
      prompt,
      aspectRatio,
      resolution: resolvedResolution,
      generationMode: resolvedGenerationMode,
      numImages,
      seed,
      returnBase64,
    });
    requestBody = { model_name: 'tryon-max', inputs };
    console.log(
      `[fashn] Starting tryon-max resolution=${inputs.resolution} mode=${inputs.generation_mode || 'auto'}`
      + ` ratio=${inputs.aspect_ratio || 'default'} n=${inputs.num_images}`,
    );
  }

  let response;
  try {
    response = await getClient().predictions.subscribe(requestBody, {
      timeout: POLL_TIMEOUT_MS,
    });
  } catch (error) {
    throw mapApiError(error);
  }

  if (response.status !== 'completed') {
    throw mapRuntimeError(response.error);
  }

  const outputs = pickOutputs(response.output);
  if (!outputs.length) {
    throw createError('FASHN completed without an output image.', 502);
  }

  console.log(
    `[fashn] Done id=${response.id} credits=${response.creditsUsed ?? 'n/a'} n=${outputs.length}`,
  );

  return buildOutputPayload(outputs, {
    predictionId: response.id,
    modelUsed: modelName,
    creditsUsed: response.creditsUsed ?? null,
    category: modelName === 'tryon-v1.6' ? mapCategory(category) : 'auto',
  });
}

/**
 * GET https://api.fashn.ai/v1/credits
 * @see https://docs.fashn.ai/utility-endpoints/credits
 */
export async function getFashnCreditsBalance() {
  try {
    const data = await getClient().get('/v1/credits');
    return data?.credits || data;
  } catch (error) {
    throw mapApiError(error);
  }
}

/**
 * FASHN Packshot — clean commercial product shot from any product / on-model photo.
 * @see https://help.fashn.ai/using-fashn/studio/packshot
 */
export async function runFashnPackshot({
  productImage,
  prompt = '',
  aspectRatio = null,
  resolution = null,
  generationMode = null,
  numImages = null,
  imageContext = null,
} = {}) {
  const resolvedResolution = (
    resolution
    || process.env.FASHN_PACKSHOT_RESOLUTION
    || process.env.FASHN_TRYON_RESOLUTION
    || '1k'
  ).trim().toLowerCase();
  const returnBase64 = envBool('FASHN_RETURN_BASE64', false);
  const seedRaw = process.env.FASHN_SEED;
  const seed = seedRaw !== undefined && seedRaw !== ''
    ? Number(seedRaw)
    : undefined;

  let resolvedMode = (
    generationMode
    || process.env.FASHN_PACKSHOT_GENERATION_MODE
    || process.env.FASHN_TRYON_GENERATION_MODE
    || process.env.FASHN_TRYON_MODE
    || 'quality'
  );
  if (typeof resolvedMode === 'string') {
    resolvedMode = resolvedMode.trim().toLowerCase();
  }
  if (resolvedMode === 'performance') {
    resolvedMode = 'fast';
  }
  if (resolvedMode === 'auto') {
    resolvedMode = null;
  } else if (!['fast', 'balanced', 'quality'].includes(resolvedMode)) {
    resolvedMode = 'quality';
  }

  const prepResolution = ['1k', '2k', '4k'].includes(resolvedResolution)
    ? resolvedResolution
    : '1k';

  const preparedProduct = await prepareFashnImageInput(productImage, {
    fieldName: 'product_image',
    resolution: prepResolution,
  });

  /** @type {Record<string, unknown>} */
  const inputs = {
    product_image: preparedProduct,
    resolution: prepResolution,
    output_format: (process.env.FASHN_OUTPUT_FORMAT || 'png').toLowerCase() === 'jpeg'
      ? 'jpeg'
      : 'png',
    num_images: Math.min(4, Math.max(1, Number(numImages) || Number(process.env.FASHN_NUM_IMAGES) || 1)),
    return_base64: returnBase64,
  };

  if (resolvedMode) {
    inputs.generation_mode = resolvedMode;
  }

  if (prompt && typeof prompt === 'string' && prompt.trim()) {
    inputs.prompt = prompt.trim().slice(0, 500);
  }

  const resolvedAspect = resolveFashnAspectRatio(aspectRatio);
  if (resolvedAspect) {
    inputs.aspect_ratio = resolvedAspect;
  }

  if (imageContext && typeof imageContext === 'string' && imageContext.trim()) {
    inputs.image_context = await prepareFashnImageInput(imageContext.trim(), {
      fieldName: 'image_context',
      resolution: prepResolution,
    });
  }

  if (Number.isFinite(seed)) {
    inputs.seed = seed;
  }

  console.log(
    `[fashn] Starting packshot resolution=${inputs.resolution} mode=${inputs.generation_mode || 'auto'}`
    + ` ratio=${inputs.aspect_ratio || 'default'} n=${inputs.num_images}`
    + ` promptLen=${(inputs.prompt || '').length}`,
  );

  let response;
  try {
    // model_name "packshot" may be untyped in older SDK — runtime API supports it
    response = await getClient().predictions.subscribe(
      { model_name: 'packshot', inputs },
      { timeout: POLL_TIMEOUT_MS },
    );
  } catch (error) {
    throw mapApiError(error);
  }

  if (response.status !== 'completed') {
    throw mapRuntimeError(response.error);
  }

  const outputs = pickOutputs(response.output);
  if (!outputs.length) {
    throw createError('FASHN packshot completed without an output image.', 502);
  }

  console.log(
    `[fashn] Packshot done id=${response.id} credits=${response.creditsUsed ?? 'n/a'} n=${outputs.length}`,
  );

  return buildOutputPayload(outputs, {
    predictionId: response.id,
    modelUsed: 'packshot',
    creditsUsed: response.creditsUsed ?? null,
  });
}

/**
 * FASHN Product to Model — product / flat-lay → AI model wearing the product.
 * @see https://docs.fashn.ai/api-reference/product-to-model
 */
export async function runFashnProductToModel({
  productImage,
  prompt = '',
  aspectRatio = null,
  resolution = null,
  generationMode = null,
  numImages = null,
  imagePrompt = null,
  faceReference = null,
  backgroundReference = null,
} = {}) {
  const resolvedResolution = (
    resolution
    || process.env.FASHN_PTM_RESOLUTION
    || process.env.FASHN_TRYON_RESOLUTION
    || '1k'
  ).trim().toLowerCase();
  const returnBase64 = envBool('FASHN_RETURN_BASE64', false);
  const seedRaw = process.env.FASHN_SEED;
  const seed = seedRaw !== undefined && seedRaw !== ''
    ? Number(seedRaw)
    : undefined;

  let resolvedMode = (
    generationMode
    || process.env.FASHN_PTM_GENERATION_MODE
    || process.env.FASHN_TRYON_GENERATION_MODE
    || process.env.FASHN_TRYON_MODE
    || 'quality'
  );
  if (typeof resolvedMode === 'string') {
    resolvedMode = resolvedMode.trim().toLowerCase();
  }
  if (resolvedMode === 'performance') {
    resolvedMode = 'fast';
  }
  if (resolvedMode === 'auto') {
    resolvedMode = null;
  } else if (!['fast', 'balanced', 'quality'].includes(resolvedMode)) {
    resolvedMode = 'quality';
  }

  const prepResolution = ['1k', '2k', '4k'].includes(resolvedResolution)
    ? resolvedResolution
    : '1k';

  const preparedProduct = await prepareFashnImageInput(productImage, {
    fieldName: 'product_image',
    resolution: prepResolution,
  });

  /** @type {Record<string, unknown>} */
  const inputs = {
    product_image: preparedProduct,
    resolution: prepResolution,
    output_format: (process.env.FASHN_OUTPUT_FORMAT || 'png').toLowerCase() === 'jpeg'
      ? 'jpeg'
      : 'png',
    num_images: Math.min(4, Math.max(1, Number(numImages) || Number(process.env.FASHN_NUM_IMAGES) || 1)),
    return_base64: returnBase64,
  };

  if (resolvedMode) {
    inputs.generation_mode = resolvedMode;
  }

  if (prompt && typeof prompt === 'string' && prompt.trim()) {
    inputs.prompt = prompt.trim().slice(0, 500);
  }

  const resolvedAspect = resolveFashnAspectRatio(aspectRatio);
  if (resolvedAspect) {
    inputs.aspect_ratio = resolvedAspect;
  }

  if (imagePrompt && typeof imagePrompt === 'string' && imagePrompt.trim()) {
    inputs.image_prompt = await prepareFashnImageInput(imagePrompt.trim(), {
      fieldName: 'image_prompt',
      resolution: prepResolution,
    });
  }

  if (faceReference && typeof faceReference === 'string' && faceReference.trim()) {
    inputs.face_reference = await prepareFashnImageInput(faceReference.trim(), {
      fieldName: 'face_reference',
      resolution: prepResolution,
    });
    inputs.face_reference_mode = 'match_reference';
  }

  if (backgroundReference && typeof backgroundReference === 'string' && backgroundReference.trim()) {
    inputs.background_reference = await prepareFashnImageInput(backgroundReference.trim(), {
      fieldName: 'background_reference',
      resolution: prepResolution,
    });
  }

  if (Number.isFinite(seed)) {
    inputs.seed = seed;
  }

  console.log(
    `[fashn] Starting product-to-model resolution=${inputs.resolution} mode=${inputs.generation_mode || 'auto'}`
    + ` ratio=${inputs.aspect_ratio || 'default'} n=${inputs.num_images}`
    + ` promptLen=${(inputs.prompt || '').length}`,
  );

  let response;
  try {
    response = await getClient().predictions.subscribe(
      { model_name: 'product-to-model', inputs },
      { timeout: POLL_TIMEOUT_MS },
    );
  } catch (error) {
    throw mapApiError(error);
  }

  if (response.status !== 'completed') {
    throw mapRuntimeError(response.error);
  }

  const outputs = pickOutputs(response.output);
  if (!outputs.length) {
    throw createError('FASHN product-to-model completed without an output image.', 502);
  }

  console.log(
    `[fashn] Product-to-model done id=${response.id} credits=${response.creditsUsed ?? 'n/a'} n=${outputs.length}`,
  );

  return buildOutputPayload(outputs, {
    predictionId: response.id,
    modelUsed: 'product-to-model',
    creditsUsed: response.creditsUsed ?? null,
  });
}
