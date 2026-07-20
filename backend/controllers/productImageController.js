import crypto from 'crypto';
import {
  VALID_ASPECT_RATIOS,
  VALID_PLATFORMS,
  PRODUCT_IMAGE_MAX_PROMPT_LENGTH,
} from '../constants/image.js';
import { BRANCH_A_CACHE_VERSION, parseBranchAIncludeText } from '../constants/nanoBanana.js';
import { getOpenAI } from '../config/openai.js';
import { isReplicateConfigured } from '../config/replicate.js';
import { createError, mapOpenAIError } from '../utils/errors.js';
import {
  analyzeProductImage,
  buildFallbackProductFluxPrompt,
  buildProductVisionSystemPrompt,
  buildTryOnRefinedPrompt,
  buildFashnTryOnPrompt,
  buildAnalysisFromCatalogPrompt,
  DEFAULT_BACKGROUND_SETUP_PROMPT,
  detectMimeType,
  inferProductPlacementFromWish,
  isCatalogPrompt,
  normalizeClothingCategoryFromVision,
  normalizeBase64Image,
  normalizeMarketingOverlayText,
  PRODUCT_MODE_PRESET,
  resolveGarmentDescription,
  resolveManualWish,
  resolveProductPlacement,
  sanitizeUserWish,
  SURFACE_CONTEXT,
  analyzeClothingProductForTryOn,
} from '../services/productImageAnalysis.js';
import { generateProductImageWithFlux } from '../services/imageGeneration.js';
import { isFashnConfigured, runFashnTryOn, runFashnPackshot, runFashnProductToModel } from '../services/fashnTryOn.js';
import { prepareFashnProductImage } from '../services/fashnGarmentPrep.js';
import { finishGenerationResponse } from '../services/credits.js';
import { getDefaultHashtags, getLanguageName, normalizeLangCode } from '../utils/languages.js';
import cache from '../utils/cache.js';
import { saveImageBuffer } from '../utils/imageStorage.js';
import { extractQuotedOverlayText } from '../utils/textOverlay.js';
import {
  DEFAULT_FEMALE_FULLBODY_MODEL,
  getTryOnModelPool,
} from '../constants/tryOnModels.js';

const TRYON_CACHE_VERSION = 'v29-studio-garment-cleanup';
const PACKSHOT_CACHE_VERSION = 'v1-fashn-packshot';
const PRODUCT_TO_MODEL_CACHE_VERSION = 'v1-fashn-product-to-model';
const PRODUCT_FILL_CACHE_VERSION = BRANCH_A_CACHE_VERSION;
const VISION_CACHE_VERSION = 'v1-catalog-stable';

const VALID_UI_TRYON_GENDERS = new Set(['male', 'female']);
const VALID_UI_TRYON_CATEGORIES = new Set(['auto', 'top', 'bottom', 'dress']);

const MODE_PRESETS = {
  product: PRODUCT_MODE_PRESET,
};

const TRYON_MALE_MANUAL_KEYWORDS = ['мужской', 'мужская', 'парень', 'мужчина', 'male', 'man'];

function manualWishImpliesMaleModel(manualWish) {
  const normalized = (manualWish || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const padded = ` ${normalized} `;

  return TRYON_MALE_MANUAL_KEYWORDS.some((keyword) => {
    if (keyword === 'man' || keyword === 'male') {
      return new RegExp(`\\s${keyword}\\s`, 'i').test(padded);
    }
    return normalized.includes(keyword);
  });
}

function resolveModelGender(manualWish, gptGender = null, uiGender = null) {
  if (uiGender === 'male' || uiGender === 'female') {
    return uiGender;
  }

  if (manualWishImpliesMaleModel(manualWish)) {
    return 'male';
  }

  const normalizedGptGender = typeof gptGender === 'string'
    ? gptGender.trim().toLowerCase()
    : null;

  if (normalizedGptGender === 'male' || normalizedGptGender === 'female') {
    return normalizedGptGender;
  }

  return 'female';
}

function buildTryOnPreset(resolvedGender) {
  const modelPhrase = resolvedGender === 'male'
    ? 'professional male model'
    : 'professional female model';

  return (
    `Fashion lookbook photography, ${modelPhrase}, lookbook примерка on model, `
    + 'highly detailed clothing texture, soft studio light, realistic skin, dress full body, 8k'
  );
}

function buildFinalUserWish(presetMode, sanitizedManualWish, gptGender = null, uiGender = null) {
  const preset = presetMode === 'tryon'
    ? buildTryOnPreset(resolveModelGender(sanitizedManualWish, gptGender, uiGender))
    : MODE_PRESETS.product;
  const manual = sanitizedManualWish.trim();

  if (!manual) {
    return preset;
  }

  if (presetMode === 'product') {
    return `${preset}, ${manual}`;
  }

  return `${preset}. ${manual}`;
}

function rebuildWishForProductBranch(sanitizedManualWish) {
  return buildFinalUserWish('product', sanitizedManualWish);
}

function resolveProductOverlayText(shouldIncludeText, analysis, manualWish, requestOverlayText = null) {
  if (!shouldIncludeText) {
    return null;
  }

  const raw = (
    (typeof requestOverlayText === 'string' ? requestOverlayText.trim() : '')
    || analysis?.overlayText?.trim()
    || extractQuotedOverlayText(manualWish)
    || ''
  ).trim();

  if (!raw) {
    throw createError(
      'Text overlay is enabled but no marketing slogan was generated. Please try again.',
      502,
    );
  }

  return normalizeMarketingOverlayText(raw);
}

function parseTryOnUiGender(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return VALID_UI_TRYON_GENDERS.has(normalized) ? normalized : null;
}

function parseTryOnUiCategory(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return VALID_UI_TRYON_CATEGORIES.has(normalized) ? normalized : null;
}

function applyUiTryOnOverrides(clothingMeta, uiGender, uiCategory) {
  let gender = clothingMeta.gender;
  let category = clothingMeta.category;
  let visionCategory = clothingMeta.visionCategory;

  if (uiGender) {
    gender = uiGender;
  }

  if (uiCategory) {
    category = normalizeClothingCategoryFromVision(uiCategory);
    visionCategory = uiCategory;
  }

  const description = resolveGarmentDescription(clothingMeta.description);
  const refinedPrompt = buildTryOnRefinedPrompt(gender, description);

  return {
    ...clothingMeta,
    gender,
    category,
    visionCategory,
    description,
    refinedPrompt,
  };
}

function buildTryOnUiCacheSuffix(uiGender, uiCategory, humanImageSuffix = '') {
  return `${uiGender || ''}:${uiCategory || ''}:${humanImageSuffix}`;
}

const VALID_FALLBACK_REASONS = new Set(['not_clothing', 'verification_failed']);

function resolveRequestedMode(generationMode, presetMode) {
  return generationMode || presetMode;
}

function buildImageGenerationResponse({
  imageUrl,
  optimizedPrompt,
  hashtags,
  branchUsed,
  fallbackReason = null,
  requestedMode,
  extractedText = null,
}) {
  const normalizedFallback = typeof fallbackReason === 'string' && VALID_FALLBACK_REASONS.has(fallbackReason)
    ? fallbackReason
    : null;

  return {
    success: true,
    imageUrl,
    optimizedPrompt,
    hashtags,
    extractedText,
    branchUsed,
    fallbackReason: normalizedFallback,
    requestedMode,
  };
}

function enrichCachedImageResponse(cached) {
  return {
    ...cached,
    branchUsed: cached?.branchUsed === 'tryon'
      || cached?.branchUsed === 'product'
      || cached?.branchUsed === 'packshot'
      || cached?.branchUsed === 'product-to-model'
      ? cached.branchUsed
      : 'product',
    fallbackReason: cached?.fallbackReason ?? null,
  };
}

const GARMENT_FIDELITY_RULE =
  'CRITICAL GARMENT FIDELITY: Transfer the exact garment from garm_img unchanged — same hem length, sleeve length, neckline, silhouette, color, texture and print. '
  + 'Do not redesign, lengthen, shorten, crop or restyle the clothing. Only place the original cut-out garment onto the model body.';

const SLAVIC_APPEARANCE_HINTS = [
  'русск', 'россий', 'славян', 'slavic', 'russian', 'европ', 'european',
];

const ELEGANT_APPEARANCE_HINTS = [
  'красив', 'beautiful', 'elegant', 'модел', 'lookbook', 'vogue', 'стильн',
];

const YOUNG_AGE_HINTS = [
  'молод', 'young', 'teen', 'юнош', 'девушк', 'подрост', 'girl', 'boy',
  'молодая модель', 'young model', 'yosh', 'javan',
];

const ADULT_AGE_HINTS = [
  'взросл', 'adult', 'взрослая модель', 'adult model', 'kattalar',
];

const MATURE_AGE_HINTS = [
  'зрел', 'mature', 'зрелая модель', 'mature model', 'katta',
];

const CLOTHING_TRY_ON_KEYWORDS = [
  'модель',
  'примерка',
  'lookbook',
  'надеть',
  'одежда',
  'на человеке',
  'на девушке',
  'на парне',
  'female model',
  'male model',
  'on model',
  'try on',
  'tryon',
  'modelga',
  'kiyim',
  'kiydir',
  'модела',
  'либос',
];

const DRESS_CATEGORY_HINTS = [
  'two-piece',
  '2-piece',
  'two piece',
  'matching set',
  'co-ord',
  'coord set',
  'комплект',
  'двойк',
  'костюм',
  'кроп-топ',
  'кроп топ',
  'crop top',
  'топ и',
  'top and',
  'юбк',
  'skirt',
  'maxi',
  'midi',
  'floor-length',
  'floor length',
  'ankle-length',
  'ankle length',
  'long dress',
  'платье',
  'сарафан',
  'комбинезон',
  'jumpsuit',
  'romper',
  'tiered',
  'crop top and',
  'top and skirt',
  'top and long',
  'top with skirt',
  'top with long',
  'юбка',
  'ko\'ylak to\'plami',
];

function buildTryOnHashtagsSystemPrompt(lang) {
  const languageName = getLanguageName(lang);

  return `Ты — SMM-специалист модного бренда. На основе описания одежды и категории примерки сгенерируй ровно 2 тематических хэштега на языке ${languageName}. Каждый хэштег должен начинаться с # и быть релевантным fashion try-on контенту.

Верни строго JSON-объект:
{
  "hashtags": ["#тег1", "#тег2"]
}
Никакого другого текста, кроме чистого JSON, выводить нельзя.`;
}

function getBase64HashInput(base64Image) {
  const trimmed = base64Image.trim();
  return trimmed.length > 10000 ? trimmed.slice(0, 10000) : trimmed;
}

function buildProductImageCacheKey(
  base64Image,
  userWish,
  format,
  lang,
  includeText,
  cacheVersion = '',
  generationMode = '',
  tryOnUiSuffix = '',
) {
  const base64Sample = getBase64HashInput(base64Image);
  const wish = typeof userWish === 'string' ? userWish : '';
  return crypto
    .createHash('md5')
    .update(`${base64Sample}${wish}${format}${lang}${includeText}${cacheVersion}${generationMode}${tryOnUiSuffix}`)
    .digest('hex');
}

function resolveGenerationMode(mode) {
  if (typeof mode !== 'string') {
    return null;
  }

  const normalized = mode.trim().toLowerCase();
  if (normalized === 'tryon' || normalized === 'try-on') {
    return 'tryon';
  }

  if (normalized === 'packshot') {
    return 'packshot';
  }

  if (
    normalized === 'product-to-model'
    || normalized === 'product_to_model'
    || normalized === 'producttomodel'
  ) {
    return 'product-to-model';
  }

  if (normalized === 'product') {
    return 'product';
  }

  return null;
}

function shouldRunTryOnBranch(generationMode, userWish, shouldExtractText) {
  if (shouldExtractText) {
    return false;
  }

  if (generationMode === 'tryon') {
    return true;
  }

  if (
    generationMode === 'product'
    || generationMode === 'packshot'
    || generationMode === 'product-to-model'
  ) {
    return false;
  }

  return isClothingTryOnRequest(userWish);
}

function buildVisionCacheKey(base64Image, manualWish) {
  const base64Sample = getBase64HashInput(base64Image);
  const wish = typeof manualWish === 'string' ? manualWish : '';
  return crypto
    .createHash('md5')
    .update(`${VISION_CACHE_VERSION}${base64Sample}${wish}`)
    .digest('hex');
}

function resolveCatalogPromptForGeneration(catalogPromptBody, manualWish, analysisImagePrompt) {
  const explicit = typeof catalogPromptBody === 'string' ? catalogPromptBody.trim() : '';
  if (explicit && isCatalogPrompt(explicit)) {
    return explicit.slice(0, PRODUCT_IMAGE_MAX_PROMPT_LENGTH);
  }

  if (isCatalogPrompt(manualWish)) {
    return manualWish.trim().slice(0, PRODUCT_IMAGE_MAX_PROMPT_LENGTH);
  }

  return analysisImagePrompt;
}

function buildOcrCacheKey(base64Image) {
  const base64Sample = getBase64HashInput(base64Image);
  return crypto.createHash('md5').update(base64Sample).digest('hex');
}

function isClothingTryOnRequest(userWish) {
  if (!userWish || typeof userWish !== 'string') {
    return false;
  }

  const normalized = userWish.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return CLOTHING_TRY_ON_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function resolveStrictGender(gptGender, manualWish) {
  return resolveModelGender(manualWish, gptGender);
}

function inferAgeGroupFromWish(userWish) {
  const wish = (userWish || '').toLowerCase();
  if (!wish.trim()) {
    return null;
  }

  const youngScore = YOUNG_AGE_HINTS.filter((hint) => wish.includes(hint)).length;
  const matureScore = MATURE_AGE_HINTS.filter((hint) => wish.includes(hint)).length;
  const adultScore = ADULT_AGE_HINTS.filter((hint) => wish.includes(hint)).length;

  if (youngScore > matureScore && youngScore >= adultScore && youngScore > 0) {
    return 'young';
  }

  if (matureScore > youngScore && matureScore >= adultScore && matureScore > 0) {
    return 'mature';
  }

  if (adultScore > 0) {
    return 'adult';
  }

  return null;
}

function inferAppearanceTags(userWish) {
  const wish = (userWish || '').toLowerCase();
  // Always prefer FASHN-like bright catalog studio models
  const tags = ['studio', 'bright', 'catalog', 'elegant'];

  if (SLAVIC_APPEARANCE_HINTS.some((hint) => wish.includes(hint))) {
    tags.push('slavic', 'european');
  }

  if (ELEGANT_APPEARANCE_HINTS.some((hint) => wish.includes(hint))) {
    if (!tags.includes('elegant')) {
      tags.push('elegant');
    }
  }

  return tags;
}

function pickModelFromPool(pool, { userWish, gender, ageGroup, garmentHash } = {}) {
  if (!pool.length) {
    return null;
  }

  let candidates = pool;

  if (gender) {
    const genderFiltered = candidates.filter((model) => model.gender === gender);
    if (genderFiltered.length) {
      candidates = genderFiltered;
    }
  }

  if (ageGroup) {
    const ageFiltered = candidates.filter((model) => model.ageGroup === ageGroup);
    if (ageFiltered.length) {
      candidates = ageFiltered;
    }
  }

  const preferredTags = inferAppearanceTags(userWish);
  const scored = candidates
    .filter((model) => model?.url)
    .map((model) => {
      const modelTags = Array.isArray(model.tags) ? model.tags : [];
      let score = preferredTags.filter((tag) => modelTags.includes(tag)).length;
      // Extra weight for bright studio catalog look (matches FASHN Starter)
      if (modelTags.includes('bright')) score += 2;
      if (modelTags.includes('catalog')) score += 2;
      if (modelTags.includes('studio')) score += 1;
      return {
        model,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return pool.find((model) => model?.url)?.url ?? null;
  }

  if (scored[0]?.score > 0) {
    candidates = scored
      .filter((entry) => entry.score === scored[0].score)
      .map((entry) => entry.model);
  }

  const hashInput = [
    (userWish || '').trim().toLowerCase(),
    garmentHash || '',
    gender || '',
    ageGroup || '',
  ].join('|');
  const hash = crypto.createHash('md5').update(hashInput || 'default').digest('hex');
  const index = Number.parseInt(hash.slice(0, 8), 16) % candidates.length;
  return candidates[index].url;
}

function shouldForceDressCategory(...texts) {
  const combined = texts
    .filter((text) => typeof text === 'string' && text.trim())
    .join(' ')
    .toLowerCase();

  if (!combined) {
    return false;
  }

  return DRESS_CATEGORY_HINTS.some((hint) => combined.includes(hint));
}

function resolveEffectiveVisionCategory(resolvedCategory) {
  if (resolvedCategory === 'dress') {
    return 'dress';
  }

  if (resolvedCategory === 'lower_body') {
    return 'bottom';
  }

  return 'top';
}

function resolveClothingCategory(category, refinedPrompt, userWish, forceDressFromPhoto = false, description = '') {
  if (forceDressFromPhoto) {
    return 'dress';
  }

  if (shouldForceDressCategory(refinedPrompt, userWish, description)) {
    return 'dress';
  }

  return normalizeClothingCategory(category);
}

const BLOCKED_TRYON_HUMAN_IMAGE_FRAGMENTS = [
  'pinimg.com',
  'pinterest.',
];

const TRYON_HUMAN_IMAGE_CHECK_TIMEOUT_MS = 5000;

function isBlockedTryOnHumanImageUrl(url) {
  const lower = (url || '').toLowerCase();
  return BLOCKED_TRYON_HUMAN_IMAGE_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

async function isHumanImageUrlReachable(url) {
  const trimmed = url?.trim();
  if (!trimmed) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRYON_HUMAN_IMAGE_CHECK_TIMEOUT_MS);

  try {
    let response = await fetch(trimmed, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });

    if (response.ok) {
      return true;
    }

    response = await fetch(trimmed, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      signal: controller.signal,
      redirect: 'follow',
    });

    return response.ok || response.status === 206;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function pickReachableHumanImage(pool, selectionContext) {
  const primaryUrl = pickModelFromPool(pool, selectionContext);
  const orderedUrls = [
    primaryUrl,
    ...pool.map((model) => model.url).filter((url) => url !== primaryUrl),
  ];

  for (const url of orderedUrls) {
    if (!url || isBlockedTryOnHumanImageUrl(url)) {
      continue;
    }

    if (await isHumanImageUrlReachable(url)) {
      return url;
    }
  }

  return primaryUrl || pool[0]?.url || DEFAULT_FEMALE_FULLBODY_MODEL;
}

async function uploadUserHumanImage(humanImageBase64) {
  const rawBase64 = normalizeBase64Image(humanImageBase64);
  const mimeType = detectMimeType(humanImageBase64);

  const publicBase = (process.env.PUBLIC_API_URL || process.env.API_PUBLIC_URL || '').replace(/\/$/, '');
  if (publicBase) {
    const buffer = Buffer.from(rawBase64, 'base64');
    const filename = await saveImageBuffer(buffer);
    return `${publicBase}/api/generated-images/${filename}`;
  }

  return `data:${mimeType};base64,${rawBase64}`;
}

function resolveHumanImageSuffix(humanImage) {
  if (typeof humanImage !== 'string' || !humanImage.trim()) {
    return '';
  }

  const trimmed = humanImage.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return crypto.createHash('md5').update(trimmed).digest('hex').slice(0, 12);
  }

  return crypto.createHash('md5').update(getBase64HashInput(trimmed)).digest('hex').slice(0, 12);
}

async function resolveFinalHumanImage(humanImage, clothingMeta, manualWish, garmentHash) {
  if (typeof humanImage === 'string' && humanImage.trim()) {
    const trimmed = humanImage.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }

    return uploadUserHumanImage(trimmed);
  }

  return resolveHumanImage(clothingMeta.gender, manualWish, clothingMeta.category, garmentHash);
}

async function resolveHumanImage(gender, userWish, category, garmentHash) {
  const pool = getTryOnModelPool(gender, category);
  const ageGroup = inferAgeGroupFromWish(userWish);
  const selectionContext = { userWish, gender, ageGroup, garmentHash };

  const envOverride = gender === 'male'
    ? process.env.REPLICATE_TRYON_MALE_IMG?.trim()
    : category === 'dress'
      ? process.env.REPLICATE_TRYON_FEMALE_FULLBODY_IMG?.trim()
      : process.env.REPLICATE_TRYON_FEMALE_IMG?.trim();

  if (envOverride && !isBlockedTryOnHumanImageUrl(envOverride) && await isHumanImageUrlReachable(envOverride)) {
    const overrideModel = pool.find((model) => model.url === envOverride);
    const mergedPool = overrideModel
      ? pool
      : [{ url: envOverride, gender: gender || 'female', ageGroup: ageGroup || 'adult', tags: ['elegant', 'studio'] }, ...pool];

    return pickReachableHumanImage(mergedPool, selectionContext);
  }

  if (envOverride) {
    console.warn(
      '[try-on] Env model URL is blocked or unreachable; using verified public model pool instead.',
    );
  }

  return pickReachableHumanImage(pool, selectionContext);
}

function normalizeClothingCategory(category) {
  return normalizeClothingCategoryFromVision(category);
}

async function downloadTryOnResult(finalImageUrl) {
  if (!finalImageUrl || typeof finalImageUrl !== 'string') {
    throw createError('Try-on did not return an image URL', 502);
  }

  // Keep FASHN output as-is — no Replicate/bg-removal/upscale pipeline.
  try {
    const response = await fetch(finalImageUrl);
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || 'image/png';
      const mime = contentType.split(';')[0].trim() || 'image/png';
      return `data:${mime};base64,${buffer.toString('base64')}`;
    }
  } catch (error) {
    console.warn('[try-on] Could not mirror FASHN CDN output, returning URL:', error?.message || error);
  }

  return finalImageUrl;
}

async function generateTryOnHashtags(refinedPrompt, category, lang) {
  const languageName = getLanguageName(lang);

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: buildTryOnHashtagsSystemPrompt(lang),
        },
        {
          role: 'user',
          content: `Описание одежды: ${refinedPrompt}\nКатегория примерки: ${category}\nЯзык хэштегов: ${languageName}`,
        },
      ],
      temperature: 0.5,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return getDefaultHashtags(lang);
    }

    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.hashtags) || parsed.hashtags.length < 2) {
      return getDefaultHashtags(lang);
    }

    return parsed.hashtags.slice(0, 2);
  } catch {
    return getDefaultHashtags(lang);
  }
}

function buildUiOnlyClothingMeta(uiGender, uiCategory, manualWish) {
  const gender = uiGender || 'female';
  const category = uiCategory || 'auto';
  const description = manualWish || 'clothing garment for virtual try-on';
  return {
    notClothing: false,
    category,
    gender,
    description,
    refinedPrompt: buildTryOnRefinedPrompt(gender, description),
    visionCategory: category,
  };
}

async function executeFashnTryOn(base64Image, clothingMeta, manualWish, humanImage = null, aspectRatio = null) {
  const garmentHash = crypto.createHash('md5').update(getBase64HashInput(base64Image)).digest('hex');
  const humanImg = await resolveFinalHumanImage(humanImage, clothingMeta, manualWish, garmentHash);
  const category = clothingMeta.category ?? clothingMeta.visionCategory ?? 'auto';
  const prompt = buildFashnTryOnPrompt({
    category,
    description: clothingMeta.description,
    manualWish,
  });

  console.log(
    `[fashn] garment → FASHN SDK, category=${category}, gender=${clothingMeta.gender}, prompt="${prompt.slice(0, 120)}…"`,
  );

  const cleanedGarment = await prepareFashnProductImage(base64Image);

  const result = await runFashnTryOn({
    modelImage: humanImg,
    garmentImage: cleanedGarment,
    category,
    prompt,
    aspectRatio,
  });

  if (result.imageData) {
    return result.imageData;
  }

  return downloadTryOnResult(result.remoteUrl);
}

async function executeFashnPackshot(base64Image, manualWish, aspectRatio = null) {
  const prompt = typeof manualWish === 'string' ? manualWish.trim() : '';
  console.log(`[fashn] product → packshot, promptLen=${prompt.length}`);

  const result = await runFashnPackshot({
    productImage: base64Image,
    prompt,
    aspectRatio,
  });

  if (result.imageData) {
    return result.imageData;
  }

  return downloadTryOnResult(result.remoteUrl);
}

async function executeFashnProductToModel(base64Image, manualWish, aspectRatio = null) {
  const prompt = typeof manualWish === 'string' ? manualWish.trim() : '';
  console.log(`[fashn] product → product-to-model, promptLen=${prompt.length}`);

  const result = await runFashnProductToModel({
    productImage: base64Image,
    prompt,
    aspectRatio,
  });

  if (result.imageData) {
    return result.imageData;
  }

  return downloadTryOnResult(result.remoteUrl);
}

export async function generateProductImage(req, res, next) {
  try {
    const { base64Image: bodyBase64Image, image, userWish, catalogPrompt: bodyCatalogPrompt, platform, format, extractText, lang, includeText, overlayText, mode, gender, category, humanImage } = req.body;
    const base64Image = (typeof image === 'string' && image.trim())
      ? image.trim()
      : (typeof bodyBase64Image === 'string' ? bodyBase64Image.trim() : '');
    const normalizedLang = normalizeLangCode(lang);
    const generationMode = resolveGenerationMode(mode);

    if (
      generationMode !== 'tryon'
      && generationMode !== 'packshot'
      && generationMode !== 'product-to-model'
      && !process.env.OPENAI_API_KEY
    ) {
      return res.status(500).json({ error: 'OpenAI API key is not configured.' });
    }

    if (
      (generationMode === 'tryon'
        || generationMode === 'packshot'
        || generationMode === 'product-to-model')
      && !isFashnConfigured()
    ) {
      return res.status(500).json({
        error: generationMode === 'packshot'
          ? 'Configure FASHN_API_KEY for packshot.'
          : generationMode === 'product-to-model'
            ? 'Configure FASHN_API_KEY for product-to-model.'
            : 'Configure FASHN_API_KEY for virtual try-on.',
      });
    }
    const uiTryOnGender = generationMode === 'tryon' ? parseTryOnUiGender(gender) : null;
    const uiTryOnCategory = generationMode === 'tryon' ? parseTryOnUiCategory(category) : null;
    const humanImageSuffix = generationMode === 'tryon' ? resolveHumanImageSuffix(humanImage) : '';
    const tryOnUiCacheSuffix = generationMode === 'tryon'
      ? buildTryOnUiCacheSuffix(uiTryOnGender, uiTryOnCategory, humanImageSuffix)
      : '';

    if (!base64Image || typeof base64Image !== 'string' || !base64Image.trim()) {
      return res.status(400).json({ error: 'A valid base64Image string is required.' });
    }

    if (!format || !VALID_ASPECT_RATIOS.includes(format)) {
      return res.status(400).json({
        error: `format must be one of: ${VALID_ASPECT_RATIOS.join(', ')}.`,
      });
    }

    if (!platform || !VALID_PLATFORMS.includes(platform)) {
      return res.status(400).json({
        error: `platform must be one of: ${VALID_PLATFORMS.join(', ')}.`,
      });
    }

    const rawWish = typeof userWish === 'string' ? userWish.trim() : '';
    const explicitCatalogPrompt = typeof bodyCatalogPrompt === 'string' ? bodyCatalogPrompt.trim() : '';
    const manualWish = resolveManualWish(explicitCatalogPrompt || rawWish);
    const shouldExtractText = extractText === true;
    const shouldIncludeText = parseBranchAIncludeText(includeText);
    let shouldRunTryOn = shouldRunTryOnBranch(generationMode, manualWish, shouldExtractText);
    const shouldRunPackshot = generationMode === 'packshot';
    const shouldRunProductToModel = generationMode === 'product-to-model';
    const presetMode = generationMode === 'tryon' || (!generationMode && shouldRunTryOn)
      ? 'tryon'
      : generationMode === 'packshot'
        ? 'packshot'
        : generationMode === 'product-to-model'
          ? 'product-to-model'
          : 'product';
    let wish = shouldRunPackshot
      ? (manualWish || 'commercial fashion packshot')
      : shouldRunProductToModel
        ? (manualWish || 'fashion model wearing the product, full body, studio photoshoot, real person')
        : buildFinalUserWish(
          presetMode === 'packshot' || presetMode === 'product-to-model' ? 'product' : presetMode,
          manualWish,
          null,
          uiTryOnGender,
        );
    const catalogPromptSeed = resolveCatalogPromptForGeneration(explicitCatalogPrompt, manualWish, '');
    const cacheWishKey = catalogPromptSeed || wish;
    const requestedMode = resolveRequestedMode(generationMode, presetMode);
    let fallbackReason = null;

    if (shouldExtractText) {
      const ocrCacheKey = buildOcrCacheKey(base64Image);
      const cachedOcr = cache.get(ocrCacheKey);

      if (cachedOcr) {
        return res.json({
          ...cachedOcr,
          fromCache: true,
        });
      }
    } else {
      const productCacheKey = buildProductImageCacheKey(
        base64Image,
        cacheWishKey,
        format,
        normalizedLang,
        shouldIncludeText,
        shouldRunTryOn
          ? TRYON_CACHE_VERSION
          : shouldRunPackshot
            ? PACKSHOT_CACHE_VERSION
            : shouldRunProductToModel
              ? PRODUCT_TO_MODEL_CACHE_VERSION
              : PRODUCT_FILL_CACHE_VERSION,
        generationMode || '',
        tryOnUiCacheSuffix,
      );
      const cachedProduct = cache.get(productCacheKey);

      if (cachedProduct) {
        return res.status(200).json({
          ...enrichCachedImageResponse(cachedProduct),
          fromCache: true,
        });
      }
    }

    if (shouldRunProductToModel) {
      const ptmCacheKey = buildProductImageCacheKey(
        base64Image,
        wish,
        format,
        normalizedLang,
        shouldIncludeText,
        PRODUCT_TO_MODEL_CACHE_VERSION,
        'product-to-model',
        '',
      );

      const imageUrl = await executeFashnProductToModel(
        base64Image,
        manualWish || 'fashion model wearing the product, full body, studio photoshoot, real person',
        format,
      );
      const hashtags = await generateTryOnHashtags(
        manualWish || 'fashion product on model',
        'product-to-model',
        normalizedLang,
      );

      const responseData = buildImageGenerationResponse({
        imageUrl,
        optimizedPrompt: manualWish || 'Fashion model wearing the product, full body studio photoshoot',
        hashtags,
        branchUsed: 'product-to-model',
        fallbackReason: null,
        requestedMode: 'product-to-model',
      });

      cache.set(ptmCacheKey, responseData);
      return finishGenerationResponse(res, req, responseData);
    }

    if (shouldRunPackshot) {
      const packshotCacheKey = buildProductImageCacheKey(
        base64Image,
        wish,
        format,
        normalizedLang,
        shouldIncludeText,
        PACKSHOT_CACHE_VERSION,
        'packshot',
        '',
      );

      const imageUrl = await executeFashnPackshot(base64Image, manualWish, format);
      const hashtags = await generateTryOnHashtags(
        manualWish || 'fashion product packshot',
        'packshot',
        normalizedLang,
      );

      const responseData = buildImageGenerationResponse({
        imageUrl,
        optimizedPrompt: manualWish || 'Clean commercial fashion packshot',
        hashtags,
        branchUsed: 'packshot',
        fallbackReason: null,
        requestedMode: 'packshot',
      });

      cache.set(packshotCacheKey, responseData);
      return finishGenerationResponse(res, req, responseData);
    }

    if (shouldRunTryOn) {
      if (!isFashnConfigured()) {
        return res.status(500).json({
          error: 'Configure FASHN_API_KEY for virtual try-on.',
        });
      }

      // Vision for category + garment description (two-piece → dress); UI overrides win when set.
      let clothingMeta = buildUiOnlyClothingMeta(uiTryOnGender, uiTryOnCategory, manualWish);

      if (process.env.OPENAI_API_KEY) {
        try {
          const visionMeta = await analyzeClothingProductForTryOn(base64Image, manualWish);
          if (visionMeta?.isClothing) {
            clothingMeta = applyUiTryOnOverrides(
              {
                notClothing: false,
                category: visionMeta.category,
                gender: visionMeta.gender,
                description: visionMeta.description,
                refinedPrompt: visionMeta.refinedPrompt,
                visionCategory: visionMeta.visionCategory,
              },
              uiTryOnGender,
              uiTryOnCategory,
            );
          } else {
            console.warn('[try-on] Vision marked image as non-clothing; using UI meta.');
          }
        } catch (visionError) {
          console.warn(
            '[try-on] Clothing vision failed, using UI meta:',
            visionError?.message || visionError,
          );
        }
      }

      clothingMeta = applyUiTryOnOverrides(clothingMeta, uiTryOnGender, uiTryOnCategory);
      wish = buildFinalUserWish('tryon', manualWish, clothingMeta.gender, uiTryOnGender);

      const finalTryOnCacheKey = buildProductImageCacheKey(
        base64Image,
        wish,
        format,
        normalizedLang,
        shouldIncludeText,
        TRYON_CACHE_VERSION,
        generationMode || 'tryon',
        tryOnUiCacheSuffix,
      );

      const [imageUrl, hashtags] = await Promise.all([
        executeFashnTryOn(base64Image, clothingMeta, manualWish, humanImage, format),
        generateTryOnHashtags(clothingMeta.refinedPrompt, clothingMeta.category, normalizedLang),
      ]);

      const responseData = buildImageGenerationResponse({
        imageUrl,
        optimizedPrompt: clothingMeta.refinedPrompt,
        hashtags,
        branchUsed: 'tryon',
        fallbackReason: null,
        requestedMode,
      });

      cache.set(finalTryOnCacheKey, responseData);
      return finishGenerationResponse(res, req, responseData);
    }

    if (fallbackReason) {
      wish = rebuildWishForProductBranch(manualWish);
    }

    if (!shouldExtractText && !shouldRunTryOn) {
      if (!isReplicateConfigured()) {
        return res.status(500).json({ error: 'Replicate API token is not configured.' });
      }
    }

    const productVisionSystemPrompt = shouldExtractText
      ? null
      : buildProductVisionSystemPrompt(
        platform,
        format,
        normalizedLang,
        shouldIncludeText,
        wish,
      );

    let analysis;
    if (!shouldExtractText && (isCatalogPrompt(explicitCatalogPrompt) || isCatalogPrompt(manualWish))) {
      const catalogSource = explicitCatalogPrompt || manualWish;
      console.log('[product-image] Using user catalog prompt verbatim — skipping GPT Vision rewrite');
      analysis = buildAnalysisFromCatalogPrompt(catalogSource, manualWish, normalizedLang);
    } else if (!shouldExtractText) {
      const visionCacheKey = buildVisionCacheKey(base64Image, manualWish);
      const cachedVision = cache.get(visionCacheKey);
      if (cachedVision) {
        console.log('[product-image] Vision cache hit');
        analysis = cachedVision;
      } else {
        try {
          analysis = await analyzeProductImage(
            base64Image,
            wish,
            platform,
            format,
            false,
            normalizedLang,
            productVisionSystemPrompt,
            { requireOverlayText: shouldIncludeText },
          );
          cache.set(visionCacheKey, analysis);
        } catch (error) {
          console.warn(
            '[product-image] GPT Vision unavailable, using fallback catalog prompt:',
            error?.message || error,
          );
          analysis = {
            imagePrompt: buildFallbackProductFluxPrompt(wish),
            backgroundSetupPrompt: DEFAULT_BACKGROUND_SETUP_PROMPT,
            surfaceContext: SURFACE_CONTEXT.GENERIC_STUDIO,
            productPlacement: resolveProductPlacement(null, manualWish),
            productLabel: '',
            hashtags: getDefaultHashtags(normalizedLang),
            extractedText: null,
            overlayText: shouldIncludeText ? extractQuotedOverlayText(manualWish) : null,
          };

          if (shouldIncludeText && analysis.overlayText) {
            try {
              analysis.overlayText = normalizeMarketingOverlayText(analysis.overlayText);
            } catch {
              analysis.overlayText = null;
            }
          }
        }
      }
    } else {
      try {
        analysis = await analyzeProductImage(
          base64Image,
          wish,
          platform,
          format,
          shouldExtractText,
          normalizedLang,
          productVisionSystemPrompt,
          { requireOverlayText: shouldIncludeText },
        );
      } catch (error) {
        if (error.statusCode) throw error;
        throw mapOpenAIError(error);
      }
    }

    if (shouldExtractText) {
      const responseData = {
        success: true,
        extractedText: analysis.extractedText,
        hashtags: analysis.hashtags,
        imageUrl: null,
        optimizedPrompt: null,
      };

      const ocrCacheKey = buildOcrCacheKey(base64Image);
      cache.set(ocrCacheKey, responseData);

      return finishGenerationResponse(res, req, responseData);
    }

    let imageUrl;
    let finalCatalogPrompt = cacheWishKey;
    try {
      const overlayTextForRender = resolveProductOverlayText(
        shouldIncludeText,
        analysis,
        manualWish,
        overlayText,
      );

      finalCatalogPrompt = resolveCatalogPromptForGeneration(
        explicitCatalogPrompt,
        manualWish,
        analysis.imagePrompt,
      );

      const result = await generateProductImageWithFlux(base64Image, manualWish, {
        includeText: shouldIncludeText,
        overlayText: overlayTextForRender,
        format,
        backgroundSetupPrompt: analysis.backgroundSetupPrompt,
        surfaceContext: analysis.surfaceContext,
        productPlacement: resolveProductPlacement(analysis, manualWish),
        catalogPrompt: finalCatalogPrompt,
        productLabel: analysis.productLabel,
      });
      imageUrl = result.imageUrl;
      analysis.imagePrompt = result.optimizedPrompt;
    } catch (error) {
      if (error.statusCode) throw error;
      throw mapOpenAIError(error);
    }

    const responseData = buildImageGenerationResponse({
      imageUrl,
      optimizedPrompt: analysis.imagePrompt,
      hashtags: analysis.hashtags,
      branchUsed: 'product',
      fallbackReason,
      requestedMode,
    });

    const productCacheKey = buildProductImageCacheKey(
      base64Image,
      finalCatalogPrompt,
      format,
      normalizedLang,
      shouldIncludeText,
      PRODUCT_FILL_CACHE_VERSION,
      generationMode || 'product',
      '',
    );
    cache.set(productCacheKey, responseData);

    return finishGenerationResponse(res, req, responseData);
  } catch (error) {
    next(mapOpenAIError(error));
  }
}
