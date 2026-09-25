import { getApiBaseUrl } from '../utils/apiBaseUrl';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { getGuestFingerprint } from '../lib/guestFingerprint';

/** Default client timeout for short API calls (billing, gallery, credits). */
export const DEFAULT_API_TIMEOUT_MS = 30_000;

/** Client ceiling for generation (must exceed backend GENERATION_TIMEOUT_MS). */
export const GENERATION_API_TIMEOUT_MS = 150_000;

export type AuthFetchOptions = RequestInit & {
  /** Override default timeout. `0` = no client timeout (use AbortSignal only). */
  timeoutMs?: number;
};

function mergeAbortSignals(
  external: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  let timer: number | undefined;

  if (timeoutMs > 0) {
    timer = window.setTimeout(() => {
      controller.abort(new DOMException('The operation timed out.', 'TimeoutError'));
    }, timeoutMs);
  }

  const onExternalAbort = () => {
    controller.abort(external?.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
  };

  if (external) {
    if (external.aborted) {
      onExternalAbort();
    } else {
      external.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timer != null) window.clearTimeout(timer);
      if (external) {
        external.removeEventListener('abort', onExternalAbort);
      }
    },
  };
}

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

  const expiresAtMs = session?.expires_at ? session.expires_at * 1000 : 0;
  const needsRefresh = !session?.access_token || (expiresAtMs > 0 && expiresAtMs <= Date.now() + 60_000);
  if (needsRefresh) {
    const { data } = await supabase!.auth.refreshSession();
    session = data.session?.access_token ? data.session : null;
  }

  const token = session?.access_token;
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  } else {
    headers.delete('Authorization');
  }

  try {
    const fingerprint = await getGuestFingerprint();
    headers.set('X-Guest-Fingerprint', fingerprint);
  } catch {
    // Fingerprint unavailable — backend may fall back to IP hash for guests.
  }

  return headers;
}

export async function authFetch(url: string, options: AuthFetchOptions = {}): Promise<Response> {
  if (options.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }

  const { timeoutMs: timeoutOverride, ...fetchOptions } = options;

  // Explicit override wins. Otherwise: short default for calls without a signal;
  // calls with a caller-owned signal (e.g. generate cancel) get no extra cap unless set.
  const timeoutMs = timeoutOverride !== undefined
    ? timeoutOverride
    : (fetchOptions.signal ? 0 : DEFAULT_API_TIMEOUT_MS);

  const { signal, cleanup } = mergeAbortSignals(fetchOptions.signal ?? undefined, timeoutMs);

  try {
    const headers = await buildAuthHeaders(fetchOptions.headers, fetchOptions.body);
    const hadAuth = headers.has('Authorization');

    if (signal.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      signal,
    });

    if (response.status !== 401 || !hadAuth || !isSupabaseConfigured()) {
      return response;
    }

    if (signal.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    const supabase = getSupabaseClient();
    const { data } = await supabase!.auth.refreshSession();
    if (data.session?.access_token) {
      const retryHeaders = await buildAuthHeaders(fetchOptions.headers, fetchOptions.body);
      return fetch(url, {
        ...fetchOptions,
        headers: retryHeaders,
        signal,
      });
    }

    try {
      await supabase!.auth.signOut({ scope: 'local' });
    } catch {
      // Ignore — still retry without Authorization.
    }

    if (signal.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    const guestHeaders = await buildAuthHeaders(fetchOptions.headers, fetchOptions.body);
    guestHeaders.delete('Authorization');
    return fetch(url, {
      ...fetchOptions,
      headers: guestHeaders,
      signal,
    });
  } finally {
    cleanup();
  }
}

export function getApiUrl(path: string): string {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export async function authApiFetch(path: string, options: AuthFetchOptions = {}): Promise<Response> {
  return authFetch(getApiUrl(path), options);
}
