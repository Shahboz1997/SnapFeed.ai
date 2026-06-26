import { getOpenAI } from '../config/openai.js';
import { DALL_E_MAX_PROMPT_LENGTH } from '../constants/image.js';
import { createError } from '../utils/errors.js';
import { buildDalleOnlyLanguageRule, normalizeLangCode, getLanguageName } from '../utils/languages.js';

function buildChatAssistantSystemPrompt(lang) {
  const languageRule = buildDalleOnlyLanguageRule(lang);
  const languageName = getLanguageName(lang);

  return `${languageRule}

You are a top-tier SMM strategist and expert prompt engineer for social media image generation. Your task is to turn the user's raw idea into a highly effective, beautifully descriptive image generation prompt for FLUX.

The user's topic can be anything: business, blog, e-commerce, fitness, fashion, food, services, personal brand, etc.

Strict compliance rules:
1. Return ONLY the final image prompt. No introductions, no explanations, no quotes around the entire answer, and NO hashtags.
2. Write the scene description strictly in ENGLISH for maximum image quality.
3. ALWAYS include ONE short on-image text phrase (maximum 3-4 words) in ${languageName} inside double quotes with an English render instruction, for example:
   The text "..." is written clearly in a bold minimalist font.
4. Enhance the aesthetic quality by automatically adding professional descriptors in English based on the topic (e.g., high-quality 3D render, studio lighting, smooth gradients, modern vector illustration, trendy corporate design).
5. Keep it optimized for high-converting social media visuals on Instagram and Facebook.`;
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

  return content.slice(0, DALL_E_MAX_PROMPT_LENGTH);
}
