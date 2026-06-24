import OpenAI from 'openai';

let openaiClient = null;

export function getOpenAI() {
  if (openaiClient) {
    return openaiClient;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  const openaiConfig = {
    apiKey,
    timeout: Number(process.env.OPENAI_TIMEOUT_MS) || 300_000,
    maxRetries: 2,
  };

  if (process.env.OPENAI_PROJECT_ID) {
    openaiConfig.project = process.env.OPENAI_PROJECT_ID;
  }

  if (process.env.OPENAI_BASE_URL) {
    openaiConfig.baseURL = process.env.OPENAI_BASE_URL;
  }

  openaiClient = new OpenAI(openaiConfig);
  return openaiClient;
}

export default getOpenAI;
