import { authApiFetch } from './authFetch';
import { ApiError } from './generateImage';
import { parseApiResponse } from './parseApiResponse';
import type { GalleryItem } from '../lib/galleryStorage';

export interface CloudGalleryItem {
  id: string;
  imageUrl: string;
  storagePath?: string;
  mode?: string | null;
  hashtags?: string[];
  createdAt: string;
}

function mapCloudItem(item: CloudGalleryItem): GalleryItem {
  return {
    id: item.id,
    imageUrl: item.imageUrl,
    originalImageUrl: null,
    hashtags: Array.isArray(item.hashtags) ? item.hashtags : [],
    createdAt: item.createdAt,
  };
}

export async function fetchCloudGallery(limit = 48): Promise<GalleryItem[]> {
  let response: Response;

  try {
    response = await authApiFetch(`/api/gallery?limit=${encodeURIComponent(String(limit))}`);
  } catch {
    throw new ApiError('Unable to reach the server.', undefined, 'api.serverUnreachable');
  }

  const data = await parseApiResponse<{ items?: CloudGalleryItem[]; error?: string; messageKey?: string }>(response);

  if (!response.ok) {
    throw new ApiError(
      data.error || 'Failed to load gallery.',
      response.status,
      data.messageKey || 'api.generateFailed',
    );
  }

  const items = Array.isArray(data.items) ? data.items : [];
  return items
    .filter((item) => item?.id && item?.imageUrl)
    .map(mapCloudItem);
}

export async function deleteCloudGalleryItem(id: string): Promise<void> {
  let response: Response;

  try {
    response = await authApiFetch(`/api/gallery/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch {
    throw new ApiError('Unable to reach the server.', undefined, 'api.serverUnreachable');
  }

  const data = await parseApiResponse<{ error?: string; messageKey?: string; success?: boolean }>(response);

  if (!response.ok) {
    throw new ApiError(
      data.error || 'Failed to delete image.',
      response.status,
      data.messageKey || 'api.generateFailed',
    );
  }
}
