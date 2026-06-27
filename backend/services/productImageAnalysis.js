import { getOpenAI } from '../config/openai.js';
import { PRODUCT_IMAGE_MAX_PROMPT_LENGTH } from '../constants/image.js';
import { createError } from '../utils/errors.js';
import { getLanguageName, normalizeLangCode, getDefaultHashtags } from '../utils/languages.js';
import { NO_TEXT_OVERLAY_RULE } from '../utils/textOverlay.js';
import sharp from 'sharp';

const VISION_MODEL = process.env.OPENAI_VISION_MODEL?.trim() || 'gpt-4o-mini';
const VISION_MAX_EDGE = 1024;

export const DEFAULT_GARMENT_DESCRIPTION = 'High-quality fashion garment, detailed texture';

export const DEFAULT_PRODUCT_FILL_PROMPT =
  'High-end premium commercial studio advertising photography. An absolutely empty, clean vacant monochromatic geometric exhibition platform stands in the center, featuring a completely clear and empty top surface ready for product placement. The backdrop is an elegant, minimalist professional studio background with a soft seamless gradient and subtle volumetric atmosphere. Masterfully illuminated by dramatic three-point studio lighting, with a soft key light and continuous rim light creating a luxury brand aesthetic. Beautiful clean professional depth of field, sharp crisp focus on the empty center of the platform, background smoothly blurred into an elegant soft bokeh. 8k resolution, ray-traced lighting, hyper-realistic studio setup, completely empty frame background, no foreign objects, no extra items.';

export const PRODUCT_MODE_PRESET = DEFAULT_PRODUCT_FILL_PROMPT;

export function normalizeMarketingOverlayText(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw createError('Marketing overlay text is required when text overlay is enabled.', 502);
  }

  const words = text.trim().split(/\s+/).filter(Boolean);

  if (words.length < 2) {
    throw createError('Marketing overlay must contain 2 to 5 words.', 502);
  }

  return words.slice(0, 5).join(' ');
}

export function resolveGarmentDescription(description) {
  const trimmed = typeof description === 'string' ? description.trim() : '';
  if (trimmed.length < 3) {
    return DEFAULT_GARMENT_DESCRIPTION;
  }
  return trimmed;
}

export function isCatalogPrompt(text) {
  if (typeof text !== 'string') {
    return false;
  }

  const trimmed = text.trim();
  if (trimmed.length < 80) {
    return false;
  }

  return /Professional (B2B|automotive|advertising|commercial)/i.test(trimmed)
    || /catalog photography/i.test(trimmed)
    || (/photorealistic rendering/i.test(trimmed) && trimmed.length >= 120)
    || (/drop shadows/i.test(trimmed) && /grounded/i.test(trimmed));
}

export function resolveManualWish(rawWish) {
  if (typeof rawWish !== 'string') {
    return '';
  }

  const trimmed = rawWish.trim();
  if (!trimmed) {
    return '';
  }

  if (isCatalogPrompt(trimmed)) {
    return trimmed.slice(0, PRODUCT_IMAGE_MAX_PROMPT_LENGTH);
  }

  return sanitizeUserWish(trimmed);
}

export function buildAnalysisFromCatalogPrompt(catalogPrompt, manualWish, lang) {
  const prompt = catalogPrompt.trim().slice(0, PRODUCT_IMAGE_MAX_PROMPT_LENGTH);
  const backgroundSetupPrompt = sanitizeBackgroundSetupPrompt(prompt) || DEFAULT_BACKGROUND_SETUP_PROMPT;

  return {
    imagePrompt: prompt,
    backgroundSetupPrompt,
    surfaceContext: inferSurfaceContextFromBackgroundPrompt(prompt),
    productPlacement: inferProductPlacementFromWish(manualWish),
    productLabel: '',
    hashtags: getDefaultHashtags(lang),
    extractedText: null,
    overlayText: null,
  };
}

export function sanitizeUserWish(userWish) {
  if (typeof userWish !== 'string') {
    return '';
  }

  return userWish
    .replace(/[^\w\sа-яА-ЯёЁ\-\/,.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const DEFAULT_BACKGROUND_SETUP_PROMPT =
  'polished dark concrete floor with minimalist charcoal gradient backdrop';

export const SURFACE_CONTEXT = {
  FLAT_FLOOR: 'flat_floor',
  ELEVATED_PLATFORM: 'elevated_platform',
  VANITY_SURFACE: 'vanity_surface',
  GENERIC_STUDIO: 'generic_studio',
};

export const PRODUCT_PLACEMENT = {
  INTERIOR_SURFACE: 'interior_surface',
  EXTERIOR_THROUGH_OPENING: 'exterior_through_opening',
};

const VALID_SURFACE_CONTEXTS = new Set(Object.values(SURFACE_CONTEXT));
const VALID_PRODUCT_PLACEMENTS = new Set(Object.values(PRODUCT_PLACEMENT));

const FLAT_FLOOR_KEYWORDS = [
  'showroom', 'car showroom', 'garage', 'road', 'driveway', 'floor', 'asphalt',
  'concrete floor', 'polished floor', 'pavement', 'vehicle', 'automotive',
  'bicycle', 'bike', 'scooter', 'motorcycle', 'velo',
];

const EXTERIOR_PLACEMENT_KEYWORDS = [
  'outside the entrance',
  'outside the door',
  'outside the window',
  'outside the cafe',
  'outside the café',
  'outside the shop',
  'outside the store',
  'visible outside',
  'seen outside',
  'through the open door',
  'through the doorway',
  'through the entrance',
  'through the window',
  'on the sidewalk',
  'on the street',
  'on the pavement',
  'in the street',
  'exterior view',
  'visible through',
  'seen through',
  'outside entrance',
  'outside door',
  'снаружи',
  'на улице',
  'за дверью',
  'у входа снаружи',
  'виден снаружи',
  'видно снаруди',
  'через дверь',
  'через вход',
  'через окно',
];

const LIFESTYLE_SCENE_KEYWORDS = [
  'café', 'cafe', 'coffee shop', 'restaurant', 'interior', 'kitchen', 'living room',
  'bedroom', 'boutique', 'showroom interior', 'store interior', 'shop interior',
  'street scene', 'neighborhood', 'sidewalk', 'terrace', 'patio',
];

export function normalizeSurfaceContext(value) {
  if (typeof value !== 'string') {
    return SURFACE_CONTEXT.GENERIC_STUDIO;
  }

  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');

  if (VALID_SURFACE_CONTEXTS.has(normalized)) {
    return normalized;
  }

  if (normalized.includes('flat') || normalized.includes('floor') || normalized.includes('vehicle')) {
    return SURFACE_CONTEXT.FLAT_FLOOR;
  }

  if (normalized.includes('vanity') || normalized.includes('cosmetic')) {
    return SURFACE_CONTEXT.VANITY_SURFACE;
  }

  if (normalized.includes('platform') || normalized.includes('podium') || normalized.includes('exhibition')) {
    return SURFACE_CONTEXT.ELEVATED_PLATFORM;
  }

  return SURFACE_CONTEXT.GENERIC_STUDIO;
}

export function inferSurfaceContextFromBackgroundPrompt(backgroundSetupPrompt) {
  const lower = typeof backgroundSetupPrompt === 'string'
    ? backgroundSetupPrompt.toLowerCase()
    : '';

  if (FLAT_FLOOR_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return SURFACE_CONTEXT.FLAT_FLOOR;
  }

  if (lower.includes('vanity') || lower.includes('marble table') || lower.includes('cosmetic')) {
    return SURFACE_CONTEXT.VANITY_SURFACE;
  }

  if (
    lower.includes('platform')
    || lower.includes('exhibition')
    || lower.includes('podium')
    || lower.includes('geometric')
  ) {
    return SURFACE_CONTEXT.ELEVATED_PLATFORM;
  }

  return SURFACE_CONTEXT.GENERIC_STUDIO;
}

export function resolveSurfaceContext(rawSurfaceContext, backgroundSetupPrompt) {
  const normalized = normalizeSurfaceContext(rawSurfaceContext);

  if (normalized !== SURFACE_CONTEXT.GENERIC_STUDIO) {
    return normalized;
  }

  return inferSurfaceContextFromBackgroundPrompt(backgroundSetupPrompt);
}

export function requiresFlatFloorPlacement(surfaceContext) {
  return surfaceContext === SURFACE_CONTEXT.FLAT_FLOOR;
}

export function normalizeProductPlacement(value) {
  if (typeof value !== 'string') {
    return PRODUCT_PLACEMENT.INTERIOR_SURFACE;
  }

  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');

  if (VALID_PRODUCT_PLACEMENTS.has(normalized)) {
    return normalized;
  }

  if (
    normalized.includes('exterior')
    || normalized.includes('outside')
    || normalized.includes('opening')
    || normalized.includes('through')
  ) {
    return PRODUCT_PLACEMENT.EXTERIOR_THROUGH_OPENING;
  }

  return PRODUCT_PLACEMENT.INTERIOR_SURFACE;
}

export function inferProductPlacementFromWish(userWish, productLabel = '') {
  const combined = `${userWish || ''} ${productLabel || ''}`.toLowerCase();

  if (EXTERIOR_PLACEMENT_KEYWORDS.some((keyword) => combined.includes(keyword))) {
    return PRODUCT_PLACEMENT.EXTERIOR_THROUGH_OPENING;
  }

  return PRODUCT_PLACEMENT.INTERIOR_SURFACE;
}

export function isLifestyleScenePrompt(text) {
  const lower = typeof text === 'string' ? text.toLowerCase() : '';
  return LIFESTYLE_SCENE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export function requiresExteriorOpeningPlacement(productPlacement) {
  return productPlacement === PRODUCT_PLACEMENT.EXTERIOR_THROUGH_OPENING;
}

export function resolveProductPlacement(analysis, manualWish) {
  const fromWish = inferProductPlacementFromWish(
    manualWish,
    analysis?.productLabel || '',
  );

  if (fromWish === PRODUCT_PLACEMENT.EXTERIOR_THROUGH_OPENING) {
    return PRODUCT_PLACEMENT.EXTERIOR_THROUGH_OPENING;
  }

  return normalizeProductPlacement(analysis?.productPlacement);
}

export function sanitizeBackgroundSetupPrompt(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/[^\w\s\-\/,.']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 35)
    .join(' ');
}

export const CATALOG_GROUNDING_SUFFIX =
  'Perfect realistic drop shadows and contact occlusion underneath the product, making it look naturally grounded on the surface — never floating in mid-air. '
  + 'High contrast, sharp focus on the product, clean composition, sophisticated atmospheric depth, 8k photorealistic rendering.';

export function buildCatalogPrompt({
  imagePrompt = '',
  productLabel = '',
  backgroundSetupPrompt = '',
  surfaceContext = SURFACE_CONTEXT.GENERIC_STUDIO,
  userWish = '',
} = {}) {
  const base = typeof imagePrompt === 'string' ? imagePrompt.trim() : '';

  if (base.length >= 80) {
    if (/grounded|drop shadow|contact shadow|not floating|levitation/i.test(base)) {
      return base.slice(0, PRODUCT_IMAGE_MAX_PROMPT_LENGTH);
    }
    return `${base} ${CATALOG_GROUNDING_SUFFIX}`.slice(0, PRODUCT_IMAGE_MAX_PROMPT_LENGTH);
  }

  const label = productLabel?.trim() || 'the exact product from the reference image';
  const scene = backgroundSetupPrompt?.trim() || DEFAULT_BACKGROUND_SETUP_PROMPT;
  const wish = userWish?.trim();
  const placementHint = surfaceContext === SURFACE_CONTEXT.FLAT_FLOOR
    ? `The ${label} positioned naturally on the floor with wheels or base fully contacting the ground. `
    : `The ${label} arranged masterfully on the surface. `;

  const prompt = (
    `Professional B2B advertising catalog photography. ${placementHint}`
    + `${scene}. `
    + `${wish ? `${wish}. ` : ''}`
    + `Preserve the exact shape, color, logos and labels from the reference image. `
    + CATALOG_GROUNDING_SUFFIX
  );

  return prompt.slice(0, PRODUCT_IMAGE_MAX_PROMPT_LENGTH);
}

export function buildFallbackProductFluxPrompt(userWish) {
  return buildCatalogPrompt({
    imagePrompt: '',
    productLabel: 'the exact product from the reference image',
    backgroundSetupPrompt: userWish?.trim() || DEFAULT_BACKGROUND_SETUP_PROMPT,
    surfaceContext: SURFACE_CONTEXT.GENERIC_STUDIO,
    userWish: userWish?.trim() || '',
  });
}

function buildOcrVisionSystemPrompt(lang) {
  const languageName = getLanguageName(lang);

  return `You are an advanced OCR scanner and top-tier SMM strategist. Carefully analyze the image (post screenshot, ad, product card, blog, etc.) and extract all printed or handwritten text from the picture.

Return strictly a JSON object with the following keys:
1. "extracted_text": String. All extracted text verbatim in the original language. If there is no text, return an empty string "".
2. "hashtags": Array of exactly 2 hashtags in ${languageName}, strictly relevant to the theme and content of the extracted text (each starting with #). Do not use generic or irrelevant tags.

Do not use markdown, code fences, or any text outside the JSON object.`;
}

export function buildProductVisionSystemPrompt(platform, format, lang, includeText, userWish) {
  const sceneWish = userWish?.trim() || DEFAULT_PRODUCT_FILL_PROMPT;
  const languageName = getLanguageName(lang);
  const isStory = format === 'story';

  const storyCompositionRule = isStory
    ? `4. Правило композиции для длинных товаров: формат story (9:16) — добавь в image_prompt: 'CRITICAL COMPOSITIONAL RULE: The product is a wide object. The entire product including all left and right edges MUST be 100% fully visible and centered within the vertical frame with clean negative space on both sides.'
`
    : '';

  const shadowRuleNumber = isStory ? 5 : 4;
  const environmentRuleNumber = isStory ? 6 : 5;
  const hashtagsRuleNumber = isStory ? 7 : 6;

  const premiumEnvironmentExamples =
    'Examples for background_setup_prompt (scene only, English, up to 35 words):\n'
    + '- CAR in showroom -> "minimalist luxurious modern car showroom with polished dark concrete floor, dramatic volumetric studio light, soft linear LED accents"\n'
    + '- PVC FITTINGS -> "minimalist industrial tech showroom with deep shadows and soft linear warm LED light accents on the back wall"\n'
    + '- COSMETICS -> "light beige marble vanity table with soft shadows and tropical palm leaf silhouettes"';

  const textAndFormatInstruction = includeText
    ? `${environmentRuleNumber}. overlay_text (ОБЯЗАТЕЛЬНЫЙ КЛЮЧ): Сгенерируй ОДНУ короткую, максимально мощную и пробивную продающую фразу (строго от 2 до 5 слов). Текст должен быть жёстким Call-to-Action, бьющим точно в боли клиента — вызывать чувство надёжности, экономии или технологического превосходства. Никакой "воды", никаких нейтральных описаний товара. Язык строго: ${languageName}.

Примеры для строительной/B2B тематики (трубы, фитинги, инженерные товары):
- узбекский: "Tizimingiz uchun mutloq kafolat!", "Maksimal bosimga tayyor!", "Uzoq yillik ishonchli sifat!"
- русский: "Надежность в каждом миллиметре!", "Выдержит любое давление!", "Качество без компромиссов!"

В image_prompt НЕ добавляй текст, буквы, надписи или кавычки — overlay накладывается отдельно через Sharp. Оставь чистое негативное пространство в верхней трети кадра для текста. Оптимизируй композицию под ${format} и ${platform}.`
    : `${environmentRuleNumber}. Формат: ${NO_TEXT_OVERLAY_RULE} Не возвращай ключ overlay_text. Оптимизируй композицию под ${format} и ${platform}.`;

  const overlayJsonField = includeText
    ? '\n  "overlay_text": "Пробивной CTA-слоган 2–5 слов",'
    : '';

  return `Ты — Senior ИИ-промпт инженер для Replicate google/nano-banana-2 (нативный image-to-image edit, как на replicate.com/google/nano-banana-2).

Проанализируй фото товара. Nano-banana-2 получит image_input (фото товара) + image_prompt — модель САМА разместит товар в сцене с реалистичными тенями. Sharp composite НЕ используется.

Базовое пожелание пользователя: (${sceneWish}).

ШАГ 1 — surface_context:
- МАШИНА / велосипед / мотоцикл / транспорт -> "flat_floor"
- САНТЕХНИКА / фитинги / промышленные детали -> "elevated_platform"
- КОСМЕТИКА / парфюм / флаконы -> "vanity_surface"
- Прочее -> "generic_studio" или "elevated_platform"

ШАГ 2 — product_placement:
- Товар СНАРУЖИ через дверь/окно -> "exterior_through_opening"
- Иначе -> "interior_surface"

КЛЮЧ product_label (ОБЯЗАТЕЛЬНЫЙ): краткое описание товара с фото на английском (2–8 слов), например "white sedan car", "gray PVC pipe fittings", "luxury perfume bottle".

КЛЮЧ background_setup_prompt (ОБЯЗАТЕЛЬНЫЙ, английский, до 35 слов): описание СЦЕНЫ/ОКРУЖЕНИЯ без дублирования деталей товара.
${premiumEnvironmentExamples}

КЛЮЧ image_prompt (ОБЯЗАТЕЛЬНЫЙ, английский, 80–400 слов) — ПОЛНЫЙ промпт как на Replicate playground:
Формат: "Professional B2B advertising catalog photography. [product_label] arranged/positioned [on surface/floor]. [background_setup_prompt expanded with lighting]. Dramatic side key lighting highlighting textures. Perfect realistic drop shadows and contact occlusion underneath, making the product look grounded — never floating. High contrast, sharp focus, 8k photorealistic rendering."

Пример для труб (как на Replicate):
"Professional B2B advertising catalog photography. Heavy-duty gray PVC pipe fittings arranged masterfully on a polished dark concrete slab. The backdrop is a minimalist industrial tech showroom with deep shadows and soft linear warm LED light accents on the back wall. Dramatic side key lighting highlighting the glossy plastic texture and precise geometric curves. Perfect realistic drop shadows and occlusion underneath the plastic parts, making them look grounded. High contrast, sharp focus, 8k photorealistic rendering."

Пример для машины:
"Professional automotive advertising catalog photography. The white sedan from the reference image positioned naturally on a polished dark concrete showroom floor. Minimalist luxurious modern car showroom with dramatic volumetric studio lighting. Perfect realistic contact shadows and occlusion underneath the wheels and body, making the car look grounded on the floor, not floating. 8k photorealistic rendering."
${storyCompositionRule}${shadowRuleNumber}. В image_prompt ОБЯЗАТЕЛЬНО включи правило теней: grounded, contact shadows, not floating.
${textAndFormatInstruction}
${hashtagsRuleNumber}. Ключ 'hashtags': массив из 2 агрессивных, тематических маркетинговых хэштегов на языке ${languageName} (не generic).

Выводи строго чистый JSON-объект без markdown:
{
  "surface_context": "flat_floor",
  "product_placement": "exterior_through_opening",
  "product_label": "vintage bicycle",
  "background_setup_prompt": "Warm cozy café interior with wooden shelves, open glass door showing bright empty sidewalk outside, no bicycle inside",
  "image_prompt": "High-end nostalgic café interior with empty floor space, ...",${overlayJsonField}
  "hashtags": ["#тег1", "#тег2"]
}`;
}

export function normalizeBase64Image(base64Image) {
  const trimmed = base64Image.trim();
  if (trimmed.startsWith('data:')) {
    const commaIndex = trimmed.indexOf(',');
    if (commaIndex === -1) {
      throw createError('Invalid base64 image data URL.', 400);
    }
    return trimmed.slice(commaIndex + 1);
  }
  return trimmed;
}

export function detectMimeType(base64Image) {
  const trimmed = base64Image.trim();
  if (trimmed.startsWith('data:')) {
    const match = trimmed.match(/^data:([^;]+);/);
    if (match?.[1]) return match[1];
  }
  return 'image/jpeg';
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

function buildUserTextParts(userWish, platform, format) {
  const isStory = format === 'story';
  const formatHint = isStory
    ? 'Vertical Story format (9:16) — tall layout with space for headline at top or bottom'
    : 'Square format (1:1) — centered layout with balanced negative space';

  const userTextParts = [
    `Target platform: ${platform}`,
    `Format: ${formatHint}`,
  ];

  if (userWish?.trim()) {
    userTextParts.push(`User style/background wishes: ${userWish.trim()}`);
  }

  return userTextParts.join('\n');
}

function parseVisionResponse(content, extractText, requireOverlayText = false, userWish = '') {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw createError('Vision analysis returned invalid JSON.', 502);
  }

  if (!Array.isArray(parsed.hashtags) || parsed.hashtags.length < 2) {
    throw createError('Vision analysis returned incomplete data.', 502);
  }

  if (extractText) {
    if (typeof parsed.extracted_text !== 'string') {
      throw createError('Vision analysis returned incomplete OCR data.', 502);
    }

    return {
      imagePrompt: null,
      hashtags: parsed.hashtags.slice(0, 2),
      extractedText: parsed.extracted_text,
      overlayText: null,
    };
  }

  if (!parsed.image_prompt) {
    throw createError('Vision analysis returned incomplete data.', 502);
  }

  const rawBackgroundSetup = typeof parsed.background_setup_prompt === 'string'
    ? parsed.background_setup_prompt
    : '';
  const backgroundSetupPrompt = sanitizeBackgroundSetupPrompt(rawBackgroundSetup)
    || DEFAULT_BACKGROUND_SETUP_PROMPT;
  const surfaceContext = resolveSurfaceContext(parsed.surface_context, backgroundSetupPrompt);
  const productLabel = typeof parsed.product_label === 'string'
    ? parsed.product_label.trim()
    : '';
  const productPlacement = normalizeProductPlacement(
    parsed.product_placement
    || inferProductPlacementFromWish(userWish, productLabel),
  );

  let overlayText = null;

  if (requireOverlayText) {
    if (typeof parsed.overlay_text !== 'string' || !parsed.overlay_text.trim()) {
      throw createError('Vision analysis did not return a marketing overlay_text slogan.', 502);
    }
    overlayText = normalizeMarketingOverlayText(parsed.overlay_text);
  } else if (typeof parsed.overlay_text === 'string' && parsed.overlay_text.trim()) {
    overlayText = parsed.overlay_text.trim();
  }

  return {
    imagePrompt: parsed.image_prompt.slice(0, PRODUCT_IMAGE_MAX_PROMPT_LENGTH),
    backgroundSetupPrompt,
    surfaceContext,
    productPlacement,
    productLabel,
    hashtags: parsed.hashtags.slice(0, 2),
    extractedText: null,
    overlayText,
  };
}

export async function analyzeProductImage(
  base64Image,
  userWish,
  platform,
  format,
  extractText = false,
  lang = 'ru',
  productVisionSystemPrompt = null,
  { requireOverlayText = false } = {},
) {
  const rawBase64 = normalizeBase64Image(base64Image);
  const mimeType = detectMimeType(base64Image);
  const normalizedLang = normalizeLangCode(lang);

  if (!rawBase64) {
    throw createError('base64Image is required.', 400);
  }

  if (!extractText && (!productVisionSystemPrompt || typeof productVisionSystemPrompt !== 'string')) {
    throw createError('Product vision system prompt is required.', 500);
  }

  const systemPrompt = extractText
    ? buildOcrVisionSystemPrompt(normalizedLang)
    : productVisionSystemPrompt;
  const userText = buildUserTextParts(userWish, platform, format);
  const visionImageUrl = extractText
    ? `data:${mimeType};base64,${rawBase64}`
    : await compressImageForVision(base64Image);

  const completion = await getOpenAI().chat.completions.create({
    model: extractText ? 'gpt-4o-mini' : VISION_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: userText,
          },
          {
            type: 'image_url',
            image_url: {
              url: visionImageUrl,
              detail: extractText ? 'auto' : 'high',
            },
          },
        ],
      },
    ],
    max_tokens: extractText ? 1200 : 1200,
    temperature: extractText ? 0.7 : 0,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw createError('Vision analysis returned an empty response.', 502);
  }

  return parseVisionResponse(content, extractText, requireOverlayText, userWish);
}

const VALID_VISION_CLOTHING_CATEGORIES = ['top', 'bottom', 'dress'];
const VALID_GENDERS = ['female', 'male'];

function buildCombinedClothingVisionSystemPrompt(userWish) {
  const wishText = userWish?.trim() || '';

  return `You are a fashion product classification and analysis expert for virtual try-on (Replicate IDM-VTON).

Analyze the product photo in ONE pass and return strict JSON with exactly these keys:

{
  "is_clothing": true or false,
  "category": "top" | "bottom" | "dress",
  "gender": "female" | "male",
  "description": "detailed garment description for a textile/neural-network prompt"
}

Rules for is_clothing:
- true: wearable apparel suitable for virtual try-on (dresses, shirts, blouses, pants, skirts, jackets, coats, suits, jumpsuits, etc.)
- false: bags, cosmetics, skincare, watches, jewelry, shoes sold alone, electronics, food, furniture, non-garment accessories

Rules for category (only meaningful when is_clothing is true):
- "top" — ONLY upper body without bottom (shirt, t-shirt, blouse, sweater, jacket alone)
- "bottom" — ONLY lower body without top (pants, skirt, shorts alone)
- "dress" — dress, jumpsuit, romper, two-piece suit (top + skirt/pants), any two-piece matching set, full-length dress

CRITICAL RULE FOR TWO-PIECE SETS:
If the photo shows a two-piece suit (top + skirt/pants) or both top and bottom as one outfit — you MUST return "dress", NEVER "top".

Rules for gender:
Infer strictly from garment style on the photo: "female" or "male".

Rules for description:
Provide a detailed description in Russian: color, material, cut, hem length, print, and visible details. This text will be sent to IDM-VTON as garment_des.
${wishText ? `\nUser wishes (do not override category or gender based on wishes): ${wishText}` : ''}

Return ONLY valid JSON. No markdown, no extra text.`;
}

export function buildTryOnRefinedPrompt(gender, description) {
  const normalizedGender = VALID_GENDERS.includes(gender) ? gender : 'female';
  const garmentDescription = typeof description === 'string' && description.trim()
    ? description.trim()
    : 'garment from the reference photo';

  return (
    `A full-body premium lookbook studio photography of a gorgeous ${normalizedGender} model standing in full height from head to toe, `
    + `wearing this exact ${garmentDescription}. The model must be standing in full height so shoes and legs are fully visible. `
    + 'The garment must look exactly like the reference image in terms of length and silhouette. '
    + 'clean luxury minimalist studio background with soft dramatic cinematic shadows, professional fashion lookbook presentation. '
    + 'The clothing colors and print must match the garment reference exactly.'
  );
}

export function normalizeClothingCategoryFromVision(category) {
  if (typeof category !== 'string') {
    return 'upper_body';
  }

  const normalized = category.trim().toLowerCase();

  switch (normalized) {
    case 'top':
    case 'upper_body':
    case 'upperbody':
      return 'upper_body';
    case 'bottom':
    case 'lower_body':
    case 'lowerbody':
      return 'lower_body';
    case 'dress':
    case 'dresses':
      return 'dress';
    default:
      return 'upper_body';
  }
}

function parseCombinedClothingVisionResponse(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw createError('Clothing vision analysis returned invalid JSON.', 502);
  }

  const isClothing = parsed.is_clothing === true;
  const rawDescription = typeof parsed.description === 'string' ? parsed.description.trim() : '';
  const productType = rawDescription || 'unknown';

  if (!isClothing) {
    return {
      isClothing: false,
      productType,
      visionCategory: null,
      category: null,
      gender: null,
      description: '',
      refinedPrompt: null,
    };
  }

  const rawCategory = typeof parsed.category === 'string'
    ? parsed.category.trim().toLowerCase()
    : '';

  if (!VALID_VISION_CLOTHING_CATEGORIES.includes(rawCategory)) {
    throw createError(
      `Clothing vision returned invalid category "${parsed.category}". Expected top, bottom or dress.`,
      502,
    );
  }

  const gender = typeof parsed.gender === 'string' && VALID_GENDERS.includes(parsed.gender.trim().toLowerCase())
    ? parsed.gender.trim().toLowerCase()
    : 'female';

  const description = resolveGarmentDescription(rawDescription);

  return {
    isClothing: true,
    productType: null,
    visionCategory: rawCategory,
    category: normalizeClothingCategoryFromVision(rawCategory),
    gender,
    description,
    refinedPrompt: buildTryOnRefinedPrompt(gender, description),
  };
}

export async function analyzeClothingProductForTryOn(base64Image, userWish) {
  const visionImageUrl = await compressImageForVision(base64Image);

  const completion = await getOpenAI().chat.completions.create({
    model: VISION_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: buildCombinedClothingVisionSystemPrompt(userWish),
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: userWish?.trim()
              ? 'If this is a two-piece suit (top + skirt/pants), category MUST be "dress", not "top". Determine exact hem length and silhouette from the photo.'
              : 'Analyze this garment for virtual try-on. If it is a two-piece set, category must be "dress".',
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
    throw createError('Clothing vision analysis returned an empty response.', 502);
  }

  return parseCombinedClothingVisionResponse(content);
}
