import { ApiError } from './generateImage';
import { getApiBaseUrl } from '../utils/apiBaseUrl';
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
}

export async function generateProductPrompt(
  request: GenerateProductPromptRequest,
): Promise<GenerateProductPromptResult> {
  const trimmed = request.userText.trim();
  if (!trimmed) {
    throw new ApiError('Prompt cannot be empty.', 400, 'api.promptFailed');
  }

  const apiUrl = getApiBaseUrl();
  let response: Response;

  try {
    response = await fetch(`${apiUrl}/api/chat/generate-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    throw new ApiError(data.error || 'Failed to generate prompt.', response.status, 'api.promptFailed');
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
