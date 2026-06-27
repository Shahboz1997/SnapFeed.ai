export type Platform = 'instagram' | 'facebook';
export type AspectRatio = 'square' | 'story';

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

import { getApiBaseUrl } from '../utils/apiBaseUrl';
import { parseApiResponse } from './parseApiResponse';

export async function generateImage(
  request: GenerateImageRequest,
): Promise<GenerateImageResponse> {
  const apiUrl = getApiBaseUrl();
  let response: Response;

  try {
    response = await fetch(`${apiUrl}/api/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  let data: GenerateImageResponse & { error?: string };

  try {
    data = await parseApiResponse(response);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Invalid response.', response.status, 'api.invalidResponse');
  }

  if (!response.ok) {
    throw new ApiError(data.error || 'Failed to generate image.', response.status, 'api.generateFailed');
  }

  if (!data.imageUrl || !data.optimizedPrompt || !Array.isArray(data.hashtags)) {
    throw new ApiError('Incomplete data.', response.status, 'api.incompleteData');
  }

  return {
    imageUrl: data.imageUrl,
    optimizedPrompt: data.optimizedPrompt,
    hashtags: data.hashtags,
  };
}
