import { ApiError } from './generateImage';
import type { AspectRatio, Platform } from './generateImage';

export interface GenerateProductImageRequest {
  base64Image: string;
  userWish?: string;
  platform: Platform;
  format: AspectRatio;
  extractText?: boolean;
  includeText?: boolean;
  lang?: string;
}

export interface GenerateProductImageResponse {
  success: boolean;
  imageUrl: string | null;
  optimizedPrompt: string | null;
  hashtags: string[];
  extractedText: string | null;
}

const API_URL = import.meta.env.VITE_API_URL ?? '';

export async function generateProductImage(
  request: GenerateProductImageRequest,
): Promise<GenerateProductImageResponse> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}/api/generate-product-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64Image: request.base64Image,
        userWish: request.userWish?.trim() ?? '',
        platform: request.platform,
        format: request.format,
        extractText: request.extractText === true,
        includeText: request.includeText !== false,
        lang: request.lang,
      }),
    });
  } catch {
    throw new ApiError('Unable to reach the server.', undefined, 'api.serverUnreachable');
  }

  let data: GenerateProductImageResponse & { error?: string };

  try {
    data = await response.json();
  } catch {
    throw new ApiError('Invalid response.', response.status, 'api.invalidResponse');
  }

  if (!response.ok) {
    throw new ApiError(data.error || 'Failed to generate image.', response.status, 'api.generateFailed');
  }

  if (!data.success || !Array.isArray(data.hashtags)) {
    throw new ApiError('Incomplete data.', response.status, 'api.incompleteData');
  }

  const isOcrOnly = request.extractText === true;

  if (isOcrOnly) {
    if (typeof data.extractedText !== 'string') {
      throw new ApiError('Incomplete OCR data.', response.status, 'api.incompleteData');
    }

    return {
      success: data.success,
      imageUrl: null,
      optimizedPrompt: null,
      hashtags: data.hashtags,
      extractedText: data.extractedText,
    };
  }

  if (!data.imageUrl || !data.optimizedPrompt) {
    throw new ApiError('Incomplete data.', response.status, 'api.incompleteData');
  }

  return {
    success: data.success,
    imageUrl: data.imageUrl,
    optimizedPrompt: data.optimizedPrompt,
    hashtags: data.hashtags,
    extractedText: null,
  };
}
