import { getOpenAI } from '../config/openai.js';
import { PRODUCT_IMAGE_MAX_PROMPT_LENGTH } from '../constants/image.js';
import { createError } from '../utils/errors.js';
import { getLanguageName, normalizeLangCode } from '../utils/languages.js';

function buildOcrVisionSystemPrompt(lang) {
  const languageName = getLanguageName(lang);

  return `You are an advanced OCR scanner and top-tier SMM strategist. Carefully analyze the image (post screenshot, ad, product card, blog, etc.) and extract all printed or handwritten text from the picture.

Return strictly a JSON object with the following keys:
1. "extracted_text": String. All extracted text verbatim in the original language. If there is no text, return an empty string "".
2. "hashtags": Array of exactly 2 hashtags in ${languageName}, strictly relevant to the theme and content of the extracted text (each starting with #). Do not use generic or irrelevant tags.

Do not use markdown, code fences, or any text outside the JSON object.`;
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

  return {
    imagePrompt: parsed.image_prompt.slice(0, PRODUCT_IMAGE_MAX_PROMPT_LENGTH),
    hashtags: parsed.hashtags.slice(0, 2),
    extractedText: null,
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

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
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
              url: `data:${mimeType};base64,${rawBase64}`,
            },
          },
        ],
      },
    ],
    max_tokens: extractText ? 1200 : 1000,
    temperature: 0.7,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw createError('Vision analysis returned an empty response.', 502);
  }

  return parseVisionResponse(content, extractText);
}
