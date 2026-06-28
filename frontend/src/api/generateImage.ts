export type Platform = 'instagram' | 'facebook';
export type AspectRatio = 'square' | 'story';

import { authApiFetch } from './authFetch';
import { parseApiResponse } from './parseApiResponse';

export interface GenerateImageRequest {
  userPrompt: string;
  platform: Platform;
  aspectRatio: AspectRatio;
  includeText?: boolean;
  lang?: string;
}

export interface GenerateImageResponse {
  imageUrl: string;
  optimizedPrompt: string;
  hashtags: string[];
  creditsRemaining?: number;
}

export class ApiError extends Error {
  statusCode?: number;
  messageKey?: string;

  constructor(message: string, statusCode?: number, messageKey?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.messageKey = messageKey;
  }
}

export async function generateImage(
  request: GenerateImageRequest,
): Promise<GenerateImageResponse> {
  let response: Response;

  try {
    response = await authApiFetch('/api/generate-image', {
      method: 'POST',
      body: JSON.stringify({
        userPrompt: request.userPrompt.trim(),
        platform: request.platform,
        aspectRatio: request.aspectRatio,
        lang: request.lang,
        includeText: request.includeText === true,
      }),
    });
  } catch {
    throw new ApiError('Unable to reach the server.', undefined, 'api.serverUnreachable');
  }

  let data: GenerateImageResponse & { error?: string; messageKey?: string };

  try {
    data = await parseApiResponse(response);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Invalid response.', response.status, 'api.invalidResponse');
  }

  if (!response.ok) {
    const messageKey = data.messageKey
      || (response.status === 401 ? 'api.authRequired' : undefined)
      || (response.status === 402 ? 'api.insufficientCredits' : undefined);
    throw new ApiError(data.error || 'Failed to generate image.', response.status, messageKey || 'api.generateFailed');
  }

  if (!data.imageUrl || !data.optimizedPrompt || !Array.isArray(data.hashtags)) {
    throw new ApiError('Incomplete data.', response.status, 'api.incompleteData');
  }

  return {
    imageUrl: data.imageUrl,
    optimizedPrompt: data.optimizedPrompt,
    hashtags: data.hashtags,
    creditsRemaining: data.creditsRemaining,
  };
}
