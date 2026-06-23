import { getOpenAI } from '../config/openai.js';
import fs from 'fs/promises';
import crypto from 'crypto';
import {
  VALID_ASPECT_RATIOS,
  VALID_PLATFORMS,
  DALL_E_MAX_PROMPT_LENGTH,
  isAllowedImageUrl,
} from '../constants/image.js';
import { createError, mapOpenAIError } from '../utils/errors.js';
import { generateImageWithFallback } from '../services/imageGeneration.js';
import {
  getImagePath,
  getFilenameFromUrl,
  isGeneratedImagePath,
} from '../utils/imageStorage.js';
import { upscaleImageBuffer } from '../services/imageUpscaling.js';
import cache from '../utils/cache.js';
import { NO_TEXT_OVERLAY_RULE, appendNoTextRuleToPrompt, parseIncludeText } from '../utils/textOverlay.js';
import { buildLanguageRule, normalizeLangCode, getLanguageName, getDefaultHashtags, stripHashtagsFromPrompt } from '../utils/languages.js';

function buildPromptOptimizerSystem(lang, includeText) {
  const languageRule = buildLanguageRule(lang);
  const languageName = getLanguageName(lang);

  if (!includeText) {
    return `${languageRule}

You are a top-tier SMM strategist and commercial designer. Your task is to analyze the user's text or idea and create a high-converting, stylish prompt for social media visual generation (Instagram, Facebook).

PROMPT GENERATION RULES:
1. Describe the visual scene in ENGLISH — modern, eye-catching, strictly matching the user's topic (business, blog, e-commerce, services, lifestyle, etc.).
   Style: minimalist photography, editorial aesthetic, vivid contrasting colors, premium presentation.
2. Avoid visual clutter. Focus purely on scenery, objects, composition, lighting, and mood.
3. optimizedPrompt — the complete DALL-E prompt: ENGLISH scene description only. No extra commentary. Maximum 900 characters.
4. ${NO_TEXT_OVERLAY_RULE}

HASHTAGS:
- Generate exactly 2 hashtags strictly relevant to the user's text topic (each starting with #).
- Hashtags must be written in ${languageName} and reflect the niche, product, or post topic — do not use generic or irrelevant tags.

Return ONLY JSON: { "optimizedPrompt": "...", "hashtags": ["#tag1", "#tag2"] }`;
  }

  return `${languageRule}

You are a top-tier SMM strategist and commercial designer. Your task is to analyze the user's text or idea and create a high-converting, stylish prompt for social media visual generation (Instagram, Facebook).

PROMPT GENERATION RULES:
1. Extract ONE main short phrase (maximum 3-4 words) in ${languageName} that must appear on the image as a text overlay.
   English UI examples: "NEW COLLECTION", "SUMMER SALE". Russian UI examples: "НОВАЯ КОЛЛЕКЦИЯ", "ЛЕТНЯЯ РАСПРОДАЖА".
2. Embed that phrase inside an English instruction with double quotes, for example:
   The text "..." is written clearly in a bold minimalist font.
3. Describe the visual scene in ENGLISH — modern, eye-catching, strictly matching the user's topic (business, blog, e-commerce, services, lifestyle, etc.).
   Style: minimalist photography, editorial aesthetic, vivid contrasting colors, premium presentation.
4. Avoid visual clutter. Leave ample clean negative space around the text so the post reads well in Instagram or Facebook feeds.
5. optimizedPrompt — the complete DALL-E prompt: ENGLISH scene description plus the localized quoted text-overlay instruction. No extra commentary. Maximum 900 characters.

HASHTAGS:
- Generate exactly 2 hashtags strictly relevant to the user's text topic (each starting with #).
- Hashtags must be written in ${languageName} and reflect the niche, product, or post topic — do not use generic or irrelevant tags.

Return ONLY JSON: { "optimizedPrompt": "...", "hashtags": ["#tag1", "#tag2"] }`;
}

function isDetailedImagePrompt(prompt) {
  return prompt.trim().length >= 80;
}

async function resolvePrompt(userPrompt, platform, aspectRatio, lang, includeText) {
  const trimmed = userPrompt.trim();

  if (isDetailedImagePrompt(trimmed)) {
    let dallePrompt = stripHashtagsFromPrompt(trimmed).slice(0, DALL_E_MAX_PROMPT_LENGTH);
    if (!includeText) {
      dallePrompt = appendNoTextRuleToPrompt(dallePrompt).slice(0, DALL_E_MAX_PROMPT_LENGTH);
    }

    let hashtags = getDefaultHashtags(lang);

    try {
      const optimized = await optimizePrompt(trimmed, platform, aspectRatio, lang, includeText);
      hashtags = optimized.hashtags;
    } catch (error) {
      console.warn('Hashtag generation failed for detailed prompt, using defaults:', error.message);
    }

    return {
      optimizedPrompt: dallePrompt,
      hashtags,
    };
  }

  try {
    return await optimizePrompt(trimmed, platform, aspectRatio, lang, includeText);
  } catch (error) {
    console.warn('Prompt optimization failed, using original prompt:', error.message);
    let optimizedPrompt = stripHashtagsFromPrompt(trimmed).slice(0, DALL_E_MAX_PROMPT_LENGTH);
    if (!includeText) {
      optimizedPrompt = appendNoTextRuleToPrompt(optimizedPrompt).slice(0, DALL_E_MAX_PROMPT_LENGTH);
    }

    return {
      optimizedPrompt,
      hashtags: getDefaultHashtags(lang),
    };
  }
}

async function optimizePrompt(userPrompt, platform, aspectRatio, lang, includeText) {
  const normalizedLang = normalizeLangCode(lang);
  const isStory = aspectRatio === 'story';
  const formatHint = isStory
    ? 'Story (9:16) — vertical layout with generous negative space'
    : 'Square (1:1) — centered composition with generous negative space';

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: buildPromptOptimizerSystem(normalizedLang, includeText),
      },
      {
        role: 'user',
        content: JSON.stringify({
          userPrompt,
          platform,
          aspectRatio,
          format: formatHint,
          lang: normalizedLang,
        }),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw createError('Failed to optimize prompt.', 502);
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw createError('Invalid response from prompt optimizer.', 502);
  }

  if (!parsed.optimizedPrompt || !Array.isArray(parsed.hashtags) || parsed.hashtags.length < 2) {
    throw createError('Prompt optimizer returned incomplete data.', 502);
  }

  return {
    optimizedPrompt: stripHashtagsFromPrompt(parsed.optimizedPrompt)
      .replace(/^["']|["']$/g, '')
      .slice(0, DALL_E_MAX_PROMPT_LENGTH),
    hashtags: parsed.hashtags.slice(0, 2),
  };
}

async function generateImageWithDalle(optimizedPrompt, aspectRatio) {
  const { imageUrl } = await generateImageWithFallback(optimizedPrompt, aspectRatio);
  return imageUrl;
}

function buildTextImageCacheKey(userPrompt, platform, format, lang, includeText) {
  return crypto
    .createHash('md5')
    .update(`${userPrompt}${platform}${format}${lang}${includeText}`)
    .digest('hex');
}

export async function generatePostImage(req, res, next) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key is not configured.' });
    }

    const { userPrompt, aspectRatio, platform, lang, includeText } = req.body;
    const normalizedLang = normalizeLangCode(lang);
    const shouldIncludeText = parseIncludeText(includeText);

    if (!userPrompt || typeof userPrompt !== 'string' || !userPrompt.trim()) {
      return res.status(400).json({ error: 'A valid userPrompt string is required.' });
    }

    if (!aspectRatio || !VALID_ASPECT_RATIOS.includes(aspectRatio)) {
      return res.status(400).json({
        error: `aspectRatio must be one of: ${VALID_ASPECT_RATIOS.join(', ')}.`,
      });
    }

    if (!platform || !VALID_PLATFORMS.includes(platform)) {
      return res.status(400).json({
        error: `platform must be one of: ${VALID_PLATFORMS.join(', ')}.`,
      });
    }

    const trimmedPrompt = userPrompt.trim();
    const cacheKey = buildTextImageCacheKey(trimmedPrompt, platform, aspectRatio, normalizedLang, shouldIncludeText);
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json({
        ...cachedData,
        fromCache: true,
      });
    }

    const { optimizedPrompt, hashtags } = await resolvePrompt(
      trimmedPrompt,
      platform,
      aspectRatio,
      normalizedLang,
      shouldIncludeText,
    );

    let imageUrl;
    try {
      imageUrl = await generateImageWithDalle(optimizedPrompt, aspectRatio);
    } catch (error) {
      if (error.statusCode) throw error;
      throw mapOpenAIError(error);
    }

    const responseData = {
      imageUrl,
      optimizedPrompt,
      hashtags,
    };

    cache.set(cacheKey, responseData);

    res.json(responseData);
  } catch (error) {
    next(mapOpenAIError(error));
  }
}

export async function serveGeneratedImage(req, res) {
  try {
    const filename = getFilenameFromUrl(req.params.filename);
    const buffer = await fs.readFile(getImagePath(filename));

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  } catch {
    res.status(404).json({ error: 'Image not found.' });
  }
}

async function prepareDownloadBuffer(buffer) {
  return upscaleImageBuffer(buffer);
}

export async function downloadImage(req, res, next) {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl || typeof imageUrl !== 'string') {
      return res.status(400).json({ error: 'A valid imageUrl string is required.' });
    }

    if (isGeneratedImagePath(imageUrl)) {
      const filename = getFilenameFromUrl(imageUrl);
      const buffer = await prepareDownloadBuffer(await fs.readFile(getImagePath(filename)));

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', 'attachment; filename="snapfeed-image.png"');
      return res.send(buffer);
    }

    if (imageUrl.startsWith('data:')) {
      const [meta, base64Data] = imageUrl.split(',');
      if (!base64Data) {
        return res.status(400).json({ error: 'Invalid data URL.' });
      }

      const contentType = meta.match(/^data:([^;]+)/)?.[1] || 'image/png';
      const buffer = await prepareDownloadBuffer(Buffer.from(base64Data, 'base64'));

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', 'attachment; filename="snapfeed-image.png"');
      return res.send(buffer);
    }

    if (!isAllowedImageUrl(imageUrl)) {
      return res.status(400).json({ error: 'Image URL is not from an allowed source.' });
    }

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      return res.status(502).json({ error: 'Failed to fetch image from storage.' });
    }

    const buffer = await prepareDownloadBuffer(Buffer.from(await imageResponse.arrayBuffer()));
    const contentType = imageResponse.headers.get('content-type') || 'image/png';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'attachment; filename="snapfeed-image.png"');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
}
