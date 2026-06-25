const PRODUCTION_API_URL = 'https://snapfeed-ai.onrender.com';

const DEPRECATED_API_HOSTS = new Set(['snapfeed-api.onrender.com']);

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

function isLocalhostUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function getApiBaseUrl(): string {
  const configured = normalizeBaseUrl(import.meta.env.VITE_API_URL ?? '');

  if (import.meta.env.PROD) {
    if (!configured || isLocalhostUrl(configured)) {
      return PRODUCTION_API_URL;
    }

    try {
      const { hostname } = new URL(configured);
      if (DEPRECATED_API_HOSTS.has(hostname)) {
        return PRODUCTION_API_URL;
      }
    } catch {
      return PRODUCTION_API_URL;
    }

    return configured;
  }

  if (configured && !isLocalhostUrl(configured)) {
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

  return '';
}
