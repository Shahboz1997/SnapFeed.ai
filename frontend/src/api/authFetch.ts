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
    let { data: { session } } = await supabase!.auth.getSession();

    // Refresh if missing/expired so backend JWT verify does not get a stale token.
    const expiresAtMs = session?.expires_at ? session.expires_at * 1000 : 0;
    const needsRefresh = !session?.access_token || (expiresAtMs > 0 && expiresAtMs <= Date.now() + 60_000);
    if (needsRefresh) {
      const { data } = await supabase!.auth.refreshSession();
      session = data.session ?? session;
    }

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
