import { ApiError } from './generateImage';
import { authApiFetch } from './authFetch';
import { parseApiResponse } from './parseApiResponse';

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

export async function generatePrompt(
  request: GeneratePromptRequest,
): Promise<{ prompt: string }> {
  let response: Response;

  try {
    response = await authApiFetch('/api/chat/generate-prompt', {
      method: 'POST',
      body: JSON.stringify({
        userMessage: request.message.trim(),
        history: request.history,
        lang: request.lang,
      }),
    });
  } catch {
    throw new ApiError('Unable to reach the server.', undefined, 'api.serverUnreachable');
  }

  let data: GeneratePromptResponse & { error?: string; messageKey?: string };

  try {
    data = await parseApiResponse(response);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Invalid response.', response.status, 'api.invalidResponse');
  }

  if (!response.ok || data.success === false) {
    const messageKey = data.messageKey
      || (response.status === 401 ? 'api.authRequired' : undefined);
    throw new ApiError(data.error || 'Failed to generate prompt.', response.status, messageKey || 'api.promptFailed');
  }

  if (!data.prompt || typeof data.prompt !== 'string') {
    throw new ApiError('Incomplete data.', response.status, 'api.incompletePrompt');
  }

  return { prompt: data.prompt };
}
