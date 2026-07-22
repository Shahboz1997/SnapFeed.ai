import { getApiBaseUrl } from '../utils/apiBaseUrl';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { getGuestFingerprint } from '../lib/guestFingerprint';

async function buildAuthHeaders(baseHeaders: HeadersInit | undefined, body: BodyInit | null | undefined): Promise<Headers> {
  const headers = new Headers(baseHeaders);

  if (!headers.has('Content-Type') && body) {
    headers.set('Content-Type', 'application/json');
  }

  if (!isSupabaseConfigured()) {
    return headers;
  }

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
    headers.delete('Authorization');
  }

  // Always attach guest fingerprint (claim-on-signup + guest billing).
  try {
    const fingerprint = await getGuestFingerprint();
    headers.set('X-Guest-Fingerprint', fingerprint);
  } catch {
    // Fingerprint unavailable — backend may fall back to IP hash for guests.
  }

  return headers;
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = await buildAuthHeaders(options.headers, options.body);
  const hadAuth = headers.has('Authorization');

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Token rejected after send — refresh once and retry so credits bill the user, not guest.
  if (response.status !== 401 || !hadAuth || !isSupabaseConfigured()) {
    return response;
  }

  const supabase = getSupabaseClient();
  const { data } = await supabase!.auth.refreshSession();
  if (!data.session?.access_token) {
    return response;
  }

  const retryHeaders = await buildAuthHeaders(options.headers, options.body);
  return fetch(url, {
    ...options,
    headers: retryHeaders,
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
