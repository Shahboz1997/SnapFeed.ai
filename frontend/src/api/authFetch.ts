import { getApiBaseUrl } from '../utils/apiBaseUrl';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { getGuestFingerprint } from '../lib/guestFingerprint';

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { data: { session } } = await supabase!.auth.getSession();
    const token = session?.access_token;

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    } else {
      try {
        const fingerprint = await getGuestFingerprint();
        headers.set('X-Guest-Fingerprint', fingerprint);
      } catch {
        // Fingerprint unavailable — backend may fall back to IP hash.
      }
    }
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

export function getApiUrl(path: string): string {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export async function authApiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return authFetch(getApiUrl(path), options);
}
