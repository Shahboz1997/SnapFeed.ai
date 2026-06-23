import crypto from 'crypto';
import {
  VALID_ASPECT_RATIOS,
  VALID_PLATFORMS,
} from '../constants/image.js';
import { mapOpenAIError } from '../utils/errors.js';
import { analyzeProductImage } from '../services/productImageAnalysis.js';
import { generateProductImageWithReference } from '../services/imageGeneration.js';
import { normalizeLangCode } from '../utils/languages.js';
import cache from '../utils/cache.js';
import { NO_TEXT_OVERLAY_RULE, parseIncludeText } from '../utils/textOverlay.js';

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

function getBase64HashInput(base64Image) {
  const trimmed = base64Image.trim();
  return trimmed.length > 10000 ? trimmed.slice(0, 10000) : trimmed;
}

function buildProductImageCacheKey(base64Image, userWish, format, lang, includeText) {
  const base64Sample = getBase64HashInput(base64Image);
  const wish = typeof userWish === 'string' ? userWish : '';
  return crypto
    .createHash('md5')
    .update(`${base64Sample}${wish}${format}${lang}${includeText}`)
    .digest('hex');
}

function buildOcrCacheKey(base64Image) {
  const base64Sample = getBase64HashInput(base64Image);
  return crypto.createHash('md5').update(base64Sample).digest('hex');
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
