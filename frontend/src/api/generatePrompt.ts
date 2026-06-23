import { ApiError } from './generateImage';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GeneratePromptRequest {
  message: string;
  history?: ChatMessage[];
  lang?: string;
}

export interface GeneratePromptResponse {
  success: boolean;
  prompt: string;
}

const API_URL = import.meta.env.VITE_API_URL ?? '';

export async function generatePrompt(
  request: GeneratePromptRequest,
): Promise<{ prompt: string }> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}/api/chat/generate-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userMessage: request.message.trim(),
        history: request.history,
        lang: request.lang,
      }),
    });
  } catch {
    throw new ApiError('Unable to reach the server.', undefined, 'api.serverUnreachable');
  }

  let data: GeneratePromptResponse & { error?: string };

  try {
    data = await response.json();
  } catch {
    throw new ApiError('Invalid response.', response.status, 'api.invalidResponse');
  }

  if (!response.ok || data.success === false) {
    throw new ApiError(data.error || 'Failed to generate prompt.', response.status, 'api.promptFailed');
  }

  if (!data.prompt || typeof data.prompt !== 'string') {
    throw new ApiError('Incomplete data.', response.status, 'api.incompletePrompt');
  }

  return { prompt: data.prompt };
}
