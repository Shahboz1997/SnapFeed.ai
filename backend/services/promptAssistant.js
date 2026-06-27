import { getOpenAI } from '../config/openai.js';
import { DALL_E_MAX_PROMPT_LENGTH, PRODUCT_IMAGE_MAX_PROMPT_LENGTH } from '../constants/image.js';
import { createError } from '../utils/errors.js';
import { buildDalleOnlyLanguageRule, getLanguageName, normalizeLangCode } from '../utils/languages.js';
import { reinforceFluxSpatialPrompt } from '../utils/spatialPrompt.js';
import { GROK_EMPTY_SURFACE_PROMPT } from './imageGeneration.js';

const GROK_PROMPT_ASSISTANT_MODEL = 'gpt-4o-mini';

const GROK_EMPTY_FRAME_SUFFIX = 'Completely empty frame background, no foreign objects.';

function buildGrokPromptAssistantSystemPrompt(lang) {
  const languageName = getLanguageName(lang);

  return `You are a Senior AI Prompt Engineer for Replicate google/nano-banana-2 native product image editing.

The user writes a simple wish in Russian, Uzbek, or another language. Your job is to translate their intent into a professional ENGLISH catalog prompt for nano-banana-2 (same format as Replicate playground).

STRICT RULES:
1. Return ONLY a valid JSON object with exactly these keys: "optimizedPrompt", "overlayText", "hashtags".
2. optimizedPrompt (ENGLISH ONLY, 120–400 words):
   - MUST start with "Professional B2B advertising catalog photography." or "Professional automotive advertising catalog photography." when relevant.
   - MUST describe the product FROM THE REFERENCE PHOTO placed IN the scene (not an empty studio).
   - MUST include: scene/backdrop, dramatic lighting, product textures.
   - MUST end with grounding rule: "Perfect realistic drop shadows and contact occlusion underneath the product, making it look naturally grounded — never floating. High contrast, sharp focus, 8k photorealistic rendering."
   - NEVER describe an empty scene without the product. NEVER use "empty podium" or "vacant surface ready for placement".
3. overlayText: ONE bold marketing slogan (2 to 5 words) strictly in ${languageName}.
4. hashtags: Array of 2 to 3 relevant marketing hashtags strictly in ${languageName}. Each must start with #.

Do not use markdown, code fences, or any text outside the JSON object.`;
}

function buildChatAssistantSystemPrompt(lang) {
  const languageRule = buildDalleOnlyLanguageRule(lang);
  const languageName = getLanguageName(lang);

  return `${languageRule}

You are a top-tier SMM strategist and expert prompt engineer for social media image generation. Your task is to turn the user's raw idea into a highly effective, beautifully descriptive image generation prompt for FLUX.

The user's topic can be anything: business, blog, e-commerce, fitness, fashion, food, services, personal brand, etc.

Strict compliance rules:
1. Return ONLY the final image prompt. No introductions, no explanations, no quotes around the entire answer, and NO hashtags.
2. Write the scene description strictly in ENGLISH for maximum image quality.
3. SPATIAL PLACEMENT (CRITICAL): If the user says an object is outside, through a door/window, or on the street — the object MUST stay outside in the background, NOT on the interior floor. State camera is inside looking out through the entrance.
4. ALWAYS include ONE short on-image text phrase (maximum 3-4 words) in ${languageName} inside double quotes with an English render instruction, for example:
   The text "..." is written clearly in a bold minimalist font.
5. Enhance the aesthetic quality by automatically adding professional descriptors in English based on the topic (e.g., high-quality 3D render, studio lighting, smooth gradients, modern vector illustration, trendy corporate design).
6. Keep it optimized for high-converting social media visuals on Instagram and Facebook.`;
}

function normalizeHashtags(rawHashtags, lang) {
  if (!Array.isArray(rawHashtags)) {
    return [];
  }

  const normalized = rawHashtags
    .filter((tag) => typeof tag === 'string' && tag.trim())
    .map((tag) => {
      const trimmed = tag.trim();
      return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    })
    .slice(0, 3);

  return normalized.length >= 2 ? normalized : [];
}

function normalizeOverlayText(rawOverlayText) {
  if (typeof rawOverlayText !== 'string' || !rawOverlayText.trim()) {
    return '';
  }

  return rawOverlayText
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join(' ');
}

function ensureGrokEmptyFrameSuffix(prompt) {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return '';
  }

  if (/completely empty frame background/i.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed.replace(/[.\s]+$/, '')}. ${GROK_EMPTY_FRAME_SUFFIX}`;
}

function parseGrokPromptAssistantResponse(content, lang) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw createError('Prompt assistant returned invalid JSON.', 502);
  }

  const optimizedPrompt = typeof parsed.optimizedPrompt === 'string'
    ? parsed.optimizedPrompt.trim()
    : '';

  if (!optimizedPrompt || optimizedPrompt.length < 80) {
    throw createError('Prompt assistant returned an incomplete optimizedPrompt.', 502);
  }

  if (!/grounded|drop shadow|not floating/i.test(optimizedPrompt)) {
    const withGrounding = `${optimizedPrompt.replace(/[.\s]+$/, '')}. Perfect realistic drop shadows and contact occlusion underneath the product, making it look naturally grounded — never floating. 8k photorealistic rendering.`;
    parsed.optimizedPrompt = withGrounding;
  }

  const finalPrompt = typeof parsed.optimizedPrompt === 'string' ? parsed.optimizedPrompt.trim() : optimizedPrompt;

  const overlayText = normalizeOverlayText(parsed.overlayText);
  if (!overlayText) {
    throw createError('Prompt assistant returned an incomplete overlayText.', 502);
  }

  const hashtags = normalizeHashtags(parsed.hashtags, lang);
  if (hashtags.length < 2) {
    throw createError('Prompt assistant returned incomplete hashtags.', 502);
  }

  return {
    optimizedPrompt: finalPrompt.slice(0, PRODUCT_IMAGE_MAX_PROMPT_LENGTH),
    overlayText,
    hashtags,
  };
}

export async function generateGrokPromptFromUserText(userText, lang = 'ru') {
  const trimmed = userText?.trim();
  if (!trimmed) {
    throw createError('userText cannot be empty.', 400);
  }

  const normalizedLang = normalizeLangCode(lang);
  const systemPrompt = buildGrokPromptAssistantSystemPrompt(normalizedLang);

  const completion = await getOpenAI().chat.completions.create({
    model: GROK_PROMPT_ASSISTANT_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: trimmed },
    ],
    temperature: 0.2,
    max_tokens: 700,
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    throw createError('Prompt assistant returned an empty response.', 502);
  }

  return parseGrokPromptAssistantResponse(content, normalizedLang);
}

export async function generateDallePrompt(userMessage, history = [], lang = 'ru') {
  const trimmed = userMessage?.trim();
  if (!trimmed) {
    throw createError('Сообщение не может быть пустым', 400);
  }

  const normalizedLang = normalizeLangCode(lang);
  const systemPrompt = buildChatAssistantSystemPrompt(normalizedLang);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history
      .filter((entry) => entry?.role && entry?.content?.trim())
      .map((entry) => ({
        role: entry.role === 'assistant' ? 'assistant' : 'user',
        content: entry.content.trim(),
      })),
    { role: 'user', content: trimmed },
  ];

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.7,
    max_tokens: 350,
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    throw createError('Ошибка сервера при генерации', 502);
  }

  return reinforceFluxSpatialPrompt(
    trimmed,
    content.slice(0, DALL_E_MAX_PROMPT_LENGTH),
    DALL_E_MAX_PROMPT_LENGTH,
  );
}
