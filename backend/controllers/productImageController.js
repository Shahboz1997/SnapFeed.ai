import crypto from 'crypto';
import Replicate from 'replicate';
import {
  VALID_ASPECT_RATIOS,
  VALID_PLATFORMS,
} from '../constants/image.js';
import { getOpenAI } from '../config/openai.js';
import { createError, mapOpenAIError } from '../utils/errors.js';
import { analyzeProductImage, detectMimeType, normalizeBase64Image } from '../services/productImageAnalysis.js';
import { generateProductImageWithReference } from '../services/imageGeneration.js';
import { fetchAndUpscaleRemoteImage } from '../services/imageUpscaling.js';
import { getDefaultHashtags, getLanguageName, normalizeLangCode } from '../utils/languages.js';
import cache from '../utils/cache.js';
import { NO_TEXT_OVERLAY_RULE, parseIncludeText } from '../utils/textOverlay.js';
import { compressImageForVision, isTallGarmentPhoto, prepareTryOnGarmentImage } from '../services/tryOnImagePrep.js';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const IDM_VTON_MODEL =
  'cuuupid/idm-vton:0513734a452173b8173e907e3a59d19a36266e55b48528559432bd21c7d7e985';

const TRYON_CACHE_VERSION = 'v12';
const IDM_VTON_STEPS = 40;
const IDM_VTON_SEED = 42;

const DEFAULT_FEMALE_FULLBODY_MODEL =
  'https://raw.githubusercontent.com/yisol/IDM-VTON/main/gradio_demo/example/human/00121_00.jpg';

const FEMALE_TRYON_MODELS = [
  {
    url: 'https://raw.githubusercontent.com/yisol/IDM-VTON/main/gradio_demo/example/human/00034_00.jpg',
    tags: ['female', 'european', 'slavic', 'studio'],
  },
  {
    url: 'https://raw.githubusercontent.com/yisol/IDM-VTON/main/gradio_demo/example/human/00121_00.jpg',
    tags: ['female', 'european', 'elegant', 'studio'],
  },
  {
    url: 'https://raw.githubusercontent.com/yisol/IDM-VTON/main/gradio_demo/example/human/01992_00.jpg',
    tags: ['female', 'european', 'slavic', 'natural'],
  },
  {
    url: 'https://raw.githubusercontent.com/yisol/IDM-VTON/main/gradio_demo/example/human/00055_00.jpg',
    tags: ['female', 'european', 'studio'],
  },
];

const FEMALE_FULLBODY_TRYON_MODELS = [
  {
    url: DEFAULT_FEMALE_FULLBODY_MODEL,
    tags: ['female', 'fullbody', 'elegant', 'studio'],
  },
  {
    url: 'https://raw.githubusercontent.com/yisol/IDM-VTON/main/gradio_demo/example/human/taylor-.jpg',
    tags: ['female', 'fullbody', 'elegant', 'studio'],
  },
  {
    url: 'https://raw.githubusercontent.com/yisol/IDM-VTON/main/gradio_demo/example/human/00034_00.jpg',
    tags: ['female', 'fullbody', 'european', 'studio'],
  },
  {
    url: 'https://segmind-sd-models.s3.amazonaws.com/display_images/idm-ip.png',
    tags: ['female', 'fullbody', 'studio'],
  },
];

const MALE_TRYON_MODELS = [
  {
    url: 'https://raw.githubusercontent.com/yisol/IDM-VTON/main/gradio_demo/example/human/will1%20(1).jpg',
    tags: ['male', 'studio'],
  },
  {
    url: 'https://raw.githubusercontent.com/yisol/IDM-VTON/main/gradio_demo/example/human/Jensen.jpeg',
    tags: ['male', 'studio'],
  },
];

const EXPLICIT_JOKE_GENDER_OVERRIDE_HINTS = [
  'шутк', 'прикол', 'мем', 'ради смеха', 'joke', 'funny', 'meme', 'for fun', 'crossdress', 'drag',
];

const FEMALE_GARMENT_HINTS = [
  'dress', 'skirt', 'blouse', 'crop top', 'maxi', 'midi', 'mini dress', 'gown', 'romper',
  'jumpsuit', 'co-ord', 'two-piece', 'off-shoulder', 'платье', 'юбк', 'блуз', 'сарафан', 'комплект',
];

const MALE_GARMENT_HINTS = [
  'men\'s suit', 'men suit', 'dress shirt', 'men\'s shirt', 'men shirt', 'necktie', 'tie and',
  'мужск', 'костюм муж', 'рубашк', 'пиджак муж', 'галстук',
];

const SLAVIC_APPEARANCE_HINTS = [
  'русск', 'россий', 'славян', 'slavic', 'russian', 'европ', 'european',
];

const ELEGANT_APPEARANCE_HINTS = [
  'красив', 'beautiful', 'elegant', 'модел', 'lookbook', 'vogue', 'стильн',
];

const CLOTHING_TRY_ON_KEYWORDS = [
  // RU
  'надень',
  'надеть',
  'одень',
  'одеть',
  'примерь',
  'примерка',
  'костюм',
  'платье',
  'рубашк',
  'брюк',
  'юбк',
  'джинс',
  'куртк',
  'пиджак',
  'футболк',
  'свитер',
  'одежд',
  'модель',
  'девушк',
  'парень',
  'мужчин',
  // UZ (Latin)
  'kiydir',
  'kiying',
  'kiydiring',
  'кийдир',
  'kiyim',
  'kostyum',
  'ko\'ylak',
  'koylak',
  'jins',
  'kurtk',
  'rubashk',
  'qiz',
  'ayol',
  'erkak',
  // TG (Cyrillic)
  'пӯш',
  'пӯшидан',
  'либос',
  'курта',
  'ҷинс',
  'духтар',
  'мард',
  'модела',
  // EN
  'wear',
  'suit',
  'dress',
  'shirt',
  'pants',
  'jeans',
  'skirt',
  'jacket',
  'blazer',
  'try on',
  'tryon',
  'try-on',
  'outfit',
  'garment',
  'clothing',
  'apparel',
  'model',
  'woman',
  'man',
  'male',
  'female',
];

const VALID_CLOTHING_CATEGORIES = ['upper_body', 'lower_body', 'dress'];
const VALID_GENDERS = ['male', 'female'];

const DRESS_CATEGORY_HINTS = [
  'two-piece',
  '2-piece',
  'two piece',
  'matching set',
  'co-ord',
  'coord set',
  'комплект',
  'двойк',
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

function buildProductVisionSystemPrompt(platform, format, lang, includeText, userWish) {
  const sceneWish = userWish?.trim() || 'luxury studio photography';
  const isStory = format === 'story';

  const storyCompositionRule = isStory
    ? `4. Правило композиции для длинных товаров (Защита от обрезки): Выбран вертикальный формат story — принудительно добавь в промпт требование уменьшить масштаб: 'CRITICAL COMPOSITIONAL RULE: The product is a wide object. To prevent any cropping, the image MUST be a wide shot (full shot) with significant zoom-out. The entire product, including all its left and right edges (like wheels or handles), MUST be 100% fully visible, complete, and centered within the vertical frame. Leave plenty of clean negative space on the left and right sides of the object.'
`
    : '';

  const shadowRuleNumber = isStory ? 5 : 4;
  const environmentRuleNumber = isStory ? 6 : 5;
  const hashtagsRuleNumber = isStory ? 7 : 6;

  const textAndFormatInstruction = includeText
    ? `${environmentRuleNumber}. Окружение, Текст и Формат: Помести товар в премиальное окружение на основе пожеланий пользователя (${sceneWish}). Наложи короткий текст на языке ${lang} в двойных кавычках. Оптимизируй под ${format} и ${platform}.`
    : `${environmentRuleNumber}. Окружение и Формат: Помести товар в премиальное окружение на основе пожеланий пользователя (${sceneWish}). ${NO_TEXT_OVERLAY_RULE} Оптимизируй композицию под ${format} и ${platform}.`;

  return `Ты — ведущий технический ИИ-инспектор и профессиональный коммерческий фотограф. Твоя задача — изучить загруженное изображение товара, определить его форму, точный цвет и сформировать идеальный JSON-объект для DALL-E 3 (images.edit).

ПРАВИЛА АНАЛИЗА И ФОРМИРОВАНИЯ ПРОМПТА:
1. Ключ 'image_prompt': Текст должен быть на английском языке и строго следовать правилам сохранения оригинального товара (Strict Object Preservation).
2. Анализ цвета и формы: Определи главный цвет товара (например: ярко-красный, белый, светло-серый). В начале промпта четко пропиши его: 'The main product is a strictly [вставь определенный цвет, например: bright red] object matching the reference image'.
3. Критическое правило цвета: Добавь в промпт фразу: 'CRITICAL COLOR RULE: The product itself MUST maintain its original bright, vibrant color from the reference image. Do not darken, shade, or change its color to match the background. The object must remain clean, bright, and stand out contrastingly against the background.'
${storyCompositionRule}${shadowRuleNumber}. Реалистичные тени (Заземление товара): Добавь в промпт требование для физики теней: 'Ensure realistic contact shadows beneath the bottom edges or wheels of the product on the ground. The object must look naturally grounded and seamlessly integrated into the floor surface, avoiding any levitation effect.'
${textAndFormatInstruction}
${hashtagsRuleNumber}. Ключ 'hashtags': Массив из 2 тематических хэштегов на языке ${lang}.

Выводи строго чистый JSON-объект без вводных слов, комментариев и markdown-разметки.`;
}

function buildClothingAnalysisSystemPrompt(userWish) {
  const wishText = userWish?.trim() || 'Virtual try-on for this garment';

  return `Ты — ведущий технический fashion-эксперт и ИИ-инспектор. Изучи фото одежды на манекене и пожелания пользователя '${wishText}'.

ПЕРЕД ФОРМИРОВАНИЕМ ПРОМПТА проведи обязательный визуальный анализ длины и силуэта:

A) ДЛИНА ПОДОЛА — определи точно по фото, НЕ удлиняй и НЕ укорачивай:
- "mini" / "short" — подол выше колена (видны бёдра и значительная часть ног)
- "midi" — подол на уровне колена или середины голени
- "maxi" / "floor-length" — подол до щиколотки или до пола

B) ВЕРХНЯЯ ЧАСТЬ — определи точно по фото:
- strapless / bandeau — без лямок, открытые плечи
- off-the-shoulder — спущенные с плеч рукава или вырез
- one-shoulder — только если на фото действительно одно плечо открыто
- with sleeves — с рукавами (укажи длину: short, long, puff и т.д.)

C) СИЛУЭТ — определи точно по фото:
- A-line / flared — расклешённый от талии или бёдер
- fitted / bodycon — облегающий
- straight — прямой
- layered / ruffled / tiered — многослойный с оборками
- gathered / ruched — со сборками
- Описывай только то, что реально видно на фото

Верни строго JSON-объект со следующими ключами:
- 'category': только 'upper_body', 'lower_body' или 'dress'. Для платьев, юбок, комплектов (топ + юбка), jumpsuit и romper — 'dress' (полный рост).
- 'gender': 'female' или 'male' — строго по фасону одежды на фото.
- 'refined_prompt': рекламный промпт на английском для Replicate IDM-VTON.

ПРАВИЛА ФОРМИРОВАНИЯ refined_prompt:

1. НАЧАЛО (обязательно):
'A full-body premium lookbook studio photography of a gorgeous [female/male] model standing in full height from head to toe, wearing this exact [описание верха + точная длина] [тип одежды].'

2. ОПИСАНИЕ ТОВАРА — динамическое, строго по фото:
- Опиши верх: тип выреза, детали (банты, сборки, ruching, принт и т.д.)
- Опиши низ: точную длину (mini-skirt / midi skirt / maxi skirt) и силуэт (flared A-line / fitted / layered ruffled tulle и т.д.)
- Укажи точный цвет: 'The color is strictly solid [цвет].' или точное описание принта с фото
- ЗАПРЕЩЕНО использовать фразы, противоречащие фото: если платье mini — НИКОГДА не пиши 'long maxi skirt', 'floor-length', 'ankle-length', 'flowing train'. Если платье maxi — не пиши 'mini', 'short' или 'above the knee'.
- ЗАПРЕЩЕНО навязывать 'one-shoulder', если на фото strapless/bandeau, off-the-shoulder или другой тип.
- ЗАПРЕЩЕНО использовать жёстко прописанные шаблонные фразы — каждый промпт уникален под конкретную вещь.

3. ПРАВИЛО ПОЛНОГО РОСТА (обязательно включить, подставляя реальные значения):
'The model must be standing in full height so her shoes and legs are fully visible. The [dress/outfit/garment] must look exactly like the reference image in terms of length ([mini/short/midi/maxi] — подставь реальную длину) and silhouette ([flared A-line/fitted/etc.] — подставь реальный силуэт).'

4. ФОН И СВЕТ (обязательно дословно):
'clean luxury minimalist studio background with soft dramatic cinematic shadows, professional fashion lookbook presentation'

5. ЗАЩИТА ЦВЕТА:
'The clothing colors and print must match the garment reference exactly. No other colors should be blended into the fabric. Accessories (bags, belts, etc.) are separate and must not bleed color into the garment.'

ПРИМЕР для чёрного мини-платья с bandeau и flared tulle skirt (используй как эталон структуры, НЕ копируй слепо для других вещей):
'A full-body premium lookbook studio photography of a gorgeous female model standing in full height from head to toe, wearing this exact strapless short mini dress. The dress features a gathered ruched strapless bandeau bodice with a small white bow detailing at the neckline, and a voluminous, heavily layered flared ruffled tulle mini-skirt. The color is strictly solid black. The model must be standing in full height so her shoes and legs are fully visible. The dress must look exactly like the reference image in terms of length (mini/short) and silhouette (flared A-line). clean luxury minimalist studio background with soft dramatic cinematic shadows, professional fashion lookbook presentation. The clothing colors and print must match the garment reference exactly.'

КРИТИЧЕСКИЕ ПРАВИЛА:
1. Пол определяй ТОЛЬКО по визуальному анализу одежды на фото, а не по пожеланиям пользователя.
2. Юбки, платья, кроп-топы, блузки, женские комплекты (топ + юбка) — всегда gender: "female".
3. Мужские рубашки, пиджаки, классические костюмы — gender: "male".
4. Комплект из двух частей (кроп-топ + юбка) — category: "dress".
5. Длину подола и силуэт определяй ТОЛЬКО по фото — это критично для качества примерки в Replicate.
6. Аксессуары (сумка, ремень) описывай отдельно, не смешивай их цвет с тканью одежды.
7. Пожелания пользователя о поле модели ИГНОРИРУЙ, если они противоречат типу одежды.

Верни строго JSON-объект:
{
  "category": "upper_body" | "lower_body" | "dress",
  "gender": "female" | "male",
  "refined_prompt": "A full-body premium lookbook studio photography..."
}
Никакого другого текста, кроме чистого JSON, выводить нельзя.`;
}

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

function buildProductImageCacheKey(base64Image, userWish, format, lang, includeText, cacheVersion = '') {
  const base64Sample = getBase64HashInput(base64Image);
  const wish = typeof userWish === 'string' ? userWish : '';
  return crypto
    .createHash('md5')
    .update(`${base64Sample}${wish}${format}${lang}${includeText}${cacheVersion}`)
    .digest('hex');
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

function isExplicitGenderJokeRequest(userWish) {
  const wish = (userWish || '').toLowerCase();
  if (!wish.trim()) {
    return false;
  }

  return EXPLICIT_JOKE_GENDER_OVERRIDE_HINTS.some((hint) => wish.includes(hint));
}

function inferGenderFromWish(userWish) {
  const wish = (userWish || '').toLowerCase();
  if (!wish.trim()) {
    return null;
  }

  const maleHints = ['мужчин', 'парень', 'парня', 'мужчина', 'man', 'male', 'boy', 'erkak', 'мард', 'erkakga'];
  const femaleHints = ['девуш', 'женщин', 'девоч', 'girl', 'woman', 'female', 'qiz', 'ayol', 'духтар', 'qizga'];

  const maleScore = maleHints.filter((hint) => wish.includes(hint)).length;
  const femaleScore = femaleHints.filter((hint) => wish.includes(hint)).length;

  if (femaleScore > maleScore) {
    return 'female';
  }

  if (maleScore > femaleScore) {
    return 'male';
  }

  return null;
}

function inferGarmentGenderFromText(...texts) {
  const combined = texts
    .filter((text) => typeof text === 'string' && text.trim())
    .join(' ')
    .toLowerCase();

  if (!combined) {
    return null;
  }

  const femaleScore = FEMALE_GARMENT_HINTS.filter((hint) => combined.includes(hint)).length;
  const maleScore = MALE_GARMENT_HINTS.filter((hint) => combined.includes(hint)).length;

  if (femaleScore > maleScore) {
    return 'female';
  }

  if (maleScore > femaleScore) {
    return 'male';
  }

  return null;
}

function resolveStrictGender(aiGender, category, refinedPrompt, userWish) {
  const normalizedCategory = normalizeClothingCategory(category);
  const normalizedAiGender = typeof aiGender === 'string' && VALID_GENDERS.includes(aiGender.trim().toLowerCase())
    ? aiGender.trim().toLowerCase()
    : null;

  const garmentGender = inferGarmentGenderFromText(refinedPrompt) || normalizedAiGender;
  const wishGender = inferGenderFromWish(userWish);
  const isJokeRequest = isExplicitGenderJokeRequest(userWish);

  if (normalizedCategory === 'dress') {
    if (isJokeRequest && wishGender === 'male') {
      return 'male';
    }
    return 'female';
  }

  if (garmentGender === 'female') {
    if (isJokeRequest && wishGender === 'male') {
      return 'male';
    }
    return 'female';
  }

  if (garmentGender === 'male') {
    if (isJokeRequest && wishGender === 'female') {
      return 'female';
    }
    return 'male';
  }

  if (normalizedAiGender) {
    return normalizedAiGender;
  }

  return 'female';
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

  return tags;
}

function pickModelFromPool(pool, userWish) {
  if (!pool.length) {
    return null;
  }

  const preferredTags = inferAppearanceTags(userWish);
  let candidates = pool;

  if (preferredTags.length) {
    const scored = pool
      .map((model) => ({
        model,
        score: preferredTags.filter((tag) => model.tags.includes(tag)).length,
      }))
      .sort((a, b) => b.score - a.score);

    if (scored[0].score > 0) {
      candidates = scored
        .filter((entry) => entry.score === scored[0].score)
        .map((entry) => entry.model);
    }
  }

  const wishKey = (userWish || '').trim().toLowerCase();
  const hash = crypto.createHash('md5').update(wishKey || 'default').digest('hex');
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

function resolveClothingCategory(category, refinedPrompt, userWish, forceDressFromPhoto = false) {
  if (forceDressFromPhoto) {
    return 'dress';
  }

  const normalized = normalizeClothingCategory(category);

  if (shouldForceDressCategory(refinedPrompt, userWish)) {
    return 'dress';
  }

  return normalized;
}

const BLOCKED_FEMALE_TRYON_URL_FRAGMENTS = [
  'sam1',
  'will1',
  'jensen',
  'jensen.jpeg',
];

function isBlockedFemaleTryOnUrl(url) {
  const lower = (url || '').toLowerCase();
  return BLOCKED_FEMALE_TRYON_URL_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

function resolveEnvHumanImageOverride(envValue, pool, userWish, fallbackUrl, envVarName) {
  const override = envValue?.trim();

  if (override && !isBlockedFemaleTryOnUrl(override)) {
    return override;
  }

  if (override && isBlockedFemaleTryOnUrl(override)) {
    console.warn(
      `[try-on] Ignoring ${envVarName}: URL looks like a male demo photo (${override}). Using verified female model pool.`,
    );
  }

  return pickModelFromPool(pool, userWish) || fallbackUrl;
}

function resolveHumanImage(gender, userWish, category) {
  if (gender === 'male') {
    return process.env.REPLICATE_TRYON_MALE_IMG?.trim() || pickModelFromPool(MALE_TRYON_MODELS, userWish);
  }

  if (category === 'dress') {
    return resolveEnvHumanImageOverride(
      process.env.REPLICATE_TRYON_FEMALE_FULLBODY_IMG,
      FEMALE_FULLBODY_TRYON_MODELS,
      userWish,
      DEFAULT_FEMALE_FULLBODY_MODEL,
      'REPLICATE_TRYON_FEMALE_FULLBODY_IMG',
    );
  }

  return resolveEnvHumanImageOverride(
    process.env.REPLICATE_TRYON_FEMALE_IMG,
    FEMALE_TRYON_MODELS,
    userWish,
    FEMALE_TRYON_MODELS[0].url,
    'REPLICATE_TRYON_FEMALE_IMG',
  );
}

function normalizeClothingCategory(category) {
  if (typeof category !== 'string') {
    return 'upper_body';
  }

  const normalized = category.trim().toLowerCase();
  if (normalized === 'dresses') {
    return 'dress';
  }

  if (VALID_CLOTHING_CATEGORIES.includes(normalized)) {
    return normalized;
  }

  return 'upper_body';
}

function toIdmVtonCategory(category) {
  if (category === 'dress') {
    return 'dresses';
  }

  return category;
}

function resolveReplicateImageUrl(output) {
  const item = Array.isArray(output) ? output[0] : output;

  if (!item) {
    return null;
  }

  if (typeof item.url === 'function') {
    const url = item.url();
    if (url instanceof URL) {
      return url.href;
    }
    return String(url);
  }

  if (typeof item === 'string') {
    return item;
  }

  if (typeof item.toString === 'function') {
    const asString = item.toString();
    if (asString && asString.startsWith('http')) {
      return asString;
    }
  }

  return null;
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

function buildFallbackClothingMeta(userWish, forceDressFromPhoto = false) {
  const wish = (userWish || '').trim();
  const category = forceDressFromPhoto || shouldForceDressCategory(wish)
    ? 'dress'
    : 'upper_body';
  const refinedPrompt =
    'A full-body premium lookbook studio photography of a gorgeous female model standing in full height from head to toe, wearing this exact garment from the reference photo. The model must be standing in full height so her shoes and legs are fully visible. The garment must look exactly like the reference image in terms of length and silhouette as shown in the photo. clean luxury minimalist studio background with soft dramatic cinematic shadows, professional fashion lookbook presentation. The clothing colors and print must match the garment reference exactly. No other colors should be blended into the fabric.';
  const gender = resolveStrictGender('female', category, refinedPrompt, userWish);

  return {
    category,
    gender,
    refinedPrompt,
  };
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

async function analyzeClothingMeta(base64Image, userWish) {
  const visionImageUrl = await compressImageForVision(base64Image);

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: buildClothingAnalysisSystemPrompt(userWish),
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: userWish?.trim()
              ? `Пожелания пользователя (не переопределяй пол одежды и не меняй длину/силуэт): ${userWish.trim()}\n\nКритично: перед формированием refined_prompt точно определи длину подола (mini/midi/maxi) и силуэт (A-line/flared/fitted и т.д.) по фото. Не удлиняй короткие платья до пола и не укорачивай длинные.`
              : 'Проанализируй одежду для виртуальной примерки. Определи пол строго по фасону вещи на фото. Критично: точно определи длину подола (mini/midi/maxi) и силуэт по фото — не искажай оригинальный фасон в refined_prompt.',
          },
          {
            type: 'image_url',
            image_url: {
              url: visionImageUrl,
              detail: 'high',
            },
          },
        ],
      },
    ],
    temperature: 0.1,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw createError('Clothing analysis returned an empty response.', 502);
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw createError('Clothing analysis returned invalid JSON.', 502);
  }

  if (!parsed.refined_prompt || typeof parsed.refined_prompt !== 'string') {
    throw createError('Clothing analysis returned incomplete refined_prompt.', 502);
  }

  const refinedPrompt = parsed.refined_prompt.trim();
  const tallGarmentPhoto = await isTallGarmentPhoto(base64Image);
  const category = resolveClothingCategory(
    parsed.category,
    refinedPrompt,
    userWish,
    tallGarmentPhoto,
  );
  const gender = resolveStrictGender(parsed.gender, category, refinedPrompt, userWish);

  return {
    category,
    gender,
    refinedPrompt,
  };
}

function buildGarmentDescriptionForReplicate(clothingMeta) {
  const genderLabel = clothingMeta.gender === 'male' ? 'male' : 'female';
  const colorGuard =
    'The clothing colors and print must match the garment reference exactly. '
    + 'Do not blend background colors, bag colors, or accessory colors into the fabric. '
    + 'Accessories stay separate from garment fabric.';

  return `${clothingMeta.refinedPrompt} Model gender: ${genderLabel}. ${colorGuard}`;
}

async function runIdmVtonTryOn(base64Image, clothingMeta, userWish) {
  const garmImg = await prepareTryOnGarmentImage(base64Image);
  const idmCategory = toIdmVtonCategory(clothingMeta.category);
  const humanImg = resolveHumanImage(clothingMeta.gender, userWish, clothingMeta.category);
  const isDress = idmCategory === 'dresses';
  const garmentDes = buildGarmentDescriptionForReplicate(clothingMeta).slice(0, 500);

  const input = {
    crop: false,
    seed: IDM_VTON_SEED,
    steps: IDM_VTON_STEPS,
    category: idmCategory,
    force_dc: isDress,
    garm_img: garmImg,
    human_img: humanImg,
    mask_only: false,
    garment_des: garmentDes,
  };

  console.log(
    `Running IDM-VTON try-on, category: ${idmCategory}, gender: ${clothingMeta.gender}, garment_des: ${garmentDes}, human_img: ${humanImg}`,
  );

  let output;
  try {
    output = await replicate.run(IDM_VTON_MODEL, { input });
  } catch (error) {
    const message = error?.message || 'Replicate IDM-VTON request failed.';
    console.error('IDM-VTON failed:', message);
    throw createError(`Virtual try-on failed: ${message}`, 502);
  }

  const finalImageUrl = resolveReplicateImageUrl(output);
  if (!finalImageUrl) {
    throw createError('Replicate did not return an image URL', 502);
  }

  console.log(`IDM-VTON output URL: ${finalImageUrl}`);

  return upscaleTryOnResultFromUrl(finalImageUrl);
}

export async function generateProductImage(req, res, next) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key is not configured.' });
    }

    const { base64Image, userWish, platform, format, extractText, lang, includeText } = req.body;
    const normalizedLang = normalizeLangCode(lang);
    const shouldIncludeText = parseIncludeText(includeText);

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

    const wish = typeof userWish === 'string' ? userWish : '';
    const shouldExtractText = extractText === true;
    const shouldRunTryOn = !shouldExtractText && isClothingTryOnRequest(wish);

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
        wish,
        format,
        normalizedLang,
        shouldIncludeText,
      );
      const cachedProduct = cache.get(productCacheKey);

      if (cachedProduct) {
        return res.json({
          ...cachedProduct,
          fromCache: true,
        });
      }
    }

    if (shouldRunTryOn) {
      const replicateToken = process.env.REPLICATE_API_TOKEN?.trim();
      if (!replicateToken || replicateToken === 'your_replicate_api_token_here') {
        return res.status(500).json({ error: 'Replicate API token is not configured.' });
      }

      const productCacheKey = buildProductImageCacheKey(
        base64Image,
        wish,
        format,
        normalizedLang,
        shouldIncludeText,
        TRYON_CACHE_VERSION,
      );

      let clothingMeta;
      try {
        clothingMeta = await analyzeClothingMeta(base64Image, wish);
      } catch (error) {
        console.warn(
          'Clothing vision analysis failed, using fallback metadata:',
          error?.message || error,
        );
        const tallGarmentPhoto = await isTallGarmentPhoto(base64Image);
        clothingMeta = buildFallbackClothingMeta(wish, tallGarmentPhoto);
      }

      let upscaledUrl;
      let hashtags;
      try {
        [upscaledUrl, hashtags] = await Promise.all([
          runIdmVtonTryOn(base64Image, clothingMeta, wish),
          generateTryOnHashtags(clothingMeta.refinedPrompt, clothingMeta.category, normalizedLang),
        ]);
      } catch (error) {
        if (error.statusCode) throw error;
        throw error;
      }

      const responseData = {
        success: true,
        imageUrl: upscaledUrl,
        optimizedPrompt: clothingMeta.refinedPrompt,
        hashtags,
      };

      cache.set(productCacheKey, responseData);
      return res.json(responseData);
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
    try {
      analysis = await analyzeProductImage(
        base64Image,
        wish,
        platform,
        format,
        shouldExtractText,
        normalizedLang,
        productVisionSystemPrompt,
      );
    } catch (error) {
      if (error.statusCode) throw error;
      throw mapOpenAIError(error);
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
    try {
      const result = await generateProductImageWithReference(
        base64Image,
        analysis.imagePrompt,
        format,
      );
      imageUrl = result.imageUrl;
    } catch (error) {
      if (error.statusCode) throw error;
      throw mapOpenAIError(error);
    }

    const responseData = {
      success: true,
      imageUrl,
      optimizedPrompt: analysis.imagePrompt,
      hashtags: analysis.hashtags,
      extractedText: null,
    };

    const productCacheKey = buildProductImageCacheKey(
      base64Image,
      wish,
      format,
      normalizedLang,
      shouldIncludeText,
    );
    cache.set(productCacheKey, responseData);

    res.json(responseData);
  } catch (error) {
    next(mapOpenAIError(error));
  }
}
