import crypto from 'crypto';
import {
  IDM_VTON_SEED,
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
  analyzeClothingProductForTryOn,
  buildFallbackProductFluxPrompt,
  buildProductVisionSystemPrompt,
  buildTryOnRefinedPrompt,
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
} from '../services/productImageAnalysis.js';
import { generateProductImageWithFlux, runIdmVtonTryOn } from '../services/imageGeneration.js';
import { fetchAndUpscaleRemoteImage } from '../services/imageUpscaling.js';
import { getDefaultHashtags, getLanguageName, normalizeLangCode } from '../utils/languages.js';
import cache from '../utils/cache.js';
import { saveImageBuffer } from '../utils/imageStorage.js';
import { extractQuotedOverlayText } from '../utils/textOverlay.js';
import { isTallGarmentPhoto, prepareTryOnGarmentImage } from '../services/tryOnImagePrep.js';
import {
  DEFAULT_FEMALE_FULLBODY_MODEL,
  getTryOnModelPool,
} from '../constants/tryOnModels.js';

const TRYON_CACHE_VERSION = 'v23-fullbody';
const PRODUCT_FILL_CACHE_VERSION = BRANCH_A_CACHE_VERSION;
const VISION_CACHE_VERSION = 'v1-catalog-stable';

const VALID_UI_TRYON_GENDERS = new Set(['male', 'female']);
const VALID_UI_TRYON_CATEGORIES = new Set(['top', 'bottom', 'dress']);

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
    branchUsed: cached?.branchUsed === 'tryon' || cached?.branchUsed === 'product'
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

  if (generationMode === 'product') {
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
  const tags = [];

  if (SLAVIC_APPEARANCE_HINTS.some((hint) => wish.includes(hint))) {
    tags.push('slavic', 'european');
  }

  if (ELEGANT_APPEARANCE_HINTS.some((hint) => wish.includes(hint))) {
    tags.push('elegant');
  }

  if (!tags.includes('elegant')) {
    tags.push('elegant');
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
      return {
        model,
        score: preferredTags.filter((tag) => modelTags.includes(tag)).length,
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

async function upscaleTryOnResultFromUrl(finalImageUrl) {
  if (!finalImageUrl || typeof finalImageUrl !== 'string') {
    throw createError('Replicate did not return an image URL', 502);
  }

  let upscaledBuffer;
  try {
    upscaledBuffer = await fetchAndUpscaleRemoteImage(finalImageUrl);
  } catch (error) {
    const message = error?.message || 'Image upscaling failed.';
    console.error('Try-on upscaling failed:', message);
    throw createError(`Virtual try-on upscaling failed: ${message}`, 502);
  }

  return `data:image/png;base64,${upscaledBuffer.toString('base64')}`;
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

async function analyzeClothingMeta(base64Image, manualWish) {
  const visionResult = await analyzeClothingProductForTryOn(base64Image, manualWish);

  if (!visionResult.isClothing) {
    return {
      notClothing: true,
      productType: visionResult.productType || 'unknown',
    };
  }

  const tallGarmentPhoto = await isTallGarmentPhoto(base64Image);

  const category = resolveClothingCategory(
    visionResult.visionCategory,
    visionResult.refinedPrompt,
    manualWish,
    tallGarmentPhoto,
    visionResult.description,
  );
  const gender = resolveStrictGender(visionResult.gender, manualWish);
  const description = resolveGarmentDescription(visionResult.description);
  const refinedPrompt = buildTryOnRefinedPrompt(gender, description);
  const effectiveVisionCategory = resolveEffectiveVisionCategory(category);

  if (visionResult.visionCategory === 'top' && category === 'dress') {
    console.warn(
      '[try-on] Vision category "top" overridden to "dress" (two-piece suit / full-length garment detected).',
    );
  }

  return {
    notClothing: false,
    category,
    gender,
    refinedPrompt,
    description,
    visionCategory: effectiveVisionCategory,
  };
}

function resolveTryOnSeed(garmentHash) {
  if (!garmentHash) {
    return IDM_VTON_SEED;
  }

  const parsed = Number.parseInt(garmentHash.slice(0, 8), 16);
  return Number.isFinite(parsed) ? parsed : IDM_VTON_SEED;
}

async function executeIdmVtonTryOn(base64Image, clothingMeta, manualWish, humanImage = null) {
  const tryOnCategory = clothingMeta.category ?? clothingMeta.visionCategory;
  const garmImg = await prepareTryOnGarmentImage(base64Image, tryOnCategory);
  const garmentHash = crypto.createHash('md5').update(getBase64HashInput(base64Image)).digest('hex');
  const humanImg = await resolveFinalHumanImage(humanImage, clothingMeta, manualWish, garmentHash);

  const garmentCategory = clothingMeta.visionCategory ?? clothingMeta.category;

  console.log(
    `IDM-VTON prep: garmentCategory=${garmentCategory}, resolvedCategory=${clothingMeta.category}, gender=${clothingMeta.gender}, human_img=${humanImg}`,
  );

  const { remoteUrl } = await runIdmVtonTryOn(garmImg, clothingMeta, {
    humanImg,
    seed: resolveTryOnSeed(garmentHash),
    garmentHash,
  });

  return upscaleTryOnResultFromUrl(remoteUrl);
}

export async function generateProductImage(req, res, next) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key is not configured.' });
    }

    const { base64Image: bodyBase64Image, image, userWish, catalogPrompt: bodyCatalogPrompt, platform, format, extractText, lang, includeText, overlayText, mode, gender, category, humanImage } = req.body;
    const base64Image = (typeof image === 'string' && image.trim())
      ? image.trim()
      : (typeof bodyBase64Image === 'string' ? bodyBase64Image.trim() : '');
    const normalizedLang = normalizeLangCode(lang);
    const generationMode = resolveGenerationMode(mode);
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
    const presetMode = generationMode === 'tryon' || (!generationMode && shouldRunTryOn) ? 'tryon' : 'product';
    let wish = buildFinalUserWish(presetMode, manualWish, null, uiTryOnGender);
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
        shouldRunTryOn ? TRYON_CACHE_VERSION : PRODUCT_FILL_CACHE_VERSION,
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

    if (shouldRunTryOn) {
      if (!isReplicateConfigured()) {
        return res.status(500).json({ error: 'Replicate API token is not configured.' });
      }

      let clothingMeta;
      try {
        clothingMeta = await analyzeClothingMeta(base64Image, manualWish);

        if (clothingMeta.notClothing) {
          console.warn(
            `[product-image] Try-on trigger matched but product is not clothing (${clothingMeta.productType}). Falling back to FLUX branch A.`,
          );
          shouldRunTryOn = false;
          fallbackReason = 'not_clothing';
          wish = rebuildWishForProductBranch(manualWish);
        } else {
          clothingMeta = applyUiTryOnOverrides(clothingMeta, uiTryOnGender, uiTryOnCategory);
          wish = buildFinalUserWish('tryon', manualWish, clothingMeta.gender, uiTryOnGender);
        }
      } catch (error) {
        console.warn(
          '[product-image] GPT Vision failed in try-on mode; switching to FLUX product branch:',
          error?.message || error,
        );
        shouldRunTryOn = false;
        fallbackReason = 'verification_failed';
        wish = rebuildWishForProductBranch(manualWish);
        clothingMeta = null;
      }

      if (shouldRunTryOn) {
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

        const [upscaledUrl, hashtags] = await Promise.all([
          executeIdmVtonTryOn(base64Image, clothingMeta, manualWish, humanImage),
          generateTryOnHashtags(clothingMeta.refinedPrompt, clothingMeta.category, normalizedLang),
        ]);

        const responseData = buildImageGenerationResponse({
          imageUrl: upscaledUrl,
          optimizedPrompt: clothingMeta.refinedPrompt,
          hashtags,
          branchUsed: 'tryon',
          fallbackReason: null,
          requestedMode,
        });

        cache.set(finalTryOnCacheKey, responseData);
        return res.status(200).json(responseData);
      }
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

      return res.json(responseData);
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

    return res.status(200).json(responseData);
  } catch (error) {
    next(mapOpenAIError(error));
  }
}
