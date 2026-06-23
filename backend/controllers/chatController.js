import { generateDallePrompt } from '../services/promptAssistant.js';
import { mapOpenAIError } from '../utils/errors.js';
import { normalizeLangCode } from '../utils/languages.js';

function validateHistory(history) {
  if (history === undefined) return [];

  if (!Array.isArray(history)) {
    throw Object.assign(new Error('history must be an array when provided.'), { statusCode: 400 });
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

  return history;
}

export async function chatAssistant(req, res) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'OpenAI API key is not configured.',
      });
    }

    const { userMessage, history, lang } = req.body;
    const message = userMessage ?? req.body.message;
    const normalizedLang = normalizeLangCode(lang);

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Сообщение не может быть пустым',
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

    const prompt = await generateDallePrompt(message, validatedHistory, normalizedLang);

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
