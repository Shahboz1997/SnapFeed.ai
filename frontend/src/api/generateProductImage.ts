import type { ProductGenerationMode } from '../constants/productGenerationPresets';
import type { TryOnCategory, TryOnGender } from '../constants/tryOnOptions';
import { ApiError } from './generateImage';
import type { AspectRatio, Platform } from './generateImage';
import { authApiFetch } from './authFetch';
import { parseApiResponse } from './parseApiResponse';

export type { TryOnCategory, TryOnGender } from '../constants/tryOnOptions';

export interface GenerateProductImageRequest {
  base64Image: string;
  userWish?: string;
  catalogPrompt?: string;
  mode?: ProductGenerationMode;
  gender?: TryOnGender;
  category?: TryOnCategory;
  humanImage?: string;
  platform: Platform;
  format: AspectRatio;
  extractText?: boolean;
  includeText?: boolean;
  overlayText?: string;
  lang?: string;
}

export type ProductBranchUsed = 'product' | 'tryon';
export type ProductFallbackReason = 'not_clothing' | 'verification_failed';

export interface GenerateProductImageResponse {
  success: boolean;
  imageUrl: string | null;
  optimizedPrompt: string | null;
  hashtags: string[];
  extractedText: string | null;
  branchUsed: ProductBranchUsed;
  fallbackReason: ProductFallbackReason | null;
  requestedMode?: ProductGenerationMode;
  creditsRemaining?: number;
}

export async function generateProductImage(
  request: GenerateProductImageRequest,
): Promise<GenerateProductImageResponse> {
  let response: Response;

  try {
    response = await authApiFetch('/api/generate-product-image', {
      method: 'POST',
      body: JSON.stringify({
        image: request.base64Image,
        base64Image: request.base64Image,
        userWish: request.userWish?.trim() ?? '',
        catalogPrompt: request.catalogPrompt?.trim() || undefined,
        mode: request.mode,
        gender: request.mode === 'tryon' ? request.gender : undefined,
        category: request.mode === 'tryon' ? request.category : undefined,
        humanImage: request.mode === 'tryon' ? request.humanImage : undefined,
        platform: request.platform,
        format: request.format,
        extractText: request.extractText === true,
        includeText: request.includeText === true,
        overlayText: request.overlayText?.trim() || undefined,
        lang: request.lang,
      }),
    });
  } catch {
    throw new ApiError('Unable to reach the server.', undefined, 'api.serverUnreachable');
  }

  let data: GenerateProductImageResponse & { error?: string; messageKey?: string };

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
      branchUsed: 'product',
      fallbackReason: null,
    };
  }

  if (!data.imageUrl || !data.optimizedPrompt) {
    throw new ApiError('Incomplete data.', response.status, 'api.incompleteData');
  }

  if (data.branchUsed !== 'product' && data.branchUsed !== 'tryon') {
    throw new ApiError('Incomplete data.', response.status, 'api.incompleteData');
  }

  return {
    success: data.success,
    imageUrl: data.imageUrl,
    optimizedPrompt: data.optimizedPrompt,
    hashtags: data.hashtags,
    extractedText: null,
    branchUsed: data.branchUsed,
    fallbackReason: data.fallbackReason ?? null,
    requestedMode: data.requestedMode,
    creditsRemaining: data.creditsRemaining,
  };
}
