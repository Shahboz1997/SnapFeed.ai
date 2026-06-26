import { getOpenAI } from '../config/openai.js';
import fs from 'fs/promises';
import crypto from 'crypto';
import {
  VALID_ASPECT_RATIOS,
  VALID_PLATFORMS,
  DALL_E_MAX_PROMPT_LENGTH,
  FLUX_SCHNELL_MODEL,
  isAllowedImageUrl,
} from '../constants/image.js';
import { getReplicate, isReplicateConfigured } from '../config/replicate.js';
import { createError, mapOpenAIError } from '../utils/errors.js';
import {
  getImagePath,
  getFilenameFromUrl,
  isGeneratedImagePath,
  saveImageBuffer,
} from '../utils/imageStorage.js';
import { fetchAndUpscaleRemoteImage, upscaleImageBuffer } from '../services/imageUpscaling.js';
import { applyTextOverlay } from '../services/textOverlayRender.js';
import { resolveReplicateImageUrl } from '../utils/replicateOutput.js';
import cache from '../utils/cache.js';
import { NO_TEXT_OVERLAY_RULE, appendNoTextRuleToPrompt, parseIncludeText, extractQuotedOverlayText } from '../utils/textOverlay.js';
import { buildLanguageRule, normalizeLangCode, getLanguageName, getDefaultHashtags, stripHashtagsFromPrompt } from '../utils/languages.js';

const TEXT_IMAGE_CACHE_VERSION = 'v2';

function buildPromptOptimizerSystem(lang, includeText) {
  const languageRule = buildLanguageRule(lang);
  const languageName = getLanguageName(lang);

  if (!includeText) {
    return `${languageRule}

You are a top-tier SMM strategist and commercial designer. Your task is to analyze the user's text or idea and create a high-converting, stylish prompt for FLUX Schnell image generation (Instagram, Facebook).

If the user already wrote a detailed scene description, preserve ALL their visual details (objects, lighting, colors, mood, composition, props) while reformatting for FLUX.

PROMPT GENERATION RULES:
1. Describe the visual scene in ENGLISH — modern, eye-catching, strictly matching the user's topic (business, blog, e-commerce, services, lifestyle, etc.).
   Style: minimalist photography, editorial aesthetic, vivid contrasting colors, premium presentation.
2. Avoid visual clutter. Focus purely on scenery, objects, composition, lighting, and mood.
3. optimizedPrompt — the complete image generation prompt: ENGLISH scene description only. No extra commentary. Maximum 900 characters.
4. ${NO_TEXT_OVERLAY_RULE}

HASHTAGS:
- Generate exactly 2 hashtags strictly relevant to the user's text topic (each starting with #).
- Hashtags must be written in ${languageName} and reflect the niche, product, or post topic — do not use generic or irrelevant tags.

Return ONLY JSON: { "optimizedPrompt": "...", "hashtags": ["#tag1", "#tag2"] }`;
  }

  return `${languageRule}

You are a top-tier SMM strategist and commercial designer. Your task is to analyze the user's text or idea and create a high-converting, stylish prompt for FLUX Schnell image generation (Instagram, Facebook).

If the user already wrote a detailed scene description, preserve ALL their visual details (objects, lighting, colors, mood, composition, props) while reformatting for FLUX.

FLUX SCHNELL TEXT RULE (CRITICAL):
FLUX cannot render Cyrillic or non-Latin text reliably. The server adds text overlay separately after generation.
- optimizedPrompt — ENGLISH scene description ONLY. No text, letters, words, logos, watermarks, or typography anywhere in the image. Leave generous clean negative space in the upper-center third for a text overlay.
- overlayText — ONE short phrase (maximum 4 words) in ${languageName}. If the user provided a phrase in quotes, use that exact phrase. Otherwise extract the best headline from their idea.

PROMPT GENERATION RULES:
1. Describe the visual scene in ENGLISH — modern, eye-catching, strictly matching the user's topic.
   Style: minimalist photography, editorial aesthetic, vivid contrasting colors, premium presentation.
2. Avoid visual clutter. Leave ample clean negative space in the upper-center area.
3. optimizedPrompt — scene only, maximum 900 characters. No text-in-image instructions.

HASHTAGS:
- Generate exactly 2 hashtags strictly relevant to the user's text topic (each starting with #).
- Hashtags must be written in ${languageName}.

Return ONLY JSON: { "optimizedPrompt": "...", "hashtags": ["#tag1", "#tag2"], "overlayText": "..." }`;
}

async function resolvePrompt(userPrompt, platform, aspectRatio, lang, includeText) {
  const trimmed = userPrompt.trim();

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
      overlayText: null,
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

  let overlayText = null;
  if (includeText) {
    overlayText = typeof parsed.overlayText === 'string' && parsed.overlayText.trim()
      ? parsed.overlayText.trim()
      : extractQuotedOverlayText(userPrompt);

    if (!overlayText) {
      throw createError('Prompt optimizer returned incomplete overlay text.', 502);
    }
  }

  return {
    optimizedPrompt: stripHashtagsFromPrompt(parsed.optimizedPrompt)
      .replace(/^["']|["']$/g, '')
      .slice(0, DALL_E_MAX_PROMPT_LENGTH),
    hashtags: parsed.hashtags.slice(0, 2),
    overlayText,
  };
}

async function runFluxSchnellAndUpscale(optimizedPrompt, format, overlayText = null) {
  const replicate = getReplicate();

  console.log(`Running FLUX Schnell (${FLUX_SCHNELL_MODEL}), aspect_ratio: ${format === 'story' ? '9:16' : '1:1'}`);

  const output = await replicate.run(
    FLUX_SCHNELL_MODEL,
    {
      input: {
        prompt: optimizedPrompt,
        aspect_ratio: format === 'story' ? '9:16' : '1:1',
        num_outputs: 1,
        output_format: 'png',
        disable_safety_checker: false,
      },
    },
  );

  const finalImageUrl = resolveReplicateImageUrl(output);

  if (!finalImageUrl) {
    throw createError('Replicate did not return an image URL.', 502);
  }

  console.log(`FLUX Schnell output URL: ${finalImageUrl}`);

  let upscaledBuffer = await fetchAndUpscaleRemoteImage(finalImageUrl);

  if (overlayText?.trim()) {
    console.log(`Applying Sharp text overlay: "${overlayText.trim()}"`);
    upscaledBuffer = await applyTextOverlay(upscaledBuffer, overlayText, format);
  }

  const filename = await saveImageBuffer(upscaledBuffer);
  return `/api/generated-images/${filename}`;
}

function buildTextImageCacheKey(userPrompt, platform, format, lang, includeText) {
  return crypto
    .createHash('md5')
    .update(`${TEXT_IMAGE_CACHE_VERSION}${userPrompt}${platform}${format}${lang}${includeText}`)
    .digest('hex');
}

export async function generatePostImage(req, res, next) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key is not configured.' });
    }

    if (!isReplicateConfigured()) {
      return res.status(500).json({ error: 'Replicate API token is not configured.' });
    }

    const { userPrompt, aspectRatio, platform, lang, includeText } = req.body;
    const normalizedLang = normalizeLangCode(lang);

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
    let shouldIncludeText = parseIncludeText(includeText);

    if (!shouldIncludeText && extractQuotedOverlayText(trimmedPrompt)) {
      shouldIncludeText = true;
    }

    const cacheKey = buildTextImageCacheKey(trimmedPrompt, platform, aspectRatio, normalizedLang, shouldIncludeText);
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return res.json({
        success: true,
        ...cachedData,
        fromCache: true,
      });
    }

    const { optimizedPrompt, hashtags, overlayText } = await resolvePrompt(
      trimmedPrompt,
      platform,
      aspectRatio,
      normalizedLang,
      shouldIncludeText,
    );

    let upscaledUrl;
    try {
      upscaledUrl = await runFluxSchnellAndUpscale(optimizedPrompt, aspectRatio, overlayText);
    } catch (error) {
      if (error.statusCode) throw error;
      const message = error?.message || 'FLUX Schnell image generation failed.';
      throw createError(message, 502);
    }

    const responseData = {
      success: true,
      imageUrl: upscaledUrl,
      optimizedPrompt,
      hashtags,
    };

    cache.set(cacheKey, responseData);

    res.json(responseData);
  } catch (error) {
    if (error.statusCode) {
      return next(error);
    }
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
