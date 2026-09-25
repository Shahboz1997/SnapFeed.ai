import { generateDallePrompt, generateGrokPromptFromUserText } from '../services/promptAssistant.js';
import { mapOpenAIError } from '../utils/errors.js';
import { normalizeLangCode } from '../utils/languages.js';

const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_ENTRIES = 20;
const MAX_HISTORY_CONTENT_CHARS = 2000;

function truncate(value, max) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function validateHistory(history) {
  if (history === undefined) return [];

  if (!Array.isArray(history)) {
    throw Object.assign(new Error('history must be an array when provided.'), { statusCode: 400 });
  }

  if (history.length > MAX_HISTORY_ENTRIES) {
    throw Object.assign(
      new Error(`history cannot exceed ${MAX_HISTORY_ENTRIES} entries.`),
      { statusCode: 400 },
    );
  }

  const invalidEntry = history.find(
    (entry) =>
      !entry
      || typeof entry !== 'object'
      || !['user', 'assistant'].includes(entry.role)
      || typeof entry.content !== 'string'
      || !entry.content.trim(),
  );

  if (invalidEntry) {
    throw Object.assign(
      new Error('Each history entry must have role ("user" | "assistant") and non-empty content.'),
      { statusCode: 400 },
    );
  }

  return history.map((entry) => ({
    role: entry.role,
    content: truncate(entry.content, MAX_HISTORY_CONTENT_CHARS),
  }));
}

export async function chatAssistant(req, res) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'OpenAI API key is not configured.',
      });
    }

    const { userText, userMessage, history, lang } = req.body;
    const normalizedLang = normalizeLangCode(lang);
    const grokInput = typeof userText === 'string' ? userText : null;

    if (grokInput !== null) {
      if (!grokInput.trim()) {
        return res.status(400).json({
          success: false,
          error: 'userText cannot be empty.',
        });
      }

      if (grokInput.length > MAX_MESSAGE_CHARS) {
        return res.status(400).json({
          success: false,
          error: `userText cannot exceed ${MAX_MESSAGE_CHARS} characters.`,
        });
      }

      const result = await generateGrokPromptFromUserText(
        truncate(grokInput, MAX_MESSAGE_CHARS),
        normalizedLang,
      );

      return res.json({
        success: true,
        optimizedPrompt: result.optimizedPrompt,
        overlayText: result.overlayText,
        hashtags: result.hashtags,
      });
    }

    const message = userMessage ?? req.body.message;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Сообщение не может быть пустым',
      });
    }

    if (message.length > MAX_MESSAGE_CHARS) {
      return res.status(400).json({
        success: false,
        error: `Message cannot exceed ${MAX_MESSAGE_CHARS} characters.`,
      });
    }

    let validatedHistory;
    try {
      validatedHistory = validateHistory(history);
    } catch (error) {
      return res.status(error.statusCode || 400).json({
        success: false,
        error: error.message,
      });
    }

    const prompt = await generateDallePrompt(
      truncate(message, MAX_MESSAGE_CHARS),
      validatedHistory,
      normalizedLang,
    );

    return res.json({ success: true, prompt });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ success: false, error: error.message });
    }

    console.error('OpenAI Chat Error:', error);
    const mapped = mapOpenAIError(error);
    return res.status(mapped.statusCode || 500).json({
      success: false,
      error: mapped.message || 'Ошибка сервера при генерации',
    });
  }
}
