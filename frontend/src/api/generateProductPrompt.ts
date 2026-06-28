import { ApiError } from './generateImage';
import { authApiFetch } from './authFetch';
import { parseApiResponse } from './parseApiResponse';

export interface GenerateProductPromptRequest {
  userText: string;
  lang?: string;
}

export interface GenerateProductPromptResult {
  optimizedPrompt: string;
  overlayText: string;
  hashtags: string[];
}

interface GenerateProductPromptResponse {
  success: boolean;
  optimizedPrompt: string;
  overlayText: string;
  hashtags: string[];
  error?: string;
  messageKey?: string;
}

export async function generateProductPrompt(
  request: GenerateProductPromptRequest,
): Promise<GenerateProductPromptResult> {
  const trimmed = request.userText.trim();
  if (!trimmed) {
    throw new ApiError('Prompt cannot be empty.', 400, 'api.promptFailed');
  }

  let response: Response;

  try {
    response = await authApiFetch('/api/chat/generate-prompt', {
      method: 'POST',
      body: JSON.stringify({
        userText: trimmed,
        lang: request.lang,
      }),
    });
  } catch {
    throw new ApiError('Unable to reach the server.', undefined, 'api.serverUnreachable');
  }

  let data: GenerateProductPromptResponse;

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

  if (
    typeof data.optimizedPrompt !== 'string'
    || !data.optimizedPrompt.trim()
    || typeof data.overlayText !== 'string'
    || !data.overlayText.trim()
    || !Array.isArray(data.hashtags)
    || data.hashtags.length < 2
  ) {
    throw new ApiError('Incomplete data.', response.status, 'api.incompletePrompt');
  }

  return {
    optimizedPrompt: data.optimizedPrompt.trim(),
    overlayText: data.overlayText.trim(),
    hashtags: data.hashtags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0),
  };
}
