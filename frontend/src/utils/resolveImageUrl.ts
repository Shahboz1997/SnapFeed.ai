import { getApiBaseUrl } from './apiBaseUrl';

const API_BASE = getApiBaseUrl();

export function resolveImageUrl(url: string | null | undefined): string {
  if (!url) return '';

  if (/^(data:|blob:|https?:\/\/)/i.test(url)) {
    return url;
  }

  if (url.startsWith('/api/')) {
    return API_BASE ? `${API_BASE}${url}` : url;
  }

  return url;
}
