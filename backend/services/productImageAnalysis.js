import { getOpenAI } from '../config/openai.js';
import { PRODUCT_IMAGE_MAX_PROMPT_LENGTH } from '../constants/image.js';
import { createError } from '../utils/errors.js';
import { getLanguageName, normalizeLangCode } from '../utils/languages.js';
import { NO_TEXT_OVERLAY_RULE } from '../utils/textOverlay.js';
import sharp from 'sharp';

const VISION_MODEL = process.env.OPENAI_VISION_MODEL?.trim() || 'gpt-4o-mini';
const VISION_MAX_EDGE = 1024;

export const DEFAULT_GARMENT_DESCRIPTION = 'High-quality fashion garment, detailed texture';

export function resolveGarmentDescription(description) {
  const trimmed = typeof description === 'string' ? description.trim() : '';
  if (trimmed.length < 3) {
    return DEFAULT_GARMENT_DESCRIPTION;
  }
  return trimmed;
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

export function buildFallbackProductFluxPrompt(userWish) {
  const sceneWish = userWish?.trim() || 'luxury studio photography, clean minimalist background';

  return (
    'A professional studio product photography of the exact product from the reference image, '
    + 'preserving its shape, color, logos and labels unchanged, '
    + `${sceneWish}, high resolution, commercial lighting, 8k, sharp focus. `
    + 'Preserve the exact product from the reference image. Only change the background and environment.'
  ).slice(0, PRODUCT_IMAGE_MAX_PROMPT_LENGTH);
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
  const sceneWish = userWish?.trim() || 'luxury studio photography';
  const isStory = format === 'story';

  const storyCompositionRule = isStory
    ? `4. Правило композиции для длинных товаров: формат story (9:16) — добавь в image_prompt: 'CRITICAL COMPOSITIONAL RULE: The product is a wide object. The entire product including all left and right edges MUST be 100% fully visible and centered within the vertical frame with clean negative space on both sides.'
`
    : '';

  const shadowRuleNumber = isStory ? 5 : 4;
  const environmentRuleNumber = isStory ? 6 : 5;
  const hashtagsRuleNumber = isStory ? 7 : 6;

  const textAndFormatInstruction = includeText
    ? `${environmentRuleNumber}. Текст: верни отдельный ключ overlay_text — одну короткую фразу (максимум 4 слова) на языке ${getLanguageName(lang)} для поста. В image_prompt НЕ добавляй текст, буквы, надписи или кавычки — текст накладывается отдельно после генерации. Оптимизируй композицию под ${format} и ${platform}.`
    : `${environmentRuleNumber}. Формат: ${NO_TEXT_OVERLAY_RULE} Оптимизируй композицию под ${format} и ${platform}.`;

  const overlayJsonField = includeText
    ? '\n  "overlay_text": "Короткая фраза для поста",'
    : '';

  return `Ты — ведущий технический ИИ-инспектор и профессиональный коммерческий фотограф для Replicate FLUX img2img.

Проанализируй фото товара. Опиши сам товар максимально детально (цвет, форма, текстура, логотипы), чтобы FLUX воссоздал его, а не исказил. Затем сгенерируй промпт для фона на основе пожелания пользователя (${sceneWish}).

ПРАВИЛА ФОРМИРОВАНИЯ image_prompt:
1. Структура (обязательно на английском):
'A professional studio product photography of [детальное описание товара из Vision — цвет, форма, материал, логотипы, детали], [описание нового окружения из userWish: ${sceneWish}], high resolution, commercial lighting, 8k, sharp focus'
2. Детальное описание товара: перечисли все видимые характеристики — точный цвет, форму, текстуру, брендинг, этикетки. FLUX должен сохранить форму товара, а не перерисовать его.
3. Окружение: опиши только фон, освещение и атмосферу на основе пожелания пользователя. Не меняй сам товар.
4. Добавь фразу: 'Preserve the exact product shape, color, logos and labels from the reference image. Only change the background and environment.'
${storyCompositionRule}${shadowRuleNumber}. Реалистичные тени: 'Ensure realistic contact shadows beneath the product. The object must look naturally grounded on the surface, avoiding any levitation effect.'
${textAndFormatInstruction}
${hashtagsRuleNumber}. Ключ 'hashtags': массив из 2 тематических хэштегов на языке ${lang}.

Выводи строго чистый JSON-объект без markdown:
{
  "image_prompt": "A professional studio product photography of ...",${overlayJsonField}
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

function parseVisionResponse(content, extractText) {
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
    };
  }

  if (!parsed.image_prompt) {
    throw createError('Vision analysis returned incomplete data.', 502);
  }

  const overlayText = typeof parsed.overlay_text === 'string' && parsed.overlay_text.trim()
    ? parsed.overlay_text.trim()
    : null;

  return {
    imagePrompt: parsed.image_prompt.slice(0, PRODUCT_IMAGE_MAX_PROMPT_LENGTH),
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
    temperature: extractText ? 0.7 : 0.3,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw createError('Vision analysis returned an empty response.', 502);
  }

  return parseVisionResponse(content, extractText);
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
