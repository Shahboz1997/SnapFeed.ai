const PRODUCTION_API_URL = 'https://snapfeed-ai.onrender.com';

const DEPRECATED_API_HOSTS = new Set(['snapfeed-api.onrender.com']);

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

export function getApiBaseUrl(): string {
  const configured = normalizeBaseUrl(import.meta.env.VITE_API_URL ?? '');

  if (configured) {
    try {
      const { hostname } = new URL(configured);
      if (DEPRECATED_API_HOSTS.has(hostname)) {
        return PRODUCTION_API_URL;
      }
    } catch {
      return configured;
    }

    return configured;
  }

  if (import.meta.env.PROD) {
    return PRODUCTION_API_URL;
  }

  return '';
}
